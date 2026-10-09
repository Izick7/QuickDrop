'use strict';

const DELIVERY_STATUSES = [
  'PENDING',
  'CONFIRMED',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('delivery_status_history', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      deliveryId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'deliveries',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      fromStatus: {
        type: Sequelize.ENUM(...DELIVERY_STATUSES),
        allowNull: true,
      },
      toStatus: {
        type: Sequelize.ENUM(...DELIVERY_STATUSES),
        allowNull: false,
      },
      changedBy: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      note: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
        defaultValue: Sequelize.literal('CURRENT_TIMESTAMP'),
      },
    });

    await queryInterface.addIndex('delivery_status_history', ['deliveryId'], {
      name: 'delivery_status_history_delivery_id_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('delivery_status_history');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_delivery_status_history_fromStatus";'
    );
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_delivery_status_history_toStatus";'
    );
  },
};
