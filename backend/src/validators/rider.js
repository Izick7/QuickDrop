'use strict';

const { z } = require('zod');
const {
  DELIVERY_STATUSES,
  RIDER_SELECTABLE_AVAILABILITIES,
} = require('../constants/enums');
const { paginationFields } = require('./deliveries');

// BUSY is system-managed, so it is not an accepted value here.
const availabilitySchema = z
  .object({
    availability: z.enum(RIDER_SELECTABLE_AVAILABILITIES, {
      message: `availability must be one of: ${RIDER_SELECTABLE_AVAILABILITIES.join(', ')}`,
    }),
  })
  .strict();

// Riders may only advance; CANCELLED is intentionally rejected (400).
const riderStatusSchema = z
  .object({
    status: z.enum(['PICKED_UP', 'IN_TRANSIT', 'DELIVERED'], {
      message: 'status must be one of: PICKED_UP, IN_TRANSIT, DELIVERED',
    }),
    note: z
      .string()
      .trim()
      .max(1000, 'note must be at most 1000 characters')
      .optional(),
  })
  .strict();

const riderListQuerySchema = z
  .object({
    ...paginationFields,
    status: z.enum(DELIVERY_STATUSES).optional(),
  })
  .strict();

const availableQuerySchema = z.object({ ...paginationFields }).strict();

module.exports = {
  availabilitySchema,
  riderStatusSchema,
  riderListQuerySchema,
  availableQuerySchema,
};
