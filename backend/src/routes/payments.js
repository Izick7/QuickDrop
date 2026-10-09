'use strict';

const express = require('express');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { listPaymentsQuerySchema } = require('../validators/payments');
const paymentController = require('../controllers/paymentController');

const router = express.Router();

router.use(authenticate, authorize('CUSTOMER'));

router.get(
  '/',
  validate({ query: listPaymentsQuerySchema }),
  paymentController.list
);

module.exports = router;
