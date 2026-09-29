const mongoose = require('mongoose');
const Blog = require('../models/Blog');
const Comment = require('../models/Comment');
const { isStaff } = require('../middleware/roleMiddleware');
const { findCategory, resolveCategory } = require('../services/categoryService');
const httpError = require('../utils/httpError');

const AUTHOR_STATUSES = ['draft', 'pending'];

const SORTS = {
  newest: { publishedAt: -1, createdAt: -1 },
  oldest: { publishedAt: 1, createdAt: 1 },
  popular: { likesCount: -1, views: -1 },
  views: { views: -1 },
};

const isOwner = (blog, user) => Boolean(user) && String(blog.author?._id || blog.author) === String(user._id);
const canManage = (blog, user) => isOwner(blog, user) || isStaff(user);

const paginate = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.min(Math.max(parseInt(query.limit, 10) || 10, 1), 50);
  return { page, limit, skip: (page - 1) * limit };
};

// Checks the requested status against the caller's role. Authors may only draft or submit for review.
const checkStatusChange = (user, status, publishAt) => {
  if (!status) return;
  if (!isStaff(user) && !AUTHOR_STATUSES.includes(status)) {
    throw httpError(403, `Authors can only set status to ${AUTHOR_STATUSES.join(' or ')}`);
  }
  if (status === 'scheduled' && (!publishAt || new Date(publishAt) <= new Date())) {
    throw httpError(400, 'Scheduled posts need a future publishAt date');
  }
};

const buildFilter = async (query) => {
  const filter = {};
  if (query.search) filter.$text = { $search: query.search };
  if (query.tag) filter.tags = String(query.tag).toLowerCase();
  if (query.author && mongoose.isValidObjectId(query.author)) filter.author = query.author;
  if (query.category) {
    const category = await findCategory(query.category);
    filter.category = category ? category._id : null;
  }
  return filter;
};

const listBlogs = async (filter, query, res) => {
  const { page, limit, skip } = paginate(query);
  const sort = SORTS[query.sort] || SORTS.newest;
  const [data, total] = await Promise.all([
    Blog.find(filter)
      .populate('author', 'name email')
      .populate('category', 'name slug')
      .sort(sort)
      .skip(skip)
      .limit(limit),
    Blog.countDocuments(filter),
  ]);
  res.json({ data, page, limit, total, pages: Math.ceil(total / limit) });
};

// GET /api/blogs — public, published posts only
const getAllBlogs = async (req, res, next) => {
  try {
    const filter = { ...(await buildFilter(req.query)), status: 'published' };
    await listBlogs(filter, req.query, res);
  } catch (error) {
    next(error);
  }
};

// GET /api/blogs/mine — the caller's own posts in every status
const getMyBlogs = async (req, res, next) => {
  try {
    const filter = { ...(await buildFilter(req.query)), author: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    await listBlogs(filter, req.query, res);
  } catch (error) {
    next(error);
  }
};

// GET /api/blogs/review-queue — editors/admins: pending and scheduled posts
const getReviewQueue = async (req, res, next) => {
  try {
    const filter = await buildFilter(req.query);
    filter.status = req.query.status || { $in: ['pending', 'scheduled'] };
    await listBlogs(filter, { sort: 'oldest', ...req.query }, res);
  } catch (error) {
    next(error);
  }
};

// GET /api/blogs/:idOrSlug — published posts are public; others only for owner/staff
const getBlogById = async (req, res, next) => {
  try {
    const { id } = req.params;
    const lookup = mongoose.isValidObjectId(id) ? { _id: id } : { slug: id.toLowerCase() };
    const blog = await Blog.findOne(lookup).populate('author', 'name email').populate('category', 'name slug');
    if (!blog || (blog.status !== 'published' && !canManage(blog, req.user))) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    if (blog.status === 'published' && !isOwner(blog, req.user)) {
      await Blog.updateOne({ _id: blog._id }, { $inc: { views: 1 } });
      blog.views += 1;
    }
    res.json(blog);
  } catch (error) {
    next(error);
  }
};

const createBlog = async (req, res, next) => {
  try {
    const { title, content, category, excerpt, coverImage, tags, status, publishAt } = req.body;
    checkStatusChange(req.user, status, publishAt);
    const resolvedCategory = await resolveCategory(category);

    const blog = await Blog.create({
      title,
      content,
      excerpt,
      coverImage,
      tags,
      status: status || 'draft',
      publishAt,
      category: resolvedCategory._id,
      author: req.user._id,
      authorName: req.user.name,
    });

    res.status(201).json(blog);
  } catch (error) {
    next(error);
  }
};

const updateBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    if (!canManage(blog, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to edit this blog' });
    }

    const { title, content, category, excerpt, coverImage, tags, status, publishAt } = req.body;
    checkStatusChange(req.user, status, publishAt ?? blog.publishAt);

    if (title) blog.title = title;
    if (content) blog.content = content;
    if (excerpt !== undefined) blog.excerpt = excerpt;
    if (coverImage !== undefined) blog.coverImage = coverImage;
    if (tags) blog.tags = tags;
    if (category) blog.category = (await resolveCategory(category))._id;
    if (publishAt !== undefined) blog.publishAt = publishAt;
    if (status) blog.status = status;
    // An author editing a live post sends it back for review.
    else if (!isStaff(req.user) && blog.status === 'published') blog.status = 'pending';

    await blog.save();
    res.json(blog);
  } catch (error) {
    next(error);
  }
};

// PATCH /api/blogs/:id/status — editors/admins move posts through the lifecycle
const updateBlogStatus = async (req, res, next) => {
  try {
    const { status, publishAt } = req.body;
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    checkStatusChange(req.user, status, publishAt);
    blog.status = status;
    if (status === 'scheduled') blog.publishAt = publishAt;
    if (status === 'published') blog.publishedAt = blog.publishedAt || new Date();
    await blog.save();

    res.json(blog);
  } catch (error) {
    next(error);
  }
};

const deleteBlog = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    if (!canManage(blog, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to delete this blog' });
    }

    await Comment.deleteMany({ blog: blog._id });
    await blog.deleteOne();
    res.json({ message: 'Blog deleted successfully' });
  } catch (error) {
    next(error);
  }
};

// POST /api/blogs/:id/like — toggles the caller's like
const toggleLike = async (req, res, next) => {
  try {
    const userId = req.user._id;
    const blog = await Blog.findOne({ _id: req.params.id, status: 'published' }).select('+likes');
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    const alreadyLiked = blog.likes.some((id) => String(id) === String(userId));
    const update = alreadyLiked
      ? { $pull: { likes: userId }, $inc: { likesCount: -1 } }
      : { $addToSet: { likes: userId }, $inc: { likesCount: 1 } };
    const updated = await Blog.findByIdAndUpdate(blog._id, update, { new: true });

    res.json({ liked: !alreadyLiked, likesCount: updated.likesCount });
  } catch (error) {
    next(error);
  }
};

// GET /api/blogs/:id/stats — engagement numbers for the owner or staff
const getBlogStats = async (req, res, next) => {
  try {
    const blog = await Blog.findById(req.params.id);
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }
    if (!canManage(blog, req.user)) {
      return res.status(403).json({ message: 'You are not allowed to view these stats' });
    }

    const commentCounts = await Comment.aggregate([
      { $match: { blog: blog._id } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const comments = { pending: 0, approved: 0, spam: 0 };
    commentCounts.forEach((c) => {
      comments[c._id] = c.count;
    });

    res.json({
      id: blog._id,
      title: blog.title,
      status: blog.status,
      views: blog.views,
      likes: blog.likesCount,
      comments,
      publishedAt: blog.publishedAt,
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/blogs/my-stats — totals across all of the caller's posts
const getMyStats = async (req, res, next) => {
  try {
    const [totals] = await Blog.aggregate([
      { $match: { author: new mongoose.Types.ObjectId(req.user._id) } },
      {
        $group: {
          _id: null,
          posts: { $sum: 1 },
          published: { $sum: { $cond: [{ $eq: ['$status', 'published'] }, 1, 0] } },
          views: { $sum: '$views' },
          likes: { $sum: '$likesCount' },
        },
      },
    ]);
    const top = await Blog.find({ author: req.user._id, status: 'published' })
      .sort({ views: -1 })
      .limit(5)
      .select('title slug views likesCount');

    res.json({
      author: req.user.name,
      posts: totals?.posts || 0,
      published: totals?.published || 0,
      views: totals?.views || 0,
      likes: totals?.likes || 0,
      topPosts: top,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getAllBlogs,
  getMyBlogs,
  getReviewQueue,
  getBlogById,
  createBlog,
  updateBlog,
  updateBlogStatus,
  deleteBlog,
  toggleLike,
  getBlogStats,
  getMyStats,
};
