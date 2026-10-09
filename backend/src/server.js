'use strict';

const app = require('./app');
const config = require('./config');
const { sequelize } = require('./config/database');

let server;

async function start() {
  await sequelize.authenticate();
  // eslint-disable-next-line no-console
  console.log('Database connection established.');

  server = app.listen(config.port, () => {
    // eslint-disable-next-line no-console
    console.log(
      `QuikDrop API listening on port ${config.port} (${config.nodeEnv})`
    );
  });

  server.on('error', (err) => {
    // eslint-disable-next-line no-console
    console.error('HTTP server error:', err);
    process.exit(1);
  });
}

async function shutdown(signal) {
  // eslint-disable-next-line no-console
  console.log(`\n${signal} received, shutting down gracefully...`);

  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await sequelize.close();

  // eslint-disable-next-line no-console
  console.log('Shutdown complete.');
  process.exit(0);
}

['SIGINT', 'SIGTERM'].forEach((signal) => {
  process.on(signal, () => {
    shutdown(signal).catch((err) => {
      // eslint-disable-next-line no-console
      console.error('Error during shutdown:', err);
      process.exit(1);
    });
  });
});

start().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start server:', err);
  process.exit(1);
});
