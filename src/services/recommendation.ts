// Pure program-planning helpers: map the weekly split onto calendar days.
// No DB or React here so the logic stays trivially testable.

import type { UserProfile, WorkoutTemplate } from '../types/workout';

export type SessionSlot = 'strength' | 'running' | 'rest';

export interface RecommendedSession {
  template: WorkoutTemplate;
  slot: 'strength' | 'running';
  /** 0 = Monday ... 6 = Sunday */
  weekdayIndex: number;
}

/** JS getDay() is Sunday-first; the plan is Monday-first. */
export function getWeekdayIndex(date: Date): number {
  return (date.getDay() + 6) % 7;
}

function clampDays(value: number): number {
  if (!Number.isFinite(value) || value < 0) {
    return 0;
  }
  return Math.min(7, Math.round(value));
}

/**
 * The split fills the week front-to-back: strength days first, then running
 * days, then rest. Both counts are clamped so they never exceed seven days.
 */
export function getWeeklySlots(profile: UserProfile): SessionSlot[] {
  const strengthDays = clampDays(profile.trainingProfile.strengthDaysPerWeek);
  const runningDays = clampDays(profile.trainingProfile.runningDaysPerWeek);
  const slots: SessionSlot[] = [];

  for (let day = 0; day < 7; day += 1) {
    if (day < strengthDays) {
      slots.push('strength');
    } else if (day < strengthDays + runningDays) {
      slots.push('running');
    } else {
      slots.push('rest');
    }
  }

  return slots;
}

/** Running templates ordered so the user's target distance comes first. */
function orderRunningTemplates(
  templates: readonly WorkoutTemplate[],
  targetRunDistanceKm: number | undefined,
): WorkoutTemplate[] {
  if (targetRunDistanceKm === undefined) {
    return [...templates];
  }
  return [...templates].sort((left, right) => {
    const leftMatch = left.title.includes(`${targetRunDistanceKm} km`) ? 0 : 1;
    const rightMatch = right.title.includes(`${targetRunDistanceKm} km`) ? 0 : 1;
    return leftMatch - rightMatch;
  });
}

/**
 * Picks today's session: the strength rotation advances one template per
 * strength day, and running days rotate through the running templates (target
 * distance first). Returns null on a rest day or when nothing is seeded.
 */
export function pickRecommendedSession(
  templates: readonly WorkoutTemplate[],
  profile: UserProfile,
  date: Date = new Date(),
): RecommendedSession | null {
  const weekdayIndex = getWeekdayIndex(date);
  const slot = getWeeklySlots(profile)[weekdayIndex];

  if (slot === 'rest') {
    return null;
  }

  if (slot === 'strength') {
    const strengthTemplates = templates.filter((item) => item.sessionType === 'strength');
    if (strengthTemplates.length === 0) {
      return null;
    }
    return {
      template: strengthTemplates[weekdayIndex % strengthTemplates.length],
      slot: 'strength',
      weekdayIndex,
    };
  }

  const runningTemplates = orderRunningTemplates(
    templates.filter((item) => item.sessionType === 'running'),
    profile.trainingProfile.targetRunDistanceKm,
  );
  if (runningTemplates.length === 0) {
    return null;
  }

  const strengthDays = clampDays(profile.trainingProfile.strengthDaysPerWeek);
  const runningOffset = Math.max(0, weekdayIndex - strengthDays);

  return {
    template: runningTemplates[runningOffset % runningTemplates.length],
    slot: 'running',
    weekdayIndex,
  };
}