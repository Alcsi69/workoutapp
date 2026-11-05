// Phase 5 analytics: pure, dependency-free calculations over logged sets and runs.
//
// Everything here is a total function over plain data — no SQLite, no React, no
// Date.now() — so the numbers behind the "Előző edzés" hints, the 1RM estimates,
// the PR badges, and the Fejlődés view are unit-testable in isolation (see
// scripts/verify-db.cjs) and identical wherever they are rendered.

import type {
  BestEffortPace,
  EstimatedOneRepMax,
  OverloadHintReason,
  OverloadTargetHint,
  PreviousPerformanceSet,
  RunningProgressionPoint,
  RunningProgressionSummary,
  RunningTrend,
  SetType,
  TrainingGoal,
} from '../types/workout';

// --- Shared constants -------------------------------------------------------

/** RPE is stored 5.0 - 10.0 in 0.5 steps; the repository enforces the same range. */
export const RPE_MIN = 5;
export const RPE_MAX = 10;

/** Estimated 1RM from more reps than this is guesswork, so the rep count is capped. */
export const ONE_REP_MAX_MAX_REPS = 12;

/** Smallest standard plate jump (a pair of 1.25 kg plates). */
export const WEIGHT_INCREMENT_KG = 2.5;

/** At or above this RPE the set was near-failure: repeat the load, do not add. */
export const FAILURE_RPE = 9.5;

/**
 * Per-goal ceiling for *adding weight*. A strength/powerbuilding top set at RPE
 * 8.5 or easier means the load is ready to move; hypertrophy work is allowed to
 * sit closer to failure before the bar goes up.
 */
const WEIGHT_BUMP_RPE_CEILING: Record<TrainingGoal, number> = {
  strength: 8.5,
  powerbuilding: 8.5,
  hypertrophy: 9,
  hybrid_strength_running: 8.5,
};

/** Estimates are rounded to 0.1 kg; this is the float-noise tolerance for PRs. */
const ONE_REP_MAX_EPSILON_KG = 0.05;

/** A run counts as a "5K" / "7K" effort when it is within this of the nominal distance. */
export const BEST_EFFORT_TOLERANCE_KM = 0.75;

/** Pace change (fraction of the baseline pace) that counts as a real trend. */
export const RUNNING_TREND_THRESHOLD = 0.02;

// --- Small numeric helpers --------------------------------------------------

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

function isUsableRpe(rpe: number | undefined): rpe is number {
  return rpe !== undefined && Number.isFinite(rpe) && rpe >= RPE_MIN && rpe <= RPE_MAX;
}

// --- 1RM estimation ---------------------------------------------------------

/**
 * Reps in reserve implied by an RPE (10 - RPE), or 0 when no usable RPE was
 * logged. RPE 8 on a 5-rep set means ~2 reps were left, so the set is treated as
 * a 7-rep effort — that is what makes an easy set read as a higher 1RM.
 */
function repsInReserve(rpe: number | undefined): number {
  return isUsableRpe(rpe) ? RPE_MAX - rpe : 0;
}

/**
 * Estimated one-rep max: the mean of the Epley (`w * (1 + reps/30)`) and Brzycki
 * (`w * 36 / (37 - reps)`) formulas, which agree closely through the 1-12 rep
 * range and disagree where each is weakest.
 *
 * `rpe` (optional) adds the reps in reserve to the rep count, so 100 kg x 5 @8
 * estimates the same 1RM as a 7-rep set at the same weight. Reps are capped at
 * `ONE_REP_MAX_MAX_REPS`; an absent or out-of-range RPE is ignored rather than
 * throwing, because hints must never break the logger. Returns 0 (not NaN) for
 * weight/reps that carry no information.
 */
export function estimateOneRepMax(weightKg: number, reps: number, rpe?: number): number {
  if (!Number.isFinite(weightKg) || weightKg <= 0) {
    return 0;
  }
  if (!Number.isFinite(reps) || reps < 1) {
    return 0;
  }

  const effectiveReps = Math.min(
    ONE_REP_MAX_MAX_REPS,
    Math.max(1, Math.round(reps) + repsInReserve(rpe)),
  );
  const epley = weightKg * (1 + effectiveReps / 30);
  const brzycki = (weightKg * 36) / (37 - effectiveReps);
  return roundTo((epley + brzycki) / 2, 1);
}

/** `estimateOneRepMax` plus the inputs it came from, or null for a useless set. */
export function estimateSetOneRepMax(
  weightKg: number,
  reps: number,
  rpe?: number,
): EstimatedOneRepMax | null {
  const oneRepMaxKg = estimateOneRepMax(weightKg, reps, rpe);
  if (oneRepMaxKg <= 0) {
    return null;
  }
  const estimate: EstimatedOneRepMax = { weightKg, reps, oneRepMaxKg };
  if (isUsableRpe(rpe)) {
    estimate.rpe = rpe;
  }
  return estimate;
}

/**
 * Heaviest working set of a session (warmups and empty rows ignored), tie-broken
 * by rep count. This is the "reference set" every hint and progression row uses.
 */
export function topSetOf(sets: readonly PreviousPerformanceSet[]): EstimatedOneRepMax | null {
  let best: PreviousPerformanceSet | null = null;
  for (const set of sets) {
    if (set.setType === 'warmup' || !(set.actualWeightKg > 0) || !(set.actualReps > 0)) {
      continue;
    }
    if (
      best === null ||
      set.actualWeightKg > best.actualWeightKg ||
      (set.actualWeightKg === best.actualWeightKg && set.actualReps > best.actualReps)
    ) {
      best = set;
    }
  }
  if (best === null) {
    return null;
  }
  return estimateSetOneRepMax(best.actualWeightKg, best.actualReps, best.rpe);
}

/**
 * True when a freshly logged set beats the best estimated 1RM seen so far. The
 * first set ever logged for an exercise is a PR by definition, which is what
 * makes the badge appear on a brand-new exercise. A set with no weight or reps
 * is never a PR, and the comparison carries a 0.05 kg tolerance because
 * estimates are rounded to 0.1 kg.
 */
export function isNewPersonalRecord(
  weightKg: number,
  reps: number,
  previousBestOneRepMaxKg: number,
  rpe?: number,
): boolean {
  const estimate = estimateOneRepMax(weightKg, reps, rpe);
  if (estimate <= 0) {
    return false;
  }
  if (!Number.isFinite(previousBestOneRepMaxKg) || previousBestOneRepMaxKg <= 0) {
    return true;
  }
  return estimate > previousBestOneRepMaxKg + ONE_REP_MAX_EPSILON_KG;
}

// --- Progressive overload hints --------------------------------------------

export interface RepRange {
  min: number;
  max: number;
}

/**
 * Parses a rep prescription ("6-8", "5", "5x5") into its bounds. Returns null for
 * anything that is not a rep count — notably distance prescriptions such as
 * "5 km", which must not be read as five reps.
 */
export function parseRepRange(targetReps?: string): RepRange | null {
  if (targetReps === undefined || targetReps.trim().length === 0) {
    return null;
  }
  if (!/^[\d\s\-–—×xX]*$/.test(targetReps)) {
    return null;
  }
  const numbers = (targetReps.match(/\d+/g) ?? [])
    .map((match) => Number.parseInt(match, 10))
    .filter((value) => Number.isFinite(value) && value > 0);
  if (numbers.length === 0) {
    return null;
  }
  return { min: Math.min(...numbers), max: Math.max(...numbers) };
}

function buildHint(
  reason: OverloadHintReason,
  reference: EstimatedOneRepMax,
  weightKg: number,
  reps: number,
): OverloadTargetHint {
  const rounded = roundTo(weightKg, 2);
  return {
    reason,
    weightKg: rounded,
    reps,
    deltaKg: roundTo(rounded - reference.weightKg, 2),
    deltaReps: reps - reference.reps,
  };
}

/**
 * Double-progression target for the next session, derived from the last time the
 * exercise was logged and the user's primary goal:
 *
 * - near-failure last time (RPE >= 9.5) -> repeat the same load (`hold_weight`)
 * - top of the rep range at RPE <= the goal ceiling -> +2.5 kg, reps reset to the
 *   bottom of the range (`top_of_range_easy`)
 * - top of the range but hard (or RPE unknown) -> repeat it and earn the RPE
 *   (`top_of_range_hard`)
 * - anywhere else -> +1 rep at the same weight (`add_rep`)
 *
 * Without `targetReps` the previous set is its own reference, so the hint can
 * only add a rep. Returns null when there is no history to reason about — the
 * logger then shows no suggestion at all.
 */
export function computeNextTargetHint(
  previousSets: readonly PreviousPerformanceSet[] | undefined,
  primaryGoal: TrainingGoal,
  targetReps?: string,
): OverloadTargetHint | null {
  if (previousSets === undefined || previousSets.length === 0) {
    return null;
  }
  const reference = topSetOf(previousSets);
  if (reference === null) {
    return null;
  }

  const range = parseRepRange(targetReps);
  const rangeTop = range === null ? reference.reps : range.max;
  const rangeBottom = range === null ? reference.reps : Math.min(range.min, reference.reps);
  const atTopOfRange = reference.reps >= rangeTop;
  const ceiling = WEIGHT_BUMP_RPE_CEILING[primaryGoal];
  const rpe = reference.rpe;

  if (isUsableRpe(rpe) && rpe >= FAILURE_RPE) {
    return buildHint('hold_weight', reference, reference.weightKg, reference.reps);
  }
  if (atTopOfRange && isUsableRpe(rpe) && rpe <= ceiling) {
    return buildHint('top_of_range_easy', reference, reference.weightKg + WEIGHT_INCREMENT_KG, rangeBottom);
  }
  if (atTopOfRange) {
    return buildHint('top_of_range_hard', reference, reference.weightKg, reference.reps);
  }
  return buildHint('add_rep', reference, reference.weightKg, reference.reps + 1);
}

// --- Volume -----------------------------------------------------------------

/** Minimal shape every volume calculation needs (SetLog and hint rows both fit). */
export interface VolumeSet {
  setType: SetType;
  actualWeightKg: number;
  actualReps: number;
}

/**
 * Tonnage over the given sets. Warmups are excluded by default (they measure
 * nothing about the working load); the Előzmények log passes `includeWarmups` to
 * keep showing the session's raw total.
 */
export function totalVolumeKg(
  sets: readonly VolumeSet[],
  options: { includeWarmups?: boolean } = {},
): number {
  const includeWarmups = options.includeWarmups === true;
  let total = 0;
  for (const set of sets) {
    if (!includeWarmups && set.setType === 'warmup') {
      continue;
    }
    if (!Number.isFinite(set.actualWeightKg) || !Number.isFinite(set.actualReps)) {
      continue;
    }
    total += set.actualWeightKg * set.actualReps;
  }
  return roundTo(total, 2);
}

// --- Running analytics ------------------------------------------------------

/**
 * Fastest logged run within `toleranceKm` of a nominal distance (5K / 7K), which
 * is how the summary card reports "best 5K pace" without needing a race tag.
 * Returns null when no run is close enough to that distance.
 */
export function computeBestEffortPace(
  sessions: readonly RunningProgressionPoint[],
  targetDistanceKm: number,
  toleranceKm: number = BEST_EFFORT_TOLERANCE_KM,
): BestEffortPace | null {
  let best: BestEffortPace | null = null;
  for (const session of sessions) {
    if (!(session.distanceKm > 0) || !(session.avgPaceSecondsPerKm > 0)) {
      continue;
    }
    if (Math.abs(session.distanceKm - targetDistanceKm) > toleranceKm) {
      continue;
    }
    if (best === null || session.avgPaceSecondsPerKm < best.paceSecondsPerKm) {
      best = {
        targetDistanceKm,
        distanceKm: session.distanceKm,
        paceSecondsPerKm: session.avgPaceSecondsPerKm,
        sessionId: session.sessionId,
        date: session.date,
      };
    }
  }
  return best;
}

/**
 * Compares the mean pace of the last up-to-3 runs against everything before them.
 * Lower pace is better, so a faster recent window means 'improving'. Fewer than
 * two paced runs cannot show a trend.
 */
export function computeRunningTrend(sessions: readonly RunningProgressionPoint[]): RunningTrend {
  const paced = sessions.filter((session) => session.avgPaceSecondsPerKm > 0);
  if (paced.length < 2) {
    return 'none';
  }
  const recentCount = Math.min(3, paced.length - 1);
  const recent = paced.slice(paced.length - recentCount);
  const baseline = paced.slice(0, paced.length - recentCount);

  const mean = (list: readonly RunningProgressionPoint[]): number =>
    list.reduce((sum, session) => sum + session.avgPaceSecondsPerKm, 0) / list.length;

  const baselineMean = mean(baseline);
  const recentMean = mean(recent);
  if (!(baselineMean > 0)) {
    return 'none';
  }
  const change = (baselineMean - recentMean) / baselineMean;
  if (change >= RUNNING_TREND_THRESHOLD) {
    return 'improving';
  }
  if (change <= -RUNNING_TREND_THRESHOLD) {
    return 'declining';
  }
  return 'steady';
}

/** Total km, mean pace, best 5K/7K effort, and recent trend for the running card. */
export function summarizeRunningProgression(
  sessions: readonly RunningProgressionPoint[],
): RunningProgressionSummary {
  const paced = sessions.filter((session) => session.avgPaceSecondsPerKm > 0);
  const summary: RunningProgressionSummary = {
    sessionCount: sessions.length,
    totalDistanceKm: roundTo(
      sessions.reduce((sum, session) => sum + Math.max(0, session.distanceKm), 0),
      2,
    ),
    averagePaceSecondsPerKm:
      paced.length === 0
        ? 0
        : Math.round(paced.reduce((sum, s) => sum + s.avgPaceSecondsPerKm, 0) / paced.length),
    trend: computeRunningTrend(sessions),
  };

  const best5k = computeBestEffortPace(sessions, 5);
  const best7k = computeBestEffortPace(sessions, 7);
  if (best5k !== null) {
    summary.best5k = best5k;
  }
  if (best7k !== null) {
    summary.best7k = best7k;
  }
  return summary;
}
