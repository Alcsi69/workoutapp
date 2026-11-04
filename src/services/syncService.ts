// Phase 4 — offline-first sync service.
//
// Packages every locally dirty session into a single batch payload and uploads
// it. When no backend URL is configured (or the network call fails) it degrades
// to a local export / dry run: the payload is returned for on-device inspection
// and nothing is marked synced.

import type { SQLiteDatabase } from 'expo-sqlite';
import type { SyncBatchPayload } from '../types/workout';
import {
  USER_PROFILE_ID,
  getDirtySessionsPayload,
  markSessionsSynced,
} from '../db/repository';

export type SyncMode = 'dry_run' | 'remote' | 'noop';

export interface SyncResult {
  mode: SyncMode;
  /** Number of sessions in the batch (0 for a noop). */
  sessionCount: number;
  /** Sessions flipped to `synced` — non-empty only on a successful upload. */
  syncedSessionIds: string[];
  /** The exact JSON body that was (or would be) POSTed. */
  payload: SyncBatchPayload;
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
}
type FetchLike = (
  url: string,
  init: { method: string; headers: Record<string, string>; body: string },
) => Promise<FetchResponse>;

function getFetch(): FetchLike | null {
  const candidate = (globalThis as { fetch?: unknown }).fetch;
  return typeof candidate === 'function' ? (candidate as FetchLike) : null;
}

function createBatchId(): string {
  const random = Math.random().toString(36).slice(2, 10);
  return `sync_${Date.now().toString(36)}${random}`;
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
 * Uploads all locally dirty sessions.
 *
 * - `noop`     — nothing to sync (no dirty sessions).
 * - `dry_run`  — no endpoint configured, fetch unavailable, or the request
 *                failed; the payload is returned locally and rows stay dirty.
 * - `remote`   — the POST succeeded and the sessions were marked synced.
 *
 * @param endpointUrl backend URL; when omitted/empty the call stays local.
 */
export async function syncPendingWorkouts(
  db: SQLiteDatabase,
  endpointUrl?: string | null,
): Promise<SyncResult> {
  const payload = await buildSyncBatchPayload(db);

  if (payload.sessions.length === 0) {
    return { mode: 'noop', sessionCount: 0, syncedSessionIds: [], payload };
  }

  const url = endpointUrl?.trim() ?? '';
  if (url.length === 0) {
    // No backend configured — local export mode.
    return {
      mode: 'dry_run',
      sessionCount: payload.sessions.length,
      syncedSessionIds: [],
      payload,
    };
  }

  const doFetch = getFetch();
  if (doFetch === null) {
    return {
      mode: 'dry_run',
      sessionCount: payload.sessions.length,
      syncedSessionIds: [],
      payload,
      error: 'A hálózati kliens nem elérhető.',
    };
  }

  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      return {
        mode: 'dry_run',
        sessionCount: payload.sessions.length,
        syncedSessionIds: [],
        payload,
        error: `A szerver hibát adott vissza (HTTP ${response.status}).`,
      };
    }

    const syncedSessionIds = payload.sessions.map((session) => session.id);
    await markSessionsSynced(db, syncedSessionIds);
    return {
      mode: 'remote',
      sessionCount: syncedSessionIds.length,
      syncedSessionIds,
      payload,
    };
  } catch (cause: unknown) {
    return {
      mode: 'dry_run',
      sessionCount: payload.sessions.length,
      syncedSessionIds: [],
      payload,
      error: cause instanceof Error ? cause.message : String(cause),
    };
  }
}
