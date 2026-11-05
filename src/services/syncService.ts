// Phase 4/7B — offline-first sync service.
//
// `syncPendingWorkouts` is the one-tap Szinkronizálás entry point. In Phase 7B it
// performs a full Push-then-Pull against the coach backend:
//
//   1. Push  — POST /api/sync/push with the client's whole changed state
//              (onboarding profile, billing record, dirty sessions + bookings).
//   2. Pull  — GET /api/sync/pull?userId=... and reconcile the local graph with
//              the coach's assignments, booking decisions and open slots.
//
// When no backend URL is configured (or the network call fails) it degrades to a
// local export / dry run: the push payload is returned for on-device inspection
// and nothing is marked synced.

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  ClientSyncPushPayload,
  CoachSyncPullResponse,
  SyncBatchPayload,
} from '../types/workout';
import {
  USER_PROFILE_ID,
  applyClientSyncPullPayload,
  getClientBillingProfile,
  getDirtyCoachingBookings,
  getDirtySessionsPayload,
  getUserProfile,
  markCoachingBookingsSynced,
  markSessionsSynced,
} from '../db/repository';

export type SyncMode = 'dry_run' | 'remote' | 'noop';

export interface SyncResult {
  mode: SyncMode;
  /** Sessions in the outgoing batch (0 for a noop). */
  sessionCount: number;
  /** Coaching bookings in the outgoing batch. */
  bookingCount: number;
  /** Sessions flipped to `synced` — non-empty only on a successful upload. */
  syncedSessionIds: string[];
  /** Bookings flipped to `synced` — non-empty only on a successful upload. */
  syncedBookingIds: string[];
  /** The exact JSON body that was (or would be) POSTed to /api/sync/push. */
  payload: ClientSyncPushPayload;
  /** Coach plans applied from the pull leg (0 when none / dry run). */
  appliedTemplateCount: number;
  /** Booking statuses refreshed from the pull leg. */
  appliedBookingCount: number;
  /** Set when the upload could not proceed (offline, HTTP error, fetch missing). */
  error?: string;
}

/**
 * The subset of the Fetch API we rely on. Declared locally so this module
 * type-checks under a DOM-free lib (the headless verify build, lib: ES2022).
 */
interface FetchResponse {
  ok: boolean;
  status: number;
  json?: () => Promise<unknown>;
}
type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string },
) => Promise<FetchResponse>;

function getFetch(): FetchLike | null {
  const candidate = (globalThis as { fetch?: unknown }).fetch;
  return typeof candidate === 'function' ? (candidate as FetchLike) : null;
}

function createBatchId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `sync_${Date.now().toString(36)}${random}`;
}

/** Trims a base URL and drops any trailing slashes so path joins are clean. */
function normalizeBaseUrl(baseUrl?: string | null): string {
  const trimmed = baseUrl?.trim() ?? '';
  return trimmed.replace(/\/+$/, '');
}

/** Best-effort JSON read: returns null when the response exposes no body reader. */
async function readJson<T>(response: FetchResponse): Promise<T | null> {
  if (typeof response.json !== 'function') {
    return null;
  }
  try {
    return (await response.json()) as T;
  } catch {
    return null;
  }
}

/**
 * Builds the outgoing batch: a fresh batchId/generatedAt envelope wrapping every
 * locally dirty session's full nested graph. Feed this to the Szinkronizálás
 * preview modal to inspect the exact JSON on device.
 */
export async function buildSyncBatchPayload(db: SQLiteDatabase): Promise<SyncBatchPayload> {
  const sessions = await getDirtySessionsPayload(db);
  return {
    batchId: createBatchId(),
    generatedAt: new Date().toISOString(),
    deviceId: USER_PROFILE_ID,
    sessions,
  };
}

/**
 * Builds the coach-push envelope (Phase 7A/7B): the client's onboarding profile,
 * billing record, and every locally dirty workout session plus coaching booking,
 * so the coach dashboard can ingest the client's whole changed state in one
 * request. Consumed by `/server`'s `POST /api/sync/push`; on-device it drives the
 * JSON preview.
 *
 * Requires a saved profile (the coach platform has no client without one).
 */
export async function buildClientSyncPushPayload(
  db: SQLiteDatabase,
): Promise<ClientSyncPushPayload> {
  const profile = await getUserProfile(db);
  if (profile === null) {
    throw new Error('Nincs mentett profil — előbb töltsd ki az onboardingot.');
  }

  const [sessions, bookings, billingProfile] = await Promise.all([
    getDirtySessionsPayload(db),
    getDirtyCoachingBookings(db),
    getClientBillingProfile(db),
  ]);

  const { onboardingCompletedAt: _onboardingCompletedAt, updatedAt: _updatedAt, ...payload } =
    profile;

  return {
    batchId: createBatchId(),
    generatedAt: new Date().toISOString(),
    deviceId: USER_PROFILE_ID,
    profile: payload,
    billingProfile,
    sessions,
    bookings,
  };
}

/**
 * Performs a full Push-then-Pull against the coach backend.
 *
 * - `noop`     — nothing dirty and no backend configured.
 * - `dry_run`  — no backend configured, fetch unavailable, or the push failed;
 *                the payload is returned locally and rows stay dirty.
 * - `remote`   — the push succeeded (rows marked synced) and the pull leg ran.
 *
 * @param baseUrl backend base URL (e.g. `http://10.0.2.2:4000`); when omitted/empty
 *                the call stays local.
 */
export async function syncPendingWorkouts(
  db: SQLiteDatabase,
  baseUrl?: string | null,
): Promise<SyncResult> {
  const url = normalizeBaseUrl(baseUrl);
  const payload = await buildClientSyncPushPayload(db);
  const base = {
    sessionCount: payload.sessions.length,
    bookingCount: payload.bookings.length,
    syncedSessionIds: [] as string[],
    syncedBookingIds: [] as string[],
    payload,
    appliedTemplateCount: 0,
    appliedBookingCount: 0,
  };

  if (url.length === 0) {
    if (payload.sessions.length === 0 && payload.bookings.length === 0) {
      return { mode: 'noop', ...base };
    }
    // No backend configured — local export mode.
    return { mode: 'dry_run', ...base };
  }

  const doFetch = getFetch();
  if (doFetch === null) {
    return { mode: 'dry_run', ...base, error: 'A hálózati kliens nem elérhető.' };
  }

  try {
    // --- Push -------------------------------------------------------------
    const pushResponse = await doFetch(`${url}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!pushResponse.ok) {
      return {
        mode: 'dry_run',
        ...base,
        error: `A szerver hibát adott vissza (HTTP ${pushResponse.status}).`,
      };
    }

    const syncedSessionIds = payload.sessions.map((session) => session.id);
    const syncedBookingIds = payload.bookings.map((booking) => booking.id);
    if (syncedSessionIds.length > 0) {
      await markSessionsSynced(db, syncedSessionIds);
    }
    if (syncedBookingIds.length > 0) {
      await markCoachingBookingsSynced(db, syncedBookingIds);
    }

    // --- Pull -------------------------------------------------------------
    // Best-effort: a failed pull never un-does a successful push.
    let appliedTemplateCount = 0;
    let appliedBookingCount = 0;
    try {
      const pullResponse = await doFetch(
        `${url}/api/sync/pull?userId=${encodeURIComponent(USER_PROFILE_ID)}`,
        { method: 'GET', headers: { Accept: 'application/json' } },
      );
      if (pullResponse.ok) {
        const pull = await readJson<CoachSyncPullResponse>(pullResponse);
        if (pull !== null) {
          await applyClientSyncPullPayload(db, pull);
          appliedTemplateCount = pull.templates.length;
          appliedBookingCount = pull.bookings.length;
        }
      }
    } catch {
      // Ignore: the push succeeded and the client stays usable offline.
    }

    return {
      mode: 'remote',
      sessionCount: syncedSessionIds.length,
      bookingCount: syncedBookingIds.length,
      syncedSessionIds,
      syncedBookingIds,
      payload,
      appliedTemplateCount,
      appliedBookingCount,
    };
  } catch (cause: unknown) {
    return {
      mode: 'dry_run',
      ...base,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
