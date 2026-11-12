// Background auto-sync orchestration (Phase 7 UX).
//
// Pull:   runs when the app mounts and whenever it returns to the foreground, so
//         the coach's latest plans, slots and booking decisions appear without
//         the user tapping anything.
// Push:   debounced after any local mutation (a logged set, a finished workout,
//         a saved profile/billing record, a booking) so the coach dashboard
//         mirrors the client behind the scenes.
//
// Both legs are best-effort: any failure is swallowed and the app stays fully
// usable offline. Nothing here runs when no backend URL is configured.

import { getDatabase } from '../db/client';
import { getLocalAuthSession, getSyncServerUrl } from '../db/repository';
import { syncPull, syncPush } from './syncService';

/** Coalesces a burst of edits (e.g. rapid set logging) into one push. */
const PUSH_DEBOUNCE_MS = 2500;

let pushTimer: ReturnType<typeof setTimeout> | null = null;
let pushInFlight = false;
let pushQueued = false;

/**
 * Background sync only ever runs for a logged-in device. Without this gate a
 * fresh browser would pull (and apply) whatever the backend answered, which is
 * exactly how another user's profile could appear without logging in.
 */
async function hasSession(): Promise<boolean> {
  try {
    const db = await getDatabase();
    return (await getLocalAuthSession(db)) !== null;
  } catch {
    return false;
  }
}

/** Pull the latest coach state, if the device is logged in. Never throws. */
export async function runAutoPull(): Promise<void> {
  try {
    const db = await getDatabase();
    if ((await getLocalAuthSession(db)) === null) {
      return;
    }
    const url = await getSyncServerUrl(db);
    if (url.length === 0) {
      return;
    }
    await syncPull(db, url);
  } catch {
    // Offline or backend unreachable: the client stays usable on local data.
  }
}

/** Push the client's changed state, if the device is logged in. Never throws. */
async function flushAutoPush(): Promise<void> {
  if (pushInFlight) {
    // A push is already running; run once more when it finishes.
    pushQueued = true;
    return;
  }
  pushInFlight = true;
  try {
    const db = await getDatabase();
    if ((await getLocalAuthSession(db)) === null) {
      return;
    }
    const url = await getSyncServerUrl(db);
    if (url.length > 0) {
      await syncPush(db, url);
    }
  } catch {
    // Offline or backend unreachable: rows stay dirty for the next attempt.
  } finally {
    pushInFlight = false;
    if (pushQueued) {
      pushQueued = false;
      void flushAutoPush();
    }
  }
}

/** Schedules a debounced background push (safe to call on every mutation). */
export function scheduleAutoPush(): void {
  if (pushTimer !== null) {
    clearTimeout(pushTimer);
  }
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void (async () => {
      if (await hasSession()) {
        await flushAutoPush();
      }
    })();
  }, PUSH_DEBOUNCE_MS);
}
