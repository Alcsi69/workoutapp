# Workout App Architecture & Engineering Rules

## 1. Core Tech Stack
- **Framework:** React Native with Expo SDK 58 (Managed Workflow) + TypeScript (strict mode).
- **Routing:** Expo Router (file-based routing in `src/app/`).
- **Local Database (Offline-First):** `expo-sqlite` for workout templates, exercise catalog, active session state, completed workout logs, client billing, and 1-on-1 coaching bookings. **Schema v5** (see `src/db/schema.ts`).
- **State Management:** Zustand (`src/store/`) for ephemeral active workout UI state (rest timers, onboarding draft, quick swaps).
- **Styling:** `StyleSheet.create` with a centralized design token file (`src/theme/tokens.ts`). Dark-mode native by default. Zero heavy third-party component libraries.
- **Localization:** Hungarian (`hu`) primary UI language, structured via a clean dictionary (`src/i18n/hu.ts`) so strings are never hardcoded in components.
- **Clipboard:** `expo-clipboard` powers the full-database JSON backup/restore in the Profil tab.

## 2. Target Directory Structure
```text
src/
├── app/                  # Expo Router screens
│   ├── (tabs)/           # Main bottom tab navigation (Edzés, Sablonok, Időpontok, Előzmények, Profil)
│   ├── onboarding/       # Multi-step onboarding survey flow (4 steps)
│   ├── workout/[id].tsx  # Active workout logger (mid-workout add/remove/reorder)
│   └── _layout.tsx       # Root layout & SQLite initialization
├── components/           # Reusable, stateless UI building blocks
│   ├── logger/           # Logger-specific pieces (ExerciseBlockCard, PlateCalculatorModal, ...)
│   ├── onboarding/       # StepBiometrics, StepSchedule, StepConstraints, StepContact
│   ├── booking/          # BookingModal (1-on-1 slot reservation)
│   ├── profile/          # BillingCard (contact & billing editor)
│   └── history/          # History/progression views
├── db/                   # SQLite schema migrations, seed data, and typed query helpers
├── i18n/                 # Localization strings (hu.ts)
├── services/             # Pure logic + API clients (analytics, billing, plateCalculator, ...)
├── store/                # Zustand stores (useActiveWorkoutStore, useOnboardingStore)
├── theme/                # Color, spacing, and typography tokens
└── types/                # Strict TypeScript interfaces (workout.ts)
```

## 3. Database Schema (v5)
Twelve tables, all snake_case, JSON columns stored as `TEXT`:

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
   - Phase 7B will add the standalone `/server` REST API and `/admin-web` coach dashboard in this repo.

## 5. Engineering Rules
- Zero `any`; all domain unions and literal types are preserved in `src/types/workout.ts`.
- All SQL lives in `src/db/`; screens never touch raw statements. Writes spanning multiple tables run inside `withTransactionAsync`.
- Every local mutation flags its session `local_dirty` so the sync queue can pick up exactly what changed. Coaching bookings carry their own `sync_status` for the same reason.
- Contact & billing fields are validated by the pure `services/billing.ts` helpers before any persist; the UI maps `missingFields`/`invalidEmail` to Hungarian strings rather than the validator hardcoding messages.
- New UI strings are added to `src/i18n/hu.ts`; unions that map to UI text are cross-checked with `satisfies`-style records so a new member forces a translation.
- Verify before shipping: `npx tsc --noEmit`, `npx expo lint` (0 warnings), `npm run verify:db` (headless SQLite checks), `npx expo export --platform android`.
