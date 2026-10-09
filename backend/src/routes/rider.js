'use strict';

const express = require('express');

const authenticate = require('../middleware/authenticate');
const authorize = require('../middleware/authorize');
const validate = require('../middleware/validate');
const {
  availabilitySchema,
  riderStatusSchema,
  riderListQuerySchema,
  availableQuerySchema,
} = require('../validators/rider');
const { uuidParamSchema } = require('../validators/deliveries');
const riderController = require('../controllers/riderController');

const router = express.Router();

// Entire surface is rider-only.
router.use(authenticate, authorize('RIDER'));

router.get('/profile', riderController.profile);

router.patch(
  '/availability',
  validate({ body: availabilitySchema }),
  riderController.availability
);

// Must be declared before '/deliveries/:id' so "available" is not read as an id.
router.get(
  '/deliveries/available',
  validate({ query: availableQuerySchema }),
  riderController.available
);

router.post(
  '/deliveries/:id/accept',
  validate({ params: uuidParamSchema }),
  riderController.accept
);

router.get(
  '/deliveries',
  validate({ query: riderListQuerySchema }),
  riderController.list
);

router.get(
  '/deliveries/:id',
  validate({ params: uuidParamSchema }),
  riderController.getById
);

router.patch(
  '/deliveries/:id/status',
  validate({ params: uuidParamSchema, body: riderStatusSchema }),
  riderController.updateStatus
);

module.exports = router;
