'use strict';

/**
 * Stage 1 sanity check.
 * - Connects and authenticates against the configured database.
 * - Prints row counts for every application table.
 * - Runs one eager-loaded query (delivery + customer + rider + payments)
 *   to prove the model associations are wired up correctly.
 */

require('dotenv').config();

const {
  sequelize,
  User,
  RiderProfile,
  Delivery,
  Payment,
  DeliveryStatusHistory,
} = require('../models');

const TABLES = [
  ['users', User],
  ['rider_profiles', RiderProfile],
  ['deliveries', Delivery],
  ['payments', Payment],
  ['delivery_status_history', DeliveryStatusHistory],
];

async function main() {
  console.log('Connecting to database...');
  await sequelize.authenticate();
  console.log(`Connected. Dialect: ${sequelize.getDialect()}\n`);

  console.log('Row counts');
  console.log('----------');
  for (const [label, model] of TABLES) {
    const count = await model.count();
    console.log(`${label.padEnd(26)} ${count}`);
  }
  console.log('');

  console.log('Association check: one DELIVERED delivery with customer, rider and payments');
  console.log('----------------------------------------------------------------------------');
  const delivery = await Delivery.findOne({
    where: { status: 'DELIVERED' },
    include: [
      { model: User, as: 'customer' },
      { model: User, as: 'rider' },
      { model: Payment, as: 'payments' },
    ],
    order: [['deliveredAt', 'DESC']],
  });

  if (!delivery) {
    console.log('No DELIVERED delivery found (did you run `npm run db:seed`?).');
  } else {
    const customer = delivery.customer.toJSON();
    const rider = delivery.rider ? delivery.rider.toJSON() : null;
    if (customer.passwordHash) delete customer.passwordHash;
    if (rider && rider.passwordHash) delete rider.passwordHash;

    console.log(
      JSON.stringify(
        {
          deliveryId: delivery.id,
          status: delivery.status,
          price: delivery.price,
          customer,
          rider,
          payments: delivery.payments.map((p) => p.toJSON()),
        },
        null,
        2
      )
    );
  }

  await sequelize.close();
}

main()
  .then(() => {
    console.log('\nDB check completed successfully.');
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nDB check failed:');
    console.error(err);
    process.exit(1);
  });
