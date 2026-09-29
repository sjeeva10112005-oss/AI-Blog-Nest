const express = require('express');
const { body, param, query } = require('express-validator');
const {
  createComment,
  getBlogComments,
  getComments,
  updateCommentStatus,
  deleteComment,
} = require('../controllers/commentController');
const authMiddleware = require('../middleware/authMiddleware');
const { optionalAuth } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { COMMENT_STATUSES } = require('../models/Comment');

const staff = authorize('editor', 'admin');
const idParam = param('id').isMongoId().withMessage('Invalid comment id');
const blogIdParam = param('blogId').isMongoId().withMessage('Invalid blog id');

// Mounted at /api/blogs/:blogId/comments
const blogCommentRouter = express.Router({ mergeParams: true });

blogCommentRouter.get('/', optionalAuth, [blogIdParam], validate, getBlogComments);
blogCommentRouter.post(
  '/',
  authMiddleware,
  [blogIdParam, body('content').trim().notEmpty().withMessage('Content is required').isLength({ max: 2000 })],
  validate,
  createComment
);

// Mounted at /api/comments
const commentRouter = express.Router();

commentRouter.get(
  '/',
  authMiddleware,
  staff,
  [query('status').optional().isIn(COMMENT_STATUSES), query('blog').optional().isMongoId()],
  validate,
  getComments
);
commentRouter.patch(
  '/:id/status',
  authMiddleware,
  staff,
  [idParam, body('status').isIn(COMMENT_STATUSES).withMessage(`Status must be one of: ${COMMENT_STATUSES.join(', ')}`)],
  validate,
  updateCommentStatus
);
commentRouter.delete('/:id', authMiddleware, [idParam], validate, deleteComment);

module.exports = commentRouter;
module.exports.blogCommentRouter = blogCommentRouter;
