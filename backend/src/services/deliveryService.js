'use strict';

/**
 * Delivery lifecycle service.
 *
 * LOCK ORDER — always acquire row locks in this order and never the reverse,
 * otherwise concurrent requests can deadlock:
 *   1. DELIVERY      (SELECT ... FOR UPDATE, bare row, no include)
 *   2. RIDER PROFILE (SELECT ... FOR UPDATE)
 *   3. PAYMENT       (UPDATE ... WHERE deliveryId = ...)
 *
 * Postgres rejects `FOR UPDATE` on the nullable side of an outer join, so we
 * NEVER lock a query that eager-loads includes. We lock the bare delivery row
 * first, then load related data with a second, non-locking query.
 *
 * Every status change in the system funnels through transitionDelivery(); the
 * actor-specific wrappers below only add permission/ownership checks.
 */

const { Op } = require('sequelize');
const {
  sequelize,
  Delivery,
  DeliveryStatusHistory,
  RiderProfile,
  Payment,
  User,
} = require('../config/database');
const AppError = require('../utils/AppError');
const { assertTransition } = require('../constants/deliveryTransitions');
const { ACTIVE_DELIVERY_STATUSES } = require('../constants/enums');
const { getPagination, buildPaginated } = require('../utils/pagination');
const { calculatePrice } = require('./pricingService');

const ACTIVE = ACTIVE_DELIVERY_STATUSES;

// Fields a customer may edit while the delivery is still PENDING.
const EDITABLE_FIELDS = [
  'pickupAddress',
  'pickupContactName',
  'pickupContactPhone',
  'dropoffAddress',
  'dropoffContactName',
  'dropoffContactPhone',
  'packageDescription',
  'packageWeightKg',
  'notes',
];

const RIDER_BASICS_INCLUDE = {
  model: User,
  as: 'rider',
  attributes: ['id', 'fullName', 'phone'],
  include: [
    {
      model: RiderProfile,
      as: 'riderProfile',
      attributes: ['vehicleType', 'plateNumber', 'availability'],
    },
  ],
};

const PAYMENTS_INCLUDE = { model: Payment, as: 'payments' };
const HISTORY_INCLUDE = {
  model: DeliveryStatusHistory,
  as: 'statusHistory',
};

// Flattens the nested rider profile into the rider object the API exposes.
function serializeDelivery(delivery) {
  if (!delivery) return null;
  const json = delivery.toJSON();
  if (json.rider) {
    const profile = json.rider.riderProfile || {};
    json.rider = {
      id: json.rider.id,
      fullName: json.rider.fullName,
      phone: json.rider.phone,
      vehicleType: profile.vehicleType || null,
      plateNumber: profile.plateNumber || null,
      availability: profile.availability || null,
    };
  }
  return json;
}

/* ------------------------------------------------------------------ *
 * THE single transition function. All status changes go through here.
 * ------------------------------------------------------------------ */
async function transitionDelivery(params) {
  const { transaction } = params;
  if (transaction) {
    return runTransition(params, transaction);
  }
  return sequelize.transaction((t) => runTransition(params, t));
}

async function runTransition(params, transaction) {
  const {
    deliveryId,
    toStatus,
    actor,
    note,
    patch = {},
    expectedRiderId,
  } = params;

  if (!actor || !actor.id) {
    throw new AppError('An actor is required to change a delivery', 500);
  }

  // --- lock #1: DELIVERY (bare row, no eager-loaded includes) ---
  const delivery = await Delivery.findByPk(deliveryId, {
    lock: transaction.LOCK.UPDATE,
    transaction,
  });
  if (!delivery) {
    throw new AppError('Delivery not found', 404);
  }
  // Ownership re-checked under the lock: a rider can only advance a delivery
  // that is (still) assigned to them, even if it was reassigned in between.
  if (expectedRiderId && delivery.riderId !== expectedRiderId) {
    throw new AppError('Delivery not found', 404);
  }

  const fromStatus = delivery.status;
  assertTransition(fromStatus, toStatus);

  const now = new Date();
  const fields = { status: toStatus };
  if (toStatus === 'ASSIGNED') fields.assignedAt = now;
  if (toStatus === 'PICKED_UP') fields.pickedUpAt = now;
  if (toStatus === 'DELIVERED') fields.deliveredAt = now;
  if (toStatus === 'CANCELLED') fields.cancelledAt = now;

  if (patch.riderId !== undefined) fields.riderId = patch.riderId;
  if (patch.cancelledReason !== undefined) {
    fields.cancelledReason = patch.cancelledReason;
  }

  // --- lock #2: RIDER PROFILE, then rider side effects ---
  let riderIdForEffects = null;
  if (toStatus === 'ASSIGNED') {
    riderIdForEffects = patch.riderId || null;
    if (!riderIdForEffects) {
      throw new AppError('riderId is required to assign a delivery', 500);
    }
  } else if (ACTIVE.includes(fromStatus) && !ACTIVE.includes(toStatus)) {
    riderIdForEffects = delivery.riderId;
  }

  if (riderIdForEffects) {
    const profile = await RiderProfile.findOne({
      where: { userId: riderIdForEffects },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (profile) {
      if (toStatus === 'ASSIGNED') {
        profile.availability = 'BUSY';
      } else if (profile.availability !== 'OFFLINE') {
        // Leaving the active set frees the rider, unless they deliberately
        // parked themselves OFFLINE.
        profile.availability = 'AVAILABLE';
      }
      await profile.save({ transaction });
    }
  }

  // Detach the rider when unassigning or cancelling an active delivery.
  if (toStatus === 'CONFIRMED' && fromStatus === 'ASSIGNED') {
    fields.riderId = null;
  }
  if (toStatus === 'CANCELLED' && ACTIVE.includes(fromStatus)) {
    fields.riderId = null;
  }

  // --- lock #3: PAYMENT side effects ---
  if (toStatus === 'CANCELLED') {
    // Refund money already captured, fail money still pending.
    await Payment.update(
      { status: 'REFUNDED' },
      { where: { deliveryId, status: 'SUCCESSFUL' }, transaction }
    );
    await Payment.update(
      { status: 'FAILED' },
      { where: { deliveryId, status: 'PENDING' }, transaction }
    );
  } else if (toStatus === 'DELIVERED') {
    // A cash-on-delivery payment settles when the parcel lands.
    await Payment.update(
      { status: 'SUCCESSFUL', paidAt: now },
      { where: { deliveryId, status: 'PENDING', method: 'CASH' }, transaction }
    );
  }

  await delivery.update(fields, { transaction });

  await DeliveryStatusHistory.create(
    {
      deliveryId,
      fromStatus,
      toStatus,
      changedBy: actor.id,
      note: note || null,
    },
    { transaction }
  );

  return delivery;
}

/* ------------------------------------------------------------------ *
 * Reads
 * ------------------------------------------------------------------ */
async function loadDeliveryDetail(deliveryId, { transaction } = {}) {
  const delivery = await Delivery.findByPk(deliveryId, {
    include: [RIDER_BASICS_INCLUDE, PAYMENTS_INCLUDE, HISTORY_INCLUDE],
    order: [[{ model: DeliveryStatusHistory, as: 'statusHistory' }, 'createdAt', 'ASC']],
    transaction,
  });
  if (!delivery) {
    throw new AppError('Delivery not found', 404);
  }
  return serializeDelivery(delivery);
}

async function getCustomerDelivery(customer, deliveryId) {
  const delivery = await Delivery.findOne({
    where: { id: deliveryId, customerId: customer.id },
    include: [RIDER_BASICS_INCLUDE, PAYMENTS_INCLUDE, HISTORY_INCLUDE],
    order: [[{ model: DeliveryStatusHistory, as: 'statusHistory' }, 'createdAt', 'ASC']],
  });
  if (!delivery) {
    // Someone else's resource is reported as missing on purpose.
    throw new AppError('Delivery not found', 404);
  }
  return serializeDelivery(delivery);
}

async function listCustomerDeliveries(customer, query) {
  const { page, limit, offset } = getPagination(query);
  const where = { customerId: customer.id };
  if (query.status) where.status = query.status;

  const { rows, count } = await Delivery.findAndCountAll({
    where,
    include: [RIDER_BASICS_INCLUDE],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return buildPaginated(rows.map(serializeDelivery), count, { page, limit });
}

/* ------------------------------------------------------------------ *
 * Customer actions
 * ------------------------------------------------------------------ */
async function createDelivery(customer, data) {
  const price = calculatePrice(data.packageWeightKg);

  const delivery = await sequelize.transaction(async (transaction) => {
    const created = await Delivery.create(
      {
        customerId: customer.id,
        pickupAddress: data.pickupAddress,
        pickupContactName: data.pickupContactName,
        pickupContactPhone: data.pickupContactPhone,
        dropoffAddress: data.dropoffAddress,
        dropoffContactName: data.dropoffContactName,
        dropoffContactPhone: data.dropoffContactPhone,
        packageDescription: data.packageDescription,
        packageWeightKg: data.packageWeightKg ?? null,
        notes: data.notes ?? null,
        price,
        status: 'PENDING',
      },
      { transaction }
    );

    await DeliveryStatusHistory.create(
      {
        deliveryId: created.id,
        fromStatus: null,
        toStatus: 'PENDING',
        changedBy: customer.id,
        note: 'Delivery request created',
      },
      { transaction }
    );

    return created;
  });

  return loadDeliveryDetail(delivery.id);
}

async function updateDelivery(customer, deliveryId, data) {
  await sequelize.transaction(async (transaction) => {
    const delivery = await Delivery.findOne({
      where: { id: deliveryId, customerId: customer.id },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!delivery) {
      throw new AppError('Delivery not found', 404);
    }
    if (delivery.status !== 'PENDING') {
      throw new AppError('Only PENDING deliveries can be edited', 409);
    }

    const fields = {};
    for (const key of EDITABLE_FIELDS) {
      if (data[key] !== undefined) fields[key] = data[key];
    }
    if (data.packageWeightKg !== undefined) {
      fields.price = calculatePrice(data.packageWeightKg);
    }
    await delivery.update(fields, { transaction });
  });

  return getCustomerDelivery(customer, deliveryId);
}

async function customerCancel(customer, deliveryId, reason) {
  await sequelize.transaction(async (transaction) => {
    const delivery = await Delivery.findOne({
      where: { id: deliveryId, customerId: customer.id },
      transaction,
    });
    if (!delivery) {
      throw new AppError('Delivery not found', 404);
    }
    await transitionDelivery({
      deliveryId,
      toStatus: 'CANCELLED',
      actor: { id: customer.id },
      note: reason,
      patch: { cancelledReason: reason },
      transaction,
    });
  });

  return getCustomerDelivery(customer, deliveryId);
}

/* ------------------------------------------------------------------ *
 * Admin actions (written now, exposed by the Stage 2D admin routes).
 * They share the same transitionDelivery, so invariants hold regardless
 * of who triggers the change.
 * ------------------------------------------------------------------ */
async function adminConfirm(deliveryId, actor, note) {
  await transitionDelivery({
    deliveryId,
    toStatus: 'CONFIRMED',
    actor,
    note: note || 'Confirmed by admin',
  });
  return loadDeliveryDetail(deliveryId);
}

async function adminAssign(deliveryId, riderId, actor, note) {
  await sequelize.transaction(async (transaction) => {
    const delivery = await Delivery.findOne({
      where: { id: deliveryId },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!delivery) {
      throw new AppError('Delivery not found', 404);
    }
    if (delivery.status !== 'CONFIRMED' || delivery.riderId) {
      throw new AppError('Delivery is not available for assignment', 409);
    }

    const rider = await User.findByPk(riderId, { transaction });
    if (!rider || rider.role !== 'RIDER') {
      throw new AppError('Rider not found', 404);
    }
    if (rider.status !== 'ACTIVE') {
      throw new AppError('Rider account is not active', 409);
    }

    const profile = await RiderProfile.findOne({
      where: { userId: riderId },
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!profile) {
      throw new AppError('Rider profile not found', 404);
    }
    if (profile.availability !== 'AVAILABLE') {
      throw new AppError('Rider is not available', 409);
    }

    const activeCount = await Delivery.count({
      where: { riderId, status: { [Op.in]: ACTIVE } },
      transaction,
    });
    if (activeCount > 0) {
      throw new AppError('Rider already has an active delivery', 409);
    }

    await transitionDelivery({
      deliveryId,
      toStatus: 'ASSIGNED',
      actor,
      note: note || 'Assigned by admin',
      patch: { riderId },
      transaction,
    });
  });

  return loadDeliveryDetail(deliveryId);
}

async function adminUnassign(deliveryId, actor, note) {
  await transitionDelivery({
    deliveryId,
    toStatus: 'CONFIRMED',
    actor,
    note: note || 'Unassigned by admin',
  });
  return loadDeliveryDetail(deliveryId);
}

async function adminCancel(deliveryId, actor, reason, note) {
  await transitionDelivery({
    deliveryId,
    toStatus: 'CANCELLED',
    actor,
    note: note || reason,
    patch: { cancelledReason: reason },
  });
  return loadDeliveryDetail(deliveryId);
}

module.exports = {
  transitionDelivery,
  serializeDelivery,
  createDelivery,
  updateDelivery,
  customerCancel,
  getCustomerDelivery,
  listCustomerDeliveries,
  adminConfirm,
  adminAssign,
  adminUnassign,
  adminCancel,
};
