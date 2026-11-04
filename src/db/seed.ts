// Seed data: core exercise catalog.
//
// The catalog is the vocabulary every program is built from, so it is seeded
// idempotently with an upsert keyed on the exercise id: adding a new exercise or
// correcting a score (e.g. front_squat) propagates to existing databases on the
// next app start, while an unchanged row is left untouched (0 changes).

import type { SQLiteDatabase } from 'expo-sqlite';
import type { ExerciseCatalogItem } from '../types/workout';

/**
 * 36 exercises across every movement pattern the generator draws from.
 * `axialLoadScore` and `kneeStressScore` are 1-5 joint-load ratings: higher
 * means more stress. `defaultSubstituteIds` are the joint-friendliest stand-ins
 * for the lift, tried first when a constraint forces a swap.
 */
export const CORE_EXERCISE_CATALOG: readonly ExerciseCatalogItem[] = [
  // --- Lower body: compound & machine -------------------------------------
  {
    id: 'front_squat',
    nameHu: 'Elölguggolás',
    nameEn: 'Front Squat',
    category: 'compound_lower',
    primaryMuscles: ['quadriceps', 'glutes', 'core'],
    axialLoadScore: 3,
    // 3 (not 5): with knee sleeves the front squat stays in the plan under
    // avoid_heavy_axial_load and is only reconsidered under strict_exclude.
    kneeStressScore: 3,
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
    id: 'bulgarian_split_squat',
    nameHu: 'Bolgár guggolás',
    nameEn: 'Bulgarian Split Squat',
    category: 'compound_lower',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 2,
    kneeStressScore: 4,
    defaultSubstituteIds: ['leg_press'],
  },
  {
    id: 'leg_press',
    nameHu: 'Lábnyomás',
    nameEn: 'Leg Press',
    category: 'machine',
    primaryMuscles: ['quadriceps', 'glutes'],
    axialLoadScore: 1,
    kneeStressScore: 3,
    defaultSubstituteIds: ['belt_squat'],
  },
  {
    id: 'hip_thrust',
    nameHu: 'Csípőemelés',
    nameEn: 'Hip Thrust',
    category: 'machine',
    primaryMuscles: ['glutes', 'hamstrings'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'good_morning',
    nameHu: 'Jó reggelt gyakorlat',
    nameEn: 'Good Morning',
    category: 'compound_lower',
    primaryMuscles: ['hamstrings', 'glutes', 'lower_back'],
    axialLoadScore: 4,
    kneeStressScore: 2,
    defaultSubstituteIds: ['romanian_deadlift'],
  },

  // --- Lower body: isolation ----------------------------------------------
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
    id: 'seated_leg_curl',
    nameHu: 'Ülő combhajlító gép',
    nameEn: 'Seated Leg Curl',
    category: 'isolation',
    primaryMuscles: ['hamstrings'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'lying_leg_curl',
    nameHu: 'Fekvő combhajlító gép',
    nameEn: 'Lying Leg Curl',
    category: 'isolation',
    primaryMuscles: ['hamstrings'],
    axialLoadScore: 1,
    kneeStressScore: 1,
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
  {
    id: 'standing_calf_raise',
    nameHu: 'Álló vádligép',
    nameEn: 'Standing Calf Raise',
    category: 'isolation',
    primaryMuscles: ['calves'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'seated_calf_raise',
    nameHu: 'Ülő vádligép',
    nameEn: 'Seated Calf Raise',
    category: 'isolation',
    primaryMuscles: ['calves'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },

  // --- Upper body: horizontal push / pull ---------------------------------
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
    id: 'incline_dumbbell_press',
    nameHu: 'Ferde kézisúlyos nyomás',
    nameEn: 'Incline Dumbbell Press',
    category: 'compound_upper',
    primaryMuscles: ['chest', 'front_delts', 'triceps'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'dips',
    nameHu: 'Tolódzkodás',
    nameEn: 'Dips',
    category: 'compound_upper',
    primaryMuscles: ['chest', 'triceps', 'front_delts'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'cable_fly',
    nameHu: 'Kábeles melltárítás',
    nameEn: 'Cable Fly',
    category: 'isolation',
    primaryMuscles: ['chest'],
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
    defaultSubstituteIds: ['chest_supported_row'],
  },
  {
    id: 'chest_supported_row',
    nameHu: 'Támaszos gépi evezés',
    nameEn: 'Chest Supported Row',
    category: 'machine',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'seated_cable_row',
    nameHu: 'Ülő kábeles evezés',
    nameEn: 'Seated Cable Row',
    category: 'compound_upper',
    primaryMuscles: ['back', 'biceps'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },

  // --- Upper body: vertical push / pull & arms ----------------------------
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
    id: 'lateral_raise',
    nameHu: 'Oldalemelés',
    nameEn: 'Lateral Raise',
    category: 'isolation',
    primaryMuscles: ['shoulders'],
    axialLoadScore: 1,
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
    defaultSubstituteIds: ['lat_pulldown'],
  },
  {
    id: 'lat_pulldown',
    nameHu: 'Lehúzás',
    nameEn: 'Lat Pulldown',
    category: 'compound_upper',
    primaryMuscles: ['lats', 'biceps'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'face_pull',
    nameHu: 'Arcmellé húzás',
    nameEn: 'Face Pull',
    category: 'isolation',
    primaryMuscles: ['rear_delts', 'upper_back'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'barbell_curl',
    nameHu: 'Rúddal végzett bicepsz',
    nameEn: 'Barbell Curl',
    category: 'isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: ['incline_dumbbell_curl'],
  },
  {
    id: 'incline_dumbbell_curl',
    nameHu: 'Ferde padon kézisúlyos bicepsz',
    nameEn: 'Incline Dumbbell Curl',
    category: 'isolation',
    primaryMuscles: ['biceps'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'triceps_pushdown',
    nameHu: 'Kábeles tricepsz letolás',
    nameEn: 'Triceps Pushdown',
    category: 'isolation',
    primaryMuscles: ['triceps'],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
  },
  {
    id: 'overhead_triceps_extension',
    nameHu: 'Fej fölötti tricepsznyújtás',
    nameEn: 'Overhead Triceps Extension',
    category: 'isolation',
    primaryMuscles: ['triceps'],
    axialLoadScore: 1,
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
  {
    id: 'run_easy_5k',
    nameHu: 'Könnyű alapozó futás',
    nameEn: 'Easy Run',
    category: 'cardio_run',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1,
    kneeStressScore: 3,
    defaultSubstituteIds: [],
  },
  {
    id: 'run_tempo_5k',
    nameHu: 'Tempó futás',
    nameEn: 'Tempo Run',
    category: 'cardio_run',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1,
    kneeStressScore: 3,
    defaultSubstituteIds: [],
  },
  {
    id: 'run_long_7k',
    nameHu: 'Hosszabb futás',
    nameEn: 'Long Run',
    category: 'cardio_run',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1,
    kneeStressScore: 3,
    defaultSubstituteIds: [],
  },
  {
    id: 'run_intervals',
    nameHu: 'Intervallum futás',
    nameEn: 'Interval Run',
    category: 'cardio_run',
    primaryMuscles: ['cardiovascular', 'legs'],
    axialLoadScore: 1,
    kneeStressScore: 3,
    defaultSubstituteIds: [],
  },
];

/**
 * Upsert with a change-detection guard: an identical row is left untouched so
 * the returned count stays 0 on a no-op re-seed, while a changed score or a new
 * exercise is written immediately.
 */
const UPSERT_EXERCISE_SQL = `
  INSERT INTO exercise_catalog
    (id, name_hu, name_en, category, primary_muscles,
     axial_load_score, knee_stress_score, default_substitute_ids)
  VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(id) DO UPDATE SET
    name_hu = excluded.name_hu,
    name_en = excluded.name_en,
    category = excluded.category,
    primary_muscles = excluded.primary_muscles,
    axial_load_score = excluded.axial_load_score,
    knee_stress_score = excluded.knee_stress_score,
    default_substitute_ids = excluded.default_substitute_ids
  WHERE
    exercise_catalog.name_hu IS NOT excluded.name_hu OR
    exercise_catalog.name_en IS NOT excluded.name_en OR
    exercise_catalog.category IS NOT excluded.category OR
    exercise_catalog.primary_muscles IS NOT excluded.primary_muscles OR
    exercise_catalog.axial_load_score IS NOT excluded.axial_load_score OR
    exercise_catalog.knee_stress_score IS NOT excluded.knee_stress_score OR
    exercise_catalog.default_substitute_ids IS NOT excluded.default_substitute_ids;
`;

/**
 * Seeds (or refreshes) the exercise catalog. Idempotent: safe to call on every
 * app start. Returns the number of rows inserted or updated (0 when the catalog
 * already matches the seed exactly).
 */
export async function seedExerciseCatalog(db: SQLiteDatabase): Promise<number> {
  let changed = 0;
  await db.withTransactionAsync(async () => {
    for (const item of CORE_EXERCISE_CATALOG) {
      const result = await db.runAsync(
        UPSERT_EXERCISE_SQL,
        item.id,
        item.nameHu,
        item.nameEn,
        item.category,
        JSON.stringify(item.primaryMuscles),
        item.axialLoadScore,
        item.kneeStressScore,
        JSON.stringify(item.defaultSubstituteIds),
      );
      changed += result.changes;
    }
  });
  return changed;
}
