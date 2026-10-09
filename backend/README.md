# QuikDrop Backend (Stage 1 — Database)

Node.js + Express + PostgreSQL + Sequelize (CLI) backend for the QuikDrop delivery
platform. This stage contains **database schema only**: migrations, models, and
seeders. No routes, controllers, or auth logic yet.

## Setup

```bash
cp .env.example .env   # then edit credentials
npm install
npm run db:reset       # undo all → migrate → seed
npm run db:check       # connect + row counts + association query
```

`.env` is git-ignored. Only `.env.example` is committed.

Production uses a single `DATABASE_URL` connection string with SSL enabled; see
`config/config.js` (production block).

## Seeded accounts

Every seeded user shares the password **`Password123!`** (hashed with bcrypt).

| Email                        | Password       | Role     | Status    | Notes                        |
| ---------------------------- | -------------- | -------- | --------- | ---------------------------- |
| `admin@quikdrop.test`        | `Password123!` | ADMIN    | ACTIVE    |                              |
| `carla@quikdrop.test`        | `Password123!` | CUSTOMER | ACTIVE    |                              |
| `chris@quikdrop.test`        | `Password123!` | CUSTOMER | ACTIVE    |                              |
| `cindy@quikdrop.test`        | `Password123!` | CUSTOMER | INACTIVE  |                              |
| `randy.rider@quikdrop.test`  | `Password123!` | RIDER    | ACTIVE    | availability `AVAILABLE`     |
| `rita.rider@quikdrop.test`   | `Password123!` | RIDER    | ACTIVE    | availability `BUSY`          |
| `rex.rider@quikdrop.test`    | `Password123!` | RIDER    | SUSPENDED | availability `OFFLINE`       |

The seed also creates 8 deliveries across every status, matching payments, and
delivery status history. All seeders are reversible (`npm run db:seed:undo`).

## npm scripts

| Script                   | Description                                                    |
| ------------------------ | -------------------------------------------------------------- |
| `npm start`              | Run the app entrypoint (`node index.js`).                      |
| `npm run dev`            | Run with nodemon (auto-restart).                              |
| `npm run db:create`      | Create the database from config.                              |
| `npm run db:drop`        | Drop the database.                                             |
| `npm run db:migrate`     | Run all pending migrations.                                   |
| `npm run db:migrate:undo`| Undo the most recent migration.                               |
| `npm run db:migrate:undo:all` | Undo every migration (drops enum types cleanly).         |
| `npm run db:seed`        | Run all seeders.                                               |
| `npm run db:seed:undo`   | Revert all seeders.                                            |
| `npm run db:reset`       | `undo:all` → `migrate` → `seed` (full rebuild).               |
| `npm run db:check`       | Run `scripts/dbCheck.js` (counts + association sanity check). |

## Schema rules

- UUID primary keys and `createdAt`/`updatedAt` on every table.
- Postgres ENUMs for fixed value sets.
- `ON DELETE RESTRICT` on `deliveries.customerId`, `payments.customerId`,
  `payments.deliveryId`, and `delivery_status_history.changedBy`.
- `ON DELETE CASCADE` on `rider_profiles.userId` and
  `delivery_status_history.deliveryId`.
- `ON DELETE SET NULL` on `deliveries.riderId`.
- Partial unique index: at most one `SUCCESSFUL` payment per delivery.
- CHECK constraints: `deliveries.price > 0` and `payments.amount > 0`.
