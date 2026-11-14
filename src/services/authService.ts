// Phase 7D — username + password accounts.
//
// The server owns credentials (`POST /api/auth/register` / `login`); the device
// only stores the opaque bearer token, the account user id and the display
// username. Registering a brand-new user happens when onboarding finishes;
// upgrading an existing local profile happens from the Profil screen.
//
// Logging in on a fresh browser/PWA/phone applies the account state returned by
// the server (profile, onboarding constraints, billing, workout logs), runs a
// full pull for coach plans/bookings, and regenerates the tailored program so
// the Sablonok tab is never empty.

import type { SQLiteDatabase } from 'expo-sqlite';
import type {
  AuthSessionResponse,
  ClientBillingProfile,
  ClientBillingProfileInput,
  OnboardingPayload,
} from '../types/workout';
import hu from '../i18n/hu';
import {
  clearLocalAuthSession,
  getActiveUserId,
  getClientBillingProfile,
  getLocalAuthSession,
  getSyncServerUrl,
  getUserProfile,
  importSessionLogs,
  rekeyLocalUserData,
  saveClientBillingProfile,
  saveLocalAuthSession,
  saveOnboardingPayload,
  wipeLocalUserData,
} from '../db/repository';
import { syncPull, syncPush } from './syncService';

/** The subset of the Fetch API we rely on (no DOM lib in the verify build). */
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

function normalizeBaseUrl(baseUrl?: string | null): string {
  const trimmed = baseUrl?.trim() ?? '';
  return trimmed.replace(/\/+$/, '');
}

async function readJson(response: FetchResponse): Promise<unknown> {
  if (typeof response.json !== 'function') {
    return null;
  }
  try {
    return await response.json();
  } catch {
    return null;
  }
}

/** Extracts the server's Hungarian `error` field, falling back to a generic one. */
function serverError(body: unknown, fallback: string): string {
  if (body !== null && typeof body === 'object' && !Array.isArray(body)) {
    const error = (body as { error?: unknown }).error;
    if (typeof error === 'string' && error.trim().length > 0) {
      return error;
    }
  }
  return fallback;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/** Parses an auth response body, rejecting anything that is not a session. */
function parseAuthResponse(body: unknown): AuthSessionResponse {
  if (
    !isRecord(body) ||
    typeof body.token !== 'string' ||
    typeof body.userId !== 'string' ||
    typeof body.username !== 'string'
  ) {
    throw new Error(hu.account.errors.unexpected);
  }
  const state = body as unknown as AuthSessionResponse;
  return {
    ...state,
    profile: (state.profile ?? null) as OnboardingPayload | null,
    billingProfile: (state.billingProfile ?? null) as ClientBillingProfile | null,
    sessions: Array.isArray(state.sessions) ? state.sessions : [],
    templates: Array.isArray(state.templates) ? state.templates : [],
    bookings: Array.isArray(state.bookings) ? state.bookings : [],
    slots: Array.isArray(state.slots) ? state.slots : [],
  };
}

export interface RegisterInput {
  username: string;
  password: string;
  /** Attach credentials to this existing local profile (upgrade path). */
  userId?: string;
  /** Onboarding snapshot to persist server-side with the account. */
  profile?: OnboardingPayload;
  billingProfile?: ClientBillingProfileInput | null;
}

export interface LoginInput {
  username: string;
  password: string;
}

/**
 * Validates a NEW account form. Returns a Hungarian message or null when valid.
 * The server re-validates; this is for instant inline feedback.
 */
export function validateNewAccount(
  username: string,
  password: string,
  confirmPassword: string,
): string | null {
  const trimmed = username.trim();
  if (trimmed.length < 3 || trimmed.length > 32) {
    return hu.account.errors.usernameLength;
  }
  if (!/^[\p{L}\p{N}._-]+$/u.test(trimmed)) {
    return hu.account.errors.usernameChars;
  }
  if (password.length < 6) {
    return hu.account.errors.passwordLength;
  }
  if (password !== confirmPassword) {
    return hu.account.errors.passwordMismatch;
  }
  return null;
}

/** Validates an existing-account login form. */
export function validateLogin(username: string, password: string): string | null {
  if (username.trim().length === 0) {
    return hu.account.errors.usernameRequired;
  }
  if (password.length === 0) {
    return hu.account.errors.passwordRequired;
  }
  return null;
}

async function postAuth(
  url: string,
  path: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; body: unknown }> {
  const doFetch = getFetch();
  if (doFetch === null) {
    throw new Error(hu.account.errors.network);
  }
  const response = await doFetch(`${url}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify(body),
  });
  return { ok: response.ok, status: response.status, body: await readJson(response) };
}

/**
 * Creates an account (or attaches credentials to `userId`) and stores the
 * returned session locally. The onboarding/profile snapshot is sent so the
 * server can hold it immediately.
 */
export async function registerAccount(
  db: SQLiteDatabase,
  input: RegisterInput,
  baseUrl?: string | null,
): Promise<AuthSessionResponse> {
  const url = normalizeBaseUrl(baseUrl ?? (await getSyncServerUrl(db)));
  if (url.length === 0) {
    throw new Error(hu.account.errors.noBackend);
  }

  const payload: Record<string, unknown> = {
    username: input.username.trim(),
    password: input.password,
  };
  if (input.userId !== undefined) {
    payload.userId = input.userId;
  }
  if (input.profile !== undefined) {
    payload.profile = input.profile;
  }
  if (input.billingProfile !== undefined && input.billingProfile !== null) {
    payload.billingProfile = input.billingProfile;
  }

  const result = await postAuth(url, '/auth/register', payload);
  if (!result.ok) {
    throw new Error(serverError(result.body, hu.account.errors.registerFailed));
  }

  const state = parseAuthResponse(result.body);

  // The server is authoritative for the account id. Registering from a device
  // that already holds local data usually keeps that id (Case A), but when the
  // id is already claimed by another account the server mints a fresh one
  // (Case B — pre-isolation devices all shared `usr_local`). Re-bind the local
  // owner-scoped rows BEFORE saving the session and before any push/pull, so
  // the profile, billing record and bookings follow the new account instead of
  // being orphaned under the old id.
  const previousUserId = await getActiveUserId(db);
  if (state.userId !== previousUserId) {
    await rekeyLocalUserData(db, previousUserId, state.userId);
  }

  await saveLocalAuthSession(db, {
    userId: state.userId,
    username: state.username,
    token: state.token,
  });
  return state;
}

/**
 * Logs in against the backend, saves the session, then hydrates the local
 * database with the account's profile, billing, workout logs and coach plans.
 * On failure the partial session is removed so the device is not left half
 * logged in.
 */
export async function loginWithCredentials(
  db: SQLiteDatabase,
  input: LoginInput,
  baseUrl?: string | null,
): Promise<AuthSessionResponse> {
  const url = normalizeBaseUrl(baseUrl ?? (await getSyncServerUrl(db)));
  if (url.length === 0) {
    throw new Error(hu.account.errors.noBackend);
  }

  const result = await postAuth(url, '/auth/login', {
    username: input.username.trim(),
    password: input.password,
  });
  if (!result.ok) {
    throw new Error(serverError(result.body, hu.account.errors.loginFailed));
  }

  const state = parseAuthResponse(result.body);
  if (state.profile === null) {
    // Credentials exist but no onboarding snapshot was ever synced.
    throw new Error(hu.account.errors.noProfile);
  }

  // Never let one account's local rows mix into another's session: wipe the
  // device whenever the incoming account differs from the local owner (a real
  // account switch, or leftover pre-auth data belonging to a different id).
  const previousSession = await getLocalAuthSession(db);
  const localOwner = await getActiveUserId(db);
  const switchingAccount =
    previousSession !== null
      ? previousSession.userId !== state.userId
      : localOwner !== state.userId && (await getUserProfile(db)) !== null;
  if (switchingAccount) {
    await wipeLocalUserData(db);
  }

  await saveLocalAuthSession(db, {
    userId: state.userId,
    username: state.username,
    token: state.token,
  });

  try {
    await saveOnboardingPayload(db, { ...state.profile, userId: state.userId });
    if (state.billingProfile !== null) {
      await saveClientBillingProfile(db, {
        ...state.billingProfile,
        userId: state.userId,
      });
    }
    await importSessionLogs(db, state.sessions);

    // Full pull reconciles coach plans/bookings and (re)applies the snapshot.
    // Coach-assigned plans land here; the client no longer auto-generates one.
    await syncPull(db, url);
  } catch (cause: unknown) {
    await clearLocalAuthSession(db);
    throw cause;
  }

  return state;
}

/**
 * Upgrade path: secures an existing (pre-auth) local profile with a username +
 * password without losing any local data. The local user id is kept unless the
 * server already sees it owned by another account, in which case the server
 * returns a fresh id and `registerAccount` re-binds the device to it.
 */
export async function upgradeAccount(
  db: SQLiteDatabase,
  username: string,
  password: string,
): Promise<AuthSessionResponse> {
  const profile = await getUserProfile(db);
  if (profile === null) {
    throw new Error(hu.account.errors.noProfile);
  }
  const billing = await getClientBillingProfile(db, profile.userId);
  const { onboardingCompletedAt: _completedAt, updatedAt: _updatedAt, ...payload } = profile;

  return registerAccount(
    db,
    {
      username,
      password,
      userId: profile.userId,
      profile: payload,
      billingProfile: billing,
    },
    undefined,
  );
}

/**
 * Logs out: best-effort push of local changes, then wipes all local user data
 * and the session. The caller routes back to the welcome/login screen.
 */
export async function logoutAccount(db: SQLiteDatabase): Promise<void> {
  try {
    const url = await getSyncServerUrl(db);
    if (url.length > 0 && (await getLocalAuthSession(db)) !== null) {
      await syncPush(db, url);
    }
  } catch {
    // Best-effort: never block logout on a network failure.
  }
  await wipeLocalUserData(db);
}