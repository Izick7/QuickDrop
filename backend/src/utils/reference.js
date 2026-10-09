'use strict';

const crypto = require('crypto');

// Human-readable unique payment reference.
function generatePaymentReference() {
  const stamp = Date.now().toString(36).toUpperCase();
  const rand = crypto.randomBytes(4).toString('hex').toUpperCase();
  return `PAY-${stamp}-${rand}`;
}

module.exports = { generatePaymentReference };
