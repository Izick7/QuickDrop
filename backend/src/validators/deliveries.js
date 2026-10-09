'use strict';

const { z } = require('zod');
const { DELIVERY_STATUSES } = require('../constants/enums');

const uuidParamSchema = z
  .object({ id: z.string().uuid('id must be a valid UUID') })
  .strict();

const paginationFields = {
  page: z.coerce.number().int().positive().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
};

// `price` and `status` are deliberately absent: because the objects are
// .strict(), sending them is a 400 rather than a silently ignored field.
const deliveryFields = {
  pickupAddress: z
    .string()
    .trim()
    .min(3, 'pickupAddress must be at least 3 characters')
    .max(255, 'pickupAddress must be at most 255 characters'),
  pickupContactName: z
    .string()
    .trim()
    .min(2, 'pickupContactName must be at least 2 characters')
    .max(120, 'pickupContactName must be at most 120 characters'),
  pickupContactPhone: z
    .string()
    .trim()
    .min(1, 'pickupContactPhone is required')
    .max(30, 'pickupContactPhone must be at most 30 characters'),
  dropoffAddress: z
    .string()
    .trim()
    .min(3, 'dropoffAddress must be at least 3 characters')
    .max(255, 'dropoffAddress must be at most 255 characters'),
  dropoffContactName: z
    .string()
    .trim()
    .min(2, 'dropoffContactName must be at least 2 characters')
    .max(120, 'dropoffContactName must be at most 120 characters'),
  dropoffContactPhone: z
    .string()
    .trim()
    .min(1, 'dropoffContactPhone is required')
    .max(30, 'dropoffContactPhone must be at most 30 characters'),
  packageDescription: z
    .string()
    .trim()
    .min(1, 'packageDescription is required'),
  packageWeightKg: z.coerce
    .number()
    .nonnegative('packageWeightKg cannot be negative')
    .max(1000, 'packageWeightKg is unrealistically large')
    .optional(),
  notes: z.string().trim().max(1000, 'notes must be at most 1000 characters').optional(),
};

const createDeliverySchema = z.object(deliveryFields).strict();

const updateDeliverySchema = z
  .object(
    Object.fromEntries(
      Object.entries(deliveryFields).map(([key, schema]) => [key, schema.optional()])
    )
  )
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

const cancelDeliverySchema = z
  .object({
    reason: z
      .string()
      .trim()
      .min(3, 'reason must be at least 3 characters')
      .max(1000, 'reason must be at most 1000 characters'),
  })
  .strict();

const listDeliveriesQuerySchema = z
  .object({
    ...paginationFields,
    status: z.enum(DELIVERY_STATUSES).optional(),
  })
  .strict();

module.exports = {
  uuidParamSchema,
  paginationFields,
  createDeliverySchema,
  updateDeliverySchema,
  cancelDeliverySchema,
  listDeliveriesQuerySchema,
};
