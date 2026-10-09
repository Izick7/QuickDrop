'use strict';

const { Op } = require('sequelize');

const ADMIN = '11111111-1111-4111-8111-111111111111';
const C1 = '22222222-2222-4222-8222-222222222221';
const C2 = '22222222-2222-4222-8222-222222222222';
const C3 = '22222222-2222-4222-8222-222222222223';
const R1 = '33333333-3333-4333-8333-333333333331';
const R2 = '33333333-3333-4333-8333-333333333332';
const R4 = '33333333-3333-4333-8333-333333333334';

const D = (n) => `55555555-5555-4555-8555-55555555550${n}`;
const H = (n) => `77777777-7777-4777-8777-7777777777${String(n).padStart(2, '0')}`;

// [deliverySuffix, fromStatus, toStatus, changedBy, note, hoursAgo]
const HISTORY = [
  // D1 - PENDING
  [1, null, 'PENDING', C1, 'Delivery request created', 2],

  // D2 - CONFIRMED (CARD paid)
  [2, null, 'PENDING', C2, 'Delivery request created', 5],
  [2, 'PENDING', 'CONFIRMED', ADMIN, 'Auto-confirmed on payment', 4],

  // D3 - ASSIGNED to Randy (cash on delivery)
  [3, null, 'PENDING', C3, 'Delivery request created', 6],
  [3, 'PENDING', 'CONFIRMED', ADMIN, 'Delivery confirmed', 5],
  [3, 'CONFIRMED', 'ASSIGNED', ADMIN, 'Assigned to rider Randy', 3],

  // D4 - PICKED_UP by Rita
  [4, null, 'PENDING', C1, 'Delivery request created', 8],
  [4, 'PENDING', 'CONFIRMED', ADMIN, 'Auto-confirmed on payment', 7],
  [4, 'CONFIRMED', 'ASSIGNED', ADMIN, 'Assigned to rider Rita', 4],
  [4, 'ASSIGNED', 'PICKED_UP', R2, 'Package collected from sender', 2],

  // D5 - IN_TRANSIT with Milo
  [5, null, 'PENDING', C2, 'Delivery request created', 5],
  [5, 'PENDING', 'CONFIRMED', ADMIN, 'Delivery confirmed', 4],
  [5, 'CONFIRMED', 'ASSIGNED', ADMIN, 'Assigned to rider Milo', 3],
  [5, 'ASSIGNED', 'PICKED_UP', R4, 'Package collected from sender', 2],
  [5, 'PICKED_UP', 'IN_TRANSIT', R4, 'En route to drop-off', 1],

  // D6 - DELIVERED by Rita
  [6, null, 'PENDING', C3, 'Delivery request created', 34],
  [6, 'PENDING', 'CONFIRMED', ADMIN, 'Auto-confirmed on payment', 33],
  [6, 'CONFIRMED', 'ASSIGNED', ADMIN, 'Assigned to rider Rita', 30],
  [6, 'ASSIGNED', 'PICKED_UP', R2, 'Package collected from sender', 28],
  [6, 'PICKED_UP', 'IN_TRANSIT', R2, 'En route to drop-off', 27],
  [6, 'IN_TRANSIT', 'DELIVERED', R2, 'Delivered and signed for', 25],

  // D7 - DELIVERED by Randy
  [7, null, 'PENDING', C1, 'Delivery request created', 56],
  [7, 'PENDING', 'CONFIRMED', ADMIN, 'Auto-confirmed on payment', 55],
  [7, 'CONFIRMED', 'ASSIGNED', ADMIN, 'Assigned to rider Randy', 52],
  [7, 'ASSIGNED', 'PICKED_UP', R1, 'Package collected from sender', 50],
  [7, 'PICKED_UP', 'IN_TRANSIT', R1, 'En route to drop-off', 49],
  [7, 'IN_TRANSIT', 'DELIVERED', R1, 'Delivered and signed for', 47],

  // D8 - CANCELLED
  [8, null, 'PENDING', C2, 'Delivery request created', 24],
  [8, 'PENDING', 'CANCELLED', C2, 'Customer cancelled before pickup', 20],
];

const hoursAgo = (h) => new Date(Date.now() - h * 60 * 60 * 1000);

// The chain must end exactly at the delivery's current status, and every step
// must be a legal transition (PENDING -> CONFIRMED -> ASSIGNED -> PICKED_UP ->
// IN_TRANSIT -> DELIVERED, or PENDING/CONFIRMED -> CANCELLED).
const EXPECTED_LAST = {
  1: 'PENDING',
  2: 'CONFIRMED',
  3: 'ASSIGNED',
  4: 'PICKED_UP',
  5: 'IN_TRANSIT',
  6: 'DELIVERED',
  7: 'DELIVERED',
  8: 'CANCELLED',
};

module.exports = {
  async up(queryInterface) {
    const rows = HISTORY.map((row, i) => {
      const [deliverySuffix, fromStatus, toStatus, changedBy, note, hours] = row;
      return {
        id: H(i + 1),
        deliveryId: D(deliverySuffix),
        fromStatus,
        toStatus,
        changedBy,
        note,
        createdAt: hoursAgo(hours),
        updatedAt: hoursAgo(hours),
      };
    });

    for (const suffix of Object.keys(EXPECTED_LAST)) {
      const chain = HISTORY.filter((row) => row[0] === Number(suffix));
      const last = chain[chain.length - 1][2];
      if (last !== EXPECTED_LAST[suffix]) {
        throw new Error(
          `Seeded history for delivery D${suffix} ends at ${last}, ` +
            `expected ${EXPECTED_LAST[suffix]}`
        );
      }
      for (const row of chain) {
        if (row[1] === null) continue;
        const allowed = {
          PENDING: ['CONFIRMED', 'CANCELLED'],
          CONFIRMED: ['ASSIGNED', 'CANCELLED'],
          ASSIGNED: ['PICKED_UP', 'CONFIRMED', 'CANCELLED'],
          PICKED_UP: ['IN_TRANSIT'],
          IN_TRANSIT: ['DELIVERED'],
          DELIVERED: [],
          CANCELLED: [],
        }[row[1]];
        if (!allowed.includes(row[2])) {
          throw new Error(
            `Seeded history for delivery D${suffix} has invalid ` +
              `transition ${row[1]} -> ${row[2]}`
          );
        }
      }
    }

    await queryInterface.bulkInsert('delivery_status_history', rows);
  },

  async down(queryInterface) {
    const ids = HISTORY.map((_, i) => H(i + 1));
    await queryInterface.bulkDelete(
      'delivery_status_history',
      { id: { [Op.in]: ids } },
      {}
    );
  },
};