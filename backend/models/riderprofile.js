'use strict';

const { Model } = require('sequelize');

const AVAILABILITIES = ['AVAILABLE', 'BUSY', 'OFFLINE'];

module.exports = (sequelize, DataTypes) => {
  class RiderProfile extends Model {
    static associate(models) {
      RiderProfile.belongsTo(models.User, {
        foreignKey: 'userId',
        as: 'user',
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      });
    }
  }

  RiderProfile.init(
    {
      id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true,
        allowNull: false,
      },
      userId: {
        type: DataTypes.UUID,
        allowNull: false,
        unique: true,
        references: {
          model: 'users',
          key: 'id',
        },
        onDelete: 'CASCADE',
        onUpdate: 'CASCADE',
      },
      vehicleType: {
        type: DataTypes.STRING(60),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'vehicleType cannot be empty' },
        },
      },
      plateNumber: {
        type: DataTypes.STRING(30),
        allowNull: false,
        validate: {
          notEmpty: { msg: 'plateNumber cannot be empty' },
        },
      },
      availability: {
        type: DataTypes.ENUM(...AVAILABILITIES),
        allowNull: false,
        defaultValue: 'OFFLINE',
        validate: {
          isIn: {
            args: [AVAILABILITIES],
            msg: `availability must be one of: ${AVAILABILITIES.join(', ')}`,
          },
        },
      },
    },
    {
      sequelize,
      modelName: 'RiderProfile',
      tableName: 'rider_profiles',
    }
  );

  RiderProfile.AVAILABILITIES = AVAILABILITIES;

  return RiderProfile;
};
