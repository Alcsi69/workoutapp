/**
 * End-to-end verification of the coach platform and its auth model.
 *
 * Boots the real `/server` HTTP API on an ephemeral port against an in-memory
 * `node:sqlite` database, then drives it exactly as production would:
 *
 *   0. auth gate — every sync/user-data and admin endpoint answers 401 without a
 *      valid bearer token,
 *   1. registers User A, pushes A's profile + billing + workout + booking,
 *   2. drives the coach admin surface (with the admin token) and pulls as A,
 *   3. registers User B and proves multi-tenant isolation: B only ever sees B's
 *      rows, and a fresh client only ever hydrates from its own account.
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
const syncService = require('../.verify-build/services/syncService.js');
const authService = require('../.verify-build/services/authService.js');
const sheetImport = require('../server/dist/server/src/sheetImport.js');
const { buildClientSyncPushPayload } = syncService;

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

/** Fresh, migrated, catalog-seeded client database (as a brand-new device is). */
async function createFreshClientDatabase() {
  const handle = createMobileDatabase();
  await migrate(handle.db);
  await seedExerciseCatalog(handle.db);
  return handle;
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

/** Minimal JSON fetch helper returning { status, body, contentType }. */
async function http(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get('content-type') ?? '';
  const asJson = contentType.includes('application/json');
  const body = asJson ? await response.json() : await response.text();
  return { status: response.status, body, contentType };
}

/** Bearer header for a client account or the coach admin. */
function bearer(token) {
  return { Authorization: `Bearer ${token}` };
}

async function main() {
  const server = await startCoachServer({ dbPath: ':memory:', port: 0, host: '127.0.0.1' });
  const apiBase = server.url;
  const adminAuth = bearer(server.adminToken);
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

  // --- 0. Auth gate: nothing user-related answers without a token ----------
  console.log('\nauth gate');

  await check('unauthenticated GET /api/sync/pull is rejected with 401', async () => {
    const res = await http(`${apiBase}/api/sync/pull`);
    assert.equal(res.status, 401);
  });

  await check('unauthenticated GET /api/sync/pull with ?userId= is still 401', async () => {
    const res = await http(`${apiBase}/api/sync/pull?userId=${repository.USER_PROFILE_ID}`);
    assert.equal(res.status, 401);
  });

  await check('unauthenticated POST /api/sync/push is rejected with 401', async () => {
    const res = await http(`${apiBase}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile: { userId: repository.USER_PROFILE_ID, locale: 'hu' } }),
    });
    assert.equal(res.status, 401);
  });

  await check('an unknown bearer token is rejected with 401', async () => {
    const res = await http(`${apiBase}/api/sync/pull`, { headers: bearer('not-a-real-token') });
    assert.equal(res.status, 401);
  });

  await check('unauthenticated admin API is rejected with 401', async () => {
    const res = await http(`${apiBase}/api/admin/clients`);
    assert.equal(res.status, 401);
  });

  await check('admin API rejects a wrong admin token', async () => {
    const res = await http(`${apiBase}/api/admin/clients`, { headers: bearer('wrong-admin') });
    assert.equal(res.status, 401);
  });

  // --- 1. User A: register, then push its whole state ----------------------
  console.log('\nuser A: register + push');

  const accountUsername = 'Anna.Kovacs';
  const accountPassword = 'titkos-jelszo-123';
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
  const tokenA = registered.body.token;
  const userA = registered.body.userId;

  await check('POST /api/auth/register secures an existing local profile', () => {
    assert.equal(registered.status, 201);
    assert.equal(typeof tokenA, 'string');
    assert.ok(tokenA.length >= 32);
    assert.equal(userA, repository.USER_PROFILE_ID);
    assert.equal(registered.body.username, accountUsername);
    assert.equal(registered.body.profile.biometrics.weightKg, 78.5);
    assert.equal(registered.body.billingProfile.billingZip, '1052');
  });

  // A real logged workout + a booking request on the client database.
  await repository.saveOnboardingPayload(db, onboarding);
  await repository.saveClientBillingProfile(db, billingProfile);
  const strengthTemplate = await repository.createCustomTemplate(db, {
    title: 'Upper A (custom)',
    sessionType: 'strength',
    blocks: [
      { exerciseId: 'bench_press', targetSets: 4, targetReps: '6-8', restSeconds: 150 },
      { exerciseId: 'barbell_row', targetSets: 4, targetReps: '8-10', restSeconds: 120 },
    ],
  });
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

  await repository.seedCoachingSlots(db);
  const openSlots = await repository.getOpenCoachingSlots(db);
  const booking = await repository.createCoachingBooking(db, openSlots[0].id, 'Technika átnézés.');

  const pushPayload = await buildClientSyncPushPayload(db);
  const push = await http(`${apiBase}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(tokenA) },
    body: JSON.stringify(pushPayload),
  });

  await check('POST /api/sync/push (as A) ingests the client state', () => {
    assert.equal(push.status, 200);
    assert.equal(push.body.ok, true);
    assert.equal(push.body.userId, userA);
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
    const res = await http(`${apiBase}/api/admin/clients`, { headers: adminAuth });
    assert.equal(res.status, 200);
    const client = res.body.clients.find((c) => c.userId === userA);
    assert.ok(client !== undefined);
    assert.equal(client.username, accountUsername);
    assert.equal(client.billing.billingName, 'Kovács Anna');
    assert.equal(client.biometrics.weightKg, 78.5);
    assert.equal(client.jointConstraints[0].area, 'knees');
    assert.equal(client.completedSessionCount, 1);
  });

  await check('GET /api/admin/clients/:id returns the logged session with its exercises, sets and reps', async () => {
    const res = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userA)}`, {
      headers: adminAuth,
    });
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
    const res = await http(`${apiBase}/api/admin/exercises`, { headers: adminAuth });
    assert.equal(res.status, 200);
    assert.equal(res.body.count, 157);
    assert.equal(res.body.exercises.length, 157);
  });

  await check('PATCH /api/admin/bookings/:id confirms with coach notes + link', async () => {
    const res = await http(`${apiBase}/api/admin/bookings/${encodeURIComponent(booking.id)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
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

  let coachTemplateId = null;
  await check('POST /api/admin/clients/:id/templates assigns a coach plan', async () => {
    const res = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userA)}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
      body: JSON.stringify({
        title: 'Edzői terv – Guggolás fókusz',
        sessionType: 'strength',
        coachNote: 'Térdkímélő: alacsony tengelyterhelés.',
        blocks: [
          { exerciseId: 'belt_squat', targetSets: 4, targetReps: '8-10', restSeconds: 150 },
          { exerciseId: 'romanian_deadlift', targetSets: 3, targetReps: '8', restSeconds: 120 },
        ],
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.template.source, 'coach');
    assert.equal(res.body.template.exercises.length, 2);
    assert.equal(res.body.template.exercises[0].exercise.id, 'belt_squat');
    assert.equal(res.body.template.exercises[0].exercise.axialLoadScore, 1);
    coachTemplateId = res.body.template.id;
  });

  await check('POST /api/admin/slots publishes a new open slot', async () => {
    const startsAt = new Date(Date.now() + 4 * 86400000).toISOString();
    const endsAt = new Date(Date.now() + 4 * 86400000 + 45 * 60000).toISOString();
    const res = await http(`${apiBase}/api/admin/slots`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
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
      `${apiBase}/api/admin/clients/${encodeURIComponent(userA)}/invoice-export`,
      { headers: adminAuth },
    );
    assert.equal(json.status, 200);
    assert.equal(json.body.billing.billingName, 'Kovács Anna');
    assert.equal(json.body.billing.billingZip, '1052');
    assert.equal(json.body.billing.taxNumber, '12345678-1-42');
    assert.equal(json.body.sessionCount, 1);

    const csv = await http(
      `${apiBase}/api/admin/clients/${encodeURIComponent(userA)}/invoice-export?format=csv`,
      { headers: adminAuth },
    );
    assert.equal(csv.status, 200);
    assert.ok(String(csv.contentType).includes('text/csv'));
    assert.ok(String(csv.body).includes('Számlázási név'));
    assert.ok(String(csv.body).includes('Kovács Anna'));
    assert.ok(String(csv.body).includes('1052'));
  });

  // --- 3. Pull as A + apply on the client ----------------------------------
  console.log('\nuser A: pull + apply');

  const pull = await http(`${apiBase}/api/sync/pull?userId=someone_else`, {
    headers: bearer(tokenA),
  });

  await check('GET /api/sync/pull (as A) returns assignments, bookings and slots', () => {
    assert.equal(pull.status, 200);
    // The query parameter is ignored: the token decides who the caller is.
    assert.equal(pull.body.userId, userA);
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

  // --- 4. Multi-tenant isolation: User B must never see User A --------------
  console.log('\nmulti-tenant isolation');

  const userBUsername = 'user.b';
  const userBPassword = 'b-jelszo-1234';
  const userBProfile = {
    ...onboarding,
    userId: 'ignored_by_server',
    biometrics: { age: 41, weightKg: 70, heightCm: 172 },
    constraints: {
      jointLimitations: [],
      excludedExerciseIds: [],
      preferredSubstitutions: {},
    },
  };

  const registeredB = await http(`${apiBase}/api/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      username: userBUsername,
      password: userBPassword,
      profile: userBProfile,
    }),
  });
  const tokenB = registeredB.body.token;
  const userB = registeredB.body.userId;

  await check('User B gets its own server-generated id', () => {
    assert.equal(registeredB.status, 201);
    assert.match(userB, /^usr_/);
    assert.notEqual(userB, userA);
    assert.equal(registeredB.body.profile.userId, userB);
    assert.equal(registeredB.body.sessions.length, 0);
  });

  const beltSquat = EXERCISE_CATALOG.find((item) => item.id === 'belt_squat');
  const nowIso = new Date().toISOString();
  const userBSession = {
    id: 'sess_b_1',
    sessionType: 'strength',
    title: 'B edzés',
    startedAt: nowIso,
    completedAt: nowIso,
    syncStatus: 'synced',
    exerciseBlocks: [
      {
        id: 'sess_b_1:0',
        sessionId: 'sess_b_1',
        orderIndex: 0,
        exerciseId: 'belt_squat',
        restSeconds: 120,
        exercise: beltSquat,
        sets: [
          {
            id: 'set_b_1',
            setNumber: 1,
            setType: 'working',
            targetReps: '8-10',
            actualWeightKg: 60,
            actualReps: 10,
            completedAt: nowIso,
          },
        ],
      },
    ],
  };

  const pushB = await http(`${apiBase}/api/sync/push`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...bearer(tokenB) },
    body: JSON.stringify({
      batchId: 'sync_b',
      generatedAt: nowIso,
      deviceId: userB,
      profile: userBProfile,
      billingProfile: null,
      sessions: [userBSession],
      bookings: [],
    }),
  });

  await check('POST /api/sync/push (as B) stores only B rows', () => {
    assert.equal(pushB.status, 200);
    assert.equal(pushB.body.userId, userB);
    assert.equal(pushB.body.sessions, 1);
  });

  const pullB = await http(`${apiBase}/api/sync/pull`, { headers: bearer(tokenB) });

  await check('B pull returns ONLY B profile, sessions and no A data', () => {
    assert.equal(pullB.status, 200);
    assert.equal(pullB.body.userId, userB);
    assert.equal(pullB.body.profile.userId, userB);
    assert.equal(pullB.body.profile.biometrics.weightKg, 70);
    assert.equal(pullB.body.sessions.length, 1);
    assert.equal(pullB.body.sessions[0].id, 'sess_b_1');
    assert.ok(
      !pullB.body.sessions.some((s) => s.id === sessionId),
      'A session must not appear in B pull',
    );
    assert.equal(pullB.body.billingProfile, null);
    assert.equal(pullB.body.templates.length, 0);
    assert.ok(
      !pullB.body.templates.some((t) => t.id === coachTemplateId),
      'User A\'s assigned template must not appear in User B\'s pull',
    );
    assert.equal(pullB.body.bookings.length, 0);
  });

  const pullA2 = await http(`${apiBase}/api/sync/pull`, { headers: bearer(tokenA) });

  await check('A pull still returns only A data after B registered', () => {
    assert.equal(pullA2.body.userId, userA);
    assert.equal(pullA2.body.profile.biometrics.weightKg, 78.5);
    assert.equal(pullA2.body.sessions.length, 1);
    assert.equal(pullA2.body.sessions[0].id, sessionId);
    assert.ok(
      !pullA2.body.sessions.some((s) => s.id === 'sess_b_1'),
      'B session must not appear in A pull',
    );
    assert.equal(pullA2.body.billingProfile.billingZip, '1052');
    assert.ok(pullA2.body.templates.some((t) => t.source === 'coach'));
  });

  const originalSessionTitle = pullA2.body.sessions[0].title;

  await check('User B cannot overwrite User A\'s session by reusing its id', async () => {
    const collision = await http(`${apiBase}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearer(tokenB) },
      body: JSON.stringify({
        batchId: 'sync_collision',
        generatedAt: nowIso,
        deviceId: userB,
        profile: userBProfile,
        billingProfile: null,
        sessions: [{ ...userBSession, id: sessionId, title: 'B collision' }],
        bookings: [],
      }),
    });
    assert.equal(collision.status, 200);

    const pullA3 = await http(`${apiBase}/api/sync/pull`, { headers: bearer(tokenA) });
    assert.equal(pullA3.body.sessions.length, 1);
    assert.equal(pullA3.body.sessions[0].title, originalSessionTitle, 'A row must not be overwritten');

    const pullB3 = await http(`${apiBase}/api/sync/pull`, { headers: bearer(tokenB) });
    assert.ok(
      !pullB3.body.sessions.some((s) => s.id === sessionId),
      'B must never inherit A\'s session id',
    );
  });

  await check('Admin cannot reassign an existing template to another user', async () => {
    const fixedId = 'tpl_collision_test';
    const first = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userA)}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
      body: JSON.stringify({
        id: fixedId,
        title: 'A collision plan',
        sessionType: 'strength',
        blocks: [{ exerciseId: 'belt_squat' }],
      }),
    });
    assert.equal(first.status, 201);

    const second = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userB)}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
      body: JSON.stringify({
        id: fixedId,
        title: 'B collision plan',
        sessionType: 'strength',
        blocks: [{ exerciseId: 'belt_squat' }],
      }),
    });
    assert.equal(second.status, 409);
    assert.ok(String(second.body.error).includes('másik ügyfél'));
  });

  await check('Global default template is readable by every user but owned by nobody', async () => {
    const global = await http(`${apiBase}/api/admin/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
      body: JSON.stringify({
        title: 'Globális alap sablon',
        sessionType: 'strength',
        blocks: [{ exerciseId: 'belt_squat' }],
      }),
    });
    assert.equal(global.status, 201);
    const globalId = global.body.template.id;

    const row = server.db.prepare('SELECT user_id FROM coach_templates WHERE id = ?').get(globalId);
    assert.equal(row.user_id, null, 'global template has no owner');

    const pullA4 = await http(`${apiBase}/api/sync/pull`, { headers: bearer(tokenA) });
    const pullB4 = await http(`${apiBase}/api/sync/pull`, { headers: bearer(tokenB) });
    assert.ok(pullA4.body.templates.some((t) => t.id === globalId), 'A sees the global default');
    assert.ok(pullB4.body.templates.some((t) => t.id === globalId), 'B sees the global default');
    assert.ok(
      pullA4.body.templates.some((t) => t.id === coachTemplateId),
      'A still sees its own assigned plan',
    );
    assert.ok(
      !pullB4.body.templates.some((t) => t.id === coachTemplateId),
      'B must not see A\'s assigned plan',
    );
  });

  await check('wipeLocalUserData removes custom templates, exercises and sessions', async () => {
    const customExercise = await repository.createCustomExercise(db, {
      nameHu: 'Saját teszt gyakorlat',
      category: 'isolation',
      equipment: 'barbell',
      movementPattern: 'isolation',
    });
    assert.ok(customExercise.id.startsWith('cust_'));

    const customTemplate = await repository.createCustomTemplate(db, {
      title: 'Saját teszt sablon',
      sessionType: 'strength',
      blocks: [
        {
          exerciseId: customExercise.id,
          targetSets: 3,
          targetReps: '8-10',
          restSeconds: 90,
        },
      ],
    });
    assert.ok(customTemplate.id.startsWith('tpl_user'));
    assert.ok((await repository.getWorkoutTemplates(db)).some((t) => t.id === customTemplate.id));

    await repository.wipeLocalUserData(db);

    assert.equal((await repository.getWorkoutTemplates(db)).length, 0);
    assert.ok(!(await repository.getExerciseCatalog(db)).some((e) => e.id === customExercise.id));
    assert.equal((await repository.getSessionHistory(db)).length, 0);
    assert.equal(await repository.getUserProfile(db), null);
  });

  await check('a fresh client logging in as B hydrates only B data', async () => {
    const fresh = await createFreshClientDatabase();
    try {
      await repository.saveLocalAuthSession(fresh.db, {
        userId: userB,
        username: userBUsername,
        token: tokenB,
      });
      await repository.applyClientSyncPullPayload(fresh.db, pullB.body);

      const profile = await repository.getUserProfile(fresh.db);
      assert.ok(profile !== null);
      assert.equal(profile.userId, userB);
      assert.equal(profile.biometrics.weightKg, 70);

      const history = await repository.getSessionHistory(fresh.db);
      assert.equal(history.length, 1);
      assert.equal(history[0].id, 'sess_b_1');

      const billing = await repository.getClientBillingProfile(fresh.db);
      assert.equal(billing, null);
    } finally {
      fresh.raw.close();
    }
  });

  await check('a pull response for another user is a local no-op', async () => {
    const fresh = await createFreshClientDatabase();
    try {
      // No session → the active owner is the legacy local id, which is not B.
      await repository.applyClientSyncPullPayload(fresh.db, pullB.body);
      const profile = await repository.getUserProfile(fresh.db);
      assert.equal(profile, null);
    } finally {
      fresh.raw.close();
    }
  });

  // --- 5. Auth behaviour ----------------------------------------------------
  console.log('\nauthentication behaviour');

  await check('registering with a pre-auth user id that has no credentials upgrades it in place', async () => {
    // A client row created by a pre-auth sync: no client_credentials row yet.
    const legacyId = 'usr_legacy_preauth';
    const now = new Date().toISOString();
    server.db
      .prepare(
        `INSERT INTO clients (user_id, locale, profile_json, billing_json, created_at, updated_at)
         VALUES (?, 'hu', ?, NULL, ?, ?);`,
      )
      .run(legacyId, JSON.stringify({ ...onboarding, userId: legacyId }), now, now);

    const res = await http(`${apiBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'legacy.joska',
        password: 'legacy-jelszo-1',
        userId: legacyId,
        profile: { ...onboarding, userId: legacyId },
      }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.userId, legacyId, 'the existing id is reused, not replaced');
    assert.equal(res.body.profile.userId, legacyId);
    assert.equal(res.body.profile.biometrics.weightKg, 78.5);

    const clients = server.db
      .prepare('SELECT COUNT(*) AS count FROM clients WHERE user_id = ?;')
      .get(legacyId);
    assert.equal(clients.count, 1, 'no duplicate client row was created');
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

  await check('a duplicate username is rejected even when a new userId is supplied', async () => {
    const res = await http(`${apiBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'ANNA.KOVACS',
        password: 'mas-jelszo-9',
        userId: 'usr_brand_new_id',
      }),
    });
    assert.equal(res.status, 409);
    assert.ok(String(res.body.error).includes('foglalt'));
  });

  await check('a userId already claimed by another account yields a fresh id, not a 409', async () => {
    // Regression: a device with pre-isolation local data sends userId = usr_local,
    // which Anna's account already owns. A brand-new username must still register.
    const res = await http(`${apiBase}/api/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username: 'kiss.peter',
        password: 'peter-jelszo-1',
        userId: userA,
        profile: {
          ...onboarding,
          userId: userA,
          biometrics: { age: 33, weightKg: 82, heightCm: 176 },
        },
      }),
    });
    assert.equal(res.status, 201);
    const newId = res.body.userId;
    assert.notEqual(newId, userA, 'a fresh id must be minted');
    assert.match(newId, /^usr_/);
    assert.equal(res.body.profile.userId, newId, 'snapshot stored under the new id');
    assert.equal(res.body.profile.biometrics.weightKg, 82);
    assert.equal(res.body.sessions.length, 0, 'must not inherit the other account rows');

    // Both accounts stay isolated.
    const pullNew = await http(`${apiBase}/api/sync/pull`, { headers: bearer(res.body.token) });
    assert.equal(pullNew.status, 200);
    assert.equal(pullNew.body.userId, newId);
    assert.equal(pullNew.body.sessions.length, 0);
    assert.ok(!pullNew.body.sessions.some((s) => s.id === sessionId));

    const pullA6 = await http(`${apiBase}/api/sync/pull`, { headers: bearer(tokenA) });
    assert.equal(pullA6.body.userId, userA);
    assert.equal(pullA6.body.sessions.length, 1);
    assert.equal(pullA6.body.profile.biometrics.weightKg, 78.5, 'A profile untouched');
    assert.equal(pullA6.body.billingProfile.billingZip, '1052');
  });

  await check('registerAccount re-keys the device to the server id and keeps local data', async () => {
    const device = await createFreshClientDatabase();
    try {
      // Pre-isolation device: a legacy profile + logs synced under usr_local,
      // which Anna's account already owns on this server.
      await repository.saveOnboardingPayload(device.db, onboarding);
      await repository.saveClientBillingProfile(device.db, billingProfile);
      const deviceStrength = await repository.createCustomTemplate(device.db, {
        title: 'Device Upper A (custom)',
        sessionType: 'strength',
        blocks: [
          { exerciseId: 'bench_press', targetSets: 4, targetReps: '6-8', restSeconds: 150 },
          { exerciseId: 'barbell_row', targetSets: 4, targetReps: '8-10', restSeconds: 120 },
        ],
      });
      const deviceSessionId = await repository.startSessionFromTemplate(device.db, deviceStrength);
      const deviceDetail = await repository.getSessionDetail(device.db, deviceSessionId);
      await repository.upsertSetLog(device.db, deviceDetail.exerciseBlocks[0].id, {
        setNumber: 1,
        setType: 'working',
        actualWeightKg: 55,
        actualReps: 10,
        rpe: 7,
      });
      await repository.completeSession(device.db, deviceSessionId);
      const customTemplate = await repository.createCustomTemplate(device.db, {
        title: 'Saját re-key sablon',
        sessionType: 'strength',
        blocks: [{ exerciseId: 'belt_squat', targetSets: 3, targetReps: '8', restSeconds: 90 }],
      });

      const state = await authService.registerAccount(
        device.db,
        {
          username: 'nagy.eszter',
          password: 'eszter-jelszo-1',
          userId: repository.USER_PROFILE_ID,
          profile: onboarding,
          billingProfile,
        },
        `${apiBase}/api`,
      );

      assert.match(state.userId, /^usr_/);
      assert.notEqual(state.userId, repository.USER_PROFILE_ID);
      assert.notEqual(state.userId, userA, 'never reuse another account id');

      const localSession = await repository.getLocalAuthSession(device.db);
      assert.ok(localSession !== null);
      assert.equal(localSession.userId, state.userId, 'session re-bound to the server id');

      const localProfile = await repository.getUserProfile(device.db);
      assert.ok(localProfile !== null, 'profile re-keyed to the new id');
      assert.equal(localProfile.userId, state.userId);
      assert.equal(localProfile.biometrics.weightKg, 78.5);
      assert.equal(localProfile.constraints.jointLimitations[0].area, 'knees');

      const localBilling = await repository.getClientBillingProfile(device.db);
      assert.equal(localBilling.userId, state.userId);
      assert.equal(localBilling.billingZip, '1052');

      const history = await repository.getSessionHistory(device.db);
      assert.equal(history.length, 1, 'local workout logs survive the re-key');
      assert.ok(
        (await repository.getWorkoutTemplates(device.db)).some((t) => t.id === customTemplate.id),
        'custom template survives the re-key',
      );

      // The very first push after registering lands in the new account only.
      const pushC = await http(`${apiBase}/api/sync/push`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localSession.token}`,
        },
        body: JSON.stringify(await buildClientSyncPushPayload(device.db)),
      });
      assert.equal(pushC.status, 200);
      assert.equal(pushC.body.userId, state.userId);

      const pullC = await http(`${apiBase}/api/sync/pull`, {
        headers: bearer(localSession.token),
      });
      assert.equal(pullC.body.userId, state.userId);
      assert.equal(pullC.body.profile.userId, state.userId);
      assert.equal(pullC.body.billingProfile.billingZip, '1052');
      assert.equal(pullC.body.sessions.length, 1);
      assert.ok(
        !pullC.body.sessions.some((s) => s.id === sessionId),
        'the other account workout log must not leak in',
      );

      const pullA7 = await http(`${apiBase}/api/sync/pull`, { headers: bearer(tokenA) });
      assert.equal(pullA7.body.sessions.length, 1, 'A keeps exactly its own session');
      assert.equal(pullA7.body.profile.biometrics.weightKg, 78.5);
    } finally {
      device.raw.close();
    }
  });

  await check('POST /api/auth/login accepts a trimmed, case-insensitive username', async () => {
    const res = await http(`${apiBase}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: '  ANNA.KOVACS ', password: accountPassword }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.userId, userA);
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

  await check('authenticated push ignores a spoofed body userId', async () => {
    const res = await http(`${apiBase}/api/sync/push`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...bearer(tokenA) },
      body: JSON.stringify({
        ...pushPayload,
        deviceId: 'spoofed_device',
        profile: { ...onboarding, userId: 'spoofed_user' },
      }),
    });
    assert.equal(res.status, 200);
    assert.equal(res.body.userId, userA);
    const spoofed = await http(`${apiBase}/api/admin/clients/spoofed_user`, { headers: adminAuth });
    assert.equal(spoofed.status, 404);
  });

  await check('cross-device login restores profile, billing and workout logs', async () => {
    const second = await createFreshClientDatabase();
    try {
      const state = await authService.loginWithCredentials(
        second.db,
        { username: accountUsername, password: accountPassword },
        `${apiBase}/api`,
      );
      assert.equal(state.userId, userA);

      const session = await repository.getLocalAuthSession(second.db);
      assert.ok(session !== null);
      assert.equal(session.username, accountUsername);

      const profile = await repository.getUserProfile(second.db);
      assert.ok(profile !== null);
      assert.equal(profile.biometrics.weightKg, 78.5);
      assert.equal(profile.constraints.jointLimitations[0].area, 'knees');

      const billing = await repository.getClientBillingProfile(second.db);
      assert.equal(billing.billingZip, '1052');
      assert.equal(billing.taxNumber, '12345678-1-42');

      const history = await repository.getSessionHistory(second.db);
      assert.equal(history.length, 1);
      const sessionDetail = await repository.getSessionDetail(second.db, history[0].id);
      assert.ok(sessionDetail !== null);
      assert.equal(sessionDetail.exerciseBlocks[0].sets[0].actualWeightKg, 90);
      assert.equal(sessionDetail.exerciseBlocks[0].sets[0].actualReps, 8);

      const restoredTemplates = await repository.getWorkoutTemplates(second.db);
      assert.ok(restoredTemplates.some((template) => template.source === 'coach'));
    } finally {
      second.raw.close();
    }
  });

  await check('unauthenticated device never syncs: pull is skipped without a token', async () => {
    const fresh = await createFreshClientDatabase();
    try {
      const result = await syncService.syncPull(fresh.db, `${apiBase}/api`);
      assert.equal(result.ok, false);
      assert.equal(result.appliedTemplateCount, 0);
      assert.equal(result.appliedBookingCount, 0);
      assert.ok(typeof result.error === 'string' && result.error.length > 0);
      const profile = await repository.getUserProfile(fresh.db);
      assert.equal(profile, null, 'no remote data may hydrate an unauthenticated device');
    } finally {
      fresh.raw.close();
    }
  });

  // --- Phase 7E: default templates gone, admin edit/delete, sheet import -----
  console.log('\nphase 7e: template cleanup, edit/delete, sheet import');

  const IMPORT_TSV = [
    'Day\tExercise\tWeight\tSets\tTarget Reps\tAchieved Reps\tComments',
    'Day 1\tDeadlift (75%)\t87,5\t1\t5\t\t',
    '\tDeadlift (85%)\t25; 20; 15\t3\t3\t1+\tspeed',
    '\tToshiki Raises\tBW\t3\t8-12\t\t',
    'Day 2\tOH Kettlebell Lunges\t20-20\t3\tAMRAP\t\tcoolio',
    '\tBB BSS\t35?\t4\t9+\t\t',
  ].join('\n');

  await check('parseWorkoutSheet carries the day forward and preserves prescriptions', () => {
    const sheet = sheetImport.parseWorkoutSheet(IMPORT_TSV);
    assert.equal(sheet.days.length, 2, 'two days');
    assert.deepEqual(
      sheet.days.map((d) => d.day),
      ['Day 1', 'Day 2'],
    );
    assert.equal(sheet.days[0].exercises.length, 3, 'column A carry-forward keeps the group');
    const [dl75, dl85, toshiki] = sheet.days[0].exercises;
    assert.equal(dl75.name, 'Deadlift');
    assert.equal(dl75.prescription, '75%');
    assert.equal(dl75.weightKg, 87.5, '87,5 parses to 87.5');
    assert.equal(dl75.weightRaw, '87,5', 'the raw Hungarian decimal is kept');
    assert.equal(dl75.targetSets, 1);
    assert.equal(dl75.targetReps, '5');
    assert.equal(dl85.weightKg, undefined, 'multi-set notation is not a single number');
    assert.equal(dl85.weightRaw, '25; 20; 15');
    assert.equal(dl85.targetReps, '3');
    assert.equal(dl85.notes, 'speed · Elért: 1+');
    assert.equal(toshiki.weightRaw, 'BW');
    assert.equal(toshiki.weightKg, undefined);
    assert.equal(toshiki.targetReps, '8-12');
    const [lunges, bss] = sheet.days[1].exercises;
    assert.equal(lunges.targetReps, 'AMRAP');
    assert.equal(lunges.weightRaw, '20-20');
    assert.equal(lunges.notes, 'coolio');
    assert.equal(bss.weightRaw, '35?');
    assert.equal(bss.targetReps, '9+');
  });

  await check('parseWorkoutSheet handles a quoted CSV target-reps cell', () => {
    const csv = [
      'Day,Exercise,Weight,Sets,Target Reps,Achieved,Comments',
      'Day 1,Squat,100,3,"6+, 6-12, underh",,',
    ].join('\n');
    const sheet = sheetImport.parseWorkoutSheet(csv);
    assert.equal(sheet.days[0].exercises.length, 1);
    assert.equal(sheet.days[0].exercises[0].targetReps, '6+, 6-12, underh');
    assert.equal(sheet.days[0].exercises[0].weightKg, 100);
  });

  await check('parseGoogleSheetUrl extracts the id and gid', () => {
    assert.deepEqual(
      sheetImport.parseGoogleSheetUrl('https://docs.google.com/spreadsheets/d/ABC123_-x/edit#gid=42'),
      { id: 'ABC123_-x', gid: '42' },
    );
    assert.deepEqual(
      sheetImport.parseGoogleSheetUrl('https://docs.google.com/spreadsheets/d/ABC/edit'),
      { id: 'ABC' },
    );
    assert.equal(sheetImport.parseGoogleSheetUrl('https://example.com/x'), null);
  });

  await check('a fresh client database starts with an EMPTY template list', async () => {
    const fresh = await createFreshClientDatabase();
    try {
      await repository.removeDefaultTemplates(fresh.db);
      const templates = await repository.getWorkoutTemplates(fresh.db);
      assert.equal(templates.length, 0, 'no default templates for a new client');
    } finally {
      fresh.raw.close();
    }
  });

  await check('server startup cleanup leaves a fresh database with no default templates', async () => {
    const fresh = await startCoachServer({
      dbPath: ':memory:',
      port: 0,
      host: '127.0.0.1',
      adminToken: 'phase7e-admin-token',
    });
    try {
      const res = await http(`${fresh.url}/api/admin/templates`, {
        headers: bearer('phase7e-admin-token'),
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.templates.length, 0, 'no seeded global default templates');
    } finally {
      await fresh.close();
    }
  });

  await check('POST /api/admin/clients/:id/import-sheet creates one plan per day + auto-creates exercises', async () => {
    const res = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userA)}/import-sheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
      body: JSON.stringify({ text: IMPORT_TSV }),
    });
    assert.equal(res.status, 201);
    assert.equal(res.body.userId, userA);
    assert.equal(res.body.days.length, 2, 'one template per day');
    assert.ok(
      res.body.createdExercises.some((e) => e.nameHu === 'Toshiki Raises'),
      'unknown exercises are auto-created',
    );

    const detail = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userA)}`, {
      headers: adminAuth,
    });
    const day1 = detail.body.templates.find((t) => t.title === 'Day 1');
    assert.ok(day1 !== undefined, 'Day 1 plan exists');
    assert.equal(day1.exercises.length, 3);
    assert.equal(day1.exercises[0].targetWeight, '87,5', 'the exact target weight is preserved');
    assert.equal(day1.exercises[0].targetReps, '5');
    assert.ok(day1.exercises.some((b) => b.exercise.nameHu === 'Toshiki Raises'));
  });

  await check('import is idempotent: re-importing updates the same per-day plans', async () => {
    const res = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userA)}/import-sheet`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
      body: JSON.stringify({ text: IMPORT_TSV }),
    });
    assert.equal(res.status, 201);
    const detail = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userA)}`, {
      headers: adminAuth,
    });
    const dayCount = detail.body.templates.filter((t) => t.title === 'Day 1').length;
    assert.equal(dayCount, 1, 're-import updates in place, never duplicates');
  });

  await check('pull delivers imported custom exercises so blocks hydrate', async () => {
    const pull = await http(`${apiBase}/api/sync/pull`, { headers: bearer(tokenA) });
    assert.equal(pull.status, 200);
    assert.ok(Array.isArray(pull.body.catalog), 'pull carries the custom catalog');
    assert.ok(pull.body.catalog.some((e) => e.nameHu === 'Toshiki Raises'));
    const day1 = pull.body.templates.find((t) => t.title === 'Day 1');
    assert.ok(day1 !== undefined);
    assert.ok(day1.exercises.some((b) => b.exercise.nameHu === 'Toshiki Raises'));
  });

  let editTemplateId = null;
  await check('PUT /api/admin/templates/:id updates title, note and blocks in place', async () => {
    const created = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userA)}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
      body: JSON.stringify({
        title: 'Szerkesztendő terv',
        sessionType: 'strength',
        coachNote: 'eredeti',
        blocks: [{ exerciseId: 'bench_press', targetSets: 3, targetReps: '8-10', restSeconds: 90 }],
      }),
    });
    assert.equal(created.status, 201);
    editTemplateId = created.body.template.id;

    const updated = await http(`${apiBase}/api/admin/templates/${encodeURIComponent(editTemplateId)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
      body: JSON.stringify({
        title: 'Módosított terv',
        sessionType: 'hybrid',
        coachNote: 'új jegyzet',
        blocks: [
          { exerciseId: 'front_squat', targetSets: 5, targetReps: '3-5', restSeconds: 180, targetWeight: 'BW' },
          { exerciseId: 'bench_press', targetSets: 4, targetReps: 'AMRAP', restSeconds: 120 },
        ],
      }),
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.template.title, 'Módosított terv');
    assert.equal(updated.body.template.sessionType, 'hybrid');
    assert.equal(updated.body.template.coachNote, 'új jegyzet');
    assert.equal(updated.body.template.exercises.length, 2, 'blocks replaced');
    assert.equal(updated.body.template.exercises[0].exerciseId, 'front_squat');
    assert.equal(updated.body.template.exercises[0].targetWeight, 'BW');
    assert.equal(updated.body.template.exercises[1].targetReps, 'AMRAP');

    const detail = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userA)}`, {
      headers: adminAuth,
    });
    assert.ok(
      detail.body.templates.some((t) => t.id === editTemplateId && t.title === 'Módosított terv'),
      'the edit stays owned by the client',
    );
  });

  await check('PUT /api/admin/templates/:id 404s for an unknown template', async () => {
    const res = await http(`${apiBase}/api/admin/templates/does_not_exist`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...adminAuth },
      body: JSON.stringify({ title: 'x', blocks: [{ exerciseId: 'bench_press' }] }),
    });
    assert.equal(res.status, 404);
  });

  await check('DELETE /api/admin/templates/:id removes the template', async () => {
    const del = await http(`${apiBase}/api/admin/templates/${encodeURIComponent(editTemplateId)}`, {
      method: 'DELETE',
      headers: adminAuth,
    });
    assert.equal(del.status, 200);
    assert.equal(del.body.deleted, true);
    const detail = await http(`${apiBase}/api/admin/clients/${encodeURIComponent(userA)}`, {
      headers: adminAuth,
    });
    assert.ok(!detail.body.templates.some((t) => t.id === editTemplateId));
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
