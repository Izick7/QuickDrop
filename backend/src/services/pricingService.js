'use strict';

const config = require('../config');

/**
 * Server-side pricing. The client never supplies a price; it is always derived
 * from the configured base price plus a per-kilogram rate.
 *
 *   price = BASE_PRICE + (packageWeightKg || 0) * PRICE_PER_KG
 */
function calculatePrice(packageWeightKg) {
  const weight =
    packageWeightKg === undefined || packageWeightKg === null
      ? 0
      : Number(packageWeightKg);

  const raw = config.basePrice + weight * config.pricePerKg;
  return Math.round((raw + Number.EPSILON) * 100) / 100;
}

module.exports = { calculatePrice };
