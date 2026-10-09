'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/apiResponse');
const riderService = require('../services/riderService');

const profile = asyncHandler(async (req, res) => {
  const riderProfile = await riderService.getProfile(req.user.id);
  return sendSuccess(res, { profile: riderProfile });
});

const availability = asyncHandler(async (req, res) => {
  const riderProfile = await riderService.setAvailability(
    req.user.id,
    req.body.availability
  );
  return sendSuccess(res, { profile: riderProfile }, 'Availability updated');
});

const available = asyncHandler(async (req, res) => {
  const result = await riderService.listAvailableDeliveries(req.query);
  return sendSuccess(res, result);
});

const accept = asyncHandler(async (req, res) => {
  const delivery = await riderService.riderAccept(req.user.id, req.params.id);
  return sendSuccess(res, { delivery }, 'Delivery accepted');
});

const list = asyncHandler(async (req, res) => {
  const result = await riderService.listRiderDeliveries(req.user.id, req.query);
  return sendSuccess(res, result);
});

const getById = asyncHandler(async (req, res) => {
  const delivery = await riderService.getRiderDelivery(req.user.id, req.params.id);
  return sendSuccess(res, { delivery });
});

const updateStatus = asyncHandler(async (req, res) => {
  const delivery = await riderService.riderUpdateStatus(
    req.user.id,
    req.params.id,
    req.body.status,
    req.body.note
  );
  return sendSuccess(res, { delivery }, 'Delivery status updated');
});

module.exports = {
  profile,
  availability,
  available,
  accept,
  list,
  getById,
  updateStatus,
};
