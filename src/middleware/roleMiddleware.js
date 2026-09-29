// Usage: router.get('/x', authMiddleware, authorize('admin', 'editor'), handler)
const authorize = (...roles) => (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
  if (!roles.includes(req.user.role)) {
    return res.status(403).json({ message: `Role '${req.user.role}' is not allowed to perform this action` });
  }
  next();
};

const isStaff = (user) => Boolean(user) && ['admin', 'editor'].includes(user.role);

module.exports = { authorize, isStaff };
