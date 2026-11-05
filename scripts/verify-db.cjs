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
const { seedExerciseCatalog } = require('../.verify-build/db/seed.js');
const { EXERCISE_CATALOG } = require('../.verify-build/db/catalogData.js');
const {
  normalizeSearchText,
  exerciseMatchesQuery,
  filterExercises,
  matchesMuscleGroup,
  deriveMuscleGroups,
} = require('../.verify-build/services/exerciseSearch.js');
const repository = require('../.verify-build/db/repository.js');
const analytics = require('../.verify-build/services/analytics.js');
const loggerDrafts = require('../.verify-build/services/loggerDrafts.js');
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
  buildClientSyncPullPayload,
} = require('../.verify-build/services/routineGenerator.js');
const {
  syncPendingWorkouts,
  buildSyncBatchPayload,
  buildClientSyncPushPayload,
} = require('../.verify-build/services/syncService.js');
const billing = require('../.verify-build/services/billing.js');
const plateCalculator = require('../.verify-build/services/plateCalculator.js');
const backupService = require('../.verify-build/services/backupService.js');

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
    assert.equal(inserted, EXERCISE_CATALOG.length);
    assert.ok(inserted >= 130, `expected 130+ exercises, inserted ${inserted}`);
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
    const expectedCardio = EXERCISE_CATALOG.filter((item) => item.category === 'cardio_run').length;
    const cardio = await repository.getExerciseCatalog(db, 'cardio_run');
    assert.equal(cardio.length, expectedCardio);
    assert.ok(cardio.every((item) => item.category === 'cardio_run'));
  });

  await check('catalog JSON columns parse cleanly', async () => {
    const catalog = await repository.getExerciseCatalog(db);
    assert.equal(catalog.length, EXERCISE_CATALOG.length);
    const frontSquat = catalog.find((item) => item.id === 'front_squat');
    assert.deepEqual(frontSquat.primaryMuscles, ['quadriceps', 'glutes', 'core']);
    assert.deepEqual(frontSquat.defaultSubstituteIds, ['belt_squat']);
    // Lowered to 3 so the front squat survives avoid_heavy_axial_load (knee sleeves).
    assert.equal(frontSquat.kneeStressScore, 3);
    // Migration v4 metadata is hydrated for every row.
    assert.equal(frontSquat.equipment, 'barbell');
    assert.equal(frontSquat.movementPattern, 'squat');
    assert.equal(frontSquat.isCustom, false);
  });

  console.log('\ncatalog expansion + search (phase 5)');

  await check('catalog has >= 130 unique exercises with valid constraints', () => {
    assert.ok(EXERCISE_CATALOG.length >= 130, `got ${EXERCISE_CATALOG.length}`);
    const ids = new Set();
    const equipments = new Set([
      'barbell', 'dumbbell', 'machine', 'cable', 'bodyweight', 'kettlebell', 'specialty_bar', 'cardio',
    ]);
    const patterns = new Set([
      'squat', 'hinge', 'lunge', 'horizontal_push', 'vertical_push', 'horizontal_pull',
      'vertical_pull', 'arm_isolation', 'core', 'calf', 'cardio', 'other',
    ]);
    for (const item of EXERCISE_CATALOG) {
      assert.ok(!ids.has(item.id), `duplicate id ${item.id}`);
      ids.add(item.id);
      assert.ok(equipments.has(item.equipment), `bad equipment on ${item.id}: ${item.equipment}`);
      assert.ok(patterns.has(item.movementPattern), `bad pattern on ${item.id}`);
      assert.ok(item.axialLoadScore >= 1 && item.axialLoadScore <= 5, `axial out of range on ${item.id}`);
      assert.ok(item.kneeStressScore >= 1 && item.kneeStressScore <= 5, `knee out of range on ${item.id}`);
      assert.ok(item.nameHu.length > 0 && item.nameEn.length > 0, `missing name on ${item.id}`);
    }
    // The new equipment columns are backed by indexes (schedule name lookups).
    const indexes = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'exercise_catalog'")
      .all()
      .map((row) => row.name);
    assert.ok(indexes.includes('idx_catalog_name_hu'));
    assert.ok(indexes.includes('idx_catalog_name_en'));
    assert.equal(
      raw.prepare('SELECT COUNT(*) AS count FROM exercise_catalog WHERE is_custom = 0').get().count,
      EXERCISE_CATALOG.length,
    );
  });

  await check('accent-insensitive normalization folds Hungarian diacritics', () => {
    assert.equal(normalizeSearchText('Elölguggolás'), 'elolguggolas');
    assert.equal(normalizeSearchText('Csípőemelés'), 'csipoemeles');
    assert.equal(normalizeSearchText('  HÚZÓDZKODÁS '), 'huzodzkodas');
  });

  await check('search matches Hungarian without accents and English by name', () => {
    const byHu = filterExercises(EXERCISE_CATALOG, { query: 'guggolas' });
    assert.ok(byHu.some((item) => item.id === 'front_squat'), 'unaccented HU query finds front_squat');
    const byEn = filterExercises(EXERCISE_CATALOG, { query: 'squat' });
    assert.ok(byEn.some((item) => item.id === 'front_squat'));
    assert.ok(byEn.some((item) => item.id === 'back_squat_high_bar'));
    assert.ok(byEn.every((item) => exerciseMatchesQuery(item, 'squat')));
  });

  await check('granular muscle-group filters bucket compound lifts into every trained group', () => {
    const byId = (id) => EXERCISE_CATALOG.find((item) => item.id === id);
    const rdl = byId('romanian_deadlift'); // hamstrings + glutes + lower_back
    assert.equal(matchesMuscleGroup(rdl, 'hamstrings'), true);
    assert.equal(matchesMuscleGroup(rdl, 'glutes'), true);
    assert.equal(matchesMuscleGroup(rdl, 'back'), true); // lower_back rolls into back
    assert.equal(matchesMuscleGroup(rdl, 'quads'), false);
    assert.deepEqual(deriveMuscleGroups(rdl), ['hamstrings', 'glutes', 'back']);

    // A lift sharing two groups is no longer hidden from either chip.
    assert.deepEqual(deriveMuscleGroups(byId('hip_thrust')), ['hamstrings', 'glutes']);
    assert.equal(matchesMuscleGroup(byId('adductor_machine'), 'adductors'), true);
    assert.equal(matchesMuscleGroup(byId('abductor_machine'), 'adductors'), true);
    assert.equal(matchesMuscleGroup(byId('standing_calf_raise'), 'calves'), true);
    assert.equal(matchesMuscleGroup(byId('barbell_shrug'), 'traps'), true);
    assert.equal(matchesMuscleGroup(byId('barbell_curl'), 'biceps'), true);
    assert.equal(matchesMuscleGroup(byId('triceps_pushdown'), 'triceps'), true);
    assert.equal(matchesMuscleGroup(byId('wrist_curl'), 'forearms'), true);
    assert.equal(matchesMuscleGroup(byId('plank'), 'core'), true);
    // Cardio is bucketed by run category/pattern, not a muscle token.
    assert.equal(matchesMuscleGroup(byId('run_easy_5k'), 'cardio'), true);
  });

  await check('muscle-group + equipment filters narrow the catalog', () => {
    const quads = filterExercises(EXERCISE_CATALOG, { muscleGroup: 'quads' });
    assert.ok(quads.length > 0);
    assert.ok(quads.every((item) => matchesMuscleGroup(item, 'quads')));
    assert.ok(quads.some((item) => item.id === 'front_squat'));
    assert.ok(quads.some((item) => item.id === 'leg_extension'));

    const hamstrings = filterExercises(EXERCISE_CATALOG, { muscleGroup: 'hamstrings' });
    assert.ok(hamstrings.every((item) => matchesMuscleGroup(item, 'hamstrings')));
    assert.ok(hamstrings.some((item) => item.id === 'romanian_deadlift'));
    assert.ok(hamstrings.some((item) => item.id === 'seated_leg_curl'));
    // The glutes chip still surfaces the same shared compound.
    assert.ok(
      filterExercises(EXERCISE_CATALOG, { muscleGroup: 'glutes' }).some(
        (item) => item.id === 'romanian_deadlift',
      ),
    );

    const calves = filterExercises(EXERCISE_CATALOG, { muscleGroup: 'calves' });
    assert.ok(calves.some((item) => item.id === 'standing_calf_raise'));
    assert.ok(calves.every((item) => matchesMuscleGroup(item, 'calves')));

    const cardio = filterExercises(EXERCISE_CATALOG, { muscleGroup: 'cardio' });
    assert.ok(cardio.every((item) => matchesMuscleGroup(item, 'cardio')));
    assert.ok(cardio.some((item) => item.id === 'run_easy_5k'));

    for (const group of ['adductors', 'biceps', 'triceps', 'forearms', 'core']) {
      assert.ok(
        filterExercises(EXERCISE_CATALOG, { muscleGroup: group }).length > 0,
        `expected at least one exercise under ${group}`,
      );
    }

    const barbell = filterExercises(EXERCISE_CATALOG, { equipment: 'barbell' });
    assert.ok(barbell.every((item) => item.equipment === 'barbell' || item.equipment === 'specialty_bar'));
    assert.ok(barbell.some((item) => item.id === 'bench_press'));

    // A chest bench also trains triceps/front delts, so it recurs under each chip.
    const combined = filterExercises(EXERCISE_CATALOG, { query: 'nyomás', muscleGroup: 'chest' });
    assert.ok(combined.every((item) => matchesMuscleGroup(item, 'chest')));
  });

  await check('createCustomExercise persists a user exercise that is searchable', async () => {
    const before = await repository.getExerciseCatalog(db);
    const created = await repository.createCustomExercise(db, {
      nameHu: 'Farmerséta',
      nameEn: 'Farmer Carry',
      equipment: 'dumbbell',
      primaryMuscles: ['forearms', 'core'],
      category: 'isolation',
    });
    assert.ok(created.id.startsWith('cust_'));
    assert.equal(created.isCustom, true);
    assert.equal(created.equipment, 'dumbbell');
    assert.equal(created.nameEn, 'Farmer Carry');

    const after = await repository.getExerciseCatalog(db);
    assert.equal(after.length, before.length + 1);
    const reloaded = after.find((item) => item.id === created.id);
    assert.ok(reloaded !== undefined);
    assert.equal(reloaded.isCustom, true);
    // Accent-insensitive search finds it under either name.
    assert.deepEqual(
      filterExercises(after, { query: 'farmerseta' }).map((item) => item.id),
      [created.id],
    );
    assert.ok(filterExercises(after, { query: 'carry' }).some((item) => item.id === created.id));

    // A blank name is rejected and leaves the catalog unchanged.
    await assert.rejects(
      () => repository.createCustomExercise(db, { nameHu: '   ', equipment: 'barbell' }),
      /nem lehet üres/,
    );
    assert.equal((await repository.getExerciseCatalog(db)).length, after.length);

    // The seeder ignores user rows: re-seeding is still a no-op for shipped rows.
    const changed = await seedExerciseCatalog(db);
    assert.equal(changed, 0);
    assert.ok((await repository.getExerciseById(db, created.id)) !== null);
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

  await check('buildClientSyncPullPayload matches the coach sync contract', async () => {
    const request = await buildClientSyncPullPayload(db);
    assert.ok(request.syncId.startsWith('sync_pull'));
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
    // No billing profile has been saved yet in this run.
    assert.equal(request.billingProfile, null);
    // The full shipped catalog plus any user-created exercises (>= the seed).
    assert.ok(request.catalog.length >= EXERCISE_CATALOG.length);
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

  await check('syncPendingWorkouts pushes then pulls on a 2xx response', async () => {
    const calls = [];
    const previousFetch = globalThis.fetch;
    const pullBody = {
      syncId: 'sync_pull_test',
      generatedAt: new Date().toISOString(),
      userId: repository.USER_PROFILE_ID,
      templates: [],
      bookings: [],
      slots: [],
    };
    globalThis.fetch = async (url, init) => {
      calls.push({ url, init });
      if (url.includes('/api/sync/pull')) {
        return { ok: true, status: 200, json: async () => pullBody };
      }
      return { ok: true, status: 200, json: async () => ({ ok: true }) };
    };
    try {
      const result = await syncPendingWorkouts(db, 'https://example.test');
      assert.equal(result.mode, 'remote');
      assert.equal(result.sessionCount, dirtyPayload.length);
      assert.equal(result.syncedSessionIds.length, dirtyPayload.length);
      assert.equal(calls.length, 2);
      assert.ok(calls[0].url.endsWith('/api/sync/push'), 'first leg is the push');
      assert.ok(
        calls[1].url.includes('/api/sync/pull?userId=usr_local'),
        'second leg is the pull',
      );
      const sent = JSON.parse(calls[0].init.body);
      assert.equal(sent.sessions.length, dirtyPayload.length);
      assert.equal(sent.profile.userId, repository.USER_PROFILE_ID);
      assert.equal(await repository.countDirtySessions(db), 0);
    } finally {
      globalThis.fetch = previousFetch;
    }
  });

  await check('applyClientSyncPullPayload reconciles coach templates, slots and bookings', async () => {
    // A stale coach template + a stale open slot that the pull must withdraw.
    await repository.assignCoachTemplate(db, {
      id: 'tpl_coach_stale',
      title: 'Stale plan',
      sessionType: 'strength',
      blocks: [{ exerciseId: 'bench_press', targetSets: 3, targetReps: '5', restSeconds: 120 }],
    });
    raw
      .prepare(
        "INSERT INTO coaching_slots (id, starts_at, ends_at, modality, location_or_link, is_booked) VALUES ('slot_stale','2031-01-01T09:00:00.000Z','2031-01-01T10:00:00.000Z','online_call','x',0)",
      )
      .run();

    const pull = {
      syncId: 'sync_pull_apply',
      generatedAt: new Date().toISOString(),
      userId: repository.USER_PROFILE_ID,
      templates: [
        {
          id: 'tpl_coach_new',
          title: 'Coach plan',
          sessionType: 'strength',
          source: 'coach',
          coachNote: 'Knee friendly',
          assignedAt: '2031-01-01T00:00:00.000Z',
          createdAt: '2031-01-01T00:00:00.000Z',
          exercises: [
            {
              id: 'tpl_coach_new:0',
              templateId: 'tpl_coach_new',
              orderIndex: 0,
              exerciseId: 'belt_squat',
              restSeconds: 150,
              targetSets: 4,
              targetReps: '8-10',
              exercise: {
                id: 'belt_squat',
                nameHu: 'Belt squat',
                nameEn: 'Belt Squat',
                category: 'machine',
                equipment: 'machine',
                movementPattern: 'squat',
                primaryMuscles: [],
                axialLoadScore: 1,
                kneeStressScore: 2,
                defaultSubstituteIds: [],
                isCustom: false,
              },
            },
          ],
        },
      ],
      bookings: [
        {
          id: 'book_pull',
          slotId: 'slot_new',
          userId: repository.USER_PROFILE_ID,
          modality: 'irl_gym',
          startsAt: '2031-02-01T09:00:00.000Z',
          endsAt: '2031-02-01T10:00:00.000Z',
          locationOrLink: 'Gym',
          coachNotes: 'Confirmed by coach',
          status: 'confirmed',
          syncStatus: 'synced',
          createdAt: '2031-01-15T00:00:00.000Z',
        },
      ],
      slots: [
        {
          id: 'slot_new',
          startsAt: '2031-02-01T09:00:00.000Z',
          endsAt: '2031-02-01T10:00:00.000Z',
          modality: 'irl_gym',
          locationOrLink: 'Gym',
          isBooked: false,
        },
      ],
    };

    await repository.applyClientSyncPullPayload(db, pull);

    const coachTemplates = await repository.getCoachAssignedTemplates(db);
    const ids = coachTemplates.map((template) => template.id);
    assert.ok(ids.includes('tpl_coach_new'), 'incoming coach plan applied');
    assert.ok(!ids.includes('tpl_coach_stale'), 'withdrawn coach plan removed');
    assert.equal(coachTemplates[0].coachNote, 'Knee friendly');
    assert.equal(coachTemplates[0].exercises[0].exerciseId, 'belt_squat');

    const slots = await repository.getCoachingSlots(db);
    assert.ok(slots.some((slot) => slot.id === 'slot_new'), 'server slot present');
    assert.ok(!slots.some((slot) => slot.id === 'slot_stale'), 'stale open slot removed');

    const pulled = (await repository.getCoachingBookings(db)).find((b) => b.id === 'book_pull');
    assert.ok(pulled !== undefined);
    assert.equal(pulled.status, 'confirmed');
    assert.equal(pulled.coachNotes, 'Confirmed by coach');
    assert.equal(pulled.syncStatus, 'synced');

    // Clean up so later sections see the database unchanged.
    raw.prepare("DELETE FROM coaching_bookings WHERE id = 'book_pull'").run();
    raw.prepare("DELETE FROM coaching_slots WHERE id IN ('slot_new','slot_stale')").run();
    await repository.deleteTemplate(db, 'tpl_coach_new');
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

  console.log('\nprogressive overload + analytics (phase 5)');

  await check('estimateOneRepMax blends Epley and Brzycki', () => {
    assert.equal(analytics.estimateOneRepMax(100, 5), 114.6); // (116.67 + 112.5) / 2
    assert.equal(analytics.estimateOneRepMax(100, 1), 101.7);
    assert.equal(analytics.estimateOneRepMax(100, 12), 142); // (140 + 144) / 2
    assert.ok(
      analytics.estimateOneRepMax(100, 8) > analytics.estimateOneRepMax(100, 5),
      'more reps at the same weight estimates a higher 1RM',
    );
  });

  await check('estimateOneRepMax folds reps in reserve from RPE into the estimate', () => {
    // 100 x 5 @8 leaves ~2 reps in reserve, so it estimates like a 7-rep set.
    assert.equal(analytics.estimateOneRepMax(100, 5, 8), 121.7);
    assert.equal(analytics.estimateOneRepMax(100, 5, 8), analytics.estimateOneRepMax(100, 7));
    // A 1RM single must not be inflated by RPE.
    assert.equal(analytics.estimateOneRepMax(100, 1, 10), analytics.estimateOneRepMax(100, 1));
  });

  await check('estimateOneRepMax clamps reps and tolerates junk input', () => {
    assert.equal(analytics.estimateOneRepMax(100, 20), analytics.estimateOneRepMax(100, 12));
    // Out-of-range RPE is ignored rather than throwing (hints must never break the logger).
    assert.equal(analytics.estimateOneRepMax(100, 5, 12), 114.6);
    assert.equal(analytics.estimateOneRepMax(100, 5, 0), 114.6);
    assert.equal(analytics.estimateOneRepMax(0, 5), 0);
    assert.equal(analytics.estimateOneRepMax(-20, 5), 0);
    assert.equal(analytics.estimateOneRepMax(100, 0), 0);
    assert.equal(Number.isNaN(analytics.estimateOneRepMax(Number.NaN, 5)), false);
  });

  await check('parseRepRange reads rep prescriptions but not distances', () => {
    assert.deepEqual(analytics.parseRepRange('6-8'), { min: 6, max: 8 });
    assert.deepEqual(analytics.parseRepRange('5'), { min: 5, max: 5 });
    assert.deepEqual(analytics.parseRepRange('5x5'), { min: 5, max: 5 });
    assert.equal(analytics.parseRepRange('5 km'), null);
    assert.equal(analytics.parseRepRange('AMRAP'), null);
    assert.equal(analytics.parseRepRange(undefined), null);
  });

  const makeSet = (setNumber, setType, actualWeightKg, actualReps, rpe) => {
    const set = {
      setNumber,
      setType,
      actualWeightKg,
      actualReps,
      completedAt: '2026-10-01T10:00:00.000Z',
    };
    if (rpe !== undefined) {
      set.rpe = rpe;
    }
    return set;
  };

  await check('computeNextTargetHint adds 2.5 kg off an easy top-of-range set', () => {
    const hint = analytics.computeNextTargetHint(
      [makeSet(1, 'top_set', 100, 8, 8)],
      'powerbuilding',
      '6-8',
    );
    assert.equal(hint.reason, 'top_of_range_easy');
    assert.equal(hint.weightKg, 102.5);
    assert.equal(hint.reps, 6); // reset to the bottom of the range
    assert.equal(hint.deltaKg, 2.5);
    assert.equal(hint.deltaReps, -2);
  });

  await check('computeNextTargetHint adds a rep below the top of the range', () => {
    const hint = analytics.computeNextTargetHint(
      [makeSet(1, 'working', 100, 5, 8)],
      'powerbuilding',
      '6-8',
    );
    assert.equal(hint.reason, 'add_rep');
    assert.equal(hint.weightKg, 100);
    assert.equal(hint.reps, 6);
    assert.equal(hint.deltaKg, 0);
    assert.equal(hint.deltaReps, 1);
  });

  await check('computeNextTargetHint uses the heaviest working set, not a warmup', () => {
    const hint = analytics.computeNextTargetHint(
      [makeSet(1, 'warmup', 40, 10, 6), makeSet(2, 'working', 100, 5, 8)],
      'strength',
      '6-8',
    );
    assert.equal(hint.weightKg, 100);
    assert.equal(hint.reps, 6);
  });

  await check('computeNextTargetHint applies the goal RPE ceiling', () => {
    const hardTopSet = [makeSet(1, 'top_set', 100, 8, 9)];
    // 9.0 is over the strength/powerbuilding ceiling of 8.5 -> repeat the load.
    assert.equal(
      analytics.computeNextTargetHint(hardTopSet, 'strength', '6-8').reason,
      'top_of_range_hard',
    );
    assert.equal(
      analytics.computeNextTargetHint(hardTopSet, 'powerbuilding', '6-8').weightKg,
      100,
    );
    // Hypertrophy tolerates RPE 9.0 before the bar goes up.
    assert.equal(
      analytics.computeNextTargetHint(hardTopSet, 'hypertrophy', '6-8').reason,
      'top_of_range_easy',
    );
  });

  await check('computeNextTargetHint holds the load after a near-failure set', () => {
    const hint = analytics.computeNextTargetHint(
      [makeSet(1, 'working', 100, 5, 9.5)],
      'strength',
      '6-8',
    );
    assert.equal(hint.reason, 'hold_weight');
    assert.equal(hint.weightKg, 100);
    assert.equal(hint.reps, 5);
    assert.equal(hint.deltaKg, 0);
    assert.equal(hint.deltaReps, 0);
  });

  await check('computeNextTargetHint returns null without usable history', () => {
    assert.equal(analytics.computeNextTargetHint(undefined, 'strength', '6-8'), null);
    assert.equal(analytics.computeNextTargetHint([], 'strength', '6-8'), null);
    assert.equal(
      analytics.computeNextTargetHint([makeSet(1, 'warmup', 40, 10, 6)], 'strength', '6-8'),
      null,
    );
  });

  await check('isNewPersonalRecord compares against the best estimated 1RM', () => {
    const best = 124;
    assert.equal(analytics.isNewPersonalRecord(110, 3, best, 9), false); // 122.3
    assert.equal(analytics.isNewPersonalRecord(110, 4, best, 9), true); // 126.0
    assert.equal(analytics.isNewPersonalRecord(105, 5, best, 9), false); // exactly the PR
    // The first set ever logged for an exercise is a PR by definition...
    assert.equal(analytics.isNewPersonalRecord(60, 5, 0), true);
    // ...but an empty row never is.
    assert.equal(analytics.isNewPersonalRecord(0, 5, 0), false);
    assert.equal(analytics.isNewPersonalRecord(100, 0, 0), false);
  });

  // --- Fixtures: three bench sessions + a block of runs ---------------------
  // Written through raw SQL so the dates (and therefore the ordering assertions
  // below) are exact; the read helpers are what these checks exercise.
  const insertStrengthSession = ({ sessionId, title, completedAt, exerciseId, sets }) => {
    raw
      .prepare(
        `INSERT INTO session_logs
           (id, program_day_id, session_type, title, started_at, completed_at, sync_status)
         VALUES (?, NULL, 'strength', ?, ?, ?, 'synced')`,
      )
      .run(sessionId, title, completedAt, completedAt);
    const blockId = `${sessionId}:block0`;
    raw
      .prepare(
        `INSERT INTO session_exercise_blocks
           (id, session_id, order_index, exercise_id, substituted_from_exercise_id,
            rest_seconds, notes, target_sets, target_reps)
         VALUES (?, ?, 0, ?, NULL, 120, NULL, ?, '6-8')`,
      )
      .run(blockId, sessionId, exerciseId, sets.length);
    for (const [index, set] of sets.entries()) {
      raw
        .prepare(
          `INSERT INTO set_logs
             (id, block_id, set_number, set_type, target_weight_kg, actual_weight_kg,
              target_reps, actual_reps, rpe, completed_at)
           VALUES (?, ?, ?, ?, NULL, ?, '6-8', ?, ?, ?)`,
        )
        .run(
          `${sessionId}:set${index}`,
          blockId,
          set.setNumber,
          set.setType,
          set.actualWeightKg,
          set.actualReps,
          set.rpe ?? null,
          completedAt,
        );
    }
  };

  insertStrengthSession({
    sessionId: 'sess_pr_1',
    title: 'Bench day 1',
    completedAt: '2026-10-01T10:00:00.000Z',
    exerciseId: 'bench_press',
    sets: [makeSet(1, 'working', 100, 5, 8)], // 1RM 121.7
  });
  insertStrengthSession({
    sessionId: 'sess_pr_2',
    title: 'Bench day 2',
    completedAt: '2026-10-08T10:00:00.000Z',
    exerciseId: 'bench_press',
    sets: [
      makeSet(1, 'working', 105, 5, 9), // 1RM 124.0 -> all-time best
      makeSet(2, 'working', 105, 4, 9.5), // 1RM 118.5
    ],
  });
  insertStrengthSession({
    sessionId: 'sess_pr_3',
    title: 'Bench day 3',
    completedAt: '2026-10-15T10:00:00.000Z',
    exerciseId: 'bench_press',
    sets: [makeSet(1, 'working', 110, 3, 9)], // 1RM 122.3
  });
  insertStrengthSession({
    sessionId: 'sess_press_1',
    title: 'Press day',
    completedAt: '2026-10-18T10:00:00.000Z',
    exerciseId: 'overhead_press',
    sets: [makeSet(1, 'warmup', 40, 10, 6), makeSet(2, 'working', 60, 8, 8)],
  });

  const lastPerformance = await repository.getLastPerformanceForExercises(db, [
    'bench_press',
    'overhead_press',
    'not_an_exercise',
  ]);

  await check('getLastPerformanceForExercises returns the latest session per exercise', () => {
    assert.equal(lastPerformance.size, 2); // exercises without history are absent
    assert.equal(lastPerformance.has('not_an_exercise'), false);

    const bench = lastPerformance.get('bench_press');
    assert.equal(bench.sessionId, 'sess_pr_3');
    assert.equal(bench.sessionTitle, 'Bench day 3');
    assert.equal(bench.completedAt, '2026-10-15T10:00:00.000Z');
    assert.equal(bench.sets.length, 1);
    assert.equal(bench.sets[0].setNumber, 1);
    assert.equal(bench.sets[0].setType, 'working');
    assert.equal(bench.sets[0].actualWeightKg, 110);
    assert.equal(bench.sets[0].actualReps, 3);
    assert.equal(bench.sets[0].rpe, 9);
    assert.equal(bench.topSet.weightKg, 110);
    assert.equal(bench.topSet.reps, 3);
    assert.equal(bench.topSet.oneRepMaxKg, 122.3);
    // The all-time best is still the 105 x 5 @9 two sessions earlier.
    assert.equal(bench.bestOneRepMaxKg, 124);
    assert.equal(bench.bestSet.weightKg, 105);
    assert.equal(bench.bestSet.reps, 5);
    assert.equal(bench.bestSet.sessionId, 'sess_pr_2');
  });

  await check('getLastPerformanceForExercises keeps warmups out of the reference set', () => {
    const press = lastPerformance.get('overhead_press');
    assert.equal(press.sets.length, 2);
    assert.equal(press.topSet.weightKg, 60);
    assert.equal(press.bestSet.weightKg, 60);
  });

  await check('getLastPerformanceForExercises honours excludeSessionId', async () => {
    const withoutLatest = await repository.getLastPerformanceForExercises(db, ['bench_press'], 'sess_pr_3');
    const bench = withoutLatest.get('bench_press');
    assert.equal(bench.sessionId, 'sess_pr_2');
    assert.equal(bench.sets.length, 2);
    assert.equal(bench.completedAt, '2026-10-08T10:00:00.000Z');

    // Excluding the session that holds the PR lowers the all-time best too.
    const withoutPr = await repository.getLastPerformanceForExercises(db, ['bench_press'], 'sess_pr_2');
    const afterPr = withoutPr.get('bench_press');
    assert.equal(afterPr.sessionId, 'sess_pr_3');
    assert.equal(afterPr.bestOneRepMaxKg, 122.3);
    assert.equal(afterPr.bestSet.sessionId, 'sess_pr_3');

    // Excluding the exercise's only session removes it from the map entirely.
    const pressOnly = await repository.getLastPerformanceForExercises(db, ['overhead_press'], 'sess_press_1');
    assert.equal(pressOnly.size, 0);
  });

  await check('getLastPerformanceForExercises short-circuits an empty id list', async () => {
    const empty = await repository.getLastPerformanceForExercises(db, []);
    assert.equal(empty.size, 0);
  });

  await check('getExerciseProgressionStats returns chronological session history', async () => {
    const stats = await repository.getExerciseProgressionStats(db, 'bench_press');
    assert.equal(stats.length, 3);
    assert.deepEqual(
      stats.map((point) => point.date),
      ['2026-10-01T10:00:00.000Z', '2026-10-08T10:00:00.000Z', '2026-10-15T10:00:00.000Z'],
    );
    assert.equal(stats[0].sessionId, 'sess_pr_1');
    assert.equal(stats[0].topWeightKg, 100);
    assert.equal(stats[0].topReps, 5);
    assert.equal(stats[0].estimatedOneRepMaxKg, 121.7);
    assert.equal(stats[0].volumeKg, 500);
    assert.equal(stats[0].setCount, 1);

    assert.equal(stats[1].topWeightKg, 105);
    assert.equal(stats[1].topReps, 5);
    assert.equal(stats[1].estimatedOneRepMaxKg, 124);
    assert.equal(stats[1].volumeKg, 945); // 105x5 + 105x4
    assert.equal(stats[1].setCount, 2);

    assert.equal(stats[2].volumeKg, 330);
    assert.equal(stats[2].estimatedOneRepMaxKg, 122.3);
  });

  await check('getExerciseProgressionStats keeps the most recent N sessions', async () => {
    const limited = await repository.getExerciseProgressionStats(db, 'bench_press', 2);
    assert.equal(limited.length, 2);
    assert.equal(limited[0].sessionId, 'sess_pr_2');
    assert.equal(limited[1].sessionId, 'sess_pr_3');
  });

  await check('getExerciseProgressionStats is empty for an exercise with no sets', async () => {
    assert.deepEqual(await repository.getExerciseProgressionStats(db, 'seated_calf_raise'), []);
  });

  const insertRun = (sessionId, title, completedAt, distanceKm, durationSeconds, rpe) => {
    raw
      .prepare(
        `INSERT INTO session_logs
           (id, program_day_id, session_type, title, started_at, completed_at, sync_status)
         VALUES (?, NULL, 'running', ?, ?, ?, 'synced')`,
      )
      .run(sessionId, title, completedAt, completedAt);
    raw
      .prepare(
        `INSERT INTO running_metrics
           (session_id, distance_km, duration_seconds, avg_pace_seconds_per_km, perceived_effort_rpe)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(sessionId, distanceKm, durationSeconds, durationSeconds / distanceKm, rpe);
  };

  insertRun('run_easy_1', 'Easy 5K', '2026-09-20T07:00:00.000Z', 5, 1800, 7); // 6:00/km
  insertRun('run_easy_2', 'Easy 5K', '2026-09-27T07:00:00.000Z', 5, 1650, 8); // 5:30/km
  insertRun('run_long_3', 'Long 7K', '2026-10-04T07:00:00.000Z', 7, 2380, 7); // 5:40/km
  insertRun('run_tempo_4', 'Tempo 5.2K', '2026-10-11T07:00:00.000Z', 5.2, 1612, 8); // 5:10/km
  insertRun('run_long_10k', 'Long 10K', '2026-10-18T07:00:00.000Z', 10, 3000, 6); // 5:00/km

  const runs = await repository.getRunningProgressionStats(db);

  await check('getRunningProgressionStats returns recent runs oldest first', async () => {
    assert.equal(runs.length, 5);
    assert.equal(runs[0].sessionId, 'run_easy_1');
    assert.equal(runs[4].sessionId, 'run_long_10k');
    assert.equal(runs[0].distanceKm, 5);
    assert.equal(runs[0].durationSeconds, 1800);
    assert.equal(runs[0].avgPaceSecondsPerKm, 360);
    assert.equal(runs[0].rpe, 7);
    assert.equal(runs[4].avgPaceSecondsPerKm, 300);

    const limited = await repository.getRunningProgressionStats(db, 2);
    assert.deepEqual(
      limited.map((run) => run.sessionId),
      ['run_tempo_4', 'run_long_10k'],
    );
  });

  await check('summarizeRunningProgression totals km, best 5K/7K pace, and trend', () => {
    const summary = analytics.summarizeRunningProgression(runs);
    assert.equal(summary.sessionCount, 5);
    assert.equal(summary.totalDistanceKm, 32.2);
    assert.equal(summary.averagePaceSecondsPerKm, 328); // (360+330+340+310+300) / 5
    assert.equal(summary.best5k.paceSecondsPerKm, 310);
    assert.equal(summary.best5k.distanceKm, 5.2);
    assert.equal(summary.best5k.sessionId, 'run_tempo_4');
    // The 10K is too far from either nominal distance to count as a 7K effort.
    assert.equal(summary.best7k.paceSecondsPerKm, 340);
    assert.equal(summary.best7k.sessionId, 'run_long_3');
    assert.equal(summary.trend, 'improving');

    const empty = analytics.summarizeRunningProgression([]);
    assert.equal(empty.sessionCount, 0);
    assert.equal(empty.totalDistanceKm, 0);
    assert.equal(empty.trend, 'none');
    assert.equal(empty.best5k, undefined);

    // A single run cannot show a trend; a slower recent block declines.
    assert.equal(
      analytics.computeRunningTrend([
        { sessionId: 'a', date: '2026-01-01T00:00:00.000Z', distanceKm: 5, durationSeconds: 1500, avgPaceSecondsPerKm: 300 },
      ]),
      'none',
    );
    assert.equal(
      analytics.computeRunningTrend([
        { sessionId: 'a', date: '2026-01-01T00:00:00.000Z', distanceKm: 5, durationSeconds: 1500, avgPaceSecondsPerKm: 300 },
        { sessionId: 'b', date: '2026-01-08T00:00:00.000Z', distanceKm: 5, durationSeconds: 1600, avgPaceSecondsPerKm: 320 },
      ]),
      'declining',
    );
  });

  await check('totalVolumeKg drops warmups unless asked for them', () => {
    const sets = [
      makeSet(1, 'warmup', 40, 10),
      makeSet(2, 'working', 100, 5),
    ];
    assert.equal(analytics.totalVolumeKg(sets), 500);
    assert.equal(analytics.totalVolumeKg(sets, { includeWarmups: true }), 900);
  });

  console.log('\nlogger drafts: prefill + PR badges (phase 5)');

  const draftBlock = {
    id: 'block_draft',
    sessionId: 'sess_draft',
    orderIndex: 0,
    exerciseId: 'bench_press',
    restSeconds: 120,
    targetSets: 4,
    targetReps: '6-8',
    sets: [],
  };
  const previousForDrafts = [makeSet(1, 'working', 100, 8, 8), makeSet(2, 'working', 100, 8, 8)];

  await check('prefillValues copies a matching set and falls back to the last one', () => {
    assert.equal(loggerDrafts.prefillValues(1, []), null);
    assert.equal(loggerDrafts.prefillValues(1, [makeSet(1, 'working', 0, 0)]), null);
    assert.deepEqual(loggerDrafts.prefillValues(2, previousForDrafts), { weight: '100', reps: '8' });
    // Today's prescription has more sets than were performed last time.
    assert.deepEqual(loggerDrafts.prefillValues(4, previousForDrafts), { weight: '100', reps: '8' });
  });

  await check('buildInitialDrafts prefills open rows so one tap logs a set', () => {
    const drafts = loggerDrafts.buildInitialDrafts(draftBlock, previousForDrafts);
    assert.equal(drafts.length, 4);
    assert.deepEqual(drafts.map((draft) => draft.weight), ['100', '100', '100', '100']);
    assert.deepEqual(drafts.map((draft) => draft.reps), ['8', '8', '8', '8']);
    // RPE is never inherited: it describes this set, not the last one.
    assert.deepEqual(drafts.map((draft) => draft.rpe), [null, null, null, null]);
    assert.ok(drafts.every((draft) => draft.completed === false && draft.setLogId === null));
    assert.equal(drafts[0].key, 'block_draft:1');
  });

  await check('buildInitialDrafts keeps logged rows and leaves rows empty without history', () => {
    const withLoggedSet = {
      ...draftBlock,
      sets: [
        {
          id: 'set_logged',
          setNumber: 1,
          setType: 'working',
          actualWeightKg: 105,
          actualReps: 6,
          rpe: 9,
          targetReps: '6-8',
          completedAt: '2026-10-20T10:00:00.000Z',
        },
      ],
    };
    const drafts = loggerDrafts.buildInitialDrafts(withLoggedSet, previousForDrafts);
    assert.equal(drafts.length, 4);
    assert.equal(drafts[0].completed, true);
    assert.equal(drafts[0].setLogId, 'set_logged');
    assert.equal(drafts[0].weight, '105');
    assert.equal(drafts[0].rpe, 9);
    assert.equal(drafts[1].completed, false);
    assert.equal(drafts[1].weight, '100');

    const empty = loggerDrafts.buildInitialDrafts(draftBlock, []);
    assert.equal(empty.length, 4);
    assert.ok(empty.every((draft) => draft.weight === '' && draft.reps === ''));
  });

  const makeDraft = (key, setNumber, weight, reps, rpe, completed = true) => ({
    key,
    setNumber,
    setType: 'working',
    weight,
    reps,
    rpe,
    setLogId: completed ? `log_${key}` : null,
    completed,
  });

  await check('findPersonalRecords flags only rows that beat the previous best', () => {
    const records = loggerDrafts.findPersonalRecords(
      [makeDraft('a', 1, '110', '3', 9), makeDraft('b', 2, '110', '4', 9)],
      124,
    );
    // 110x3 @9 estimates 122.3 (below the 124 baseline); 110x4 @9 estimates 126.0.
    assert.deepEqual(Object.keys(records), ['b']);
    assert.equal(records.b, 126);
  });

  await check('findPersonalRecords treats the first-ever set as a PR and skips open rows', () => {
    const records = loggerDrafts.findPersonalRecords(
      [makeDraft('a', 1, '100', '5', 8), makeDraft('b', 2, '', '', null, false)],
      0,
    );
    assert.deepEqual(Object.keys(records), ['a']);
    assert.equal(records.a, 121.7);
    // Unchecking a row drops its badge.
    assert.deepEqual(
      loggerDrafts.findPersonalRecords([makeDraft('a', 1, '100', '5', 8, false)], 0),
      {},
    );
  });

  await check('findPersonalRecords walks the session PR chain in set order', () => {
    const records = loggerDrafts.findPersonalRecords(
      [
        makeDraft('a', 1, '100', '8', 8),
        makeDraft('b', 2, '102.5', '8', 8),
        makeDraft('c', 3, '100', '8', 8),
      ],
      0,
    );
    // 1 and 2 raise the bar; 3 repeats set 1's load, so it is no longer a PR.
    assert.deepEqual(Object.keys(records), ['a', 'b']);
    assert.equal(records.a, 133.3);
    assert.equal(records.b, 136.7);
  });

  console.log('\nplate calculator (phase 6)');

  await check('calculatePlatesPerSide loads exact plates for a barbell weight', () => {
    const calc = plateCalculator.calculatePlatesPerSide(100, 20);
    // 100 - 20 = 80 over two sides -> 40 kg/side = 25 + 15.
    assert.equal(calc.achievableWeightKg, 100);
    assert.equal(calc.exact, true);
    assert.equal(calc.shortfallKg, 0);
    assert.deepEqual(calc.platesPerSide, [
      { plateKg: 25, countPerSide: 1 },
      { plateKg: 15, countPerSide: 1 },
    ]);
    assert.equal(plateCalculator.totalPlateCount(calc), 4);
  });

  await check('calculatePlatesPerSide reports the closest weight below an unloadable target', () => {
    const calc = plateCalculator.calculatePlatesPerSide(43, 20);
    // 11.5 kg/side -> 10 + 1.25 = 11.25 -> 42.5 kg total.
    assert.equal(calc.achievableWeightKg, 42.5);
    assert.equal(calc.exact, false);
    assert.equal(calc.shortfallKg, 0.5);
    assert.deepEqual(calc.platesPerSide, [
      { plateKg: 10, countPerSide: 1 },
      { plateKg: 1.25, countPerSide: 1 },
    ]);
  });

  await check('calculatePlatesPerSide handles bar-only and below-bar targets', () => {
    const barOnly = plateCalculator.calculatePlatesPerSide(20, 20);
    assert.deepEqual(barOnly.platesPerSide, []);
    assert.equal(barOnly.achievableWeightKg, 20);
    assert.equal(barOnly.exact, true);

    const below = plateCalculator.calculatePlatesPerSide(15, 20);
    assert.equal(below.achievableWeightKg, 20);
    assert.equal(below.exact, false);
    assert.equal(below.shortfallKg, 0);
  });

  await check('shouldOfferPlateCalculator gates the barbell family', () => {
    assert.equal(plateCalculator.shouldOfferPlateCalculator({ equipment: 'barbell', id: 'bench_press' }), true);
    assert.equal(plateCalculator.shouldOfferPlateCalculator({ equipment: 'specialty_bar', id: 'safety_bar_squat' }), true);
    assert.equal(plateCalculator.shouldOfferPlateCalculator({ equipment: 'machine', id: 'belt_squat' }), true);
    assert.equal(plateCalculator.shouldOfferPlateCalculator({ equipment: 'machine', id: 'hack_squat' }), false);
    assert.equal(plateCalculator.shouldOfferPlateCalculator({ equipment: 'dumbbell', id: 'dumbbell_bench' }), false);
  });

  console.log('\nmid-workout mutation (phase 6)');

  const mutTemplate = templates.find((template) => template.title === 'Upper A');
  const mutSessionId = await repository.startSessionFromTemplate(db, mutTemplate);
  const mutInitial = await repository.getSessionDetail(db, mutSessionId);
  const initialBlockCount = mutInitial.exerciseBlocks.length;

  await check('appendExerciseBlockToSession appends a block at the end', async () => {
    const blockId = await repository.appendExerciseBlockToSession(db, mutSessionId, 'barbell_row');
    const detail = await repository.getSessionDetail(db, mutSessionId);
    assert.equal(detail.exerciseBlocks.length, initialBlockCount + 1);
    const last = detail.exerciseBlocks[detail.exerciseBlocks.length - 1];
    assert.equal(last.id, blockId);
    assert.equal(last.exerciseId, 'barbell_row');
    assert.equal(last.orderIndex, initialBlockCount);
  });

  await check('appendExerciseBlockToSession rejects an unknown exercise', async () => {
    await assert.rejects(
      () => repository.appendExerciseBlockToSession(db, mutSessionId, 'does_not_exist'),
      /not in the catalog/,
    );
  });

  await check('reorderSessionBlocks rewrites order_index for a permutation', async () => {
    const before = (await repository.getSessionDetail(db, mutSessionId)).exerciseBlocks.map((b) => b.id);
    const reversed = [...before].reverse();
    await repository.reorderSessionBlocks(db, mutSessionId, reversed);
    const after = (await repository.getSessionDetail(db, mutSessionId)).exerciseBlocks;
    assert.deepEqual(after.map((b) => b.id), reversed);
    assert.deepEqual(after.map((b) => b.orderIndex), after.map((_, index) => index));
  });

  await check('reorderSessionBlocks rejects a non-permutation', async () => {
    await assert.rejects(
      () => repository.reorderSessionBlocks(db, mutSessionId, ['not-a-block']),
      /do not match/,
    );
  });

  await check('removeExerciseBlockFromSession drops the block and re-indexes', async () => {
    const before = (await repository.getSessionDetail(db, mutSessionId)).exerciseBlocks;
    const victim = before[0];
    const removed = await repository.removeExerciseBlockFromSession(db, victim.id);
    assert.equal(removed, true);
    const after = (await repository.getSessionDetail(db, mutSessionId)).exerciseBlocks;
    assert.equal(after.length, before.length - 1);
    assert.equal(after.some((b) => b.id === victim.id), false);
    assert.deepEqual(after.map((b) => b.orderIndex), after.map((_, index) => index));
  });

  const setBlock = (await repository.getSessionDetail(db, mutSessionId)).exerciseBlocks[0];

  await check('appendSetToBlock prefills and numbers appended sets', async () => {
    const first = await repository.appendSetToBlock(db, setBlock.id);
    assert.equal(first.setNumber, 1);
    assert.equal(first.setType, 'working');
    assert.equal(first.targetReps, setBlock.targetReps ?? '8-10');

    const second = await repository.appendSetToBlock(db, setBlock.id);
    assert.equal(second.setNumber, 2);
    // Prefilled from the previous set in the block.
    assert.equal(second.actualWeightKg, first.actualWeightKg);
    assert.equal(second.actualReps, first.actualReps);
    assert.equal(second.setType, first.setType);
  });

  await check('removeSetFromBlock deletes a set and re-indexes the rest', async () => {
    const removed = await repository.removeSetFromBlock(db, setBlock.id, 1);
    assert.equal(removed, true);
    const remaining = raw
      .prepare('SELECT set_number FROM set_logs WHERE block_id = ? ORDER BY set_number')
      .all(setBlock.id);
    assert.deepEqual(remaining.map((row) => row.set_number), [1]); // old set 2 slid down
  });

  await check('removeSetFromBlock is a no-op for a missing set number', async () => {
    const removed = await repository.removeSetFromBlock(db, setBlock.id, 99);
    assert.equal(removed, false);
  });

  await check('mutation helpers refuse a completed session', async () => {
    await assert.rejects(
      () => repository.appendSetToBlock(db, firstBlock.id),
      /already completed/,
    );
    await assert.rejects(
      () => repository.removeExerciseBlockFromSession(db, firstBlock.id),
      /already completed/,
    );
    await assert.rejects(
      () => repository.appendExerciseBlockToSession(db, lowerSessionId, 'barbell_row'),
      /not active/,
    );
  });

  console.log('\nschema v5: billing + coach sync (phase 7A)');

  await check('migration v5 creates the coaching + billing tables and template columns', () => {
    const tables = raw
      .prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
      .all()
      .map((row) => row.name);
    assert.ok(tables.includes('client_billing_profiles'));
    assert.ok(tables.includes('coaching_slots'));
    assert.ok(tables.includes('coaching_bookings'));
    const columns = raw
      .prepare('PRAGMA table_info(workout_templates)')
      .all()
      .map((row) => row.name);
    assert.ok(columns.includes('source'));
    assert.ok(columns.includes('coach_note'));
    assert.ok(columns.includes('assigned_at'));
    // User-built templates were re-tagged off the 'seed' default by the migration.
    const custom = raw
      .prepare("SELECT source FROM workout_templates WHERE id = ?")
      .get(customHack.id);
    assert.equal(custom.source, 'custom');
  });

  await check('billing validation requires the mandatory contact fields', () => {
    const empty = billing.createEmptyBillingInput(repository.USER_PROFILE_ID);
    assert.equal(empty.billingCountry, 'Magyarország');
    const missing = billing.validateClientBillingProfile(empty);
    assert.equal(missing.valid, false);
    for (const field of ['fullName', 'email', 'phone', 'billingZip', 'billingCity', 'billingAddress']) {
      assert.ok(missing.missingFields.includes(field), `expected ${field} to be required`);
    }

    const badEmail = billing.validateClientBillingProfile({
      ...empty,
      fullName: 'Kovács Anna',
      email: 'not-an-email',
      phone: '+36 30 123 4567',
      billingName: 'Kovács Anna',
      billingZip: '1052',
      billingCity: 'Budapest',
      billingAddress: 'Váci utca 12.',
    });
    assert.equal(badEmail.valid, false);
    assert.equal(badEmail.invalidEmail, true);
    assert.equal(badEmail.missingFields.length, 0);

    assert.equal(billing.isValidEmail('anna@example.com'), true);
    assert.equal(billing.isValidEmail('nope'), false);
  });

  const billingInput = {
    userId: repository.USER_PROFILE_ID,
    fullName: 'Kovács Anna',
    email: 'anna@example.com',
    phone: '+36 30 123 4567',
    billingName: 'Kovács Anna',
    billingCountry: 'Magyarország',
    billingZip: '1052',
    billingCity: 'Budapest',
    billingAddress: 'Váci utca 12.',
    taxNumber: '12345678-1-42',
  };
  await repository.saveClientBillingProfile(db, billingInput);

  await check('saveClientBillingProfile persists and round-trips every field', async () => {
    const saved = await repository.getClientBillingProfile(db);
    assert.ok(saved !== null);
    assert.equal(saved.userId, repository.USER_PROFILE_ID);
    assert.equal(saved.fullName, 'Kovács Anna');
    assert.equal(saved.email, 'anna@example.com');
    assert.equal(saved.phone, '+36 30 123 4567');
    assert.equal(saved.billingZip, '1052');
    assert.equal(saved.billingCity, 'Budapest');
    assert.equal(saved.billingAddress, 'Váci utca 12.');
    assert.equal(saved.billingCountry, 'Magyarország');
    assert.equal(saved.taxNumber, '12345678-1-42');
    assert.ok(saved.updatedAt.length > 0);
  });

  await check('re-saving updates the single row and clears an omitted tax number', async () => {
    await repository.saveClientBillingProfile(db, {
      ...billingInput,
      billingName: 'Példa Kft.',
      taxNumber: undefined,
    });
    assert.equal(raw.prepare('SELECT COUNT(*) AS c FROM client_billing_profiles').get().c, 1);
    const saved = await repository.getClientBillingProfile(db);
    assert.equal(saved.billingName, 'Példa Kft.');
    assert.equal(saved.taxNumber, undefined);
  });

  await check('a blank billing country falls back to the default', async () => {
    const saved = await repository.saveClientBillingProfile(db, {
      ...billingInput,
      billingCountry: '   ',
    });
    assert.equal(saved.billingCountry, 'Magyarország');
  });

  await check('buildClientSyncPullPayload attaches the saved billing profile', async () => {
    const pull = await buildClientSyncPullPayload(db);
    assert.ok(pull.billingProfile !== null);
    assert.equal(pull.billingProfile.fullName, 'Kovács Anna');
    assert.equal(pull.billingProfile.billingZip, '1052');
  });

  console.log('\ncoach-assigned plans (phase 7A)');

  const coachTemplate = await repository.assignCoachTemplate(db, {
    id: 'tpl_coach_1',
    title: 'Edzői terv — Guggolás fókusz',
    sessionType: 'strength',
    goal: 'strength',
    coachNote: 'Heti 2x guggolás a térdkímélő sávban.',
    blocks: [{ exerciseId: 'front_squat', targetSets: 5, targetReps: '5', restSeconds: 180 }],
  });

  await check('assignCoachTemplate marks the plan as coach-assigned with a note', () => {
    assert.equal(coachTemplate.source, 'coach');
    assert.equal(coachTemplate.coachNote, 'Heti 2x guggolás a térdkímélő sávban.');
    assert.ok(coachTemplate.assignedAt.length > 0);
    assert.equal(coachTemplate.exercises.length, 1);
    assert.equal(coachTemplate.exercises[0].exerciseId, 'front_squat');
  });

  await check('coach-assigned plans group together and sort to the top', async () => {
    const all = await repository.getWorkoutTemplates(db);
    assert.equal(all[0].id, 'tpl_coach_1'); // coach-first ordering
    const coachOnly = await repository.getCoachAssignedTemplates(db);
    assert.deepEqual(coachOnly.map((template) => template.id), ['tpl_coach_1']);
    // Everything else keeps its seed/custom source.
    assert.ok(all.some((template) => template.source === 'custom'));
    assert.ok(all.some((template) => template.source === 'seed'));
  });

  console.log('\ncoaching slots + bookings (phase 7A)');

  const slotNow = new Date('2026-11-05T08:00:00.000Z');

  await check('seedCoachingSlots seeds upcoming online + IRL slots and is idempotent', async () => {
    const inserted = await repository.seedCoachingSlots(db, slotNow);
    assert.equal(inserted, 5);
    assert.equal(await repository.seedCoachingSlots(db, slotNow), 0);
    const slots = await repository.getCoachingSlots(db);
    assert.equal(slots.length, 5);
    assert.ok(slots.some((slot) => slot.modality === 'online_call'));
    assert.ok(slots.some((slot) => slot.modality === 'irl_gym'));
    assert.ok(slots.every((slot) => slot.isBooked === false));
    const open = await repository.getOpenCoachingSlots(db, slotNow);
    assert.equal(open.length, 5);
    // Soonest first.
    assert.ok(open[0].startsAt <= open[open.length - 1].startsAt);
  });

  const openSlots = await repository.getOpenCoachingSlots(db, slotNow);
  const onlineSlot = openSlots.find((slot) => slot.modality === 'online_call');
  const booked = await repository.createCoachingBooking(
    db,
    onlineSlot.id,
    'Technika átnézés',
  );

  await check('createCoachingBooking writes a pending local_dirty booking and books the slot', () => {
    assert.equal(booked.status, 'pending');
    assert.equal(booked.syncStatus, 'local_dirty');
    assert.equal(booked.slotId, onlineSlot.id);
    assert.equal(booked.modality, 'online_call');
    assert.equal(booked.clientNotes, 'Technika átnézés');
    assert.equal(booked.userId, repository.USER_PROFILE_ID);
    assert.ok(booked.createdAt.length > 0);
    const slotRow = raw.prepare('SELECT is_booked FROM coaching_slots WHERE id = ?').get(onlineSlot.id);
    assert.equal(slotRow.is_booked, 1);
  });

  await check('booking an already-booked or unknown slot is rejected', async () => {
    await assert.rejects(
      () => repository.createCoachingBooking(db, onlineSlot.id),
      /már le van foglalva/,
    );
    await assert.rejects(
      () => repository.createCoachingBooking(db, 'slot_missing'),
      /Ismeretlen időpont/,
    );
  });

  await check('open slots exclude the booked one', async () => {
    const open = await repository.getOpenCoachingSlots(db, slotNow);
    assert.equal(open.length, 4);
    assert.equal(open.some((slot) => slot.id === onlineSlot.id), false);
    assert.equal((await repository.getCoachingBookings(db)).length, 1);
  });

  await check('cancelCoachingBooking cancels the booking and frees the slot', async () => {
    const cancelled = await repository.cancelCoachingBooking(db, booked.id);
    assert.equal(cancelled, true);
    const row = raw
      .prepare('SELECT status, sync_status FROM coaching_bookings WHERE id = ?')
      .get(booked.id);
    assert.equal(row.status, 'cancelled');
    assert.equal(row.sync_status, 'local_dirty');
    const slotRow = raw.prepare('SELECT is_booked FROM coaching_slots WHERE id = ?').get(onlineSlot.id);
    assert.equal(slotRow.is_booked, 0);
    // Cancelling twice is a no-op; the slot is open again.
    assert.equal(await repository.cancelCoachingBooking(db, booked.id), false);
    const open = await repository.getOpenCoachingSlots(db, slotNow);
    assert.equal(open.length, 5);
  });

  await check('buildClientSyncPushPayload carries dirty bookings and sessions', async () => {
    const dirty = await repository.getDirtyCoachingBookings(db);
    assert.ok(dirty.some((booking) => booking.id === booked.id));
    const push = await buildClientSyncPushPayload(db);
    assert.ok(push.batchId.startsWith('sync_'));
    assert.equal(push.deviceId, repository.USER_PROFILE_ID);
    assert.ok(push.bookings.some((booking) => booking.id === booked.id));
    assert.ok(push.sessions.length > 0);
  });

  await check('markCoachingBookingsSynced flips only the given bookings', async () => {
    const changed = await repository.markCoachingBookingsSynced(db, [booked.id]);
    assert.equal(changed, 1);
    const row = raw
      .prepare('SELECT sync_status FROM coaching_bookings WHERE id = ?')
      .get(booked.id);
    assert.equal(row.sync_status, 'synced');
    assert.equal((await repository.getDirtyCoachingBookings(db)).length, 0);
  });

  console.log('\nfull backup + restore (phase 6)');

  const snapshotJson = await backupService.exportFullDatabaseSnapshot(db);

  await check('exportFullDatabaseSnapshot serializes a valid, complete snapshot', () => {
    const parsed = JSON.parse(snapshotJson);
    assert.equal(parsed.format, 'workoutapp.backup');
    assert.equal(parsed.schemaVersion, SCHEMA_VERSION);
    assert.ok(parsed.data.profile !== null);
    assert.equal(parsed.data.profile.id, repository.USER_PROFILE_ID);
    assert.ok(parsed.data.sessionLogs.length > 0);
    assert.ok(parsed.data.setLogs.length > 0);
    assert.ok(parsed.data.customTemplates.some((template) => template.id === customHack.id));
    assert.ok(parsed.data.runningMetrics.length > 0);
    // Phase 7A additions ride along in the snapshot.
    assert.ok(parsed.data.clientBillingProfile !== null);
    assert.equal(parsed.data.clientBillingProfile.billing_city, 'Budapest');
    assert.equal(parsed.data.coachingSlots.length, 5);
    assert.ok(parsed.data.coachingBookings.length >= 1);
  });

  const sourceCounts = {
    sessions: raw.prepare('SELECT COUNT(*) AS c FROM session_logs').get().c,
    blocks: raw.prepare('SELECT COUNT(*) AS c FROM session_exercise_blocks').get().c,
    sets: raw.prepare('SELECT COUNT(*) AS c FROM set_logs').get().c,
    runs: raw.prepare('SELECT COUNT(*) AS c FROM running_metrics').get().c,
    customExercises: raw.prepare('SELECT COUNT(*) AS c FROM exercise_catalog WHERE is_custom = 1').get().c,
    coachingSlots: raw.prepare('SELECT COUNT(*) AS c FROM coaching_slots').get().c,
    coachingBookings: raw.prepare('SELECT COUNT(*) AS c FROM coaching_bookings').get().c,
  };

  const { db: restoreDb, raw: restoreRaw } = createDatabase();
  await migrate(restoreDb);
  await backupService.importFullDatabaseSnapshot(restoreDb, snapshotJson);

  await check('importFullDatabaseSnapshot restores the profile and constraints', async () => {
    const profile = await repository.getUserProfile(restoreDb);
    assert.ok(profile !== null);
    assert.equal(profile.biometrics.weightKg, 78.5);
    assert.equal(profile.trainingProfile.strengthDaysPerWeek, 4);
    assert.equal(profile.constraints.jointLimitations.length, 1);
    assert.equal(profile.constraints.jointLimitations[0].area, 'lower_back');
  });

  await check('importFullDatabaseSnapshot restores every session, block, set and run', () => {
    assert.equal(restoreRaw.prepare('SELECT COUNT(*) AS c FROM session_logs').get().c, sourceCounts.sessions);
    assert.equal(restoreRaw.prepare('SELECT COUNT(*) AS c FROM session_exercise_blocks').get().c, sourceCounts.blocks);
    assert.equal(restoreRaw.prepare('SELECT COUNT(*) AS c FROM set_logs').get().c, sourceCounts.sets);
    assert.equal(restoreRaw.prepare('SELECT COUNT(*) AS c FROM running_metrics').get().c, sourceCounts.runs);
    assert.equal(
      restoreRaw.prepare('SELECT COUNT(*) AS c FROM exercise_catalog WHERE is_custom = 1').get().c,
      sourceCounts.customExercises,
    );
  });

  await check('importFullDatabaseSnapshot restores the billing profile and coaching data', async () => {
    const restored = await repository.getClientBillingProfile(restoreDb);
    assert.ok(restored !== null);
    assert.equal(restored.fullName, 'Kovács Anna');
    assert.equal(restored.billingZip, '1052');
    assert.equal(restored.billingCountry, 'Magyarország');
    assert.equal(
      restoreRaw.prepare('SELECT COUNT(*) AS c FROM coaching_slots').get().c,
      sourceCounts.coachingSlots,
    );
    assert.equal(
      restoreRaw.prepare('SELECT COUNT(*) AS c FROM coaching_bookings').get().c,
      sourceCounts.coachingBookings,
    );
  });

  await check('a restored database round-trips through the read helpers', async () => {
    const history = await repository.getSessionHistory(restoreDb);
    assert.ok(history.length > 0);
    const bench = await repository.getLastPerformanceForExercises(restoreDb, ['bench_press']);
    assert.equal(bench.get('bench_press').bestOneRepMaxKg, 124);
    const progression = await repository.getExerciseProgressionStats(restoreDb, 'bench_press');
    assert.equal(progression.length, 3);
  });

  await check('restored database has no foreign key violations', () => {
    assert.deepEqual(restoreRaw.prepare('PRAGMA foreign_key_check').all(), []);
  });

  await check('importFullDatabaseSnapshot is atomic and leaves rows intact on bad input', async () => {
    const before = raw.prepare('SELECT COUNT(*) AS c FROM session_logs').get().c;
    await assert.rejects(
      () => backupService.importFullDatabaseSnapshot(db, 'not json'),
      /JSON/,
    );
    await assert.rejects(
      () => backupService.importFullDatabaseSnapshot(db, JSON.stringify({ format: 'nope' })),
      /WorkoutApp/,
    );
    assert.equal(raw.prepare('SELECT COUNT(*) AS c FROM session_logs').get().c, before);
  });

  restoreRaw.close();

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