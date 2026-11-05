// Pure draft-state helpers for the active workout logger.
//
// The logger keeps each set row as an editable draft until it is persisted. The
// two things that decide whether a tap is cheap and honest — prefilling a row
// with last session's numbers, and deciding which completed rows are PRs — are
// pure functions over those drafts, so they live here (and are covered by
// scripts/verify-db.cjs) instead of inside the card component.

import { estimateOneRepMax, isNewPersonalRecord } from './analytics';
import type {
  PreviousPerformanceSet,
  SessionExerciseBlock,
  SetType,
} from '../types/workout';

/** Local, editable draft of one set row (raw text until persisted). */
export interface SetDraft {
  key: string;
  setNumber: number;
  setType: SetType;
  weight: string;
  reps: string;
  rpe: number | null;
  /** Persisted set id once completed, else null. */
  setLogId: string | null;
  completed: boolean;
}

export function emptyDraft(blockId: string, setNumber: number, setType: SetType): SetDraft {
  return {
    key: `${blockId}:${setNumber}`,
    setNumber,
    setType,
    weight: '',
    reps: '',
    rpe: null,
    setLogId: null,
    completed: false,
  };
}

/** The previous session's set with this exact set number, when it logged one. */
export function exactPreviousSet(
  setNumber: number,
  previousSets: readonly PreviousPerformanceSet[],
): PreviousPerformanceSet | null {
  const match = previousSets.find((set) => set.setNumber === setNumber);
  if (match === undefined || !(match.actualWeightKg > 0) || !(match.actualReps > 0)) {
    return null;
  }
  return match;
}

/**
 * Weight/reps to prefill an uncompleted row with: the previous session's set with
 * the same set number, or its last logged set when today's prescription has more
 * sets than were performed last time. RPE is deliberately *not* copied — it is a
 * self-report about this set, not a number to inherit.
 */
export function prefillValues(
  setNumber: number,
  previousSets: readonly PreviousPerformanceSet[],
): { weight: string; reps: string } | null {
  if (previousSets.length === 0) {
    return null;
  }
  const source =
    exactPreviousSet(setNumber, previousSets) ?? previousSets[previousSets.length - 1];
  if (source === undefined || !(source.actualWeightKg > 0) || !(source.actualReps > 0)) {
    return null;
  }
  return { weight: String(source.actualWeightKg), reps: String(source.actualReps) };
}

/**
 * Logged sets first (completed), then empty rows up to the target set count.
 * Rows that are still open are prefilled with last session's numbers so a working
 * set is logged with a single tap on the completion checkbox.
 */
export function buildInitialDrafts(
  block: SessionExerciseBlock,
  previousSets: readonly PreviousPerformanceSet[],
): SetDraft[] {
  const drafts: SetDraft[] = block.sets.map((set) => ({
    key: `${block.id}:${set.setNumber}`,
    setNumber: set.setNumber,
    setType: set.setType,
    weight: String(set.actualWeightKg),
    reps: String(set.actualReps),
    rpe: set.rpe ?? null,
    setLogId: set.id,
    completed: true,
  }));

  const target = block.targetSets ?? drafts.length;
  const maxNumber = drafts.reduce((max, draft) => Math.max(max, draft.setNumber), 0);
  const total = Math.max(target, maxNumber);
  const lastType = drafts.length > 0 ? drafts[drafts.length - 1].setType : 'working';
  for (let setNumber = maxNumber + 1; setNumber <= total; setNumber += 1) {
    const draft = emptyDraft(block.id, setNumber, lastType);
    const prefill = prefillValues(setNumber, previousSets);
    drafts.push(prefill === null ? draft : { ...draft, weight: prefill.weight, reps: prefill.reps });
  }
  return drafts;
}

/**
 * Keys of the completed rows that beat the best estimated 1RM known *before*
 * them — the all-time best from earlier sessions, or a set already logged earlier
 * in this block (rows are evaluated in set order). Derived from the drafts on
 * every render (no state to keep in sync): unchecking or editing a row drops its
 * badge immediately.
 */
export function findPersonalRecords(
  drafts: readonly SetDraft[],
  baselineBestOneRepMaxKg: number,
): Record<string, number> {
  const records: Record<string, number> = {};
  let best = baselineBestOneRepMaxKg;
  const ordered = [...drafts].sort((left, right) => left.setNumber - right.setNumber);
  for (const draft of ordered) {
    if (!draft.completed || draft.setLogId === null) {
      continue;
    }
    const weight = Number.parseFloat(draft.weight.replace(',', '.'));
    const reps = Number.parseInt(draft.reps, 10);
    if (!Number.isFinite(weight) || !Number.isFinite(reps)) {
      continue;
    }
    const rpe = draft.rpe ?? undefined;
    if (!isNewPersonalRecord(weight, reps, best, rpe)) {
      continue;
    }
    const estimate = estimateOneRepMax(weight, reps, rpe);
    records[draft.key] = estimate;
    best = estimate;
  }
  return records;
}
