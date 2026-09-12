const { AppError } = require('../utils/AppError');

function notFoundHandler(req, res, next) {
  next(new AppError(404, 'API endpoint not found.', 'NOT_FOUND'));
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error.';
  let errorCode = err.errorCode || 'INTERNAL_SERVER_ERROR';
  let details = err.details;

  if (err.type === 'entity.too.large') {
    statusCode = 413;
    message = 'Request body too large.';
    errorCode = 'PAYLOAD_TOO_LARGE';
    details = undefined;
  }

  if (err.code === '23505') {
    statusCode = 409;
    message = 'Resource already exists.';
    errorCode = 'CONFLICT';
    details = undefined;
  }

  const isOperational = Boolean(err.isOperational);
  if (!isOperational) {
    console.error(err);
    message = 'Internal server error.';
    errorCode = 'INTERNAL_SERVER_ERROR';
    details = undefined;
  }

  const body = { success: false, message, errorCode };
  if (details !== undefined) {
    body.details = details;
  }

  res.status(statusCode).json(body);
}

module.exports = { notFoundHandler, errorHandler };