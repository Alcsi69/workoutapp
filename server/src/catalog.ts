// The 157-exercise catalog, re-exported from the mobile seed data so the coach
// admin can search the exact same vocabulary the app uses. `catalogData.ts` is
// pure data (type-only import), so it compiles cleanly under the server's
// tsconfig without pulling in any React Native code.
export { EXERCISE_CATALOG } from '../../src/db/catalogData';
