'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const authService = require('../services/authService');

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return sendSuccess(res, result, 'Registration successful', 201);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return sendSuccess(res, result, 'Login successful');
});

const me = asyncHandler(async (req, res) => {
  const user = await authService.me(req.user.id);
  return sendSuccess(res, { user });
});

module.exports = { register, login, me };
