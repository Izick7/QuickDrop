'use strict';

const {
  ValidationError,
  UniqueConstraintError,
  ForeignKeyConstraintError,
} = require('sequelize');
const config = require('../config');

/**
 * Central error middleware. Produces the uniform error envelope
 * { success: false, message, errors? } and never leaks stack traces in production.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal server error';
  let errors = err.errors;

  if (err instanceof UniqueConstraintError) {
    statusCode = 409;
    message = 'Duplicate value violates a unique constraint';
    errors = Object.values(err.fields || {}).map((field) => ({
      field,
      message: `${field} already exists`,
    }));
  } else if (err instanceof ForeignKeyConstraintError) {
    statusCode = 409;
    message = 'This action conflicts with related records';
  } else if (err instanceof ValidationError) {
    statusCode = 400;
    message = 'Validation failed';
    errors = Object.values(err.errors || {}).map((item) => ({
      field: item.path,
      message: item.message,
    }));
  } else if (err && err.name === 'ZodError') {
    statusCode = 400;
    message = 'Validation failed';
    errors = (err.issues || []).map((issue) => ({
      field: issue.path.join('.') || '(root)',
      message: issue.message,
    }));
  }

  // Unexpected (non-operational) errors: log server-side, hide details in prod.
  if (statusCode >= 500) {
    // eslint-disable-next-line no-console
    console.error('[error]', err);
    if (config.isProduction) {
      message = 'Internal server error';
      errors = undefined;
    }
  }

  const body = { success: false, message };
  if (errors) body.errors = errors;

  res.status(statusCode).json(body);
}

module.exports = errorHandler;
