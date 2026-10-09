# QuikDrop Backend (Stage 2 — Auth & Users)

Node.js + Express (v5) + PostgreSQL + Sequelize backend for the QuikDrop delivery
platform. Stage 1 delivered the database schema; Stage 2 adds the HTTP layer:
application bootstrap, authentication (JWT), and the user self-service endpoints.

## Setup

```bash
cp .env.example .env   # then edit credentials
npm install
npm run db:reset       # undo all → migrate → seed
npm run db:check       # connect + row counts + association query
npm run dev            # start the API with nodemon (or `npm start`)
node scripts/smoke-auth.js   # end-to-end auth smoke test (server must be running)
```

`.env` is git-ignored. Only `.env.example` is committed.

Production uses a single `DATABASE_URL` connection string with SSL enabled; see
`config/config.js` (production block).

## Environment variables

| Variable              | Default       | Description                                                                    |
| --------------------- | ------------- | ------------------------------------------------------------------------------ |
| `NODE_ENV`            | `development` | `production` enables `DATABASE_URL` SSL and the startup safety guards.         |
| `PORT`                | `5000`        | HTTP port.                                                                     |
| `JWT_SECRET`          | — (required)  | Token signing secret. Must be ≥ 32 chars when `NODE_ENV=production`.           |
| `JWT_EXPIRES_IN`      | `1d`          | JWT lifetime (jsonwebtoken syntax).                                            |
| `BCRYPT_ROUNDS`       | `10`          | bcrypt cost factor.                                                            |
| `AUTH_RATE_LIMIT_MAX` | `100`         | Max register/login requests per 15-minute window, per IP.                      |
| `CORS_ORIGIN`         | `*`           | Allowed origin. `*` is rejected at startup when `NODE_ENV=production`.         |
| `TRUST_PROXY`         | off           | When set, passed to `app.set('trust proxy', …)` (`true`, a hop count, or string). |
| `BASE_PRICE`          | `200`         | Reserved for pricing (later stages).                                           |
| `PRICE_PER_KG`        | `50`          | Reserved for pricing (later stages).                                           |

### Startup guards

When `NODE_ENV=production` the process refuses to boot if `JWT_SECRET` is shorter
than 32 characters or if `CORS_ORIGIN` is `*`.

## API endpoints (Stage 2)

All routes are mounted under `/api` and use the envelope
`{ success: true, data }` / `{ success: false, message, errors? }`.

| Method  | Path                       | Auth   | Description                                                       |
| ------- | -------------------------- | ------ | ----------------------------------------------------------------- |
| `GET`   | `/api/health`              | none   | Liveness probe.                                                    |
| `POST`  | `/api/auth/register`       | none   | Create a `CUSTOMER` (default) or `RIDER`. `ADMIN` is rejected.     |
| `POST`  | `/api/auth/login`          | none   | Exchange credentials for a JWT.                                    |
| `GET`   | `/api/auth/me`             | Bearer | Current user (includes `riderProfile` for riders).                 |
| `PATCH` | `/api/users/me`            | Bearer | Update `fullName`/`phone`; riders also `vehicleType`/`plateNumber`.|
| `PATCH` | `/api/users/me/password`   | Bearer | Change password (requires `currentPassword`).                      |

Registering a rider creates the user **and** their `rider_profiles` row
(availability `OFFLINE`) in a single transaction. Responses never include
`passwordHash`.

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
| `npm start`              | Run the app entrypoint (`node src/server.js`).                 |
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
