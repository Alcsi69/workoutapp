// The coach REST API + static admin surface.
//
// One request handler, no framework: routing is a handful of regex matches over
// `node:http`'s request/response. Everything is synchronous SQLite access behind
// small helpers, so there is no async plumbing beyond reading the request body.

import type { IncomingMessage, ServerResponse } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import type {
  AuthSessionResponse,
  ClientBillingProfile,
  ClientSyncPushPayload,
  CoachingBooking,
  CoachingBookingStatus,
  CoachingModality,
  CoachingSlot,
  CoachSyncPullResponse,
  ExerciseCatalogItem,
  OnboardingPayload,
  SessionType,
  TrainingGoal,
  WorkoutSessionLog,
  WorkoutTemplate,
  WorkoutTemplateExercise,
} from './types';
import { EXERCISE_CATALOG } from './catalog';
import { allRows, firstRow, runSql, type ServerDb, type SqlParam } from './db';
import {
  createAuthToken,
  hashPassword,
  normalizeUsername,
  tokensMatch,
  usernameKey,
  validatePassword,
  validateUsername,
  verifyPassword,
} from './auth';

const CATALOG_BY_ID = new Map<string, ExerciseCatalogItem>(
  EXERCISE_CATALOG.map((item) => [item.id, item]),
);

const MAX_BODY_BYTES = 5 * 1024 * 1024;

// --- Row shapes -------------------------------------------------------------

interface ClientRow {
  user_id: string;
  locale: string;
  profile_json: string;
  billing_json: string | null;
  created_at: string;
  updated_at: string;
}

/** A login credential row (see server/src/db.ts). */
interface CredentialRow {
  user_id: string;
  username: string;
  username_key: string;
  password_salt: string;
  password_hash: string;
  created_at: string;
  updated_at: string;
}

interface AuthTokenRow {
  token: string;
  user_id: string;
  created_at: string;
  expires_at: string;
}

interface TemplateRow {
  id: string;
  user_id: string;
  title: string;
  session_type: string;
  goal: string | null;
  coach_note: string | null;
  assigned_at: string;
  created_at: string;
  blocks_json: string;
}

interface SessionRow {
  id: string;
  user_id: string;
  session_type: string;
  title: string;
  started_at: string;
  completed_at: string | null;
  sync_status: string;
  payload_json: string;
}

interface SlotRow {
  id: string;
  starts_at: string;
  ends_at: string;
  modality: string;
  location_or_link: string;
  is_booked: number;
  created_at: string;
}

interface BookingRow {
  id: string;
  slot_id: string;
  user_id: string;
  modality: string;
  starts_at: string;
  ends_at: string;
  location_or_link: string;
  client_notes: string | null;
  coach_notes: string | null;
  status: string;
  sync_status: string;
  created_at: string;
}

/** One block as stored in `coach_templates.blocks_json`. */
interface StoredBlock {
  orderIndex: number;
  exerciseId: string;
  restSeconds: number;
  notes?: string;
  targetSets?: number;
  targetReps?: string;
  substitutedFromExerciseId?: string;
}

/** Thrown by handlers to short-circuit with an HTTP status + message. */
class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export type HttpHandler = (req: IncomingMessage, res: ServerResponse) => void;

export interface AppOptions {
  /** Absolute path to the static admin web (served at /admin). */
  adminDir?: string | null;
  /**
   * Secret required as `Authorization: Bearer <token>` on every `/api/admin/*`
   * call. Resolved from this option, then the `ADMIN_TOKEN` env var; when neither
   * is set the caller (server.ts) supplies a random per-boot token.
   */
  adminToken?: string | null;
  /**
   * Origins allowed to call the API from a browser. `'*'` disables the allowlist
   * check entirely. Defaults to the production web app + local dev servers;
   * override with the `CORS_ORIGINS` env var (comma-separated).
   */
  allowedOrigins?: string[] | '*' | null;
}

/** Origins a browser client is allowed to sync from when nothing is configured. */
const DEFAULT_ALLOWED_ORIGINS = [
  'https://alexercise.app',
  'https://www.alexercise.app',
  'https://api.alexercise.app',
  'http://localhost:8081',
  'http://localhost:19006',
];

/** Reads `CORS_ORIGINS` (comma-separated) and falls back to the defaults. */
function resolveAllowedOrigins(explicit?: string[] | '*' | null): string[] | '*' {
  if (explicit === '*') {
    return '*';
  }
  if (Array.isArray(explicit)) {
    return explicit;
  }
  const fromEnv = process.env.CORS_ORIGINS;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv
      .split(',')
      .map((entry) => entry.trim().replace(/\/+$/, ''))
      .filter((entry) => entry.length > 0);
  }
  return DEFAULT_ALLOWED_ORIGINS;
}

/**
 * Resolves the coach admin token: explicit option, then `ADMIN_TOKEN` from the
 * environment, else a random per-boot token (logged so the coach can paste it
 * into the admin web once). The admin API is therefore never left unauthenticated.
 */
export function resolveAdminToken(explicit?: string | null): string {
  if (typeof explicit === 'string' && explicit.trim().length > 0) {
    return explicit.trim();
  }
  const fromEnv = process.env.ADMIN_TOKEN;
  if (typeof fromEnv === 'string' && fromEnv.trim().length > 0) {
    return fromEnv.trim();
  }
  const generated = createAuthToken();
  console.warn(
    '[admin] ADMIN_TOKEN is not set — using a per-boot coach admin token. ' +
      'Set ADMIN_TOKEN for a stable value. Token:',
    generated,
  );
  return generated;
}

// --- Small helpers ----------------------------------------------------------

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

function asRecord(value: unknown): Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpError(400, 'Érvénytelen kérés törzs.');
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, field: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new HttpError(400, `Hiányzó vagy hibás mező: ${field}.`);
  }
  return value;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim().length > 0 ? value : undefined;
}

function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (chunk: Buffer) => {
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        reject(new HttpError(413, 'A kérés törzse túl nagy.'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (size === 0) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new HttpError(400, 'Érvénytelen JSON a kérés törzsében.'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  res.end(payload);
}

// --- Domain mapping ---------------------------------------------------------

/** Falls back to a minimal catalog entry for an unknown exercise id. */
function hydrateExercise(exerciseId: string): ExerciseCatalogItem {
  const found = CATALOG_BY_ID.get(exerciseId);
  if (found !== undefined) {
    return found;
  }
  return {
    id: exerciseId,
    nameHu: exerciseId,
    nameEn: exerciseId,
    category: 'isolation',
    equipment: 'barbell',
    movementPattern: 'other',
    primaryMuscles: [],
    axialLoadScore: 1,
    kneeStressScore: 1,
    defaultSubstituteIds: [],
    isCustom: true,
  };
}

function toWorkoutTemplate(row: TemplateRow): WorkoutTemplate {
  let stored: StoredBlock[] = [];
  try {
    stored = JSON.parse(row.blocks_json) as StoredBlock[];
  } catch {
    stored = [];
  }

  const exercises: WorkoutTemplateExercise[] = stored
    .slice()
    .sort((left, right) => left.orderIndex - right.orderIndex)
    .map((block, index) => {
      const mapped: WorkoutTemplateExercise = {
        id: `${row.id}:${index}`,
        templateId: row.id,
        orderIndex: index,
        exerciseId: block.exerciseId,
        restSeconds: block.restSeconds,
        exercise: hydrateExercise(block.exerciseId),
      };
      if (block.substitutedFromExerciseId !== undefined) {
        mapped.substitutedFromExerciseId = block.substitutedFromExerciseId;
      }
      if (block.notes !== undefined) {
        mapped.notes = block.notes;
      }
      if (block.targetSets !== undefined) {
        mapped.targetSets = block.targetSets;
      }
      if (block.targetReps !== undefined) {
        mapped.targetReps = block.targetReps;
      }
      return mapped;
    });

  const template: WorkoutTemplate = {
    id: row.id,
    title: row.title,
    sessionType: row.session_type as SessionType,
    source: 'coach',
    createdAt: row.created_at,
    assignedAt: row.assigned_at,
    exercises,
  };
  if (row.goal !== null) {
    template.goal = row.goal as TrainingGoal;
  }
  if (row.coach_note !== null && row.coach_note.length > 0) {
    template.coachNote = row.coach_note;
  }
  return template;
}

function toSlot(row: SlotRow): CoachingSlot {
  return {
    id: row.id,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    modality: row.modality as CoachingModality,
    locationOrLink: row.location_or_link,
    isBooked: row.is_booked === 1,
  };
}

function toBooking(row: BookingRow): CoachingBooking {
  const booking: CoachingBooking = {
    id: row.id,
    slotId: row.slot_id,
    userId: row.user_id,
    modality: row.modality as CoachingModality,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    locationOrLink: row.location_or_link,
    status: row.status as CoachingBookingStatus,
    syncStatus: 'synced',
    createdAt: row.created_at,
  };
  if (row.client_notes !== null && row.client_notes.length > 0) {
    booking.clientNotes = row.client_notes;
  }
  if (row.coach_notes !== null && row.coach_notes.length > 0) {
    booking.coachNotes = row.coach_notes;
  }
  return booking;
}

function parseBilling(raw: string | null): ClientBillingProfile | null {
  if (raw === null) {
    return null;
  }
  try {
    return JSON.parse(raw) as ClientBillingProfile;
  } catch {
    return null;
  }
}

function parseProfile(raw: string): OnboardingPayload | null {
  try {
    return JSON.parse(raw) as OnboardingPayload;
  } catch {
    return null;
  }
}

// --- Query helpers ----------------------------------------------------------

function getClient(db: ServerDb, userId: string): ClientRow | null {
  return firstRow<ClientRow>(db, 'SELECT * FROM clients WHERE user_id = ? LIMIT 1;', [userId]);
}

function listClients(db: ServerDb): ClientRow[] {
  return allRows<ClientRow>(db, 'SELECT * FROM clients ORDER BY updated_at DESC;');
}

function listTemplates(db: ServerDb, userId: string): WorkoutTemplate[] {
  return allRows<TemplateRow>(
    db,
    'SELECT * FROM coach_templates WHERE user_id = ? ORDER BY assigned_at DESC, created_at DESC;',
    [userId],
  ).map(toWorkoutTemplate);
}

function listSessions(db: ServerDb, userId: string): WorkoutSessionLog[] {
  return allRows<SessionRow>(
    db,
    'SELECT * FROM workout_sessions WHERE user_id = ? ORDER BY started_at DESC;',
    [userId],
  ).map((row) => JSON.parse(row.payload_json) as WorkoutSessionLog);
}

function listBookings(db: ServerDb, userId: string): CoachingBooking[] {
  return allRows<BookingRow>(
    db,
    'SELECT * FROM coaching_bookings WHERE user_id = ? ORDER BY starts_at;',
    [userId],
  ).map(toBooking);
}

function listOpenSlots(db: ServerDb, now: string): CoachingSlot[] {
  return allRows<SlotRow>(
    db,
    'SELECT * FROM coaching_slots WHERE is_booked = 0 AND starts_at >= ? ORDER BY starts_at;',
    [now],
  ).map(toSlot);
}

// --- Auth helpers -----------------------------------------------------------

/** How long an issued bearer token stays valid. */
const TOKEN_TTL_MS = 180 * 24 * 60 * 60 * 1000;

function getCredentialByKey(db: ServerDb, key: string): CredentialRow | null {
  return firstRow<CredentialRow>(
    db,
    'SELECT * FROM client_credentials WHERE username_key = ? LIMIT 1;',
    [key],
  );
}

function getCredentialByUserId(db: ServerDb, userId: string): CredentialRow | null {
  return firstRow<CredentialRow>(
    db,
    'SELECT * FROM client_credentials WHERE user_id = ? LIMIT 1;',
    [userId],
  );
}

/** Issues a fresh opaque bearer token for a user, prunes that user's expired ones. */
function issueToken(db: ServerDb, userId: string): string {
  const now = nowIso();
  const token = createAuthToken();
  const expiresAt = new Date(Date.now() + TOKEN_TTL_MS).toISOString();
  runSql(db, 'DELETE FROM auth_tokens WHERE expires_at <= ?;', [now]);
  runSql(
    db,
    `INSERT INTO auth_tokens (token, user_id, created_at, expires_at)
     VALUES (?, ?, ?, ?);`,
    [token, userId, now, expiresAt],
  );
  return token;
}

/**
 * Resolves the authenticated user id from an `Authorization: Bearer <token>`
 * header. The token is the ONLY source of the caller's identity — a userId in
 * the body or query string is never trusted for authorization. Missing, expired
 * or unknown tokens are rejected with 401.
 */
function requireAuthUserId(db: ServerDb, req: IncomingMessage): string {
  const header = req.headers.authorization;
  if (typeof header !== 'string' || header.trim().length === 0) {
    throw new HttpError(401, 'Bejelentkezés szükséges.');
  }
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (match === null) {
    throw new HttpError(401, 'Érvénytelen hitelesítési fejléc.');
  }
  const token = match[1].trim();
  const row = firstRow<AuthTokenRow>(
    db,
    'SELECT * FROM auth_tokens WHERE token = ? AND expires_at > ? LIMIT 1;',
    [token, nowIso()],
  );
  if (row === null) {
    throw new HttpError(401, 'A bejelentkezés lejárt — jelentkezz be újra.');
  }
  return row.user_id;
}

/** Verifies the coach admin bearer token (constant-time). */
function requireAdminToken(req: IncomingMessage, expected: string): void {
  const header = req.headers.authorization;
  const match = typeof header === 'string' ? /^Bearer\s+(.+)$/i.exec(header.trim()) : null;
  if (match === null || !tokensMatch(match[1].trim(), expected)) {
    throw new HttpError(401, 'Az edzői admin felülethez érvényes token szükséges.');
  }
}

/** Builds the full account state returned by register/login and the pull leg. */
function buildAccountState(db: ServerDb, userId: string): Omit<AuthSessionResponse, 'token' | 'username'> {
  const client = getClient(db, userId);
  return {
    userId,
    profile: client === null ? null : parseProfile(client.profile_json),
    billingProfile: client === null ? null : parseBilling(client.billing_json),
    sessions: listSessions(db, userId),
    templates: listTemplates(db, userId),
    bookings: listBookings(db, userId),
    slots: listOpenSlots(db, nowIso()),
  };
}

function buildAuthResponse(
  db: ServerDb,
  credential: CredentialRow,
  token: string,
): AuthSessionResponse {
  return {
    token,
    username: credential.username,
    ...buildAccountState(db, credential.user_id),
  };
}

/** Stores a profile payload sent alongside auth/push, scoped to `userId`. */
function storeProfileSnapshot(
  db: ServerDb,
  userId: string,
  profile: OnboardingPayload,
  billingProfile: ClientBillingProfile | null | undefined,
): void {
  const now = nowIso();
  const existing = getClient(db, userId);
  const createdAt = existing?.created_at ?? now;
  const billingJson =
    billingProfile !== undefined && billingProfile !== null
      ? JSON.stringify({ ...billingProfile, userId })
      : (existing?.billing_json ?? null);

  runSql(
    db,
    `INSERT INTO clients (user_id, locale, profile_json, billing_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       locale = excluded.locale,
       profile_json = excluded.profile_json,
       billing_json = excluded.billing_json,
       updated_at = excluded.updated_at;`,
    [
      userId,
      profile.locale ?? 'hu',
      JSON.stringify({ ...profile, userId }),
      billingJson,
      createdAt,
      now,
    ],
  );
}

// --- Push / Pull ------------------------------------------------------------

function handlePush(db: ServerDb, body: unknown, authUserId: string): unknown {
  const payload = asRecord(body) as unknown as ClientSyncPushPayload;
  const profile = payload.profile;
  if (profile === null || typeof profile !== 'object') {
    throw new HttpError(400, 'Hiányzó onboarding profil a push csomagban.');
  }
  // The authenticated user id is authoritative: any userId/deviceId in the body
  // is ignored, so one account can never read or overwrite another's rows.
  const userId = authUserId;
  const now = nowIso();

  const existing = getClient(db, userId);
  const createdAt = existing?.created_at ?? now;
  const billingJson =
    payload.billingProfile !== undefined && payload.billingProfile !== null
      ? JSON.stringify(payload.billingProfile)
      : (existing?.billing_json ?? null);

  runSql(
    db,
    `INSERT INTO clients (user_id, locale, profile_json, billing_json, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       locale = excluded.locale,
       profile_json = excluded.profile_json,
       billing_json = excluded.billing_json,
       updated_at = excluded.updated_at;`,
    [
      userId,
      profile.locale ?? 'hu',
      JSON.stringify({ ...profile, userId }),
      billingJson,
      createdAt,
      now,
    ],
  );

  const sessions = Array.isArray(payload.sessions) ? payload.sessions : [];
  for (const session of sessions) {
    runSql(
      db,
      `INSERT INTO workout_sessions
         (id, user_id, session_type, title, started_at, completed_at, sync_status, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         session_type = excluded.session_type,
         title = excluded.title,
         started_at = excluded.started_at,
         completed_at = excluded.completed_at,
         sync_status = excluded.sync_status,
         payload_json = excluded.payload_json;`,
      [
        session.id,
        userId,
        session.sessionType,
        session.title,
        session.startedAt,
        session.completedAt ?? null,
        session.syncStatus ?? 'synced',
        JSON.stringify(session),
      ],
    );
  }

  const bookings = Array.isArray(payload.bookings) ? payload.bookings : [];
  for (const booking of bookings) {
    // A client push never overwrites a coach decision: only the client-authored
    // fields (notes, slot window) and the request row itself are (re)written.
    runSql(
      db,
      `INSERT INTO coaching_bookings
         (id, slot_id, user_id, modality, starts_at, ends_at, location_or_link,
          client_notes, coach_notes, status, sync_status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, 'synced', ?)
       ON CONFLICT(id) DO UPDATE SET
         slot_id = excluded.slot_id,
         modality = excluded.modality,
         starts_at = excluded.starts_at,
         ends_at = excluded.ends_at,
         location_or_link = excluded.location_or_link,
         client_notes = excluded.client_notes,
         sync_status = 'synced';`,
      [
        booking.id,
        booking.slotId,
        userId,
        booking.modality,
        booking.startsAt,
        booking.endsAt,
        booking.locationOrLink,
        booking.clientNotes ?? null,
        booking.status ?? 'pending',
        booking.createdAt ?? now,
      ],
    );
  }

  return { ok: true, userId, sessions: sessions.length, bookings: bookings.length };
}

function handlePull(db: ServerDb, userId: string): CoachSyncPullResponse {
  const client = getClient(db, userId);
  return {
    syncId: createId('sync_pull'),
    generatedAt: nowIso(),
    userId,
    templates: listTemplates(db, userId),
    bookings: listBookings(db, userId),
    slots: listOpenSlots(db, nowIso()),
    profile: client === null ? null : parseProfile(client.profile_json),
    billingProfile: client === null ? null : parseBilling(client.billing_json),
    sessions: listSessions(db, userId),
  };
}

// --- Auth: register / login -------------------------------------------------

/** Shared validation + persistence for a new or upgraded credential. */
function handleRegister(db: ServerDb, body: unknown): AuthSessionResponse {
  const input = asRecord(body);
  const username = normalizeUsername(asString(input.username, 'username'));
  const password = asString(input.password, 'password');

  const usernameError = validateUsername(username);
  if (usernameError !== null) {
    throw new HttpError(400, usernameError);
  }
  const passwordError = validatePassword(password);
  if (passwordError !== null) {
    throw new HttpError(400, passwordError);
  }

  const key = usernameKey(username);
  const takenBy = getCredentialByKey(db, key);
  // A request may attach credentials to an existing local user id (the upgrade
  // path for profiles created before auth existed). Otherwise a new id is minted.
  const userId = optionalString(input.userId) ?? createId('usr');

  if (takenBy !== null && takenBy.user_id !== userId) {
    throw new HttpError(409, 'Ez a felhasználónév már foglalt.');
  }
  const existingForUser = getCredentialByUserId(db, userId);
  if (existingForUser !== null) {
    // Never overwrite an existing password without proving ownership: the user
    // must log in instead (login issues a fresh token).
    throw new HttpError(409, 'Ez a fiók már rendelkezik bejelentkezéssel — jelentkezz be.');
  }

  const now = nowIso();
  const passwordHash = hashPassword(password);
  runSql(
    db,
    `INSERT INTO client_credentials
       (user_id, username, username_key, password_salt, password_hash, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(user_id) DO UPDATE SET
       username = excluded.username,
       username_key = excluded.username_key,
       password_salt = excluded.password_salt,
       password_hash = excluded.password_hash,
       updated_at = excluded.updated_at;`,
    [userId, username, key, passwordHash.salt, passwordHash.hash, now, now],
  );

  // Optional onboarding snapshot sent with the registration (new user finishing
  // onboarding, or an existing user securing their account from Profil).
  const profile = input.profile;
  if (profile !== null && typeof profile === 'object' && !Array.isArray(profile)) {
    storeProfileSnapshot(
      db,
      userId,
      profile as OnboardingPayload,
      (input.billingProfile as ClientBillingProfile | null | undefined) ?? null,
    );
  }

  const credential = getCredentialByUserId(db, userId);
  if (credential === null) {
    throw new HttpError(500, 'A fiók létrehozása sikertelen.');
  }
  const token = issueToken(db, userId);
  return buildAuthResponse(db, credential, token);
}

function handleLogin(db: ServerDb, body: unknown): AuthSessionResponse {
  const input = asRecord(body);
  const username = asString(input.username, 'username');
  const password = asString(input.password, 'password');

  const credential = getCredentialByKey(db, usernameKey(username));
  if (
    credential === null ||
    !verifyPassword(password, credential.password_salt, credential.password_hash)
  ) {
    // Same message for unknown user and wrong password: never reveal which.
    throw new HttpError(401, 'Hibás felhasználónév vagy jelszó.');
  }

  const token = issueToken(db, credential.user_id);
  return buildAuthResponse(db, credential, token);
}

// --- Admin: clients ---------------------------------------------------------

interface ClientSummary {
  userId: string;
  username: string | null;
  locale: string;
  fullName: string | null;
  biometrics: OnboardingPayload['biometrics'] | null;
  primaryGoal: TrainingGoal | null;
  equipment: string | null;
  jointConstraints: OnboardingPayload['constraints']['jointLimitations'];
  billing: ClientBillingProfile | null;
  sessionCount: number;
  completedSessionCount: number;
  assignedTemplateCount: number;
  bookingCount: number;
  updatedAt: string;
}

function toClientSummary(db: ServerDb, row: ClientRow): ClientSummary {
  const profile = parseProfile(row.profile_json);
  const billing = parseBilling(row.billing_json);
  const sessions = allRows<{ completed: number | null }>(
    db,
    'SELECT completed_at AS completed FROM workout_sessions WHERE user_id = ?;',
    [row.user_id],
  );
  return {
    userId: row.user_id,
    username: getCredentialByUserId(db, row.user_id)?.username ?? null,
    locale: row.locale,
    fullName: billing?.fullName ?? null,
    biometrics: profile?.biometrics ?? null,
    primaryGoal: profile?.trainingProfile.primaryGoal ?? null,
    equipment: profile?.trainingProfile.equipment ?? null,
    jointConstraints: profile?.constraints.jointLimitations ?? [],
    billing,
    sessionCount: sessions.length,
    completedSessionCount: sessions.filter((s) => s.completed !== null).length,
    assignedTemplateCount: listTemplates(db, row.user_id).length,
    bookingCount: listBookings(db, row.user_id).length,
    updatedAt: row.updated_at,
  };
}

// --- Admin: invoice export --------------------------------------------------

interface InvoiceExport {
  generatedAt: string;
  userId: string;
  period: { from: string | null; to: string | null };
  billing: ClientBillingProfile | null;
  sessionCount: number;
  sessions: { id: string; title: string; completedAt: string; sessionType: string }[];
}

function buildInvoiceExport(db: ServerDb, row: ClientRow, from: string | null, to: string | null): InvoiceExport {
  const completed = allRows<SessionRow>(
    db,
    `SELECT * FROM workout_sessions
     WHERE user_id = ? AND completed_at IS NOT NULL
       AND (? IS NULL OR completed_at >= ?)
       AND (? IS NULL OR completed_at <= ?)
     ORDER BY completed_at;`,
    [row.user_id, from, from, to, to],
  );
  return {
    generatedAt: nowIso(),
    userId: row.user_id,
    period: { from, to },
    billing: parseBilling(row.billing_json),
    sessionCount: completed.length,
    sessions: completed.map((s) => ({
      id: s.id,
      title: s.title,
      completedAt: s.completed_at ?? s.started_at,
      sessionType: s.session_type,
    })),
  };
}

/** Escapes a CSV cell (semicolon-delimited; Hungarian Excel default). */
function csvCell(value: string): string {
  if (/[";\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function invoiceCsv(exportData: InvoiceExport): string {
  const billing = exportData.billing;
  const header = [
    'Számlázási név',
    'Irányítószám',
    'Település',
    'Utca, házszám',
    'Adószám',
    'Email',
    'Telefon',
    'Teljesítés dátuma',
    'Megnevezés',
  ];
  const rows: string[][] = [];
  if (exportData.sessions.length === 0) {
    rows.push([
      billing?.billingName ?? '',
      billing?.billingZip ?? '',
      billing?.billingCity ?? '',
      billing?.billingAddress ?? '',
      billing?.taxNumber ?? '',
      billing?.email ?? '',
      billing?.phone ?? '',
      '',
      '',
    ]);
  } else {
    for (const session of exportData.sessions) {
      rows.push([
        billing?.billingName ?? '',
        billing?.billingZip ?? '',
        billing?.billingCity ?? '',
        billing?.billingAddress ?? '',
        billing?.taxNumber ?? '',
        billing?.email ?? '',
        billing?.phone ?? '',
        session.completedAt,
        session.title,
      ]);
    }
  }
  return [header, ...rows].map((line) => line.map(csvCell).join(';')).join('\r\n') + '\r\n';
}

// --- Admin: templates -------------------------------------------------------

function handleCreateTemplate(db: ServerDb, userId: string, body: unknown): WorkoutTemplate {
  const input = asRecord(body);
  const title = asString(input.title, 'title');
  const sessionType = (optionalString(input.sessionType) ?? 'strength') as SessionType;
  const rawBlocks = input.blocks;
  if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
    throw new HttpError(400, 'A sablonhoz legalább egy gyakorlat szükséges.');
  }

  const blocks: StoredBlock[] = rawBlocks.map((raw, index) => {
    const block = asRecord(raw);
    const exerciseId = asString(block.exerciseId, 'blocks[].exerciseId');
    if (!CATALOG_BY_ID.has(exerciseId)) {
      throw new HttpError(400, `Ismeretlen gyakorlat: "${exerciseId}".`);
    }
    const stored: StoredBlock = {
      orderIndex: index,
      exerciseId,
      restSeconds:
        typeof block.restSeconds === 'number' ? block.restSeconds : 90,
    };
    const notes = optionalString(block.notes);
    if (notes !== undefined) stored.notes = notes;
    if (typeof block.targetSets === 'number') stored.targetSets = block.targetSets;
    const targetReps = optionalString(block.targetReps);
    if (targetReps !== undefined) stored.targetReps = targetReps;
    return stored;
  });

  const id = optionalString(input.id) ?? createId('tpl_coach');
  const now = nowIso();
  const existing = firstRow<{ created_at: string }>(
    db,
    'SELECT created_at FROM coach_templates WHERE id = ? LIMIT 1;',
    [id],
  );
  const createdAt = existing?.created_at ?? now;
  const goal = optionalString(input.goal) ?? null;
  const coachNote = optionalString(input.coachNote) ?? null;

  runSql(
    db,
    `INSERT INTO coach_templates
       (id, user_id, title, session_type, goal, coach_note, assigned_at, created_at, blocks_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       user_id = excluded.user_id,
       title = excluded.title,
       session_type = excluded.session_type,
       goal = excluded.goal,
       coach_note = excluded.coach_note,
       assigned_at = excluded.assigned_at,
       blocks_json = excluded.blocks_json;`,
    [id, userId, title, sessionType, goal, coachNote, now, createdAt, JSON.stringify(blocks)],
  );

  const template = listTemplates(db, userId).find((entry) => entry.id === id);
  if (template === undefined) {
    throw new HttpError(500, 'A sablon mentése sikertelen.');
  }
  return template;
}

function handleDeleteTemplate(db: ServerDb, templateId: string): { deleted: boolean } {
  const result = db.prepare('DELETE FROM coach_templates WHERE id = ?;').run(templateId);
  return { deleted: Number(result.changes) > 0 };
}

// --- Admin: slots & bookings ------------------------------------------------

function handleCreateSlot(db: ServerDb, body: unknown): CoachingSlot {
  const input = asRecord(body);
  const startsAt = asString(input.startsAt, 'startsAt');
  const endsAt = asString(input.endsAt, 'endsAt');
  const modality = asString(input.modality, 'modality') as CoachingModality;
  if (modality !== 'online_call' && modality !== 'irl_gym') {
    throw new HttpError(400, 'Érvénytelen modalitás (online_call | irl_gym).');
  }
  const locationOrLink = optionalString(input.locationOrLink) ?? '';
  const id = optionalString(input.id) ?? createId('slot');
  runSql(
    db,
    `INSERT INTO coaching_slots
       (id, starts_at, ends_at, modality, location_or_link, is_booked, created_at)
     VALUES (?, ?, ?, ?, ?, 0, ?)
     ON CONFLICT(id) DO UPDATE SET
       starts_at = excluded.starts_at,
       ends_at = excluded.ends_at,
       modality = excluded.modality,
       location_or_link = excluded.location_or_link;`,
    [id, startsAt, endsAt, modality, locationOrLink, nowIso()],
  );
  const slot = firstRow<SlotRow>(db, 'SELECT * FROM coaching_slots WHERE id = ? LIMIT 1;', [id]);
  if (slot === null) {
    throw new HttpError(500, 'Az időpont mentése sikertelen.');
  }
  return toSlot(slot);
}

function handleDeleteSlot(db: ServerDb, slotId: string): { deleted: boolean } {
  // Free the slot's bookings first so a deleted slot never strands a booking.
  runSql(db, 'UPDATE coaching_bookings SET status = ? WHERE slot_id = ?;', ['cancelled', slotId]);
  const result = db.prepare('DELETE FROM coaching_slots WHERE id = ?;').run(slotId);
  return { deleted: Number(result.changes) > 0 };
}

function handlePatchBooking(db: ServerDb, bookingId: string, body: unknown): CoachingBooking {
  const input = asRecord(body);
  const row = firstRow<BookingRow>(
    db,
    'SELECT * FROM coaching_bookings WHERE id = ? LIMIT 1;',
    [bookingId],
  );
  if (row === null) {
    throw new HttpError(404, 'Ismeretlen foglalás.');
  }

  const status = optionalString(input.status) ?? row.status;
  if (
    status !== 'pending' &&
    status !== 'confirmed' &&
    status !== 'completed' &&
    status !== 'cancelled'
  ) {
    throw new HttpError(400, 'Érvénytelen státusz.');
  }
  const coachNotes = optionalString(input.coachNotes) ?? row.coach_notes;
  const locationOrLink = optionalString(input.locationOrLink) ?? row.location_or_link;

  runSql(
    db,
    `UPDATE coaching_bookings
       SET status = ?, coach_notes = ?, location_or_link = ?, sync_status = 'synced'
     WHERE id = ?;`,
    [status, coachNotes, locationOrLink, bookingId],
  );
  // Keep the slot's booked flag in step with the booking's status.
  runSql(db, 'UPDATE coaching_slots SET is_booked = ? WHERE id = ?;', [
    status === 'cancelled' ? 0 : 1,
    row.slot_id,
  ]);

  const updated = firstRow<BookingRow>(
    db,
    'SELECT * FROM coaching_bookings WHERE id = ? LIMIT 1;',
    [bookingId],
  );
  if (updated === null) {
    throw new HttpError(500, 'A foglalás frissítése sikertelen.');
  }
  return toBooking(updated);
}

// --- Routing ----------------------------------------------------------------

function serveStatic(res: ServerResponse, adminDir: string, relPath: string): boolean {
  const safe = normalize(relPath).replace(/^(\.\.[/\\])+/, '');
  const filePath = join(adminDir, safe);
  if (!filePath.startsWith(adminDir)) {
    return false;
  }
  if (!existsSync(filePath) || !statSync(filePath).isFile()) {
    return false;
  }
  const type =
    extname(filePath) === '.css'
      ? 'text/css; charset=utf-8'
      : extname(filePath) === '.js'
        ? 'text/javascript; charset=utf-8'
        : extname(filePath) === '.html'
          ? 'text/html; charset=utf-8'
          : 'application/octet-stream';
  const content = readFileSync(filePath);
  res.writeHead(200, { 'Content-Type': type, 'Content-Length': content.length });
  res.end(content);
  return true;
}

const CLIENT_DETAIL_RE = /^\/api\/admin\/clients\/([^/]+)$/;
const CLIENT_INVOICE_RE = /^\/api\/admin\/clients\/([^/]+)\/invoice-export$/;
const CLIENT_TEMPLATES_RE = /^\/api\/admin\/clients\/([^/]+)\/templates$/;
const TEMPLATE_RE = /^\/api\/admin\/templates\/([^/]+)$/;
const SLOT_RE = /^\/api\/admin\/slots\/([^/]+)$/;
const BOOKING_RE = /^\/api\/admin\/bookings\/([^/]+)$/;

async function route(db: ServerDb, options: AppOptions, req: IncomingMessage, res: ServerResponse): Promise<void> {
  const method = req.method ?? 'GET';
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const path = url.pathname;

  // ---- Static admin web ----------------------------------------------------
  if (method === 'GET' && (path === '/admin' || path === '/admin/')) {
    if (options.adminDir !== undefined && options.adminDir !== null) {
      if (serveStatic(res, options.adminDir, 'index.html')) {
        return;
      }
    }
    sendJson(res, 404, { error: 'Az admin felület nem érhető el.' });
    return;
  }
  if (
    method === 'GET' &&
    path.startsWith('/admin/') &&
    options.adminDir !== undefined &&
    options.adminDir !== null
  ) {
    if (serveStatic(res, options.adminDir, path.slice('/admin/'.length))) {
      return;
    }
  }

  // ---- Health --------------------------------------------------------------
  if (method === 'GET' && path === '/api/health') {
    sendJson(res, 200, {
      ok: true,
      service: 'workoutapp-coach-server',
      clients: listClients(db).length,
      exercises: EXERCISE_CATALOG.length,
      producedAt: nowIso(),
    });
    return;
  }

  // ---- Coach admin gate ----------------------------------------------------
  // Every admin call exposes client data, so it requires the coach token. The
  // static admin page itself stays public; it only renders after the API answers.
  if (path.startsWith('/api/admin/')) {
    requireAdminToken(req, options.adminToken ?? '');
  }

  // ---- Auth ----------------------------------------------------------------
  if (method === 'POST' && path === '/api/auth/register') {
    const body = await readBody(req);
    sendJson(res, 201, handleRegister(db, body));
    return;
  }
  if (method === 'POST' && path === '/api/auth/login') {
    const body = await readBody(req);
    sendJson(res, 200, handleLogin(db, body));
    return;
  }

  // ---- Sync: push ----------------------------------------------------------
  if (method === 'POST' && path === '/api/sync/push') {
    const authUserId = requireAuthUserId(db, req);
    const body = await readBody(req);
    sendJson(res, 200, handlePush(db, body, authUserId));
    return;
  }

  // ---- Sync: pull ----------------------------------------------------------
  // The user id always comes from the bearer token; a `userId` query parameter
  // is ignored outright so it can never be used to read someone else's data.
  if (method === 'GET' && path === '/api/sync/pull') {
    const userId = requireAuthUserId(db, req);
    sendJson(res, 200, handlePull(db, userId));
    return;
  }

  // ---- Admin: exercise catalog --------------------------------------------
  if (method === 'GET' && path === '/api/admin/exercises') {
    sendJson(res, 200, { count: EXERCISE_CATALOG.length, exercises: EXERCISE_CATALOG });
    return;
  }

  // ---- Admin: clients ------------------------------------------------------
  if (method === 'GET' && path === '/api/admin/clients') {
    sendJson(res, 200, { clients: listClients(db).map((row) => toClientSummary(db, row)) });
    return;
  }

  const detail = CLIENT_DETAIL_RE.exec(path);
  if (method === 'GET' && detail !== null) {
    const userId = decodeURIComponent(detail[1]);
    const row = getClient(db, userId);
    if (row === null) {
      throw new HttpError(404, 'Ismeretlen ügyfél.');
    }
    const summary = toClientSummary(db, row);
    const profile = parseProfile(row.profile_json);
    sendJson(res, 200, {
      ...summary,
      profile,
      trainingProfile: profile?.trainingProfile ?? null,
      constraints: profile?.constraints ?? null,
      sessions: listSessions(db, userId),
      templates: listTemplates(db, userId),
      bookings: listBookings(db, userId),
    });
    return;
  }

  const invoice = CLIENT_INVOICE_RE.exec(path);
  if (method === 'GET' && invoice !== null) {
    const userId = decodeURIComponent(invoice[1]);
    const row = getClient(db, userId);
    if (row === null) {
      throw new HttpError(404, 'Ismeretlen ügyfél.');
    }
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const data = buildInvoiceExport(db, row, from, to);
    if ((url.searchParams.get('format') ?? 'json') === 'csv') {
      const csv = invoiceCsv(data);
      res.writeHead(200, {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="szamla_${userId}.csv"`,
      });
      res.end(csv);
      return;
    }
    sendJson(res, 200, data);
    return;
  }

  // ---- Admin: templates ----------------------------------------------------
  const templates = CLIENT_TEMPLATES_RE.exec(path);
  if (method === 'POST' && templates !== null) {
    const userId = decodeURIComponent(templates[1]);
    const body = await readBody(req);
    sendJson(res, 201, { template: handleCreateTemplate(db, userId, body) });
    return;
  }

  const template = TEMPLATE_RE.exec(path);
  if (method === 'DELETE' && template !== null) {
    sendJson(res, 200, handleDeleteTemplate(db, decodeURIComponent(template[1])));
    return;
  }

  // ---- Admin: slots --------------------------------------------------------
  if (method === 'GET' && path === '/api/admin/slots') {
    sendJson(res, 200, {
      slots: allRows<SlotRow>(db, 'SELECT * FROM coaching_slots ORDER BY starts_at;').map(toSlot),
    });
    return;
  }
  if (method === 'POST' && path === '/api/admin/slots') {
    const body = await readBody(req);
    sendJson(res, 201, { slot: handleCreateSlot(db, body) });
    return;
  }
  const slot = SLOT_RE.exec(path);
  if (method === 'DELETE' && slot !== null) {
    sendJson(res, 200, handleDeleteSlot(db, decodeURIComponent(slot[1])));
    return;
  }

  // ---- Admin: bookings -----------------------------------------------------
  const booking = BOOKING_RE.exec(path);
  if (method === 'PATCH' && booking !== null) {
    const body = await readBody(req);
    sendJson(res, 200, { booking: handlePatchBooking(db, decodeURIComponent(booking[1]), body) });
    return;
  }

  sendJson(res, 404, { error: `Ismeretlen végpont: ${method} ${path}` });
}

/** Builds the request handler bound to a database and options. */
export function createApp(db: ServerDb, options: AppOptions = {}): HttpHandler {
  const allowedOrigins = resolveAllowedOrigins(options.allowedOrigins);
  const resolved: AppOptions = { ...options, adminToken: resolveAdminToken(options.adminToken) };

  return (req, res) => {
    // CORS: the web app (https://alexercise.app) and local dev servers call this
    // API cross-origin. Reflect only allowed origins; native clients send no
    // Origin header and are unaffected. Set CORS_ORIGINS="*" to open it up.
    const origin = req.headers.origin;
    res.setHeader('Vary', 'Origin');
    if (allowedOrigins === '*') {
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else if (typeof origin === 'string' && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept, Authorization');
    res.setHeader('Access-Control-Max-Age', '86400');

    if ((req.method ?? 'GET') === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    route(db, resolved, req, res).catch((cause: unknown) => {
      if (cause instanceof HttpError) {
        sendJson(res, cause.status, { error: cause.message });
        return;
      }
      const message = cause instanceof Error ? cause.message : String(cause);
      sendJson(res, 500, { error: message });
    });
  };
}
