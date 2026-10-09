'use strict';

const express = require('express');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { uuidParamSchema } = require('../validators/deliveries');
const {
  listUsersQuerySchema,
  createUserSchema,
  updateUserSchema,
  listRidersQuerySchema,
  listAdminDeliveriesQuerySchema,
  assignDeliverySchema,
  listAdminPaymentsQuerySchema,
  updatePaymentStatusSchema,
  cancelDeliverySchema,
} = require('../validators/admin');
const adminController = require('../controllers/adminController');

const router = express.Router();

// The whole admin surface requires an authenticated ADMIN.
router.use(authenticate, authorize('ADMIN'));

router.get('/dashboard', adminController.dashboard);

// Users
router.get('/users', validate({ query: listUsersQuerySchema }), adminController.listUsers);
router.post('/users', validate({ body: createUserSchema }), adminController.createUser);
router.get('/users/:id', validate({ params: uuidParamSchema }), adminController.getUser);
router.patch(
  '/users/:id',
  validate({ params: uuidParamSchema, body: updateUserSchema }),
  adminController.updateUser
);

// Riders
router.get('/riders', validate({ query: listRidersQuerySchema }), adminController.listRiders);
router.get('/riders/:id', validate({ params: uuidParamSchema }), adminController.getRider);

// Deliveries
router.get(
  '/deliveries',
  validate({ query: listAdminDeliveriesQuerySchema }),
  adminController.listDeliveries
);
router.get(
  '/deliveries/:id',
  validate({ params: uuidParamSchema }),
  adminController.getDelivery
);
router.post(
  '/deliveries/:id/confirm',
  validate({ params: uuidParamSchema }),
  adminController.confirmDelivery
);
router.post(
  '/deliveries/:id/assign',
  validate({ params: uuidParamSchema, body: assignDeliverySchema }),
  adminController.assignDelivery
);
router.post(
  '/deliveries/:id/reassign',
  validate({ params: uuidParamSchema, body: assignDeliverySchema }),
  adminController.reassignDelivery
);
router.post(
  '/deliveries/:id/cancel',
  validate({ params: uuidParamSchema, body: cancelDeliverySchema }),
  adminController.cancelDelivery
);

// Payments
router.get(
  '/payments',
  validate({ query: listAdminPaymentsQuerySchema }),
  adminController.listPayments
);
router.patch(
  '/payments/:id/status',
  validate({ params: uuidParamSchema, body: updatePaymentStatusSchema }),
  adminController.updatePaymentStatus
);

module.exports = router;
