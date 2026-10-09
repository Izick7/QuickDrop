'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const userService = require('../services/userService');

const updateMe = asyncHandler(async (req, res) => {
  const user = await userService.updateMe(req.user, req.body);
  return sendSuccess(res, { user }, 'Profile updated successfully');
});

const changePassword = asyncHandler(async (req, res) => {
  await userService.changePassword(
    req.user,
    req.body.currentPassword,
    req.body.newPassword
  );
  return sendSuccess(res, null, 'Password updated successfully');
});

module.exports = { updateMe, changePassword };
