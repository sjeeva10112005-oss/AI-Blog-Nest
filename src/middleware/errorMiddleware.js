const notFound = (req, res) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

// eslint-disable-next-line no-unused-vars
const errorMiddleware = (err, req, res, next) => {
  let status = err.status || err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let details;

  if (err.name === 'CastError') {
    status = 400;
    message = `Invalid value for ${err.path}`;
  } else if (err.name === 'ValidationError') {
    status = 400;
    message = 'Validation failed';
    details = Object.values(err.errors).map((e) => ({ field: e.path, message: e.message }));
  } else if (err.code === 11000) {
    status = 409;
    message = `Duplicate value for ${Object.keys(err.keyValue || {}).join(', ') || 'unique field'}`;
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    message = `Malformed JSON body: ${err.message}`;
  }

  if (status >= 500 && process.env.NODE_ENV !== 'test') {
    console.error(err.stack);
  }

  res.status(status).json({
    message: status >= 500 && process.env.NODE_ENV === 'production' ? 'Internal Server Error' : message,
    ...(details && { errors: details }),
  });
};

module.exports = errorMiddleware;
module.exports.notFound = notFound;
