'use strict';

const { z } = require('zod');
const { PAYMENT_METHODS, PAYMENT_STATUSES } = require('../constants/enums');
const { paginationFields } = require('./deliveries');

const createPaymentSchema = z
  .object({
    method: z.enum(PAYMENT_METHODS, {
      message: `method must be one of: ${PAYMENT_METHODS.join(', ')}`,
    }),
  })
  .strict();

const listPaymentsQuerySchema = z
  .object({
    ...paginationFields,
    status: z.enum(PAYMENT_STATUSES).optional(),
  })
  .strict();

module.exports = { createPaymentSchema, listPaymentsQuerySchema };
