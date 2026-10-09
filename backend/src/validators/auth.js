'use strict';

const { z } = require('zod');

// Shared password policy: at least 8 chars, one letter and one number.
const passwordSchema = z
  .string()
  .min(8, 'password must be at least 8 characters long')
  .regex(/[A-Za-z]/, 'password must contain at least one letter')
  .regex(/[0-9]/, 'password must contain at least one number');

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .email('email must be a valid email address');

// Only CUSTOMER and RIDER may self-register; ADMIN is rejected here.
const registerSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'fullName must be between 2 and 120 characters')
      .max(120, 'fullName must be between 2 and 120 characters'),
    email: emailSchema,
    phone: z
      .string()
      .trim()
      .min(1, 'phone is required')
      .max(30, 'phone must be at most 30 characters'),
    password: passwordSchema,
    role: z.enum(['CUSTOMER', 'RIDER']).optional().default('CUSTOMER'),
    vehicleType: z
      .string()
      .trim()
      .min(1, 'vehicleType cannot be empty')
      .max(60, 'vehicleType must be at most 60 characters')
      .optional(),
    plateNumber: z
      .string()
      .trim()
      .min(1, 'plateNumber cannot be empty')
      .max(30, 'plateNumber must be at most 30 characters')
      .optional(),
  })
  .strict()
  .superRefine((data, ctx) => {
    if (data.role !== 'RIDER') return;
    if (!data.vehicleType) {
      ctx.addIssue({
        code: 'custom',
        path: ['vehicleType'],
        message: 'vehicleType is required when registering as a rider',
      });
    }
    if (!data.plateNumber) {
      ctx.addIssue({
        code: 'custom',
        path: ['plateNumber'],
        message: 'plateNumber is required when registering as a rider',
      });
    }
  });

const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1, 'password is required'),
  })
  .strict();

module.exports = { registerSchema, loginSchema, passwordSchema, emailSchema };
