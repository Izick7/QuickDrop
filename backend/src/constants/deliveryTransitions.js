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

function canTransition(fromStatus, toStatus) {
  const allowed = DELIVERY_TRANSITIONS[fromStatus] || [];
  return allowed.includes(toStatus);
}

function isTerminal(status) {
  return TERMINAL_STATUSES.includes(status);
}

// Throws a 409 AppError when the transition is not allowed (or from a terminal state).
function assertTransition(fromStatus, toStatus) {
  if (!DELIVERY_TRANSITIONS[fromStatus]) {
    throw new AppError(`Unknown delivery status: ${fromStatus}`, 409);
  }
  if (!canTransition(fromStatus, toStatus)) {
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
  TERMINAL_STATUSES,
  canTransition,
  isTerminal,
  assertTransition,
};
