// Typed, async query helpers over the offline-first SQLite database.
// All SQL lives here; screens never touch raw statements.
//
// Conventions:
// - rows are snake_case (see schema.ts); domain objects are camelCase
// - JSON-encoded TEXT columns are parsed here, never leaked to callers
// - writes that touch more than one table run inside a transaction

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  ExerciseCatalogItem,
  ExerciseCategory,
  JointConstraint,
  OnboardingPayload,
  RunningMetrics,
  SessionExerciseBlock,
  SessionType,
  SetLog,
  SetType,
  SyncStatus,
  TrainingGoal,
  UserProfile,
  WorkoutSessionLog,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from '../types/workout';
import type {
  ExerciseCatalogRow,
  JointConstraintRow,
  RunningMetricsRow,
  SessionExerciseJoinRow,
  SessionLogRow,
  SetLogRow,
  TemplateExerciseJoinRow,
  UserProfileRow,
  WorkoutTemplateRow,
} from './schema';

// --- JSON column helpers ----------------------------------------------------

/**
 * This phase is single-user, single-device: one profile row. The id is stable so
 * re-running onboarding updates the same row and its constraints.
 */
export const USER_PROFILE_ID = 'usr_local';

function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed.filter((entry): entry is string => typeof entry === 'string');
  } catch {
    return [];
  }
}

function parseStringRecord(raw: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === 'string') {
        record[key] = value;
      }
    }
    return record;
  } catch {
    return {};
  }
}

/** Stable, collision-resistant id for locally created rows (no crypto dependency). */
function createLocalId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

// --- User profile & joint constraints ---------------------------------------

const SELECT_PROFILE_SQL = `
  SELECT id, locale, age, weight_kg, height_cm, primary_goal, experience_months,
         strength_days_per_week, running_days_per_week, target_run_distance_km,
         session_duration_minutes, equipment, excluded_exercise_ids,
         preferred_substitutions, onboarding_completed_at, updated_at
  FROM user_profiles
  WHERE id = ?
  LIMIT 1;
`;

const UPSERT_PROFILE_SQL = `
  INSERT INTO user_profiles
    (id, locale, age, weight_kg, height_cm, primary_goal, experience_months,
     strength_days_per_week, running_days_per_week, target_run_distance_km,
     session_duration_minutes, equipment, excluded_exercise_ids,
     preferred_substitutions, onboarding_completed_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    locale = excluded.locale,
    age = excluded.age,
    weight_kg = excluded.weight_kg,
    height_cm = excluded.height_cm,
    primary_goal = excluded.primary_goal,
    experience_months = excluded.experience_months,
    strength_days_per_week = excluded.strength_days_per_week,
    running_days_per_week = excluded.running_days_per_week,
    target_run_distance_km = excluded.target_run_distance_km,
    session_duration_minutes = excluded.session_duration_minutes,
    equipment = excluded.equipment,
    excluded_exercise_ids = excluded.excluded_exercise_ids,
    preferred_substitutions = excluded.preferred_substitutions,
    onboarding_completed_at = excluded.onboarding_completed_at,
    updated_at = excluded.updated_at;
`;

const INSERT_JOINT_CONSTRAINT_SQL = `
  INSERT INTO joint_constraints (id, user_id, area, severity, notes, created_at)
  VALUES (?, ?, ?, ?, ?, ?);
`;

/**
 * Returns the persisted profile, or null when onboarding has not been completed.
 * Called by the root redirect and by the Profil tab.
 */
export async function getUserProfile(db: SQLiteDatabase): Promise<UserProfile | null> {
  const row = await db.getFirstAsync<UserProfileRow>(SELECT_PROFILE_SQL, USER_PROFILE_ID);
  if (row === null) {
    return null;
  }

  const profile: UserProfile = {
    userId: row.id,
    locale: row.locale,
    biometrics: {
      age: row.age,
      weightKg: row.weight_kg,
      heightCm: row.height_cm,
    },
    trainingProfile: {
      primaryGoal: row.primary_goal,
      experienceMonths: row.experience_months,
      strengthDaysPerWeek: row.strength_days_per_week,
      runningDaysPerWeek: row.running_days_per_week,
      sessionDurationMinutes: row.session_duration_minutes,
      equipment: row.equipment,
    },
    constraints: {
      jointLimitations: await getJointConstraints(db, row.id),
      excludedExerciseIds: parseStringArray(row.excluded_exercise_ids),
      preferredSubstitutions: parseStringRecord(row.preferred_substitutions),
    },
    onboardingCompletedAt: row.onboarding_completed_at,
    updatedAt: row.updated_at,
  };

  if (row.target_run_distance_km !== null) {
    profile.trainingProfile.targetRunDistanceKm = row.target_run_distance_km;
  }

  return profile;
}

/**
 * Single onboarding entry point: upserts the profile row and replaces that
 * user's joint constraints atomically, so a failed write never leaves a profile
 * without its constraints.
 */
export async function saveOnboardingPayload(
  db: SQLiteDatabase,
  payload: OnboardingPayload,
): Promise<void> {
  const now = new Date().toISOString();
  const { biometrics, trainingProfile, constraints } = payload;

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      UPSERT_PROFILE_SQL,
      payload.userId,
      payload.locale,
      biometrics.age,
      biometrics.weightKg,
      biometrics.heightCm,
      trainingProfile.primaryGoal,
      trainingProfile.experienceMonths,
      trainingProfile.strengthDaysPerWeek,
      trainingProfile.runningDaysPerWeek,
      trainingProfile.targetRunDistanceKm ?? null,
      trainingProfile.sessionDurationMinutes,
      trainingProfile.equipment,
      JSON.stringify(constraints.excludedExerciseIds),
      JSON.stringify(constraints.preferredSubstitutions),
      now,
      now,
    );

    // Constraints are fully derived from onboarding, so replace rather than merge.
    await db.runAsync('DELETE FROM joint_constraints WHERE user_id = ?;', payload.userId);

    for (const limitation of constraints.jointLimitations) {
      await db.runAsync(
        INSERT_JOINT_CONSTRAINT_SQL,
        `jc_${payload.userId}_${limitation.area}`,
        payload.userId,
        limitation.area,
        limitation.severity,
        limitation.notes ?? null,
        now,
      );
    }
  });
}

export async function getJointConstraints(
  db: SQLiteDatabase,
  userId: string = USER_PROFILE_ID,
): Promise<JointConstraint[]> {
  const rows = await db.getAllAsync<JointConstraintRow>(
    `SELECT id, user_id, area, severity, notes, created_at
     FROM joint_constraints
     WHERE user_id = ?
     ORDER BY created_at, area;`,
    userId,
  );

  return rows.map((row) => {
    const constraint: JointConstraint = { area: row.area, severity: row.severity };
    if (row.notes !== null && row.notes.length > 0) {
      constraint.notes = row.notes;
    }
    return constraint;
  });
}

// --- Exercise catalog -------------------------------------------------------

const SELECT_CATALOG_SQL = `
  SELECT id, name_hu, name_en, category, primary_muscles,
         axial_load_score, knee_stress_score, default_substitute_ids
  FROM exercise_catalog
`;

function toCatalogItem(row: ExerciseCatalogRow, id: string = row.id): ExerciseCatalogItem {
  return {
    id,
    nameHu: row.name_hu,
    nameEn: row.name_en,
    category: row.category,
    primaryMuscles: parseStringArray(row.primary_muscles),
    axialLoadScore: row.axial_load_score,
    kneeStressScore: row.knee_stress_score,
    defaultSubstituteIds: parseStringArray(row.default_substitute_ids),
  };
}

/** Full catalog, or one category, ordered by category then Hungarian name. */
export async function getExerciseCatalog(
  db: SQLiteDatabase,
  category?: ExerciseCategory,
): Promise<ExerciseCatalogItem[]> {
  const orderBy = 'ORDER BY category, name_hu;';
  const rows =
    category === undefined
      ? await db.getAllAsync<ExerciseCatalogRow>(`${SELECT_CATALOG_SQL} ${orderBy}`)
      : await db.getAllAsync<ExerciseCatalogRow>(
          `${SELECT_CATALOG_SQL} WHERE category = ? ${orderBy}`,
          category,
        );

  return rows.map((row) => toCatalogItem(row));
}

export async function getExerciseById(
  db: SQLiteDatabase,
  exerciseId: string,
): Promise<ExerciseCatalogItem | null> {
  const row = await db.getFirstAsync<ExerciseCatalogRow>(
    `${SELECT_CATALOG_SQL} WHERE id = ? LIMIT 1;`,
    exerciseId,
  );
  return row === null ? null : toCatalogItem(row);
}

// --- Program templates ------------------------------------------------------

const SELECT_TEMPLATES_SQL = `
  SELECT id, title, session_type, goal, created_at
  FROM workout_templates
  ORDER BY
    CASE session_type WHEN 'strength' THEN 0 WHEN 'hybrid' THEN 1 ELSE 2 END,
    created_at,
    title;
`;

const SELECT_TEMPLATE_BLOCKS_SQL = `
  SELECT b.id, b.template_id, b.order_index, b.exercise_id,
         b.substituted_from_exercise_id, b.rest_seconds, b.notes,
         b.target_sets, b.target_reps,
         c.id AS catalog_id,
         c.name_hu, c.name_en, c.category, c.primary_muscles,
         c.axial_load_score, c.knee_stress_score, c.default_substitute_ids
  FROM template_exercise_blocks b
  JOIN exercise_catalog c ON c.id = b.exercise_id
  ORDER BY b.template_id, b.order_index;
`;

function toTemplateExercise(row: TemplateExerciseJoinRow): WorkoutTemplateExercise {
  const block: WorkoutTemplateExercise = {
    id: row.id,
    templateId: row.template_id,
    orderIndex: row.order_index,
    exerciseId: row.exercise_id,
    restSeconds: row.rest_seconds,
    // The join carries the block id as `id`; the catalog id lives in `catalog_id`.
    exercise: toCatalogItem(row, row.catalog_id),
  };

  if (row.substituted_from_exercise_id !== null) {
    block.substitutedFromExerciseId = row.substituted_from_exercise_id;
  }
  if (row.notes !== null && row.notes.length > 0) {
    block.notes = row.notes;
  }
  if (row.target_sets !== null) {
    block.targetSets = row.target_sets;
  }
  if (row.target_reps !== null) {
    block.targetReps = row.target_reps;
  }

  return block;
}

/** All templates with their exercises hydrated from the catalog. */
export async function getWorkoutTemplates(db: SQLiteDatabase): Promise<WorkoutTemplate[]> {
  const templateRows = await db.getAllAsync<WorkoutTemplateRow>(SELECT_TEMPLATES_SQL);
  const blockRows = await db.getAllAsync<TemplateExerciseJoinRow>(SELECT_TEMPLATE_BLOCKS_SQL);

  const blocksByTemplate = new Map<string, WorkoutTemplateExercise[]>();
  for (const row of blockRows) {
    const blocks = blocksByTemplate.get(row.template_id) ?? [];
    blocks.push(toTemplateExercise(row));
    blocksByTemplate.set(row.template_id, blocks);
  }

  return templateRows.map((row) => {
    const template: WorkoutTemplate = {
      id: row.id,
      title: row.title,
      sessionType: row.session_type,
      createdAt: row.created_at,
      exercises: blocksByTemplate.get(row.id) ?? [],
    };
    if (row.goal !== null) {
      template.goal = row.goal;
    }
    return template;
  });
}

export async function getWorkoutTemplateById(
  db: SQLiteDatabase,
  templateId: string,
): Promise<WorkoutTemplate | null> {
  const templates = await getWorkoutTemplates(db);
  return templates.find((template) => template.id === templateId) ?? null;
}

// --- Seeded default program -------------------------------------------------

interface TemplateBlockSeed {
  exerciseId: string;
  targetSets: number;
  targetReps: string;
  restSeconds: number;
  notes?: string;
  substitutedFromExerciseId?: string;
}

interface TemplateSeed {
  id: string;
  title: string;
  sessionType: SessionType;
  goal: TrainingGoal;
  blocks: TemplateBlockSeed[];
}

/**
 * Default program: 4-day powerbuilding split + 3 running days.
 * Ids are stable so re-seeding is a no-op (INSERT OR IGNORE) and never clobbers
 * a template the user has edited.
 */
export const DEFAULT_TEMPLATE_SEEDS: readonly TemplateSeed[] = [
  {
    id: 'tpl_upper_a',
    title: 'Upper A',
    sessionType: 'strength',
    goal: 'powerbuilding',
    blocks: [
      { exerciseId: 'bench_press', targetSets: 4, targetReps: '6-8', restSeconds: 150 },
      { exerciseId: 'overhead_press', targetSets: 3, targetReps: '8-10', restSeconds: 120 },
      { exerciseId: 'barbell_row', targetSets: 4, targetReps: '8-10', restSeconds: 120 },
      { exerciseId: 'weighted_pullup', targetSets: 3, targetReps: '8-10', restSeconds: 120 },
    ],
  },
  {
    id: 'tpl_lower_a',
    title: 'Lower A - Elölguggolás',
    sessionType: 'strength',
    goal: 'powerbuilding',
    blocks: [
      { exerciseId: 'front_squat', targetSets: 5, targetReps: '5', restSeconds: 180 },
      { exerciseId: 'romanian_deadlift', targetSets: 3, targetReps: '8-10', restSeconds: 150 },
      { exerciseId: 'leg_extension', targetSets: 3, targetReps: '12-15', restSeconds: 90 },
      { exerciseId: 'adductor_machine', targetSets: 3, targetReps: '15-20', restSeconds: 60 },
    ],
  },
  {
    id: 'tpl_upper_b',
    title: 'Upper B',
    sessionType: 'strength',
    goal: 'powerbuilding',
    blocks: [
      {
        exerciseId: 'bench_press',
        targetSets: 4,
        targetReps: '5',
        restSeconds: 180,
        notes: 'Csúcssorozat, utána 2 backoff sorozat 8 ismétléssel.',
      },
      { exerciseId: 'barbell_row', targetSets: 4, targetReps: '6-8', restSeconds: 150 },
      { exerciseId: 'overhead_press', targetSets: 3, targetReps: '10-12', restSeconds: 90 },
      { exerciseId: 'weighted_pullup', targetSets: 3, targetReps: '6-8', restSeconds: 150 },
    ],
  },
  {
    id: 'tpl_lower_b',
    title: 'Lower B - Román felhúzás & Öves guggolás',
    sessionType: 'strength',
    goal: 'powerbuilding',
    blocks: [
      { exerciseId: 'romanian_deadlift', targetSets: 4, targetReps: '6-8', restSeconds: 180 },
      {
        exerciseId: 'belt_squat',
        targetSets: 4,
        targetReps: '8-10',
        restSeconds: 150,
        notes: 'Alacsony tengelyterhelés — térdkímélő guggolás.',
      },
      { exerciseId: 'leg_extension', targetSets: 3, targetReps: '12', restSeconds: 90 },
      { exerciseId: 'adductor_machine', targetSets: 3, targetReps: '15', restSeconds: 60 },
    ],
  },
  {
    id: 'tpl_run_5k',
    title: '5 km futás',
    sessionType: 'running',
    goal: 'hybrid_strength_running',
    blocks: [
      {
        exerciseId: 'run_5k',
        targetSets: 1,
        targetReps: '5 km',
        restSeconds: 0,
        notes: 'Könnyű tempó, beszélgetős intenzitás.',
      },
    ],
  },
  {
    id: 'tpl_run_7k',
    title: '7 km futás',
    sessionType: 'running',
    goal: 'hybrid_strength_running',
    blocks: [
      {
        exerciseId: 'run_7k',
        targetSets: 1,
        targetReps: '7 km',
        restSeconds: 0,
        notes: 'Hosszú, egyenletes futás.',
      },
    ],
  },
  {
    id: 'tpl_run_tempo',
    title: '5 km tempó futás',
    sessionType: 'running',
    goal: 'hybrid_strength_running',
    blocks: [
      {
        exerciseId: 'run_5k',
        targetSets: 1,
        targetReps: '5 km',
        restSeconds: 0,
        notes: '1 km bemelegítés + 3 km küszöbtempó + 1 km levezetés.',
      },
    ],
  },
];

const INSERT_TEMPLATE_SQL = `
  INSERT OR IGNORE INTO workout_templates (id, title, session_type, goal, created_at)
  VALUES (?, ?, ?, ?, ?);
`;

const INSERT_TEMPLATE_BLOCK_SQL = `
  INSERT OR IGNORE INTO template_exercise_blocks
    (id, template_id, order_index, exercise_id, substituted_from_exercise_id,
     rest_seconds, notes, target_sets, target_reps)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

/**
 * Seeds the default 4-day powerbuilding + 3-day running program.
 * Idempotent: returns the number of templates actually inserted (0 on re-run).
 */
export async function seedDefaultTemplates(db: SQLiteDatabase): Promise<number> {
  const createdAt = new Date().toISOString();
  let inserted = 0;

  await db.withTransactionAsync(async () => {
    for (const seed of DEFAULT_TEMPLATE_SEEDS) {
      const result = await db.runAsync(
        INSERT_TEMPLATE_SQL,
        seed.id,
        seed.title,
        seed.sessionType,
        seed.goal,
        createdAt,
      );
      inserted += result.changes;

      for (let index = 0; index < seed.blocks.length; index += 1) {
        const block = seed.blocks[index];
        await db.runAsync(
          INSERT_TEMPLATE_BLOCK_SQL,
          `${seed.id}:${index}`,
          seed.id,
          index,
          block.exerciseId,
          block.substitutedFromExerciseId ?? null,
          block.restSeconds,
          block.notes ?? null,
          block.targetSets,
          block.targetReps,
        );
      }
    }
  });

  return inserted;
}

// --- Session logs -----------------------------------------------------------

export interface SessionHistorySummary {
  id: string;
  title: string;
  sessionType: SessionType;
  startedAt: string;
  completedAt: string;
  syncStatus: SyncStatus;
  exerciseCount: number;
  distanceKm?: number;
  durationSeconds?: number;
}

export interface ActiveSessionSummary {
  id: string;
  title: string;
  sessionType: SessionType;
  startedAt: string;
  exerciseCount: number;
}

interface SessionHistoryRow extends SessionLogRow {
  exercise_count: number;
  distance_km: number | null;
  duration_seconds: number | null;
}

const SELECT_HISTORY_SQL = `
  SELECT s.id, s.program_day_id, s.session_type, s.title, s.started_at,
         s.completed_at, s.sync_status,
         (SELECT COUNT(*) FROM session_exercise_blocks b WHERE b.session_id = s.id) AS exercise_count,
         r.distance_km, r.duration_seconds
  FROM session_logs s
  LEFT JOIN running_metrics r ON r.session_id = s.id
  WHERE s.completed_at IS NOT NULL
  ORDER BY s.started_at DESC
  LIMIT ?;
`;

/** Completed sessions, newest first — feeds the Előzmények tab. */
export async function getSessionHistory(
  db: SQLiteDatabase,
  limit = 50,
): Promise<SessionHistorySummary[]> {
  const rows = await db.getAllAsync<SessionHistoryRow>(SELECT_HISTORY_SQL, limit);

  return rows.map((row) => {
    // completed_at is guaranteed by the WHERE clause.
    const summary: SessionHistorySummary = {
      id: row.id,
      title: row.title,
      sessionType: row.session_type,
      startedAt: row.started_at,
      completedAt: row.completed_at ?? row.started_at,
      syncStatus: row.sync_status,
      exerciseCount: row.exercise_count,
    };
    if (row.distance_km !== null) {
      summary.distanceKm = row.distance_km;
    }
    if (row.duration_seconds !== null) {
      summary.durationSeconds = row.duration_seconds;
    }
    return summary;
  });
}

/** The in-progress session, if any (one at a time by design). */
export async function getActiveSession(
  db: SQLiteDatabase,
): Promise<ActiveSessionSummary | null> {
  const row = await db.getFirstAsync<SessionLogRow & { exercise_count: number }>(
    `SELECT s.id, s.program_day_id, s.session_type, s.title, s.started_at,
            s.completed_at, s.sync_status,
            (SELECT COUNT(*) FROM session_exercise_blocks b WHERE b.session_id = s.id) AS exercise_count
     FROM session_logs s
     WHERE s.completed_at IS NULL
     ORDER BY s.started_at DESC
     LIMIT 1;`,
  );

  if (row === null) {
    return null;
  }

  return {
    id: row.id,
    title: row.title,
    sessionType: row.session_type,
    startedAt: row.started_at,
    exerciseCount: row.exercise_count,
  };
}

/**
 * Starts a session from a template: copies the template blocks into the session
 * so the logger can attach sets. Reuses the in-progress session instead of
 * creating duplicates when the user taps quick-start twice.
 */
export async function startSessionFromTemplate(
  db: SQLiteDatabase,
  template: WorkoutTemplate,
): Promise<string> {
  const existing = await getActiveSession(db);
  if (existing !== null) {
    return existing.id;
  }

  const sessionId = createLocalId('sess');
  const startedAt = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO session_logs
         (id, program_day_id, session_type, title, started_at, completed_at, sync_status)
       VALUES (?, ?, ?, ?, ?, NULL, 'local_dirty');`,
      sessionId,
      template.id,
      template.sessionType,
      template.title,
      startedAt,
    );

    for (const block of template.exercises) {
      await db.runAsync(
        `INSERT INTO session_exercise_blocks
           (id, session_id, order_index, exercise_id, substituted_from_exercise_id,
            rest_seconds, notes, target_sets, target_reps)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);`,
        `${sessionId}:${block.orderIndex}`,
        sessionId,
        block.orderIndex,
        block.exerciseId,
        block.substitutedFromExerciseId ?? null,
        block.restSeconds,
        block.notes ?? null,
        block.targetSets ?? null,
        block.targetReps ?? null,
      );
    }
  });

  return sessionId;
}

// --- Active session logging (offline-first writes) --------------------------
//
// Every write below is a single-user, single-device local mutation: the row is
// persisted immediately and the parent session is flagged `local_dirty` so a
// later sync pass can pick up exactly what changed. Screens read the resulting
// graph back through getSessionDetail.

const RPE_MIN = 5;
const RPE_MAX = 10;

/** RPE is optional; when present it must be 5.0-10.0 (0.5 steps are the UI's job). */
function normalizeRpe(rpe: number | undefined): number | null {
  if (rpe === undefined) {
    return null;
  }
  if (!Number.isFinite(rpe) || rpe < RPE_MIN || rpe > RPE_MAX) {
    throw new RangeError(`RPE must be between ${RPE_MIN} and ${RPE_MAX}, received ${String(rpe)}.`);
  }
  return rpe;
}

/** Flags the session as needing sync (its logs changed locally). */
async function markSessionDirty(db: SQLiteDatabase, sessionId: string): Promise<void> {
  await db.runAsync(
    `UPDATE session_logs SET sync_status = 'local_dirty' WHERE id = ?;`,
    sessionId,
  );
}

const SELECT_SESSION_DETAIL_SQL = `
  SELECT id, program_day_id, session_type, title, started_at, completed_at, sync_status
  FROM session_logs
  WHERE id = ?
  LIMIT 1;
`;

const SELECT_SESSION_BLOCKS_SQL = `
  SELECT b.id, b.session_id, b.order_index, b.exercise_id,
         b.substituted_from_exercise_id, b.rest_seconds, b.notes,
         b.target_sets, b.target_reps,
         c.id AS catalog_id,
         c.name_hu, c.name_en, c.category, c.primary_muscles,
         c.axial_load_score, c.knee_stress_score, c.default_substitute_ids
  FROM session_exercise_blocks b
  JOIN exercise_catalog c ON c.id = b.exercise_id
  WHERE b.session_id = ?
  ORDER BY b.order_index;
`;

const SELECT_SESSION_SET_LOGS_SQL = `
  SELECT l.id, l.block_id, l.set_number, l.set_type, l.target_weight_kg,
         l.actual_weight_kg, l.target_reps, l.actual_reps, l.rpe, l.completed_at
  FROM set_logs l
  JOIN session_exercise_blocks b ON b.id = l.block_id
  WHERE b.session_id = ?
  ORDER BY l.block_id, l.set_number;
`;

const SELECT_RUNNING_METRICS_SQL = `
  SELECT session_id, distance_km, duration_seconds,
         avg_pace_seconds_per_km, perceived_effort_rpe
  FROM running_metrics
  WHERE session_id = ?
  LIMIT 1;
`;

const UPSERT_SET_LOG_SQL = `
  INSERT INTO set_logs
    (id, block_id, set_number, set_type, target_weight_kg, actual_weight_kg,
     target_reps, actual_reps, rpe, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    set_number = excluded.set_number,
    set_type = excluded.set_type,
    target_weight_kg = excluded.target_weight_kg,
    actual_weight_kg = excluded.actual_weight_kg,
    target_reps = excluded.target_reps,
    actual_reps = excluded.actual_reps,
    rpe = excluded.rpe,
    completed_at = excluded.completed_at;
`;

const UPSERT_RUNNING_METRICS_SQL = `
  INSERT INTO running_metrics
    (session_id, distance_km, duration_seconds, avg_pace_seconds_per_km, perceived_effort_rpe)
  VALUES (?, ?, ?, ?, ?)
  ON CONFLICT(session_id) DO UPDATE SET
    distance_km = excluded.distance_km,
    duration_seconds = excluded.duration_seconds,
    avg_pace_seconds_per_km = excluded.avg_pace_seconds_per_km,
    perceived_effort_rpe = excluded.perceived_effort_rpe;
`;

function toSetLog(row: SetLogRow): SetLog {
  const log: SetLog = {
    id: row.id,
    setNumber: row.set_number,
    setType: row.set_type,
    actualWeightKg: row.actual_weight_kg,
    targetReps: row.target_reps,
    actualReps: row.actual_reps,
    completedAt: row.completed_at,
  };
  if (row.target_weight_kg !== null) {
    log.targetWeightKg = row.target_weight_kg;
  }
  if (row.rpe !== null) {
    log.rpe = row.rpe;
  }
  return log;
}

function toRunningMetrics(row: RunningMetricsRow): RunningMetrics {
  const metrics: RunningMetrics = {
    distanceKm: row.distance_km,
    durationSeconds: row.duration_seconds,
    avgPaceSecondsPerKm: row.avg_pace_seconds_per_km,
  };
  if (row.perceived_effort_rpe !== null) {
    metrics.perceivedEffortRpe = row.perceived_effort_rpe;
  }
  return metrics;
}

/** Pace in seconds per kilometre; 0 when either input is missing so it is never NaN. */
export function computeAvgPaceSecondsPerKm(distanceKm: number, durationSeconds: number): number {
  if (!(distanceKm > 0) || !(durationSeconds > 0)) {
    return 0;
  }
  return durationSeconds / distanceKm;
}

/**
 * Full session graph for the logger: the session, its ordered blocks hydrated
 * with catalog metadata, every logged set per block, and — for running/hybrid
 * sessions — the running metrics. Returns null when the session is unknown.
 */
export async function getSessionDetail(
  db: SQLiteDatabase,
  sessionId: string,
): Promise<WorkoutSessionLog | null> {
  const session = await db.getFirstAsync<SessionLogRow>(SELECT_SESSION_DETAIL_SQL, sessionId);
  if (session === null) {
    return null;
  }

  const blockRows = await db.getAllAsync<SessionExerciseJoinRow>(
    SELECT_SESSION_BLOCKS_SQL,
    sessionId,
  );
  const setRows = await db.getAllAsync<SetLogRow>(SELECT_SESSION_SET_LOGS_SQL, sessionId);

  const setsByBlock = new Map<string, SetLog[]>();
  for (const row of setRows) {
    const list = setsByBlock.get(row.block_id) ?? [];
    list.push(toSetLog(row));
    setsByBlock.set(row.block_id, list);
  }

  const exerciseBlocks: SessionExerciseBlock[] = blockRows.map((row) => {
    const block: SessionExerciseBlock = {
      id: row.id,
      sessionId: row.session_id,
      orderIndex: row.order_index,
      exerciseId: row.exercise_id,
      restSeconds: row.rest_seconds,
      // The join carries the block id as `id`; the catalog id lives in `catalog_id`.
      exercise: toCatalogItem(row, row.catalog_id),
      sets: setsByBlock.get(row.id) ?? [],
    };
    if (row.substituted_from_exercise_id !== null) {
      block.substitutedFromExerciseId = row.substituted_from_exercise_id;
    }
    if (row.notes !== null && row.notes.length > 0) {
      block.notes = row.notes;
    }
    if (row.target_sets !== null) {
      block.targetSets = row.target_sets;
    }
    if (row.target_reps !== null) {
      block.targetReps = row.target_reps;
    }
    return block;
  });

  const detail: WorkoutSessionLog = {
    id: session.id,
    sessionType: session.session_type,
    title: session.title,
    startedAt: session.started_at,
    syncStatus: session.sync_status,
    exerciseBlocks,
  };
  if (session.program_day_id !== null) {
    detail.programDayId = session.program_day_id;
  }
  if (session.completed_at !== null) {
    detail.completedAt = session.completed_at;
  }

  if (session.session_type === 'running' || session.session_type === 'hybrid') {
    const metrics = await db.getFirstAsync<RunningMetricsRow>(SELECT_RUNNING_METRICS_SQL, sessionId);
    if (metrics !== null) {
      detail.runningMetrics = toRunningMetrics(metrics);
    }
  }

  return detail;
}

export interface SetLogInput {
  /** Existing set id when editing; omitted to create a new row. */
  id?: string;
  setNumber: number;
  setType: SetType;
  actualWeightKg: number;
  actualReps: number;
  /** Target rep range (e.g. "6-8"); falls back to the block prescription. */
  targetReps?: string;
  targetWeightKg?: number;
  /** 5.0 - 10.0, optional. */
  rpe?: number;
  completedAt?: string;
}

/**
 * Persists one set as the user logs it (weight, reps, set type, RPE) and marks
 * the session dirty. Upserts on id so the same call edits an existing set.
 */
export async function upsertSetLog(
  db: SQLiteDatabase,
  blockId: string,
  input: SetLogInput,
): Promise<SetLog> {
  const rpe = normalizeRpe(input.rpe);
  const completedAt = input.completedAt ?? new Date().toISOString();
  const id = input.id ?? createLocalId('set');

  const block = await db.getFirstAsync<{ session_id: string; target_reps: string | null }>(
    'SELECT session_id, target_reps FROM session_exercise_blocks WHERE id = ? LIMIT 1;',
    blockId,
  );
  if (block === null) {
    throw new Error(`Cannot log a set: block "${blockId}" does not exist.`);
  }
  const targetReps = input.targetReps ?? block.target_reps ?? '—';

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      UPSERT_SET_LOG_SQL,
      id,
      blockId,
      input.setNumber,
      input.setType,
      input.targetWeightKg ?? null,
      input.actualWeightKg,
      targetReps,
      input.actualReps,
      rpe,
      completedAt,
    );
    await markSessionDirty(db, block.session_id);
  });

  const setLog: SetLog = {
    id,
    setNumber: input.setNumber,
    setType: input.setType,
    actualWeightKg: input.actualWeightKg,
    targetReps,
    actualReps: input.actualReps,
    completedAt,
  };
  if (input.targetWeightKg !== undefined) {
    setLog.targetWeightKg = input.targetWeightKg;
  }
  if (rpe !== null) {
    setLog.rpe = rpe;
  }
  return setLog;
}

/** Removes a logged set (un-checking a completed row) and flags its session dirty. */
export async function deleteSetLog(db: SQLiteDatabase, setLogId: string): Promise<void> {
  await db.withTransactionAsync(async () => {
    const row = await db.getFirstAsync<{ block_id: string }>(
      'SELECT block_id FROM set_logs WHERE id = ? LIMIT 1;',
      setLogId,
    );
    await db.runAsync('DELETE FROM set_logs WHERE id = ?;', setLogId);
    if (row !== null) {
      await db.runAsync(
        `UPDATE session_logs SET sync_status = 'local_dirty'
         WHERE id = (SELECT session_id FROM session_exercise_blocks WHERE id = ?);`,
        row.block_id,
      );
    }
  });
}

/**
 * Swaps the exercise in a session block mid-workout. The block's
 * `substituted_from_exercise_id` records the *original* prescription (kept
 * across repeated swaps) so the log shows what was planned versus performed.
 */
export async function substituteExerciseInBlock(
  db: SQLiteDatabase,
  blockId: string,
  newExerciseId: string,
): Promise<void> {
  const block = await db.getFirstAsync<{ session_id: string; exercise_id: string }>(
    'SELECT session_id, exercise_id FROM session_exercise_blocks WHERE id = ? LIMIT 1;',
    blockId,
  );
  if (block === null) {
    throw new Error(`Cannot substitute: block "${blockId}" does not exist.`);
  }
  if (block.exercise_id === newExerciseId) {
    return;
  }

  const target = await getExerciseById(db, newExerciseId);
  if (target === null) {
    throw new Error(`Cannot substitute: exercise "${newExerciseId}" is not in the catalog.`);
  }

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      `UPDATE session_exercise_blocks
         SET exercise_id = ?,
             substituted_from_exercise_id = COALESCE(substituted_from_exercise_id, exercise_id)
       WHERE id = ?;`,
      newExerciseId,
      blockId,
    );
    await markSessionDirty(db, block.session_id);
  });
}

/**
 * Substitution options for a block, best first: the current exercise's
 * `defaultSubstituteIds` (e.g. Hack guggolás -> Öves guggolás), then the rest of
 * the catalog ordered joint-friendliest first, excluding the current exercise.
 */
export async function getSubstitutionCandidates(
  db: SQLiteDatabase,
  blockId: string,
): Promise<ExerciseCatalogItem[]> {
  const block = await db.getFirstAsync<{ exercise_id: string }>(
    'SELECT exercise_id FROM session_exercise_blocks WHERE id = ? LIMIT 1;',
    blockId,
  );
  const currentId = block?.exercise_id ?? null;
  const current = currentId === null ? null : await getExerciseById(db, currentId);
  const catalog = await getExerciseCatalog(db);

  const ranked: ExerciseCatalogItem[] = [];
  const seen = new Set<string>();
  const push = (item: ExerciseCatalogItem): void => {
    if (item.id === currentId || seen.has(item.id)) {
      return;
    }
    seen.add(item.id);
    ranked.push(item);
  };

  if (current !== null) {
    for (const id of current.defaultSubstituteIds) {
      const item = catalog.find((entry) => entry.id === id);
      if (item !== undefined) {
        push(item);
      }
    }
  }

  const remainder = catalog
    .filter((item) => !seen.has(item.id) && item.id !== currentId)
    .sort(
      (left, right) =>
        left.kneeStressScore +
        left.axialLoadScore -
        (right.kneeStressScore + right.axialLoadScore) ||
        left.nameHu.localeCompare(right.nameHu),
    );
  for (const item of remainder) {
    push(item);
  }

  return ranked;
}

export interface RunningMetricsInput {
  distanceKm: number;
  durationSeconds: number;
  perceivedEffortRpe?: number;
}

/**
 * Saves a running session's distance, duration, computed pace, and RPE.
 * Upserts on session_id so repeated edits from the logger keep one row.
 */
export async function upsertRunningMetrics(
  db: SQLiteDatabase,
  sessionId: string,
  input: RunningMetricsInput,
): Promise<RunningMetrics> {
  const pace = computeAvgPaceSecondsPerKm(input.distanceKm, input.durationSeconds);
  const rpe = normalizeRpe(input.perceivedEffortRpe);

  await db.withTransactionAsync(async () => {
    await db.runAsync(
      UPSERT_RUNNING_METRICS_SQL,
      sessionId,
      input.distanceKm,
      input.durationSeconds,
      pace,
      rpe,
    );
    await markSessionDirty(db, sessionId);
  });

  const metrics: RunningMetrics = {
    distanceKm: input.distanceKm,
    durationSeconds: input.durationSeconds,
    avgPaceSecondsPerKm: pace,
  };
  if (rpe !== null) {
    metrics.perceivedEffortRpe = rpe;
  }
  return metrics;
}

/**
 * Finishes a session: stamps `completed_at` so it appears immediately in the
 * Előzmények tab. Returns the completion timestamp.
 */
export async function completeSession(db: SQLiteDatabase, sessionId: string): Promise<string> {
  const completedAt = new Date().toISOString();
  await db.runAsync(
    `UPDATE session_logs SET completed_at = ?, sync_status = 'local_dirty' WHERE id = ?;`,
    completedAt,
    sessionId,
  );
  return completedAt;
}

/**
 * Discards an in-progress session and everything under it (cascade). Only
 * uncompleted sessions are removed, so this can never erase history. Returns
 * true when a row was deleted.
 */
export async function discardSession(db: SQLiteDatabase, sessionId: string): Promise<boolean> {
  const result = await db.runAsync(
    'DELETE FROM session_logs WHERE id = ? AND completed_at IS NULL;',
    sessionId,
  );
  return result.changes > 0;
}