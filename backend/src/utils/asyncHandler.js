'use strict';

/**
 * Wraps an async express handler so rejected promises are forwarded to
 * next() and handled by the central error middleware.
 */
module.exports = function asyncHandler(fn) {
  return function wrapped(req, res, next) {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
