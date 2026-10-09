'use strict';

const { Model } = require('sequelize');

const ROLES = ['CUSTOMER', 'RIDER', 'ADMIN'];
const STATUSES = ['ACTIVE', 'INACTIVE', 'SUSPENDED'];

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasOne(models.RiderProfile, {
        foreignKey: 'userId',
        as: 'riderProfile',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      });

      User.hasMany(models.Delivery, {
        foreignKey: 'customerId',
        as: 'customerDeliveries',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });

      User.hasMany(models.Delivery, {
        foreignKey: 'riderId',
        as: 'riderDeliveries',
        onDelete: 'SET NULL',
        onUpdate: 'CASCADE',
      });

      User.hasMany(models.Payment, {
        foreignKey: 'customerId',
        as: 'payments',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });

      User.hasMany(models.DeliveryStatusHistory, {
        foreignKey: 'changedBy',
        as: 'statusChanges',
        onDelete: 'RESTRICT',
        onUpdate: 'CASCADE',
      });
    }
  }

  User.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      fullName: {
        type: DataTypes.STRING(120),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'fullName cannot be empty' },
          len: { args: [2, 120], msg: 'fullName must be between 2 and 120 characters' },
        },
      },
      email: {
        type: DataTypes.STRING(160),
        allowNull: false,
        unique: true,
        validate: {
          notEmpty: { msg: 'email cannot be empty' },
          isEmail: { msg: 'email must be a valid email address' },
        },
      },
      phone: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'phone cannot be empty' },
        },
      },
      passwordHash: {
        type: DataTypes.STRING(255),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'passwordHash cannot be empty' },
        },
      },
      role: {
        type: DataTypes.ENUM(...ROLES),
        allowNull: false,
        defaultValue: 'CUSTOMER',
        validate: {
          isIn: { args: [ROLES], msg: `role must be one of: ${ROLES.join(', ')}` },
        },
      },
      status: {
        type: DataTypes.ENUM(...STATUSES),
        allowNull: false,
        defaultValue: 'ACTIVE',
        validate: {
          isIn: { args: [STATUSES], msg: `status must be one of: ${STATUSES.join(', ')}` },
        },
      },
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'users',
      defaultScope: {
        attributes: { exclude: ['passwordHash'] },
      },
      scopes: {
        withPassword: {
          attributes: { include: ['passwordHash'] },
        },
      },
    }
  );

  User.ROLES = ROLES;
  User.STATUSES = STATUSES;

  return User;
};
