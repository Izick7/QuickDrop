'use strict';

const express = require('express');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  uuidParamSchema,
  createDeliverySchema,
  updateDeliverySchema,
  cancelDeliverySchema,
  listDeliveriesQuerySchema,
} = require('../validators/deliveries');
const { createPaymentSchema } = require('../validators/payments');
const deliveryController = require('../controllers/deliveryController');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

// Entire surface is customer-only.
router.use(authenticate, authorize('CUSTOMER'));

router.post('/', validate({ body: createDeliverySchema }), deliveryController.create);

router.get(
  '/',
  validate({ query: listDeliveriesQuerySchema }),
  deliveryController.list
);

router.get(
  '/:id',
  validate({ params: uuidParamSchema }),
  deliveryController.getById
);

router.patch(
  '/:id',
  validate({ params: uuidParamSchema, body: updateDeliverySchema }),
  deliveryController.update
);

router.post(
  '/:id/cancel',
  validate({ params: uuidParamSchema, body: cancelDeliverySchema }),
  deliveryController.cancel
);

router.post(
  '/:id/payments',
  validate({ params: uuidParamSchema, body: createPaymentSchema }),
  paymentController.create
);

module.exports = router;
