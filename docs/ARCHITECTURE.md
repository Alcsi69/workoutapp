# Workout App Architecture & Engineering Rules

## 1. Core Tech Stack
- **Framework:** React Native with Expo SDK 58 (Managed Workflow) + TypeScript (strict mode).
- **Routing:** Expo Router (file-based routing in `src/app/`).
- **Local Database (Offline-First):** `expo-sqlite` for workout templates, exercise catalog, active session state, completed workout logs, client billing, and 1-on-1 coaching bookings. **Schema v6** (see `src/db/schema.ts`).
- **State Management:** Zustand (`src/store/`) for ephemeral active workout UI state (rest timers, onboarding draft, quick swaps).
- **Styling:** `StyleSheet.create` with a centralized design token file (`src/theme/tokens.ts`). Dark-mode native by default. Zero heavy third-party component libraries. The palette is exactly five brand colors — Licorice `#131112`, Ghost White `#F7F7FF`, Royal Blue `#2563EB`, Electric Lime `#CCFF00`, Ruby Magenta `#D81159` — with card surfaces/borders derived as subtle tints of licorice and ghost white. Buttons: `primary` = lime + dark text, `secondary` = royal blue, `danger` = magenta, `ghost` = text only.
- **Cross-platform:** the same bundle runs natively and on the web (Expo Web, `web.output: "single"`, exported to `dist/`). `expo-sqlite` uses wa-sqlite/IndexedDB on web, which requires `.wasm` as a Metro asset plus `Cross-Origin-Opener-Policy: same-origin` / `Cross-Origin-Embedder-Policy: credentialless` on both the dev server and the production host.
- **Localization:** Hungarian (`hu`) primary UI language, structured via a clean dictionary (`src/i18n/hu.ts`) so strings are never hardcoded in components.
- **Clipboard:** `expo-clipboard` powers the full-database JSON backup/restore in the Profil tab.

## 2. Target Directory Structure
```text
src/
├── app/                  # Expo Router screens
│   ├── (tabs)/           # Main bottom tab navigation (Edzés, Sablonok, Időpontok, Előzmények, Profil)
│   ├── onboarding/       # Multi-step onboarding survey flow (5 steps, incl. account creation)
│   ├── login.tsx         # Returning-user login (restores the account onto a fresh device/PWA)
│   ├── workout/[id].tsx  # Active workout logger (mid-workout add/remove/reorder)
│   └── _layout.tsx       # Root layout & SQLite initialization
├── components/           # Reusable, stateless UI building blocks
│   ├── logger/           # Logger-specific pieces (ExerciseBlockCard, PlateCalculatorModal, ...)
│   ├── onboarding/       # StepBiometrics, StepSchedule, StepConstraints, StepContact, StepAccount
│   ├── booking/          # BookingModal (1-on-1 slot reservation)
│   ├── profile/          # BillingCard (contact & billing editor), AccountCard (credentials/logout status)
│   └── history/          # History/progression views
├── db/                   # SQLite schema migrations, seed data, and typed query helpers
├── i18n/                 # Localization strings (hu.ts)
├── services/             # Pure logic + API clients (analytics, billing, plateCalculator, ...)
├── store/                # Zustand stores (useActiveWorkoutStore, useOnboardingStore)
├── theme/                # Color, spacing, and typography tokens
└── types/                # Strict TypeScript interfaces (workout.ts)
```

## 3. Database Schema (v6)
Thirteen tables, all snake_case, JSON columns stored as `TEXT`:

| Table | Purpose |
| --- | --- |
| `exercise_catalog` | Seeded + user-created exercises (v4 adds `equipment`, `movement_pattern`, `is_custom`). |
| `workout_templates` | Program/custom/coach template definitions (v5 adds `source`, `coach_note`, `assigned_at`). |
| `template_exercise_blocks` | Ordered blocks of a template, with `target_sets`/`target_reps`. |
| `session_logs` | Completed + in-progress sessions; `sync_status` drives the offline queue. |
| `session_exercise_blocks` | Blocks copied into a session; carry the prescription + substitutions. |
| `set_logs` | One logged set (weight, reps, type, RPE). |
| `running_metrics` | Per-session distance/duration/pace/RPE for running & hybrid days. |
| `joint_constraints` | First-class joint limitations used by the generator. |
| `user_profiles` | Single-row persisted onboarding profile. |
| `client_billing_profiles` | v5 — one client's contact + Hungarian billing/invoicing record. |
| `coaching_slots` | v5 — coach-published availability (`online_call` / `irl_gym`). |
| `coaching_bookings` | v5 — the client's reservations with status + offline sync flag. |
| `app_settings` | v6 — device-local key/value config (the coach backend base URL). |

Migrations live in `src/db/schema.ts` (`migrate`, guarded by SQLite `user_version`). Never edit a shipped migration — append a new `{ version }` entry.

## 4. Feature Phases
1. **Foundations** — schema v1, exercise catalog seed, typed repository, default 4-day split.
2. **Onboarding & profile** — schema v2, persisted profile + joint constraints, seeded templates.
3. **Live logger** — session detail graph, per-set logging, rest timer, mid-workout exercise substitution.
4. **Program generation & sync** — schema v4 catalog metadata, routine generator, custom templates, offline sync queue.
5. **Progressive overload** — previous-performance memory, estimated-1RM analytics, PR badges, progression view.
6. **Gym-floor flexibility** — schema unchanged (v4). Mid-workout add/remove/reorder of exercises and sets, a barbell plate calculator, and full local DB backup/restore:
   - `db/repository.ts`: `appendSetToBlock`, `removeSetFromBlock`, `appendExerciseBlockToSession`, `removeExerciseBlockFromSession`, `reorderSessionBlocks` (all keep `order_index`/`set_number` contiguous and refuse completed sessions).
   - `services/plateCalculator.ts`: pure `calculatePlatesPerSide` + `PlateCalculatorModal`.
   - `services/backupService.ts`: `exportFullDatabaseSnapshot` / `importFullDatabaseSnapshot` (atomic replace of profile, custom exercises/templates, and all session history).
7. **Human Coach platform — client app (v5)** — pivots from automated AI routine generation to a Human Coach + Client model:
   - **Schema v5** (`src/db/schema.ts`): `client_billing_profiles` (contact + Hungarian billing/invoicing), `coaching_slots` + `coaching_bookings` (1-on-1 online/IRL bookings), and `workout_templates.source` / `coach_note` / `assigned_at` for coach-assigned plans.
   - **Onboarding & Profil**: a 4th "Kapcsolat & Számlázási adatok" step (`components/onboarding/StepContact.tsx`) plus the editable `components/profile/BillingCard.tsx`; both validate through `services/billing.ts` (`validateClientBillingProfile`) before persisting via `saveClientBillingProfile`.
   - **Időpontok tab** (`app/(tabs)/booking.tsx`): filter by modality, book an open seeded slot with a client note (creates a `pending`, `local_dirty` booking), and cancel an upcoming booking — all transactional so a slot is never double-booked.
   - **Sablonok grouping**: "Edző által kijelölt tervek" (`source === 'coach'`, pinned + coach-note badge) above "Saját / Alap sablonok".
   - **Coach sync contracts** (`types/workout.ts`): `ClientSyncPullPayload` / `ClientSyncPushPayload` replace the old AI request payload; `services/routineGenerator.ts` `buildClientSyncPullPayload` and `services/syncService.ts` `buildClientSyncPushPayload` build them.
8. **Human Coach platform — backend + admin web + live sync (v6)** — adds the standalone coach server, the coach admin web, and the client's full Push+Pull sync:
   - **`/server`** — a zero-dependency Node HTTP API (`node:http` + `node:sqlite`, port `4000`) with its own `package.json`/`tsconfig.json` and `server/data/coach-platform.db`. Endpoints: `POST /api/sync/push`, `GET /api/sync/pull`, and the coach admin REST surface under `/api/admin/*` (clients, invoice export, plan builder, slots, bookings, the 157-exercise catalog). It compiles the shared pure-TS contracts from `src/types/workout.ts` + `src/db/catalogData.ts` directly, so there is no type duplication.
   - **`/admin`** — a dark-mode static admin web served by the server itself (no second port/process). Four views: **Ügyfelek & Számlázás**, **Edzésterv készítő**, **Időpontok & Foglalások**, **Gyakorlatok**.
   - **Mobile sync** (`services/syncService.ts`, `db/repository.ts`, `components/SyncCard.tsx`, `app/(tabs)/booking.tsx`): `syncPendingWorkouts(db, baseUrl)` now performs a full Push → Pull; `applyClientSyncPullPayload(db, pull)` atomically reconciles coach templates, open slots and booking statuses/notes; the Szinkronizálás card gained a configurable **Szerver URL** (default `http://10.0.2.2:4000`).
   - **Schema v6**: `app_settings` (device-local settings store).
   - **Verification**: `npm run verify:server` boots the real server in-memory, simulates a client push, a coach confirm + plan assignment, a pull, and asserts `applyClientSyncPullPayload` hydrates the mobile DB.
9. **Accounts — username + password (v6, no migration)** — login on new devices/PWAs without redoing onboarding:
   - **Server** (`server/src/auth.ts`, `server/src/db.ts`, `server/src/app.ts`): `client_credentials` (unique trimmed/lowercased `username_key`, salted `crypto.scrypt` hash) and `auth_tokens` tables; `POST /api/auth/register` (new account or credential upgrade for an existing `userId`) and `POST /api/auth/login` return an opaque bearer token + full account state. Sync endpoints read `Authorization: Bearer …` and scope push/pull to that user (legacy token-less clients keep working).
   - **Client** (`services/authService.ts`, `db/repository.ts`): the session (user id, username, token) is stored in `app_settings`; `loginWithCredentials` applies the server snapshot (profile, constraints, billing, workout logs), runs a pull and regenerates the tailored program. `logoutAccount` best-effort pushes then wipes local user data.
   - **UI**: first onboarding step has a prominent "Már van fiókod? Bejelentkezés" button; step 5 creates the account; Profil shows the logged-in username, the upgrade card for pre-auth profiles, and a danger "Kijelentkezés" button using the shared dialog service.

## 5. Engineering Rules
- Zero `any`; all domain unions and literal types are preserved in `src/types/workout.ts`.
- All SQL lives in `src/db/`; screens never touch raw statements. Writes spanning multiple tables run inside `withTransactionAsync`.
- Every local mutation flags its session `local_dirty` so the sync queue can pick up exactly what changed. Coaching bookings carry their own `sync_status` for the same reason.
- Contact & billing fields are validated by the pure `services/billing.ts` helpers before any persist; the UI maps `missingFields`/`invalidEmail` to Hungarian strings rather than the validator hardcoding messages.
- New UI strings are added to `src/i18n/hu.ts`; unions that map to UI text are cross-checked with `satisfies`-style records so a new member forces a translation.
- Verify before shipping: `npx tsc --noEmit`, `npx expo lint` (0 warnings), `npm run verify:db` (headless SQLite checks), `npm run verify:server` (end-to-end server + mobile sync), `npx expo export --platform android`, `npm run build:web` (web bundle in `dist/`).
