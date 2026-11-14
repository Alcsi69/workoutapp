// Phase 4 — personalized routine generation + coach sync payloads.
//
// Two responsibilities, both driven purely by the persisted OnboardingPayload:
//
//   1. generateProgramFromProfile(db) builds a complete, realistic program:
//      it picks a weekly split from strengthDaysPerWeek, sizes each session from
//      sessionDurationMinutes, prescribes loads from primaryGoal, then runs the
//      joint/substitution engine so hip/knee/back-hostile lifts are swapped for
//      the user's preferred or joint-friendliest alternatives.
//   2. buildClientSyncPullPayload(db) serializes the request body a client sends
//      to the coach backend ("what has my coach assigned me?"), matching
//      /docs/SAMPLE_PAYLOADS.json.
//
// No React, no fetch: this module only reads/writes through the repository.

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  ClientSyncPullPayload,
  ExerciseCatalogItem,
  JointArea,
  JointConstraint,
  JointConstraintSeverity,
  LoadScore,
  OnboardingPayload,
  TrainingGoal,
  UserProfile,
  WorkoutTemplate,
} from '../types/workout';
import type { TemplateProgramSeed } from '../db/repository';
import {
  DEFAULT_TEMPLATE_IDS,
  deleteTemplatesByIds,
  getClientBillingProfile,
  getExerciseCatalog,
  getUserProfile,
  getWorkoutTemplates,
  replaceTemplateProgram,
  setTemplateBlockNotes,
  substituteTemplateBlockExercise,
} from '../db/repository';

// --- Template identity ------------------------------------------------------
//
// The generator owns a fixed set of template ids. Templates with these ids are
// (re)built from the profile; anything else (user-created `tpl_user_*`) is left
// in place but still swept by the constraint engine. The canonical id list lives
// in the repository so the startup cleanup and the generator can never diverge.

const MANAGED_TEMPLATE_IDS: readonly string[] = DEFAULT_TEMPLATE_IDS;

const MAX_STRENGTH_DAYS = 6;
const MIN_LONG_RUN_KM = 5;
const DEFAULT_RUN_DISTANCE_KM = 5;

// --- Session sizing & prescription ------------------------------------------

type ExerciseRole = 'primary' | 'secondary' | 'accessory';

interface BlockSpec {
  exerciseId: string;
  role: ExerciseRole;
}

/**
 * Exercises per session, scaled to the time budget:
 * <=45m -> 4, 46-75m -> 5, 76-105m -> 6, >105m -> 7.
 */
function exercisesPerSession(sessionDurationMinutes: number): number {
  if (!Number.isFinite(sessionDurationMinutes) || sessionDurationMinutes <= 45) {
    return 4;
  }
  if (sessionDurationMinutes <= 75) {
    return 5;
  }
  if (sessionDurationMinutes <= 105) {
    return 6;
  }
  return 7;
}

interface Prescription {
  targetSets: number;
  targetReps: string;
  restSeconds: number;
}

const POWERBUILDING_PRIMARY_NOTE = 'Csúcssorozat, utána 2 backoff sorozat 8 ismétléssel.';

/** Goal-driven sets/reps/rest for a lift's role in the session. */
function prescribe(role: ExerciseRole, goal: TrainingGoal): Prescription {
  if (role === 'primary') {
    if (goal === 'strength') {
      return { targetSets: 5, targetReps: '3-5', restSeconds: 180 };
    }
    if (goal === 'hypertrophy') {
      return { targetSets: 4, targetReps: '6-8', restSeconds: 150 };
    }
    // powerbuilding / hybrid: heavy top set + backoff sets
    return { targetSets: 4, targetReps: '5', restSeconds: 180 };
  }
  if (role === 'secondary') {
    if (goal === 'strength') {
      return { targetSets: 4, targetReps: '5-6', restSeconds: 150 };
    }
    if (goal === 'hypertrophy') {
      return { targetSets: 4, targetReps: '8-12', restSeconds: 90 };
    }
    return { targetSets: 3, targetReps: '6-8', restSeconds: 150 };
  }
  // accessory
  if (goal === 'strength') {
    return { targetSets: 3, targetReps: '8-10', restSeconds: 90 };
  }
  if (goal === 'hypertrophy') {
    return { targetSets: 3, targetReps: '10-15', restSeconds: 60 };
  }
  return { targetSets: 3, targetReps: '10-12', restSeconds: 75 };
}

// --- Dynamic split builder --------------------------------------------------

type TemplateKind = 'upper_a' | 'upper_b' | 'lower_a' | 'lower_b' | 'full_a' | 'full_b';

interface StrengthDay {
  id: string;
  title: string;
  plan: readonly BlockSpec[];
}

/**
 * Lower A centres on Elölguggolás + Öves guggolás + Combfeszítő gép + Hajlító +
 * Vádli (the extra accessories are only used on longer sessions).
 */
const LOWER_A_PLAN: readonly BlockSpec[] = [
  { exerciseId: 'front_squat', role: 'primary' },
  { exerciseId: 'belt_squat', role: 'secondary' },
  { exerciseId: 'leg_extension', role: 'accessory' },
  { exerciseId: 'seated_leg_curl', role: 'accessory' },
  { exerciseId: 'standing_calf_raise', role: 'accessory' },
  { exerciseId: 'hip_thrust', role: 'accessory' },
  { exerciseId: 'adductor_machine', role: 'accessory' },
];

/** Lower B leads with Román felhúzás, then Öves guggolás, Combközelítő, Combfeszítő, Ülő vádli. */
const LOWER_B_PLAN: readonly BlockSpec[] = [
  { exerciseId: 'romanian_deadlift', role: 'primary' },
  { exerciseId: 'belt_squat', role: 'secondary' },
  { exerciseId: 'adductor_machine', role: 'accessory' },
  { exerciseId: 'leg_extension', role: 'accessory' },
  { exerciseId: 'seated_calf_raise', role: 'accessory' },
  { exerciseId: 'hip_thrust', role: 'accessory' },
  { exerciseId: 'lying_leg_curl', role: 'accessory' },
];

const UPPER_A_PLAN: readonly BlockSpec[] = [
  { exerciseId: 'bench_press', role: 'primary' },
  { exerciseId: 'incline_dumbbell_press', role: 'secondary' },
  { exerciseId: 'barbell_row', role: 'secondary' },
  { exerciseId: 'seated_cable_row', role: 'accessory' },
  { exerciseId: 'lateral_raise', role: 'accessory' },
  { exerciseId: 'overhead_triceps_extension', role: 'accessory' },
  { exerciseId: 'face_pull', role: 'accessory' },
];

const UPPER_B_PLAN: readonly BlockSpec[] = [
  { exerciseId: 'overhead_press', role: 'primary' },
  { exerciseId: 'weighted_pullup', role: 'secondary' },
  { exerciseId: 'bench_press', role: 'secondary' },
  { exerciseId: 'chest_supported_row', role: 'accessory' },
  { exerciseId: 'lateral_raise', role: 'accessory' },
  { exerciseId: 'barbell_curl', role: 'accessory' },
  { exerciseId: 'triceps_pushdown', role: 'accessory' },
];

const FULL_A_PLAN: readonly BlockSpec[] = [
  { exerciseId: 'front_squat', role: 'primary' },
  { exerciseId: 'bench_press', role: 'secondary' },
  { exerciseId: 'barbell_row', role: 'secondary' },
  { exerciseId: 'leg_extension', role: 'accessory' },
  { exerciseId: 'seated_leg_curl', role: 'accessory' },
  { exerciseId: 'lateral_raise', role: 'accessory' },
  { exerciseId: 'standing_calf_raise', role: 'accessory' },
];

const FULL_B_PLAN: readonly BlockSpec[] = [
  { exerciseId: 'romanian_deadlift', role: 'primary' },
  { exerciseId: 'overhead_press', role: 'secondary' },
  { exerciseId: 'weighted_pullup', role: 'secondary' },
  { exerciseId: 'belt_squat', role: 'secondary' },
  { exerciseId: 'adductor_machine', role: 'accessory' },
  { exerciseId: 'standing_calf_raise', role: 'accessory' },
  { exerciseId: 'barbell_curl', role: 'accessory' },
];

const STRENGTH_DAYS: Record<TemplateKind, StrengthDay> = {
  upper_a: { id: 'tpl_upper_a', title: 'Upper A', plan: UPPER_A_PLAN },
  lower_a: { id: 'tpl_lower_a', title: 'Lower A - Elölguggolás', plan: LOWER_A_PLAN },
  upper_b: { id: 'tpl_upper_b', title: 'Upper B', plan: UPPER_B_PLAN },
  lower_b: { id: 'tpl_lower_b', title: 'Lower B - Román felhúzás', plan: LOWER_B_PLAN },
  full_a: { id: 'tpl_full_a', title: 'Teljes test A', plan: FULL_A_PLAN },
  full_b: { id: 'tpl_full_b', title: 'Teljes test B', plan: FULL_B_PLAN },
};

/**
 * Weekly split by strength days: 1-2 full body, 3 Upper/Lower/Full, 4 Upper/Lower
 * twice, and beyond 4 extra full-body days fill the week (capped at the number of
 * distinct templates the generator owns).
 */
function buildStrengthSplit(strengthDaysPerWeek: number): StrengthDay[] {
  const days = Number.isFinite(strengthDaysPerWeek)
    ? Math.max(0, Math.min(MAX_STRENGTH_DAYS, Math.round(strengthDaysPerWeek)))
    : 0;

  if (days === 0) {
    return [];
  }
  if (days === 1) {
    return [STRENGTH_DAYS.full_a];
  }
  if (days === 2) {
    return [STRENGTH_DAYS.full_a, STRENGTH_DAYS.full_b];
  }
  if (days === 3) {
    return [STRENGTH_DAYS.upper_a, STRENGTH_DAYS.lower_a, STRENGTH_DAYS.full_b];
  }

  const base = [
    STRENGTH_DAYS.upper_a,
    STRENGTH_DAYS.lower_a,
    STRENGTH_DAYS.upper_b,
    STRENGTH_DAYS.lower_b,
  ];
  const fillers = [STRENGTH_DAYS.full_a, STRENGTH_DAYS.full_b];
  let fillerIndex = 0;
  while (base.length < days) {
    base.push(fillers[fillerIndex % fillers.length]);
    fillerIndex += 1;
  }
  return base;
}

interface RunningDay {
  id: string;
  title: string;
  exerciseId: string;
  distanceKm: number;
  notes: string;
}

type RunningPattern = 'easy' | 'tempo' | 'long' | 'intervals';

const RUNNING_PATTERNS: readonly RunningPattern[] = ['easy', 'tempo', 'long', 'intervals'];

/**
 * One running template per running day, cycling easy -> tempo -> long ->
 * intervals. The long run scales between 5 km and the user's target distance.
 */
function buildRunningDays(runningDaysPerWeek: number, targetRunDistanceKm: number): RunningDay[] {
  const days = Number.isFinite(runningDaysPerWeek)
    ? Math.max(0, Math.min(7, Math.round(runningDaysPerWeek)))
    : 0;
  const longKm = Math.max(MIN_LONG_RUN_KM, targetRunDistanceKm);
  const days_: RunningDay[] = [];

  for (let index = 0; index < days; index += 1) {
    const id = `tpl_run_${index + 1}`;
    const pattern = RUNNING_PATTERNS[index % RUNNING_PATTERNS.length];
    // A repeated pattern gets a day suffix so no two rows share a title.
    const suffix = index >= RUNNING_PATTERNS.length ? ` · ${index + 1}. nap` : '';
    if (pattern === 'easy') {
      days_.push({
        id,
        title: `Könnyű alapozó futás (5 km)${suffix}`,
        exerciseId: 'run_easy_5k',
        distanceKm: MIN_LONG_RUN_KM,
        notes: 'Beszélgetős tempó, alacsony intenzitás — az alapozás gerince.',
      });
    } else if (pattern === 'tempo') {
      days_.push({
        id,
        title: `Tempó futás (5 km)${suffix}`,
        exerciseId: 'run_tempo_5k',
        distanceKm: MIN_LONG_RUN_KM,
        notes: '1 km bemelegítés + 3 km küszöbtempó + 1 km levezetés.',
      });
    } else if (pattern === 'long') {
      days_.push({
        id,
        title: `Hosszabb futás (${longKm} km)${suffix}`,
        exerciseId: 'run_long_7k',
        distanceKm: longKm,
        notes: 'Hosszú, egyenletes futás, kontrollált tempóban.',
      });
    } else {
      days_.push({
        id,
        title: `Intervallum futás${suffix}`,
        exerciseId: 'run_intervals',
        distanceKm: MIN_LONG_RUN_KM,
        notes: 'Rövid gyors szakaszok aktív pihenőkkel.',
      });
    }
  }
  return days_;
}

/** Builds the persisted template seed for one strength day. */
function buildStrengthSeed(
  day: StrengthDay,
  goal: TrainingGoal,
  exerciseCount: number,
): TemplateProgramSeed {
  const selected = day.plan.slice(0, Math.max(1, Math.min(exerciseCount, day.plan.length)));
  return {
    id: day.id,
    title: day.title,
    sessionType: 'strength',
    goal,
    blocks: selected.map((slot) => {
      const prescription = prescribe(slot.role, goal);
      const block: TemplateProgramSeed['blocks'][number] = {
        exerciseId: slot.exerciseId,
        targetSets: prescription.targetSets,
        targetReps: prescription.targetReps,
        restSeconds: prescription.restSeconds,
      };
      if (
        slot.role === 'primary' &&
        (goal === 'powerbuilding' || goal === 'hybrid_strength_running')
      ) {
        block.notes = POWERBUILDING_PRIMARY_NOTE;
      }
      return block;
    }),
  };
}

/** Builds the persisted one-block seed for a running day. */
function buildRunningSeed(day: RunningDay): TemplateProgramSeed {
  return {
    id: day.id,
    title: day.title,
    sessionType: 'running',
    goal: 'hybrid_strength_running',
    blocks: [
      {
        exerciseId: day.exerciseId,
        targetSets: 1,
        targetReps: `${day.distanceKm} km`,
        restSeconds: 0,
        notes: day.notes,
      },
    ],
  };
}

// --- Joint & substitution engine --------------------------------------------

interface JointRule {
  /** 1-5 load this joint receives from the exercise. */
  stress: (item: ExerciseCatalogItem) => LoadScore;
  /** Swap when stress >= this under avoid_heavy_axial_load. */
  avoidThreshold: number;
  /** Swap when stress >= this under strict_exclude. */
  strictThreshold: number;
  /** Highest stress an acceptable replacement may carry under strict_exclude. */
  strictSafeMax: number;
  /** Lifts preserved regardless (e.g. sleeve-friendly variants). */
  preserve: readonly string[];
  /** Joint-friendliest substitutes, best first. */
  safeSubstituteIds: readonly string[];
}

const SHOULDER_STRESS: Readonly<Record<string, LoadScore>> = {
  overhead_press: 5,
  dips: 4,
  lateral_raise: 3,
  incline_dumbbell_press: 3,
  bench_press: 2,
};

const WRIST_STRESS: Readonly<Record<string, LoadScore>> = {
  barbell_curl: 4,
  barbell_row: 3,
  overhead_press: 3,
  front_squat: 3,
  bench_press: 2,
};

const ELBOW_STRESS: Readonly<Record<string, LoadScore>> = {
  overhead_triceps_extension: 4,
  triceps_pushdown: 3,
  dips: 3,
  barbell_curl: 3,
  bench_press: 2,
};

const JOINT_RULES: Partial<Record<JointArea, JointRule>> = {
  knees: {
    stress: (item) => item.kneeStressScore,
    avoidThreshold: 5,
    strictThreshold: 4,
    strictSafeMax: 2,
    // Combfeszítő gép stays: it is a light, non-axial quad isolator.
    preserve: ['front_squat', 'leg_extension'],
    safeSubstituteIds: [
      'romanian_deadlift',
      'belt_squat',
      'adductor_machine',
      'seated_leg_curl',
      'leg_press',
      'hip_thrust',
    ],
  },
  lower_back: {
    // Axial loading is the lower-back stressor.
    stress: (item) => item.axialLoadScore,
    avoidThreshold: 4,
    strictThreshold: 4,
    strictSafeMax: 2,
    preserve: [],
    safeSubstituteIds: [
      'belt_squat',
      'leg_press',
      'seated_cable_row',
      'chest_supported_row',
      'hip_thrust',
      'leg_extension',
    ],
  },
  shoulders: {
    stress: (item) => SHOULDER_STRESS[item.id] ?? 1,
    avoidThreshold: 5,
    strictThreshold: 4,
    strictSafeMax: 2,
    preserve: [],
    safeSubstituteIds: [
      'seated_cable_row',
      'chest_supported_row',
      'cable_fly',
      'lat_pulldown',
      'face_pull',
      'triceps_pushdown',
    ],
  },
  wrists: {
    stress: (item) => WRIST_STRESS[item.id] ?? 1,
    avoidThreshold: 5,
    strictThreshold: 4,
    strictSafeMax: 2,
    preserve: [],
    safeSubstituteIds: [
      'seated_cable_row',
      'lat_pulldown',
      'chest_supported_row',
      'incline_dumbbell_curl',
      'triceps_pushdown',
    ],
  },
  elbows: {
    stress: (item) => ELBOW_STRESS[item.id] ?? 1,
    avoidThreshold: 5,
    strictThreshold: 4,
    strictSafeMax: 2,
    preserve: [],
    safeSubstituteIds: ['cable_fly', 'lateral_raise', 'lat_pulldown', 'leg_extension'],
  },
};

const KNEE_COACH_NOTE = 'Térdgumi / lapos talpú cipő ajánlott';
const RPE_CAP_NOTE = 'Max RPE 8.5';

export type SubstitutionReason = 'excluded' | 'preferred' | 'joint_constraint';

export interface AppliedSubstitution {
  templateId: string;
  blockId: string;
  fromExerciseId: string;
  toExerciseId: string;
  reason: SubstitutionReason;
}

interface JointContext {
  catalogById: Map<string, ExerciseCatalogItem>;
  /** Catalog ordered joint-friendliest first (fallback replacement pool). */
  catalogByFriendliness: ExerciseCatalogItem[];
  excluded: Set<string>;
  preferred: Readonly<Record<string, string>>;
  limitations: readonly JointConstraint[];
}

/** Highest stress a replacement may carry for a given limitation. Infinity = unconstrained. */
function replacementStressCap(severity: JointConstraintSeverity, rule: JointRule): number {
  switch (severity) {
    case 'mild_discomfort':
      return Number.POSITIVE_INFINITY;
    case 'avoid_heavy_axial_load':
      return rule.avoidThreshold - 1;
    case 'strict_exclude':
      return rule.strictSafeMax;
  }
}

/** Joint areas whose active constraints reject the exercise (empty = acceptable). */
function triggeringAreas(
  item: ExerciseCatalogItem,
  limitations: readonly JointConstraint[],
): Set<JointArea> {
  const areas = new Set<JointArea>();
  for (const limitation of limitations) {
    const rule = JOINT_RULES[limitation.area];
    if (rule === undefined) {
      continue;
    }
    // Sleeve-friendly lifts (e.g. front_squat, leg_extension) survive the axial-load
    // restriction, but a strict exclusion still catches anything over its threshold.
    if (rule.preserve.includes(item.id) && limitation.severity !== 'strict_exclude') {
      continue;
    }
    const threshold =
      limitation.severity === 'avoid_heavy_axial_load'
        ? rule.avoidThreshold
        : limitation.severity === 'strict_exclude'
          ? rule.strictThreshold
          : Number.POSITIVE_INFINITY;
    if (rule.stress(item) >= threshold) {
      areas.add(limitation.area);
    }
  }
  return areas;
}

/** True when the exercise must be swapped out for at least one active constraint. */
function mustSwap(item: ExerciseCatalogItem, limitations: readonly JointConstraint[]): boolean {
  return triggeringAreas(item, limitations).size > 0;
}

/** True when the exercise is a safe replacement for every active constraint. */
function isSafeCandidate(item: ExerciseCatalogItem, limitations: readonly JointConstraint[]): boolean {
  for (const limitation of limitations) {
    const rule = JOINT_RULES[limitation.area];
    if (rule === undefined) {
      continue;
    }
    if (rule.stress(item) > replacementStressCap(limitation.severity, rule)) {
      return false;
    }
  }
  return true;
}

/**
 * Preferred choice first, then the exercise's own substitutes, then the safe pools
 * of the joint areas that flagged it. `areas` is empty for the excluded/preferred
 * pass, where the catalog's own `defaultSubstituteIds` are the intended pool.
 */
function pickSubstitute(
  exerciseId: string,
  ctx: JointContext,
  used: ReadonlySet<string>,
  areas: ReadonlySet<JointArea>,
): string | null {
  const candidates: string[] = [];
  const preferredId = ctx.preferred[exerciseId];
  if (preferredId !== undefined) {
    candidates.push(preferredId);
  }
  const current = ctx.catalogById.get(exerciseId);
  if (current !== undefined) {
    candidates.push(...current.defaultSubstituteIds);
  }
  for (const area of areas) {
    const rule = JOINT_RULES[area];
    if (rule !== undefined) {
      candidates.push(...rule.safeSubstituteIds);
    }
  }
  for (const item of ctx.catalogByFriendliness) {
    candidates.push(item.id);
  }

  const seen = new Set<string>();
  for (const id of candidates) {
    if (id === exerciseId || seen.has(id) || used.has(id) || ctx.excluded.has(id)) {
      continue;
    }
    seen.add(id);
    const item = ctx.catalogById.get(id);
    if (item === undefined || mustSwap(item, ctx.limitations)) {
      continue;
    }
    if (!isSafeCandidate(item, ctx.limitations)) {
      continue;
    }
    return id;
  }
  return null;
}

const NO_AREAS: ReadonlySet<JointArea> = new Set<JointArea>();

interface BlockPlan {
  block: WorkoutTemplate['exercises'][number];
  exerciseId: string;
  reason: SubstitutionReason | null;
}

/** Resolves one template's blocks against the constraint context. */
function planTemplate(template: WorkoutTemplate, ctx: JointContext): BlockPlan[] {
  const used = new Set<string>();
  const plan: BlockPlan[] = [];

  // 1. Excluded ids and preferred substitutions are applied first.
  for (const block of template.exercises) {
    let exerciseId = block.exerciseId;
    let reason: SubstitutionReason | null = null;
    const known = ctx.catalogById.has(exerciseId);
    if (known) {
      const isExcluded = ctx.excluded.has(exerciseId);
      const hasPreferred = Object.prototype.hasOwnProperty.call(ctx.preferred, exerciseId);
      if (isExcluded || hasPreferred) {
        const replacement = pickSubstitute(exerciseId, ctx, used, NO_AREAS);
        if (replacement !== null) {
          exerciseId = replacement;
          reason = isExcluded ? 'excluded' : 'preferred';
        }
      }
    }
    used.add(exerciseId);
    plan.push({ block, exerciseId, reason });
  }

  // 2. Joint severity: swap every lift the active constraints reject.
  for (const entry of plan) {
    const item = ctx.catalogById.get(entry.exerciseId);
    if (item === undefined) {
      continue;
    }
    const areas = triggeringAreas(item, ctx.limitations);
    if (areas.size === 0) {
      continue;
    }
    used.delete(entry.exerciseId);
    const replacement = pickSubstitute(entry.exerciseId, ctx, used, areas);
    if (replacement !== null) {
      entry.exerciseId = replacement;
      entry.reason = 'joint_constraint';
      used.add(replacement);
    } else {
      used.add(entry.exerciseId);
    }
  }

  // 3. avoid_heavy_axial_load: never stack two axialLoadScore >= 4 lifts in a session.
  const kneeAxialAvoid = ctx.limitations.some(
    (limitation) =>
      limitation.area === 'knees' && limitation.severity === 'avoid_heavy_axial_load',
  );
  if (kneeAxialAvoid) {
    let axialHeavy = 0;
    for (const entry of plan) {
      const item = ctx.catalogById.get(entry.exerciseId);
      if (item === undefined || item.axialLoadScore < 4) {
        continue;
      }
      axialHeavy += 1;
      if (axialHeavy === 1) {
        continue;
      }
      used.delete(entry.exerciseId);
      const replacement = pickSubstitute(
        entry.exerciseId,
        ctx,
        used,
        triggeringAreas(item, ctx.limitations),
      );
      if (replacement !== null) {
        entry.exerciseId = replacement;
        entry.reason = 'joint_constraint';
        used.add(replacement);
      } else {
        used.add(entry.exerciseId);
      }
    }
  }

  return plan;
}

/** Coaching notes for mild_discomfort: sleeve/shoe advice + a capped compound RPE. */
function coachNotesFor(plan: readonly BlockPlan[], ctx: JointContext): Map<string, string> {
  const notes = new Map<string, string>();
  const mild = ctx.limitations.filter((limitation) => limitation.severity === 'mild_discomfort');
  if (mild.length === 0) {
    return notes;
  }

  for (const entry of plan) {
    const item = ctx.catalogById.get(entry.exerciseId);
    if (item === undefined) {
      continue;
    }
    const tokens: string[] = [];
    const kneeMild = mild.some((limitation) => limitation.area === 'knees');
    if (kneeMild && JOINT_RULES.knees !== undefined && JOINT_RULES.knees.stress(item) >= 3) {
      tokens.push(KNEE_COACH_NOTE);
    }
    if (item.category === 'compound_lower' || item.category === 'compound_upper') {
      tokens.push(RPE_CAP_NOTE);
    }
    if (tokens.length === 0) {
      continue;
    }
    const existing = entry.block.notes ?? '';
    const missing = tokens.filter((token) => !existing.includes(token));
    if (missing.length === 0) {
      continue;
    }
    notes.set(
      entry.block.id,
      existing.length > 0 ? `${existing} · ${missing.join(' · ')}` : missing.join(' · '),
    );
  }
  return notes;
}

function createId(prefix: string): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

// --- Result shape -----------------------------------------------------------

export interface ProgramGenerationResult {
  /** false when no profile has been saved yet — nothing was written. */
  generated: boolean;
  appliedSubstitutions: AppliedSubstitution[];
  /** Target distance the long run was scaled to, or null when unset. */
  runningTargetKm: number | null;
  templateCount: number;
  strengthTemplateCount: number;
  runningTemplateCount: number;
}

const EMPTY_RESULT: ProgramGenerationResult = {
  generated: false,
  appliedSubstitutions: [],
  runningTargetKm: null,
  templateCount: 0,
  strengthTemplateCount: 0,
  runningTemplateCount: 0,
};

// --- Generation -------------------------------------------------------------

/**
 * Builds the full program for the saved profile and persists it, then sweeps
 * every template (generated and custom) through the constraint engine.
 * Idempotent: re-running rebuilds the same rows and applies nothing new.
 */
export async function generateProgramFromProfile(
  db: SQLiteDatabase,
): Promise<ProgramGenerationResult> {
  const profile = await getUserProfile(db);
  if (profile === null) {
    return { ...EMPTY_RESULT };
  }

  const catalog = await getExerciseCatalog(db);
  const catalogById = new Map(catalog.map((item) => [item.id, item]));
  const catalogByFriendliness = [...catalog].sort(
    (left, right) =>
      left.kneeStressScore +
      left.axialLoadScore -
      (right.kneeStressScore + right.axialLoadScore) ||
      left.nameHu.localeCompare(right.nameHu),
  );

  const { trainingProfile } = profile;
  const goal = trainingProfile.primaryGoal;
  const exerciseCount = exercisesPerSession(trainingProfile.sessionDurationMinutes);
  const targetRunDistanceKm =
    trainingProfile.targetRunDistanceKm ?? DEFAULT_RUN_DISTANCE_KM;

  const strengthDays = buildStrengthSplit(trainingProfile.strengthDaysPerWeek);
  const runningDays = buildRunningDays(trainingProfile.runningDaysPerWeek, targetRunDistanceKm);

  const seeds: TemplateProgramSeed[] = [
    ...strengthDays.map((day) => buildStrengthSeed(day, goal, exerciseCount)),
    ...runningDays.map((day) => buildRunningSeed(day)),
  ];

  // Remove managed templates the new program no longer produces, then write the rest.
  const producedIds = new Set(seeds.map((seed) => seed.id));
  const staleIds = MANAGED_TEMPLATE_IDS.filter((id) => !producedIds.has(id));
  await deleteTemplatesByIds(db, staleIds);
  for (const seed of seeds) {
    await replaceTemplateProgram(db, seed);
  }

  // Sweep all templates: excluded ids / preferred substitutions first, then joints.
  const ctx: JointContext = {
    catalogById,
    catalogByFriendliness,
    excluded: new Set(profile.constraints.excludedExerciseIds),
    preferred: profile.constraints.preferredSubstitutions,
    limitations: profile.constraints.jointLimitations,
  };

  const templates = await getWorkoutTemplates(db);
  const appliedSubstitutions: AppliedSubstitution[] = [];

  for (const template of templates) {
    const plan = planTemplate(template, ctx);
    for (const entry of plan) {
      if (entry.reason === null || entry.exerciseId === entry.block.exerciseId) {
        continue;
      }
      await substituteTemplateBlockExercise(db, entry.block.id, entry.exerciseId);
      appliedSubstitutions.push({
        templateId: template.id,
        blockId: entry.block.id,
        fromExerciseId: entry.block.exerciseId,
        toExerciseId: entry.exerciseId,
        reason: entry.reason,
      });
    }
    for (const [blockId, note] of coachNotesFor(plan, ctx)) {
      await setTemplateBlockNotes(db, blockId, note);
    }
  }

  const finalTemplates = await getWorkoutTemplates(db);
  const strengthTemplateCount = finalTemplates.filter(
    (template) => template.sessionType === 'strength',
  ).length;
  const runningTemplateCount = finalTemplates.filter(
    (template) => template.sessionType === 'running',
  ).length;

  return {
    generated: true,
    appliedSubstitutions,
    runningTargetKm: profile.trainingProfile.targetRunDistanceKm ?? null,
    templateCount: finalTemplates.length,
    strengthTemplateCount,
    runningTemplateCount,
  };
}

/** Drops the UserProfile bookkeeping columns, leaving the pure request body. */
function toOnboardingPayload(profile: UserProfile): OnboardingPayload {
  return {
    userId: profile.userId,
    locale: profile.locale,
    biometrics: profile.biometrics,
    trainingProfile: profile.trainingProfile,
    constraints: profile.constraints,
  };
}

/**
 * Builds the JSON body a client sends to the coach backend on pull: the profile
 * (with bookkeeping columns stripped), the client's billing profile, and the
 * exercise vocabulary coach-assigned plans may reference. Shape matches
 * `clientSyncPullExample` in /docs/SAMPLE_PAYLOADS.json.
 */
export async function buildClientSyncPullPayload(
  db: SQLiteDatabase,
): Promise<ClientSyncPullPayload> {
  const profile = await getUserProfile(db);
  if (profile === null) {
    throw new Error('Nincs mentett profil — előbb töltsd ki az onboardingot.');
  }
  const [catalog, billingProfile] = await Promise.all([
    getExerciseCatalog(db),
    getClientBillingProfile(db),
  ]);
  return {
    syncId: createId('sync_pull'),
    generatedAt: new Date().toISOString(),
    locale: profile.locale,
    profile: toOnboardingPayload(profile),
    billingProfile,
    catalog,
  };
}

/** Convenience: the target run distance (km), or the default when the profile is unset. */
export function resolveTargetRunDistanceKm(profile: UserProfile | null): number {
  return profile?.trainingProfile.targetRunDistanceKm ?? DEFAULT_RUN_DISTANCE_KM;
}
