'use strict';

const { sequelize, User, RiderProfile } = require('../config/database');
const AppError = require('../utils/AppError');
const {
  hashPassword,
  comparePassword,
  DUMMY_PASSWORD_HASH,
} = require('../utils/password');
const { signToken } = require('../utils/jwt');
const { toPublicUser, getMe } = require('./userService');

// Identical message for "unknown email" and "wrong password" so the endpoint
// cannot be used to enumerate registered accounts.
const GENERIC_LOGIN_ERROR = 'Invalid email or password';

/**
 * Creates a CUSTOMER or RIDER. Rider registration also creates the rider
 * profile (availability OFFLINE) inside the SAME transaction, so a partial
 * user without a profile is impossible.
 */
async function register(data) {
  const { fullName, email, phone, password, role, vehicleType, plateNumber } =
    data;

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    throw new AppError('Email is already registered', 409);
  }

  const passwordHash = await hashPassword(password);

  const user = await sequelize.transaction(async (transaction) => {
    const created = await User.create(
      { fullName, email, phone, passwordHash, role, status: 'ACTIVE' },
      { transaction }
    );

    if (role === 'RIDER') {
      await RiderProfile.create(
        {
          userId: created.id,
          vehicleType,
          plateNumber,
          availability: 'OFFLINE',
        },
        { transaction }
      );
    }

    return created;
  });

  const token = signToken(user);
  return { token, user: toPublicUser(user) };
}

async function login({ email, password }) {
  const user = await User.scope('withPassword').findOne({ where: { email } });

  // Always run a bcrypt comparison, even when the account is missing, so the
  // response time does not reveal whether the email is registered.
  const passwordOk = await comparePassword(
    password,
    user ? user.passwordHash : DUMMY_PASSWORD_HASH
  );

  if (!user || !passwordOk) {
    throw new AppError(GENERIC_LOGIN_ERROR, 401);
  }

  if (user.status !== 'ACTIVE') {
    throw new AppError(
      `Your account is ${user.status.toLowerCase()} and cannot sign in`,
      403
    );
  }

  const token = signToken(user);
  return { token, user: toPublicUser(user) };
}

async function me(userId) {
  return getMe(userId);
}

module.exports = { register, login, me };
