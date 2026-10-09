'use strict';

const { User } = require('../config/database');
const AppError = require('../utils/AppError');
const asyncHandler = require('../utils/asyncHandler');
const { verifyToken } = require('../utils/jwt');

/**
 * Verifies the JWT, then RELOADS the user from the database on every request.
 * This ensures a status change (e.g. SUSPENDED) takes effect immediately even
 * if a previously issued token is still within its validity window.
 */
const authenticate = asyncHandler(async (req, res, next) => {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');

  if (scheme !== 'Bearer' || !token) {
    throw new AppError('Authentication required', 401);
  }

  const payload = verifyToken(token);
  if (!payload || !payload.sub) {
    throw new AppError('Invalid or expired token', 401);
  }

  const user = await User.findByPk(payload.sub);
  if (!user) {
    throw new AppError('Invalid or expired token', 401);
  }

  if (user.status !== 'ACTIVE') {
    throw new AppError('Your account is not active', 401);
  }

  req.user = user;
  return next();
});

module.exports = authenticate;
