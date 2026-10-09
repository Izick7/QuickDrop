# QuikDrop Backend (Stage 2D — Deliveries, Payments, Riders & Admin)

Node.js + Express (v5) + PostgreSQL + Sequelize backend for the QuikDrop delivery
platform. Stage 1 delivered the schema; Stage 2 added the HTTP layer:

- **2A** — bootstrap, authentication (JWT), user self-service.
- **2B** — customer deliveries and payments.
- **2C** — rider assignment and the delivery status machine.
- **2D** — the admin API, invariant-safe demo seeders, and the end-to-end suites.

All routes are mounted under `/api` and use the envelope
`{ success: true, data, message? }` / `{ success: false, message, errors? }`.
Responses never include `passwordHash`.

## Setup

```bash
cp .env.example .env   # then edit credentials
npm install
npm run db:reset       # undo all → migrate → seed
npm run db:check       # connect + row counts + association query
npm run dev            # start the API with nodemon (or `npm start`)
```

`.env` is git-ignored. Only `.env.example` is committed.

Production uses a single `DATABASE_URL` connection string with SSL enabled; see
`config/config.js` (production block).

## Environment variables

| Variable              | Default          | Description                                                                     |
| --------------------- | ---------------- | ------------------------------------------------------------------------------- |
| `NODE_ENV`            | `development`    | `production` enables `DATABASE_URL` SSL and the startup safety guards.          |
| `PORT`                | `5000`           | HTTP port.                                                                      |
| `DB_HOST`             | `127.0.0.1`      | Postgres host (development/test).                                               |
| `DB_PORT`             | `5432`           | Postgres port.                                                                  |
| `DB_NAME`             | —                | Postgres database name.                                                         |
| `DB_USER`             | —                | Postgres user.                                                                  |
| `DB_PASSWORD`         | —                | Postgres password.                                                              |
| `DB_NAME_TEST`        | `${DB_NAME}_test`| Database used when `NODE_ENV=test`.                                             |
| `DATABASE_URL`        | —                | Production connection string; takes precedence over the individual `DB_*` vars. |
| `JWT_SECRET`          | — (required)     | Token signing secret. Must be ≥ 32 chars when `NODE_ENV=production`.            |
| `JWT_EXPIRES_IN`      | `1d`             | JWT lifetime (jsonwebtoken syntax).                                             |
| `BCRYPT_ROUNDS`       | `10`             | bcrypt cost factor.                                                             |
| `AUTH_RATE_LIMIT_MAX` | `100`            | Max register/login requests per 15-minute window, per IP.                       |
| `CORS_ORIGIN`         | `*`              | Allowed origin. `*` is rejected at startup when `NODE_ENV=production`.          |
| `TRUST_PROXY`         | off              | Passed to `app.set('trust proxy', …)` (`true`, a hop count, or string).         |
| `BASE_PRICE`          | `200`            | Delivery base price.                                                            |
| `PRICE_PER_KG`        | `50`             | Per-kilogram surcharge; `price = BASE_PRICE + weight * PRICE_PER_KG`.           |

### Startup guards

When `NODE_ENV=production` the process refuses to boot if `JWT_SECRET` is shorter
than 32 characters or if `CORS_ORIGIN` is `*`.

## API endpoints

`Auth` column: `none` = public, `Bearer` = any authenticated user, otherwise the
required role. Every `/api/admin/*` route requires an `ADMIN`; every
`/api/deliveries/*` and `/api/payments` route requires a `CUSTOMER`; every
`/api/rider/*` route requires a `RIDER`.

### Health

| Method | Path          | Auth | Purpose        |
| ------ | ------------- | ---- | -------------- |
| `GET`  | `/api/health` | none | Liveness probe. |

### Auth & self-service

| Method  | Path                      | Auth   | Purpose                                                                 |
| ------- | ------------------------- | ------ | ----------------------------------------------------------------------- |
| `POST`  | `/api/auth/register`      | none   | Create a `CUSTOMER` (default) or `RIDER`; `ADMIN` is rejected.          |
| `POST`  | `/api/auth/login`         | none   | Exchange credentials for a JWT.                                         |
| `GET`   | `/api/auth/me`            | Bearer | Current user (includes `riderProfile` for riders).                      |
| `PATCH` | `/api/users/me`           | Bearer | Update own `fullName`/`phone`; riders also `vehicleType`/`plateNumber`. |
| `PATCH` | `/api/users/me/password`  | Bearer | Change own password (requires `currentPassword`).                       |

### Customer — deliveries & payments

| Method  | Path                              | Auth     | Purpose                                                                 |
| ------- | --------------------------------- | -------- | ----------------------------------------------------------------------- |
| `POST`  | `/api/deliveries`                 | CUSTOMER | Create a delivery; price is computed server-side.                       |
| `GET`   | `/api/deliveries`                 | CUSTOMER | List own deliveries (paginated, optional `status`).                     |
| `GET`   | `/api/deliveries/:id`             | CUSTOMER | Get one own delivery (with rider, payments, history).                   |
| `PATCH` | `/api/deliveries/:id`             | CUSTOMER | Edit a `PENDING` delivery; recomputes price if weight changes.          |
| `POST`  | `/api/deliveries/:id/cancel`      | CUSTOMER | Cancel a delivery with a required `reason`.                             |
| `POST`  | `/api/deliveries/:id/payments`    | CUSTOMER | Pay for a delivery (`CASH`/`CARD`/`TRANSFER`).                          |
| `GET`   | `/api/payments`                   | CUSTOMER | List own payments (paginated, optional `status`).                       |

### Rider

| Method  | Path                                 | Auth  | Purpose                                                          |
| ------- | ------------------------------------ | ----- | --------------------------------------------------------------- |
| `GET`   | `/api/rider/profile`                 | RIDER | Own rider profile (vehicle, plate, availability).               |
| `PATCH` | `/api/rider/availability`            | RIDER | Set `AVAILABLE`/`OFFLINE` (`BUSY` is system-managed).           |
| `GET`   | `/api/rider/deliveries/available`    | RIDER | Marketplace of `CONFIRMED`, unassigned deliveries.              |
| `POST`  | `/api/rider/deliveries/:id/accept`   | RIDER | Self-assign a `CONFIRMED` delivery.                             |
| `GET`   | `/api/rider/deliveries`              | RIDER | List own assignments (paginated, optional `status`).            |
| `GET`   | `/api/rider/deliveries/:id`          | RIDER | Get one own assignment (with customer details, history).        |
| `PATCH` | `/api/rider/deliveries/:id/status`   | RIDER | Advance `PICKED_UP` → `IN_TRANSIT` → `DELIVERED`.               |

### Admin

| Method  | Path                                    | Auth  | Purpose                                                                 |
| ------- | --------------------------------------- | ----- | ----------------------------------------------------------------------- |
| `GET`   | `/api/admin/dashboard`                  | ADMIN | Counts of deliveries/riders/users plus successful revenue.              |
| `GET`   | `/api/admin/users`                      | ADMIN | List users (`role`, `status`, `q` filters; paginated).                  |
| `POST`  | `/api/admin/users`                      | ADMIN | Create any user; `RIDER` needs `vehicleType`+`plateNumber`.             |
| `GET`   | `/api/admin/users/:id`                  | ADMIN | Get one user with delivery counts.                                      |
| `PATCH` | `/api/admin/users/:id`                  | ADMIN | Update `fullName`/`phone`/`status` (`role` is immutable).               |
| `GET`   | `/api/admin/riders`                     | ADMIN | List rider profiles (`status`, `availability` filters; paginated).      |
| `GET`   | `/api/admin/riders/:id`                 | ADMIN | Get one rider with delivery counts.                                     |
| `GET`   | `/api/admin/deliveries`                 | ADMIN | List all deliveries (`status`/`customerId`/`riderId`/`from`/`to`/`q`). |
| `GET`   | `/api/admin/deliveries/:id`             | ADMIN | Get one delivery with customer, rider, payments, history.               |
| `POST`  | `/api/admin/deliveries/:id/confirm`     | ADMIN | `PENDING` → `CONFIRMED` (requires an accounted payment).                |
| `POST`  | `/api/admin/deliveries/:id/assign`      | ADMIN | `CONFIRMED` → `ASSIGNED` to an available rider.                         |
| `POST`  | `/api/admin/deliveries/:id/reassign`    | ADMIN | Move an `ASSIGNED` delivery to another available rider.                 |
| `POST`  | `/api/admin/deliveries/:id/cancel`      | ADMIN | Cancel a delivery, with the admin-only override (see below).            |
| `GET`   | `/api/admin/payments`                   | ADMIN | List all payments (`status`/`method`/`deliveryId`/`customerId`/dates).  |
| `PATCH` | `/api/admin/payments/:id/status`        | ADMIN | Move a payment to `SUCCESSFUL`/`FAILED`/`REFUNDED`.                     |

## Delivery lifecycle

Every status change — from a customer, a rider, or an admin — funnels through a
single transition function, so the invariants below hold no matter who triggers
the change. Each transition also writes a `delivery_status_history` row naming
the actor and the note.

```
 PENDING ──confirm──▶ CONFIRMED ──assign / accept──▶ ASSIGNED
    │                     │  ▲                          │
    │                     │  └──────── unassign ────────┤
    │                     │                             │ pickup
    ▼                     ▼                             ▼
 CANCELLED ◀───────────────┘ (customer/admin)       PICKED_UP
    ▲                                                     │ transit
    │  cancel (ADMIN ONLY from PICKED_UP / IN_TRANSIT)    ▼
    └──────────────────────────────────────────────  IN_TRANSIT
                                                          │ deliver
                                                          ▼
                                                      DELIVERED
```

| From         | Allowed next (any actor)                    | Admin-only extra |
| ------------ | ------------------------------------------- | ---------------- |
| `PENDING`    | `CONFIRMED`, `CANCELLED`                    | —                |
| `CONFIRMED`  | `ASSIGNED`, `CANCELLED`                     | —                |
| `ASSIGNED`   | `PICKED_UP`, `CONFIRMED` (unassign), `CANCELLED` | —           |
| `PICKED_UP`  | `IN_TRANSIT`                                | `CANCELLED`      |
| `IN_TRANSIT` | `DELIVERED`                                 | `CANCELLED`      |
| `DELIVERED`  | (terminal)                                  | —                |
| `CANCELLED`  | (terminal)                                  | —                |

**Admin-only cancel override.** `PICKED_UP` and `IN_TRANSIT` may only be
cancelled by an `ADMIN`; a customer attempting it receives `409`. All other
cancels are available to the owning customer (for their own delivery) and to
admins.

**Rider effects.** Entering `ASSIGNED` requires an `ACTIVE` rider whose profile is
`AVAILABLE` and who has no other active delivery; the profile then becomes
`BUSY`. Leaving the active set (`DELIVERED`, `CANCELLED`, or unassign via
`CONFIRMED`) frees the rider back to `AVAILABLE`, unless they had parked
themselves `OFFLINE`. Cancelling or unassigning an active delivery clears
`riderId`.

**Payment effects.** Entering `DELIVERED` settles a pending `CASH` payment
(`PENDING` → `SUCCESSFUL`). Entering `CANCELLED` refunds captured money
(`SUCCESSFUL` → `REFUNDED`) and fails money still pending (`PENDING` → `FAILED`).

### Payment lifecycle

| From         | Allowed next            | Notes                                                            |
| ------------ | ----------------------- | ---------------------------------------------------------------- |
| `PENDING`    | `SUCCESSFUL`, `FAILED`  | Cash-on-delivery starts `PENDING` and settles on delivery.       |
| `SUCCESSFUL` | `REFUNDED`              | Only once the delivery is `CANCELLED` or `DELIVERED`.            |
| `FAILED`     | (terminal)              |                                                                  |
| `REFUNDED`   | (terminal)              |                                                                  |

`CARD` and `TRANSFER` are captured immediately (`SUCCESSFUL`); `CASH` stays
`PENDING`. A partial unique index enforces at most one `SUCCESSFUL` payment per
delivery.

## Seeded accounts

Every seeded user shares the password **`Password123!`** (hashed with bcrypt).

| Email                       | Role     | Status      | Rider availability |
| --------------------------- | -------- | ----------- | ------------------ |
| `admin@quikdrop.test`       | ADMIN    | ACTIVE      | —                  |
| `carla@quikdrop.test`       | CUSTOMER | ACTIVE      | —                  |
| `chris@quikdrop.test`       | CUSTOMER | ACTIVE      | —                  |
| `cindy@quikdrop.test`       | CUSTOMER | INACTIVE    | —                  |
| `randy.rider@quikdrop.test` | RIDER    | ACTIVE      | `BUSY`             |
| `rita.rider@quikdrop.test`  | RIDER    | ACTIVE      | `BUSY`             |
| `rex.rider@quikdrop.test`   | RIDER    | SUSPENDED   | `OFFLINE`          |
| `milo.rider@quikdrop.test`  | RIDER    | ACTIVE      | `BUSY`             |
| `nadia.rider@quikdrop.test` | RIDER    | ACTIVE      | `AVAILABLE`        |

The seed also creates 8 deliveries spanning every status, their matching
payments, and the full status history — chosen so the demo data satisfies every
invariant (active deliveries have riders, `DELIVERED` deliveries have a
`SUCCESSFUL` payment, `CANCELLED` ones only `REFUNDED`/`FAILED`). All seeders are
reversible (`npm run db:seed:undo`).

## Running the test suites

All three suites are plain Node scripts that call a **running** server over HTTP;
the smoke and e2e suites additionally reset nothing themselves, so start from a
fresh database.

```bash
npm run db:reset          # rebuild + seed the database
npm start                 # leave the API running (or `npm run dev`)
npm run test:smoke        # smoke-auth.js then smoke-deliveries.js
npm run test:e2e          # e2e.js (full admin/permission scenario sweep)
```

Both `test:smoke` and `test:e2e` assume the database was freshly reset with
`npm run db:reset` and that the server is already running. Each script prints
`PASS`/`FAIL` per step and exits non-zero on any failure. The e2e suite is
re-runnable: it restores the admin accounts it mutates.

The suites can also be run directly: `node scripts/smoke-auth.js`,
`node scripts/smoke-deliveries.js`, `node scripts/e2e.js`. Override the target
with `E2E_BASE_URL` (e2e) if the API is not on `http://localhost:5000`.

## Postman

Import both files from `postman/`:

- `QuikDrop.postman_collection.json` — every endpoint, grouped Health / Auth /
  Customer / Rider / Admin. Login and create requests capture tokens and ids
  into the environment as you run them.
- `QuikDrop.postman_environment.json` — `QuikDrop Local`, pre-filled with the
  seeded ids and the local `baseUrl`.

Select the **QuikDrop Local** environment, then run the requests top-to-bottom.
Requires the seeded database (`npm run db:reset`) and a running server.

## npm scripts

| Script                        | Description                                                      |
| ----------------------------- | ---------------------------------------------------------------- |
| `npm start`                   | Run the app entrypoint (`node src/server.js`).                   |
| `npm run dev`                 | Run with nodemon (auto-restart).                                 |
| `npm run db:create`           | Create the database from config.                                 |
| `npm run db:drop`             | Drop the database.                                               |
| `npm run db:migrate`          | Run all pending migrations.                                      |
| `npm run db:migrate:undo`     | Undo the most recent migration.                                  |
| `npm run db:migrate:undo:all` | Undo every migration (drops enum types cleanly).                 |
| `npm run db:seed`             | Run all seeders.                                                 |
| `npm run db:seed:undo`        | Revert all seeders.                                              |
| `npm run db:reset`            | `undo:all` → `migrate` → `seed` (full rebuild).                  |
| `npm run db:check`            | Run `scripts/dbCheck.js` (counts + association sanity check).    |
| `npm run test:smoke`          | `smoke-auth.js` then `smoke-deliveries.js` (server must be up).  |
| `npm run test:e2e`            | `scripts/e2e.js` (server must be up).                            |

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
