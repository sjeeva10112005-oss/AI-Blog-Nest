const rateLimit = require('express-rate-limit');
const { filterXSS } = require('xss');

const isTest = process.env.NODE_ENV === 'test';

const limiter = (windowMinutes, max, message) =>
  rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skip: () => isTest,
    message: { message },
  });

const globalLimiter = limiter(15, 300, 'Too many requests, please try again later');
const authLimiter = limiter(15, 20, 'Too many authentication attempts, please try again later');
const aiLimiter = limiter(15, 30, 'Too many AI requests, please try again later');

const clean = (value) => {
  if (typeof value === 'string') return filterXSS(value);
  if (Array.isArray(value)) return value.map(clean);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, clean(v)]));
  }
  return value;
};

// Strips dangerous HTML (scripts, event handlers) from every string in the JSON body.
const xssClean = (req, res, next) => {
  if (req.body) req.body = clean(req.body);
  next();
};

module.exports = {
  globalLimiter,
  authLimiter,
  aiLimiter,
  xssClean,
};
