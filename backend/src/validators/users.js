'use strict';

const { z } = require('zod');
const { passwordSchema } = require('./auth');

// email, role and status are intentionally NOT part of this schema; because the
// object is .strict(), sending them is rejected with a 400 rather than ignored.
const updateMeSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'fullName must be between 2 and 120 characters')
      .max(120, 'fullName must be between 2 and 120 characters')
      .optional(),
    phone: z
      .string()
      .trim()
      .min(1, 'phone cannot be empty')
      .max(30, 'phone must be at most 30 characters')
      .optional(),
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
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Provide at least one field to update',
  });

const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'currentPassword is required'),
    newPassword: passwordSchema,
  })
  .strict();

module.exports = { updateMeSchema, changePasswordSchema };
