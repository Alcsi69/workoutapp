// Singleton SQLite client.
// Opens `workout.db` once, applies migrations, and seeds the catalog.
// Every consumer calls getDatabase() and awaits the shared instance.

import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import { migrate } from './schema';
import { seedExerciseCatalog } from './seed';
import { getUserProfile, seedDefaultTemplates } from './repository';
import { generateProgramFromProfile } from '../services/routineGenerator';

export const DATABASE_NAME = 'workout.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;

/**
 * Returns the shared database instance, initializing it on first call:
 * open -> migrate -> seed catalog -> (generate program | seed fallback
 * templates). The promise is cached, so initialization runs once per app process
 * and concurrent callers await the same work.
 *
 * With a saved profile the generated program is rebuilt so existing databases
 * converge on the current split; without one the minimal fallback templates are
 * seeded for the pre-onboarding state.
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (databasePromise === null) {
    databasePromise = (async (): Promise<SQLiteDatabase> => {
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await migrate(db);
      await seedExerciseCatalog(db);
      const profile = await getUserProfile(db);
      if (profile === null) {
        await seedDefaultTemplates(db);
      } else {
        await generateProgramFromProfile(db);
      }
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
