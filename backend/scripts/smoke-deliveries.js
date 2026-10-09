'use strict';

/**
 * End-to-end delivery/payment/rider smoke test. Requires:
 *   1. a fresh database (`npm run db:reset`)
 *   2. the API running (`npm start`)
 * Run with: `node scripts/smoke-deliveries.js`
 *
 * Covers the full happy paths, validation/permission failure cases, payment
 * rules, availability rules, four concurrency groups (including a 10-round
 * cancel/accept race) and a post-run invariant sweep performed directly
 * against the database with Sequelize.
 */

require('dotenv').config();

const { Op } = require('sequelize');
const {
  sequelize,
  Delivery,
  Payment,
  RiderProfile,
  DeliveryStatusHistory,
  User,
} = require('../src/config/database');
const deliveryService = require('../src/services/deliveryService');
const { ACTIVE_DELIVERY_STATUSES } = require('../src/constants/enums');

const BASE_URL =
  process.env.SMOKE_BASE_URL ||
  `http://localhost:${process.env.PORT || 5000}`;

const PASSWORD = 'SmokePass123';

// Seeded fixtures.
const SEED = {
  adminId: '11111111-1111-4111-8111-111111111111',
  carla: { email: 'carla@quikdrop.test', password: 'Password123!' },
  chris: { email: 'chris@quikdrop.test', password: 'Password123!' },
  randy: { email: 'randy.rider@quikdrop.test', password: 'Password123!' },
  rita: { email: 'rita.rider@quikdrop.test', password: 'Password123!' },
  d2: '55555555-5555-4555-8555-555555555502', // CONFIRMED, unassigned, chris
  d3: '55555555-5555-4555-8555-555555555503', // ASSIGNED to randy
  d7: '55555555-5555-4555-8555-555555555507', // DELIVERED, carla
  d8: '55555555-5555-4555-8555-555555555508', // CANCELLED, chris
};

let passed = 0;
let failed = 0;
let passwordHashLeak = null;
const testRiderIds = new Set();

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
  const email = `smoke.cust.${tag}.${stamp}@quikdrop.test`;
  await request('POST', '/api/auth/register', {
    body: { fullName: `Cust ${tag}`, email, phone: '+254700200001', password: PASSWORD },
  });
  const { token } = await login(email);
  return { token, email };
}

async function registerRider(stamp, tag) {
  const email = `smoke.rider.${tag}.${stamp}@quikdrop.test`;
  await request('POST', '/api/auth/register', {
    body: {
      fullName: `Rider ${tag}`,
      email,
      phone: '+254700200002',
      password: PASSWORD,
      role: 'RIDER',
      vehicleType: 'Motorcycle',
      plateNumber: `SMK ${tag}`.slice(0, 20),
    },
  });
  const { token } = await login(email);
  return { token, email };
}

function sampleDelivery(overrides = {}) {
  return {
    pickupAddress: '1 Test Pickup Road',
    pickupContactName: 'Pickup Person',
    pickupContactPhone: '+254700300001',
    dropoffAddress: '2 Test Dropoff Road',
    dropoffContactName: 'Dropoff Person',
    dropoffContactPhone: '+254700300002',
    packageDescription: 'Test package',
    ...overrides,
  };
}

async function createDelivery(token, overrides) {
  return request('POST', '/api/deliveries', {
    token,
    body: sampleDelivery(overrides),
  });
}

async function payDelivery(token, deliveryId, method) {
  return request('POST', `/api/deliveries/${deliveryId}/payments`, {
    token,
    body: { method },
  });
}

// Creates a delivery and captures it (CARD) so it becomes CONFIRMED, ready
// for a rider to accept.
async function confirmedDelivery(token, overrides) {
  const created = await createDelivery(token, overrides);
  const id = data(created).delivery && data(created).delivery.id;
  await payDelivery(token, id, 'CARD');
  return id;
}

async function setAvailable(token) {
  return request('PATCH', '/api/rider/availability', {
    token,
    body: { availability: 'AVAILABLE' },
  });
}

/* ------------------------------------------------------------------ *
 * Invariant sweep (Sequelize, directly against the DB)
 * ------------------------------------------------------------------ */
async function checkInvariants(label) {
  const violations = [];

  const active = await Delivery.findAll({
    where: { status: { [Op.in]: ACTIVE_DELIVERY_STATUSES } },
  });
  const cancelled = await Delivery.findAll({ where: { status: 'CANCELLED' } });
  const earlyWithRider = await Delivery.findAll({
    where: {
      status: { [Op.in]: ['PENDING', 'CONFIRMED'] },
      riderId: { [Op.ne]: null },
    },
  });
  const busyProfiles = await RiderProfile.findAll({
    where: { availability: 'BUSY' },
  });

  for (const d of active) {
    if (!d.riderId) violations.push(`active delivery ${d.id} has no rider`);
  }
  for (const d of cancelled) {
    if (d.riderId) violations.push(`cancelled delivery ${d.id} still has rider`);
  }
  for (const d of earlyWithRider) {
    violations.push(`${d.status} delivery ${d.id} already has a rider`);
  }
  for (const p of busyProfiles) {
    const count = await Delivery.count({
      where: { riderId: p.userId, status: { [Op.in]: ACTIVE_DELIVERY_STATUSES } },
    });
    if (count === 0) {
      violations.push(`BUSY rider ${p.userId} has no active delivery`);
    }
  }
  // Stricter, per-test-rider rules (the demo seed is intentionally loose).
  for (const riderId of testRiderIds) {
    const profile = await RiderProfile.findOne({ where: { userId: riderId } });
    const count = await Delivery.count({
      where: { riderId, status: { [Op.in]: ACTIVE_DELIVERY_STATUSES } },
    });
    if (count > 1) {
      violations.push(`test rider ${riderId} has ${count} active deliveries`);
    }
    if (profile && profile.availability === 'BUSY' && count === 0) {
      violations.push(`test rider ${riderId} is BUSY with no active delivery`);
    }
    if (profile && count > 0 && profile.availability !== 'BUSY') {
      violations.push(
        `test rider ${riderId} has active work but is ${profile.availability}`
      );
    }
  }

  record(
    `invariants hold: ${label}`,
    violations.length === 0,
    violations.join('; ')
  );
  return violations;
}

async function main() {
  const stamp = Date.now();
  console.log(`Smoke testing ${BASE_URL}\n`);

  // ---------------- setup ----------------
  const carla = await login(SEED.carla.email, SEED.carla.password);
  const chris = await login(SEED.chris.email, SEED.chris.password);
  record('seeded customers can log in', Boolean(carla.token && chris.token));

  const custMain = await registerCustomer(stamp, 'main');
  const custRace = await registerCustomer(stamp, 'race');
  const custSusp = await registerCustomer(stamp, 'susp');

  const riderMain = await registerRider(stamp, 'main');
  const riderX = await registerRider(stamp, 'x');
  const riderY = await registerRider(stamp, 'y');
  const riderP = await registerRider(stamp, 'p');
  const riderQ = await registerRider(stamp, 'q');
  const riderRace = await registerRider(stamp, 'race');
  const riderAvail = await registerRider(stamp, 'avail');
  const riderDouble = await registerRider(stamp, 'double');
  const riders = [
    riderMain,
    riderX,
    riderY,
    riderP,
    riderQ,
    riderRace,
    riderAvail,
    riderDouble,
  ];
  for (const r of riders) testRiderIds.add((await request('GET', '/api/auth/me', { token: r.token })).json.data.user.id);
  record('registered 8 fresh riders', riders.every((r) => Boolean(r.token)));

  await checkInvariants('baseline');

  // ---------------- delivery CRUD + validation ----------------
  let res = await createDelivery(custMain.token, { packageWeightKg: 3 });
  let delivery = data(res).delivery || {};
  record(
    'create delivery -> 201 PENDING with computed price',
    res.status === 201 && delivery.status === 'PENDING' && delivery.price === 350,
    `status ${res.status} price ${delivery.price}`
  );
  const dId = delivery.id;

  res = await createDelivery(custMain.token, { packageWeightKg: 0.5, price: 1 });
  expectStatus(res, 400, 'create with client-supplied price -> 400 (.strict)');

  res = await createDelivery(custMain.token, { pickupAddress: '' });
  expectStatus(res, 400, 'create with empty required field -> 400');

  res = await createDelivery(custMain.token, { packageWeightKg: -1 });
  expectStatus(res, 400, 'create with negative weight -> 400');

  res = await request('GET', '/api/deliveries', { token: custMain.token });
  record(
    'list deliveries -> 200 with pagination',
    res.status === 200 && Array.isArray(data(res).items) && Boolean(data(res).pagination),
    `status ${res.status}`
  );

  res = await request('GET', `/api/deliveries/${dId}`, { token: custMain.token });
  record('get own delivery -> 200', res.status === 200 && data(res).delivery.id === dId);

  res = await request('GET', `/api/deliveries/${dId}`, { token: chris.token });
  expectStatus(res, 404, "get another customer's delivery -> 404");

  res = await request('GET', '/api/deliveries/not-a-uuid', { token: custMain.token });
  expectStatus(res, 400, 'get with malformed id -> 400');

  res = await request('PATCH', `/api/deliveries/${dId}`, {
    token: custMain.token,
    body: { dropoffAddress: '9 New Dropoff Road', packageWeightKg: 4 },
  });
  record(
    'patch pending delivery recomputes price',
    res.status === 200 && data(res).delivery.price === 400,
    `status ${res.status} price ${data(res).delivery && data(res).delivery.price}`
  );

  res = await request('PATCH', `/api/deliveries/${dId}`, {
    token: custMain.token,
    body: { price: 1 },
  });
  expectStatus(res, 400, 'patch with client-supplied price -> 400');

  res = await request('POST', '/api/deliveries', {
    token: riderMain.token,
    body: sampleDelivery(),
  });
  expectStatus(res, 403, 'rider cannot create a delivery -> 403');

  res = await request('GET', '/api/rider/profile', { token: custMain.token });
  expectStatus(res, 403, 'customer cannot access rider routes -> 403');

  // ---------------- payment happy path (CARD) ----------------
  const cardId = await createDelivery(custMain.token, { packageWeightKg: 1 });
  const cardDeliveryId = data(cardId).delivery.id;
  const cardPrice = data(cardId).delivery.price;
  res = await payDelivery(custMain.token, cardDeliveryId, 'CARD');
  record(
    'CARD payment -> 201 SUCCESSFUL with reference',
    res.status === 201 &&
      data(res).payment &&
      data(res).payment.status === 'SUCCESSFUL' &&
      Boolean(data(res).payment.reference) &&
      data(res).payment.amount === cardPrice,
    `status ${res.status} ${res.text.slice(0, 120)}`
  );

  res = await request('GET', `/api/deliveries/${cardDeliveryId}`, {
    token: custMain.token,
  });
  record(
    'payment auto-confirms the delivery',
    res.status === 200 && data(res).delivery.status === 'CONFIRMED',
    `${data(res).delivery && data(res).delivery.status}`
  );

  res = await payDelivery(custMain.token, cardDeliveryId, 'CARD');
  expectStatus(res, 409, 'second payment after success -> 409');

  res = await request('GET', '/api/payments', { token: custMain.token });
  record(
    'list own payments -> 200',
    res.status === 200 && Array.isArray(data(res).items) && data(res).items.length >= 1,
    `status ${res.status}`
  );

  // ---------------- CASH + full rider lifecycle ----------------
  const cashId = await createDelivery(custMain.token, { packageWeightKg: 2 });
  const cashDeliveryId = data(cashId).delivery.id;
  res = await payDelivery(custMain.token, cashDeliveryId, 'CASH');
  record(
    'CASH payment -> 201 PENDING, delivery confirmed',
    res.status === 201 && data(res).payment.status === 'PENDING',
    `status ${res.status}`
  );

  await setAvailable(riderMain.token);
  res = await request('POST', `/api/rider/deliveries/${cashDeliveryId}/accept`, {
    token: riderMain.token,
  });
  record(
    'rider accepts confirmed delivery -> ASSIGNED',
    res.status === 200 && data(res).delivery.status === 'ASSIGNED',
    `status ${res.status} ${res.text.slice(0, 120)}`
  );

  res = await request('GET', '/api/rider/profile', { token: riderMain.token });
  record('rider becomes BUSY after accept', data(res).profile.availability === 'BUSY');

  res = await setAvailable(riderMain.token);
  expectStatus(res, 409, 'rider cannot change availability while active -> 409');

  await request('PATCH', `/api/rider/deliveries/${cashDeliveryId}/status`, {
    token: riderMain.token,
    body: { status: 'CANCELLED' },
  }).then((r) => expectStatus(r, 400, 'rider cannot set CANCELLED -> 400'));

  res = await request('PATCH', `/api/rider/deliveries/${cashDeliveryId}/status`, {
    token: riderMain.token,
    body: { status: 'PICKED_UP' },
  });
  record('rider PICKED_UP -> 200', res.status === 200 && data(res).delivery.status === 'PICKED_UP');

  res = await request('PATCH', `/api/rider/deliveries/${cashDeliveryId}/status`, {
    token: riderMain.token,
    body: { status: 'DELIVERED' },
  });
  expectStatus(res, 409, 'skipping IN_TRANSIT -> 409');

  res = await request('PATCH', `/api/rider/deliveries/${cashDeliveryId}/status`, {
    token: riderMain.token,
    body: { status: 'IN_TRANSIT' },
  });
  record('rider IN_TRANSIT -> 200', res.status === 200 && data(res).delivery.status === 'IN_TRANSIT');

  res = await request('PATCH', `/api/rider/deliveries/${cashDeliveryId}/status`, {
    token: riderMain.token,
    body: { status: 'DELIVERED' },
  });
  record('rider DELIVERED -> 200', res.status === 200 && data(res).delivery.status === 'DELIVERED');

  res = await request('GET', `/api/deliveries/${cashDeliveryId}`, {
    token: custMain.token,
  });
  const cashPayment = ((data(res).delivery || {}).payments || []).find(
    (p) => p.method === 'CASH'
  );
  record(
    'CASH payment settled on delivery',
    cashPayment && cashPayment.status === 'SUCCESSFUL' && Boolean(cashPayment.paidAt),
    JSON.stringify(cashPayment)
  );

  res = await request('GET', '/api/rider/profile', { token: riderMain.token });
  record('rider freed after delivery -> AVAILABLE', data(res).profile.availability === 'AVAILABLE');

  // ---------------- failure cases ----------------
  res = await request('POST', `/api/deliveries/${SEED.d8}/payments`, {
    token: chris.token,
    body: { method: 'CARD' },
  });
  expectStatus(res, 409, 'pay a cancelled delivery -> 409');

  res = await request('POST', `/api/deliveries/${SEED.d7}/payments`, {
    token: carla.token,
    body: { method: 'CARD' },
  });
  expectStatus(res, 409, 'pay a delivered delivery -> 409');

  const pendingId = data(await createDelivery(custMain.token, { packageWeightKg: 1 })).delivery.id;
  res = await request('POST', `/api/rider/deliveries/${pendingId}/accept`, {
    token: riderMain.token,
  });
  expectStatus(res, 409, 'rider cannot accept a PENDING delivery -> 409');

  res = await request('PATCH', `/api/rider/deliveries/${SEED.d3}/status`, {
    token: riderMain.token,
    body: { status: 'PICKED_UP' },
  });
  expectStatus(res, 404, "rider cannot advance another rider's delivery -> 404");

  res = await request('GET', '/api/rider/deliveries/available', {
    token: riderMain.token,
  });
  record(
    'available list -> 200 and hides contact details',
    res.status === 200 &&
      !res.text.includes('@quikdrop.test') &&
      !res.text.includes('email') &&
      !res.text.includes('ContactName') &&
      !res.text.includes('ContactPhone'),
    `status ${res.status}`
  );

  const offlineDeliveryId = await confirmedDelivery(custMain.token, {
    packageWeightKg: 1,
  });
  res = await request('POST', `/api/rider/deliveries/${offlineDeliveryId}/accept`, {
    token: riderAvail.token,
  });
  expectStatus(res, 409, 'OFFLINE rider cannot accept -> 409');

  res = await request('PATCH', '/api/rider/availability', {
    token: riderAvail.token,
    body: { availability: 'BUSY' },
  });
  expectStatus(res, 400, 'rider cannot set BUSY manually -> 400');

  res = await request('PATCH', '/api/rider/availability', {
    token: riderAvail.token,
    body: { availability: 'AVAILABLE' },
  });
  record('rider can set AVAILABLE -> 200', res.status === 200 && data(res).profile.availability === 'AVAILABLE');

  // ---------------- additional failure cases (patch 2C) ----------------
  res = await request('PATCH', `/api/deliveries/${cardDeliveryId}`, {
    token: custMain.token,
    body: { dropoffAddress: '3 Too Late Road' },
  });
  expectStatus(res, 409, 'edit a CONFIRMED delivery -> 409');

  res = await request('PATCH', `/api/deliveries/${cashDeliveryId}`, {
    token: custMain.token,
    body: { dropoffAddress: '4 Too Late Road' },
  });
  expectStatus(res, 409, 'edit a DELIVERED delivery -> 409');

  res = await request('POST', `/api/deliveries/${dId}/cancel`, {
    token: custMain.token,
    body: {},
  });
  expectStatus(res, 400, 'customer cancel without a reason -> 400');

  const paidConfirmedId = await confirmedDelivery(custMain.token, {
    packageWeightKg: 1,
  });
  res = await request('POST', `/api/deliveries/${paidConfirmedId}/cancel`, {
    token: custMain.token,
    body: { reason: 'No longer needed' },
  });
  const paidConfirmedPayment = await Payment.findOne({
    where: { deliveryId: paidConfirmedId },
  });
  record(
    'cancel a paid CONFIRMED delivery -> refunded, riderId null',
    res.status === 200 &&
      data(res).delivery.status === 'CANCELLED' &&
      data(res).delivery.riderId === null &&
      paidConfirmedPayment.status === 'REFUNDED',
    `status ${res.status} payment ${paidConfirmedPayment && paidConfirmedPayment.status}`
  );

  const pickedCancelId = data(
    await createDelivery(custMain.token, { packageWeightKg: 1 })
  ).delivery.id;
  await payDelivery(custMain.token, pickedCancelId, 'CASH');
  await setAvailable(riderMain.token);
  await request('POST', `/api/rider/deliveries/${pickedCancelId}/accept`, {
    token: riderMain.token,
  });
  await request('PATCH', `/api/rider/deliveries/${pickedCancelId}/status`, {
    token: riderMain.token,
    body: { status: 'PICKED_UP' },
  });
  res = await request('POST', `/api/deliveries/${pickedCancelId}/cancel`, {
    token: custMain.token,
    body: { reason: 'Too late now' },
  });
  expectStatus(res, 409, 'customer cancel after PICKED_UP -> 409');
  // Complete it so riderMain is free for the next scenario.
  await request('PATCH', `/api/rider/deliveries/${pickedCancelId}/status`, {
    token: riderMain.token,
    body: { status: 'IN_TRANSIT' },
  });
  await request('PATCH', `/api/rider/deliveries/${pickedCancelId}/status`, {
    token: riderMain.token,
    body: { status: 'DELIVERED' },
  });

  // ---------------- refund on cancel of an assigned delivery ----------------
  const refundId = await confirmedDelivery(custMain.token, { packageWeightKg: 1 });
  await setAvailable(riderMain.token);
  await request('POST', `/api/rider/deliveries/${refundId}/accept`, {
    token: riderMain.token,
  });
  res = await request('POST', `/api/deliveries/${refundId}/cancel`, {
    token: custMain.token,
    body: { reason: 'Changed my mind' },
  });
  record(
    'cancel assigned delivery frees rider and clears riderId',
    res.status === 200 &&
      data(res).delivery.status === 'CANCELLED' &&
      data(res).delivery.riderId === null,
    `status ${res.status} ${res.text.slice(0, 140)}`
  );

  const refundPayment = await Payment.findOne({ where: { deliveryId: refundId } });
  record('successful payment refunded on cancel', refundPayment.status === 'REFUNDED');

  // ---------------- concurrency group 1: double accept ----------------
  const raceId1 = await confirmedDelivery(custMain.token, { packageWeightKg: 1 });
  await setAvailable(riderX.token);
  await setAvailable(riderY.token);
  let results = await Promise.all([
    request('POST', `/api/rider/deliveries/${raceId1}/accept`, { token: riderX.token }),
    request('POST', `/api/rider/deliveries/${raceId1}/accept`, { token: riderY.token }),
  ]);
  const okCount = results.filter((r) => r.status === 200).length;
  const conflictCount = results.filter((r) => r.status === 409).length;
  record(
    'concurrency: two riders accept -> exactly one wins',
    okCount === 1 && conflictCount === 1,
    `200s=${okCount} 409s=${conflictCount}`
  );

  // ---------------- concurrency group 2: double payment ----------------
  const payRaceId = data(await createDelivery(custMain.token, { packageWeightKg: 1 })).delivery.id;
  results = await Promise.all([
    payDelivery(custMain.token, payRaceId, 'CARD'),
    payDelivery(custMain.token, payRaceId, 'CARD'),
  ]);
  const payOk = results.filter((r) => r.status === 201).length;
  record(
    'concurrency: two payments -> exactly one success',
    payOk === 1,
    `statuses=${results.map((r) => r.status).join(',')}`
  );
  const successfulPayments = await Payment.count({
    where: { deliveryId: payRaceId, status: 'SUCCESSFUL' },
  });
  record('concurrency: one successful payment row', successfulPayments === 1);

  // ---------------- concurrency group 3: admin assign vs accept ----------------
  const assignRaceId = await confirmedDelivery(custMain.token, { packageWeightKg: 1 });
  await setAvailable(riderP.token);
  await setAvailable(riderQ.token);
  const riderPId = (
    await request('GET', '/api/auth/me', { token: riderP.token })
  ).json.data.user.id;
  const riderQId = (
    await request('GET', '/api/auth/me', { token: riderQ.token })
  ).json.data.user.id;
  results = await Promise.allSettled([
    deliveryService.adminAssign(assignRaceId, riderPId, { id: SEED.adminId }),
    deliveryService.adminAssign(assignRaceId, riderQId, { id: SEED.adminId }),
  ]);
  const adminAccept = await request('POST', `/api/rider/deliveries/${assignRaceId}/accept`, {
    token: riderP.token,
  });
  const fulfilled = results.filter((r) => r.status === 'fulfilled').length;
  const rejected = results.filter(
    (r) => r.status === 'rejected' && r.reason && r.reason.statusCode === 409
  ).length;
  const assignedRow = await Delivery.findByPk(assignRaceId);
  record(
    'concurrency: admin assign locks out accept/duplicate',
    fulfilled === 1 && rejected === 1 && assignedRow.status === 'ASSIGNED' && adminAccept.status === 409,
    `fulfilled=${fulfilled} rejected=${rejected} status=${assignedRow.status} accept=${adminAccept.status}`
  );
  record(
    'concurrency: losing riders stay AVAILABLE',
    await RiderProfile.count({
      where: { userId: { [Op.in]: [riderPId, riderQId] }, availability: 'AVAILABLE' },
    }) === 1
  );

  // ---------------- concurrency group 4: cancel vs accept x10 ----------------
  let raceClean = true;
  for (let i = 0; i < 10; i += 1) {
    const id = await confirmedDelivery(custRace.token, { packageWeightKg: 1 });
    await setAvailable(riderRace.token);
    const [acceptRes, cancelRes] = await Promise.all([
      request('POST', `/api/rider/deliveries/${id}/accept`, { token: riderRace.token }),
      request('POST', `/api/deliveries/${id}/cancel`, {
        token: custRace.token,
        body: { reason: `race round ${i}` },
      }),
    ]);
    const row = await Delivery.findByPk(id);
    const profile = await RiderProfile.findOne({
      where: {
        userId: (await request('GET', '/api/auth/me', { token: riderRace.token })).json
          .data.user.id,
      },
    });
    const consistent =
      cancelRes.status === 200 &&
      [200, 409].includes(acceptRes.status) &&
      row.status === 'CANCELLED' &&
      row.riderId === null &&
      profile.availability === 'AVAILABLE';
    if (!consistent) {
      raceClean = false;
      console.log(
        `  round ${i}: accept=${acceptRes.status} cancel=${cancelRes.status} status=${row.status} rider=${profile.availability}`
      );
      break;
    }
  }
  record('concurrency: 10x cancel/accept race stays consistent', raceClean);

  // ---------------- concurrency group 5a: one rider, two deliveries ----------------
  const doubleA = await confirmedDelivery(custMain.token, { packageWeightKg: 1 });
  const doubleB = await confirmedDelivery(custMain.token, { packageWeightKg: 1 });
  await setAvailable(riderDouble.token);
  const riderDoubleId = (
    await request('GET', '/api/auth/me', { token: riderDouble.token })
  ).json.data.user.id;
  results = await Promise.all([
    request('POST', `/api/rider/deliveries/${doubleA}/accept`, { token: riderDouble.token }),
    request('POST', `/api/rider/deliveries/${doubleB}/accept`, { token: riderDouble.token }),
  ]);
  const doubleOk = results.filter((r) => r.status === 200).length;
  const doubleConflict = results.filter((r) => r.status === 409).length;
  const doubleActive = await Delivery.count({
    where: { riderId: riderDoubleId, status: { [Op.in]: ACTIVE_DELIVERY_STATUSES } },
  });
  const doubleRows = await Promise.all([Delivery.findByPk(doubleA), Delivery.findByPk(doubleB)]);
  const doubleOther = doubleRows.find((d) => d.status === 'CONFIRMED');
  record(
    'concurrency: one rider accepts two -> one 200, one 409, one active',
    doubleOk === 1 &&
      doubleConflict === 1 &&
      doubleActive === 1 &&
      Boolean(doubleOther) &&
      doubleOther.riderId === null,
    `200s=${doubleOk} 409s=${doubleConflict} active=${doubleActive} other=${doubleOther && doubleOther.status}/${doubleOther && doubleOther.riderId}`
  );

  // ---------------- concurrency group 5b: double cancel ----------------
  const cancelRaceId = await confirmedDelivery(custMain.token, { packageWeightKg: 1 });
  results = await Promise.all([
    request('POST', `/api/deliveries/${cancelRaceId}/cancel`, {
      token: custMain.token,
      body: { reason: 'race cancel one' },
    }),
    request('POST', `/api/deliveries/${cancelRaceId}/cancel`, {
      token: custMain.token,
      body: { reason: 'race cancel two' },
    }),
  ]);
  const cancelOk = results.filter((r) => r.status === 200).length;
  const cancelConflict = results.filter((r) => r.status === 409).length;
  const refundedCount = await Payment.count({
    where: { deliveryId: cancelRaceId, status: 'REFUNDED' },
  });
  record(
    'concurrency: double cancel -> one 200, one 409, one REFUNDED',
    cancelOk === 1 && cancelConflict === 1 && refundedCount === 1,
    `200s=${cancelOk} 409s=${cancelConflict} refunded=${refundedCount}`
  );

  // ---------------- concurrency group 5c: double PICKED_UP ----------------
  const pickRaceId = data(
    await createDelivery(custMain.token, { packageWeightKg: 1 })
  ).delivery.id;
  await payDelivery(custMain.token, pickRaceId, 'CASH');
  await setAvailable(riderMain.token);
  await request('POST', `/api/rider/deliveries/${pickRaceId}/accept`, {
    token: riderMain.token,
  });
  results = await Promise.all([
    request('PATCH', `/api/rider/deliveries/${pickRaceId}/status`, {
      token: riderMain.token,
      body: { status: 'PICKED_UP' },
    }),
    request('PATCH', `/api/rider/deliveries/${pickRaceId}/status`, {
      token: riderMain.token,
      body: { status: 'PICKED_UP' },
    }),
  ]);
  const pickOk = results.filter((r) => r.status === 200).length;
  const pickConflict = results.filter((r) => r.status === 409).length;
  const pickHistory = await DeliveryStatusHistory.count({
    where: { deliveryId: pickRaceId, toStatus: 'PICKED_UP' },
  });
  record(
    'concurrency: double PICKED_UP -> one 200, one 409, one history row',
    pickOk === 1 && pickConflict === 1 && pickHistory === 1,
    `200s=${pickOk} 409s=${pickConflict} history=${pickHistory}`
  );
  await request('PATCH', `/api/rider/deliveries/${pickRaceId}/status`, {
    token: riderMain.token,
    body: { status: 'IN_TRANSIT' },
  });
  await request('PATCH', `/api/rider/deliveries/${pickRaceId}/status`, {
    token: riderMain.token,
    body: { status: 'DELIVERED' },
  });

  // ---------------- rider advance after reassignment -> 404 ----------------
  const reassignId = await confirmedDelivery(custMain.token, { packageWeightKg: 1 });
  await setAvailable(riderY.token);
  await setAvailable(riderRace.token);
  const riderYId = (
    await request('GET', '/api/auth/me', { token: riderY.token })
  ).json.data.user.id;
  const riderRaceId = (
    await request('GET', '/api/auth/me', { token: riderRace.token })
  ).json.data.user.id;
  await deliveryService.adminAssign(reassignId, riderYId, { id: SEED.adminId });
  await deliveryService.adminUnassign(reassignId, { id: SEED.adminId });
  await deliveryService.adminAssign(reassignId, riderRaceId, { id: SEED.adminId });
  res = await request('PATCH', `/api/rider/deliveries/${reassignId}/status`, {
    token: riderY.token,
    body: { status: 'PICKED_UP' },
  });
  expectStatus(res, 404, 'rider PATCH after reassignment -> 404');

  // ---------------- suspended user's existing token -> 401 ----------------
  await User.update(
    { status: 'SUSPENDED' },
    { where: { email: custSusp.email } }
  );
  res = await request('GET', '/api/deliveries', { token: custSusp.token });
  expectStatus(res, 401, "suspended user's old token -> 401");

  // ---------------- final invariant sweep + history consistency ----------------
  await checkInvariants('final');

  const checkIds = [
    dId,
    cardDeliveryId,
    cashDeliveryId,
    refundId,
    raceId1,
    payRaceId,
    assignRaceId,
    paidConfirmedId,
    pickedCancelId,
    cancelRaceId,
    pickRaceId,
    reassignId,
    doubleA,
    doubleB,
  ];
  let historyOk = true;
  for (const id of checkIds) {
    const row = await Delivery.findByPk(id);
    const history = await DeliveryStatusHistory.findAll({
      where: { deliveryId: id },
      order: [['createdAt', 'ASC']],
    });
    if (!history.length || history[history.length - 1].toStatus !== row.status) {
      historyOk = false;
      console.log(`  history mismatch for ${id}: last=${history.length ? history[history.length - 1].toStatus : 'none'} status=${row.status}`);
    }
  }
  record('status history matches current status for every tracked delivery', historyOk);

  record(
    'no response ever contains passwordHash',
    passwordHashLeak === null,
    passwordHashLeak ? `leaked by ${passwordHashLeak}` : undefined
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
    console.error('\nSmoke test crashed:', err);
    await sequelize.close().catch(() => {});
    process.exit(1);
  });
