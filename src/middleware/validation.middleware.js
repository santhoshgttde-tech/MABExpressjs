const { AppError } = require('../utils/AppError');

function validate(schema, source = 'body') {
  return (req, res, next) => {
    const result = schema.safeParse(req[source]);
    if (!result.success) {
      const details = result.error.flatten();
      return next(
        new AppError(400, 'Validation failed.', 'VALIDATION_ERROR', details)
      );
    }
    req[source] = result.data;
    return next();
  };
}

module.exports = { validate };