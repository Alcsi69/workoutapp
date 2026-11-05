// Server-side SQLite layer.
//
// Uses Node's built-in `node:sqlite` (synchronous DatabaseSync) — no native
// compilation, no ORM, no dependencies. The schema is a coach-platform mirror of
// the client's offline store: one row per client, one per coach-assigned plan,
// one per pushed workout session, plus the coach's slots and bookings.

import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export type ServerDb = DatabaseSync;

/** A value that can be bound to a `?` placeholder. */
export type SqlParam = string | number | bigint | null | Uint8Array;

const SCHEMA_SQL = `
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  -- One row per client, mirroring the pushed onboarding + billing state.
  CREATE TABLE IF NOT EXISTS clients (
    user_id TEXT PRIMARY KEY NOT NULL,
    locale TEXT NOT NULL,
    profile_json TEXT NOT NULL,
    billing_json TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  -- Coach-authored plans assigned to a specific client.
  CREATE TABLE IF NOT EXISTS coach_templates (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    session_type TEXT NOT NULL,
    goal TEXT,
    coach_note TEXT,
    assigned_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    blocks_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_coach_templates_user ON coach_templates(user_id);

  -- Pushed workout sessions (the full nested WorkoutSessionLog, JSON-encoded).
  CREATE TABLE IF NOT EXISTS workout_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    user_id TEXT NOT NULL,
    session_type TEXT NOT NULL,
    title TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    sync_status TEXT NOT NULL,
    payload_json TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_sessions_user ON workout_sessions(user_id);

  -- Coach's published 1-on-1 availability.
  CREATE TABLE IF NOT EXISTS coaching_slots (
    id TEXT PRIMARY KEY NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    modality TEXT NOT NULL,
    location_or_link TEXT NOT NULL,
    is_booked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_slots_starts ON coaching_slots(starts_at);

  -- Client bookings of those slots (status/notes/links flow back on pull).
  CREATE TABLE IF NOT EXISTS coaching_bookings (
    id TEXT PRIMARY KEY NOT NULL,
    slot_id TEXT NOT NULL,
    user_id TEXT NOT NULL,
    modality TEXT NOT NULL,
    starts_at TEXT NOT NULL,
    ends_at TEXT NOT NULL,
    location_or_link TEXT NOT NULL,
    client_notes TEXT,
    coach_notes TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    sync_status TEXT NOT NULL DEFAULT 'synced',
    created_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_bookings_user ON coaching_bookings(user_id);
  CREATE INDEX IF NOT EXISTS idx_bookings_slot ON coaching_bookings(slot_id);
`;

/**
 * Opens (creating if needed) the coach platform database and applies the schema.
 * `:memory:` skips the directory creation — the verify harness uses it.
 */
export function openServerDatabase(filePath: string): ServerDb {
  if (filePath !== ':memory:') {
    mkdirSync(dirname(filePath), { recursive: true });
  }
  const db = new DatabaseSync(filePath);
  db.exec(SCHEMA_SQL);
  return db;
}

/** Runs a statement that returns no rows. */
export function runSql(db: ServerDb, sql: string, params: readonly SqlParam[] = []): void {
  db.prepare(sql).run(...params);
}

/** Runs a query and returns every row, cast to the caller's row shape. */
export function allRows<T>(db: ServerDb, sql: string, params: readonly SqlParam[] = []): T[] {
  return db.prepare(sql).all(...params) as unknown as T[];
}

/** Runs a query and returns the first row (or null). */
export function firstRow<T>(
  db: ServerDb,
  sql: string,
  params: readonly SqlParam[] = [],
): T | null {
  const row = db.prepare(sql).get(...params);
  return row === undefined ? null : (row as unknown as T);
}
