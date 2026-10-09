'use strict';

const { Op } = require('sequelize');
const {
  sequelize,
  Delivery,
  DeliveryStatusHistory,
  RiderProfile,
  User,
} = require('../config/database');
const AppError = require('../utils/AppError');
const { ACTIVE_DELIVERY_STATUSES } = require('../constants/enums');
const { getPagination, buildPaginated } = require('../utils/pagination');
const { transitionDelivery, serializeDelivery, assertRiderEligible } = require('./deliveryService');

const ACTIVE = ACTIVE_DELIVERY_STATUSES;
// Riders may only advance the delivery through these states; CANCELLED is
// reserved for customers/admins.
const RIDER_TARGET_STATUSES = ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'];

const CUSTOMER_BASICS_INCLUDE = {
  model: User,
  as: 'customer',
  attributes: ['id', 'fullName', 'phone'],
};

// Marketplace projection: addresses, package info and price only. Contact
// details are withheld until the rider has actually accepted the delivery.
const AVAILABLE_HIDDEN_FIELDS = [
  'pickupContactName',
  'pickupContactPhone',
  'dropoffContactName',
  'dropoffContactPhone',
];

function serializeAvailableDelivery(delivery) {
  const json = serializeDelivery(delivery);
  for (const field of AVAILABLE_HIDDEN_FIELDS) delete json[field];
  return json;
}

async function getProfile(riderId) {
  const profile = await RiderProfile.findOne({ where: { userId: riderId } });
  if (!profile) {
    throw new AppError('Rider profile not found', 404);
  }
  return profile;
}

async function setAvailability(riderId, availability) {
  return sequelize.transaction(async (transaction) => {
    const profile = await RiderProfile.findOne({
      where: { userId: riderId },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!profile) {
      throw new AppError('Rider profile not found', 404);
    }

    const activeCount = await Delivery.count({
      where: { riderId, status: { [Op.in]: ACTIVE } },
      transaction,
    });
    if (activeCount > 0) {
      throw new AppError(
        'You cannot change availability while you have an active delivery',
        409
      );
    }

    await profile.update({ availability }, { transaction });
    return profile;
  });
}

async function listAvailableDeliveries(query) {
  const { page, limit, offset } = getPagination(query);

  const { rows, count } = await Delivery.findAndCountAll({
    where: { status: 'CONFIRMED', riderId: null },
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  // No customer account details are exposed in the marketplace listing.
  return buildPaginated(
    rows.map(serializeAvailableDelivery),
    count,
    { page, limit }
  );
}

async function riderAccept(riderId, deliveryId) {
  await sequelize.transaction(async (transaction) => {
    // Lock order: delivery, then rider profile.
    const delivery = await Delivery.findByPk(deliveryId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!delivery) {
      throw new AppError('Delivery not found', 404);
    }
    if (delivery.status !== 'CONFIRMED' || delivery.riderId) {
      throw new AppError(
        'This delivery is no longer available for acceptance',
        409
      );
    }

    // Same eligibility rules as an admin assignment (role/status/availability
    // and no other active delivery), enforced under the profile lock.
    await assertRiderEligible(riderId, transaction);

    await transitionDelivery({
      deliveryId,
      toStatus: 'ASSIGNED',
      actor: { id: riderId, role: 'RIDER' },
      note: 'Accepted by rider',
      patch: { riderId },
      transaction,
    });
  });

  return getRiderDelivery(riderId, deliveryId);
}

async function listRiderDeliveries(riderId, query) {
  const { page, limit, offset } = getPagination(query);
  const where = { riderId };
  if (query.status) where.status = query.status;

  const { rows, count } = await Delivery.findAndCountAll({
    where,
    include: [{ model: DeliveryStatusHistory, as: 'statusHistory' }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return buildPaginated(rows.map(serializeDelivery), count, { page, limit });
}

async function getRiderDelivery(riderId, deliveryId) {
  const delivery = await Delivery.findOne({
    where: { id: deliveryId, riderId },
    include: [
      CUSTOMER_BASICS_INCLUDE,
      { model: DeliveryStatusHistory, as: 'statusHistory' },
    ],
    order: [[{ model: DeliveryStatusHistory, as: 'statusHistory' }, 'createdAt', 'ASC']],
  });
  if (!delivery) {
    // A delivery that is not assigned to this rider is reported as missing.
    throw new AppError('Delivery not found', 404);
  }
  return serializeDelivery(delivery);
}

async function riderUpdateStatus(riderId, deliveryId, status, note) {
  if (!RIDER_TARGET_STATUSES.includes(status)) {
    throw new AppError(
      'Riders may only set PICKED_UP, IN_TRANSIT or DELIVERED',
      400
    );
  }

  const delivery = await Delivery.findOne({
    where: { id: deliveryId, riderId },
  });
  if (!delivery) {
    throw new AppError('Delivery not found', 404);
  }

  await transitionDelivery({
    deliveryId,
    toStatus: status,
    actor: { id: riderId, role: 'RIDER' },
    note: note || `Marked ${status} by rider`,
    expectedRiderId: riderId,
  });

  return getRiderDelivery(riderId, deliveryId);
}

module.exports = {
  getProfile,
  setAvailability,
  listAvailableDeliveries,
  riderAccept,
  listRiderDeliveries,
  getRiderDelivery,
  riderUpdateStatus,
};
