const express = require('express');
const { body, param, query } = require('express-validator');
const { getUsers, updateUserRole, deleteUser, getStats } = require('../controllers/adminController');
const authMiddleware = require('../middleware/authMiddleware');
const { authorize } = require('../middleware/roleMiddleware');
const validate = require('../middleware/validate');
const { ROLES } = require('../models/User');

const router = express.Router();
const idParam = param('id').isMongoId().withMessage('Invalid user id');

router.use(authMiddleware, authorize('admin'));

router.get('/users', [query('role').optional().isIn(ROLES)], validate, getUsers);
router.patch(
  '/users/:id/role',
  [idParam, body('role').isIn(ROLES).withMessage(`Role must be one of: ${ROLES.join(', ')}`)],
  validate,
  updateUserRole
);
router.delete('/users/:id', [idParam], validate, deleteUser);
router.get('/stats', getStats);

module.exports = router;
