'use strict';

const { rateLimit } = require('express-rate-limit');

// Applies to the /api/auth surface (register/login) to slow down brute force.
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 100,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts, please try again later',
  },
});

module.exports = { authRateLimiter };
