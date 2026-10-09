'use strict';

const { z } = require('zod');
const {
  ROLES,
  USER_STATUSES,
  AVAILABILITIES,
  DELIVERY_STATUSES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
} = require('../constants/enums');
const { paginationFields, cancelDeliverySchema } = require('./deliveries');
const { passwordSchema, emailSchema } = require('./auth');

const uuid = () => z.string().uuid();

const listUsersQuerySchema = z
  .object({
    ...paginationFields,
    role: z.enum(ROLES).optional(),
    status: z.enum(USER_STATUSES).optional(),
    q: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

const createUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120),
    email: emailSchema,
    phone: z.string().trim().min(1).max(30),
    password: passwordSchema,
    role: z.enum(ROLES),
    status: z.enum(USER_STATUSES).optional(),
    vehicleType: z.string().trim().min(1).max(60).optional(),
    plateNumber: z.string().trim().min(1).max(30).optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.role !== 'RIDER') return;
    if (!data.vehicleType) {
      ctx.addIssue({
        code: 'custom',
        path: ['vehicleType'],
        message: 'vehicleType is required when creating a rider',
      });
    }
    if (!data.plateNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['plateNumber'],
        message: 'plateNumber is required when creating a rider',
      });
    }
  });

// role is intentionally absent: it is immutable once an account exists.
const updateUserSchema = z
  .object({
    fullName: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().min(1).max(30).optional(),
    status: z.enum(USER_STATUSES).optional(),
  })
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

const listRidersQuerySchema = z
  .object({
    ...paginationFields,
    status: z.enum(USER_STATUSES).optional(),
    availability: z.enum(AVAILABILITIES).optional(),
  })
  .strict();

const listAdminDeliveriesQuerySchema = z
  .object({
    ...paginationFields,
    status: z.enum(DELIVERY_STATUSES).optional(),
    customerId: uuid().optional(),
    riderId: uuid().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
    q: z.string().trim().min(1).max(160).optional(),
  })
  .strict();

const assignDeliverySchema = z.object({ riderId: uuid() }).strict();

const listAdminPaymentsQuerySchema = z
  .object({
    ...paginationFields,
    status: z.enum(PAYMENT_STATUSES).optional(),
    method: z.enum(PAYMENT_METHODS).optional(),
    deliveryId: uuid().optional(),
    customerId: uuid().optional(),
    from: z.coerce.date().optional(),
    to: z.coerce.date().optional(),
  })
  .strict();

const updatePaymentStatusSchema = z
  .object({ status: z.enum(PAYMENT_STATUSES) })
  .strict();

module.exports = {
  listUsersQuerySchema,
  createUserSchema,
  updateUserSchema,
  listRidersQuerySchema,
  listAdminDeliveriesQuerySchema,
  assignDeliverySchema,
  listAdminPaymentsQuerySchema,
  updatePaymentStatusSchema,
  cancelDeliverySchema,
};
