'use strict';

const AppError = require('../utils/AppError');

const DELIVERY_STATUS = {
  PENDING: 'PENDING',
  CONFIRMED: 'CONFIRMED',
  ASSIGNED: 'ASSIGNED',
  PICKED_UP: 'PICKED_UP',
  IN_TRANSIT: 'IN_TRANSIT',
  DELIVERED: 'DELIVERED',
  CANCELLED: 'CANCELLED',
};

// Single source of truth for the delivery lifecycle.
const DELIVERY_TRANSITIONS = {
  PENDING: ['CONFIRMED', 'CANCELLED'],
  CONFIRMED: ['ASSIGNED', 'CANCELLED'],
  ASSIGNED: ['PICKED_UP', 'CONFIRMED', 'CANCELLED'],
  PICKED_UP: ['IN_TRANSIT'],
  IN_TRANSIT: ['DELIVERED'],
  DELIVERED: [],
  CANCELLED: [],
};

const TERMINAL_STATUSES = ['DELIVERED', 'CANCELLED'];

// Extra transitions only an ADMIN may perform (e.g. aborting a delivery that a
// customer or rider has already pushed past the point of no return).
const ADMIN_EXTRA_TRANSITIONS = {
  PICKED_UP: ['CANCELLED'],
  IN_TRANSIT: ['CANCELLED'],
};

function canTransition(fromStatus, toStatus, { allowAdminOverride = false } = {}) {
  const allowed = DELIVERY_TRANSITIONS[fromStatus] || [];
  if (allowed.includes(toStatus)) return true;
  if (allowAdminOverride) {
    const adminAllowed = ADMIN_EXTRA_TRANSITIONS[fromStatus] || [];
    return adminAllowed.includes(toStatus);
  }
  return false;
}

function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

// Throws a 409 AppError when the transition is not allowed (or from a terminal state).
function assertTransition(fromStatus, toStatus, options = {}) {
  if (!DELIVERY_TRANSITIONS[fromStatus]) {
    throw new AppError(`Unknown delivery status: ${fromStatus}`, 409);
  }
  if (!canTransition(fromStatus, toStatus, options)) {
    if (isTerminal(fromStatus)) {
      throw new AppError(
        `Delivery is ${fromStatus} and can no longer be changed`,
        409
      );
    }
    throw new AppError(
      `Invalid delivery transition: ${fromStatus} -> ${toStatus}`,
      409
    );
  }
}

module.exports = {
  DELIVERY_STATUS,
  DELIVERY_TRANSITIONS,
  ADMIN_EXTRA_TRANSITIONS,
  TERMINAL_STATUSES,
  canTransition,
  isTerminal,
  assertTransition,
};
