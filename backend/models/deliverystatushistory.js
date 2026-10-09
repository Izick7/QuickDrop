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
  class DeliveryStatusHistory extends Model {
    static associate(models) {
      DeliveryStatusHistory.belongsTo(models.Delivery, {
        foreignKey: 'deliveryId',
        as: 'delivery',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      });

      DeliveryStatusHistory.belongsTo(models.User, {
        foreignKey: 'changedBy',
        as: 'changedByUser',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });
    }
  }

  DeliveryStatusHistory.init(
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
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      fromStatus: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: true,
        validate: {
          isIn: { args: [STATUSES], msg: `fromStatus must be one of: ${STATUSES.join(', ')}` },
        },
      },
      toStatus: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        validate: {
          isIn: { args: [STATUSES], msg: `toStatus must be one of: ${STATUSES.join(', ')}` },
        },
      },
      changedBy: {
        type: DataTypes.UUID,
        allowNull: false,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      },
      note: {
        type: DataTypes.TEXT,
        allowNull: true,
      },
    },
    {
      sequelize,
      modelName: 'DeliveryStatusHistory',
      tableName: 'delivery_status_history',
    }
  );

  DeliveryStatusHistory.STATUSES = STATUSES;

  return DeliveryStatusHistory;
};
