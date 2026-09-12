class AppError extends Error {
  constructor(statusCode, message, errorCode = 'INTERNAL_SERVER_ERROR', details = undefined) {
    super(message);
    this.statusCode = statusCode;
    this.errorCode = errorCode;
    this.details = details;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = { AppError };