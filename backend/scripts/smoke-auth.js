'use strict';

/**
 * End-to-end auth smoke test. Requires:
 *   1. a fresh database (`npm run db:reset`)
 *   2. the API running (`npm start`)
 * Run with: `node scripts/smoke-auth.js`
 *
 * Prints PASS/FAIL per step and exits non-zero if anything failed.
 */

require('dotenv').config();

const { sequelize, User } = require('../src/config/database');

const BASE_URL =
  process.env.SMOKE_BASE_URL ||
  `http://localhost:${process.env.PORT || 5000}`;

let passed = 0;
let failed = 0;
let passwordHashLeak = null;

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

function data(res) {
  return res.json && res.json.data ? res.json.data : {};
}

async function main() {
  const stamp = Date.now();
  const customerEmail = `smoke.customer.${stamp}@quikdrop.test`;
  const riderEmail = `smoke.rider.${stamp}@quikdrop.test`;
  const password = 'SmokePass123';

  console.log(`Smoke testing ${BASE_URL}\n`);

  // 1. register customer
  let res = await request('POST', '/api/auth/register', {
    body: {
      fullName: 'Smoke Customer',
      email: customerEmail,
      phone: '+254700100001',
      password,
    },
  });
  record('register customer -> 201', res.status === 201, `status ${res.status}`);
  const customer = data(res).user || {};
  const customerId = customer.id;
  record(
    'register customer returns { token, user }',
    Boolean(data(res).token && customerId),
    JSON.stringify(res.json)
  );

  // 2. duplicate email
  res = await request('POST', '/api/auth/register', {
    body: {
      fullName: 'Duplicate',
      email: customerEmail,
      phone: '+254700100002',
      password,
    },
  });
  record('duplicate email -> 409', res.status === 409, `status ${res.status}`);

  // 3. register rider creates the profile (verified through /me)
  res = await request('POST', '/api/auth/register', {
    body: {
      fullName: 'Smoke Rider',
      email: riderEmail,
      phone: '+254700100003',
      password,
      role: 'RIDER',
      vehicleType: 'Motorcycle',
      plateNumber: 'SMK 001',
    },
  });
  record('register rider -> 201', res.status === 201, `status ${res.status}`);

  let riderLogin = await request('POST', '/api/auth/login', {
    body: { email: riderEmail, password },
  });
  let riderToken = data(riderLogin).token;
  let me = await request('GET', '/api/auth/me', { token: riderToken });
  const riderProfile = data(me).user && data(me).user.riderProfile;
  record(
    'rider registration created OFFLINE profile',
    Boolean(
      riderProfile &&
        riderProfile.vehicleType === 'Motorcycle' &&
        riderProfile.plateNumber === 'SMK 001' &&
        riderProfile.availability === 'OFFLINE'
    ),
    JSON.stringify(me.json)
  );

  // 4. ADMIN registration is rejected
  res = await request('POST', '/api/auth/register', {
    body: {
      fullName: 'Would-be Admin',
      email: `smoke.admin.${stamp}@quikdrop.test`,
      phone: '+254700100004',
      password,
      role: 'ADMIN',
    },
  });
  record('register as ADMIN -> rejected (400)', res.status === 400, `status ${res.status}`);

  // 5. unknown extra field is rejected (.strict())
  res = await request('POST', '/api/auth/register', {
    body: {
      fullName: 'Extra Field',
      email: `smoke.extra.${stamp}@quikdrop.test`,
      phone: '+254700100005',
      password,
      nickname: 'not-allowed',
    },
  });
  record('unknown extra field -> 400', res.status === 400, `status ${res.status}`);

  // 6. weak password is rejected
  res = await request('POST', '/api/auth/register', {
    body: {
      fullName: 'Weak Password',
      email: `smoke.weak.${stamp}@quikdrop.test`,
      phone: '+254700100006',
      password: 'short',
    },
  });
  record('weak password -> 400', res.status === 400, `status ${res.status}`);

  // 7. login ok
  res = await request('POST', '/api/auth/login', {
    body: { email: customerEmail, password },
  });
  const loginToken = data(res).token;
  record(
    'login ok -> 200 with token',
    res.status === 200 && Boolean(loginToken),
    `status ${res.status}`
  );

  // 8. wrong password
  res = await request('POST', '/api/auth/login', {
    body: { email: customerEmail, password: 'TotallyWrong999' },
  });
  record('wrong password -> 401', res.status === 401, `status ${res.status}`);

  // 9. suspended seeded rider
  res = await request('POST', '/api/auth/login', {
    body: { email: 'rex.rider@quikdrop.test', password: 'Password123!' },
  });
  record('suspended rider login -> 403', res.status === 403, `status ${res.status}`);

  // 10. suspend a user directly via Sequelize; existing token must stop working
  await User.update({ status: 'SUSPENDED' }, { where: { id: customerId } });
  res = await request('GET', '/api/auth/me', { token: loginToken });
  record('suspended user /me -> 401', res.status === 401, `status ${res.status}`);

  // 11. no token
  res = await request('GET', '/api/auth/me');
  record('no token /me -> 401', res.status === 401, `status ${res.status}`);

  // 12. garbage token
  res = await request('GET', '/api/auth/me', { token: 'garbage.token.value' });
  record('garbage token /me -> 401', res.status === 401, `status ${res.status}`);

  // 13. GET /me (active rider, includes riderProfile)
  res = await request('GET', '/api/auth/me', { token: riderToken });
  record(
    'GET /me -> 200 with riderProfile',
    res.status === 200 && Boolean(data(res).user && data(res).user.riderProfile),
    `status ${res.status}`
  );

  // 14. PATCH profile
  res = await request('PATCH', '/api/users/me', {
    token: riderToken,
    body: {
      fullName: 'Smoke Rider Updated',
      phone: '+254700100009',
      vehicleType: 'Bicycle',
      plateNumber: 'SMK 999',
    },
  });
  const updated = data(res).user || {};
  record(
    'PATCH /users/me -> 200',
    res.status === 200 &&
      updated.fullName === 'Smoke Rider Updated' &&
      updated.phone === '+254700100009' &&
      updated.riderProfile &&
      updated.riderProfile.vehicleType === 'Bicycle',
    `status ${res.status} ${JSON.stringify(res.json)}`
  );

  // 15. change password, then log in with the new one
  const newPassword = 'SmokePass456';
  res = await request('PATCH', '/api/users/me/password', {
    token: riderToken,
    body: { currentPassword: password, newPassword },
  });
  record('change password -> 200', res.status === 200, `status ${res.status}`);

  res = await request('POST', '/api/auth/login', {
    body: { email: riderEmail, password: newPassword },
  });
  record(
    'login with new password -> 200',
    res.status === 200 && Boolean(data(res).token),
    `status ${res.status}`
  );

  res = await request('POST', '/api/auth/login', {
    body: { email: riderEmail, password },
  });
  record('login with old password -> 401', res.status === 401, `status ${res.status}`);

  // Final sweep: no response anywhere may contain passwordHash.
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
