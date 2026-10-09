'use strict';

const AppError = require('../utils/AppError');

/**
 * Restricts a route to the given roles. Must run after `authenticate`.
 * Usage: authorize('ADMIN'), authorize('CUSTOMER', 'ADMIN')
 */
function authorize(...roles) {
  return function authorizeMiddleware(req, res, next) {
    if (!req.user) {
      return next(new AppError('Authentication required', 401));
    }
    if (!roles.includes(req.user.role)) {
      return next(new AppError('You do not have permission to perform this action', 403));
    }
    return next();
  };
}

module.exports = authorize;
