'use strict';

// Single import point for the Sequelize instance and all models.
// The models live at the project root (Stage 1) and are loaded there.
const db = require('../../models');

module.exports = db;
