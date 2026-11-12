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

Send `Authorization: Bearer <token>` (from `/api/auth/login`) on every call. The
token is the ONLY source of the caller's identity: a `userId` in the body or query
string is ignored, and requests without a valid token are rejected with `401`.

| Method | Path | Purpose |
| --- | --- | --- |
| `POST` | `/api/sync/push` | Ingest the client's onboarding profile, billing record, dirty sessions and bookings, scoped to the token's user. |
| `GET` | `/api/sync/pull` | Return the coach's assignments plus the account snapshot (profile, billing, workout logs) for the token's user. |

### Coach admin

Every `/api/admin/*` call requires `Authorization: Bearer <ADMIN_TOKEN>` (a random
per-boot token is generated and logged when the env var is unset); the admin web
prompts for it once and keeps it in `localStorage`. The static `/admin` page itself
is public but renders nothing useful without the token.

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
