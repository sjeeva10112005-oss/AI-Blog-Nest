const { validationResult } = require('express-validator');

// Runs after express-validator chains; responds 422 with the collected errors.
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }
  next();
};

module.exports = validate;
