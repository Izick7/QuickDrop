'use strict';

const { sequelize, User, RiderProfile } = require('../config/database');
const AppError = require('../utils/AppError');
const { hashPassword, comparePassword } = require('../utils/password');

/**
 * Strips the password hash before a user model is ever serialised into a
 * response. Every user-shaped payload in the API goes through this helper.
 */
function toPublicUser(user) {
  const json = typeof user.toJSON === 'function' ? user.toJSON() : { ...user };
  delete json.passwordHash;
  return json;
}

// Loads a user and (for riders) the rider profile. Never exposes passwordHash.
async function getMe(userId) {
  const user = await User.findByPk(userId, {
    include: [{ model: RiderProfile, as: 'riderProfile' }],
  });
  if (!user) {
    throw new AppError('User not found', 404);
  }

  const publicUser = toPublicUser(user);
  if (!publicUser.riderProfile) {
    delete publicUser.riderProfile;
  }
  return publicUser;
}

/**
 * Updates the editable profile fields. email, role and status are not editable
 * here. Riders may additionally update their vehicleType / plateNumber.
 */
async function updateMe(user, data) {
  const { fullName, phone, vehicleType, plateNumber } = data;
  const touchesVehicle =
    vehicleType !== undefined || plateNumber !== undefined;

  if (touchesVehicle && user.role !== 'RIDER') {
    throw new AppError('Only riders can update vehicle details', 403);
  }

  await sequelize.transaction(async (transaction) => {
    const userFields = {};
    if (fullName !== undefined) userFields.fullName = fullName;
    if (phone !== undefined) userFields.phone = phone;
    if (Object.keys(userFields).length > 0) {
      await user.update(userFields, { transaction });
    }

    if (touchesVehicle) {
      const profile = await RiderProfile.findOne({
        where: { userId: user.id },
        transaction,
      });
      if (!profile) {
        throw new AppError('Rider profile not found', 404);
      }

      const profileFields = {};
      if (vehicleType !== undefined) profileFields.vehicleType = vehicleType;
      if (plateNumber !== undefined) profileFields.plateNumber = plateNumber;
      await profile.update(profileFields, { transaction });
    }
  });

  return getMe(user.id);
}

// Verifies the current password and rejects reusing it as the new password.
async function changePassword(user, currentPassword, newPassword) {
  const account = await User.scope('withPassword').findByPk(user.id);
  if (!account) {
    throw new AppError('User not found', 404);
  }

  const currentOk = await comparePassword(currentPassword, account.passwordHash);
  if (!currentOk) {
    throw new AppError('Current password is incorrect', 400);
  }

  const reused = await comparePassword(newPassword, account.passwordHash);
  if (reused) {
    throw new AppError(
      'New password must be different from the current password',
      400
    );
  }

  const passwordHash = await hashPassword(newPassword);
  await account.update({ passwordHash });
}

module.exports = { toPublicUser, getMe, updateMe, changePassword };
