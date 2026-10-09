'use strict';

const express = require('express');

const authRoutes = require('./auth');
const userRoutes = require('./users');
const deliveryRoutes = require('./deliveries');
const paymentRoutes = require('./payments');
const riderRoutes = require('./rider');

const router = express.Router();

router.use('/auth', authRoutes);
router.use('/users', userRoutes);
router.use('/deliveries', deliveryRoutes);
router.use('/payments', paymentRoutes);
router.use('/rider', riderRoutes);

module.exports = router;
