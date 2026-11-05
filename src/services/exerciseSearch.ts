// Pure, dependency-free exercise search + filter helpers.
//
// Kept out of the components so the same accent-insensitive matching the picker
// uses can be exercised headlessly by the offline verify harness.

import type { Equipment, ExerciseCatalogItem } from '../types/workout';

/**
 * The dedicated muscle-group filter chips. Every major group is its own bucket
 * (no bundling), so compound lifts surface under each group they actually train.
 */
export type MuscleGroup =
  | 'quads'
  | 'hamstrings'
  | 'glutes'
  | 'adductors'
  | 'calves'
  | 'chest'
  | 'back'
  | 'shoulders'
  | 'traps'
  | 'biceps'
  | 'triceps'
  | 'forearms'
  | 'core'
  | 'cardio';

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

/**
 * Raw muscle tokens (as written in catalog `primaryMuscles`) that belong to each
 * filter chip. Tokens are ungated across chips where anatomically sensible (e.g.
 * a shrug trains both `upper_back` and `trapezius`), and an exercise matches a
 * chip if ANY of its `primaryMuscles` is a member — so a lift like the Romanian
 * deadlift (`hamstrings`, `glutes`, `lower_back`) appears under both Hamstrings
 * and Glutes rather than being hidden in a single bundle.
 */
const MUSCLE_GROUP_MEMBERS: Record<MuscleGroup, readonly string[]> = {
  quads: ['quadriceps'],
  hamstrings: ['hamstrings'],
  glutes: ['glutes'],
  adductors: ['adductors', 'abductors'],
  calves: ['calves', 'tibialis'],
  chest: ['chest'],
  back: ['back', 'lats', 'upper_back', 'lower_back'],
  shoulders: ['shoulders', 'front_delts', 'rear_delts'],
  traps: ['trapezius'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearms'],
  core: ['core'],
  cardio: ['cardiovascular'],
};

/** The ordered filter chips the picker renders (cardio last). */
export const MUSCLE_GROUPS: readonly MuscleGroup[] = [
  'quads',
  'hamstrings',
  'glutes',
  'adductors',
  'calves',
  'chest',
  'back',
  'shoulders',
  'traps',
  'biceps',
  'triceps',
  'forearms',
  'core',
  'cardio',
];

/**
 * True when `item` belongs to `group`. Cardio matches by run category/pattern;
 * every other group matches when ANY primary muscle is a member of that group.
 */
export function matchesMuscleGroup(item: ExerciseCatalogItem, group: MuscleGroup): boolean {
  if (group === 'cardio') {
    return item.category === 'cardio_run' || item.movementPattern === 'cardio';
  }
  const members = MUSCLE_GROUP_MEMBERS[group];
  return item.primaryMuscles.some((muscle) => members.includes(muscle));
}

/** Every filter group an exercise belongs to (compound lifts match several). */
export function deriveMuscleGroups(item: ExerciseCatalogItem): MuscleGroup[] {
  return MUSCLE_GROUPS.filter((group) => matchesMuscleGroup(item, group));
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
    if (muscleGroup !== null && !matchesMuscleGroup(item, muscleGroup)) {
      return false;
    }
    if (equipment !== null && !equipmentMatchesFilter(item, equipment)) {
      return false;
    }
    return true;
  });
}
