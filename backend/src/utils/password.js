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

// Pre-computed (config cost) hash used to equalise login timing when the email
// does not exist: comparing against it makes "unknown email" and "wrong
// password" take a similar amount of time, avoiding a user-enumeration oracle.
const DUMMY_PASSWORD_HASH = bcrypt.hashSync(
  'quikdrop-dummy-password',
  config.bcryptRounds
);

module.exports = { hashPassword, comparePassword, DUMMY_PASSWORD_HASH };
