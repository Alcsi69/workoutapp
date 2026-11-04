# Workout App Architecture & Engineering Rules

## 1. Core Tech Stack
- **Framework:** React Native with Expo SDK (Managed Workflow) + TypeScript (strict mode).
- **Routing:** Expo Router (file-based routing in `src/app/`).
- **Local Database (Offline-First):** `expo-sqlite` for workout templates, exercise catalog, active session state, and completed workout logs.
- **State Management:** Zustand (`src/store/`) for ephemeral active workout UI state (rest timers, active set inputs, quick swaps).
- **Styling:** `StyleSheet.create` with a centralized design token file (`src/theme/tokens.ts`). Dark-mode native by default. Zero heavy third-party component libraries.
- **Localization:** Hungarian (`hu`) primary UI language, structured via a clean dictionary (`src/i18n/hu.ts`) so strings are never hardcoded in components.

## 2. Target Directory Structure
```text
src/
├── app/                  # Expo Router screens
│   ├── (tabs)/           # Main bottom tab navigation (Dashboard, Active Workout, History, Profile)
│   ├── onboarding/       # Multi-step onboarding survey flow
│   └── _layout.tsx       # Root layout & SQLite initialization
├── components/           # Reusable, stateless UI building blocks
├── db/                   # SQLite schema migrations and typed query helpers
├── i18n/                 # Localization strings (hu.ts)
├── services/             # API sync client & AI routine generation payload builders
├── store/                # Zustand stores (useActiveWorkoutStore, useOnboardingStore)
├── theme/                # Color, spacing, and typography tokens
└── types/                # Strict TypeScript interfaces (workout.ts)
