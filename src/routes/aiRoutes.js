const express = require('express');
const { body, oneOf } = require('express-validator');
const {
  generateBlog,
  summarizeBlog,
  qualityAudit,
  generateFaq,
  weatherWise,
  fitTrack,
} = require('../controllers/aiController');
const authMiddleware = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');

const router = express.Router();

router.use(authMiddleware);

const contentOrBlogId = oneOf(
  [body('content').trim().notEmpty(), body('blogId').isMongoId()],
  { message: 'Provide either content or a valid blogId' }
);

router.post(
  '/generate-blog',
  authorize('author', 'editor', 'admin'),
  [
    body('topic').trim().notEmpty().withMessage('Topic is required').isLength({ max: 200 }),
    body('category').optional().trim().notEmpty().withMessage('Category cannot be empty'),
    body('tone').optional().isString().isLength({ max: 60 }),
    body('length').optional().isIn(['short', 'medium', 'long']),
    body('status').optional().isIn(['draft', 'pending']).withMessage('AI posts can only be saved as draft or pending'),
  ],
  validate,
  generateBlog
);

router.post('/summarize', [contentOrBlogId], validate, summarizeBlog);

router.post('/quality-audit', authorize('editor', 'admin'), [contentOrBlogId], validate, qualityAudit);

router.post(
  '/faq',
  [
    oneOf([body('topic').trim().notEmpty(), body('content').trim().notEmpty(), body('blogId').isMongoId()], {
      message: 'Provide a topic, content or a valid blogId',
    }),
    body('count').optional().isInt({ min: 1, max: 15 }).toInt(),
  ],
  validate,
  generateFaq
);

router.post(
  '/weatherwise',
  [
    body('location').trim().notEmpty().withMessage('Location is required').isLength({ max: 100 }),
    body('date').optional().isString().isLength({ max: 40 }),
    body('activity').optional().isString().isLength({ max: 200 }),
    body('conditions').optional().isString().isLength({ max: 200 }),
  ],
  validate,
  weatherWise
);

router.post(
  '/fittrack',
  [
    body('goal').trim().notEmpty().withMessage('Goal is required').isLength({ max: 200 }),
    body('fitnessLevel').optional().isIn(['beginner', 'intermediate', 'advanced']),
    body('daysPerWeek').optional().isInt({ min: 1, max: 7 }).toInt(),
    body('minutesPerSession').optional().isInt({ min: 10, max: 180 }).toInt(),
    body('equipment').optional().isString().isLength({ max: 200 }),
  ],
  validate,
  fitTrack
);

module.exports = router;
