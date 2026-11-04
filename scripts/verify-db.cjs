/**
 * Headless verification of the Phase 2 DB layer against a real SQLite engine.
 *
 * expo-sqlite is native, so this harness compiles the pure DB modules to CommonJS
 * (scripts/tsconfig.verify.json -> .verify-build) and runs them against
 * node:sqlite through a small shim that mirrors expo-sqlite's async API.
 *
 * Run: npm run verify:db
 */

const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');
const { migrate, SCHEMA_VERSION } = require('../.verify-build/db/schema.js');
const { seedExerciseCatalog, CORE_EXERCISE_CATALOG } = require('../.verify-build/db/seed.js');
const repository = require('../.verify-build/db/repository.js');
const {
  pickRecommendedSession,
  getWeekdayIndex,
  getWeeklySlots,
} = require('../.verify-build/services/recommendation.js');
const {
  deriveAutoSubstitutions,
  buildOnboardingPayload,
  selectPreferredSubstitutions,
  useOnboardingStore,
} = require('../.verify-build/store/useOnboardingStore.js');
const {
  useActiveWorkoutStore,
  computeRestRemainingMs,
  formatRestClock,
} = require('../.verify-build/store/useActiveWorkoutStore.js');
const {
  generateProgramFromProfile,
  buildAiProgramRequestPayload,
} = require('../.verify-build/services/routineGenerator.js');
const {
  syncPendingWorkouts,
  buildSyncBatchPayload,
} = require('../.verify-build/services/syncService.js');

/** Thin async facade over node:sqlite matching the expo-sqlite API surface we use. */
function createDatabase() {
  const raw = new DatabaseSync(':memory:');
  const normalize = (params) => params.map((param) => (param === undefined ? null : param));

  const db = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, ...params) {
      const result = raw.prepare(sql).run(...normalize(params));
      return {
        changes: Number(result.changes),
        lastInsertRowId: Number(result.lastInsertRowid),
      };
    },
    async getFirstAsync(sql, ...params) {
      return raw.prepare(sql).get(...normalize(params)) ?? null;
    },
    async getAllAsync(sql, ...params) {
      return raw.prepare(sql).all(...normalize(params));
    },
    async withTransactionAsync(work) {
      raw.exec('BEGIN');
      try {
        await work();
        raw.exec('COMMIT');
      } catch (cause) {
        raw.exec('ROLLBACK');
        throw cause;
      }
    },
  };

  return { db, raw };
}

const checks = [];

async function check(name, fn) {
  try {
    await fn();
    checks.push({ name, ok: true });
    console.log(`  ok   ${name}`);
  } catch (cause) {
    checks.push({ name, ok: false, cause });
    console.log(`  FAIL ${name}: ${cause.message}`);
  }
}

async function main() {
  const { db, raw } = createDatabase();

  console.log('\nschema + seeds');
  await migrate(db);

  await check(`migrate sets user_version to ${SCHEMA_VERSION}`, () => {
    const version = raw.prepare('PRAGMA user_version').get().user_version;
    assert.equal(version, SCHEMA_VERSION);
  });

  await check('user_profiles table exists after migration 2', () => {
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
      .all()
      .map((row) => row.name);
    assert.ok(tables.includes('user_profiles'));
  });

  await check('exercise catalog seeds the full catalog', async () => {
    const inserted = await seedExerciseCatalog(db);
    assert.equal(inserted, CORE_EXERCISE_CATALOG.length);
    assert.ok(inserted >= 28, `expected 28+ exercises, inserted ${inserted}`);
  });

  await check('re-seeding an unchanged catalog is a no-op', async () => {
    const inserted = await seedExerciseCatalog(db);
    assert.equal(inserted, 0);
  });

  await check('re-seeding updates a changed score so existing DBs converge', async () => {
    raw
      .prepare("UPDATE exercise_catalog SET knee_stress_score = 1 WHERE id = 'front_squat'")
      .run();
    const changed = await seedExerciseCatalog(db);
    assert.equal(changed, 1);
    const row = raw
      .prepare("SELECT knee_stress_score FROM exercise_catalog WHERE id = 'front_squat'")
      .get();
    assert.equal(row.knee_stress_score, 3);
  });

  await check('seedDefaultTemplates inserts the 7 default templates', async () => {
    const inserted = await repository.seedDefaultTemplates(db);
    assert.equal(inserted, 7);
  });

  await check('seedDefaultTemplates is idempotent', async () => {
    const inserted = await repository.seedDefaultTemplates(db);
    assert.equal(inserted, 0);
  });

  await check('template blocks are seeded exactly once (19)', () => {
    const count = raw.prepare('SELECT COUNT(*) AS count FROM template_exercise_blocks').get().count;
    assert.equal(count, 19);
  });

  console.log('\nonboarding persistence');
  const payload = {
    userId: repository.USER_PROFILE_ID,
    locale: 'hu',
    biometrics: { age: 25, weightKg: 78.5, heightCm: 180 },
    trainingProfile: {
      primaryGoal: 'powerbuilding',
      experienceMonths: 36,
      strengthDaysPerWeek: 4,
      runningDaysPerWeek: 3,
      targetRunDistanceKm: 5,
      sessionDurationMinutes: 75,
      equipment: 'full_gym',
    },
    constraints: {
      jointLimitations: [
        { area: 'knees', severity: 'avoid_heavy_axial_load', notes: 'térdzsávolító' },
      ],
      excludedExerciseIds: ['hack_squat'],
      preferredSubstitutions: { hack_squat: 'belt_squat' },
    },
  };

  await repository.saveOnboardingPayload(db, payload);
  let profile = await repository.getUserProfile(db);

  await check('saveOnboardingPayload persists the profile', () => {
    assert.ok(profile !== null);
    assert.equal(profile.userId, 'usr_local');
    assert.equal(profile.biometrics.weightKg, 78.5);
    assert.equal(profile.trainingProfile.primaryGoal, 'powerbuilding');
    assert.equal(profile.trainingProfile.strengthDaysPerWeek, 4);
    assert.equal(profile.trainingProfile.targetRunDistanceKm, 5);
    assert.equal(profile.trainingProfile.equipment, 'full_gym');
    assert.ok(profile.onboardingCompletedAt.length > 0);
  });

  await check('JSON columns round-trip through the repository', () => {
    assert.deepEqual(profile.constraints.excludedExerciseIds, ['hack_squat']);
    assert.deepEqual(profile.constraints.preferredSubstitutions, { hack_squat: 'belt_squat' });
    assert.equal(profile.constraints.jointLimitations.length, 1);
    assert.equal(profile.constraints.jointLimitations[0].area, 'knees');
    assert.equal(profile.constraints.jointLimitations[0].severity, 'avoid_heavy_axial_load');
    assert.equal(profile.constraints.jointLimitations[0].notes, 'térdzsávolító');
  });

  // Re-onboard with a different constraint set: constraints must be replaced, not appended.
  await repository.saveOnboardingPayload(db, {
    ...payload,
    trainingProfile: { ...payload.trainingProfile, strengthDaysPerWeek: 3, targetRunDistanceKm: undefined },
    constraints: {
      jointLimitations: [{ area: 'lower_back', severity: 'strict_exclude' }],
      excludedExerciseIds: [],
      preferredSubstitutions: {},
    },
  });

  profile = await repository.getUserProfile(db);

  await check('re-saving replaces joint constraints instead of duplicating them', () => {
    assert.equal(profile.constraints.jointLimitations.length, 1);
    assert.equal(profile.constraints.jointLimitations[0].area, 'lower_back');
    assert.equal(profile.trainingProfile.strengthDaysPerWeek, 3);
    assert.equal(profile.trainingProfile.targetRunDistanceKm, undefined);
  });

  await check('profile row count stays at one', () => {
    const count = raw.prepare('SELECT COUNT(*) AS count FROM user_profiles').get().count;
    assert.equal(count, 1);
  });

  await check('optional target distance is stored as NULL and read back as undefined', () => {
    const row = raw
      .prepare('SELECT target_run_distance_km FROM user_profiles WHERE id = ?')
      .get(repository.USER_PROFILE_ID);
    assert.equal(row.target_run_distance_km, null);
  });

  console.log('\ncatalog + templates reads');
  await check('getExerciseCatalog filters by category', async () => {
    const cardio = await repository.getExerciseCatalog(db, 'cardio_run');
    assert.equal(cardio.length, 6);
    assert.ok(cardio.every((item) => item.category === 'cardio_run'));
  });

  await check('catalog JSON columns parse cleanly', async () => {
    const catalog = await repository.getExerciseCatalog(db);
    assert.equal(catalog.length, CORE_EXERCISE_CATALOG.length);
    const frontSquat = catalog.find((item) => item.id === 'front_squat');
    assert.deepEqual(frontSquat.primaryMuscles, ['quadriceps', 'glutes', 'core']);
    assert.deepEqual(frontSquat.defaultSubstituteIds, ['belt_squat']);
    // Lowered to 3 so the front squat survives avoid_heavy_axial_load (knee sleeves).
    assert.equal(frontSquat.kneeStressScore, 3);
  });

  const templates = await repository.getWorkoutTemplates(db);

  await check('getWorkoutTemplates returns the strength block first', () => {
    assert.equal(templates.length, 7);
    assert.equal(templates[0].sessionType, 'strength');
    assert.ok(templates.some((template) => template.title === 'Lower A - Elölguggolás'));
    assert.ok(
      templates.some((template) => template.title === 'Lower B - Román felhúzás & Öves guggolás'),
    );
  });

  await check('template blocks are hydrated with catalog data', () => {
    const upperA = templates.find((template) => template.title === 'Upper A');
    assert.equal(upperA.exercises.length, 4);
    assert.equal(upperA.exercises[0].exercise.nameHu, 'Fekvenyomás');
    assert.equal(upperA.exercises[0].exercise.id, 'bench_press');
    assert.notEqual(upperA.exercises[0].exercise.id, upperA.exercises[0].id);
    assert.equal(upperA.exercises[0].targetSets, 4);
    assert.equal(upperA.exercises[0].targetReps, '6-8');
    assert.equal(upperA.exercises[0].exercise.kneeStressScore, 1);
  });

  console.log('\nsplit recommendation');
  // Restore the 4 strength / 3 running profile used by the planner below.
  await repository.saveOnboardingPayload(db, payload);
  const planningProfile = await repository.getUserProfile(db);

  await check('weekday mapping is Monday-first', () => {
    assert.equal(getWeekdayIndex(new Date(2026, 10, 2)), 0);
    assert.equal(getWeekdayIndex(new Date(2026, 10, 4)), 2);
  });

  await check('4 strength + 3 running fills Monday-Thursday then Friday-Sunday', () => {
    const slots = getWeeklySlots(planningProfile);
    assert.deepEqual(slots, [
      'strength',
      'strength',
      'strength',
      'strength',
      'running',
      'running',
      'running',
    ]);
  });

  await check('Monday recommends a strength template', () => {
    const recommended = pickRecommendedSession(templates, planningProfile, new Date(2026, 10, 2));
    assert.ok(recommended !== null);
    assert.equal(recommended.slot, 'strength');
  });

  await check('Friday recommends the 5 km run for a 5 km target', () => {
    const recommended = pickRecommendedSession(templates, planningProfile, new Date(2026, 10, 6));
    assert.ok(recommended !== null);
    assert.equal(recommended.slot, 'running');
    assert.equal(recommended.template.title, '5 km futás');
  });

  await check('a 3 strength / 2 running plan rests on Saturday', () => {
    const lighterProfile = {
      ...planningProfile,
      trainingProfile: { ...planningProfile.trainingProfile, strengthDaysPerWeek: 3, runningDaysPerWeek: 2 },
    };
    assert.equal(pickRecommendedSession(templates, lighterProfile, new Date(2026, 10, 7)), null);
  });

  await check('Sunday is the third running day for the seeded 4/3 split', () => {
    const recommended = pickRecommendedSession(templates, planningProfile, new Date(2026, 10, 8));
    assert.ok(recommended !== null);
    assert.equal(recommended.slot, 'running');
  });

  await check('a 4 strength / 2 running plan rests on Sunday', () => {
    const lighterProfile = {
      ...planningProfile,
      trainingProfile: { ...planningProfile.trainingProfile, runningDaysPerWeek: 2 },
    };
    assert.equal(pickRecommendedSession(templates, lighterProfile, new Date(2026, 10, 8)), null);
  });

  console.log('\nonboarding draft -> payload');
  await check('knee avoidance auto-applies hack_squat -> belt_squat', () => {
    assert.deepEqual(
      deriveAutoSubstitutions([{ area: 'knees', severity: 'avoid_heavy_axial_load' }]),
      { hack_squat: 'belt_squat' },
    );
    assert.deepEqual(
      deriveAutoSubstitutions([{ area: 'knees', severity: 'strict_exclude' }]),
      { hack_squat: 'belt_squat' },
    );
  });

  await check('mild knee discomfort and non-knee areas apply no substitution', () => {
    assert.deepEqual(
      deriveAutoSubstitutions([{ area: 'knees', severity: 'mild_discomfort' }]),
      {},
    );
    assert.deepEqual(
      deriveAutoSubstitutions([{ area: 'lower_back', severity: 'strict_exclude' }]),
      {},
    );
  });

  await check('store actions produce a payload the repository accepts', async () => {
    const store = useOnboardingStore;
    store.getState().reset();
    store.getState().updateBiometrics({ age: 31, weightKg: 82.5, heightCm: 181 });
    store.getState().setPrimaryGoal('powerbuilding');
    store.getState().updateSchedule({ strengthDaysPerWeek: 4, runningDaysPerWeek: 3, targetRunDistanceKm: 7 });
    store.getState().upsertJointConstraint('knees', 'avoid_heavy_axial_load');

    const draft = store.getState();
    assert.deepEqual(selectPreferredSubstitutions(draft), { hack_squat: 'belt_squat' });
    assert.deepEqual(draft.jointLimitations, [
      { area: 'knees', severity: 'avoid_heavy_axial_load' },
    ]);

    const builtPayload = buildOnboardingPayload(draft, repository.USER_PROFILE_ID);
    assert.equal(builtPayload.trainingProfile.targetRunDistanceKm, 7);
    assert.deepEqual(builtPayload.constraints.preferredSubstitutions, {
      hack_squat: 'belt_squat',
    });

    await repository.saveOnboardingPayload(db, builtPayload);
    const reloaded = await repository.getUserProfile(db);
    assert.equal(reloaded.biometrics.age, 31);
    assert.equal(reloaded.trainingProfile.targetRunDistanceKm, 7);
    assert.deepEqual(reloaded.constraints.preferredSubstitutions, {
      hack_squat: 'belt_squat',
    });
    store.getState().reset();
  });

  await check('removing the knee constraint removes the auto substitution', () => {
    const store = useOnboardingStore;
    store.getState().reset();
    store.getState().upsertJointConstraint('knees', 'strict_exclude');
    assert.deepEqual(selectPreferredSubstitutions(store.getState()), {
      hack_squat: 'belt_squat',
    });
    store.getState().removeJointConstraint('knees');
    assert.deepEqual(selectPreferredSubstitutions(store.getState()), {});
    store.getState().reset();
  });

  console.log('\nsession start + history');
  const upperA = templates.find((template) => template.title === 'Upper A');
  const sessionId = await repository.startSessionFromTemplate(db, upperA);
  const duplicateStart = await repository.startSessionFromTemplate(db, upperA);

  await check('startSessionFromTemplate creates one session with copied blocks', () => {
    assert.equal(duplicateStart, sessionId);
    const blocks = raw
      .prepare('SELECT COUNT(*) AS count FROM session_exercise_blocks WHERE session_id = ?')
      .get(sessionId).count;
    assert.equal(blocks, 4);
  });

  await check('active session is reported and history stays empty', async () => {
    const active = await repository.getActiveSession(db);
    assert.ok(active !== null);
    assert.equal(active.title, 'Upper A');
    assert.equal(active.exerciseCount, 4);
    const history = await repository.getSessionHistory(db);
    assert.equal(history.length, 0);
  });

  raw
    .prepare("UPDATE session_logs SET completed_at = ? WHERE id = ?")
    .run('2026-11-04T19:00:00.000Z', sessionId);

  await check('completing the session moves it into history', async () => {
    const history = await repository.getSessionHistory(db);
    assert.equal(history.length, 1);
    assert.equal(history[0].exerciseCount, 4);
    assert.equal(history[0].sessionType, 'strength');
    assert.equal(history[0].completedAt, '2026-11-04T19:00:00.000Z');
  });

  console.log('\nsession logging (phase 3)');
  const lowerA = templates.find((template) => template.title.startsWith('Lower A'));
  const lowerSessionId = await repository.startSessionFromTemplate(db, lowerA);

  let detail = await repository.getSessionDetail(db, lowerSessionId);

  await check('getSessionDetail hydrates ordered blocks with catalog + prescription', () => {
    assert.ok(detail !== null);
    assert.equal(detail.sessionType, 'strength');
    assert.equal(detail.exerciseBlocks.length, 4);
    assert.deepEqual(
      detail.exerciseBlocks.map((block) => block.orderIndex),
      [0, 1, 2, 3],
    );
    const first = detail.exerciseBlocks[0];
    assert.equal(first.exercise.nameHu, 'Elölguggolás');
    assert.equal(first.exerciseId, 'front_squat');
    assert.equal(first.targetSets, 5);
    assert.equal(first.targetReps, '5');
    assert.equal(first.sets.length, 0);
    assert.equal(detail.runningMetrics, undefined);
  });

  const firstBlock = detail.exerciseBlocks[0];
  const logged = await repository.upsertSetLog(db, firstBlock.id, {
    setNumber: 1,
    setType: 'working',
    actualWeightKg: 80,
    actualReps: 5,
    rpe: 8,
  });

  await check('upsertSetLog persists weight/reps/type/RPE and dirties the session', () => {
    const row = raw.prepare('SELECT * FROM set_logs WHERE id = ?').get(logged.id);
    assert.equal(row.actual_weight_kg, 80);
    assert.equal(row.actual_reps, 5);
    assert.equal(row.set_type, 'working');
    assert.equal(row.rpe, 8);
    assert.equal(row.target_reps, '5');
    const session = raw
      .prepare('SELECT sync_status FROM session_logs WHERE id = ?')
      .get(lowerSessionId);
    assert.equal(session.sync_status, 'local_dirty');
    assert.equal(logged.targetReps, '5');
  });

  await check('upsertSetLog edits an existing set in place', async () => {
    const updated = await repository.upsertSetLog(db, firstBlock.id, {
      id: logged.id,
      setNumber: 1,
      setType: 'top_set',
      actualWeightKg: 85,
      actualReps: 3,
      rpe: 9,
    });
    assert.equal(updated.id, logged.id);
    const row = raw.prepare('SELECT * FROM set_logs WHERE id = ?').get(logged.id);
    assert.equal(row.actual_weight_kg, 85);
    assert.equal(row.set_type, 'top_set');
    const count = raw
      .prepare('SELECT COUNT(*) AS count FROM set_logs WHERE block_id = ?')
      .get(firstBlock.id).count;
    assert.equal(count, 1);
  });

  await check('RPE outside 5.0-10.0 is rejected', async () => {
    await assert.rejects(
      () =>
        repository.upsertSetLog(db, firstBlock.id, {
          setNumber: 2,
          setType: 'working',
          actualWeightKg: 80,
          actualReps: 5,
          rpe: 11,
        }),
      /RPE must be between/,
    );
    const count = raw
      .prepare('SELECT COUNT(*) AS count FROM set_logs WHERE block_id = ?')
      .get(firstBlock.id).count;
    assert.equal(count, 1);
  });

  await check('the logged set round-trips through getSessionDetail', async () => {
    const reloaded = await repository.getSessionDetail(db, lowerSessionId);
    const sets = reloaded.exerciseBlocks[0].sets;
    assert.equal(sets.length, 1);
    assert.equal(sets[0].actualWeightKg, 85);
    assert.equal(sets[0].setType, 'top_set');
    assert.equal(sets[0].rpe, 9);
  });

  await check('deleteSetLog removes the row and re-dirties the session', async () => {
    raw
      .prepare("UPDATE session_logs SET sync_status = 'synced' WHERE id = ?")
      .run(lowerSessionId);
    await repository.deleteSetLog(db, logged.id);
    const count = raw
      .prepare('SELECT COUNT(*) AS count FROM set_logs WHERE block_id = ?')
      .get(firstBlock.id).count;
    assert.equal(count, 0);
    const session = raw
      .prepare('SELECT sync_status FROM session_logs WHERE id = ?')
      .get(lowerSessionId);
    assert.equal(session.sync_status, 'local_dirty');
  });

  console.log('\nexercise substitution (phase 3)');
  const candidates = await repository.getSubstitutionCandidates(db, firstBlock.id);

  await check('substitution candidates put the recommended substitute first', () => {
    assert.ok(candidates.length > 0);
    assert.equal(candidates[0].id, 'belt_squat');
    assert.ok(
      !candidates.some((item) => item.id === 'front_squat'),
      'the current exercise is excluded',
    );
  });

  await repository.substituteExerciseInBlock(db, firstBlock.id, 'belt_squat');

  await check('substituteExerciseInBlock swaps the exercise and records the original', async () => {
    const row = raw
      .prepare(
        'SELECT exercise_id, substituted_from_exercise_id FROM session_exercise_blocks WHERE id = ?',
      )
      .get(firstBlock.id);
    assert.equal(row.exercise_id, 'belt_squat');
    assert.equal(row.substituted_from_exercise_id, 'front_squat');
    const swapped = await repository.getSessionDetail(db, lowerSessionId);
    const block = swapped.exerciseBlocks.find((entry) => entry.id === firstBlock.id);
    assert.equal(block.exerciseId, 'belt_squat');
    assert.equal(block.exercise.nameHu, 'Öves guggolás');
    assert.equal(block.substitutedFromExerciseId, 'front_squat');
  });

  await check('a second swap keeps the original prescription as the source', async () => {
    await repository.substituteExerciseInBlock(db, firstBlock.id, 'hack_squat');
    const row = raw
      .prepare(
        'SELECT exercise_id, substituted_from_exercise_id FROM session_exercise_blocks WHERE id = ?',
      )
      .get(firstBlock.id);
    assert.equal(row.exercise_id, 'hack_squat');
    assert.equal(row.substituted_from_exercise_id, 'front_squat');
  });

  console.log('\nrunning metrics + completion (phase 3)');
  const completedAt = await repository.completeSession(db, lowerSessionId);

  await check('completeSession stamps completed_at and clears the active session', async () => {
    const row = raw
      .prepare('SELECT completed_at FROM session_logs WHERE id = ?')
      .get(lowerSessionId);
    assert.equal(row.completed_at, completedAt);
    const history = await repository.getSessionHistory(db);
    assert.ok(history.some((item) => item.id === lowerSessionId));
    assert.equal(await repository.getActiveSession(db), null);
  });

  const runTemplate = templates.find((template) => template.title === '5 km futás');
  const runSessionId = await repository.startSessionFromTemplate(db, runTemplate);
  await repository.upsertRunningMetrics(db, runSessionId, {
    distanceKm: 5,
    durationSeconds: 1500,
    perceivedEffortRpe: 7,
  });

  await check('upsertRunningMetrics stores distance, duration, pace, and RPE', () => {
    const row = raw
      .prepare('SELECT * FROM running_metrics WHERE session_id = ?')
      .get(runSessionId);
    assert.equal(row.distance_km, 5);
    assert.equal(row.duration_seconds, 1500);
    assert.equal(row.avg_pace_seconds_per_km, 300); // 1500s / 5km
    assert.equal(row.perceived_effort_rpe, 7);
  });

  await check('getSessionDetail exposes running metrics only for running/hybrid', async () => {
    const runDetail = await repository.getSessionDetail(db, runSessionId);
    assert.equal(runDetail.sessionType, 'running');
    assert.equal(runDetail.runningMetrics.distanceKm, 5);
    assert.equal(runDetail.runningMetrics.avgPaceSecondsPerKm, 300);
    assert.equal(repository.computeAvgPaceSecondsPerKm(5, 1500), 300);
    assert.equal(repository.computeAvgPaceSecondsPerKm(0, 1500), 0);
    const strengthDetail = await repository.getSessionDetail(db, lowerSessionId);
    assert.equal(strengthDetail.runningMetrics, undefined);
  });

  await check('upsertRunningMetrics upserts on repeat saves', async () => {
    await repository.upsertRunningMetrics(db, runSessionId, {
      distanceKm: 5,
      durationSeconds: 1400,
    });
    const count = raw
      .prepare('SELECT COUNT(*) AS count FROM running_metrics WHERE session_id = ?')
      .get(runSessionId).count;
    assert.equal(count, 1);
    const row = raw
      .prepare(
        'SELECT avg_pace_seconds_per_km, perceived_effort_rpe FROM running_metrics WHERE session_id = ?',
      )
      .get(runSessionId);
    assert.equal(row.avg_pace_seconds_per_km, 280);
    assert.equal(row.perceived_effort_rpe, null);
  });

  await check('discardSession deletes an in-progress session and its children', async () => {
    const removed = await repository.discardSession(db, runSessionId);
    assert.equal(removed, true);
    assert.equal(await repository.getSessionDetail(db, runSessionId), null);
    const blocks = raw
      .prepare('SELECT COUNT(*) AS count FROM session_exercise_blocks WHERE session_id = ?')
      .get(runSessionId).count;
    assert.equal(blocks, 0);
    const metrics = raw
      .prepare('SELECT COUNT(*) AS count FROM running_metrics WHERE session_id = ?')
      .get(runSessionId).count;
    assert.equal(metrics, 0);
  });

  await check('discardSession never deletes a completed session', async () => {
    const removed = await repository.discardSession(db, lowerSessionId);
    assert.equal(removed, false);
    const row = raw
      .prepare('SELECT completed_at FROM session_logs WHERE id = ?')
      .get(lowerSessionId);
    assert.ok(row !== undefined && row.completed_at !== null);
  });

  console.log('\nrest timer store (phase 3)');
  const restStore = useActiveWorkoutStore;

  await check('startRest sets an absolute end timestamp', () => {
    restStore.getState().reset();
    restStore.getState().startRest('block_1', 90, 1000);
    assert.equal(restStore.getState().restEndTimeMs, 1000 + 90_000);
    assert.equal(restStore.getState().activeRestBlockId, 'block_1');
  });

  await check('adjustRest nudges the timer and clamps at now', () => {
    restStore.getState().adjustRest(15, 2000);
    assert.equal(restStore.getState().restEndTimeMs, 1000 + 90_000 + 15_000);
    restStore.getState().adjustRest(-1000, 5000);
    assert.equal(restStore.getState().restEndTimeMs, 5000);
  });

  await check('computeRestRemainingMs and formatRestClock derive the countdown', () => {
    assert.equal(computeRestRemainingMs(90_000, 30_000), 60_000);
    assert.equal(computeRestRemainingMs(null, 30_000), 0);
    assert.equal(computeRestRemainingMs(10_000, 30_000), 0);
    assert.equal(formatRestClock(90_000), '1:30');
    assert.equal(formatRestClock(0), '0:00');
  });

  await check('a zero rest clears the timer', () => {
    restStore.getState().startRest('block_2', 0, 1000);
    assert.equal(restStore.getState().restEndTimeMs, null);
    assert.equal(restStore.getState().activeRestBlockId, null);
    restStore.getState().reset();
  });

  console.log('\nroutine generation (phase 4)');
  // Controlled profile: knees constrained, hack_squat excluded+substituted, 7 km target.
  await repository.saveOnboardingPayload(db, {
    ...payload,
    trainingProfile: { ...payload.trainingProfile, targetRunDistanceKm: 7 },
  });

  const customHack = await repository.createCustomTemplate(db, {
    title: 'Knee Stress Day',
    sessionType: 'strength',
    blocks: [
      { exerciseId: 'hack_squat', targetSets: 4, targetReps: '8-10', restSeconds: 120 },
    ],
  });

  await check('createCustomTemplate persists a user template with its blocks', () => {
    assert.ok(customHack.id.startsWith('tpl_user'));
    assert.equal(customHack.title, 'Knee Stress Day');
    assert.equal(customHack.sessionType, 'strength');
    assert.equal(customHack.exercises.length, 1);
    assert.equal(customHack.exercises[0].exerciseId, 'hack_squat');
    assert.equal(customHack.exercises[0].targetSets, 4);
    assert.equal(customHack.exercises[0].targetReps, '8-10');
    assert.equal(customHack.exercises[0].exercise.nameHu, 'Hack guggolás');
  });

  await check('createCustomTemplate rejects unknown exercises', async () => {
    await assert.rejects(
      () =>
        repository.createCustomTemplate(db, {
          title: 'Bad',
          sessionType: 'strength',
          blocks: [{ exerciseId: 'does_not_exist' }],
        }),
      /Ismeretlen gyakorlat/,
    );
  });

  const genResult = await generateProgramFromProfile(db);

  await check('generateProgramFromProfile swaps hack_squat -> belt_squat under knee constraint', () => {
    assert.equal(genResult.generated, true);
    const blockId = customHack.exercises[0].id;
    const swap = genResult.appliedSubstitutions.find((entry) => entry.blockId === blockId);
    assert.ok(swap !== undefined, 'expected a substitution for the hack_squat block');
    assert.equal(swap.fromExerciseId, 'hack_squat');
    assert.equal(swap.toExerciseId, 'belt_squat');
    assert.equal(swap.reason, 'excluded');
    const row = raw
      .prepare(
        'SELECT exercise_id, substituted_from_exercise_id FROM template_exercise_blocks WHERE id = ?',
      )
      .get(blockId);
    assert.equal(row.exercise_id, 'belt_squat');
    assert.equal(row.substituted_from_exercise_id, 'hack_squat');
  });

  await check('avoid_heavy_axial_load keeps front_squat and leg_extension on Lower A', async () => {
    const lowerA = await repository.getWorkoutTemplateById(db, 'tpl_lower_a');
    assert.ok(lowerA !== null);
    // 75-minute session -> 5 exercises, spec anchors first.
    assert.deepEqual(
      lowerA.exercises.map((block) => block.exerciseId),
      ['front_squat', 'belt_squat', 'leg_extension', 'seated_leg_curl', 'standing_calf_raise'],
    );
    assert.equal(genResult.appliedSubstitutions.some((e) => e.fromExerciseId === 'front_squat'), false);
    assert.equal(genResult.appliedSubstitutions.some((e) => e.fromExerciseId === 'leg_extension'), false);
  });

  await check('the program is sized to the 4-day strength / 3-day running split', () => {
    assert.equal(genResult.strengthTemplateCount, 5); // 4 generated + 1 custom
    assert.equal(genResult.runningTemplateCount, 3);
    assert.equal(genResult.templateCount, 8);
  });

  await check('Lower B leads with Román felhúzás then the spec order', async () => {
    const lowerB = await repository.getWorkoutTemplateById(db, 'tpl_lower_b');
    assert.ok(lowerB !== null);
    assert.deepEqual(
      lowerB.exercises.map((block) => block.exerciseId),
      ['romanian_deadlift', 'belt_squat', 'adductor_machine', 'leg_extension', 'seated_calf_raise'],
    );
  });

  await check('running days are distinct and the long run scales to the 7 km target', async () => {
    assert.equal(genResult.runningTargetKm, 7);
    const day1 = await repository.getWorkoutTemplateById(db, 'tpl_run_1');
    const day2 = await repository.getWorkoutTemplateById(db, 'tpl_run_2');
    const day3 = await repository.getWorkoutTemplateById(db, 'tpl_run_3');
    assert.equal(day1.title, 'Könnyű alapozó futás (5 km)');
    assert.equal(day1.exercises[0].exerciseId, 'run_easy_5k');
    assert.equal(day2.title, 'Tempó futás (5 km)');
    assert.equal(day2.exercises[0].exerciseId, 'run_tempo_5k');
    assert.equal(day3.title, 'Hosszabb futás (7 km)');
    assert.equal(day3.exercises[0].exerciseId, 'run_long_7k');
    assert.equal(day3.exercises[0].targetReps, '7 km');
    // The redundant legacy single-distance templates are collapsed away.
    assert.equal(await repository.getWorkoutTemplateById(db, 'tpl_run_5k'), null);
    assert.equal(await repository.getWorkoutTemplateById(db, 'tpl_run_7k'), null);
    assert.equal(await repository.getWorkoutTemplateById(db, 'tpl_run_tempo'), null);
  });

  await check('generateProgramFromProfile is idempotent after the first pass', async () => {
    const second = await generateProgramFromProfile(db);
    assert.equal(second.appliedSubstitutions.length, 0);
    assert.equal(second.templateCount, genResult.templateCount);
  });

  await check('buildAiProgramRequestPayload matches the sample contract', async () => {
    const request = await buildAiProgramRequestPayload(db);
    assert.ok(request.requestId.startsWith('ai_req'));
    assert.ok(request.generatedAt.length > 0);
    assert.equal(request.locale, 'hu');
    assert.equal(request.profile.userId, 'usr_local');
    assert.equal(request.profile.trainingProfile.targetRunDistanceKm, 7);
    // UserProfile bookkeeping columns are stripped from the request body.
    assert.equal(request.profile.onboardingCompletedAt, undefined);
    assert.equal(request.profile.updatedAt, undefined);
    assert.deepEqual(request.profile.constraints.preferredSubstitutions, {
      hack_squat: 'belt_squat',
    });
    assert.equal(request.catalog.length, CORE_EXERCISE_CATALOG.length);
    assert.ok(request.catalog.some((item) => item.id === 'belt_squat'));
  });

  console.log('\nconstraint matrix + split builder (phase 4)');

  await repository.saveOnboardingPayload(db, {
    ...payload,
    constraints: {
      jointLimitations: [{ area: 'knees', severity: 'mild_discomfort' }],
      excludedExerciseIds: [],
      preferredSubstitutions: {},
    },
  });
  const mildResult = await generateProgramFromProfile(db);

  await check('mild knee discomfort keeps every compound and annotates the block', async () => {
    assert.equal(mildResult.appliedSubstitutions.length, 0);
    const lowerA = await repository.getWorkoutTemplateById(db, 'tpl_lower_a');
    const squat = lowerA.exercises.find((block) => block.exerciseId === 'front_squat');
    assert.ok(squat !== undefined);
    assert.ok(squat.notes.includes('Térdgumi / lapos talpú cipő ajánlott'));
    assert.ok(squat.notes.includes('Max RPE 8.5'));
  });

  await repository.saveOnboardingPayload(db, {
    ...payload,
    constraints: {
      jointLimitations: [{ area: 'knees', severity: 'strict_exclude' }],
      excludedExerciseIds: [],
      preferredSubstitutions: {},
    },
  });
  await generateProgramFromProfile(db);

  await check('strict knee exclusion swaps leg_extension for a <=2 knee-stress lift', async () => {
    const lowerA = await repository.getWorkoutTemplateById(db, 'tpl_lower_a');
    const ids = lowerA.exercises.map((block) => block.exerciseId);
    assert.equal(ids.includes('leg_extension'), false);
    assert.ok(lowerA.exercises.every((block) => block.exercise.kneeStressScore <= 3));
    // front_squat sits at 3 (below the >=4 strict threshold) and is preserved.
    assert.ok(ids.includes('front_squat'));
  });

  await repository.saveOnboardingPayload(db, {
    ...payload,
    trainingProfile: {
      ...payload.trainingProfile,
      strengthDaysPerWeek: 2,
      runningDaysPerWeek: 0,
      targetRunDistanceKm: undefined,
    },
    constraints: { jointLimitations: [], excludedExerciseIds: [], preferredSubstitutions: {} },
  });
  const twoDay = await generateProgramFromProfile(db);

  await check('2 strength days build Full Body A/B and drop the 4-day templates', async () => {
    assert.equal(twoDay.runningTemplateCount, 0);
    assert.ok((await repository.getWorkoutTemplateById(db, 'tpl_full_a')) !== null);
    assert.ok((await repository.getWorkoutTemplateById(db, 'tpl_full_b')) !== null);
    assert.equal(await repository.getWorkoutTemplateById(db, 'tpl_upper_a'), null);
    assert.equal(await repository.getWorkoutTemplateById(db, 'tpl_lower_a'), null);
  });

  await repository.saveOnboardingPayload(db, {
    ...payload,
    trainingProfile: { ...payload.trainingProfile, strengthDaysPerWeek: 3, runningDaysPerWeek: 2 },
    constraints: { jointLimitations: [], excludedExerciseIds: [], preferredSubstitutions: {} },
  });
  const threeDay = await generateProgramFromProfile(db);

  await check('3 strength days build Upper/Lower/Full with 2 running days', async () => {
    assert.equal(threeDay.runningTemplateCount, 2);
    assert.ok((await repository.getWorkoutTemplateById(db, 'tpl_upper_a')) !== null);
    assert.ok((await repository.getWorkoutTemplateById(db, 'tpl_lower_a')) !== null);
    assert.ok((await repository.getWorkoutTemplateById(db, 'tpl_full_b')) !== null);
    assert.equal(await repository.getWorkoutTemplateById(db, 'tpl_upper_b'), null);
    assert.equal(await repository.getWorkoutTemplateById(db, 'tpl_lower_b'), null);
  });

  await repository.saveOnboardingPayload(db, {
    ...payload,
    trainingProfile: {
      ...payload.trainingProfile,
      strengthDaysPerWeek: 4,
      runningDaysPerWeek: 0,
      targetRunDistanceKm: undefined,
    },
    constraints: {
      jointLimitations: [{ area: 'lower_back', severity: 'strict_exclude' }],
      excludedExerciseIds: [],
      preferredSubstitutions: {},
    },
  });
  await generateProgramFromProfile(db);

  await check('lower_back strict exclusion replaces the RDL with an axial<=2 lift', async () => {
    const lowerB = await repository.getWorkoutTemplateById(db, 'tpl_lower_b');
    assert.equal(lowerB.exercises.some((block) => block.exerciseId === 'romanian_deadlift'), false);
    assert.ok(lowerB.exercises.every((block) => block.exercise.axialLoadScore <= 2));
  });

  console.log('\noffline sync (phase 4)');
  // Mark every surviving session dirty to exercise the queue end to end.
  raw.prepare("UPDATE session_logs SET sync_status = 'local_dirty'").run();

  const dirtyIds = await repository.getDirtySessionIds(db);
  const dirtyPayload = await repository.getDirtySessionsPayload(db);

  await check('getDirtySessionsPayload hydrates full nested session graphs', () => {
    assert.ok(dirtyIds.length > 0);
    assert.equal(dirtyPayload.length, dirtyIds.length);
    const strengthSession = dirtyPayload.find((session) => session.id === lowerSessionId);
    assert.ok(strengthSession !== undefined);
    assert.equal(strengthSession.syncStatus, 'local_dirty');
    assert.equal(strengthSession.sessionType, 'strength');
    assert.ok(strengthSession.exerciseBlocks.length > 0);
    const block = strengthSession.exerciseBlocks[0];
    assert.ok(Array.isArray(block.sets));
    assert.ok(block.exercise !== undefined);
    assert.equal(block.exercise.id, block.exerciseId);
  });

  await check('buildSyncBatchPayload wraps every dirty session in a batch envelope', async () => {
    const batch = await buildSyncBatchPayload(db);
    assert.ok(batch.batchId.startsWith('sync_'));
    assert.equal(batch.deviceId, repository.USER_PROFILE_ID);
    assert.equal(batch.sessions.length, dirtyPayload.length);
  });

  await check('syncPendingWorkouts without an endpoint stays a local dry run', async () => {
    const result = await syncPendingWorkouts(db);
    assert.equal(result.mode, 'dry_run');
    assert.equal(result.sessionCount, dirtyPayload.length);
    assert.equal(result.syncedSessionIds.length, 0);
    assert.equal(result.payload.sessions.length, dirtyPayload.length);
    assert.equal(await repository.countDirtySessions(db), dirtyPayload.length);
  });

  await check('a failing upload degrades to a dry run and keeps rows dirty', async () => {
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async () => ({ ok: false, status: 500 });
    try {
      const result = await syncPendingWorkouts(db, 'https://example.test/workouts');
      assert.equal(result.mode, 'dry_run');
      assert.ok(result.error !== undefined);
    } finally {
      globalThis.fetch = previousFetch;
    }
    assert.equal(await repository.countDirtySessions(db), dirtyPayload.length);
  });

  await check('syncPendingWorkouts uploads and marks synced on a 2xx response', async () => {
    const calls = [];
    const previousFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      return { ok: true, status: 200 };
    };
    try {
      const result = await syncPendingWorkouts(db, 'https://example.test/workouts');
      assert.equal(result.mode, 'remote');
      assert.equal(result.sessionCount, dirtyPayload.length);
      assert.equal(result.syncedSessionIds.length, dirtyPayload.length);
      assert.equal(calls.length, 1);
      assert.equal(calls[0].url, 'https://example.test/workouts');
      const sent = JSON.parse(calls[0].init.body);
      assert.equal(sent.sessions.length, dirtyPayload.length);
      assert.equal(await repository.countDirtySessions(db), 0);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await check('markSessionsSynced flips only the given ids', async () => {
    raw
      .prepare("UPDATE session_logs SET sync_status = 'local_dirty' WHERE id = ?")
      .run(lowerSessionId);
    const changed = await repository.markSessionsSynced(db, [lowerSessionId]);
    assert.equal(changed, 1);
    const row = raw
      .prepare('SELECT sync_status FROM session_logs WHERE id = ?')
      .get(lowerSessionId);
    assert.equal(row.sync_status, 'synced');
  });

  await check('syncPendingWorkouts is a noop when nothing is dirty', async () => {
    raw.prepare("UPDATE session_logs SET sync_status = 'synced'").run();
    const result = await syncPendingWorkouts(db);
    assert.equal(result.mode, 'noop');
    assert.equal(result.sessionCount, 0);
  });

  await check('no foreign key violations', () => {
    assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);
  });

  raw.close();

  const failed = checks.filter((item) => !item.ok);
  console.log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((cause) => {
  console.error('\nverification crashed:', cause);
  process.exitCode = 1;
});