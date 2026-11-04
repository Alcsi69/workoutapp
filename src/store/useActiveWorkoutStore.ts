// Zustand store for the active-workout UI: the in-progress session id and a
// timestamp-based rest timer. The timer stores an absolute end timestamp rather
// than a decrementing counter, so it stays accurate when the app is briefly
// backgrounded (the countdown is derived from Date.now() on each tick).

import { create } from 'zustand';

/** Amount the +15s / -15s controls nudge the running rest timer. */
export const REST_ADJUST_STEP_SECONDS = 15;

interface ActiveWorkoutState {
  /** Session currently being logged, or null when none is open. */
  sessionId: string | null;
  /** Absolute epoch-ms the rest period ends, or null when no rest is running. */
  restEndTimeMs: number | null;
  /** Block the running rest belongs to (drives the banner copy). */
  activeRestBlockId: string | null;
}

interface ActiveWorkoutActions {
  setSession: (sessionId: string | null) => void;
  /** Starts (or restarts) a rest period for a block; a 0/negative rest clears it. */
  startRest: (blockId: string, restSeconds: number, nowMs?: number) => void;
  /** Nudges the running rest by deltaSeconds (e.g. +15 / -15), never below now. */
  adjustRest: (deltaSeconds: number, nowMs?: number) => void;
  skipRest: () => void;
  reset: () => void;
}

export type ActiveWorkoutStore = ActiveWorkoutState & ActiveWorkoutActions;

/** Milliseconds left in the rest period (0 when none is running or it elapsed). */
export function computeRestRemainingMs(
  restEndTimeMs: number | null,
  nowMs: number,
): number {
  if (restEndTimeMs === null) {
    return 0;
  }
  return Math.max(0, restEndTimeMs - nowMs);
}

/** True while a rest period is set and has time left. */
export function restIsActive(restEndTimeMs: number | null, nowMs: number): boolean {
  return restEndTimeMs !== null && restEndTimeMs > nowMs;
}

/** "1:05" style clock from a millisecond remainder (rounds up to the second). */
export function formatRestClock(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

export const useActiveWorkoutStore = create<ActiveWorkoutStore>((set) => ({
  sessionId: null,
  restEndTimeMs: null,
  activeRestBlockId: null,

  setSession: (sessionId) => {
    set({ sessionId });
  },

  startRest: (blockId, restSeconds, nowMs = Date.now()) => {
    if (!Number.isFinite(restSeconds) || restSeconds <= 0) {
      set({ restEndTimeMs: null, activeRestBlockId: null });
      return;
    }
    set({ restEndTimeMs: nowMs + restSeconds * 1000, activeRestBlockId: blockId });
  },

  adjustRest: (deltaSeconds, nowMs = Date.now()) => {
    set((state) => {
      if (state.restEndTimeMs === null) {
        return state;
      }
      return { restEndTimeMs: Math.max(nowMs, state.restEndTimeMs + deltaSeconds * 1000) };
    });
  },

  skipRest: () => {
    set({ restEndTimeMs: null, activeRestBlockId: null });
  },

  reset: () => {
    set({ sessionId: null, restEndTimeMs: null, activeRestBlockId: null });
  },
}));
