const User = require('../models/User');
const Blog = require('../models/Blog');
const Comment = require('../models/Comment');
const Category = require('../models/Category');

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// GET /api/admin/users?role=&search=&page=&limit=
const getUsers = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);
    const filter = {};
    if (req.query.role) filter.role = req.query.role;
    if (req.query.search) {
      const re = new RegExp(escapeRegex(req.query.search), 'i');
      filter.$or = [{ name: re }, { email: re }];
    }

    const [data, total] = await Promise.all([
      User.find(filter).select('-password').sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(filter),
    ]);
    res.json({ data, page, limit, total, pages: Math.ceil(total / limit) });
  } catch (error) {
    next(error);
  }
};

const updateUserRole = async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot change your own role' });
    }
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { role: req.body.role },
      { new: true, runValidators: true }
    ).select('-password');
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    res.json(user);
  } catch (error) {
    next(error);
  }
};

// Deletes the account and its comments. Posts are kept so published content isn't lost.
const deleteUser = async (req, res, next) => {
  try {
    if (String(req.params.id) === String(req.user._id)) {
      return res.status(400).json({ message: 'You cannot delete your own account' });
    }
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    const { deletedCount } = await Comment.deleteMany({ user: user._id });
    await user.deleteOne();
    res.json({ message: 'User deleted successfully', commentsRemoved: deletedCount });
  } catch (error) {
    next(error);
  }
};

const countBy = async (Model, field) => {
  const rows = await Model.aggregate([{ $group: { _id: `$${field}`, count: { $sum: 1 } } }]);
  return Object.fromEntries(rows.map((r) => [r._id, r.count]));
};

// GET /api/admin/stats — platform-wide numbers
const getStats = async (req, res, next) => {
  try {
    const [usersByRole, postsByStatus, commentsByStatus, categories, engagement] = await Promise.all([
      countBy(User, 'role'),
      countBy(Blog, 'status'),
      countBy(Comment, 'status'),
      Category.countDocuments(),
      Blog.aggregate([{ $group: { _id: null, views: { $sum: '$views' }, likes: { $sum: '$likesCount' } } }]),
    ]);

    res.json({
      users: usersByRole,
      posts: postsByStatus,
      comments: commentsByStatus,
      categories,
      views: engagement[0]?.views || 0,
      likes: engagement[0]?.likes || 0,
    });
  } catch (error) {
    next(error);
  }
};

module.exports = {
  getUsers,
  updateUserRole,
  deleteUser,
  getStats,
};
