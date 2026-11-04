// Seed data: core exercise catalog.
//
// The catalog itself lives in ./catalogData.ts; this module owns the idempotent
// upsert. It is keyed on the exercise id, so adding a new exercise or correcting
// a score (e.g. front_squat) propagates to existing databases on the next app
// start, while an unchanged row is left untouched (0 changes).

import type { SQLiteDatabase } from 'expo-sqlite';
import { EXERCISE_CATALOG } from './catalogData';

// Re-exported so callers (and the offline verify harness) can reference the
// catalog without importing the data module directly.
export { EXERCISE_CATALOG, EXERCISE_CATALOG as CORE_EXERCISE_CATALOG } from './catalogData';

/**
 * Upsert with a change-detection guard: an identical row is left untouched so
 * the returned count stays 0 on a no-op re-seed, while a changed score or a new
 * exercise is written immediately.
 */
const UPSERT_EXERCISE_SQL = `
  INSERT INTO exercise_catalog
    (id, name_hu, name_en, category, equipment, movement_pattern, primary_muscles,
     axial_load_score, knee_stress_score, default_substitute_ids, is_custom)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name_hu = excluded.name_hu,
    name_en = excluded.name_en,
    category = excluded.category,
    equipment = excluded.equipment,
    movement_pattern = excluded.movement_pattern,
    primary_muscles = excluded.primary_muscles,
    axial_load_score = excluded.axial_load_score,
    knee_stress_score = excluded.knee_stress_score,
    default_substitute_ids = excluded.default_substitute_ids
  WHERE
    exercise_catalog.name_hu IS NOT excluded.name_hu OR
    exercise_catalog.name_en IS NOT excluded.name_en OR
    exercise_catalog.category IS NOT excluded.category OR
    exercise_catalog.equipment IS NOT excluded.equipment OR
    exercise_catalog.movement_pattern IS NOT excluded.movement_pattern OR
    exercise_catalog.primary_muscles IS NOT excluded.primary_muscles OR
    exercise_catalog.axial_load_score IS NOT excluded.axial_load_score OR
    exercise_catalog.knee_stress_score IS NOT excluded.knee_stress_score OR
    exercise_catalog.default_substitute_ids IS NOT excluded.default_substitute_ids;
`;

/**
 * Seeds (or refreshes) the exercise catalog. Idempotent: safe to call on every
 * app start. Returns the number of rows inserted or updated (0 when the catalog
 * already matches the seed exactly).
 *
 * Only shipped rows are written here. User-created exercises use a `cust_` id
 * prefix, so they can never collide with a seeded id and survive re-seeding.
 */
export async function seedExerciseCatalog(db: SQLiteDatabase): Promise<number> {
  let changed = 0;
  await db.withTransactionAsync(async () => {
    for (const item of EXERCISE_CATALOG) {
      const result = await db.runAsync(
        UPSERT_EXERCISE_SQL,
        item.id,
        item.nameHu,
        item.nameEn,
        item.category,
        item.equipment,
        item.movementPattern,
        JSON.stringify(item.primaryMuscles),
        item.axialLoadScore,
        item.kneeStressScore,
        JSON.stringify(item.defaultSubstituteIds),
        0,
      );
      changed += result.changes;
    }
  });
  return changed;
}
