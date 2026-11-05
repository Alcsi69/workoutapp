# Workout App Architecture & Engineering Rules

## 1. Core Tech Stack
- **Framework:** React Native with Expo SDK 58 (Managed Workflow) + TypeScript (strict mode).
- **Routing:** Expo Router (file-based routing in `src/app/`).
- **Local Database (Offline-First):** `expo-sqlite` for workout templates, exercise catalog, active session state, and completed workout logs. **Schema v4** (see `src/db/schema.ts`).
- **State Management:** Zustand (`src/store/`) for ephemeral active workout UI state (rest timers, onboarding draft, quick swaps).
- **Styling:** `StyleSheet.create` with a centralized design token file (`src/theme/tokens.ts`). Dark-mode native by default. Zero heavy third-party component libraries.
- **Localization:** Hungarian (`hu`) primary UI language, structured via a clean dictionary (`src/i18n/hu.ts`) so strings are never hardcoded in components.
- **Clipboard:** `expo-clipboard` powers the full-database JSON backup/restore in the Profil tab.

## 2. Target Directory Structure
```text
src/
├── app/                  # Expo Router screens
│   ├── (tabs)/           # Main bottom tab navigation (Dashboard, Templates, History, Profile)
│   ├── onboarding/       # Multi-step onboarding survey flow
│   ├── workout/[id].tsx  # Active workout logger (mid-workout add/remove/reorder)
│   └── _layout.tsx       # Root layout & SQLite initialization
├── components/           # Reusable, stateless UI building blocks
│   ├── logger/           # Logger-specific pieces (ExerciseBlockCard, PlateCalculatorModal, ...)
│   └── history/          # History/progression views
├── db/                   # SQLite schema migrations, seed data, and typed query helpers
├── i18n/                 # Localization strings (hu.ts)
├── services/             # Pure logic + API clients (analytics, plateCalculator, backupService, ...)
├── store/                # Zustand stores (useActiveWorkoutStore, useOnboardingStore)
├── theme/                # Color, spacing, and typography tokens
└── types/                # Strict TypeScript interfaces (workout.ts)
```

## 3. Database Schema (v4)
Nine tables, all snake_case, JSON columns stored as `TEXT`:

| Table | Purpose |
| --- | --- |
| `exercise_catalog` | Seeded + user-created exercises (v4 adds `equipment`, `movement_pattern`, `is_custom`). |
| `workout_templates` | Program/custom template definitions (`tpl_user%` = user-created). |
| `template_exercise_blocks` | Ordered blocks of a template, with `target_sets`/`target_reps`. |
| `session_logs` | Completed + in-progress sessions; `sync_status` drives the offline queue. |
| `session_exercise_blocks` | Blocks copied into a session; carry the prescription + substitutions. |
| `set_logs` | One logged set (weight, reps, type, RPE). |
| `running_metrics` | Per-session distance/duration/pace/RPE for running & hybrid days. |
| `joint_constraints` | First-class joint limitations used by the generator. |
| `user_profiles` | Single-row persisted onboarding profile. |

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

## 5. Engineering Rules
- Zero `any`; all domain unions and literal types are preserved in `src/types/workout.ts`.
- All SQL lives in `src/db/`; screens never touch raw statements. Writes spanning multiple tables run inside `withTransactionAsync`.
- Every local mutation flags its session `local_dirty` so the sync queue can pick up exactly what changed.
- New UI strings are added to `src/i18n/hu.ts`; unions that map to UI text are cross-checked with `satisfies`-style records so a new member forces a translation.
- Verify before shipping: `npx tsc --noEmit`, `npx expo lint` (0 warnings), `npm run verify:db` (headless SQLite checks), `npx expo export --platform android`.
