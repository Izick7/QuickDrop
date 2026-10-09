'use strict';

const express = require('express');

const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const {
  updateMeSchema,
  changePasswordSchema,
} = require('../validators/users');
const userController = require('../controllers/userController');

const router = express.Router();

// Every user route is scoped to the authenticated caller's own account.
router.use(authenticate);

router.patch('/me', validate({ body: updateMeSchema }), userController.updateMe);

router.patch(
  '/me/password',
  validate({ body: changePasswordSchema }),
  userController.changePassword
);

module.exports = router;
