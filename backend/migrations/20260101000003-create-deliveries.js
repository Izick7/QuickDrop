'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('deliveries', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      customerId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT',
      },
      riderId: {
        type: Sequelize.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL',
      },
      pickupAddress: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      pickupContactName: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      pickupContactPhone: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      dropoffAddress: {
        type: Sequelize.STRING(255),
        allowNull: false,
      },
      dropoffContactName: {
        type: Sequelize.STRING(120),
        allowNull: false,
      },
      dropoffContactPhone: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      packageDescription: {
        type: Sequelize.TEXT,
        allowNull: false,
      },
      packageWeightKg: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: true,
      },
      notes: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      price: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM(
          'PENDING',
          'CONFIRMED',
          'ASSIGNED',
          'PICKED_UP',
          'IN_TRANSIT',
          'DELIVERED',
          'CANCELLED'
        ),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      cancelledReason: {
        type: Sequelize.TEXT,
        allowNull: true,
      },
      assignedAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      pickedUpAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      deliveredAt: {
        type: Sequelize.DATE,
        allowNull: true,
      },
      cancelledAt: {
        type: Sequelize.DATE,
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

    await queryInterface.addIndex('deliveries', ['customerId'], {
      name: 'deliveries_customer_id_idx',
    });
    await queryInterface.addIndex('deliveries', ['riderId'], {
      name: 'deliveries_rider_id_idx',
    });
    await queryInterface.addIndex('deliveries', ['status'], {
      name: 'deliveries_status_idx',
    });
    await queryInterface.addIndex('deliveries', ['riderId', 'status'], {
      name: 'deliveries_rider_id_status_idx',
    });

    await queryInterface.sequelize.query(
      'ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_price_positive_check" CHECK ("price" > 0);'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE "deliveries" DROP CONSTRAINT IF EXISTS "deliveries_price_positive_check";'
    );
    await queryInterface.dropTable('deliveries');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_deliveries_status";');
  },
};
