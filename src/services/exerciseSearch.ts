// Pure, dependency-free exercise search + filter helpers.
//
// Kept out of the components so the same accent-insensitive matching the picker
// uses can be exercised headlessly by the offline verify harness.

import type { Equipment, ExerciseCatalogItem } from '../types/workout';

/** The muscle-group buckets the picker's filter chips map to. */
export type MuscleGroup =
  | 'legs_front'
  | 'legs_posterior'
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'arms'
  | 'calf_core'
  | 'cardio'
  | 'other';

/** A single equipment chip can cover several raw `Equipment` values. */
export type EquipmentFilter = 'barbell' | 'dumbbell' | 'machine' | 'cable' | 'bodyweight';

const EQUIPMENT_FILTER_MEMBERS: Record<EquipmentFilter, readonly Equipment[]> = {
  barbell: ['barbell', 'specialty_bar'],
  dumbbell: ['dumbbell', 'kettlebell'],
  machine: ['machine'],
  cable: ['cable'],
  bodyweight: ['bodyweight'],
};

/**
 * Case- and accent-insensitive normalization: NFD splits "guggolás" into
 * "guggola" + combining acute, and stripping the U+0300-U+036F diacritic block
 * (which covers Hungarian á/é/í/ó/ö/ő/ú/ü/ű) leaves a plain ASCII form.
 */
export function normalizeSearchText(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

/** True when `query` appears in either the Hungarian or English name. */
export function exerciseMatchesQuery(item: ExerciseCatalogItem, query: string): boolean {
  const needle = normalizeSearchText(query);
  if (needle.length === 0) {
    return true;
  }
  return (
    normalizeSearchText(item.nameHu).includes(needle) ||
    normalizeSearchText(item.nameEn).includes(needle)
  );
}

const MUSCLE_GROUP_PRECEDENCE: readonly { group: MuscleGroup; muscles: readonly string[] }[] = [
  { group: 'legs_front', muscles: ['quadriceps'] },
  { group: 'legs_posterior', muscles: ['hamstrings', 'glutes', 'adductors', 'abductors'] },
  { group: 'chest', muscles: ['chest'] },
  { group: 'shoulders', muscles: ['shoulders', 'front_delts', 'rear_delts'] },
  { group: 'back', muscles: ['back', 'lats', 'upper_back', 'trapezius'] },
  { group: 'arms', muscles: ['biceps', 'triceps', 'forearms'] },
  { group: 'calf_core', muscles: ['calves', 'core', 'tibialis'] },
];

/** Maps an exercise to its single best muscle-group bucket. */
export function deriveMuscleGroup(item: ExerciseCatalogItem): MuscleGroup {
  if (item.category === 'cardio_run') {
    return 'cardio';
  }
  const muscles = new Set(item.primaryMuscles);
  for (const rule of MUSCLE_GROUP_PRECEDENCE) {
    if (rule.muscles.some((muscle) => muscles.has(muscle))) {
      return rule.group;
    }
  }
  return 'other';
}

export function equipmentMatchesFilter(
  item: ExerciseCatalogItem,
  filter: EquipmentFilter,
): boolean {
  return EQUIPMENT_FILTER_MEMBERS[filter].includes(item.equipment);
}

export interface ExerciseFilterState {
  query?: string;
  muscleGroup?: MuscleGroup | null;
  equipment?: EquipmentFilter | null;
}

/**
 * Applies the picker's search + filter state. Empty/absent filters are no-ops,
 * so the same function drives the "all exercises" default view.
 */
export function filterExercises(
  catalog: readonly ExerciseCatalogItem[],
  state: ExerciseFilterState = {},
): ExerciseCatalogItem[] {
  const { query = '', muscleGroup = null, equipment = null } = state;
  return catalog.filter((item) => {
    if (!exerciseMatchesQuery(item, query)) {
      return false;
    }
    if (muscleGroup !== null && deriveMuscleGroup(item) !== muscleGroup) {
      return false;
    }
    if (equipment !== null && !equipmentMatchesFilter(item, equipment)) {
      return false;
    }
    return true;
  });
}
