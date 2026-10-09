'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('payments', {
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
        onDelete: 'RESTRICT',
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
      amount: {
        type: Sequelize.DECIMAL(10, 2),
        allowNull: false,
      },
      method: {
        type: Sequelize.ENUM('CASH', 'CARD', 'TRANSFER'),
        allowNull: false,
      },
      status: {
        type: Sequelize.ENUM('PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'),
        allowNull: false,
        defaultValue: 'PENDING',
      },
      reference: {
        type: Sequelize.STRING(100),
        allowNull: true,
        unique: true,
      },
      paidAt: {
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

    await queryInterface.addIndex('payments', ['deliveryId'], {
      name: 'payments_delivery_id_idx',
    });
    await queryInterface.addIndex('payments', ['status'], {
      name: 'payments_status_idx',
    });

    // At most one SUCCESSFUL payment per delivery.
    await queryInterface.sequelize.query(
      'CREATE UNIQUE INDEX "payments_delivery_id_successful_uidx" ON "payments" ("deliveryId") WHERE "status" = \'SUCCESSFUL\';'
    );

    await queryInterface.sequelize.query(
      'ALTER TABLE "payments" ADD CONSTRAINT "payments_amount_positive_check" CHECK ("amount" > 0);'
    );
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query(
      'ALTER TABLE "payments" DROP CONSTRAINT IF EXISTS "payments_amount_positive_check";'
    );
    await queryInterface.sequelize.query(
      'DROP INDEX IF EXISTS "payments_delivery_id_successful_uidx";'
    );
    await queryInterface.dropTable('payments');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payments_method";');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_payments_status";');
  },
};
