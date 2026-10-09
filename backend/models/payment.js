'use strict';

const { Model } = require('sequelize');

const METHODS = ['CASH', 'CARD', 'TRANSFER'];
const STATUSES = ['PENDING', 'SUCCESSFUL', 'FAILED', 'REFUNDED'];

module.exports = (sequelize, DataTypes) => {
  class Payment extends Model {
    static associate(models) {
      Payment.belongsTo(models.Delivery, {
        foreignKey: 'deliveryId',
        as: 'delivery',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });

      Payment.belongsTo(models.User, {
        foreignKey: 'customerId',
        as: 'customer',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });
    }
  }

  Payment.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      deliveryId: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'deliveries',
          key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
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
      amount: {
        type: DataTypes.DECIMAL(10, 2),
        allowNull: false,
        validate: {
          min: { args: [0.01], msg: 'amount must be greater than 0' },
          isDecimal: { msg: 'amount must be a decimal number' },
        },
        get() {
          const value = this.getDataValue('amount');
          return value === null || value === undefined ? null : parseFloat(value);
        },
      },
      method: {
        type: DataTypes.ENUM(...METHODS),
        allowNull: false,
        validate: {
          isIn: { args: [METHODS], msg: `method must be one of: ${METHODS.join(', ')}` },
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
      reference: {
        type: DataTypes.STRING(100),
        allowNull: true,
        unique: true,
      },
      paidAt: {
        type: DataTypes.DATE,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'Payment',
      tableName: 'payments',
    }
  );

  Payment.METHODS = METHODS;
  Payment.STATUSES = STATUSES;

  return Payment;
};
