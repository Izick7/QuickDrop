# QuickDrop frontend

An independent React and Vite application in `frontend/`. It uses the QuickDrop backend as the source of truth for accounts, deliveries, status changes, and payment records.

## Requirements and startup

- Node.js 20.19+ or 22.12+ and npm (required by the current Vite release).
- The backend running at `http://localhost:5000` with its existing database.

From this directory:

```sh
npm install
cp .env.example .env
npm run dev
```

The Vite server is available at `http://localhost:5173`. Configure `VITE_API_BASE_URL` in `.env` to the API root (default `http://localhost:5000/api`). This value is public browser configuration; do not put secrets in it.

To start the backend, open a second terminal in `../backend/` and run `npm start`. Use its existing environment and database setup; this frontend does not migrate, seed, or reset the database.

## Build and checks

```sh
npm run build
npm run lint
```

## Routes

- `/` — public QuickDrop overview.
- `/login`, `/register` — backend authentication and customer/rider registration.
- `/app` — role-aware dashboard.
- `/app/deliveries`, `/app/deliveries/:id` — current user's deliveries, rider assignments, or admin delivery inspection.
- `/app/new` — customer delivery creation.
- `/app/available` — rider marketplace and delivery acceptance.
- `/app/payments` — customer payment history or admin payment records.
- `/app/profile` — customer/rider profile and password management.
- `/app/users`, `/app/riders` — admin account management and rider inspection.

Protected screens wait for `GET /auth/me` before rendering. The bearer token is stored in browser local storage, sent only in the `Authorization: Bearer` header, and cleared when session restoration fails. The API remains responsible for permissions and ownership; browser route checks only guide navigation.

## API integration

All paths below are relative to `/api`; every request is sent through the shared JSON client, which unwraps `{ success, data, message? }`, reports backend `{ success: false, message, errors? }`, and distinguishes network failures.

- Auth and self-service: `POST /auth/login`, `POST /auth/register`, `GET /auth/me`, `PATCH /users/me`, `PATCH /users/me/password`.
- Customer deliveries: `GET /deliveries`, `POST /deliveries`, `GET /deliveries/:id`, `PATCH /deliveries/:id`, `POST /deliveries/:id/cancel`, `POST /deliveries/:id/payments`, `GET /payments`.
- Rider: `GET /rider/profile`, `PATCH /rider/availability`, `GET /rider/deliveries/available`, `POST /rider/deliveries/:id/accept`, `GET /rider/deliveries`, `GET /rider/deliveries/:id`, `PATCH /rider/deliveries/:id/status`.
- Admin: `GET /admin/dashboard`, `GET /admin/users`, `POST /admin/users`, `PATCH /admin/users/:id`, `GET /admin/riders`, `GET /admin/deliveries`, `GET /admin/deliveries/:id`, `POST /admin/deliveries/:id/confirm`, `POST /admin/deliveries/:id/assign`, `POST /admin/deliveries/:id/reassign`, `POST /admin/deliveries/:id/cancel`, `GET /admin/payments`, `PATCH /admin/payments/:id/status`.

## Implemented workflows

- Customers can create and view their own deliveries, review status history and payment records, record one supported payment method (`CASH`, `CARD`, or `TRANSFER`), cancel eligible deliveries, and update their profile/password.
- Riders can review their assigned work and marketplace deliveries, accept available confirmed deliveries, update availability, progress assigned work through the backend's supported rider statuses, and update their profile/password.
- Admins can inspect dashboard counts, users, riders, deliveries, and payments; create user accounts; update user status; confirm eligible deliveries; assign or reassign an available rider; cancel eligible deliveries; and apply permitted payment status changes.
- The payment UI records only the backend's method/status data. It does not collect card numbers or claim a card gateway transaction took place.

## Limitations

- Customer delivery editing is supported by the API but is not exposed as a form yet; detail view supports current payment and cancellation actions.
- A richer admin user detail view is not exposed in this iteration.
- The app cannot display live information while the backend is unreachable. In that case it shows a retryable API/network error.
- Browser automation was unavailable in this environment, so I could not click through the UI, inspect the browser console, or capture desktop/mobile screenshots.

## Deployment preparation

Set `VITE_API_BASE_URL` to the deployed API origin before building, configure backend CORS for the frontend origin, then run `npm run build` and publish the generated `dist/` directory behind a static host with history fallback to `index.html`. The JWT is browser-visible application state, so production transport must use HTTPS. No deployment or external publishing is performed by this project.
