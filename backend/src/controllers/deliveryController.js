'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const deliveryService = require('../services/deliveryService');

const create = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.createDelivery(req.user, req.body);
  return sendSuccess(res, { delivery }, 'Delivery created', 201);
});

const list = asyncHandler(async (req, res) => {
  const result = await deliveryService.listCustomerDeliveries(req.user, req.query);
  return sendSuccess(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.getCustomerDelivery(req.user, req.params.id);
  return sendSuccess(res, { delivery });
});

const update = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.updateDelivery(
    req.user,
    req.params.id,
    req.body
  );
  return sendSuccess(res, { delivery }, 'Delivery updated');
});

const cancel = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.customerCancel(
    req.user,
    req.params.id,
    req.body.reason
  );
  return sendSuccess(res, { delivery }, 'Delivery cancelled');
});

module.exports = { create, list, getById, update, cancel };
