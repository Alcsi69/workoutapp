/**
 * End-to-end verification of the Phase 7B coach platform.
 *
 * Boots the real `/server` HTTP API on an ephemeral port against an in-memory
 * `node:sqlite` database, then drives it exactly as production would:
 *
 *   1. simulate a mobile client (real mobile modules, compiled to .verify-build)
 *      pushing onboarding + billing + a completed workout + a booking request,
 *   2. simulate the coach confirming the booking and assigning a custom plan +
 *      publishing new slots through the admin REST API,
 *   3. pull the coach state and verify `applyClientSyncPullPayload` hydrates the
 *      client's SQLite database accurately.
 *
 * Run: npm run verify:server  (builds .verify-build + server/dist first)
 */

const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

// Server (real HTTP app).
const { startCoachServer } = require('../server/dist/server/src/server.js');

// Mobile modules (compiled CJS from src/, same as verify-db.cjs).
const { migrate, SCHEMA_VERSION } = require('../.verify-build/db/schema.js');
const { seedExerciseCatalog } = require('../.verify-build/db/seed.js');
const { EXERCISE_CATALOG } = require('../.verify-build/db/catalogData.js');
const repository = require('../.verify-build/db/repository.js');
const { buildClientSyncPushPayload } = require('../.verify-build/services/syncService.js');
const authService = require('../.verify-build/services/authService.js');

/** Thin async facade over node:sqlite matching the expo-sqlite API surface. */
function createMobileDatabase() {
  const raw = new DatabaseSync(':memory:');
  const normalize = (params) => params.map((param) => (param === undefined ? null : param));
  const db = {
    async execAsync(sql) {
      raw.exec(sql);
    },
    async runAsync(sql, ...params) {
      const result = raw.prepare(sql).run(...normalize(params));
      return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) };
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

/** Minimal JSON fetch helper returning { status, json } or { status, text }. */
async function http(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') ?? '';
  const asJson = contentType.includes('application/json');
  const body = asJson ? await response.json() : await response.text();
  return { status: response.status, body, contentType };
}

async function main() {
  const server = await startCoachServer({ dbPath: ':memory:', port: 0, host: '127.0.0.1' });
  const apiBase = server.url;
  const adminHtml = await http(`${apiBase}/admin`);

  const { db, raw } = createMobileDatabase();
  await migrate(db);
  await seedExerciseCatalog(db);

  console.log('\nserver bootstrap');
  await check('GET /api/health reports the service and the 157-exercise catalog', async () => {
    const res = await http(`${apiBase}/api/health`);
    assert.equal(res.status, 200);
    assert.equal(res.body.ok, true);
    assert.equal(res.body.exercises, EXERCISE_CATALOG.length);
  });

  await check('GET /admin serves the static admin web', () => {
    assert.equal(adminHtml.status, 200);
    assert.ok(String(adminHtml.contentType).includes('text/html'));
    assert.ok(String(adminHtml.body).includes('Edzői Admin'));
  });

  // --- 1. Simulate a mobile client pushing its whole state ------------------
  console.log('\nmobile client push');

  const onboarding = {
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
        { area: 'knees', severity: 'avoid_heavy_axial_load', notes: 'Terheléskorlátozás.' },
      ],
      excludedExerciseIds: ['hack_squat'],
      preferredSubstitutions: { hack_squat: 'belt_squat' },
    },
  };
  await repository.saveOnboardingPayload(db, onboarding);
  await repository.saveClientBillingProfile(db, {
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
  });

  // Log a real workout from a seeded template.
  await repository.seedDefaultTemplates(db);
  const templates = await repository.getWorkoutTemplates(db);
  const strengthTemplate = templates.find((t) => t.sessionType === 'strength');
  const sessionId = await repository.startSessionFromTemplate(db, strengthTemplate);
  const detail = await repository.getSessionDetail(db, sessionId);
  const firstBlock = detail.exerciseBlocks[0];
  await repository.upsertSetLog(db, firstBlock.id, {
    setNumber: 1,
    setType: 'working',
    actualWeightKg: 90,
    actualReps: 8,
    rpe: 8,
  });
  await repository.completeSession(db, sessionId);

  // Request a coaching session.
  await repository.seedCoachingSlots(db);
  const openSlots = await repository.getOpenCoachingSlots(db);
  const booking = await repository.createCoachingBooking(db, openSlots[0].id, 'Technika átnézés.');

  const pushPayload = await buildClientSyncPushPayload(db);
  const push = await http(`${apiBase}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(pushPayload),
  });

  await check('POST /api/sync/push ingests the client state', () => {
    assert.equal(push.status, 200);
    assert.equal(push.body.ok, true);
    assert.equal(push.body.sessions, pushPayload.sessions.length);
    assert.equal(push.body.bookings, pushPayload.bookings.length);
  });

  await check('buildClientSyncPushPayload carried profile + billing', () => {
    assert.equal(pushPayload.profile.userId, repository.USER_PROFILE_ID);
    assert.equal(pushPayload.billingProfile.billingZip, '1052');
    assert.ok(pushPayload.sessions.length >= 1);
  });

  // --- 2. Coach side: list clients, confirm booking, assign plan, add slots --
  console.log('\ncoach admin actions');

  await check('GET /api/admin/clients lists the synced client with billing + biometrics', async () => {
    const res = await http(`${apiBase}/api/admin/clients`);
    assert.equal(res.status, 200);
    const client = res.body.clients.find((c) => c.userId === repository.USER_PROFILE_ID);
    assert.ok(client !== undefined);
    assert.equal(client.billing.billingName, 'Kovács Anna');
    assert.equal(client.biometrics.weightKg, 78.5);
    assert.equal(client.jointConstraints[0].area, 'knees');
    assert.equal(client.completedSessionCount, 1);
  });

  await check('GET /api/admin/clients/:id returns the logged session with its exercises, sets and reps', async () => {
    const res = await http(
      `${apiBase}/api/admin/clients/${encodeURIComponent(repository.USER_PROFILE_ID)}`,
    );
    assert.equal(res.status, 200);
    assert.equal(res.body.sessions.length, 1, 'one pushed session');
    const session = res.body.sessions[0];
    assert.ok(
      Array.isArray(session.exerciseBlocks) && session.exerciseBlocks.length >= 1,
      'session carries its exercise blocks',
    );
    const block = session.exerciseBlocks[0];
    assert.ok(block.exercise && block.exercise.nameHu, 'block hydrated with the catalog name');
    assert.equal(block.sets.length, 1, 'the logged set is present');
    assert.equal(block.sets[0].setType, 'working');
    assert.equal(block.sets[0].actualWeightKg, 90);
    assert.equal(block.sets[0].actualReps, 8);
    assert.equal(block.sets[0].rpe, 8);
  });

  await check('GET /api/admin/exercises serves the 157-exercise catalog', async () => {
    const res = await http(`${apiBase}/api/admin/exercises`);
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 157);
    assert.equal(res.body.exercises.length, 157);
  });

  await check('PATCH /api/admin/bookings/:id confirms with coach notes + link', async () => {
    const res = await http(`${apiBase}/api/admin/bookings/${encodeURIComponent(booking.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'confirmed',
        coachNotes: 'Várunk a teremben, hozz térdvédőt.',
        locationOrLink: 'https://meet.example.com/coach/confirmed',
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.booking.status, 'confirmed');
    assert.equal(res.body.booking.coachNotes, 'Várunk a teremben, hozz térdvédőt.');
  });

  await check('POST /api/admin/clients/:id/templates assigns a coach plan', async () => {
    const res = await http(
      `${apiBase}/api/admin/clients/${encodeURIComponent(repository.USER_PROFILE_ID)}/templates`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: 'Edzői terv – Guggolás fókusz',
          sessionType: 'strength',
          coachNote: 'Térdkímélő: alacsony tengelyterhelés.',
          blocks: [
            { exerciseId: 'belt_squat', targetSets: 4, targetReps: '8-10', restSeconds: 150 },
            { exerciseId: 'romanian_deadlift', targetSets: 3, targetReps: '8', restSeconds: 120 },
          ],
        }),
      },
    );
    assert.equal(res.status, 201);
    assert.equal(res.body.template.source, 'coach');
    assert.equal(res.body.template.exercises.length, 2);
    assert.equal(res.body.template.exercises[0].exercise.id, 'belt_squat');
    assert.equal(res.body.template.exercises[0].exercise.axialLoadScore, 1);
  });

  await check('POST /api/admin/slots publishes a new open slot', async () => {
    const startsAt = new Date(Date.now() + 4 * 86400000).toISOString();
    const endsAt = new Date(Date.now() + 4 * 86400000 + 45 * 60000).toISOString();
    const res = await http(`${apiBase}/api/admin/slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        startsAt,
        endsAt,
        modality: 'online_call',
        locationOrLink: 'https://meet.example.com/coach/new-slot',
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.slot.modality, 'online_call');
    assert.equal(res.body.slot.isBooked, false);
  });

  await check('GET invoice-export returns JSON and CSV billing data', async () => {
    const json = await http(
      `${apiBase}/api/admin/clients/${encodeURIComponent(repository.USER_PROFILE_ID)}/invoice-export`,
    );
    assert.equal(json.status, 200);
    assert.equal(json.body.billing.billingName, 'Kovács Anna');
    assert.equal(json.body.billing.billingZip, '1052');
    assert.equal(json.body.billing.taxNumber, '12345678-1-42');
    assert.equal(json.body.sessionCount, 1);

    const csv = await http(
      `${apiBase}/api/admin/clients/${encodeURIComponent(repository.USER_PROFILE_ID)}/invoice-export?format=csv`,
    );
    assert.equal(csv.status, 200);
    assert.ok(String(csv.contentType).includes('text/csv'));
    assert.ok(String(csv.body).includes('Számlázási név'));
    assert.ok(String(csv.body).includes('Kovács Anna'));
    assert.ok(String(csv.body).includes('1052'));
  });

  // --- 3. Pull + apply on the client ---------------------------------------
  console.log('\nclient pull + apply');

  const pull = await http(
    `${apiBase}/api/sync/pull?userId=${encodeURIComponent(repository.USER_PROFILE_ID)}`,
  );

  await check('GET /api/sync/pull returns the coach assignments, bookings and slots', () => {
    assert.equal(pull.status, 200);
    assert.equal(pull.body.userId, repository.USER_PROFILE_ID);
    assert.ok(pull.body.templates.length >= 1);
    assert.equal(pull.body.templates[0].source, 'coach');
    assert.ok(pull.body.bookings.some((b) => b.id === booking.id && b.status === 'confirmed'));
    assert.ok(pull.body.slots.length >= 1);
  });

  await check('applyClientSyncPullPayload hydrates the mobile SQLite database', async () => {
    await repository.applyClientSyncPullPayload(db, pull.body);

    // Coach plan landed locally.
    const coachPlans = await repository.getCoachAssignedTemplates(db);
    assert.ok(coachPlans.length >= 1);
    const assigned = coachPlans.find((t) => t.title === 'Edzői terv – Guggolás fókusz');
    assert.ok(assigned !== undefined, 'coach plan present on device');
    assert.equal(assigned.coachNote, 'Térdkímélő: alacsony tengelyterhelés.');
    assert.equal(assigned.exercises.length, 2);
    assert.equal(assigned.exercises[0].exercise.id, 'belt_squat');

    // Booking status came back from the coach and is no longer dirty.
    const localBooking = (await repository.getCoachingBookings(db)).find((b) => b.id === booking.id);
    assert.equal(localBooking.status, 'confirmed');
    assert.equal(localBooking.coachNotes, 'Várunk a teremben, hozz térdvédőt.');
    assert.equal(localBooking.syncStatus, 'synced');

    // Open slots refreshed from the server.
    const slots = await repository.getCoachingSlots(db);
    assert.ok(slots.some((s) => !s.isBooked && s.modality === 'online_call'));
  });

  await check('no foreign key violations after the pull apply', () => {
    assert.deepEqual(raw.prepare('PRAGMA foreign_key_check').all(), []);
  });

  await check('mobile database schema version is the current one', () => {
    assert.equal(raw.prepare('PRAGMA user_version').get().user_version, SCHEMA_VERSION);
  });

  // --- 4. Phase 7D: username + password accounts ---------------------------
  console.log('\nauthentication');

  const billingProfile = {
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
  const accountUsername = 'Anna.Kovacs';
  const accountPassword = 'titkos-jelszo-123';

  const registered = await http(`${apiBase}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: accountUsername,
      password: accountPassword,
      userId: repository.USER_PROFILE_ID,
      profile: onboarding,
      billingProfile,
    }),
  });

  await check('POST /api/auth/register secures an existing profile (upgrade path)', () => {
    assert.equal(registered.status, 201);
    assert.equal(typeof registered.body.token, 'string');
    assert.ok(registered.body.token.length >= 32);
    assert.equal(registered.body.userId, repository.USER_PROFILE_ID);
    assert.equal(registered.body.username, accountUsername);
    assert.equal(registered.body.profile.biometrics.weightKg, 78.5);
    assert.equal(registered.body.billingProfile.billingZip, '1052');
    assert.equal(registered.body.sessions.length, 1);
  });

  await check('POST /api/auth/register creates a brand-new account with its own id', async () => {
    const res = await http(`${apiBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'uj.futas',
        password: 'futas-1234',
        profile: {
          ...onboarding,
          userId: 'ignored_local',
          biometrics: { age: 41, weightKg: 70, heightCm: 172 },
        },
      }),
    });
    assert.equal(res.status, 201);
    assert.notEqual(res.body.userId, repository.USER_PROFILE_ID);
    assert.match(res.body.userId, /^usr_/);
    assert.equal(res.body.profile.userId, res.body.userId);
    assert.equal(res.body.profile.biometrics.age, 41);
  });

  await check('POST /api/auth/register rejects a duplicate username (case-insensitive)', async () => {
    const res = await http(`${apiBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'anna.kovacs', password: 'mas-jelszo-9' }),
    });
    assert.equal(res.status, 409);
    assert.ok(String(res.body.error).includes('foglalt'));
  });

  await check('POST /api/auth/login accepts trimmed, case-insensitive username', async () => {
    const res = await http(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '  ANNA.KOVACS ', password: accountPassword }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.userId, repository.USER_PROFILE_ID);
    assert.equal(res.body.profile.biometrics.weightKg, 78.5);
    assert.equal(res.body.billingProfile.billingZip, '1052');
    assert.equal(res.body.sessions.length, 1);
    assert.ok(res.body.templates.some((template) => template.source === 'coach'));
  });

  await check('POST /api/auth/login rejects a wrong password', async () => {
    const res = await http(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: accountUsername, password: 'rossz-jelszo' }),
    });
    assert.equal(res.status, 401);
    assert.ok(String(res.body.error).includes('Hibás'));
  });

  await check('authenticated pull is scoped to the token user', async () => {
    const res = await http(`${apiBase}/api/sync/pull?userId=someone_else`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${registered.body.token}` },
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.userId, repository.USER_PROFILE_ID);
    assert.equal(res.body.profile.biometrics.weightKg, 78.5);
    assert.equal(res.body.sessions.length, 1);
  });

  await check('an invalid bearer token is rejected with 401', async () => {
    const res = await http(`${apiBase}/api/sync/pull?userId=${repository.USER_PROFILE_ID}`, {
      method: 'GET',
      headers: { Authorization: 'Bearer not-a-real-token' },
    });
    assert.equal(res.status, 401);
  });

  await check('authenticated push ignores a spoofed body userId', async () => {
    const res = await http(`${apiBase}/api/sync/push`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${registered.body.token}`,
      },
      body: JSON.stringify({
        ...pushPayload,
        deviceId: 'spoofed_device',
        profile: { ...onboarding, userId: 'spoofed_user' },
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.userId, repository.USER_PROFILE_ID);
    const spoofed = await http(`${apiBase}/api/admin/clients/spoofed_user`);
    assert.equal(spoofed.status, 404);
  });

  await check('cross-device login restores profile, billing and workout logs', async () => {
    const second = createMobileDatabase();
    try {
      await migrate(second.db);
      await seedExerciseCatalog(second.db);

      const state = await authService.loginWithCredentials(
        second.db,
        { username: accountUsername, password: accountPassword },
        `${apiBase}/api`,
      );
      assert.equal(state.userId, repository.USER_PROFILE_ID);

      // Session persisted locally for subsequent authenticated push/pull.
      const session = await repository.getLocalAuthSession(second.db);
      assert.ok(session !== null);
      assert.equal(session.username, accountUsername);

      // Onboarding profile + constraints restored — no re-onboarding needed.
      const profile = await repository.getUserProfile(second.db);
      assert.ok(profile !== null);
      assert.equal(profile.biometrics.weightKg, 78.5);
      assert.equal(profile.constraints.jointLimitations[0].area, 'knees');

      const billing = await repository.getClientBillingProfile(second.db);
      assert.equal(billing.billingZip, '1052');
      assert.equal(billing.taxNumber, '12345678-1-42');

      // Workout history restored with its logged set.
      const history = await repository.getSessionHistory(second.db);
      assert.equal(history.length, 1);
      const detail = await repository.getSessionDetail(second.db, history[0].id);
      assert.ok(detail !== null);
      assert.equal(detail.exerciseBlocks[0].sets[0].actualWeightKg, 90);
      assert.equal(detail.exerciseBlocks[0].sets[0].actualReps, 8);

      // The tailored program is regenerated and the coach plan came back.
      const templates = await repository.getWorkoutTemplates(second.db);
      assert.ok(templates.length >= 1);
      assert.ok(templates.some((template) => template.source === 'coach'));
    } finally {
      second.raw.close();
    }
  });

  raw.close();
  await server.close();

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
