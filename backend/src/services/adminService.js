'use strict';

const { Op, fn, col } = require('sequelize');
const {
  sequelize,
  User,
  RiderProfile,
  Delivery,
  Payment,
  DeliveryStatusHistory,
} = require('../config/database');
const AppError = require('../utils/AppError');
const { hashPassword } = require('../utils/password');
const { generatePaymentReference } = require('../utils/reference');
const { getPagination, buildPaginated } = require('../utils/pagination');
const {
  ROLES,
  USER_STATUSES,
  DELIVERY_STATUSES,
  AVAILABILITIES,
  ACTIVE_DELIVERY_STATUSES,
} = require('../constants/enums');
const { toPublicUser, getMe } = require('./userService');
const { transitionDelivery, serializeDelivery } = require('./deliveryService');

const ACTIVE = ACTIVE_DELIVERY_STATUSES;
const terminalDelivery = ['DELIVERED', 'CANCELLED'];

const CUSTOMER_BASICS_INCLUDE = {
  model: User,
  as: 'customer',
  attributes: ['id', 'fullName', 'email', 'phone'],
};

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

/* ------------------------------------------------------------------ *
 * Dashboard
 * ------------------------------------------------------------------ */
async function getDashboard() {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const [statusRows, createdToday, totalDeliveries] = await Promise.all([
    Delivery.findAll({
      attributes: ['status', [fn('COUNT', col('id')), 'count']],
      group: ['status'],
      raw: true,
    }),
    Delivery.count({ where: { createdAt: { [Op.gte]: startOfDay } } }),
    Delivery.count(),
  ]);

  const byStatus = {};
  for (const status of DELIVERY_STATUSES) byStatus[status] = 0;
  for (const row of statusRows) byStatus[row.status] = Number(row.count);

  const availabilityRows = await RiderProfile.findAll({
    attributes: ['availability', [fn('COUNT', col('id')), 'count']],
    group: ['availability'],
    raw: true,
  });
  const byAvailability = {};
  for (const availability of AVAILABILITIES) byAvailability[availability] = 0;
  for (const row of availabilityRows) {
    byAvailability[row.availability] = Number(row.count);
  }

  const roleRows = await User.findAll({
    attributes: ['role', [fn('COUNT', col('id')), 'count']],
    group: ['role'],
    raw: true,
  });
  const byRole = {};
  for (const role of ROLES) byRole[role] = 0;
  for (const row of roleRows) byRole[row.role] = Number(row.count);

  const userStatusRows = await User.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'count']],
    group: ['status'],
    raw: true,
  });
  const byUserStatus = {};
  for (const status of USER_STATUSES) byUserStatus[status] = 0;
  for (const row of userStatusRows) byUserStatus[row.status] = Number(row.count);

  const revenue = await Payment.sum('amount', {
    where: { status: 'SUCCESSFUL' },
  });

  return {
    deliveries: {
      total: totalDeliveries,
      createdToday,
      byStatus,
    },
    riders: {
      total: Object.values(byAvailability).reduce((a, b) => a + b, 0),
      byAvailability,
    },
    users: {
      total: Object.values(byRole).reduce((a, b) => a + b, 0),
      byRole,
      byStatus: byUserStatus,
    },
    revenue: {
      successfulTotal: revenue === null ? 0 : Number(revenue),
    },
  };
}

/* ------------------------------------------------------------------ *
 * Users
 * ------------------------------------------------------------------ */
async function listUsers(query) {
  const { page, limit, offset } = getPagination(query);
  const where = {};
  if (query.role) where.role = query.role;
  if (query.status) where.status = query.status;
  if (query.q) {
    where[Op.or] = [
      { fullName: { [Op.iLike]: `%${query.q}%` } },
      { email: { [Op.iLike]: `%${query.q}%` } },
    ];
  }

  const { rows, count } = await User.findAndCountAll({
    where,
    include: [{ model: RiderProfile, as: 'riderProfile' }],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return buildPaginated(rows.map(toPublicUser), count, { page, limit });
}

async function createUser(data) {
  const { fullName, email, phone, password, role, status } = data;

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new AppError('Email is already registered', 409);
  }

  const passwordHash = await hashPassword(password);

  const user = await sequelize.transaction(async (transaction) => {
    const created = await User.create(
      {
        fullName,
        email,
        phone,
        passwordHash,
        role,
        status: status || 'ACTIVE',
      },
      { transaction }
    );

    if (role === 'RIDER') {
      await RiderProfile.create(
        {
          userId: created.id,
          vehicleType: data.vehicleType,
          plateNumber: data.plateNumber,
          availability: 'OFFLINE',
        },
        { transaction }
      );
    }

    return created;
  });

  return getMe(user.id);
}

async function getUser(id) {
  const user = await User.findByPk(id, {
    include: [{ model: RiderProfile, as: 'riderProfile' }],
  });
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const publicUser = toPublicUser(user);
  if (!publicUser.riderProfile) delete publicUser.riderProfile;

  const [asCustomer, asRider] = await Promise.all([
    Delivery.count({ where: { customerId: id } }),
    user.role === 'RIDER'
      ? Delivery.count({ where: { riderId: id } })
      : Promise.resolve(0),
  ]);

  publicUser.deliveryCounts = { asCustomer, asRider };
  return publicUser;
}

/**
 * Updates fullName / phone / status. The role can never be changed and accounts
 * are never deleted. Status changes are guarded so the system can never be left
 * without an active administrator, and a rider with work in flight can never be
 * suspended out from under their delivery.
 */
async function updateUser(id, data, actor) {
  await sequelize.transaction(async (transaction) => {
    const target = await User.findByPk(id, { transaction });
    if (!target) {
      throw new AppError('User not found', 404);
    }

    const nextStatus = data.status;
    const statusChanging =
      nextStatus !== undefined && nextStatus !== target.status;

    // Lock the row we will mutate. Admin targets additionally lock EVERY admin
    // row (in ascending id order) so two admins changing each other's status
    // serialise cleanly instead of deadlocking.
    let locked = target;
    if (target.role === 'ADMIN') {
      const admins = await User.findAll({
        where: { role: 'ADMIN' },
        order: [['id', 'ASC']],
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
      locked = admins.find((admin) => admin.id === id) || target;
    } else if (statusChanging) {
      locked = await User.findByPk(id, {
        lock: transaction.LOCK.UPDATE,
        transaction,
      });
    }

    if (statusChanging && locked.role === 'ADMIN') {
      if (actor.id === locked.id) {
        throw new AppError('You cannot change your own status', 409);
      }
      if (locked.status === 'ACTIVE' && nextStatus !== 'ACTIVE') {
        const activeAdmins = await User.count({
          where: { role: 'ADMIN', status: 'ACTIVE' },
          transaction,
        });
        if (activeAdmins <= 1) {
          throw new AppError('Cannot deactivate the last active admin', 409);
        }
      }
    }

    if (
      statusChanging &&
      nextStatus !== 'ACTIVE' &&
      locked.role === 'RIDER'
    ) {
      const active = await Delivery.count({
        where: { riderId: id, status: { [Op.in]: ACTIVE } },
        transaction,
      });
      if (active > 0) {
        throw new AppError(
          'Cannot change the status of a rider with an active delivery',
          409
        );
      }
    }

    const fields = {};
    if (data.fullName !== undefined) fields.fullName = data.fullName;
    if (data.phone !== undefined) fields.phone = data.phone;
    if (nextStatus !== undefined) fields.status = nextStatus;

    if (Object.keys(fields).length > 0) {
      await locked.update(fields, { transaction });
    }
  });

  return getUser(id);
}

/* ------------------------------------------------------------------ *
 * Riders
 * ------------------------------------------------------------------ */
async function activeDeliveryCounts(riderIds) {
  const map = {};
  if (riderIds.length === 0) return map;
  const rows = await Delivery.findAll({
    attributes: ['riderId', [fn('COUNT', col('id')), 'count']],
    where: { riderId: { [Op.in]: riderIds }, status: { [Op.in]: ACTIVE } },
    group: ['riderId'],
    raw: true,
  });
  for (const row of rows) map[row.riderId] = Number(row.count);
  return map;
}

async function listRiders(query) {
  const { page, limit, offset } = getPagination(query);
  const where = { role: 'RIDER' };
  if (query.status) where.status = query.status;

  const profileInclude = { model: RiderProfile, as: 'riderProfile', required: true };
  if (query.availability) profileInclude.where = { availability: query.availability };

  const { rows, count } = await User.findAndCountAll({
    where,
    include: [profileInclude],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  const activeMap = await activeDeliveryCounts(rows.map((row) => row.id));
  const items = rows.map((row) => {
    const rider = toPublicUser(row);
    rider.activeDeliveries = activeMap[row.id] || 0;
    return rider;
  });

  return buildPaginated(items, count, { page, limit });
}

async function getRider(id) {
  const user = await User.findOne({
    where: { id, role: 'RIDER' },
    include: [{ model: RiderProfile, as: 'riderProfile' }],
  });
  if (!user) {
    throw new AppError('Rider not found', 404);
  }

  const rider = toPublicUser(user);
  const [active, delivered, cancelled] = await Promise.all([
    Delivery.count({ where: { riderId: id, status: { [Op.in]: ACTIVE } } }),
    Delivery.count({ where: { riderId: id, status: 'DELIVERED' } }),
    Delivery.count({ where: { riderId: id, status: 'CANCELLED' } }),
  ]);
  rider.deliveryCounts = { active, delivered, cancelled };
  return rider;
}

/* ------------------------------------------------------------------ *
 * Deliveries
 * ------------------------------------------------------------------ */
function dateRange(query) {
  if (!query.from && !query.to) return null;
  const range = {};
  if (query.from) range[Op.gte] = new Date(query.from);
  if (query.to) range[Op.lte] = new Date(query.to);
  return range;
}

async function listDeliveries(query) {
  const { page, limit, offset } = getPagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.customerId) where.customerId = query.customerId;
  if (query.riderId) where.riderId = query.riderId;
  const range = dateRange(query);
  if (range) where.createdAt = range;
  if (query.q) {
    where[Op.or] = [
      { pickupAddress: { [Op.iLike]: `%${query.q}%` } },
      { dropoffAddress: { [Op.iLike]: `%${query.q}%` } },
    ];
  }

  const { rows, count } = await Delivery.findAndCountAll({
    where,
    include: [CUSTOMER_BASICS_INCLUDE, RIDER_BASICS_INCLUDE],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return buildPaginated(rows.map(serializeDelivery), count, { page, limit });
}

async function getDelivery(id) {
  const delivery = await Delivery.findByPk(id, {
    include: [
      CUSTOMER_BASICS_INCLUDE,
      RIDER_BASICS_INCLUDE,
      { model: Payment, as: 'payments' },
      { model: DeliveryStatusHistory, as: 'statusHistory' },
    ],
    order: [
      [{ model: DeliveryStatusHistory, as: 'statusHistory' }, 'createdAt', 'ASC'],
    ],
  });
  if (!delivery) {
    throw new AppError('Delivery not found', 404);
  }
  return serializeDelivery(delivery);
}

/* ------------------------------------------------------------------ *
 * Payments
 * ------------------------------------------------------------------ */
async function listPayments(query) {
  const { page, limit, offset } = getPagination(query);
  const where = {};
  if (query.status) where.status = query.status;
  if (query.method) where.method = query.method;
  if (query.deliveryId) where.deliveryId = query.deliveryId;
  if (query.customerId) where.customerId = query.customerId;
  const range = dateRange(query);
  if (range) where.createdAt = range;

  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: [
      {
        model: Delivery,
        as: 'delivery',
        attributes: ['id', 'status', 'price', 'customerId', 'riderId'],
      },
      {
        model: User,
        as: 'customer',
        attributes: ['id', 'fullName', 'email', 'phone'],
      },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return buildPaginated(rows, count, { page, limit });
}

/**
 * Admin payment state machine. The delivery row is locked before the payment
 * row (see deliveryService lock order). Payments belonging to a terminal
 * delivery are immutable; refunds are the only exception and are permitted
 * exactly when the delivery is CANCELLED or DELIVERED.
 */
async function updatePaymentStatus(paymentId, status, actor) {
  const pre = await Payment.findByPk(paymentId);
  if (!pre) {
    throw new AppError('Payment not found', 404);
  }

  const payment = await sequelize.transaction(async (transaction) => {
    const delivery = await Delivery.findByPk(pre.deliveryId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!delivery) {
      throw new AppError('Delivery not found', 404);
    }

    const row = await Payment.findByPk(paymentId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!row) {
      throw new AppError('Payment not found', 404);
    }

    if (status === 'SUCCESSFUL') {
      if (row.status !== 'PENDING') {
        throw new AppError('Only a PENDING payment can be marked SUCCESSFUL', 409);
      }
      if (terminalDelivery.includes(delivery.status)) {
        throw new AppError(
          `Cannot capture a payment for a ${delivery.status.toLowerCase()} delivery`,
          409
        );
      }
      const other = await Payment.findOne({
        where: { deliveryId: delivery.id, status: 'SUCCESSFUL' },
        transaction,
      });
      if (other && other.id !== row.id) {
        throw new AppError(
          'A successful payment already exists for this delivery',
          409
        );
      }

      await row.update(
        {
          status: 'SUCCESSFUL',
          paidAt: new Date(),
          reference: row.reference || generatePaymentReference(),
        },
        { transaction }
      );

      if (delivery.status === 'PENDING') {
        await transitionDelivery({
          deliveryId: delivery.id,
          toStatus: 'CONFIRMED',
          actor,
          note: 'Payment captured by admin',
          transaction,
        });
      }
    } else if (status === 'FAILED') {
      if (row.status !== 'PENDING') {
        throw new AppError('Only a PENDING payment can be marked FAILED', 409);
      }
      if (terminalDelivery.includes(delivery.status)) {
        throw new AppError(
          `Cannot fail a payment for a ${delivery.status.toLowerCase()} delivery`,
          409
        );
      }
      await row.update({ status: 'FAILED' }, { transaction });
    } else if (status === 'REFUNDED') {
      if (row.status !== 'SUCCESSFUL') {
        throw new AppError('Only a SUCCESSFUL payment can be refunded', 409);
      }
      if (!terminalDelivery.includes(delivery.status)) {
        throw new AppError(
          'Only payments for cancelled or delivered deliveries can be refunded',
          409
        );
      }
      await row.update({ status: 'REFUNDED' }, { transaction });
    } else {
      throw new AppError(`Unsupported payment status change: ${status}`, 409);
    }

    return row;
  });

  return payment;
}

module.exports = {
  getDashboard,
  listUsers,
  createUser,
  getUser,
  updateUser,
  listRiders,
  getRider,
  listDeliveries,
  getDelivery,
  listPayments,
  updatePaymentStatus,
};
