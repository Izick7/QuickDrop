'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const paymentService = require('../services/paymentService');

const create = asyncHandler(async (req, res) => {
  const payment = await paymentService.createPayment(
    req.user,
    req.params.id,
    req.body.method
  );
  return sendSuccess(res, { payment }, 'Payment created', 201);
});

const list = asyncHandler(async (req, res) => {
  const result = await paymentService.listCustomerPayments(req.user, req.query);
  return sendSuccess(res, result);
});

module.exports = { create, list };
