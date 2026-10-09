'use strict';

const { Op } = require('sequelize');

const PAYMENT_IDS = [
  '66666666-6666-4666-8666-666666666601',
  '66666666-6666-4666-8666-666666666602',
  '66666666-6666-4666-8666-666666666603',
  '66666666-6666-4666-8666-666666666604',
  '66666666-6666-4666-8666-666666666605',
  '66666666-6666-4666-8666-666666666606',
  '66666666-6666-4666-8666-666666666607',
  '66666666-6666-4666-8666-666666666608',
];

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('payments', [
      {
        id: PAYMENT_IDS[0],
        deliveryId: '55555555-5555-4555-8555-555555555501',
        customerId: '22222222-2222-4222-8222-222222222221',
        amount: 350.0,
        method: 'CASH',
        status: 'PENDING',
        reference: null,
        paidAt: null,
        createdAt: hoursAgo(2),
        updatedAt: hoursAgo(2),
      },
      {
        id: PAYMENT_IDS[1],
        deliveryId: '55555555-5555-4555-8555-555555555502',
        customerId: '22222222-2222-4222-8222-222222222222',
        amount: 720.5,
        method: 'CARD',
        status: 'PENDING',
        reference: null,
        paidAt: null,
        createdAt: hoursAgo(5),
        updatedAt: hoursAgo(5),
      },
      {
        id: PAYMENT_IDS[2],
        deliveryId: '55555555-5555-4555-8555-555555555503',
        customerId: '22222222-2222-4222-8222-222222222223',
        amount: 480.0,
        method: 'TRANSFER',
        status: 'PENDING',
        reference: null,
        paidAt: null,
        createdAt: hoursAgo(6),
        updatedAt: hoursAgo(6),
      },
      {
        id: PAYMENT_IDS[3],
        deliveryId: '55555555-5555-4555-8555-555555555504',
        customerId: '22222222-2222-4222-8222-222222222221',
        amount: 1250.0,
        method: 'CASH',
        status: 'PENDING',
        reference: null,
        paidAt: null,
        createdAt: hoursAgo(8),
        updatedAt: hoursAgo(8),
      },
      {
        id: PAYMENT_IDS[4],
        deliveryId: '55555555-5555-4555-8555-555555555505',
        customerId: '22222222-2222-4222-8222-222222222222',
        amount: 560.0,
        method: 'CARD',
        status: 'PENDING',
        reference: null,
        paidAt: null,
        createdAt: hoursAgo(5),
        updatedAt: hoursAgo(5),
      },
      {
        id: PAYMENT_IDS[5],
        deliveryId: '55555555-5555-4555-8555-555555555506',
        customerId: '22222222-2222-4222-8222-222222222223',
        amount: 900.0,
        method: 'CARD',
        status: 'SUCCESSFUL',
        reference: 'PAY-D6-20260101-0001',
        paidAt: hoursAgo(25),
        createdAt: hoursAgo(34),
        updatedAt: hoursAgo(25),
      },
      {
        id: PAYMENT_IDS[6],
        deliveryId: '55555555-5555-4555-8555-555555555507',
        customerId: '22222222-2222-4222-8222-222222222221',
        amount: 640.0,
        method: 'CASH',
        status: 'SUCCESSFUL',
        reference: 'PAY-D7-20260101-0002',
        paidAt: hoursAgo(47),
        createdAt: hoursAgo(56),
        updatedAt: hoursAgo(47),
      },
      {
        id: PAYMENT_IDS[7],
        deliveryId: '55555555-5555-4555-8555-555555555508',
        customerId: '22222222-2222-4222-8222-222222222222',
        amount: 800.0,
        method: 'CARD',
        status: 'REFUNDED',
        reference: 'PAY-D8-20260101-0003',
        paidAt: hoursAgo(22),
        createdAt: hoursAgo(24),
        updatedAt: hoursAgo(20),
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete(
      'payments',
      { id: { [Op.in]: PAYMENT_IDS } },
      {}
    );
  },
};
