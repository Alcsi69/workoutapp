// Barbell plate-loading math (Phase 6).
//
// Pure, dependency-free helper the logger's plate-calculator sheet renders: given
// a target weight, a bar and the plates on hand, it returns the exact plates to
// load on ONE side plus the closest weight the stack can actually build. All the
// tricky bits live here (float-safe decrement, plate ordering, "closest below")
// so the component is a thin view over a testable function.

import type { Equipment, ExerciseCatalogItem } from '../types/workout';

/** A standard Olympic bar. */
export const DEFAULT_BAR_WEIGHT_KG = 20;

/** Kg denomination of each plate, heaviest first, that the calculator assumes. */
export const DEFAULT_PLATE_KG: readonly number[] = [25, 20, 15, 10, 5, 2.5, 1.25];

/** Exercises whose load is a barbell (or specialty bar) worth plate-loading. */
const PLATE_EQUIPMENT: readonly Equipment[] = ['barbell', 'specialty_bar'];

/** The plate-calculator tolerance for float noise (a quarter of the smallest plate). */
const EPSILON_KG = 0.01;

export interface PlateStack {
  /** Kg of a single plate. */
  plateKg: number;
  /** How many of that plate go on each side. */
  countPerSide: number;
}

export interface PlateCalculation {
  barWeightKg: number;
  targetWeightKg: number;
  /** Heaviest weight (bar included) the available plates can build at or below target. */
  achievableWeightKg: number;
  /** `targetWeightKg - achievableWeightKg`, never negative. */
  shortfallKg: number;
  /** True when the plate stack hits the target exactly. */
  exact: boolean;
  /** Plates for a SINGLE side, heaviest first. Empty when the target is at/below the bar. */
  platesPerSide: PlateStack[];
}

/** Rounds away binary float noise so 2.5 kg increments compare as exact. */
function roundKg(value: number): number {
  return Math.round(value * 1000) / 1000;
}

function sanitizeWeight(value: number, fallback: number): number {
  return Number.isFinite(value) && value >= 0 ? value : fallback;
}

/**
 * Plates for one side (and the closest weight) for `targetWeightKg` on a bar,
 * larger plates first. The search is a greedy largest-first fill, which is
 * optimal for the standard descending denomination set: it always fills the
 * per-side remainder with the fewest plates.
 *
 * Target weights the plate set cannot hit exactly (e.g. 43 kg) report the closest
 * weight buildable from below in `achievableWeightKg` / `shortfallKg`.
 */
export function calculatePlatesPerSide(
  targetWeightKg: number,
  barWeightKg: number = DEFAULT_BAR_WEIGHT_KG,
  availablePlates: readonly number[] = DEFAULT_PLATE_KG,
): PlateCalculation {
  const bar = sanitizeWeight(barWeightKg, DEFAULT_BAR_WEIGHT_KG);
  const target = sanitizeWeight(targetWeightKg, 0);

  // Unique, positive denominations, heaviest first.
  const denominations = Array.from(
    new Set(availablePlates.filter((plate) => Number.isFinite(plate) && plate > 0)),
  ).sort((left, right) => right - left);

  const perSideTarget = (target - bar) / 2;
  if (!(perSideTarget > EPSILON_KG) || denominations.length === 0) {
    const achievableWeightKg = roundKg(Math.max(bar, 0));
    return {
      barWeightKg: bar,
      targetWeightKg: target,
      achievableWeightKg,
      shortfallKg: roundKg(Math.max(0, target - achievableWeightKg)),
      exact: Math.abs(target - achievableWeightKg) < EPSILON_KG,
      platesPerSide: [],
    };
  }

  const platesPerSide: PlateStack[] = [];
  let remainingPerSide = perSideTarget;
  for (const plateKg of denominations) {
    const countPerSide = Math.floor((remainingPerSide + EPSILON_KG) / plateKg);
    if (countPerSide > 0) {
      platesPerSide.push({ plateKg, countPerSide });
      remainingPerSide = roundKg(remainingPerSide - countPerSide * plateKg);
    }
  }

  const loadedPerSide = roundKg(perSideTarget - remainingPerSide);
  const achievableWeightKg = roundKg(bar + loadedPerSide * 2);

  return {
    barWeightKg: bar,
    targetWeightKg: target,
    achievableWeightKg,
    shortfallKg: roundKg(Math.max(0, target - achievableWeightKg)),
    exact: Math.abs(target - achievableWeightKg) < EPSILON_KG,
    platesPerSide,
  };
}

/** Total plate count loaded (both sides) — handy for a one-line summary. */
export function totalPlateCount(calculation: PlateCalculation): number {
  return calculation.platesPerSide.reduce((sum, stack) => sum + stack.countPerSide * 2, 0);
}

/**
 * Whether a block's exercise is worth offering the plate calculator for: a
 * barbell or specialty-bar lift. The belt squat loads a specialty machine that
 * still counts in plates, so it is included explicitly.
 */
export function shouldOfferPlateCalculator(exercise: ExerciseCatalogItem): boolean {
  return PLATE_EQUIPMENT.includes(exercise.equipment) || exercise.id === 'belt_squat';
}
