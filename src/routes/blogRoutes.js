const express = require('express');
const { body, param, query } = require('express-validator');
const {
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
} = require('../controllers/blogController');
const authMiddleware = require('../middleware/authMiddleware');
const { optionalAuth } = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { STATUSES } = require('../models/Blog');
const { blogCommentRouter } = require('./commentRoutes');

const router = express.Router();
const writers = authorize('author', 'editor', 'admin');
const staff = authorize('editor', 'admin');

const idParam = param('id').isMongoId().withMessage('Invalid blog id');
const listQuery = [
  query('page').optional().isInt({ min: 1 }),
  query('limit').optional().isInt({ min: 1, max: 50 }),
  query('sort').optional().isIn(['newest', 'oldest', 'popular', 'views']),
  query('status').optional().isIn(STATUSES),
];
const postFields = [
  body('excerpt').optional().isString().isLength({ max: 500 }),
  body('coverImage').optional().isString(),
  body('tags').optional().isArray({ max: 20 }).withMessage('Tags must be an array'),
  body('tags.*').optional().isString(),
  body('status').optional().isIn(STATUSES),
  body('publishAt').optional().isISO8601().withMessage('publishAt must be an ISO date').toDate(),
];

router.use('/:blogId/comments', blogCommentRouter);

router.get('/', listQuery, validate, getAllBlogs);
router.get('/mine', authMiddleware, writers, listQuery, validate, getMyBlogs);
router.get('/my-stats', authMiddleware, writers, getMyStats);
router.get('/review-queue', authMiddleware, staff, listQuery, validate, getReviewQueue);
router.get('/:id', optionalAuth, getBlogById);

router.post(
  '/',
  authMiddleware,
  writers,
  [
    body('title').trim().notEmpty().withMessage('Title is required'),
    body('content').trim().notEmpty().withMessage('Content is required'),
    body('category').trim().notEmpty().withMessage('Category is required'),
    ...postFields,
  ],
  validate,
  createBlog
);

router.put(
  '/:id',
  authMiddleware,
  writers,
  [
    idParam,
    body('title').optional().trim().notEmpty().withMessage('Title cannot be empty'),
    body('content').optional().trim().notEmpty().withMessage('Content cannot be empty'),
    body('category').optional().trim().notEmpty().withMessage('Category cannot be empty'),
    ...postFields,
  ],
  validate,
  updateBlog
);

router.patch(
  '/:id/status',
  authMiddleware,
  staff,
  [
    idParam,
    body('status').isIn(STATUSES).withMessage(`Status must be one of: ${STATUSES.join(', ')}`),
    body('publishAt').optional().isISO8601().toDate(),
  ],
  validate,
  updateBlogStatus
);

router.delete('/:id', authMiddleware, writers, [idParam], validate, deleteBlog);
router.post('/:id/like', authMiddleware, [idParam], validate, toggleLike);
router.get('/:id/stats', authMiddleware, writers, [idParam], validate, getBlogStats);

module.exports = router;
