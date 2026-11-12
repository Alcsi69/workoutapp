# WorkoutApp Coach Server (`/server`)

A standalone coach backend for the WorkoutApp Human-Coach platform. It serves the
client sync API, the coach admin REST API, and the dark-mode admin web — all from
one process, on one port, with **zero runtime dependencies** (`node:http` +
`node:sqlite`). Nothing compiles natively.

## Requirements

- **Node ≥ 22.5** (for the stable `node:sqlite` module; this repo runs Node 26).

## Run

```bash
# from the repo root
npm run server:build      # tsc -p server/tsconfig.json  -> server/dist
npm run server:start      # node server/dist/server/src/index.js

# or directly in server/
npm --prefix server run build
npm --prefix server start

# environment overrides
PORT=4100 HOST=127.0.0.1 npm run server:start
```

Open the admin web at **http://localhost:4000/admin**.

- REST API base: `http://localhost:4000/api`
- Health: `http://localhost:4000/api/health`
- Database: `server/data/coach-platform.db` (created on first run; ignored by git).

## Type sharing

The server compiles the shared, pure-TypeScript contracts straight from the mobile
app — `src/types/workout.ts` (domain types) and `src/db/catalogData.ts` (the
157-exercise catalog) — via its `tsconfig.json` `include` list. There is no type
duplication; the wire contracts stay identical on both sides.

## Endpoints

### Authentication

Credentials are stored as a salted `crypto.scrypt` hash (no native addons), with
a unique case-insensitive username key. Successful calls return an opaque bearer
token valid for 180 days plus the account's full state (profile, billing, workout
logs, coach plans/bookings/slots).

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/auth/register` | Create an account, or attach credentials to an existing `userId` (pre-auth profile upgrade). Optional `profile` + `billingProfile` snapshots are stored with it. |
| `POST` | `/api/auth/login` | Verify username + password and return the token and full sync state. |

### Client sync

Send `Authorization: Bearer <token>` to scope the request to the authenticated
account. Requests without the header keep working for installations that have
not created an account yet (legacy `userId`/`deviceId` path).

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/sync/push` | Ingest the client's onboarding profile, billing record, dirty sessions and bookings. The token's user id wins over any body `userId`. |
| `GET` | `/api/sync/pull?userId=…` | Return the coach's assignments plus the account snapshot (profile, billing, workout logs) so a fresh device/PWA can restore itself. |

### Coach admin

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/clients` | Every synced client with biometrics, joint constraints, billing and counts. |
| `GET` | `/api/admin/clients/:userId` | Full client detail: profile, billing, workout history, assigned plans, bookings. |
| `GET` | `/api/admin/clients/:userId/invoice-export` | JSON (default) or `?format=csv` Számlázz.hu / Billingo-ready billing summary + completed sessions in `?from=&to=`. |
| `POST` | `/api/admin/clients/:userId/templates` | Create/update a `source: 'coach'` workout plan for the client. |
| `DELETE` | `/api/admin/templates/:templateId` | Delete a coach plan. |
| `GET` | `/api/admin/exercises` | The 157-exercise catalog (with knee/axial load scores). |
| `GET`/`POST` | `/api/admin/slots` | List / create 1-on-1 slots (`online_call` or `irl_gym`). |
| `DELETE` | `/api/admin/slots/:slotId` | Remove a slot (its bookings are cancelled first). |
| `PATCH` | `/api/admin/bookings/:bookingId` | Confirm / complete / cancel a booking and attach `coachNotes` + a meeting link. |

CORS reflects the configured allowlist (or `*` via `CORS_ORIGINS`) and `OPTIONS`
preflight is handled, so the admin web and a LAN-hosted dev client can both talk
to it. `Authorization` is an allowed request header.

## Admin web

`server/public/admin/` is a build-free, dark-mode single-page app (vanilla JS)
served at `/admin`. Views: **Áttekintés**, **Ügyfelek & Számlázás**, **Edzésterv
készítő**, **Időpontok & Foglalások**, **Gyakorlatok**.

## Verification

```bash
# from the repo root — boots the server in-memory and drives a full push/pull
npm run verify:server
```
