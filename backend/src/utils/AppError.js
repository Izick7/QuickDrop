'use strict';

/**
 * Operational error with an HTTP status code and optional structured details.
 * Anything thrown that is not an AppError is treated as an unexpected 500.
 */
class AppError extends Error {
  constructor(message, statusCode = 500, errors = undefined) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

module.exports = AppError;
