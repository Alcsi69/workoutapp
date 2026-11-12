// Phase 4/7B — offline-first sync service.
//
// The sync is split into two independent legs so the app can drive them
// automatically (see services/autoSync.ts) as well as on demand:
//
//   1. Push  — POST {base}/sync/push with the client's whole changed state
//              (onboarding profile, billing record, dirty sessions + bookings).
//   2. Pull  — GET {base}/sync/pull?userId=... and reconcile the local graph with
//              the coach's assignments, booking decisions and open slots.
//
// `syncPendingWorkouts` runs Push-then-Pull (the manual Szinkronizálás button);
// `syncPush` / `syncPull` run a single leg (the background auto-sync).
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
import hu from '../i18n/hu';
import {
  getLocalAuthSession,
  USER_PROFILE_ID,
  applyClientSyncPullPayload,
  getClientBillingProfile,
  getDirtyCoachingBookings,
  getDirtySessionsPayload,
  getUserProfile,
  markCoachingBookingsSynced,
  markSessionsSynced,
  type LocalAuthSession,
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
  /** The exact JSON body that was (or would be) POSTed to /sync/push. */
  payload: ClientSyncPushPayload;
  /** Coach plans applied from the pull leg (0 when none / dry run). */
  appliedTemplateCount: number;
  /** Booking statuses refreshed from the pull leg. */
  appliedBookingCount: number;
  /** Set when the upload could not proceed (offline, HTTP error, fetch missing). */
  error?: string;
}

/** Outcome of a push-only sync leg. */
export interface SyncPushResult {
  mode: SyncMode;
  /** Sessions in the outgoing batch. */
  sessionCount: number;
  /** Coaching bookings in the outgoing batch. */
  bookingCount: number;
  /** Sessions flipped to `synced` — non-empty only on a successful upload. */
  syncedSessionIds: string[];
  /** Bookings flipped to `synced` — non-empty only on a successful upload. */
  syncedBookingIds: string[];
  /** The exact JSON body that was (or would be) POSTed. */
  payload: ClientSyncPushPayload;
  /** Set when the upload could not proceed (offline, HTTP error, fetch missing). */
  error?: string;
}

/** Outcome of a pull-only sync leg. */
export interface SyncPullResult {
  /** True only when the pull request succeeded and was applied locally. */
  ok: boolean;
  /** Coach plans applied. */
  appliedTemplateCount: number;
  /** Booking statuses refreshed. */
  appliedBookingCount: number;
  /** Set when the pull could not proceed (offline, HTTP error, fetch missing). */
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
 * Authenticated headers for a sync request: the bearer token is attached when
 * the device is logged in, so the server scopes push/pull to that account.
 */
async function authHeaders(db: SQLiteDatabase): Promise<Record<string, string>> {
  const session = await getLocalAuthSession(db);
  return session === null ? {} : { Authorization: `Bearer ${session.token}` };
}

/**
 * The sync legs refuse to touch the backend without a login: an unauthenticated
 * device must never download (or upload) another account's data. Returns the
 * session so callers can reuse the token.
 */
async function requireSession(db: SQLiteDatabase): Promise<LocalAuthSession> {
  const session = await getLocalAuthSession(db);
  if (session === null) {
    throw new Error(hu.sync.loginRequired);
  }
  return session;
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
    deviceId: profile.userId || USER_PROFILE_ID,
    profile: payload,
    billingProfile,
    sessions,
    bookings,
  };
}

/**
 * Uploads the client's whole changed state (Push leg only).
 *
 * - `noop`     — nothing to upload and no backend configured.
 * - `dry_run`  — no backend configured, fetch unavailable, or the push failed;
 *                the payload is returned locally and rows stay dirty.
 * - `remote`   — the push succeeded and rows are marked synced.
 *
 * @param baseUrl backend API base URL (e.g. `https://api.alexercise.app/api`);
 *                when omitted/empty the call stays local.
 */
export async function syncPush(
  db: SQLiteDatabase,
  baseUrl?: string | null,
): Promise<SyncPushResult> {
  // Never talk to the backend unauthenticated — a logged-out device must not be
  // able to upload into (or read) another account's scope.
  await requireSession(db);
  const url = normalizeBaseUrl(baseUrl);
  const payload = await buildClientSyncPushPayload(db);
  const base = {
    sessionCount: payload.sessions.length,
    bookingCount: payload.bookings.length,
    syncedSessionIds: [] as string[],
    syncedBookingIds: [] as string[],
    payload,
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
    const pushResponse = await doFetch(`${url}/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(await authHeaders(db)) },
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

    return {
      mode: 'remote',
      sessionCount: syncedSessionIds.length,
      bookingCount: syncedBookingIds.length,
      syncedSessionIds,
      syncedBookingIds,
      payload,
    };
  } catch (cause: unknown) {
    return {
      mode: 'dry_run',
      ...base,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

/**
 * Downloads and applies the coach's changes (Pull leg only). Best-effort: a
 * failure leaves the local graph untouched and reports `ok: false` so the caller
 * can stay silent (the client remains fully usable offline).
 *
 * @param baseUrl backend API base URL; when omitted/empty the call is skipped.
 */
export async function syncPull(
  db: SQLiteDatabase,
  baseUrl?: string | null,
): Promise<SyncPullResult> {
  const url = normalizeBaseUrl(baseUrl);
  const skipped = { ok: false, appliedTemplateCount: 0, appliedBookingCount: 0 };
  if (url.length === 0) {
    return skipped;
  }

  // No local session → no pull. This is what keeps a fresh browser from being
  // auto-filled with (and marking onboarding complete from) someone else's data.
  const session = await getLocalAuthSession(db);
  if (session === null) {
    return { ...skipped, error: hu.sync.loginRequired };
  }

  const doFetch = getFetch();
  if (doFetch === null) {
    return { ...skipped, error: 'A hálózati kliens nem elérhető.' };
  }

  try {
    const pullResponse = await doFetch(`${url}/sync/pull`, {
      method: 'GET',
      headers: { Accept: 'application/json', Authorization: `Bearer ${session.token}` },
    });
    if (!pullResponse.ok) {
      return { ...skipped, error: `A szerver hibát adott vissza (HTTP ${pullResponse.status}).` };
    }
    const pull = await readJson<CoachSyncPullResponse>(pullResponse);
    if (pull === null) {
      return skipped;
    }
    await applyClientSyncPullPayload(db, pull);
    return {
      ok: true,
      appliedTemplateCount: pull.templates.length,
      appliedBookingCount: pull.bookings.length,
    };
  } catch (cause: unknown) {
    return {
      ...skipped,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}

/**
 * Performs a full Push-then-Pull against the coach backend (the manual
 * Szinkronizálás entry point). A failed pull never un-does a successful push.
 *
 * @param baseUrl backend API base URL; when omitted/empty the call stays local.
 */
export async function syncPendingWorkouts(
  db: SQLiteDatabase,
  baseUrl?: string | null,
): Promise<SyncResult> {
  const push = await syncPush(db, baseUrl);

  const shared = {
    sessionCount: push.sessionCount,
    bookingCount: push.bookingCount,
    syncedSessionIds: push.syncedSessionIds,
    syncedBookingIds: push.syncedBookingIds,
    payload: push.payload,
  };

  if (push.mode !== 'remote') {
    return {
      mode: push.mode,
      ...shared,
      appliedTemplateCount: 0,
      appliedBookingCount: 0,
      ...(push.error !== undefined ? { error: push.error } : {}),
    };
  }

  // Best-effort pull: its failure is swallowed so a successful push stands.
  const pull = await syncPull(db, baseUrl);

  return {
    mode: 'remote',
    ...shared,
    appliedTemplateCount: pull.appliedTemplateCount,
    appliedBookingCount: pull.appliedBookingCount,
  };
}
