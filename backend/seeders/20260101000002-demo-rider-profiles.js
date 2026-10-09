'use strict';

const { Op } = require('sequelize');

const PROFILE_IDS = [
  '44444444-4444-4444-8444-444444444441', // Randy (BUSY)
  '44444444-4444-4444-8444-444444444442', // Rita (BUSY)
  '44444444-4444-4444-8444-444444444443', // Rex (OFFLINE, suspended)
  '44444444-4444-4444-8444-444444444444', // Milo (BUSY)
  '44444444-4444-4444-8444-444444444445', // Nadia (AVAILABLE)
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();

    await queryInterface.bulkInsert('rider_profiles', [
      {
        id: PROFILE_IDS[0],
        userId: '33333333-3333-4333-8333-333333333331', // Randy Rider
        vehicleType: 'Motorcycle',
        plateNumber: 'KDA 123A',
        availability: 'BUSY',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: PROFILE_IDS[1],
        userId: '33333333-3333-4333-8333-333333333332', // Rita Rider
        vehicleType: 'Bicycle',
        plateNumber: 'BIC-009',
        availability: 'BUSY',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: PROFILE_IDS[2],
        userId: '33333333-3333-4333-8333-333333333333', // Rex Rider (suspended user)
        vehicleType: 'Car',
        plateNumber: 'KDB 456B',
        availability: 'OFFLINE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: PROFILE_IDS[3],
        userId: '33333333-3333-4333-8333-333333333334', // Milo Rider
        vehicleType: 'Van',
        plateNumber: 'KDC 789C',
        availability: 'BUSY',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: PROFILE_IDS[4],
        userId: '33333333-3333-4333-8333-333333333335', // Nadia Rider
        vehicleType: 'Motorcycle',
        plateNumber: 'KDD 321D',
        availability: 'AVAILABLE',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete(
      'rider_profiles',
      { id: { [Op.in]: PROFILE_IDS } },
      {}
    );
  },
};