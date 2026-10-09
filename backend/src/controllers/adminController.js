'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const adminService = require('../services/adminService');
const deliveryService = require('../services/deliveryService');

const dashboard = asyncHandler(async (req, res) => {
  const stats = await adminService.getDashboard();
  return sendSuccess(res, stats);
});

const listUsers = asyncHandler(async (req, res) => {
  const result = await adminService.listUsers(req.query);
  return sendSuccess(res, result);
});

const createUser = asyncHandler(async (req, res) => {
  const user = await adminService.createUser(req.body);
  return sendSuccess(res, { user }, 'User created', 201);
});

const getUser = asyncHandler(async (req, res) => {
  const user = await adminService.getUser(req.params.id);
  return sendSuccess(res, { user });
});

const updateUser = asyncHandler(async (req, res) => {
  const user = await adminService.updateUser(
    req.params.id,
    req.body,
    req.user
  );
  return sendSuccess(res, { user }, 'User updated');
});

const listRiders = asyncHandler(async (req, res) => {
  const result = await adminService.listRiders(req.query);
  return sendSuccess(res, result);
});

const getRider = asyncHandler(async (req, res) => {
  const rider = await adminService.getRider(req.params.id);
  return sendSuccess(res, { rider });
});

const listDeliveries = asyncHandler(async (req, res) => {
  const result = await adminService.listDeliveries(req.query);
  return sendSuccess(res, result);
});

const getDelivery = asyncHandler(async (req, res) => {
  const delivery = await adminService.getDelivery(req.params.id);
  return sendSuccess(res, { delivery });
});

const confirmDelivery = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.adminConfirm(
    req.params.id,
    req.user,
    req.body && req.body.note
  );
  return sendSuccess(res, { delivery }, 'Delivery confirmed');
});

const assignDelivery = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.adminAssign(
    req.params.id,
    req.body.riderId,
    req.user,
    req.body.note
  );
  return sendSuccess(res, { delivery }, 'Delivery assigned');
});

const reassignDelivery = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.adminReassign(
    req.params.id,
    req.body.riderId,
    req.user,
    req.body.note
  );
  return sendSuccess(res, { delivery }, 'Delivery reassigned');
});

const cancelDelivery = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.adminCancel(
    req.params.id,
    req.user,
    req.body.reason,
    req.body.note
  );
  return sendSuccess(res, { delivery }, 'Delivery cancelled');
});

const listPayments = asyncHandler(async (req, res) => {
  const result = await adminService.listPayments(req.query);
  return sendSuccess(res, result);
});

const updatePaymentStatus = asyncHandler(async (req, res) => {
  const payment = await adminService.updatePaymentStatus(
    req.params.id,
    req.body.status,
    req.user
  );
  return sendSuccess(res, { payment }, 'Payment status updated');
});

module.exports = {
  dashboard,
  listUsers,
  createUser,
  getUser,
  updateUser,
  listRiders,
  getRider,
  listDeliveries,
  getDelivery,
  confirmDelivery,
  assignDelivery,
  reassignDelivery,
  cancelDelivery,
  listPayments,
  updatePaymentStatus,
};
