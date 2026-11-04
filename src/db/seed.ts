// Seed data: core exercise catalog.
// Idempotent — uses INSERT OR IGNORE keyed on the exercise id, so re-running
// never duplicates or overwrites user edits.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { ExerciseCatalogItem } from '../types/workout';

export const CORE_EXERCISE_CATALOG: readonly ExerciseCatalogItem[] = [
  // --- Lower body ---------------------------------------------------------
  {
    id: 'front_squat',
    nameHu: 'Elölguggolás',
    nameEn: 'Front Squat',
    category: 'compound_lower',
    primaryMuscles: ['quadriceps', 'glutes', 'core'],
    axialLoadScore: 3,
    kneeStressScore: 4,
    defaultSubstituteIds: ['belt_squat'],
  },
  {
    id: 'romanian_deadlift',
    nameHu: 'Román felhúzás',
    nameEn: 'Romanian Deadlift',
    category: 'compound_lower',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    axialLoadScore: 4,
    kneeStressScore: 2,
    defaultSubstituteIds: [],
  },
  {
    id: 'belt_squat',
    nameHu: 'Öves guggolás',
    nameEn: 'Belt Squat',
    category: 'compound_lower',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 1,
    kneeStressScore: 2,
    defaultSubstituteIds: [],
  },
  {
    id: 'hack_squat',
    nameHu: 'Hack guggolás',
    nameEn: 'Hack Squat',
    category: 'machine',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 2,
    kneeStressScore: 5,
    defaultSubstituteIds: ['belt_squat'],
  },
  {
    id: 'leg_extension',
    nameHu: 'Combfeszítő gép',
    nameEn: 'Leg Extension',
    category: 'isolation',
    primaryMuscles: ['quadriceps'],
    axialLoadScore: 1,
    kneeStressScore: 4,
    defaultSubstituteIds: [],
  },
  {
    id: 'adductor_machine',
    nameHu: 'Combközelítő gép',
    nameEn: 'Adductor Machine',
    category: 'machine',
    primaryMuscles: ['adductors'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },

  // --- Upper body ---------------------------------------------------------
  {
    id: 'bench_press',
    nameHu: 'Fekvenyomás',
    nameEn: 'Bench Press',
    category: 'compound_upper',
    primaryMuscles: ['chest', 'triceps', 'front_delts'],
    axialLoadScore: 2,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'overhead_press',
    nameHu: 'Mellről nyomás',
    nameEn: 'Overhead Press',
    category: 'compound_upper',
    primaryMuscles: ['shoulders', 'triceps'],
    axialLoadScore: 3,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'weighted_pullup',
    nameHu: 'Húzódzkodás',
    nameEn: 'Weighted Pull-up',
    category: 'compound_upper',
    primaryMuscles: ['lats', 'biceps'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'barbell_row',
    nameHu: 'Döntött törzsű evezés',
    nameEn: 'Barbell Row',
    category: 'compound_upper',
    primaryMuscles: ['back', 'biceps', 'lower_back'],
    axialLoadScore: 3,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },

  // --- Cardio / running ---------------------------------------------------
  {
    id: 'run_5k',
    nameHu: '5 km futás',
    nameEn: '5K Run',
    category: 'cardio_run',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1,
    kneeStressScore: 3,
    defaultSubstituteIds: [],
  },
  {
    id: 'run_7k',
    nameHu: '7 km futás',
    nameEn: '7K Run',
    category: 'cardio_run',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1,
    kneeStressScore: 3,
    defaultSubstituteIds: [],
  },
];

const INSERT_EXERCISE_SQL = `
  INSERT OR IGNORE INTO exercise_catalog
    (id, name_hu, name_en, category, primary_muscles,
     axial_load_score, knee_stress_score, default_substitute_ids)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?);
`;

/**
 * Seeds the exercise catalog. Idempotent: safe to call on every app start.
 * Returns the number of rows inserted (0 when the catalog is already present).
 */
export async function seedExerciseCatalog(db: SQLiteDatabase): Promise<number> {
  let inserted = 0;
  await db.withTransactionAsync(async () => {
    for (const item of CORE_EXERCISE_CATALOG) {
      const result = await db.runAsync(
        INSERT_EXERCISE_SQL,
        item.id,
        item.nameHu,
        item.nameEn,
        item.category,
        JSON.stringify(item.primaryMuscles),
        item.axialLoadScore,
        item.kneeStressScore,
        JSON.stringify(item.defaultSubstituteIds),
      );
      inserted += result.changes;
    }
  });
  return inserted;
}
