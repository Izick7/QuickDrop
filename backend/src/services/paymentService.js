'use strict';

const { sequelize, Delivery, Payment } = require('../config/database');
const AppError = require('../utils/AppError');
const { generatePaymentReference } = require('../utils/reference');
const { getPagination, buildPaginated } = require('../utils/pagination');
const { transitionDelivery } = require('./deliveryService');

// CARD / TRANSFER are captured immediately; CASH settles on delivery.
const IMMEDIATE_METHODS = ['CARD', 'TRANSFER'];

/**
 * Creates a payment for a delivery the customer owns. Everything happens in a
 * single transaction with the delivery row locked, so two concurrent payments
 * cannot both succeed.
 */
async function createPayment(customer, deliveryId, method) {
  const payment = await sequelize.transaction(async (transaction) => {
    // Lock the delivery first (see deliveryService lock order).
    const delivery = await Delivery.findByPk(deliveryId, {
      lock: transaction.LOCK.UPDATE,
      transaction,
    });
    if (!delivery || delivery.customerId !== customer.id) {
      throw new AppError('Delivery not found', 404);
    }

    if (delivery.status === 'CANCELLED' || delivery.status === 'DELIVERED') {
      throw new AppError(
        `Cannot pay for a ${delivery.status.toLowerCase()} delivery`,
        409
      );
    }

    const existingSuccessful = await Payment.findOne({
      where: { deliveryId, status: 'SUCCESSFUL' },
      transaction,
    });
    if (existingSuccessful) {
      throw new AppError(
        'A successful payment already exists for this delivery',
        409
      );
    }

    // Supersede any older pending attempt.
    await Payment.update(
      { status: 'FAILED' },
      { where: { deliveryId, status: 'PENDING' }, transaction }
    );

    const immediate = IMMEDIATE_METHODS.includes(method);
    const created = await Payment.create(
      {
        deliveryId,
        customerId: customer.id,
        amount: delivery.price,
        method,
        status: immediate ? 'SUCCESSFUL' : 'PENDING',
        reference: immediate ? generatePaymentReference() : null,
        paidAt: immediate ? new Date() : null,
      },
      { transaction }
    );

    // A pending (or cash) delivery is confirmed as soon as money is involved.
    if (
      delivery.status === 'PENDING' &&
      (immediate || method === 'CASH')
    ) {
      await transitionDelivery({
        deliveryId,
        toStatus: 'CONFIRMED',
        actor: { id: customer.id },
        note: 'auto-confirmed on payment',
        transaction,
      });
    }

    return created;
  });

  return payment;
}

async function listCustomerPayments(customer, query) {
  const { page, limit, offset } = getPagination(query);
  const where = { customerId: customer.id };
  if (query.status) where.status = query.status;

  const { rows, count } = await Payment.findAndCountAll({
    where,
    include: [
      { model: Delivery, as: 'delivery', attributes: ['id', 'status', 'price'] },
    ],
    order: [['createdAt', 'DESC']],
    limit,
    offset,
    distinct: true,
  });

  return buildPaginated(rows, count, { page, limit });
}

module.exports = { createPayment, listCustomerPayments };
