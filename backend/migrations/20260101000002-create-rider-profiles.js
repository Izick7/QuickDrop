'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('rider_profiles', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: Sequelize.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE',
      },
      vehicleType: {
        type: Sequelize.STRING(60),
        allowNull: false,
      },
      plateNumber: {
        type: Sequelize.STRING(30),
        allowNull: false,
      },
      availability: {
        type: Sequelize.ENUM('AVAILABLE', 'BUSY', 'OFFLINE'),
        allowNull: false,
        defaultValue: 'OFFLINE',
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

    await queryInterface.addIndex('rider_profiles', ['availability'], {
      name: 'rider_profiles_availability_idx',
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('rider_profiles');
    await queryInterface.sequelize.query(
      'DROP TYPE IF EXISTS "enum_rider_profiles_availability";'
    );
  },
};
