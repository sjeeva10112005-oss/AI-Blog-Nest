const express = require('express');
const { body, param } = require('express-validator');
const {
  getCategories,
  getCategory,
  createCategory,
  updateCategory,
  deleteCategory,
} = require('../controllers/categoryController');
const authMiddleware = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');

const router = express.Router();
const staff = authorize('editor', 'admin');
const idParam = param('id').isMongoId().withMessage('Invalid category id');

router.get('/', getCategories);
router.get('/:id', getCategory);

router.post(
  '/',
  authMiddleware,
  staff,
  [
    body('name').trim().notEmpty().withMessage('Name is required').isLength({ max: 60 }),
    body('description').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  createCategory
);

router.put(
  '/:id',
  authMiddleware,
  staff,
  [
    idParam,
    body('name').optional().trim().notEmpty().withMessage('Name cannot be empty').isLength({ max: 60 }),
    body('description').optional().isString().isLength({ max: 500 }),
  ],
  validate,
  updateCategory
);

router.delete('/:id', authMiddleware, staff, [idParam], validate, deleteCategory);

module.exports = router;
