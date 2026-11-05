// Full local backup & restore (Phase 6).
//
// Expo Go stores everything in a per-app SQLite file that a standalone build
// cannot read, so the migration path is a JSON snapshot: export the whole local
// database here, copy the text across, and import it on the new install.
//
// The snapshot covers the things a user would lose — profile + joint
// constraints, custom exercises, custom templates, and every historical
// session (sessions, blocks, sets, running metrics). Seeded/generated program
// templates are *not* included: they are rebuilt from the profile on first launch.
//
// Import is a full replace of those domains inside one transaction, so a restored
// database is byte-for-byte the source's data and a half-applied import can never
// leave the database inconsistent.

import type { SQLiteDatabase } from 'expo-sqlite';
import { SCHEMA_VERSION } from '../db/schema';
import type {
  ClientBillingProfileRow,
  CoachingBookingRow,
  CoachingSlotRow,
  ExerciseCatalogRow,
  JointConstraintRow,
  RunningMetricsRow,
  SessionExerciseBlockRow,
  SessionLogRow,
  SetLogRow,
  TemplateExerciseBlockRow,
  UserProfileRow,
  WorkoutTemplateRow,
} from '../db/schema';

/** Magic marker so an arbitrary JSON blob is rejected before it touches the DB. */
export const BACKUP_FORMAT = 'workoutapp.backup';
export const BACKUP_VERSION = 1;

export interface DatabaseSnapshotData {
  profile: UserProfileRow | null;
  jointConstraints: JointConstraintRow[];
  customExercises: ExerciseCatalogRow[];
  customTemplates: WorkoutTemplateRow[];
  customTemplateBlocks: TemplateExerciseBlockRow[];
  sessionLogs: SessionLogRow[];
  sessionExerciseBlocks: SessionExerciseBlockRow[];
  setLogs: SetLogRow[];
  runningMetrics: RunningMetricsRow[];
  /** Phase 7A — client contact & billing, plus coaching slots/bookings. */
  clientBillingProfile: ClientBillingProfileRow | null;
  coachingSlots: CoachingSlotRow[];
  coachingBookings: CoachingBookingRow[];
}

export interface DatabaseSnapshot {
  format: typeof BACKUP_FORMAT;
  backupVersion: number;
  /** Schema version the snapshot was taken on; a newer one cannot be imported. */
  schemaVersion: number;
  exportedAt: string; // ISO-8601
  data: DatabaseSnapshotData;
}

/** Row counts written by an import — surfaced to the Profil card as feedback. */
export interface ImportSummary {
  profile: boolean;
  jointConstraints: number;
  customExercises: number;
  customTemplates: number;
  sessionLogs: number;
  sessionExerciseBlocks: number;
  setLogs: number;
  runningMetrics: number;
  clientBillingProfile: boolean;
  coachingSlots: number;
  coachingBookings: number;
}

// --- Export -----------------------------------------------------------------

const SELECT_PROFILE_ROW_SQL = `
  SELECT id, locale, age, weight_kg, height_cm, primary_goal, experience_months,
         strength_days_per_week, running_days_per_week, target_run_distance_km,
         session_duration_minutes, equipment, excluded_exercise_ids,
         preferred_substitutions, onboarding_completed_at, updated_at
  FROM user_profiles
  LIMIT 1;
`;

const SELECT_JOINT_CONSTRAINTS_SQL = `
  SELECT id, user_id, area, severity, notes, created_at
  FROM joint_constraints;
`;

const SELECT_CUSTOM_EXERCISES_SQL = `
  SELECT id, name_hu, name_en, category, equipment, movement_pattern, primary_muscles,
         axial_load_score, knee_stress_score, default_substitute_ids, is_custom
  FROM exercise_catalog
  WHERE is_custom = 1
  ORDER BY id;
`;

const SELECT_CUSTOM_TEMPLATES_SQL = `
  SELECT id, title, session_type, goal, source, coach_note, assigned_at, created_at
  FROM workout_templates
  WHERE id LIKE 'tpl_user%'
  ORDER BY created_at, id;
`;

const SELECT_CUSTOM_TEMPLATE_BLOCKS_SQL = `
  SELECT b.id, b.template_id, b.order_index, b.exercise_id,
         b.substituted_from_exercise_id, b.rest_seconds, b.notes,
         b.target_sets, b.target_reps
  FROM template_exercise_blocks b
  JOIN workout_templates t ON t.id = b.template_id
  WHERE t.id LIKE 'tpl_user%'
  ORDER BY b.template_id, b.order_index;
`;

const SELECT_SESSION_LOGS_SQL = `
  SELECT id, program_day_id, session_type, title, started_at, completed_at, sync_status
  FROM session_logs
  ORDER BY started_at;
`;

const SELECT_SESSION_BLOCKS_SQL = `
  SELECT id, session_id, order_index, exercise_id, substituted_from_exercise_id,
         rest_seconds, notes, target_sets, target_reps
  FROM session_exercise_blocks
  ORDER BY session_id, order_index;
`;

const SELECT_SET_LOGS_SQL = `
  SELECT id, block_id, set_number, set_type, target_weight_kg, actual_weight_kg,
         target_reps, actual_reps, rpe, completed_at
  FROM set_logs
  ORDER BY block_id, set_number;
`;

const SELECT_RUNNING_METRICS_SQL = `
  SELECT session_id, distance_km, duration_seconds, avg_pace_seconds_per_km, perceived_effort_rpe
  FROM running_metrics
  ORDER BY session_id;
`;

const SELECT_BILLING_PROFILE_SQL = `
  SELECT id, full_name, email, phone, billing_name, billing_country,
         billing_zip, billing_city, billing_address, tax_number,
         created_at, updated_at
  FROM client_billing_profiles
  LIMIT 1;
`;

const SELECT_COACHING_SLOTS_SQL = `
  SELECT id, starts_at, ends_at, modality, location_or_link, is_booked
  FROM coaching_slots
  ORDER BY starts_at;
`;

const SELECT_COACHING_BOOKINGS_SQL = `
  SELECT id, slot_id, user_id, modality, starts_at, ends_at, location_or_link,
         client_notes, coach_notes, status, sync_status, created_at
  FROM coaching_bookings
  ORDER BY starts_at;
`;

/** Reads the whole local database into a typed snapshot object. */
export async function buildFullDatabaseSnapshot(db: SQLiteDatabase): Promise<DatabaseSnapshot> {
  const profile = await db.getFirstAsync<UserProfileRow>(SELECT_PROFILE_ROW_SQL);

  const [
    jointConstraints,
    customExercises,
    customTemplates,
    customTemplateBlocks,
    sessionLogs,
    sessionExerciseBlocks,
    setLogs,
    runningMetrics,
    clientBillingProfile,
    coachingSlots,
    coachingBookings,
  ] = await Promise.all([
    db.getAllAsync<JointConstraintRow>(SELECT_JOINT_CONSTRAINTS_SQL),
    db.getAllAsync<ExerciseCatalogRow>(SELECT_CUSTOM_EXERCISES_SQL),
    db.getAllAsync<WorkoutTemplateRow>(SELECT_CUSTOM_TEMPLATES_SQL),
    db.getAllAsync<TemplateExerciseBlockRow>(SELECT_CUSTOM_TEMPLATE_BLOCKS_SQL),
    db.getAllAsync<SessionLogRow>(SELECT_SESSION_LOGS_SQL),
    db.getAllAsync<SessionExerciseBlockRow>(SELECT_SESSION_BLOCKS_SQL),
    db.getAllAsync<SetLogRow>(SELECT_SET_LOGS_SQL),
    db.getAllAsync<RunningMetricsRow>(SELECT_RUNNING_METRICS_SQL),
    db.getFirstAsync<ClientBillingProfileRow>(SELECT_BILLING_PROFILE_SQL),
    db.getAllAsync<CoachingSlotRow>(SELECT_COACHING_SLOTS_SQL),
    db.getAllAsync<CoachingBookingRow>(SELECT_COACHING_BOOKINGS_SQL),
  ]);

  return {
    format: BACKUP_FORMAT,
    backupVersion: BACKUP_VERSION,
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      profile,
      jointConstraints,
      customExercises,
      customTemplates,
      customTemplateBlocks,
      sessionLogs,
      sessionExerciseBlocks,
      setLogs,
      runningMetrics,
      clientBillingProfile,
      coachingSlots,
      coachingBookings,
    },
  };
}

/** Convenience wrapper the Profil card copies to the clipboard. */
export async function exportFullDatabaseSnapshot(db: SQLiteDatabase): Promise<string> {
  const snapshot = await buildFullDatabaseSnapshot(db);
  return JSON.stringify(snapshot, null, 2);
}

// --- Import -----------------------------------------------------------------

function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Validates a snapshot blob and throws a human-readable error when it is not a
 * backup this app can restore. Keeps the caller (the Profil card) from having to
 * guard against arbitrary pasted JSON.
 */
export function parseFullDatabaseSnapshot(jsonString: string): DatabaseSnapshot {
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    throw new Error('A beillesztett szöveg nem érvényes JSON.');
  }
  if (parsed === null || typeof parsed !== 'object') {
    throw new Error('A biztonsági mentés formátuma hibás.');
  }

  const candidate = parsed as Partial<DatabaseSnapshot>;
  if (candidate.format !== BACKUP_FORMAT) {
    throw new Error('Ez nem a WorkoutApp biztonsági mentése.');
  }
  if (typeof candidate.backupVersion !== 'number' || candidate.backupVersion > BACKUP_VERSION) {
    throw new Error('A biztonsági mentés újabb verziójú, mint amit ez az app támogat.');
  }
  if (typeof candidate.schemaVersion !== 'number' || candidate.schemaVersion > SCHEMA_VERSION) {
    throw new Error('A biztonsági mentés újabb adatbázis-sémát használ.');
  }
  if (candidate.data === null || typeof candidate.data !== 'object') {
    throw new Error('A biztonsági mentésből hiányoznak az adatok.');
  }

  const data = candidate.data as Partial<DatabaseSnapshotData>;
  return {
    format: BACKUP_FORMAT,
    backupVersion: candidate.backupVersion,
    schemaVersion: candidate.schemaVersion,
    exportedAt: typeof candidate.exportedAt === 'string' ? candidate.exportedAt : '',
    data: {
      profile: data.profile ?? null,
      jointConstraints: asArray<JointConstraintRow>(data.jointConstraints),
      customExercises: asArray<ExerciseCatalogRow>(data.customExercises),
      customTemplates: asArray<WorkoutTemplateRow>(data.customTemplates),
      customTemplateBlocks: asArray<TemplateExerciseBlockRow>(data.customTemplateBlocks),
      sessionLogs: asArray<SessionLogRow>(data.sessionLogs),
      sessionExerciseBlocks: asArray<SessionExerciseBlockRow>(data.sessionExerciseBlocks),
      setLogs: asArray<SetLogRow>(data.setLogs),
      runningMetrics: asArray<RunningMetricsRow>(data.runningMetrics),
      clientBillingProfile: data.clientBillingProfile ?? null,
      coachingSlots: asArray<CoachingSlotRow>(data.coachingSlots),
      coachingBookings: asArray<CoachingBookingRow>(data.coachingBookings),
    },
  };
}

const INSERT_PROFILE_SQL = `
  INSERT INTO user_profiles
    (id, locale, age, weight_kg, height_cm, primary_goal, experience_months,
     strength_days_per_week, running_days_per_week, target_run_distance_km,
     session_duration_minutes, equipment, excluded_exercise_ids,
     preferred_substitutions, onboarding_completed_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const INSERT_JOINT_CONSTRAINT_SQL = `
  INSERT INTO joint_constraints (id, user_id, area, severity, notes, created_at)
  VALUES (?, ?, ?, ?, ?, ?);
`;

const INSERT_CUSTOM_EXERCISE_SQL = `
  INSERT INTO exercise_catalog
    (id, name_hu, name_en, category, equipment, movement_pattern, primary_muscles,
     axial_load_score, knee_stress_score, default_substitute_ids, is_custom)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1);
`;

const INSERT_TEMPLATE_SQL = `
  INSERT INTO workout_templates
    (id, title, session_type, goal, source, coach_note, assigned_at, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`;

const INSERT_TEMPLATE_BLOCK_SQL = `
  INSERT INTO template_exercise_blocks
    (id, template_id, order_index, exercise_id, substituted_from_exercise_id,
     rest_seconds, notes, target_sets, target_reps)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const INSERT_SESSION_LOG_SQL = `
  INSERT INTO session_logs
    (id, program_day_id, session_type, title, started_at, completed_at, sync_status)
  VALUES (?, ?, ?, ?, ?, ?, ?);
`;

const INSERT_SESSION_BLOCK_SQL = `
  INSERT INTO session_exercise_blocks
    (id, session_id, order_index, exercise_id, substituted_from_exercise_id,
     rest_seconds, notes, target_sets, target_reps)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const INSERT_SET_LOG_SQL = `
  INSERT INTO set_logs
    (id, block_id, set_number, set_type, target_weight_kg, actual_weight_kg,
     target_reps, actual_reps, rpe, completed_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const INSERT_RUNNING_METRICS_SQL = `
  INSERT INTO running_metrics
    (session_id, distance_km, duration_seconds, avg_pace_seconds_per_km, perceived_effort_rpe)
  VALUES (?, ?, ?, ?, ?);
`;

const INSERT_BILLING_PROFILE_SQL = `
  INSERT INTO client_billing_profiles
    (id, full_name, email, phone, billing_name, billing_country,
     billing_zip, billing_city, billing_address, tax_number, created_at, updated_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

const INSERT_COACHING_SLOT_SQL = `
  INSERT INTO coaching_slots
    (id, starts_at, ends_at, modality, location_or_link, is_booked)
  VALUES (?, ?, ?, ?, ?, ?);
`;

const INSERT_COACHING_BOOKING_SQL = `
  INSERT INTO coaching_bookings
    (id, slot_id, user_id, modality, starts_at, ends_at, location_or_link,
     client_notes, coach_notes, status, sync_status, created_at)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?);
`;

/**
 * Restores a snapshot produced by `exportFullDatabaseSnapshot` (or the object
 * form). The covered domains are wiped and rewritten inside a single transaction,
 * so the import is all-or-nothing. Returns the row counts that were written.
 */
export async function importFullDatabaseSnapshot(
  db: SQLiteDatabase,
  jsonString: string,
): Promise<ImportSummary> {
  const snapshot = parseFullDatabaseSnapshot(jsonString);
  const { data } = snapshot;

  const summary: ImportSummary = {
    profile: data.profile !== null,
    jointConstraints: data.jointConstraints.length,
    customExercises: data.customExercises.length,
    customTemplates: data.customTemplates.length,
    sessionLogs: data.sessionLogs.length,
    sessionExerciseBlocks: data.sessionExerciseBlocks.length,
    setLogs: data.setLogs.length,
    runningMetrics: data.runningMetrics.length,
    clientBillingProfile: data.clientBillingProfile !== null,
    coachingSlots: data.coachingSlots.length,
    coachingBookings: data.coachingBookings.length,
  };

  await db.withTransactionAsync(async () => {
    // Wipe children before parents (FK order), then rewrite parents before children.
    await db.runAsync('DELETE FROM set_logs;');
    await db.runAsync('DELETE FROM running_metrics;');
    await db.runAsync('DELETE FROM session_exercise_blocks;');
    await db.runAsync('DELETE FROM session_logs;');
    await db.runAsync('DELETE FROM coaching_bookings;');
    await db.runAsync('DELETE FROM coaching_slots;');
    await db.runAsync('DELETE FROM client_billing_profiles;');
    await db.runAsync("DELETE FROM template_exercise_blocks WHERE template_id LIKE 'tpl_user%';");
    await db.runAsync("DELETE FROM workout_templates WHERE id LIKE 'tpl_user%';");
    await db.runAsync('DELETE FROM exercise_catalog WHERE is_custom = 1;');
    await db.runAsync('DELETE FROM joint_constraints;');
    await db.runAsync('DELETE FROM user_profiles;');

    const profile = data.profile;
    if (profile !== null) {
      await db.runAsync(
        INSERT_PROFILE_SQL,
        profile.id,
        profile.locale,
        profile.age,
        profile.weight_kg,
        profile.height_cm,
        profile.primary_goal,
        profile.experience_months,
        profile.strength_days_per_week,
        profile.running_days_per_week,
        profile.target_run_distance_km,
        profile.session_duration_minutes,
        profile.equipment,
        profile.excluded_exercise_ids,
        profile.preferred_substitutions,
        profile.onboarding_completed_at,
        profile.updated_at,
      );
    }

    for (const constraint of data.jointConstraints) {
      await db.runAsync(
        INSERT_JOINT_CONSTRAINT_SQL,
        constraint.id,
        constraint.user_id,
        constraint.area,
        constraint.severity,
        constraint.notes,
        constraint.created_at,
      );
    }

    for (const exercise of data.customExercises) {
      await db.runAsync(
        INSERT_CUSTOM_EXERCISE_SQL,
        exercise.id,
        exercise.name_hu,
        exercise.name_en,
        exercise.category,
        exercise.equipment,
        exercise.movement_pattern,
        exercise.primary_muscles,
        exercise.axial_load_score,
        exercise.knee_stress_score,
        exercise.default_substitute_ids,
      );
    }

    for (const template of data.customTemplates) {
      await db.runAsync(
        INSERT_TEMPLATE_SQL,
        template.id,
        template.title,
        template.session_type,
        template.goal,
        template.source ?? 'custom',
        template.coach_note ?? null,
        template.assigned_at ?? null,
        template.created_at,
      );
    }
    for (const block of data.customTemplateBlocks) {
      await db.runAsync(
        INSERT_TEMPLATE_BLOCK_SQL,
        block.id,
        block.template_id,
        block.order_index,
        block.exercise_id,
        block.substituted_from_exercise_id,
        block.rest_seconds,
        block.notes,
        block.target_sets,
        block.target_reps,
      );
    }

    for (const session of data.sessionLogs) {
      await db.runAsync(
        INSERT_SESSION_LOG_SQL,
        session.id,
        session.program_day_id,
        session.session_type,
        session.title,
        session.started_at,
        session.completed_at,
        session.sync_status,
      );
    }
    for (const block of data.sessionExerciseBlocks) {
      await db.runAsync(
        INSERT_SESSION_BLOCK_SQL,
        block.id,
        block.session_id,
        block.order_index,
        block.exercise_id,
        block.substituted_from_exercise_id,
        block.rest_seconds,
        block.notes,
        block.target_sets,
        block.target_reps,
      );
    }
    for (const set of data.setLogs) {
      await db.runAsync(
        INSERT_SET_LOG_SQL,
        set.id,
        set.block_id,
        set.set_number,
        set.set_type,
        set.target_weight_kg,
        set.actual_weight_kg,
        set.target_reps,
        set.actual_reps,
        set.rpe,
        set.completed_at,
      );
    }
    for (const metrics of data.runningMetrics) {
      await db.runAsync(
        INSERT_RUNNING_METRICS_SQL,
        metrics.session_id,
        metrics.distance_km,
        metrics.duration_seconds,
        metrics.avg_pace_seconds_per_km,
        metrics.perceived_effort_rpe,
      );
    }

    const billing = data.clientBillingProfile;
    if (billing !== null) {
      await db.runAsync(
        INSERT_BILLING_PROFILE_SQL,
        billing.id,
        billing.full_name,
        billing.email,
        billing.phone,
        billing.billing_name,
        billing.billing_country,
        billing.billing_zip,
        billing.billing_city,
        billing.billing_address,
        billing.tax_number,
        billing.created_at,
        billing.updated_at,
      );
    }

    // Slots before bookings (bookings carry a slot FK).
    for (const slot of data.coachingSlots) {
      await db.runAsync(
        INSERT_COACHING_SLOT_SQL,
        slot.id,
        slot.starts_at,
        slot.ends_at,
        slot.modality,
        slot.location_or_link,
        slot.is_booked,
      );
    }
    for (const booking of data.coachingBookings) {
      await db.runAsync(
        INSERT_COACHING_BOOKING_SQL,
        booking.id,
        booking.slot_id,
        booking.user_id,
        booking.modality,
        booking.starts_at,
        booking.ends_at,
        booking.location_or_link,
        booking.client_notes,
        booking.coach_notes,
        booking.status,
        booking.sync_status,
        booking.created_at,
      );
    }
  });

  return summary;
}
