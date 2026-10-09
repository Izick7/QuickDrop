'use strict';

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');

const config = require('./config');
const routes = require('./routes');
const notFound = require('./middleware/notFound');
const errorHandler = require('./middleware/errorHandler');

const app = express();

// Only trust forwarded headers when explicitly configured (default: off).
// This matters for correct client IPs behind a reverse proxy / load balancer.
if (config.trustProxy !== false) {
  app.set('trust proxy', config.trustProxy);
}

app.use(helmet());
app.use(cors({ origin: config.corsOrigin }));
app.use(morgan('dev', { skip: () => config.isTest }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  res.status(200).json({
    success: true,
    data: {
      status: 'ok',
      env: config.nodeEnv,
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    },
  });
});

app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

module.exports = app;
