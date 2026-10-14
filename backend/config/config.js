require('dotenv').config();

const fs = require('fs');

const common = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  dialect: 'postgres',
  logging: false,
  define: { timestamps: true },
};

function getCaCertificate() {
  if (process.env.DB_CA_CERT_BASE64) {
    return Buffer.from(
      process.env.DB_CA_CERT_BASE64,
      'base64'
    ).toString('utf8');
  }

  if (process.env.DB_CA_CERT_PATH) {
    return fs.readFileSync(process.env.DB_CA_CERT_PATH, 'utf8');
  }

  return null;
}

const production = {
  dialect: 'postgres',
  logging: false,
  define: { timestamps: true },
};

if (process.env.DATABASE_URL) {
  production.use_env_variable = 'DATABASE_URL';
} else {
  production.username = process.env.DB_USER;
  production.password = process.env.DB_PASSWORD;
  production.database = process.env.DB_NAME;
  production.host = process.env.DB_HOST;
  production.port = Number(process.env.DB_PORT) || 5432;
}

const ca = getCaCertificate();

if (ca) {
  production.dialectOptions = {
    ssl: {
      require: true,
      rejectUnauthorized: true,
      ca,
    },
  };
} else if (process.env.NODE_ENV === 'production') {
  throw new Error(
    'Production requires DB_CA_CERT_BASE64 or DB_CA_CERT_PATH for verified database TLS.'
  );
}

module.exports = {
  development: { ...common },

  test: {
    ...common,
    database: process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`,
  },

  production,
};
