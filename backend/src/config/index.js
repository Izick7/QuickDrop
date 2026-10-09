'use strict';

require('dotenv').config();

function required(name, value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    // Fail fast: never boot without a signing secret.
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function num(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function bool(value, fallback) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return fallback;
  }
  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
}

/**
 * Express `trust proxy` accepts a boolean, a number of hops, or a string
 * (e.g. 'loopback', 'linklocal', or an IP/subnet list). Returns `false`
 * (Express default, proxy headers ignored) when unset.
 */
function trustProxy(value) {
  if (value === undefined || value === null || String(value).trim() === '') {
    return false;
  }
  const raw = String(value).trim();
  const lower = raw.toLowerCase();
  if (lower === 'true') return true;
  if (lower === 'false') return false;
  const parsed = Number(raw);
  if (Number.isInteger(parsed)) return parsed;
  return raw;
}

const nodeEnv = process.env.NODE_ENV || 'development';

const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  port: num(process.env.PORT, 5000),
  jwtSecret: required('JWT_SECRET', process.env.JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  bcryptRounds: num(process.env.BCRYPT_ROUNDS, 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  authRateLimitMax: num(process.env.AUTH_RATE_LIMIT_MAX, 100),
  trustProxy: trustProxy(process.env.TRUST_PROXY),
  basePrice: num(process.env.BASE_PRICE, 200),
  pricePerKg: num(process.env.PRICE_PER_KG, 50),
};

// Fail fast on unsafe production settings rather than booting insecurely.
if (config.isProduction) {
  if (!config.jwtSecret || config.jwtSecret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters long in production'
    );
  }
  if (config.corsOrigin === '*') {
    throw new Error(
      "CORS_ORIGIN must be set to an explicit origin (not '*') in production"
    );
  }
}

module.exports = config;
