const Blog = require('../models/Blog');
const Comment = require('../models/Comment');
const { isStaff } = require('../middleware/roleMiddleware');

// POST /api/blogs/:blogId/comments — new comments wait for moderation unless posted by staff
const createComment = async (req, res, next) => {
  try {
    const blog = await Blog.findOne({ _id: req.params.blogId, status: 'published' });
    if (!blog) {
      return res.status(404).json({ message: 'Blog not found' });
    }

    const comment = await Comment.create({
      blog: blog._id,
      user: req.user._id,
      content: req.body.content,
      status: isStaff(req.user) ? 'approved' : 'pending',
    });

    res.status(201).json(comment);
  } catch (error) {
    next(error);
  }
};

// GET /api/blogs/:blogId/comments — approved comments, plus the caller's own pending ones
const getBlogComments = async (req, res, next) => {
  try {
    const filter = { blog: req.params.blogId };
    filter.$or = [{ status: 'approved' }];
    if (req.user) filter.$or.push({ user: req.user._id, status: 'pending' });

    const comments = await Comment.find(filter).populate('user', 'name avatar').sort({ createdAt: 1 });
    res.json(comments);
  } catch (error) {
    next(error);
  }
};

// GET /api/comments?status=pending — moderation queue for editors/admins
const getComments = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.blog) filter.blog = req.query.blog;

    const [data, total] = await Promise.all([
      Comment.find(filter)
        .populate('user', 'name email')
        .populate('blog', 'title slug')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit),
      Comment.countDocuments(filter),
    ]);
    res.json({ data, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
};

const updateCommentStatus = async (req, res, next) => {
  try {
    const comment = await Comment.findByIdAndUpdate(
      req.params.id,
      { status: req.body.status },
      { new: true, runValidators: true }
    );
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    res.json(comment);
  } catch (error) {
    next(error);
  }
};

const deleteComment = async (req, res, next) => {
  try {
    const comment = await Comment.findById(req.params.id);
    if (!comment) {
      return res.status(404).json({ message: 'Comment not found' });
    }
    if (String(comment.user) !== String(req.user._id) && !isStaff(req.user)) {
      return res.status(403).json({ message: 'You are not allowed to delete this comment' });
    }
    await comment.deleteOne();
    res.json({ message: 'Comment deleted successfully' });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  createComment,
  getBlogComments,
  getComments,
  updateCommentStatus,
  deleteComment,
};
