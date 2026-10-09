'use strict';

const express = require('express');

const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { authRateLimiter } = require('../middleware/rateLimit');
const { registerSchema, loginSchema } = require('../validators/auth');
const authController = require('../controllers/authController');

const router = express.Router();

router.post(
  '/register',
  authRateLimiter,
  validate({ body: registerSchema }),
  authController.register
);

router.post(
  '/login',
  authRateLimiter,
  validate({ body: loginSchema }),
  authController.login
);

router.get('/me', authenticate, authController.me);

module.exports = router;
