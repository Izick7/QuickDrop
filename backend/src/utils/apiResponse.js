'use strict';

// Uniform success envelope: { success: true, data, message? }
function sendSuccess(res, data, message, statusCode = 200) {
  const body = { success: true, data };
  if (message) body.message = message;
  return res.status(statusCode).json(body);
}

module.exports = { sendSuccess };
