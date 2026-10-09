'use strict';

const jwt = require('jsonwebtoken');
const config = require('../config');

function signToken(user) {
  return jwt.sign(
    { sub: user.id, role: user.role },
    config.jwtSecret,
    { expiresIn: config.jwtExpiresIn }
  );
}

// Returns the decoded payload, or null if invalid/expired.
function verifyToken(token) {
  try {
    return jwt.verify(token, config.jwtSecret);
  } catch (err) {
    return null;
  }
}

module.exports = { signToken, verifyToken };
