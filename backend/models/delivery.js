'use strict';

const { Model } = require('sequelize');

const STATUSES = [
  'PENDING',
  'CONFIRMED',
  'ASSIGNED',
  'PICKED_UP',
  'IN_TRANSIT',
  'DELIVERED',
  'CANCELLED',
];

module.exports = (sequelize, DataTypes) => {
  class Delivery extends Model {
    static associate(models) {
      Delivery.belongsTo(models.User, {
        foreignKey: 'customerId',
        as: 'customer',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });

      Delivery.belongsTo(models.User, {
        foreignKey: 'riderId',
        as: 'rider',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      });

      Delivery.hasMany(models.Payment, {
        foreignKey: 'deliveryId',
        as: 'payments',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });

      Delivery.hasMany(models.DeliveryStatusHistory, {
        foreignKey: 'deliveryId',
        as: 'statusHistory',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      });
    }
  }

  Delivery.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      customerId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      riderId: {
        type: DataTypes.UUID,
        allowNull: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      },
      pickupAddress: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'pickupAddress cannot be empty' },
        },
      },
      pickupContactName: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'pickupContactName cannot be empty' },
        },
      },
      pickupContactPhone: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'pickupContactPhone cannot be empty' },
        },
      },
      dropoffAddress: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'dropoffAddress cannot be empty' },
        },
      },
      dropoffContactName: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'dropoffContactName cannot be empty' },
        },
      },
      dropoffContactPhone: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'dropoffContactPhone cannot be empty' },
        },
      },
      packageDescription: {
        type: DataTypes.TEXT,
        allowNull: false,
        validate: {
          notEmpty: { msg: 'packageDescription cannot be empty' },
        },
      },
      packageWeightKg: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: true,
        validate: {
          min: { args: [0], msg: 'packageWeightKg cannot be negative' },
          isDecimal: { msg: 'packageWeightKg must be a decimal number' },
        },
        get() {
          const value = this.getDataValue('packageWeightKg');
          return value === null || value === undefined ? null : parseFloat(value);
        },
      },
      notes: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      price: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
          min: { args: [0.01], msg: 'price must be greater than 0' },
          isDecimal: { msg: 'price must be a decimal number' },
        },
        get() {
          const value = this.getDataValue('price');
          return value === null || value === undefined ? null : parseFloat(value);
        },
      },
      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'PENDING',
        validate: {
          isIn: { args: [STATUSES], msg: `status must be one of: ${STATUSES.join(', ')}` },
        },
      },
      cancelledReason: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
      assignedAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      pickedUpAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      deliveredAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
      cancelledAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Delivery',
      tableName: 'deliveries',
    }
  );

  Delivery.STATUSES = STATUSES;

  return Delivery;
};
