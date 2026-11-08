/* eslint-disable */
// WorkoutApp coach admin web (vanilla JS, no build step).
// Served by the standalone server at /admin. Talks to the same-origin REST API.

'use strict';

const state = {
  clients: [],
  exercises: [],
  slots: [],
  bookings: [],
  selectedClientId: null,
  builderBlocks: [],
  exerciseFilter: 'all',
};

// ---- Tiny DOM / fetch helpers ---------------------------------------------
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

function esc(value) {
  return String(value === null || value === undefined ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function api(path, options) {
  const response = await fetch(path, options);
  const contentType = response.headers.get('content-type') || '';
  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    if (contentType.includes('application/json')) {
      try {
        const body = await response.json();
        if (body && body.error) message = body.error;
      } catch (_e) {
        /* ignore */
      }
    }
    throw new Error(message);
  }
  if (contentType.includes('application/json')) return response.json();
  return response.text();
}

let toastTimer = null;
function toast(message, isError) {
  const node = $('#toast');
  node.textContent = message;
  node.classList.toggle('error', Boolean(isError));
  node.classList.add('show');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => node.classList.remove('show'), 3200);
}

function fmtDateTime(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return esc(iso);
  return d.toLocaleString('hu-HU', { dateStyle: 'medium', timeStyle: 'short' });
}

// ---- Constants -------------------------------------------------------------
const GOAL_LABELS = {
  strength: 'Erő',
  hypertrophy: 'Hipertófia',
  powerbuilding: 'Powerbuilding',
  hybrid_strength_running: 'Hibrid (erő + futás)',
};
const SEVERITY_LABELS = {
  mild_discomfort: 'Enyhe panasz',
  avoid_heavy_axial_load: 'Kerülni a nagy tengelyterhelést',
  strict_exclude: 'Szigorúan kizárva',
};
const MODALITY_LABELS = { online_call: 'Online konzultáció', irl_gym: 'Személyi edzés (IRL)' };
const STATUS_LABELS = {
  pending: 'Függőben',
  confirmed: 'Visszaigazolt',
  completed: 'Lezajlott',
  cancelled: 'Lemondva',
};
const STATUS_TONE = {
  pending: 'warning',
  confirmed: 'success',
  completed: 'accent',
  cancelled: 'danger',
};
const CATEGORY_LABELS = {
  compound_lower: 'Alsótest összetett',
  compound_upper: 'Felsőtest összetett',
  isolation: 'Izoláció',
  machine: 'Gép',
  cardio_run: 'Kardió / futás',
};
const SESSION_TYPE_LABELS = { strength: 'Erő', running: 'Futás', hybrid: 'Hibrid' };
const SET_TYPE_LABELS = {
  warmup: 'Bemelegítő',
  working: 'Munkasorozat',
  top_set: 'Csúcssorozat',
  backoff: 'Backoff',
  drop_set: 'Drop set',
  failure: 'Kudarcig',
};

function sessionTypeLabel(type) {
  return SESSION_TYPE_LABELS[type] || type || '—';
}

/** mm:ss from a whole number of seconds (pace / duration display). */
function fmtSeconds(total) {
  if (total === null || total === undefined || total === '') return '—';
  const seconds = Math.round(Number(total));
  if (!Number.isFinite(seconds)) return '—';
  const minutes = Math.floor(seconds / 60);
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`;
}

/**
 * Renders one logged session's actual performance: every exercise block with
 * its per-set weight, reps, set type and RPE, plus running metrics when present.
 * The session objects come from the detail endpoint already fully hydrated.
 */
function renderSessionBlocks(session) {
  const parts = [];
  const blocks = Array.isArray(session.exerciseBlocks)
    ? session.exerciseBlocks.slice().sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0))
    : [];

  if (blocks.length === 0) {
    parts.push('<div class="muted">Ehhez az edzéshez nincs naplózott gyakorlat.</div>');
  }

  for (const block of blocks) {
    const exercise = block.exercise || {};
    const name = exercise.nameHu || block.exerciseId || '—';
    const swapped =
      block.substitutedFromExerciseId && block.substitutedFromExerciseId !== block.exerciseId
        ? `<span class="pill warning">csere: ${esc(block.substitutedFromExerciseId)}</span>`
        : '';
    const rest =
      block.restSeconds && block.restSeconds > 0
        ? `<span class="muted">${block.restSeconds} mp pihenő</span>`
        : '';
    const sets = Array.isArray(block.sets)
      ? block.sets.slice().sort((a, b) => (a.setNumber || 0) - (b.setNumber || 0))
      : [];
    const rows = sets
      .map((set) => {
        const weight =
          set.actualWeightKg === undefined || set.actualWeightKg === null
            ? '—'
            : `${set.actualWeightKg} kg`;
        const reps = set.actualReps === undefined || set.actualReps === null ? '—' : set.actualReps;
        const target = set.targetReps ? ` <span class="muted">/ ${esc(set.targetReps)}</span>` : '';
        const rpe = set.rpe === undefined || set.rpe === null ? '—' : set.rpe;
        return `<tr>
            <td>${esc(set.setNumber)}</td>
            <td>${esc(SET_TYPE_LABELS[set.setType] || set.setType || '—')}</td>
            <td>${esc(weight)}</td>
            <td>${esc(reps)}${target}</td>
            <td>${esc(rpe)}</td>
          </tr>`;
      })
      .join('');

    parts.push(`
      <div class="session-block">
        <div class="row">
          <strong>${esc(name)}</strong>
          <span class="muted">${sets.length} sorozat</span>
        </div>
        ${swapped || rest ? `<div class="row">${swapped}${rest}</div>` : ''}
        ${
          sets.length === 0
            ? '<div class="muted">Nincs naplózott sorozat.</div>'
            : `<table class="sets"><thead><tr>
                 <th>Sorozat</th><th>Típus</th><th>Súly</th><th>Ismétlés</th><th>RPE</th>
               </tr></thead><tbody>${rows}</tbody></table>`
        }
      </div>`);
  }

  const metrics = session.runningMetrics;
  if (metrics) {
    parts.push(`
      <div class="session-block">
        <div class="row"><strong>Futás metrikák</strong></div>
        <div class="row muted">
          <span>${esc(metrics.distanceKm)} km</span>
          <span>${esc(fmtSeconds(metrics.durationSeconds))}</span>
          <span>${esc(fmtSeconds(metrics.avgPaceSecondsPerKm))} /km</span>
          <span>RPE ${metrics.perceivedEffortRpe === undefined ? '—' : esc(metrics.perceivedEffortRpe)}</span>
        </div>
      </div>`);
  }

  return parts.join('');
}


function severityTone(severity) {
  if (severity === 'strict_exclude') return 'danger';
  if (severity === 'avoid_heavy_axial_load') return 'warning';
  return 'neutral';
}

function jointBadges(constraints) {
  if (!constraints || constraints.length === 0) {
    return '<span class="muted">nincs megkötés</span>';
  }
  return constraints
    .map(
      (c) =>
        `<span class="pill ${severityTone(c.severity)}">${esc(c.area)} · ${esc(
          SEVERITY_LABELS[c.severity] || c.severity,
        )}</span>`,
    )
    .join('');
}

// ---- View switching --------------------------------------------------------
function showView(name) {
  $$('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.view === name));
  $$('.view').forEach((v) => v.classList.toggle('is-active', v.dataset.view === name));
  if (name === 'overview') loadOverview();
  if (name === 'clients') loadClients();
  if (name === 'builder') loadBuilder();
  if (name === 'slots') loadSlotsAndBookings();
  if (name === 'exercises') loadCatalogView();
}

// ---- Health ----------------------------------------------------------------
async function refreshHealth() {
  try {
    const health = await api('/api/health');
    $('#connDot').className = 'dot ok';
    $('#connText').textContent = `${health.clients} ügyfél · ${health.exercises} gyakorlat`;
  } catch (_e) {
    $('#connDot').className = 'dot bad';
    $('#connText').textContent = 'A szerver nem elérhető';
  }
}

// ---- Overview --------------------------------------------------------------
async function loadOverview() {
  await refreshHealth();
  try {
    const [clientsRes, slotsRes, sessionsAgg] = await Promise.all([
      api('/api/admin/clients'),
      api('/api/admin/slots'),
      Promise.resolve(null),
    ]);
    state.clients = clientsRes.clients;
    state.slots = slotsRes.slots;
    const totalSessions = state.clients.reduce((sum, c) => sum + c.sessionCount, 0);
    const totalCompleted = state.clients.reduce((sum, c) => sum + c.completedSessionCount, 0);
    const openSlots = state.slots.filter((s) => !s.isBooked).length;
    const stats = [
      { label: 'Ügyfelek', value: state.clients.length },
      { label: 'Naplózott edzés', value: totalSessions },
      { label: 'Teljesített edzés', value: totalCompleted },
      { label: 'Nyitott időpont', value: openSlots },
    ];
    $('#overviewStats').innerHTML = stats
      .map((s) => `<div class="stat"><div class="value">${s.value}</div><div class="label">${s.label}</div></div>`)
      .join('');

    $('#overviewClients').innerHTML =
      state.clients.length === 0
        ? '<div class="empty">Még nincs szinkronizált ügyfél. Indíts egy push-t a mobilalkalmazásból.</div>'
        : state.clients
            .map(
              (c) => `
        <div class="item">
          <div class="row">
            <h3>${esc(c.fullName || c.userId)}</h3>
            <span class="muted mono">${esc(c.userId)}</span>
          </div>
          <div class="row">
            <span class="muted">${esc(GOAL_LABELS[c.primaryGoal] || c.primaryGoal || '—')} · ${c.sessionCount} edzés</span>
            <span class="muted">${esc(fmtDateTime(c.updatedAt))}</span>
          </div>
          <div class="row">${jointBadges(c.jointConstraints)}</div>
        </div>`,
            )
            .join('');
  } catch (e) {
    toast(e.message, true);
  }
}

// ---- Clients & invoicing ---------------------------------------------------
async function loadClients() {
  try {
    const res = await api('/api/admin/clients');
    state.clients = res.clients;
    $('#clientsTable').innerHTML =
      state.clients.length === 0
        ? '<div class="empty">Nincs ügyfél.</div>'
        : `<table><thead><tr>
            <th>Ügyfél</th><th>Számlázási hely</th><th>Cél</th><th>Megkötések</th>
            <th>Edzések</th><th>Tervek</th><th>Foglalások</th><th></th>
          </tr></thead><tbody>${state.clients
            .map(
              (c) => `<tr class="clickable" data-client="${esc(c.userId)}">
              <td><strong>${esc(c.fullName || c.userId)}</strong><br /><span class="muted mono">${esc(c.userId)}</span></td>
              <td>${c.billing ? esc(`${c.billing.billingZip} ${c.billing.billingCity}`) : '<span class="muted">—</span>'}</td>
              <td>${esc(GOAL_LABELS[c.primaryGoal] || '—')}</td>
              <td>${jointBadges(c.jointConstraints)}</td>
              <td>${c.completedSessionCount}/${c.sessionCount}</td>
              <td>${c.assignedTemplateCount}</td>
              <td>${c.bookingCount}</td>
              <td><button class="btn small" data-client="${esc(c.userId)}">Részletek</button></td>
            </tr>`,
            )
            .join('')}</tbody></table>`;

    $$('#clientsTable [data-client]').forEach((node) =>
      node.addEventListener('click', () => openClient(node.dataset.client)),
    );
  } catch (e) {
    toast(e.message, true);
  }
}

async function openClient(userId) {
  state.selectedClientId = userId;
  try {
    const detail = await api(`/api/admin/clients/${encodeURIComponent(userId)}`);
    const billing = detail.billing;
    const bio = detail.biometrics;
    const billingBlock = billing
      ? `
      <div class="kv"><span class="k">Számlázási név</span><span>${esc(billing.billingName)}</span></div>
      <div class="kv"><span class="k">Irányítószám</span><span>${esc(billing.billingZip)}</span></div>
      <div class="kv"><span class="k">Település</span><span>${esc(billing.billingCity)}</span></div>
      <div class="kv"><span class="k">Utca, házszám</span><span>${esc(billing.billingAddress)}</span></div>
      <div class="kv"><span class="k">Adószám</span><span>${esc(billing.taxNumber || '—')}</span></div>
      <div class="kv"><span class="k">Email</span><span>${esc(billing.email)}</span></div>
      <div class="kv"><span class="k">Telefon</span><span>${esc(billing.phone)}</span></div>`
      : '<div class="empty">Nincs számlázási profil.</div>';

    const history =
      detail.sessions.length === 0
        ? '<div class="empty">Nincs naplózott edzés.</div>'
        : detail.sessions
            .map(
              (s, index) => `
        <div class="item">
          <div class="row">
            <h3>${esc(s.title)}</h3>
            <span class="muted">${esc(sessionTypeLabel(s.sessionType))}</span>
          </div>
          <div class="row muted">
            <span>${esc(fmtDateTime(s.completedAt || s.startedAt))} · ${s.exerciseBlocks ? s.exerciseBlocks.length : 0} gyakorlat</span>
            <span>${s.completedAt ? 'Teljesítve' : 'Folyamatban'}</span>
          </div>
          <div class="row" style="margin-top:8px;justify-content:flex-start;">
            <button class="btn small" data-session-toggle="${index}">Gyakorlatok és sorozatok</button>
          </div>
          <div class="session-detail" data-session-detail="${index}" hidden>
            ${renderSessionBlocks(s)}
          </div>
        </div>`,
            )
            .join('');

    const templates =
      detail.templates.length === 0
        ? '<div class="empty">Nincs kiosztott edzői terv.</div>'
        : detail.templates
            .map(
              (t) => `
        <div class="item">
          <div class="row">
            <h3>${esc(t.title)}</h3>
            <span class="pill accent">${t.exercises.length} gyakorlat</span>
          </div>
          ${t.coachNote ? `<div class="row muted">${esc(t.coachNote)}</div>` : ''}
          <div class="row">${t.exercises
            .map((b) => `<span class="pill neutral">${esc(b.exercise ? b.exercise.nameHu : b.exerciseId)}</span>`)
            .join('')}</div>
        </div>`,
            )
            .join('');

    $('#clientDetail').innerHTML = `
      <div class="card">
        <div class="row" style="display:flex;justify-content:space-between;align-items:center;">
          <h2>${esc(detail.fullName || detail.userId)}</h2>
          <span class="muted mono">${esc(detail.userId)}</span>
        </div>
        <div class="grid-2">
          <div>
            <h3>Biometria &amp; profil</h3>
            <div class="kv"><span class="k">Kor</span><span>${bio ? bio.age + ' év' : '—'}</span></div>
            <div class="kv"><span class="k">Testsúly</span><span>${bio ? bio.weightKg + ' kg' : '—'}</span></div>
            <div class="kv"><span class="k">Magasság</span><span>${bio ? bio.heightCm + ' cm' : '—'}</span></div>
            <div class="kv"><span class="k">Cél</span><span>${esc(GOAL_LABELS[detail.primaryGoal] || '—')}</span></div>
            <div class="kv"><span class="k">Felszereltség</span><span>${esc(detail.equipment || '—')}</span></div>
            <h3 style="margin-top:14px;">Ízületi megkötések</h3>
            <div>${jointBadges(detail.jointConstraints)}</div>
          </div>
          <div>
            <h3>Számlázási adatok</h3>
            ${billingBlock}
            <div class="row" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">
              <button class="btn small" id="copyInvoice">Számlázási adatok másolása</button>
              <button class="btn small" id="downloadCsv">CSV letöltés</button>
              <button class="btn small ghost" id="downloadJson">JSON letöltés</button>
            </div>
          </div>
        </div>
      </div>
      <div class="card" style="margin-top:20px;">
        <h2>Edzésnapló (${detail.sessions.length})</h2>
        <div class="list">${history}</div>
      </div>
      <div class="card" style="margin-top:20px;">
        <h2>Kiosztott edzői tervek (${detail.templates.length})</h2>
        <div class="list">${templates}</div>
      </div>`;

    const userId2 = detail.userId;
    $('#downloadCsv').addEventListener('click', () => {
      window.open(`/api/admin/clients/${encodeURIComponent(userId2)}/invoice-export?format=csv`, '_blank');
    });
    $('#downloadJson').addEventListener('click', () => {
      window.open(`/api/admin/clients/${encodeURIComponent(userId2)}/invoice-export`, '_blank');
    });
    $('#copyInvoice').addEventListener('click', async () => {
      const inv = await api(`/api/admin/clients/${encodeURIComponent(userId2)}/invoice-export`);
      const b = inv.billing || {};
      const lines = [
        `Számlázási név: ${b.billingName || ''}`,
        `Irányítószám: ${b.billingZip || ''}`,
        `Település: ${b.billingCity || ''}`,
        `Utca, házszám: ${b.billingAddress || ''}`,
        `Adószám: ${b.taxNumber || ''}`,
        `Email: ${b.email || ''}`,
        `Telefon: ${b.phone || ''}`,
        `Teljesített edzések: ${inv.sessionCount}`,
      ];
      const text = lines.join('\n');
      try {
        await navigator.clipboard.writeText(text);
        toast('Számlázási adatok a vágólapon.');
      } catch (_e) {
        toast(text, false);
      }
    });

    // Expand/collapse each logged session's exercise + set detail.
    $$('#clientDetail [data-session-toggle]').forEach((node) =>
      node.addEventListener('click', () => {
        const index = node.dataset.sessionToggle;
        const panel = $(`#clientDetail [data-session-detail="${index}"]`);
        if (!panel) return;
        const opening = panel.hasAttribute('hidden');
        if (opening) {
          panel.removeAttribute('hidden');
          node.textContent = 'Sorozatok elrejtése';
        } else {
          panel.setAttribute('hidden', '');
          node.textContent = 'Gyakorlatok és sorozatok';
        }
      }),
    );

    $('#clientDetail').scrollIntoView({ behavior: 'smooth', block: 'start' });
  } catch (e) {
    toast(e.message, true);
  }
}

// ---- Exercise rendering (shared by builder + catalog) ----------------------
function exerciseScores(ex) {
  const axialHi = ex.axialLoadScore >= 4 ? 'hi' : '';
  const kneeHi = ex.kneeStressScore >= 4 ? 'hi' : '';
  return `<span class="score ${axialHi}">tengely ${ex.axialLoadScore}</span><span class="score ${kneeHi}">térd ${ex.kneeStressScore}</span>`;
}

function matchExercise(ex, query, category) {
  if (category !== 'all' && ex.category !== category) return false;
  if (!query) return true;
  const q = query.toLowerCase();
  return (
    ex.nameHu.toLowerCase().includes(q) ||
    ex.nameEn.toLowerCase().includes(q) ||
    ex.id.toLowerCase().includes(q)
  );
}

function renderCategoryChips(hostId, current, onPick) {
  const categories = ['all', ...Object.keys(CATEGORY_LABELS)];
  const host = $(hostId);
  host.innerHTML = categories
    .map(
      (c) =>
        `<button class="chip ${c === current ? 'is-active' : ''}" data-cat="${c}">${
          c === 'all' ? 'Mind' : esc(CATEGORY_LABELS[c])
        }</button>`,
    )
    .join('');
  host.querySelectorAll('[data-cat]').forEach((node) =>
    node.addEventListener('click', () => onPick(node.dataset.cat)),
  );
}

// ---- Builder ---------------------------------------------------------------
async function loadBuilder() {
  try {
    if (state.clients.length === 0) {
      const res = await api('/api/admin/clients');
      state.clients = res.clients;
    }
    if (state.exercises.length === 0) {
      const res = await api('/api/admin/exercises');
      state.exercises = res.exercises;
    }
  } catch (e) {
    toast(e.message, true);
    return;
  }

  const select = $('#builderClient');
  select.innerHTML = state.clients
    .map((c) => `<option value="${esc(c.userId)}">${esc(c.fullName || c.userId)}</option>`)
    .join('');
  if (state.selectedClientId) select.value = state.selectedClientId;
  select.onchange = () => {
    state.selectedClientId = select.value;
    renderExistingTemplates();
  };

  renderCategoryChips('#exerciseFilters', state.exerciseFilter, (cat) => {
    state.exerciseFilter = cat;
    renderExercisePicker();
  });
  $('#exerciseSearch').oninput = renderExercisePicker;
  $('#builderSave').onclick = saveTemplate;
  renderExercisePicker();
  renderBuilderBlocks();
  renderExistingTemplates();
}

function renderExercisePicker() {
  const query = $('#exerciseSearch').value;
  const list = state.exercises.filter((ex) => matchExercise(ex, query, state.exerciseFilter));
  $('#exerciseList').innerHTML = list
    .slice(0, 200)
    .map(
      (ex) => `
      <div class="exercise" data-add="${esc(ex.id)}">
        <div>
          <div>${esc(ex.nameHu)}</div>
          <div class="muted" style="font-size:11px;">${esc(ex.nameEn)} · ${esc(CATEGORY_LABELS[ex.category] || ex.category)}</div>
        </div>
        <div class="scores">${exerciseScores(ex)}</div>
      </div>`,
    )
    .join('');
  $$('#exerciseList [data-add]').forEach((node) =>
    node.addEventListener('click', () => {
      state.builderBlocks.push({
        exerciseId: node.dataset.add,
        targetSets: 3,
        targetReps: '8-10',
        restSeconds: 90,
      });
      renderBuilderBlocks();
    }),
  );
}

function renderBuilderBlocks() {
  const host = $('#builderBlocks');
  if (state.builderBlocks.length === 0) {
    host.innerHTML = '<div class="empty">Válassz gyakorlatot a jobb oldali listából.</div>';
    return;
  }
  host.innerHTML = state.builderBlocks
    .map((block, index) => {
      const ex = state.exercises.find((e) => e.id === block.exerciseId);
      return `
      <div class="block">
        <div class="row" style="display:flex;justify-content:space-between;">
          <strong>${esc(ex ? ex.nameHu : block.exerciseId)}</strong>
          <button class="btn small danger" data-remove="${index}">Törlés</button>
        </div>
        <div class="row">
          <label class="muted" style="font-size:11px;">Sorozat</label>
          <input type="number" min="1" value="${block.targetSets}" data-index="${index}" data-field="targetSets" />
          <label class="muted" style="font-size:11px;">Ismétlés</label>
          <input type="text" value="${esc(block.targetReps)}" data-index="${index}" data-field="targetReps" />
          <label class="muted" style="font-size:11px;">Pihenő (s)</label>
          <input type="number" min="0" value="${block.restSeconds}" data-index="${index}" data-field="restSeconds" />
        </div>
      </div>`;
    })
    .join('');

  host.querySelectorAll('[data-remove]').forEach((node) =>
    node.addEventListener('click', () => {
      state.builderBlocks.splice(Number(node.dataset.remove), 1);
      renderBuilderBlocks();
    }),
  );
  host.querySelectorAll('[data-field]').forEach((node) =>
    node.addEventListener('change', () => {
      const index = Number(node.dataset.index);
      const field = node.dataset.field;
      state.builderBlocks[index][field] =
        field === 'targetReps' ? node.value : Number(node.value);
    }),
  );
}

async function saveTemplate() {
  const userId = $('#builderClient').value;
  const title = $('#builderTitle').value.trim();
  if (!userId) return toast('Válassz ügyfelet.', true);
  if (!title) return toast('A terv neve kötelező.', true);
  if (state.builderBlocks.length === 0) return toast('Adj hozzá legalább egy gyakorlatot.', true);
  try {
    await api(`/api/admin/clients/${encodeURIComponent(userId)}/templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title,
        sessionType: $('#builderType').value,
        coachNote: $('#builderNote').value.trim() || undefined,
        blocks: state.builderBlocks,
      }),
    });
    toast('Edzői terv kiosztva.');
    state.builderBlocks = [];
    state.exercises.length && renderBuilderBlocks();
    $('#builderTitle').value = '';
    $('#builderNote').value = '';
    renderBuilderBlocks();
    renderExistingTemplates();
  } catch (e) {
    toast(e.message, true);
  }
}

async function renderExistingTemplates() {
  const userId = $('#builderClient').value;
  const host = $('#builderExisting');
  if (!userId) {
    host.innerHTML = '';
    return;
  }
  try {
    const detail = await api(`/api/admin/clients/${encodeURIComponent(userId)}`);
    host.innerHTML =
      detail.templates.length === 0
        ? ''
        : `<h3 style="margin-top:14px;">Kiosztott tervek</h3>` +
          detail.templates
            .map(
              (t) => `
        <div class="item">
          <div class="row">
            <h3>${esc(t.title)}</h3>
            <button class="btn small danger" data-del="${esc(t.id)}">Törlés</button>
          </div>
        </div>`,
            )
            .join('');
    host.querySelectorAll('[data-del]').forEach((node) =>
      node.addEventListener('click', async () => {
        try {
          await api(`/api/admin/templates/${encodeURIComponent(node.dataset.del)}`, { method: 'DELETE' });
          toast('Terv törölve.');
          renderExistingTemplates();
        } catch (e) {
          toast(e.message, true);
        }
      }),
    );
  } catch (e) {
    toast(e.message, true);
  }
}

// ---- Slots & bookings ------------------------------------------------------
async function loadSlotsAndBookings() {
  try {
    const [slotsRes, clientsRes] = await Promise.all([
      api('/api/admin/slots'),
      api('/api/admin/clients'),
    ]);
    state.slots = slotsRes.slots;
    state.clients = clientsRes.clients;
    const bookings = [];
    for (const client of state.clients) {
      const detail = await api(`/api/admin/clients/${encodeURIComponent(client.userId)}`);
      for (const booking of detail.bookings) {
        bookings.push({ ...booking, clientName: client.fullName || client.userId });
      }
    }
    state.bookings = bookings;
    renderSlots();
    renderBookings();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderSlots() {
  $('#slotsList').innerHTML =
    state.slots.length === 0
      ? '<div class="empty">Nincs publikált időpont.</div>'
      : state.slots
          .map(
            (s) => `
        <div class="item">
          <div class="row">
            <h3>${esc(MODALITY_LABELS[s.modality] || s.modality)}</h3>
            <button class="btn small danger" data-delslot="${esc(s.id)}">Törlés</button>
          </div>
          <div class="row muted">${esc(fmtDateTime(s.startsAt))} → ${esc(fmtDateTime(s.endsAt))}</div>
          <div class="row">${esc(s.locationOrLink || '—')} ${
            s.isBooked ? '<span class="pill warning">Lefoglalva</span>' : '<span class="pill success">Szabad</span>'
          }</div>
        </div>`,
          )
          .join('');
  $$('#slotsList [data-delslot]').forEach((node) =>
    node.addEventListener('click', async () => {
      try {
        await api(`/api/admin/slots/${encodeURIComponent(node.dataset.delslot)}`, { method: 'DELETE' });
        toast('Időpont törölve.');
        loadSlotsAndBookings();
      } catch (e) {
        toast(e.message, true);
      }
    }),
  );
}

function renderBookings() {
  const orders = { pending: 0, confirmed: 1, completed: 2, cancelled: 3 };
  const sorted = state.bookings
    .slice()
    .sort((a, b) => (orders[a.status] - orders[b.status]) || a.startsAt.localeCompare(b.startsAt));
  $('#bookingsList').innerHTML =
    sorted.length === 0
      ? '<div class="empty">Nincs foglalás.</div>'
      : sorted
          .map(
            (b) => `
        <div class="item" data-booking="${esc(b.id)}">
          <div class="row">
            <h3>${esc(b.clientName)}</h3>
            <span class="pill ${STATUS_TONE[b.status]}">${esc(STATUS_LABELS[b.status])}</span>
          </div>
          <div class="row muted">${esc(MODALITY_LABELS[b.modality])} · ${esc(fmtDateTime(b.startsAt))}</div>
          ${b.clientNotes ? `<div class="row"><span class="muted">Ügyfél: ${esc(b.clientNotes)}</span></div>` : ''}
          <div class="row" style="margin-top:8px;">
            <input class="booking-note" data-id="${esc(b.id)}" placeholder="Edzői megjegyzés" value="${esc(b.coachNotes || '')}" />
          </div>
          <div class="row">
            <input class="booking-link" data-id="${esc(b.id)}" placeholder="Meeting link / helyszín" value="${esc(b.locationOrLink || '')}" />
          </div>
          <div class="row" style="flex-wrap:wrap;gap:6px;margin-top:8px;">
            <button class="btn small success" data-status="confirmed" data-id="${esc(b.id)}">Visszaigazol</button>
            <button class="btn small" data-status="completed" data-id="${esc(b.id)}">Lezajlott</button>
            <button class="btn small danger" data-status="cancelled" data-id="${esc(b.id)}">Lemond</button>
            <button class="btn small ghost" data-status="${esc(b.status)}" data-id="${esc(b.id)}">Jegyzet mentése</button>
          </div>
        </div>`,
          )
          .join('');

  $$('#bookingsList [data-status]').forEach((node) =>
    node.addEventListener('click', () => patchBooking(node.dataset.id, node.dataset.status)),
  );
}

async function patchBooking(bookingId, status) {
  const noteEl = document.querySelector(`.booking-note[data-id="${CSS.escape(bookingId)}"]`);
  const linkEl = document.querySelector(`.booking-link[data-id="${CSS.escape(bookingId)}"]`);
  try {
    await api(`/api/admin/bookings/${encodeURIComponent(bookingId)}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status,
        coachNotes: noteEl ? noteEl.value.trim() || undefined : undefined,
        locationOrLink: linkEl ? linkEl.value.trim() || undefined : undefined,
      }),
    });
    toast(`Foglalás frissítve: ${STATUS_LABELS[status]}.`);
    loadSlotsAndBookings();
  } catch (e) {
    toast(e.message, true);
  }
}

function createSlot() {
  const startValue = $('#slotStart').value;
  if (!startValue) return toast('Adj meg kezdési időpontot.', true);
  const duration = Number($('#slotDuration').value) || 45;
  const start = new Date(startValue);
  const end = new Date(start.getTime() + duration * 60000);
  api('/api/admin/slots', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      startsAt: start.toISOString(),
      endsAt: end.toISOString(),
      modality: $('#slotModality').value,
      locationOrLink: $('#slotLocation').value.trim(),
    }),
  })
    .then(() => {
      toast('Időpont létrehozva.');
      $('#slotLocation').value = '';
      loadSlotsAndBookings();
    })
    .catch((e) => toast(e.message, true));
}

// ---- Catalog view ----------------------------------------------------------
async function loadCatalogView() {
  try {
    if (state.exercises.length === 0) {
      const res = await api('/api/admin/exercises');
      state.exercises = res.exercises;
    }
    $('#catalogCount').textContent = `(${state.exercises.length})`;
    renderCategoryChips('#catalogFilters', state.exerciseFilter, (cat) => {
      state.exerciseFilter = cat;
      renderCatalogList();
    });
    $('#catalogSearch').oninput = renderCatalogList;
    renderCatalogList();
  } catch (e) {
    toast(e.message, true);
  }
}

function renderCatalogList() {
  const query = $('#catalogSearch').value;
  const list = state.exercises.filter((ex) => matchExercise(ex, query, state.exerciseFilter));
  $('#catalogList').innerHTML = list
    .map(
      (ex) => `
      <div class="exercise">
        <div>
          <div>${esc(ex.nameHu)} <span class="muted">· ${esc(ex.nameEn)}</span></div>
          <div class="muted" style="font-size:11px;">${esc(CATEGORY_LABELS[ex.category] || ex.category)} · ${esc(ex.movementPattern)} · ${esc(ex.equipment)}</div>
        </div>
        <div class="scores">${exerciseScores(ex)}</div>
      </div>`,
    )
    .join('');
}

// ---- Bootstrap -------------------------------------------------------------
function init() {
  $$('.nav-btn').forEach((btn) => btn.addEventListener('click', () => showView(btn.dataset.view)));
  $('#slotCreate').addEventListener('click', createSlot);
  // Client list refresh (the browser analog of a pull-to-refresh control): re-fetches
  // the client list, and the open detail panel, straight from the backend.
  $('#clientsRefresh').addEventListener('click', () => {
    void loadClients();
    if (state.selectedClientId) {
      void openClient(state.selectedClientId);
    }
  });
  showView('overview');
}

document.addEventListener('DOMContentLoaded', init);
