// Offline-first SQLite schema for WorkoutApp.
// Raw DDL + a versioned migration runner. Column names are snake_case;
// JSON-encoded columns (arrays/records) are stored as TEXT with a _json suffix in comments.
//
// Apply with: await migrate(db) — see src/app/_layout.tsx for DB initialization.
// API reference (Expo SDK 58): db.execAsync (bulk/DDL), db.runAsync, db.getFirstAsync.

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  EquipmentTier,
  ExerciseCategory,
  JointArea,
  JointConstraintSeverity,
  LoadScore,
  SessionType,
  SetType,
  SyncStatus,
  TrainingGoal,
} from '../types/workout';

export const SCHEMA_VERSION = 3;

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
];

/**
 * Applies pending migrations in order, guarded by SQLite's `user_version`.
 * Idempotent: re-running on an up-to-date database is a no-op.
 */
export async function migrate(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL;');
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
  primary_muscles: string; // JSON string[]
  axial_load_score: LoadScore;
  knee_stress_score: LoadScore;
  default_substitute_ids: string; // JSON string[]
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
  primary_muscles: string; // JSON string[]
  axial_load_score: LoadScore;
  knee_stress_score: LoadScore;
  default_substitute_ids: string; // JSON string[]
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
  primary_muscles: string; // JSON string[]
  axial_load_score: LoadScore;
  knee_stress_score: LoadScore;
  default_substitute_ids: string; // JSON string[]
}

// Keep the domain unions referenced so the row shapes stay aligned with the API surface.
export type SchemaDomainUnions = {
  goal: TrainingGoal;
  equipment: EquipmentTier;
};
