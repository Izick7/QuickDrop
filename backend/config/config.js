require('dotenv').config();

const common = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST || '127.0.0.1',
  port: Number(process.env.DB_PORT) || 5432,
  dialect: 'postgres',
  logging: false,
  define: {
    timestamps: true,
  },
};

module.exports = {
  development: {
    ...common,
  },
  test: {
    ...common,
    database: process.env.DB_NAME_TEST || `${process.env.DB_NAME}_test`,
  },
  production: {
    // Prefer a single connection string when provided (e.g. Heroku, Render, RDS).
    ...(process.env.DATABASE_URL
      ? {
          use_env_variable: 'DATABASE_URL',
          username: undefined,
          password: undefined,
          database: undefined,
          host: undefined,
          port: undefined,
        }
      : {
          username: process.env.DB_USER,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
          host: process.env.DB_HOST,
          port: Number(process.env.DB_PORT) || 5432,
        }),
    dialect: 'postgres',
    logging: false,
    define: {
      timestamps: true,
    },
    dialectOptions: {
      ssl: {
        require: true,
        rejectUnauthorized: false,
      },
    },
  },
};
