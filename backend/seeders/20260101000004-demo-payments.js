'use strict';

const { Op } = require('sequelize');

const PAYMENT_IDS = [
  '66666666-6666-4666-8666-666666666601', // D2 CARD SUCCESSFUL
  '66666666-6666-4666-8666-666666666602', // D3 CASH PENDING
  '66666666-6666-4666-8666-666666666603', // D4 CARD SUCCESSFUL
  '66666666-6666-4666-8666-666666666604', // D5 CASH PENDING
  '66666666-6666-4666-8666-666666666605', // D6 CARD SUCCESSFUL
  '66666666-6666-4666-8666-666666666606', // D7 CASH SUCCESSFUL
  '66666666-6666-4666-8666-666666666607', // D8 CARD REFUNDED
];

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);

module.exports = {
  async up(queryInterface) {
    await queryInterface.bulkInsert('payments', [
      {
        id: PAYMENT_IDS[0],
        deliveryId: '55555555-5555-4555-8555-555555555502',
        customerId: '22222222-2222-4222-8222-222222222222',
        amount: 320.0,
        method: 'CARD',
        status: 'SUCCESSFUL',
        reference: 'PAY-D2-20260101-0001',
        paidAt: hoursAgo(4),
        createdAt: hoursAgo(5),
        updatedAt: hoursAgo(4),
      },
      {
        id: PAYMENT_IDS[1],
        deliveryId: '55555555-5555-4555-8555-555555555503',
        customerId: '22222222-2222-4222-8222-222222222223',
        amount: 260.0,
        method: 'CASH',
        status: 'PENDING',
        reference: null,
        paidAt: null,
        createdAt: hoursAgo(6),
        updatedAt: hoursAgo(6),
      },
      {
        id: PAYMENT_IDS[2],
        deliveryId: '55555555-5555-4555-8555-555555555504',
        customerId: '22222222-2222-4222-8222-222222222221',
        amount: 600.0,
        method: 'CARD',
        status: 'SUCCESSFUL',
        reference: 'PAY-D4-20260101-0002',
        paidAt: hoursAgo(2),
        createdAt: hoursAgo(8),
        updatedAt: hoursAgo(2),
      },
      {
        id: PAYMENT_IDS[3],
        deliveryId: '55555555-5555-4555-8555-555555555505',
        customerId: '22222222-2222-4222-8222-222222222222',
        amount: 355.0,
        method: 'CASH',
        status: 'PENDING',
        reference: null,
        paidAt: null,
        createdAt: hoursAgo(5),
        updatedAt: hoursAgo(5),
      },
      {
        id: PAYMENT_IDS[4],
        deliveryId: '55555555-5555-4555-8555-555555555506',
        customerId: '22222222-2222-4222-8222-222222222223',
        amount: 290.0,
        method: 'CARD',
        status: 'SUCCESSFUL',
        reference: 'PAY-D6-20260101-0004',
        paidAt: hoursAgo(25),
        createdAt: hoursAgo(34),
        updatedAt: hoursAgo(25),
      },
      {
        id: PAYMENT_IDS[5],
        deliveryId: '55555555-5555-4555-8555-555555555507',
        customerId: '22222222-2222-4222-8222-222222222221',
        amount: 425.0,
        method: 'CASH',
        status: 'SUCCESSFUL',
        reference: 'PAY-D7-20260101-0005',
        paidAt: hoursAgo(47),
        createdAt: hoursAgo(56),
        updatedAt: hoursAgo(47),
      },
      {
        id: PAYMENT_IDS[6],
        deliveryId: '55555555-5555-4555-8555-555555555508',
        customerId: '22222222-2222-4222-8222-222222222222',
        amount: 510.0,
        method: 'CARD',
        status: 'REFUNDED',
        reference: 'PAY-D8-20260101-0006',
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