const jwt = require('jsonwebtoken');
const User = require('../models/User');

const getUserFromHeader = async (req) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { error: 'Authorization token missing' };
  }

  const token = authHeader.split(' ')[1];
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (!user) {
      return { error: 'Invalid authentication token' };
    }
    return { user };
  } catch (error) {
    return { error: 'Token is invalid or expired' };
  }
};

const authMiddleware = async (req, res, next) => {
  const { user, error } = await getUserFromHeader(req);
  if (error) {
    return res.status(401).json({ message: error });
  }
  req.user = user;
  next();
};

// Attaches req.user when a valid token is present, but never rejects the request.
const optionalAuth = async (req, res, next) => {
  if (req.headers.authorization) {
    const { user } = await getUserFromHeader(req);
    if (user) req.user = user;
  }
  next();
};

module.exports = authMiddleware;
module.exports.optionalAuth = optionalAuth;
