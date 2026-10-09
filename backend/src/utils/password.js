'use strict';

const bcrypt = require('bcrypt');
const config = require('../config');

function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

function comparePassword(plain, hash) {
  if (!hash) return Promise.resolve(false);
  return bcrypt.compare(plain, hash);
}

module.exports = { hashPassword, comparePassword };
