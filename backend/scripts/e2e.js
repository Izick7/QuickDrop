'use strict';

/**
 * Stage 2D end-to-end suite. Requires:
 *   1. a fresh database (`npm run db:reset`)
 *   2. the API running (`npm start`)
 * Run with: `node scripts/e2e.js` (or `npm run test:e2e`)
 *
 * Every API interaction is performed over HTTP. The database is touched only to
 * (a) verify the dashboard's numbers against reality, (b) restore admin
 * accounts mutated by the account-rule scenarios so the run stays re-runnable,
 * and (c) run the final invariant sweep.
 *
 * Prints PASS/FAIL per step and exits non-zero if anything failed.
 */

require('dotenv').config();

const { Op, fn, col } = require('sequelize');
const {
  sequelize,
  User,
  Delivery,
  Payment,
  RiderProfile,
  DeliveryStatusHistory,
} = require('../src/config/database');
const {
  DELIVERY_TRANSITIONS,
  ADMIN_EXTRA_TRANSITIONS,
} = require('../src/constants/deliveryTransitions');
const {
  DELIVERY_STATUSES,
  AVAILABILITIES,
  ROLES,
} = require('../src/constants/enums');

const BASE_URL =
  process.env.E2E_BASE_URL ||
  `http://localhost:${process.env.PORT || 5000}`;

const PASSWORD = 'Password123!';
const DUMMY_ID = '00000000-0000-4000-8000-000000000000';

const SEED_ADMIN = 'admin@quikdrop.test';
const SEEDED_DELIVERY = {
  d2: '55555555-5555-4555-8555-555555555502', // CONFIRMED, unassigned
  d7: '55555555-5555-4555-8555-555555555507', // DELIVERED
  d8: '55555555-5555-4555-8555-555555555508', // CANCELLED
};

let passed = 0;
let failed = 0;
let passwordHashLeak = null;
const createdAdminIds = [];

function record(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${name}${detail ? ` -> ${detail}` : ''}`);
  }
  return ok;
}

async function request(method, path, { token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });

  const text = await response.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch (err) {
    json = null;
  }

  if (text.includes('passwordHash') && !passwordHashLeak) {
    passwordHashLeak = `${method} ${path} (status ${response.status})`;
  }

  return { status: response.status, json, text };
}

const data = (res) => (res.json && res.json.data ? res.json.data : {});

function expectStatus(res, expected, name) {
  return record(
    name,
    res.status === expected,
    `expected ${expected}, got ${res.status} ${res.text.slice(0, 160)}`
  );
}

async function login(email, password = PASSWORD) {
  const res = await request('POST', '/api/auth/login', {
    body: { email, password },
  });
  return { token: data(res).token, status: res.status };
}

async function registerCustomer(stamp, tag) {
  const email = `e2e.cust.${tag}.${stamp}@quikdrop.test`;
  const res = await request('POST', '/api/auth/register', {
    body: {
      fullName: `E2E Cust ${tag}`,
      email,
      phone: '+254700400001',
      password: PASSWORD,
    },
  });
  return { token: data(res).token, email, id: data(res).user.id };
}

async function registerRider(stamp, tag) {
  const email = `e2e.rider.${tag}.${stamp}@quikdrop.test`;
  const res = await request('POST', '/api/auth/register', {
    body: {
      fullName: `E2E Rider ${tag}`,
      email,
      phone: '+254700400002',
      password: PASSWORD,
      role: 'RIDER',
      vehicleType: 'Motorcycle',
      plateNumber: `E2E ${tag}`.slice(0, 20),
    },
  });
  return { token: data(res).token, email, id: data(res).user.id };
}

async function setAvailable(token) {
  return request('PATCH', '/api/rider/availability', {
    token,
    body: { availability: 'AVAILABLE' },
  });
}

function sampleDelivery(overrides = {}) {
  return {
    pickupAddress: '1 E2E Pickup Road',
    pickupContactName: 'Pickup Person',
    pickupContactPhone: '+254700500001',
    dropoffAddress: '2 E2E Dropoff Road',
    dropoffContactName: 'Dropoff Person',
    dropoffContactPhone: '+254700500002',
    packageDescription: 'E2E package',
    ...overrides,
  };
}

async function createDelivery(token, overrides) {
  const res = await request('POST', '/api/deliveries', {
    token,
    body: sampleDelivery(overrides),
  });
  return data(res).delivery;
}

async function pay(token, deliveryId, method) {
  return request('POST', `/api/deliveries/${deliveryId}/payments`, {
    token,
    body: { method },
  });
}

async function confirmedDelivery(token, overrides) {
  const delivery = await createDelivery(token, overrides);
  await pay(token, delivery.id, 'CARD');
  return delivery.id;
}

async function riderStatus(token, deliveryId, status) {
  return request('PATCH', `/api/rider/deliveries/${deliveryId}/status`, {
    token,
    body: { status },
  });
}

/* ------------------------------------------------------------------ *
 * Verification helpers (read-only database access)
 * ------------------------------------------------------------------ */
async function checkDashboardAgainstDb(adminToken) {
  const res = await request('GET', '/api/admin/dashboard', { token: adminToken });
  if (res.status !== 200) {
    return `dashboard returned ${res.status}`;
  }
  const stats = data(res);
  const problems = [];

  const statusRows = await Delivery.findAll({
    attributes: ['status', [fn('COUNT', col('id')), 'count']],
    group: ['status'],
    raw: true,
  });
  const dbByStatus = {};
  for (const row of statusRows) dbByStatus[row.status] = Number(row.count);
  for (const status of DELIVERY_STATUSES) {
    const api = stats.deliveries.byStatus[status];
    const db = dbByStatus[status] || 0;
    if (api !== db) problems.push(`deliveries.byStatus.${status}: api=${api} db=${db}`);
  }
  const totalDeliveries = await Delivery.count();
  if (stats.deliveries.total !== totalDeliveries) {
    problems.push(`deliveries.total: api=${stats.deliveries.total} db=${totalDeliveries}`);
  }

  const availRows = await RiderProfile.findAll({
    attributes: ['availability', [fn('COUNT', col('id')), 'count']],
    group: ['availability'],
    raw: true,
  });
  for (const row of availRows) {
    const api = stats.riders.byAvailability[row.availability];
    const db = Number(row.count);
    if (api !== db) problems.push(`riders.${row.availability}: api=${api} db=${db}`);
  }

  const roleRows = await User.findAll({
    attributes: ['role', [fn('COUNT', col('id')), 'count']],
    group: ['role'],
    raw: true,
  });
  for (const row of roleRows) {
    const api = stats.users.byRole[row.role];
    const db = Number(row.count);
    if (api !== db) problems.push(`users.${row.role}: api=${api} db=${db}`);
  }

  const revenue = await Payment.sum('amount', { where: { status: 'SUCCESSFUL' } });
  const dbRevenue = revenue === null ? 0 : Number(revenue);
  if (Number(stats.revenue.successfulTotal) !== dbRevenue) {
    problems.push(`revenue: api=${stats.revenue.successfulTotal} db=${dbRevenue}`);
  }

  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const dbCreatedToday = await Delivery.count({
    where: { createdAt: { [Op.gte]: startOfDay } },
  });
  if (stats.deliveries.createdToday !== dbCreatedToday) {
    problems.push(
      `deliveries.createdToday: api=${stats.deliveries.createdToday} db=${dbCreatedToday}`
    );
  }

  return problems.length ? problems.join('; ') : null;
}

async function checkInvariants(label) {
  const violations = [];

  const allDeliveries = await Delivery.findAll({ order: [['createdAt', 'ASC']] });
  const allProfiles = await RiderProfile.findAll();

  for (const d of allDeliveries) {
    if (['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'].includes(d.status)) {
      if (!d.riderId) violations.push(`active delivery ${d.id} has no rider`);
    } else if (d.riderId && d.status !== 'DELIVERED') {
      violations.push(`${d.status} delivery ${d.id} still has a rider`);
    }

    if (d.status === 'DELIVERED') {
      const paid = await Payment.count({
        where: { deliveryId: d.id, status: 'SUCCESSFUL' },
      });
      if (paid === 0) {
        violations.push(`delivered delivery ${d.id} has no successful payment`);
      }
    }
    if (d.status === 'CANCELLED') {
      const outstanding = await Payment.count({
        where: { deliveryId: d.id, status: { [Op.notIn]: ['REFUNDED', 'FAILED'] } },
      });
      if (outstanding > 0) {
        violations.push(`cancelled delivery ${d.id} has unrefunded payments`);
      }
    }

    const history = await DeliveryStatusHistory.findAll({
      where: { deliveryId: d.id },
      order: [['createdAt', 'ASC']],
    });
    if (history.length === 0) {
      violations.push(`delivery ${d.id} has no status history`);
      continue;
    }
    if (history[history.length - 1].toStatus !== d.status) {
      violations.push(
        `delivery ${d.id} history ends at ${history[history.length - 1].toStatus} but status is ${d.status}`
      );
    }
    let expectedFrom = null;
    for (const entry of history) {
      if (entry.fromStatus !== expectedFrom) {
        violations.push(
          `delivery ${d.id} history chain broken around ${entry.fromStatus} -> ${entry.toStatus}`
        );
        break;
      }
      if (entry.fromStatus !== null) {
        const allowed = [
          ...(DELIVERY_TRANSITIONS[entry.fromStatus] || []),
          ...(ADMIN_EXTRA_TRANSITIONS[entry.fromStatus] || []),
        ];
        if (!allowed.includes(entry.toStatus)) {
          violations.push(
            `delivery ${d.id} history has invalid transition ${entry.fromStatus} -> ${entry.toStatus}`
          );
          break;
        }
      }
      expectedFrom = entry.toStatus;
    }
  }

  for (const profile of allProfiles) {
    const count = await Delivery.count({
      where: { riderId: profile.userId, status: { [Op.in]: ['ASSIGNED', 'PICKED_UP', 'IN_TRANSIT'] } },
    });
    if (count > 1) violations.push(`rider ${profile.userId} has ${count} active deliveries`);
    if (profile.availability === 'BUSY' && count !== 1) {
      violations.push(`BUSY rider ${profile.userId} does not have exactly one active delivery`);
    }
    if (count > 0 && profile.availability !== 'BUSY') {
      violations.push(`rider ${profile.userId} has active work but is ${profile.availability}`);
    }
  }

  record(`invariants hold: ${label}`, violations.length === 0, violations.join('; '));
  return violations;
}

async function activeAdminCount() {
  return User.count({ where: { role: 'ADMIN', status: 'ACTIVE' } });
}

// Suspend every active admin except the given ids (over HTTP), so account-rule
// scenarios always start from a deterministic set of active admins even when
// earlier runs left test-created admins behind.
async function suspendExtraActiveAdmins(adminToken, keepIds) {
  const active = [];
  for (let page = 1; ; page += 1) {
    const res = await request(
      'GET',
      `/api/admin/users?role=ADMIN&status=ACTIVE&limit=100&page=${page}`,
      { token: adminToken }
    );
    if (res.status !== 200) return;
    const body = data(res);
    active.push(...(body.items || []));
    const pagination = body.pagination;
    if (!pagination || page >= pagination.totalPages) break;
  }
  for (const user of active) {
    if (!keepIds.includes(user.id)) {
      await request('PATCH', `/api/admin/users/${user.id}`, {
        token: adminToken,
        body: { status: 'SUSPENDED' },
      });
    }
  }
}

/* ------------------------------------------------------------------ *
 * Scenarios
 * ------------------------------------------------------------------ */
const ADMIN_ENDPOINTS = [
  ['GET', '/api/admin/dashboard', undefined],
  ['GET', '/api/admin/users', undefined],
  ['POST', '/api/admin/users', {}],
  ['GET', `/api/admin/users/${DUMMY_ID}`, undefined],
  ['PATCH', `/api/admin/users/${DUMMY_ID}`, {}],
  ['GET', '/api/admin/riders', undefined],
  ['GET', `/api/admin/riders/${DUMMY_ID}`, undefined],
  ['GET', '/api/admin/deliveries', undefined],
  ['GET', `/api/admin/deliveries/${DUMMY_ID}`, undefined],
  ['POST', `/api/admin/deliveries/${DUMMY_ID}/confirm`, {}],
  ['POST', `/api/admin/deliveries/${DUMMY_ID}/assign`, {}],
  ['POST', `/api/admin/deliveries/${DUMMY_ID}/reassign`, {}],
  ['POST', `/api/admin/deliveries/${DUMMY_ID}/cancel`, {}],
  ['GET', '/api/admin/payments', undefined],
  ['PATCH', `/api/admin/payments/${DUMMY_ID}/status`, {}],
];

async function permissionMatrix(customerToken, riderToken) {
  const problems = { customer: [], rider: [], anon: [] };

  for (const [method, path, body] of ADMIN_ENDPOINTS) {
    const asCustomer = await request(method, path, {
      token: customerToken,
      body,
    });
    if (asCustomer.status !== 403) {
      problems.customer.push(`${method} ${path}=${asCustomer.status}`);
    }

    const asRider = await request(method, path, { token: riderToken, body });
    if (asRider.status !== 403) {
      problems.rider.push(`${method} ${path}=${asRider.status}`);
    }

    const anon = await request(method, path, { body });
    if (anon.status !== 401) {
      problems.anon.push(`${method} ${path}=${anon.status}`);
    }
  }

  record(
    'every admin route rejects a CUSTOMER with 403',
    problems.customer.length === 0,
    problems.customer.join(', ')
  );
  record(
    'every admin route rejects a RIDER with 403',
    problems.rider.length === 0,
    problems.rider.join(', ')
  );
  record(
    'every admin route rejects a missing token with 401',
    problems.anon.length === 0,
    problems.anon.join(', ')
  );
}

async function main() {
  const stamp = Date.now();
  console.log(`E2E testing ${BASE_URL}\n`);

  const seededAdmin = await login(SEED_ADMIN);
  const adminToken = seededAdmin.token;
  record('admin can log in', Boolean(adminToken));

  const permCustomer = await registerCustomer(stamp, 'perm');
  const permRider = await registerRider(stamp, 'perm');
  record('setup: permission probes registered', Boolean(permCustomer.token && permRider.token));

  /* ---------------- 1. permission matrix ---------------- */
  await permissionMatrix(permCustomer.token, permRider.token);

  /* ---------------- 2. main flow ---------------- */
  const custMain = await registerCustomer(stamp, 'main');
  const riderMain = await registerRider(stamp, 'main');
  await setAvailable(riderMain.token);

  const mainDelivery = await createDelivery(custMain.token, { packageWeightKg: 3 });
  record(
    'main flow: create delivery -> PENDING with server-side price',
    mainDelivery.status === 'PENDING' && mainDelivery.price === 350,
    `status ${mainDelivery.status} price ${mainDelivery.price}`
  );

  let res = await pay(custMain.token, mainDelivery.id, 'CARD');
  expectStatus(res, 201, 'main flow: CARD payment -> 201');

  res = await request('POST', `/api/admin/deliveries/${mainDelivery.id}/assign`, {
    token: adminToken,
    body: { riderId: riderMain.id },
  });
  expectStatus(res, 200, 'main flow: admin assigns rider -> 200');

  let profile = data(
    await request('GET', '/api/rider/profile', { token: riderMain.token })
  ).profile;
  record('main flow: rider becomes BUSY after assign', profile.availability === 'BUSY');

  res = await request('PATCH', `/api/admin/users/${riderMain.id}`, {
    token: adminToken,
    body: { status: 'SUSPENDED' },
  });
  expectStatus(res, 409, 'suspend a rider with an active delivery -> 409');

  for (const status of ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
    res = await riderStatus(riderMain.token, mainDelivery.id, status);
    record(
      `main flow: rider sets ${status} -> 200`,
      res.status === 200,
      `got ${res.status}`
    );
  }

  res = await request('GET', `/api/deliveries/${mainDelivery.id}`, {
    token: custMain.token,
  });
  const seen = data(res).delivery;
  const mainPayment = (seen.payments || [])[0];
  const history = seen.statusHistory || [];
  record(
    'main flow: customer sees DELIVERED + SUCCESSFUL payment + full history',
    res.status === 200 &&
      seen.status === 'DELIVERED' &&
      mainPayment &&
      mainPayment.status === 'SUCCESSFUL' &&
      history.length === 6 &&
      history[history.length - 1].toStatus === 'DELIVERED',
    `status ${seen.status} payment ${mainPayment && mainPayment.status} history ${history.length}`
  );

  profile = data(
    await request('GET', '/api/rider/profile', { token: riderMain.token })
  ).profile;
  record('main flow: rider freed after delivery -> AVAILABLE', profile.availability === 'AVAILABLE');

  res = await request('POST', `/api/admin/deliveries/${mainDelivery.id}/cancel`, {
    token: adminToken,
    body: { reason: 'too late' },
  });
  expectStatus(res, 409, 'admin modifies a DELIVERED delivery -> 409');

  res = await request('PATCH', `/api/admin/payments/${mainPayment.id}/status`, {
    token: adminToken,
    body: { status: 'SUCCESSFUL' },
  });
  expectStatus(res, 409, 'admin modifies a payment on a DELIVERED delivery -> 409');

  /* ---------------- 3. rider self-accept + CASH ---------------- */
  const custCash = await registerCustomer(stamp, 'cash');
  const riderCash = await registerRider(stamp, 'cash');
  await setAvailable(riderCash.token);

  const cashDelivery = await createDelivery(custCash.token, { packageWeightKg: 2 });
  res = await pay(custCash.token, cashDelivery.id, 'CASH');
  record(
    'cash flow: CASH payment -> 201 PENDING and delivery CONFIRMED',
    res.status === 201 && data(res).payment.status === 'PENDING',
    `status ${res.status}`
  );

  res = await request('GET', '/api/rider/deliveries/available', {
    token: riderCash.token,
  });
  record(
    'cash flow: rider sees the delivery in the marketplace',
    res.status === 200 &&
      (data(res).items || []).some((d) => d.id === cashDelivery.id),
    `status ${res.status}`
  );

  res = await request('POST', `/api/rider/deliveries/${cashDelivery.id}/accept`, {
    token: riderCash.token,
  });
  record('cash flow: rider self-accept -> 200', res.status === 200, `got ${res.status}`);

  for (const status of ['PICKED_UP', 'IN_TRANSIT', 'DELIVERED']) {
    await riderStatus(riderCash.token, cashDelivery.id, status);
  }
  res = await request('GET', `/api/deliveries/${cashDelivery.id}`, {
    token: custCash.token,
  });
  const cashPayment = (data(res).delivery.payments || [])[0];
  record(
    'cash flow: COD payment settles on delivery',
    data(res).delivery.status === 'DELIVERED' && cashPayment.status === 'SUCCESSFUL',
    `payment ${cashPayment && cashPayment.status}`
  );

  /* ---------------- 4. admin confirm without payment ---------------- */
  const custConfirm = await registerCustomer(stamp, 'confirm');
  const unpaid = await createDelivery(custConfirm.token, { packageWeightKg: 1 });
  record('setup: unpaid delivery is PENDING', unpaid.status === 'PENDING');
  res = await request('POST', `/api/admin/deliveries/${unpaid.id}/confirm`, {
    token: adminToken,
  });
  expectStatus(res, 409, 'admin confirm without a payment -> 409');

  /* ---------------- 5. customer cannot cancel an in-transit delivery ---------------- */
  const custCancel = await registerCustomer(stamp, 'cancel');
  const riderCancel = await registerRider(stamp, 'cancel');
  await setAvailable(riderCancel.token);

  const cancelDelivery = await createDelivery(custCancel.token, { packageWeightKg: 1 });
  await pay(custCancel.token, cancelDelivery.id, 'CARD');
  await request('POST', `/api/admin/deliveries/${cancelDelivery.id}/assign`, {
    token: adminToken,
    body: { riderId: riderCancel.id },
  });
  await riderStatus(riderCancel.token, cancelDelivery.id, 'PICKED_UP');
  await riderStatus(riderCancel.token, cancelDelivery.id, 'IN_TRANSIT');

  res = await request('POST', `/api/deliveries/${cancelDelivery.id}/cancel`, {
    token: custCancel.token,
    body: { reason: 'changed my mind' },
  });
  expectStatus(res, 409, 'customer cancels an IN_TRANSIT delivery -> 409');

  res = await request('POST', `/api/admin/deliveries/${cancelDelivery.id}/cancel`, {
    token: adminToken,
    body: { reason: 'driver reported an accident' },
  });
  const cancelPayment = await Payment.findOne({
    where: { deliveryId: cancelDelivery.id },
  });
  const freedProfile = await RiderProfile.findOne({
    where: { userId: riderCancel.id },
  });
  const cancelledRow = await Delivery.findByPk(cancelDelivery.id);
  record(
    'admin cancels an IN_TRANSIT delivery -> rider freed, payment refunded',
    res.status === 200 &&
      cancelledRow.status === 'CANCELLED' &&
      cancelledRow.riderId === null &&
      cancelPayment.status === 'REFUNDED' &&
      freedProfile.availability === 'AVAILABLE',
    `status ${res.status} payment ${cancelPayment.status} rider ${cancelledRow.riderId}`
  );

  /* ---------------- 6. reassignment ---------------- */
  const custReassign = await registerCustomer(stamp, 'reassign');
  const riderA = await registerRider(stamp, 'riderA');
  const riderB = await registerRider(stamp, 'riderB');
  await setAvailable(riderA.token);
  await setAvailable(riderB.token);

  const reassignId = await confirmedDelivery(custReassign.token, { packageWeightKg: 1 });
  await request('POST', `/api/admin/deliveries/${reassignId}/assign`, {
    token: adminToken,
    body: { riderId: riderA.id },
  });

  res = await request('POST', `/api/admin/deliveries/${reassignId}/reassign`, {
    token: adminToken,
    body: { riderId: riderB.id },
  });
  const oldProfile = await RiderProfile.findOne({ where: { userId: riderA.id } });
  const newProfile = await RiderProfile.findOne({ where: { userId: riderB.id } });
  const reassignedRow = await Delivery.findByPk(reassignId);
  record(
    'admin reassign moves the delivery and frees the old rider',
    res.status === 200 &&
      reassignedRow.riderId === riderB.id &&
      oldProfile.availability === 'AVAILABLE' &&
      newProfile.availability === 'BUSY',
    `status ${res.status} rider ${reassignedRow.riderId} old ${oldProfile.availability} new ${newProfile.availability}`
  );

  res = await riderStatus(riderB.token, reassignId, 'PICKED_UP');
  expectStatus(res, 200, 'new rider picks up -> 200');

  res = await request('POST', `/api/admin/deliveries/${reassignId}/reassign`, {
    token: adminToken,
    body: { riderId: riderA.id },
  });
  expectStatus(res, 409, 'reassign a PICKED_UP delivery -> 409');

  res = await request('POST', `/api/admin/deliveries/${reassignId}/reassign`, {
    token: adminToken,
    body: { riderId: riderB.id },
  });
  expectStatus(res, 409, 'reassign a delivery to its own rider -> 409');

  /* ---------------- 7. payment rules ---------------- */
  // a) refund a PENDING payment -> 409
  const custPay = await registerCustomer(stamp, 'pay');
  const pendingDelivery = await createDelivery(custPay.token, { packageWeightKg: 1 });
  res = await pay(custPay.token, pendingDelivery.id, 'CASH');
  const pendingPayment = data(res).payment;
  res = await request('PATCH', `/api/admin/payments/${pendingPayment.id}/status`, {
    token: adminToken,
    body: { status: 'REFUNDED' },
  });
  expectStatus(res, 409, 'refund a PENDING payment -> 409');

  // b) refund a payment on a live delivery -> 409
  const liveDelivery = await createDelivery(custPay.token, { packageWeightKg: 1 });
  res = await pay(custPay.token, liveDelivery.id, 'CARD');
  const livePayment = data(res).payment;
  res = await request('PATCH', `/api/admin/payments/${livePayment.id}/status`, {
    token: adminToken,
    body: { status: 'REFUNDED' },
  });
  expectStatus(res, 409, 'refund a payment on a live delivery -> 409');

  // c) second successful payment -> 409
  res = await pay(custPay.token, liveDelivery.id, 'CARD');
  expectStatus(res, 409, 'second successful payment -> 409');

  // d) marking a PENDING payment SUCCESSFUL -> 200
  res = await request('PATCH', `/api/admin/payments/${pendingPayment.id}/status`, {
    token: adminToken,
    body: { status: 'SUCCESSFUL' },
  });
  const updatedPayment = await Payment.findByPk(pendingPayment.id);
  record(
    'admin marks a PENDING payment SUCCESSFUL -> 200 with reference and paidAt',
    res.status === 200 &&
      updatedPayment.status === 'SUCCESSFUL' &&
      Boolean(updatedPayment.reference) &&
      Boolean(updatedPayment.paidAt),
    `status ${res.status} status ${updatedPayment.status}`
  );

  // e) an unsupported status change -> 409
  res = await request('PATCH', `/api/admin/payments/${pendingPayment.id}/status`, {
    token: adminToken,
    body: { status: 'PENDING' },
  });
  expectStatus(res, 409, 'unsupported payment status change -> 409');

  /* ---------------- 8. suspended customer token ---------------- */
  const custSuspended = await registerCustomer(stamp, 'suspended');
  res = await request('PATCH', `/api/admin/users/${custSuspended.id}`, {
    token: adminToken,
    body: { status: 'SUSPENDED' },
  });
  expectStatus(res, 200, 'admin suspends a customer -> 200');
  res = await request('GET', '/api/deliveries', { token: custSuspended.token });
  expectStatus(res, 401, "suspended customer's token -> 401");

  /* ---------------- 9. admin account rules ---------------- */
  res = await request('POST', '/api/admin/users', {
    token: adminToken,
    body: {
      fullName: 'Second Admin',
      email: `e2e.admin.${stamp}@quikdrop.test`,
      phone: '+254700400003',
      password: PASSWORD,
      role: 'ADMIN',
    },
  });
  expectStatus(res, 201, 'admin creates a second admin -> 201');
  const admin2Id = data(res).user && data(res).user.id;
  if (admin2Id) createdAdminIds.push(admin2Id);

  const admin2 = await login(`e2e.admin.${stamp}@quikdrop.test`);
  record('second admin can log in', Boolean(admin2.token));

  res = await request('GET', `/api/admin/users/${admin2Id}`, { token: adminToken });
  record(
    'admin get user -> 200 with delivery counts',
    res.status === 200 && Boolean(data(res).user.deliveryCounts),
    `status ${res.status}`
  );

  const admin1Id = data(
    await request('GET', '/api/auth/me', { token: adminToken })
  ).user.id;

  // a) admin cannot change own status
  res = await request('PATCH', `/api/admin/users/${admin1Id}`, {
    token: adminToken,
    body: { status: 'SUSPENDED' },
  });
  record(
    'admin suspends self -> 409',
    res.status === 409 && res.text.includes('own status'),
    `status ${res.status} ${res.text.slice(0, 120)}`
  );

  // b) two admins suspending each other, 5 rounds: exactly one wins, the loser
  //    is blocked by the last-active-admin guard, and at least one stays active
  await suspendExtraActiveAdmins(adminToken, [admin1Id, admin2Id]);
  let raceOk = true;
  const raceDetails = [];
  for (let round = 1; round <= 5 && raceOk; round += 1) {
    const beforeRace = await activeAdminCount();
    const race = await Promise.all([
      request('PATCH', `/api/admin/users/${admin2Id}`, {
        token: adminToken,
        body: { status: 'SUSPENDED' },
      }),
      request('PATCH', `/api/admin/users/${admin1Id}`, {
        token: admin2.token,
        body: { status: 'SUSPENDED' },
      }),
    ]);
    const wins = race.filter((r) => r.status === 200);
    const losses = race.filter((r) => r.status === 409);
    const inFlight = await activeAdminCount();
    const roundOk =
      beforeRace === 2 &&
      wins.length === 1 &&
      losses.length === 1 &&
      losses[0].text.includes('last active admin') &&
      inFlight === 1;
    if (!roundOk) {
      raceOk = false;
      raceDetails.push(
        `round ${round}: before=${beforeRace} statuses=${race
          .map((r) => r.status)
          .join(',')} activeAfter=${inFlight} msg=${
          losses[0] ? losses[0].text.slice(0, 140) : 'n/a'
        }`
      );
    }
    await User.update(
      { status: 'ACTIVE' },
      { where: { id: { [Op.in]: [admin1Id, admin2Id] } } }
    );
  }
  record(
    'two admins suspending each other (5 rounds): one 200, one 409 last-active-admin, >=1 stays active',
    raceOk,
    raceDetails.join('; ') || undefined
  );

  // c) an INACTIVE admin may be moved to SUSPENDED even when only one admin is
  //    active: the last-admin guard only applies to currently-ACTIVE admins
  await User.update({ status: 'INACTIVE' }, { where: { id: admin2Id } });
  const activeBeforeInactiveTest = await activeAdminCount();
  res = await request('PATCH', `/api/admin/users/${admin2Id}`, {
    token: adminToken,
    body: { status: 'SUSPENDED' },
  });
  record(
    'INACTIVE admin -> SUSPENDED allowed with one active admin -> 200',
    res.status === 200 && activeBeforeInactiveTest === 1,
    `status ${res.status} activeAdmins=${activeBeforeInactiveTest} ${res.text.slice(0, 120)}`
  );

  // restore both admins so the run stays re-runnable
  await User.update({ status: 'ACTIVE' }, { where: { id: { [Op.in]: [admin1Id, admin2Id] } } });

  // d) role is immutable
  res = await request('PATCH', `/api/admin/users/${admin2Id}`, {
    token: adminToken,
    body: { role: 'CUSTOMER' },
  });
  expectStatus(res, 400, 'admin tries to change a role -> 400');

  // e) an admin cannot create another admin-less rider without vehicle details
  res = await request('POST', '/api/admin/users', {
    token: adminToken,
    body: {
      fullName: 'Broken Rider',
      email: `e2e.broken.${stamp}@quikdrop.test`,
      phone: '+254700400004',
      password: PASSWORD,
      role: 'RIDER',
    },
  });
  expectStatus(res, 400, 'admin creates a rider without vehicle details -> 400');

  res = await request('POST', '/api/admin/users', {
    token: adminToken,
    body: {
      fullName: 'E2E Admin Rider',
      email: `e2e.adminrider.${stamp}@quikdrop.test`,
      phone: '+254700400005',
      password: PASSWORD,
      role: 'RIDER',
      vehicleType: 'Van',
      plateNumber: 'E2E VAN',
    },
  });
  expectStatus(res, 201, 'admin creates a rider -> 201');
  const adminRiderId = data(res).user && data(res).user.id;
  const adminRiderProfile = await RiderProfile.findOne({ where: { userId: adminRiderId } });
  record(
    'admin-created rider gets a rider profile in the same transaction',
    Boolean(adminRiderProfile) && adminRiderProfile.availability === 'OFFLINE',
    adminRiderProfile ? adminRiderProfile.availability : 'missing'
  );

  /* ---------------- 10. concurrent reassignment swap ---------------- */
  const custSwap = await registerCustomer(stamp, 'swap');
  const riderSwapA = await registerRider(stamp, 'swapA');
  const riderSwapB = await registerRider(stamp, 'swapB');
  await setAvailable(riderSwapA.token);
  await setAvailable(riderSwapB.token);

  const swapX = await confirmedDelivery(custSwap.token, { packageWeightKg: 1 });
  const swapY = await confirmedDelivery(custSwap.token, { packageWeightKg: 1 });
  await request('POST', `/api/admin/deliveries/${swapX}/assign`, {
    token: adminToken,
    body: { riderId: riderSwapA.id },
  });
  await request('POST', `/api/admin/deliveries/${swapY}/assign`, {
    token: adminToken,
    body: { riderId: riderSwapB.id },
  });

  const swapResults = await Promise.all([
    request('POST', `/api/admin/deliveries/${swapX}/reassign`, {
      token: adminToken,
      body: { riderId: riderSwapB.id },
    }),
    request('POST', `/api/admin/deliveries/${swapY}/reassign`, {
      token: adminToken,
      body: { riderId: riderSwapA.id },
    }),
  ]);
  const swapStatuses = swapResults.map((r) => r.status);
  record(
    'concurrent reassignment swap never returns 500',
    swapStatuses.every((s) => s === 200 || s === 409),
    `statuses=${swapStatuses.join(',')}`
  );

  /* ---------------- 11. admin list/detail endpoints ---------------- */
  res = await request('GET', '/api/admin/deliveries?limit=100', { token: adminToken });
  record(
    'admin lists deliveries with pagination',
    res.status === 200 && Array.isArray(data(res).items) && Boolean(data(res).pagination),
    `status ${res.status}`
  );

  res = await request('GET', `/api/admin/deliveries/${SEEDED_DELIVERY.d7}`, {
    token: adminToken,
  });
  const detail = data(res).delivery;
  record(
    'admin delivery detail includes customer, rider, payments and history',
    res.status === 200 &&
      Boolean(detail.customer) &&
      Boolean(detail.rider) &&
      Array.isArray(detail.payments) &&
      Array.isArray(detail.statusHistory),
    `status ${res.status}`
  );

  res = await request('GET', '/api/admin/riders?availability=AVAILABLE', { token: adminToken });
  record(
    'admin filters riders by availability',
    res.status === 200 &&
      (data(res).items || []).every(
        (r) => r.riderProfile.availability === 'AVAILABLE'
      ),
    `status ${res.status}`
  );

  res = await request('GET', `/api/admin/riders/${permRider.id}`, { token: adminToken });
  record(
    'admin rider detail -> 200 with delivery counts',
    res.status === 200 && Boolean(data(res).rider.deliveryCounts),
    `status ${res.status}`
  );

  res = await request('GET', '/api/admin/payments?status=SUCCESSFUL&limit=5', {
    token: adminToken,
  });
  record(
    'admin filters payments by status',
    res.status === 200 &&
      (data(res).items || []).every((p) => p.status === 'SUCCESSFUL'),
    `status ${res.status}`
  );

  res = await request('GET', '/api/admin/users?role=RIDER&limit=5', { token: adminToken });
  record(
    'admin filters users by role',
    res.status === 200 &&
      (data(res).items || []).every((u) => u.role === 'RIDER'),
    `status ${res.status}`
  );

  res = await request('GET', '/api/admin/deliveries?q=Ngong&limit=5', { token: adminToken });
  record('admin searches deliveries by address -> 200', res.status === 200, `status ${res.status}`);

  res = await request('GET', '/api/admin/deliveries?status=NOT_A_STATUS', {
    token: adminToken,
  });
  expectStatus(res, 400, 'admin delivery filter with a bad status -> 400');

  res = await request('POST', '/api/admin/deliveries', { token: adminToken, body: {} });
  expectStatus(res, 404, 'POST on the admin delivery collection -> 404 (no such route)');

  res = await request('GET', `/api/admin/deliveries/${SEEDED_DELIVERY.d8}`, {
    token: adminToken,
  });
  record(
    'admin can read a CANCELLED delivery',
    res.status === 200 && data(res).delivery.status === 'CANCELLED',
    `status ${res.status}`
  );

  /* ---------------- 12. dashboard + final sweep ---------------- */
  const dashboardProblem = await checkDashboardAgainstDb(adminToken);
  record(
    'dashboard numbers match the database',
    dashboardProblem === null,
    dashboardProblem || undefined
  );

  await checkInvariants('final');

  record(
    'no response ever contains passwordHash',
    passwordHashLeak === null,
    passwordHashLeak ? `leaked by ${passwordHashLeak}` : undefined
  );

  // Leave the seeded admin usable so the suite can simply be re-run.
  await User.update(
    { status: 'ACTIVE' },
    { where: { role: 'ADMIN', status: { [Op.ne]: 'ACTIVE' } } }
  );

  console.log(`\n${passed} passed, ${failed} failed`);
  return failed === 0 ? 0 : 1;
}

main()
  .then(async (code) => {
    await sequelize.close();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error('\nE2E test crashed:', err);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
