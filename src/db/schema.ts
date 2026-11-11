// Offline-first SQLite schema for WorkoutApp.
// Raw DDL + a versioned migration runner. Column names are snake_case;
// JSON-encoded columns (arrays/records) are stored as TEXT with a _json suffix in comments.
//
// Apply with: await migrate(db) — see src/app/_layout.tsx for DB initialization.
// API reference (Expo SDK 58): db.execAsync (bulk/DDL), db.runAsync, db.getFirstAsync.

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  CoachingBookingStatus,
  CoachingModality,
  Equipment,
  EquipmentTier,
  ExerciseCategory,
  JointArea,
  JointConstraintSeverity,
  LoadScore,
  MovementPattern,
  SessionType,
  SetType,
  SyncStatus,
  TemplateSource,
  TrainingGoal,
} from '../types/workout';

export const SCHEMA_VERSION = 6;

export interface Migration {
  version: number;
  statements: string[];
}

/**
 * Ordered list of schema migrations. Never edit a shipped migration:
 * append a new { version } entry and let the runner apply it.
 */
export const migrations: Migration[] = [
  {
    version: 1,
    statements: [
      // --- Exercise catalog -------------------------------------------------
      `CREATE TABLE IF NOT EXISTS exercise_catalog (
        id TEXT PRIMARY KEY NOT NULL,
        name_hu TEXT NOT NULL,
        name_en TEXT NOT NULL,
        category TEXT NOT NULL,
        primary_muscles TEXT NOT NULL,       -- JSON string[]
        axial_load_score INTEGER NOT NULL CHECK (axial_load_score BETWEEN 1 AND 5),
        knee_stress_score INTEGER NOT NULL CHECK (knee_stress_score BETWEEN 1 AND 5),
        default_substitute_ids TEXT NOT NULL DEFAULT '[]'  -- JSON string[]
      );`,

      // --- Program / template definitions ----------------------------------
      `CREATE TABLE IF NOT EXISTS workout_templates (
        id TEXT PRIMARY KEY NOT NULL,
        title TEXT NOT NULL,
        session_type TEXT NOT NULL,          -- 'strength' | 'running' | 'hybrid'
        goal TEXT,                           -- TrainingGoal
        created_at TEXT NOT NULL             -- ISO-8601
      );`,

      `CREATE TABLE IF NOT EXISTS template_exercise_blocks (
        id TEXT PRIMARY KEY NOT NULL,
        template_id TEXT NOT NULL REFERENCES workout_templates(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        exercise_id TEXT NOT NULL,
        substituted_from_exercise_id TEXT,
        rest_seconds INTEGER NOT NULL DEFAULT 90,
        notes TEXT,
        target_sets INTEGER,
        target_reps TEXT
      );`,

      // --- Completed session logs (offline-first, syncable) -----------------
      `CREATE TABLE IF NOT EXISTS session_logs (
        id TEXT PRIMARY KEY NOT NULL,
        program_day_id TEXT,
        session_type TEXT NOT NULL,          -- 'strength' | 'running' | 'hybrid'
        title TEXT NOT NULL,
        started_at TEXT NOT NULL,            -- ISO-8601
        completed_at TEXT,                   -- ISO-8601, null while in progress
        sync_status TEXT NOT NULL DEFAULT 'local_dirty'  -- 'local_dirty' | 'synced'
      );`,

      `CREATE TABLE IF NOT EXISTS session_exercise_blocks (
        id TEXT PRIMARY KEY NOT NULL,
        session_id TEXT NOT NULL REFERENCES session_logs(id) ON DELETE CASCADE,
        order_index INTEGER NOT NULL,
        exercise_id TEXT NOT NULL,
        substituted_from_exercise_id TEXT,
        rest_seconds INTEGER NOT NULL,
        notes TEXT
      );`,

      `CREATE TABLE IF NOT EXISTS set_logs (
        id TEXT PRIMARY KEY NOT NULL,
        block_id TEXT NOT NULL REFERENCES session_exercise_blocks(id) ON DELETE CASCADE,
        set_number INTEGER NOT NULL,
        set_type TEXT NOT NULL,              -- SetType
        target_weight_kg REAL,
        actual_weight_kg REAL NOT NULL,
        target_reps TEXT NOT NULL,           -- e.g. "6-8"
        actual_reps INTEGER NOT NULL,
        rpe REAL,                            -- 5.0 - 10.0 in 0.5 steps
        completed_at TEXT NOT NULL           -- ISO-8601
      );`,

      `CREATE TABLE IF NOT EXISTS running_metrics (
        session_id TEXT PRIMARY KEY NOT NULL REFERENCES session_logs(id) ON DELETE CASCADE,
        distance_km REAL NOT NULL,
        duration_seconds INTEGER NOT NULL,
        avg_pace_seconds_per_km REAL NOT NULL,
        perceived_effort_rpe REAL
      );`,

      // --- Joint constraints as first-class records -------------------------
      `CREATE TABLE IF NOT EXISTS joint_constraints (
        id TEXT PRIMARY KEY NOT NULL,
        user_id TEXT,
        area TEXT NOT NULL,                  -- JointArea
        severity TEXT NOT NULL,              -- JointConstraintSeverity
        notes TEXT,
        created_at TEXT NOT NULL             -- ISO-8601
      );`,

      // --- Indexes ----------------------------------------------------------
      `CREATE INDEX IF NOT EXISTS idx_catalog_category ON exercise_catalog(category);`,
      `CREATE INDEX IF NOT EXISTS idx_template_blocks_template ON template_exercise_blocks(template_id);`,
      `CREATE INDEX IF NOT EXISTS idx_session_blocks_session ON session_exercise_blocks(session_id);`,
      `CREATE INDEX IF NOT EXISTS idx_set_logs_block ON set_logs(block_id);`,
      `CREATE INDEX IF NOT EXISTS idx_session_logs_started ON session_logs(started_at DESC);`,
      `CREATE INDEX IF NOT EXISTS idx_session_logs_sync ON session_logs(sync_status);`,
    ],
  },
  {
    version: 2,
    statements: [
      // --- Persisted onboarding profile -------------------------------------
      // One row per user. JSON-encoded columns hold excluded ids and the
      // preferredSubstitutions record ({"hack_squat": "belt_squat", ...}).
      `CREATE TABLE IF NOT EXISTS user_profiles (
        id TEXT PRIMARY KEY NOT NULL,
        locale TEXT NOT NULL,                     -- 'hu' | 'en'
        age INTEGER NOT NULL,
        weight_kg REAL NOT NULL,
        height_cm REAL NOT NULL,
        primary_goal TEXT NOT NULL,               -- TrainingGoal
        experience_months INTEGER NOT NULL,
        strength_days_per_week INTEGER NOT NULL,
        running_days_per_week INTEGER NOT NULL,
        target_run_distance_km REAL,
        session_duration_minutes INTEGER NOT NULL,
        equipment TEXT NOT NULL,                  -- EquipmentTier
        excluded_exercise_ids TEXT NOT NULL DEFAULT '[]',      -- JSON string[]
        preferred_substitutions TEXT NOT NULL DEFAULT '{}',    -- JSON Record<string,string>
        onboarding_completed_at TEXT NOT NULL,    -- ISO-8601
        updated_at TEXT NOT NULL                  -- ISO-8601
      );`,

      `CREATE INDEX IF NOT EXISTS idx_joint_constraints_user ON joint_constraints(user_id);`,
    ],
  },
  {
    version: 3,
    statements: [
      // --- Session blocks carry their prescription --------------------------
      // The logger shows the target rep range per block, so the copied session
      // block keeps the template's target_sets/target_reps. SQLite requires one
      // ALTER per column; both are nullable so existing rows stay valid.
      `ALTER TABLE session_exercise_blocks ADD COLUMN target_sets INTEGER;`,
      `ALTER TABLE session_exercise_blocks ADD COLUMN target_reps TEXT;`,
    ],
  },
  {
    version: 4,
    statements: [
      // --- Exercise catalog: equipment, movement pattern, user-created flag --
      // The catalog grows into a StrengthLevel-scale database, so each exercise
      // now records its implement and canonical movement pattern (both used by
      // the picker's filters) and whether the user created it. `equipment` and
      // `movement_pattern` are nullable only to keep existing rows valid during
      // the migration; the seeder backfills every seeded row immediately after.
      `ALTER TABLE exercise_catalog ADD COLUMN equipment TEXT;`,
      `ALTER TABLE exercise_catalog ADD COLUMN movement_pattern TEXT;`,
      `ALTER TABLE exercise_catalog ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0;`,
      `CREATE INDEX IF NOT EXISTS idx_catalog_name_hu ON exercise_catalog(name_hu);`,
      `CREATE INDEX IF NOT EXISTS idx_catalog_name_en ON exercise_catalog(name_en);`,
    ],
  },
  {
    version: 5,
    statements: [
      // --- Human Coach platform ---------------------------------------------
      // Contact + Hungarian billing/invoicing record, coach-assigned templates,
      // and the 1-on-1 coaching booking system (online call & in-person).
      `CREATE TABLE IF NOT EXISTS client_billing_profiles (
        id TEXT PRIMARY KEY NOT NULL,             -- owner (profile id)
        full_name TEXT NOT NULL,
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        billing_name TEXT NOT NULL,               -- magánszemély vagy cégnév
        billing_country TEXT NOT NULL DEFAULT 'Magyarország',
        billing_zip TEXT NOT NULL,                -- irányítószám
        billing_city TEXT NOT NULL,               -- település
        billing_address TEXT NOT NULL,            -- utca, házszám
        tax_number TEXT,                          -- adószám (opcionális)
        created_at TEXT NOT NULL,                 -- ISO-8601
        updated_at TEXT NOT NULL                  -- ISO-8601
      );`,

      // --- Coach-assigned plans ---------------------------------------------
      // Existing templates default to 'seed'; user-built ones are re-tagged as
      // 'custom' so the Sablonok grouping stays correct after the migration.
      `ALTER TABLE workout_templates ADD COLUMN source TEXT NOT NULL DEFAULT 'seed';`,
      `ALTER TABLE workout_templates ADD COLUMN coach_note TEXT;`,
      `ALTER TABLE workout_templates ADD COLUMN assigned_at TEXT;`,
      `UPDATE workout_templates SET source = 'custom' WHERE id LIKE 'tpl_user%';`,
      `CREATE INDEX IF NOT EXISTS idx_templates_source ON workout_templates(source);`,

      // --- Coaching slots (synced from the coach) ---------------------------
      `CREATE TABLE IF NOT EXISTS coaching_slots (
        id TEXT PRIMARY KEY NOT NULL,
        starts_at TEXT NOT NULL,                  -- ISO-8601
        ends_at TEXT NOT NULL,                    -- ISO-8601
        modality TEXT NOT NULL,                   -- 'online_call' | 'irl_gym'
        location_or_link TEXT NOT NULL,
        is_booked INTEGER NOT NULL DEFAULT 0      -- SQLite 0/1
      );`,

      // --- Coaching bookings (client's reservations) ------------------------
      `CREATE TABLE IF NOT EXISTS coaching_bookings (
        id TEXT PRIMARY KEY NOT NULL,
        slot_id TEXT NOT NULL REFERENCES coaching_slots(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL,
        modality TEXT NOT NULL,                   -- 'online_call' | 'irl_gym'
        starts_at TEXT NOT NULL,                  -- ISO-8601
        ends_at TEXT NOT NULL,                    -- ISO-8601
        location_or_link TEXT NOT NULL,
        client_notes TEXT,
        coach_notes TEXT,
        status TEXT NOT NULL DEFAULT 'pending',   -- CoachingBookingStatus
        sync_status TEXT NOT NULL DEFAULT 'local_dirty',
        created_at TEXT NOT NULL                  -- ISO-8601
      );`,

      `CREATE INDEX IF NOT EXISTS idx_coaching_slots_starts ON coaching_slots(starts_at);`,
      `CREATE INDEX IF NOT EXISTS idx_coaching_bookings_slot ON coaching_bookings(slot_id);`,
      `CREATE INDEX IF NOT EXISTS idx_coaching_bookings_sync ON coaching_bookings(sync_status);`,
    ],
  },
  {
    version: 6,
    statements: [
      // --- Local app settings -------------------------------------------------
      // Small key/value store for client-side preferences that are not part of
      // the domain (e.g. the coach backend base URL the sync service talks to).
      // Kept out of the sync contracts on purpose: it is device-local config.
      `CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY NOT NULL,
        value TEXT NOT NULL
      );`,
    ],
  },
];

/**
 * Applies pending migrations in order, guarded by SQLite's `user_version`.
 * Idempotent: re-running on an up-to-date database is a no-op.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  try {
    // WAL is a native-filesystem journal mode. Web (wa-sqlite over IndexedDB)
    // has no WAL; the pragma may reject there, which is harmless — the SQLite
    // web backend keeps its own durability. Native behaviour is unchanged.
    await db.execAsync('PRAGMA journal_mode = WAL;');
  } catch {
    // Ignore: journal mode is a performance/durability hint, not a requirement.
  }
  await db.execAsync('PRAGMA foreign_keys = ON;');

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version;');
  let currentVersion = row?.user_version ?? 0;

  for (const migration of migrations) {
    if (migration.version <= currentVersion) {
      continue;
    }
    await db.withTransactionAsync(async () => {
      for (const statement of migration.statements) {
        await db.execAsync(statement);
      }
    });
    // PRAGMA does not accept bound parameters; the value is a trusted constant.
    await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    currentVersion = migration.version;
  }
}

// --- Typed row shapes (SQLite-friendly mirrors of src/types/workout.ts) ------
// JSON columns are stored as TEXT and must be parsed at the query-helper layer.

export interface ExerciseCatalogRow {
  id: string;
  name_hu: string;
  name_en: string;
  category: ExerciseCategory;
  equipment: Equipment;
  movement_pattern: MovementPattern;
  primary_muscles: string; // JSON string[]
  axial_load_score: LoadScore;
  knee_stress_score: LoadScore;
  default_substitute_ids: string; // JSON string[]
  is_custom: number; // SQLite 0/1 — surfaced to the domain as a boolean
}

export interface SessionLogRow {
  id: string;
  program_day_id: string | null;
  session_type: SessionType;
  title: string;
  started_at: string;
  completed_at: string | null;
  sync_status: SyncStatus;
}

export interface SessionExerciseBlockRow {
  id: string;
  session_id: string;
  order_index: number;
  exercise_id: string;
  substituted_from_exercise_id: string | null;
  rest_seconds: number;
  notes: string | null;
  target_sets: number | null;
  target_reps: string | null;
}

/** Session block joined with its catalog entry (used by getSessionDetail). */
export interface SessionExerciseJoinRow extends SessionExerciseBlockRow {
  /** Catalog primary key, aliased so it does not collide with the block id. */
  catalog_id: string;
  name_hu: string;
  name_en: string;
  category: ExerciseCategory;
  equipment: Equipment;
  movement_pattern: MovementPattern;
  primary_muscles: string; // JSON string[]
  axial_load_score: LoadScore;
  knee_stress_score: LoadScore;
  default_substitute_ids: string; // JSON string[]
  is_custom: number; // SQLite 0/1
}

export interface SetLogRow {
  id: string;
  block_id: string;
  set_number: number;
  set_type: SetType;
  target_weight_kg: number | null;
  actual_weight_kg: number;
  target_reps: string;
  actual_reps: number;
  rpe: number | null;
  completed_at: string;
}

export interface RunningMetricsRow {
  session_id: string;
  distance_km: number;
  duration_seconds: number;
  avg_pace_seconds_per_km: number;
  perceived_effort_rpe: number | null;
}

export interface JointConstraintRow {
  id: string;
  user_id: string | null;
  area: JointArea;
  severity: JointConstraintSeverity;
  notes: string | null;
  created_at: string;
}

export interface UserProfileRow {
  id: string;
  locale: 'hu' | 'en';
  age: number;
  weight_kg: number;
  height_cm: number;
  primary_goal: TrainingGoal;
  experience_months: number;
  strength_days_per_week: number;
  running_days_per_week: number;
  target_run_distance_km: number | null;
  session_duration_minutes: number;
  equipment: EquipmentTier;
  excluded_exercise_ids: string; // JSON string[]
  preferred_substitutions: string; // JSON Record<string, string>
  onboarding_completed_at: string;
  updated_at: string;
}

export interface WorkoutTemplateRow {
  id: string;
  title: string;
  session_type: SessionType;
  goal: TrainingGoal | null;
  source: TemplateSource;
  coach_note: string | null;
  assigned_at: string | null;
  created_at: string;
}

export interface TemplateExerciseBlockRow {
  id: string;
  template_id: string;
  order_index: number;
  exercise_id: string;
  substituted_from_exercise_id: string | null;
  rest_seconds: number;
  notes: string | null;
  target_sets: number | null;
  target_reps: string | null;
}

/** Template block joined with its catalog entry (used by getWorkoutTemplates). */
export interface TemplateExerciseJoinRow extends TemplateExerciseBlockRow {
  /** Catalog primary key, aliased so it does not collide with the block id. */
  catalog_id: string;
  name_hu: string;
  name_en: string;
  category: ExerciseCategory;
  equipment: Equipment;
  movement_pattern: MovementPattern;
  primary_muscles: string; // JSON string[]
  axial_load_score: LoadScore;
  knee_stress_score: LoadScore;
  default_substitute_ids: string; // JSON string[]
  is_custom: number; // SQLite 0/1
}

// Keep the domain unions referenced so the row shapes stay aligned with the API surface.
export type SchemaDomainUnions = {
  goal: TrainingGoal;
  equipment: EquipmentTier;
};

export interface ClientBillingProfileRow {
  id: string;
  full_name: string;
  email: string;
  phone: string;
  billing_name: string;
  billing_country: string;
  billing_zip: string;
  billing_city: string;
  billing_address: string;
  tax_number: string | null;
  created_at: string;
  updated_at: string;
}

export interface CoachingSlotRow {
  id: string;
  starts_at: string;
  ends_at: string;
  modality: CoachingModality;
  location_or_link: string;
  is_booked: number; // SQLite 0/1 — surfaced to the domain as a boolean
}

export interface CoachingBookingRow {
  id: string;
  slot_id: string;
  user_id: string;
  modality: CoachingModality;
  starts_at: string;
  ends_at: string;
  location_or_link: string;
  client_notes: string | null;
  coach_notes: string | null;
  status: CoachingBookingStatus;
  sync_status: SyncStatus;
  created_at: string;
}
