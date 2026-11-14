// Singleton SQLite client.
// Opens `workout.db` once, applies migrations, and seeds the catalog.
// Every consumer calls getDatabase() and awaits the shared instance.

import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrate } from './schema';
import { seedExerciseCatalog } from './seed';
import { removeDefaultTemplates, seedCoachingSlots } from './repository';

export const DATABASE_NAME = 'workout.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;

/**
 * Returns the shared database instance, initializing it on first call:
 * open -> migrate -> seed catalog -> clear default templates -> seed slots.
 * The promise is cached, so initialization runs once per app process and
 * concurrent callers await the same work.
 *
 * A client starts with an EMPTY template list: neither a pre-seeded default
 * program nor a profile-generated one is created here. Plans only appear once
 * the coach assigns one (via sync) or the user builds one under Sablonok. Any
 * default templates an older build left behind are swept on startup.
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (databasePromise === null) {
    databasePromise = (async (): Promise<SQLiteDatabase> => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await migrate(db);
      await seedExerciseCatalog(db);
      await removeDefaultTemplates(db);
      await seedCoachingSlots(db);
      return db;
    })();
  }
  return databasePromise;
}

/** Number of exercises currently in the catalog (used by the runtime smoke screen). */
export async function getExerciseCount(): Promise<number> {
  const db = await getDatabase();
  const row = await db.getFirstAsync<{ count: number }>(
    'SELECT COUNT(*) AS count FROM exercise_catalog;',
  );
  return row?.count ?? 0;
}
