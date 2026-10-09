'use strict';

const bcrypt = require('bcrypt');
const { Op } = require('sequelize');

const PASSWORD = 'Password123!';

const USER_IDS = [
  '11111111-1111-4111-8111-111111111111', // admin
  '22222222-2222-4222-8222-222222222221', // customer 1
  '22222222-2222-4222-8222-222222222222', // customer 2
  '22222222-2222-4222-8222-222222222223', // customer 3
  '33333333-3333-4333-8333-333333333331', // rider 1
  '33333333-3333-4333-8333-333333333332', // rider 2
  '33333333-3333-4333-8333-333333333333', // rider 3 (suspended)
];

module.exports = {
  async up(queryInterface) {
    const passwordHash = await bcrypt.hash(PASSWORD, 10);
    const now = new Date();

    await queryInterface.bulkInsert('users', [
      {
        id: USER_IDS[0],
        fullName: 'Amina Admin',
        email: 'admin@quikdrop.test',
        phone: '+254700000001',
        passwordHash,
        role: 'ADMIN',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: USER_IDS[1],
        fullName: 'Carla Customer',
        email: 'carla@quikdrop.test',
        phone: '+254700000002',
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: USER_IDS[2],
        fullName: 'Chris Customer',
        email: 'chris@quikdrop.test',
        phone: '+254700000003',
        passwordHash,
        role: 'CUSTOMER',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: USER_IDS[3],
        fullName: 'Cindy Customer',
        email: 'cindy@quikdrop.test',
        phone: '+254700000004',
        passwordHash,
        role: 'CUSTOMER',
        status: 'INACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: USER_IDS[4],
        fullName: 'Randy Rider',
        email: 'randy.rider@quikdrop.test',
        phone: '+254700000005',
        passwordHash,
        role: 'RIDER',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: USER_IDS[5],
        fullName: 'Rita Rider',
        email: 'rita.rider@quikdrop.test',
        phone: '+254700000006',
        passwordHash,
        role: 'RIDER',
        status: 'ACTIVE',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: USER_IDS[6],
        fullName: 'Rex Rider',
        email: 'rex.rider@quikdrop.test',
        phone: '+254700000007',
        passwordHash,
        role: 'RIDER',
        status: 'SUSPENDED',
        createdAt: now,
        updatedAt: now,
      },
    ]);
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('users', { id: { [Op.in]: USER_IDS } }, {});
  },
};
