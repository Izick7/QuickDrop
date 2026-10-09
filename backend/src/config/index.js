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

const nodeEnv = process.env.NODE_ENV || 'development';

const config = {
  nodeEnv,
  isProduction: nodeEnv === 'production',
  port: num(process.env.PORT, 5000),
  jwtSecret: required('JWT_SECRET', process.env.JWT_SECRET),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  bcryptRounds: num(process.env.BCRYPT_ROUNDS, 10),
  corsOrigin: process.env.CORS_ORIGIN || '*',
  basePrice: num(process.env.BASE_PRICE, 200),
  pricePerKg: num(process.env.PRICE_PER_KG, 50),
};

module.exports = config;
