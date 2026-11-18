// views/train.js — muscle recovery, starting and logging workouts, rest timer and history.

import { state, ui, commit, refresh, save, MUSCLES } from '../store.js';
import * as L from '../logic.js';
import { esc, fmtDay, fmtShort, fmtClock, num, uid, parseKey, plural, addDays } from '../util.js';
import { on, openSheet, closeSheet, refreshSheet, sheetHead, confirmSheet, toast, ring, chips, sheetRoot } from '../ui.js';
import { I } from '../icons.js';

const STATUS = {
  ready: { label: 'Ready', cls: 'st-ready' },
  almost: { label: 'Almost ready', cls: 'st-almost' },
  recovering: { label: 'Recovering', cls: 'st-rec' },
};

export function renderTrain() {
  if (ui.sub === 'session' && state.activeWorkout) return renderSession();
  return renderOverview();
}

/* ---------- Overview ---------- */

function renderOverview() {
  const rec = L.recovery();
  const groups = { ready: [], almost: [], recovering: [] };
  MUSCLES.forEach((m) => groups[rec[m].status].push(rec[m]));
  const aw = state.activeWorkout;
  const history = L.workoutsNewest();
  const shown = ui.showAllHistory ? history : history.slice(0, 6);
  const readyNames = groups.ready.map((o) => o.muscle);

  return `<div class="stack">
    <header class="row between">
      <div class="col"><span class="sub">${groups.ready.length} of ${MUSCLES.length} muscle groups ready</span><h1 class="h1">Train</h1></div>
    </header>

    ${aw ? `<button class="card tint row between" data-act="resume-workout">
        <span class="col"><span class="eyebrow">Workout in progress</span><span class="h2">${esc(aw.name || L.autoName(aw.entries))}</span>
        <span class="small">${plural(aw.entries.length, 'exercise')}${aw.date === L.today() && !aw.editingId ? ` · <span data-tick="elapsed">${fmtClock(Date.now() - aw.startedAt)}</span>` : ''}</span></span>
        <span class="round-btn">${I.arrowR}</span></button>`
      : `<section class="card tint stack sm" aria-label="Suggested">
        <span class="eyebrow">${readyNames.length === MUSCLES.length ? 'Fully recovered' : readyNames.length ? 'Ready to train' : 'Everything is still recovering'}</span>
        <span class="h2 lg">${readyNames.length === MUSCLES.length ? 'Every muscle group is ready' : readyNames.length ? esc(readyNames.join(' · ')) : 'Rest day, or keep it light'}</span>
        <div class="row gap8 wrap">
          <button class="pill solid tall" data-act="start-workout">${I.plus}Start workout</button>
          ${history.length ? `<button class="pill tall" data-act="repeat-list">${I.repeat}Repeat a workout</button>` : ''}
        </div></section>`}

    <section class="card stack" aria-label="Recovery">
      <div class="row between"><h2 class="h2">Recovery</h2><span class="sub">Tap a muscle to adjust</span></div>
      ${['ready', 'almost', 'recovering'].filter((s) => groups[s].length).map((s) => `
        <div class="stack xs">
          <span class="label ${STATUS[s].cls}-text">${STATUS[s].label}</span>
          <div class="chips">${groups[s].map((o) => `
            <button class="chip status ${STATUS[s].cls}" data-act="muscle" data-m="${o.muscle}">
              ${s === 'ready' ? I.check : ''}${o.muscle}${s !== 'ready' ? `<span class="chip-sub">${L.fmtLeft(o.left)}</span>` : ''}
            </button>`).join('')}</div>
        </div>`).join('')}
    </section>

    <section class="card" aria-label="History">
      <div class="row between card-head"><h2 class="h2">History</h2>
        <button class="pill ghost" data-act="start-workout" data-past="1">${I.plus}Log past workout</button></div>
      ${shown.length ? `<div class="list">${shown.map((w) => `
        <button class="agenda-row as-btn" data-act="view-workout" data-id="${w.id}">
          <span class="col grow left"><span class="t-title">${esc(w.name)}</span>
          <span class="t-meta">${esc(fmtDay(w.date))} · ${plural(w.entries.length, 'exercise')} · ${num(L.volume(w))} lb</span></span>
          <span class="chev">${I.chevR}</span></button>`).join('')}</div>
        ${history.length > 6 ? `<button class="link center" data-act="toggle-history">${ui.showAllHistory ? 'Show less' : `Show all ${history.length}`}</button>` : ''}`
      : `<p class="empty">No workouts yet. Start one above and it will show up here.</p>`}
    </section>
  </div>`;
}

/* ---------- Active workout ---------- */

function renderSession() {
  const aw = state.activeWorkout;
  const auto = L.autoName(aw.entries);
  const live = aw.date === L.today() && !aw.editingId;
  return `<div class="stack">
    <header class="row between">
      <div class="row gap12 grow min0">
        <button class="icon-btn" data-act="session-back" aria-label="Back to Train">${I.chevL}</button>
        <div class="col grow min0">
          <input class="title-input" data-in="wo-name" value="${esc(aw.name)}" placeholder="${esc(auto)}" aria-label="Workout name" enterkeyhint="done">
          <span class="sub row gap6">${live ? `<span data-tick="elapsed">${fmtClock(Date.now() - aw.startedAt)}</span> ·` : ''}
            <input type="date" class="mini-date" data-ch="wo-date" value="${aw.date}" aria-label="Workout date"></span>
        </div>
      </div>
      <button class="pill solid tall" data-act="finish-workout">${aw.editingId ? 'Save' : 'Finish'}</button>
    </header>
    ${restCard()}
    ${aw.entries.map((en, i) => entryCard(en, i)).join('')}
    ${aw.entries.length ? '' : `<p class="empty card">Add your first exercise to get going.</p>`}
    <button class="btn secondary" data-act="pick-exercise">${I.plus}Add exercise</button>
    <button class="link center danger-text" data-act="discard-workout">${aw.editingId ? 'Cancel editing' : 'Discard workout'}</button>
  </div>`;
}

function restCard() {
  const aw = state.activeWorkout;
  if (!aw.restEndsAt || aw.restEndsAt <= Date.now()) return '';
  const left = aw.restEndsAt - Date.now();
  const pct = left / ((aw.restTotal || state.settings.restSeconds) * 1000);
  return `<section class="card row gap16" aria-label="Rest timer">
    <div class="ring-wrap" data-tick="rest-ring">${ring(pct, 76, 7, 'var(--accent)')}<span class="ring-center" data-tick="rest">${fmtClock(left)}</span></div>
    <div class="col grow gap8">
      <span class="col"><span class="h2">Resting</span><span class="small">Next set when the timer ends</span></span>
      <div class="row gap8"><button class="pill ghost tall" data-act="rest-add" data-d="15" aria-label="Add 15 seconds">+15s</button>
        <button class="pill tall" data-act="rest-skip">Skip rest</button></div>
    </div></section>`;
}

/** Suggested weight/reps for a set: what you did last time, or the set before. */
function hint(i, j) {
  const aw = state.activeWorkout;
  const en = aw.entries[i];
  const last = L.lastTime(en.exerciseId, aw.editingId);
  const src = last ? (last.sets[j] || last.sets[last.sets.length - 1]) : null;
  const prev = j > 0 ? en.sets[j - 1] : null;
  const w = src ? src.w : prev && prev.w !== '' ? prev.w : '';
  const r = src ? src.r : prev && prev.r !== '' ? prev.r : '';
  return { w: w === '' || w == null ? '' : String(w), r: r === '' || r == null ? '' : String(r) };
}

function entryCard(en, i) {
  const aw = state.activeWorkout;
  const ex = L.exById(en.exerciseId);
  if (!ex) return '';
  const last = L.lastTime(en.exerciseId, aw.editingId);
  const prevBest = L.bestFor(en.exerciseId, aw.editingId);
  const firstOpen = en.sets.findIndex((s) => !s.done);
  const muscles = [ex.primary, ...(ex.secondary || [])];
  return `<section class="card stack sm" aria-label="${esc(ex.name)}">
    <div class="row between">
      <div class="col min0"><h2 class="h2 lg ellipsis">${esc(ex.name)}</h2><span class="small">${esc(muscles.join(' · '))}${ex.bodyweight ? ' · bodyweight' : ''}</span></div>
      <button class="icon-btn sm" data-act="entry-menu" data-i="${i}" aria-label="Options for ${esc(ex.name)}">${I.more}</button>
    </div>
    ${last ? `<div class="last-time"><span class="small strong blue">Last time · ${esc(fmtShort(last.date))}</span>
      <span class="num-sm">${last.sets.map((s) => `${num(s.w, 1)}×${s.r}`).join(' · ')}</span></div>` : ''}
    <div class="set-grid set-head"><span>Set</span><span>${ex.bodyweight ? '+lb' : 'lb'}</span><span>Reps</span><span class="center">Done</span></div>
    ${en.sets.map((s, j) => {
      const h = hint(i, j);
      let badge = '';
      if (s.done) {
        const ls = last && last.sets[j];
        const cw = Number(s.w) || 0, cr = Number(s.r) || 0;
        if (prevBest && L.setE1rm(ex, s, aw.date) > prevBest.e1rm + 0.01) badge = '<span class="badge pr">PR</span>';
        else if (ls && cw > Number(ls.w)) badge = `<span class="badge">+${num(cw - Number(ls.w), 1)} lb</span>`;
        else if (ls && cw === Number(ls.w) && cr > Number(ls.r)) badge = `<span class="badge">+${cr - Number(ls.r)} rep${cr - Number(ls.r) > 1 ? 's' : ''}</span>`;
      }
      return `<div class="set-grid set-row ${s.done ? 'done' : ''} ${j === firstOpen ? 'next' : ''}">
        <span class="set-n">${j + 1}</span>
        <input class="set-in" inputmode="decimal" data-in="set-w" data-i="${i}" data-j="${j}" value="${esc(s.w)}" placeholder="${esc(h.w || (ex.bodyweight ? '0' : ''))}" aria-label="Set ${j + 1} ${ex.bodyweight ? 'added weight' : 'weight'} in pounds">
        <span class="rel"><input class="set-in" inputmode="numeric" data-in="set-r" data-i="${i}" data-j="${j}" value="${esc(s.r)}" placeholder="${esc(h.r)}" aria-label="Set ${j + 1} reps">${badge}</span>
        <button class="set-check ${s.done ? 'on' : ''}" data-act="set-done" data-i="${i}" data-j="${j}" aria-pressed="${s.done}" aria-label="Set ${j + 1} done">${I.check}</button>
      </div>`;
    }).join('')}
    <div class="grid2">
      <button class="btn secondary sm" data-act="add-set" data-i="${i}">${I.plus}Add set</button>
      <button class="btn secondary sm" data-act="remove-set" data-i="${i}" ${en.sets.length <= 1 ? 'disabled' : ''}>${I.minus}Remove set</button>
    </div>
  </section>`;
}

/* ---------- Starting / finishing ---------- */

function newWorkout(extra = {}) {
  return { id: uid(), date: L.today(), name: '', startedAt: Date.now(), entries: [], restEndsAt: null, restTotal: 0, restAlerted: true, ...extra };
}

function startWorkout({ from = null, past = false } = {}) {
  if (state.activeWorkout) { ui.tab = 'train'; ui.sub = 'session'; refresh(); return; }
  const extra = from ? {
    name: from.name,
    entries: from.entries.map((en) => ({ exerciseId: en.exerciseId, sets: en.sets.map(() => ({ w: '', r: '', done: false })) })),
  } : {};
  if (past) extra.date = addDays(L.today(), -1);
  state.activeWorkout = newWorkout(extra);
  ui.tab = 'train';
  ui.sub = 'session';
  commit();
  if (!from) openPicker();
}

/** Sets worth keeping: done, or with both numbers typed in. */
function cleaned(aw) {
  return aw.entries.map((en) => ({
    exerciseId: en.exerciseId,
    sets: en.sets.filter((s) => s.done || (s.w !== '' && s.r !== '')).map((s) => ({ w: Number(s.w) || 0, r: Number(s.r) || 0 })).filter((s) => s.r > 0),
  })).filter((en) => en.sets.length);
}

function findPRs(entries, date, skipId) {
  const prs = [];
  for (const en of entries) {
    const ex = L.exById(en.exerciseId);
    const prev = L.bestFor(en.exerciseId, skipId);
    let best = 0, bestSet = null;
    for (const s of en.sets) { const v = L.setE1rm(ex, s, date); if (v > best) { best = v; bestSet = s; } }
    if (prev && best > prev.e1rm + 0.01) prs.push({ ex, best, set: bestSet });
  }
  return prs;
}

function finishSheet() {
  const aw = state.activeWorkout;
  const entries = cleaned(aw);
  const sets = entries.reduce((n, e) => n + e.sets.length, 0);
  const vol = L.volume({ date: aw.date, entries });
  const prs = findPRs(entries, aw.date, aw.editingId);
  const live = aw.date === L.today() && !aw.editingId;
  return `${sheetHead(aw.editingId ? 'Save changes' : 'Finish workout')}
  <div class="stack">
    <div class="grid3 stat-tiles">
      <div class="tile"><span class="tile-num">${entries.length}</span><span class="small">exercises</span></div>
      <div class="tile"><span class="tile-num">${sets}</span><span class="small">sets</span></div>
      <div class="tile"><span class="tile-num">${live ? Math.max(1, Math.round((Date.now() - aw.startedAt) / 60000)) : num(vol)}</span><span class="small">${live ? 'minutes' : 'lb moved'}</span></div>
    </div>
    ${prs.length ? `<div class="card tint stack xs"><span class="eyebrow">${I.trophy}New personal record${prs.length > 1 ? 's' : ''}</span>
      ${prs.map((p) => `<span class="t-title">${esc(p.ex.name)} · est. max ${num(p.best)} lb</span>`).join('')}</div>` : ''}
    ${sets ? '' : `<p class="empty">No sets logged yet. Mark a set done, or type its weight and reps.</p>`}
    <button class="btn" data-act="save-workout" ${sets ? '' : 'disabled'}>Save workout</button>
    <button class="btn secondary" data-act="sheet-close">Keep going</button>
  </div>`;
}

/* ---------- Exercise picker ---------- */

const pick = { q: '', muscle: 'all', creating: false, form: null };

function openPicker() {
  pick.q = ''; pick.muscle = 'all'; pick.creating = false;
  openSheet(pickerSheet, { label: 'Add exercise' });
}

function pickList() {
  const rec = L.recovery();
  const q = pick.q.trim().toLowerCase();
  const used = {};
  for (const w of state.workouts) for (const en of w.entries) used[en.exerciseId] = Math.max(used[en.exerciseId] || 0, parseKey(w.date).getTime());
  const inWorkout = new Set((state.activeWorkout ? state.activeWorkout.entries : []).map((e) => e.exerciseId));
  const list = state.exercises
    .filter((e) => pick.muscle === 'all' || e.primary === pick.muscle || (e.secondary || []).includes(pick.muscle))
    .filter((e) => !q || e.name.toLowerCase().includes(q))
    .sort((a, b) => (used[b.id] || 0) - (used[a.id] || 0) || a.name.localeCompare(b.name));
  if (!list.length) return `<p class="empty">No match. Create it below.</p>`;
  return list.map((e) => {
    const r = rec[e.primary];
    const st = STATUS[r.status];
    return `<button class="agenda-row as-btn" data-act="add-exercise" data-id="${e.id}">
      <span class="col grow left"><span class="t-title">${esc(e.name)}${inWorkout.has(e.id) ? ' <span class="muted">· added</span>' : ''}</span>
      <span class="t-meta">${esc([e.primary, ...(e.secondary || [])].join(' · '))}</span></span>
      <span class="status-tag ${st.cls}-text">${r.status === 'ready' ? 'Ready' : L.fmtLeft(r.left)}</span></button>`;
  }).join('');
}

function pickerSheet() {
  if (pick.creating) return createExerciseForm();
  const rec = L.recovery();
  return `${sheetHead('Add exercise')}
  <div class="stack">
    <div class="input-wrap"><span class="prefix">${I.search}</span>
      <input class="input with-prefix" data-in="pick-q" value="${esc(pick.q)}" placeholder="Search exercises" aria-label="Search exercises" autocomplete="off" enterkeyhint="search"></div>
    <div class="chips scroll-x">
      <button class="chip small ${pick.muscle === 'all' ? 'on' : ''}" data-act="pick-muscle" data-m="all" aria-pressed="${pick.muscle === 'all'}">All</button>
      ${MUSCLES.map((m) => `<button class="chip small ${pick.muscle === m ? 'on' : ''}" data-act="pick-muscle" data-m="${m}" aria-pressed="${pick.muscle === m}">
        <i class="dot ${STATUS[rec[m].status].cls}-bg"></i>${m}</button>`).join('')}
    </div>
    <div class="list" id="pick-list">${pickList()}</div>
    <button class="btn secondary" data-act="pick-create">${I.plus}Create a new exercise</button>
  </div>`;
}

function createExerciseForm() {
  const f = pick.form;
  return `${sheetHead('New exercise')}
  <div class="stack">
    <div class="field"><label class="label" for="ex-name">Name</label>
      <input id="ex-name" class="input" data-in="ex-name" value="${esc(f.name)}" placeholder="e.g. Machine Chest Press" autocomplete="off"></div>
    <div class="field"><span class="label">Main muscle</span>${chips('ex-primary', 'primary', MUSCLES.map((m) => [m, m]), f.primary)}</div>
    <div class="field"><span class="label">Also works <span class="muted">(optional)</span></span>
      <div class="chips">${MUSCLES.filter((m) => m !== f.primary).map((m) => {
        const onM = f.secondary.includes(m);
        return `<button class="chip ${onM ? 'on' : ''}" data-act="ex-secondary" data-m="${m}" aria-pressed="${onM}">${m}</button>`;
      }).join('')}</div></div>
    <button class="row between toggle-row" data-act="ex-bw" role="switch" aria-checked="${f.bodyweight}">
      <span class="col left"><span class="t-title">Bodyweight exercise</span><span class="t-meta">Uses your body weight plus any weight you add</span></span>
      <span class="switch ${f.bodyweight ? 'on' : ''}"><i></i></span></button>
    <button class="btn" data-act="ex-save">Save and add</button>
    <button class="btn secondary" data-act="pick-back">Back</button>
  </div>`;
}

/* ---------- Workout detail (from history) ---------- */

function workoutSheet(id) {
  const w = state.workouts.find((x) => x.id === id);
  if (!w) return `${sheetHead('Workout')}<p class="empty">This workout was deleted.</p>`;
  const mins = w.endedAt && w.startedAt && w.endedAt > w.startedAt ? Math.round((w.endedAt - w.startedAt) / 60000) : null;
  return `${sheetHead(w.name)}
  <div class="stack">
    <span class="sub">${esc(fmtDay(w.date))}${mins ? ` · ${mins} min` : ''} · ${num(L.volume(w))} lb moved</span>
    ${w.entries.map((en) => {
      const ex = L.exById(en.exerciseId);
      const best = L.bestFor(en.exerciseId);
      const isPR = best && best.workoutId === w.id;
      return `<div class="card flat stack xs">
        <div class="row between"><span class="t-title">${esc(ex ? ex.name : 'Exercise')}</span>${isPR ? '<span class="badge pr static">PR</span>' : ''}</div>
        <span class="num-sm">${en.sets.map((s) => `${num(s.w, 1)}×${s.r}`).join(' · ')}</span></div>`;
    }).join('')}
    <div class="grid2">
      <button class="btn secondary" data-act="edit-workout" data-id="${w.id}">Edit</button>
      <button class="btn secondary" data-act="repeat-from" data-id="${w.id}">Do it again</button>
    </div>
    <button class="btn danger" data-act="delete-workout" data-id="${w.id}">Delete workout</button>
  </div>`;
}

/* ---------- Muscle detail ---------- */

let muscleOpen = null;
function muscleSheet() {
  const m = muscleOpen;
  const o = L.recovery()[m];
  const st = STATUS[o.status];
  const readyTime = o.status === 'ready' ? '' : new Date(o.readyAt).toLocaleString('en-US', { weekday: 'short', hour: 'numeric', minute: '2-digit' });
  return `${sheetHead(m)}
  <div class="stack">
    <div class="card flat row gap16">${ring(o.pct, 64, 7, `var(--${o.status === 'ready' ? 'green-text' : o.status === 'almost' ? 'amber' : 'red'})`)}
      <span class="col"><span class="h2 ${st.cls}-text">${st.label}</span>
      <span class="small">${o.status === 'ready' ? 'Good to train' : `Ready in ${L.fmtLeft(o.left)} · ${readyTime}`}</span>
      <span class="small">${o.last ? `Last trained ${fmtDay(keyFromMs(o.last))}` : 'Not trained yet'}</span></span></div>
    <div class="row between"><span class="col"><span class="t-title">Recovery time</span><span class="t-meta">When ${m.toLowerCase()} is the main muscle</span></span>
      <div class="stepper">
        <button class="icon-btn sm" data-act="rec-adj-m" data-d="-12" aria-label="Less recovery time">${I.minus}</button>
        <span class="stepper-val sm">${state.settings.recovery[m]}h</span>
        <button class="icon-btn sm" data-act="rec-adj-m" data-d="12" aria-label="More recovery time">${I.plus}</button>
      </div></div>
  </div>`;
}
const keyFromMs = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------- Actions ---------- */

on({
  'start-workout': (el) => {
    const past = !!el.dataset.past && !state.activeWorkout;
    startWorkout({ past });
    if (past) toast('Set the date at the top, then add what you did');
  },
  'resume-workout': () => { ui.tab = 'train'; ui.sub = 'session'; refresh(); },
  'session-back': () => { ui.sub = null; refresh(); },
  'toggle-history': () => { ui.showAllHistory = !ui.showAllHistory; refresh(); },
  'repeat-list': () => {
    const recent = L.workoutsNewest().slice(0, 12);
    openSheet(() => `${sheetHead('Repeat a workout')}
      <div class="list">${recent.map((w) => `<button class="agenda-row as-btn" data-act="repeat-from" data-id="${w.id}">
        <span class="col grow left"><span class="t-title">${esc(w.name)}</span><span class="t-meta">${esc(fmtDay(w.date))} · ${esc(w.entries.map((e) => (L.exById(e.exerciseId) || {}).name).filter(Boolean).slice(0, 3).join(', '))}${w.entries.length > 3 ? '…' : ''}</span></span>
        <span class="chev">${I.chevR}</span></button>`).join('')}</div>`, { label: 'Repeat a workout' });
  },
  'repeat-from': (el) => {
    const w = state.workouts.find((x) => x.id === el.dataset.id);
    if (!w) return;
    if (state.activeWorkout) { closeSheet(); toast('Finish or discard your current workout first'); return; }
    closeSheet();
    startWorkout({ from: w });
  },
  'wo-name': (el) => { state.activeWorkout.name = el.value; save(); },
  'wo-date': (el) => { if (el.value) { state.activeWorkout.date = el.value; commit(); } },
  'discard-workout': () => {
    const editing = state.activeWorkout && state.activeWorkout.editingId;
    confirmSheet({ title: editing ? 'Stop editing?' : 'Discard this workout?', message: editing ? 'Your changes won’t be saved.' : 'Sets you logged in this workout will be lost.', yes: editing ? 'Stop editing' : 'Discard', danger: true }, () => {
      state.activeWorkout = null;
      ui.sub = null;
      commit();
    });
  },

  // Sets
  'set-w': (el) => { state.activeWorkout.entries[el.dataset.i].sets[el.dataset.j].w = el.value; save(); },
  'set-r': (el) => { state.activeWorkout.entries[el.dataset.i].sets[el.dataset.j].r = el.value; save(); },
  'set-done': (el) => {
    const aw = state.activeWorkout;
    const i = Number(el.dataset.i), j = Number(el.dataset.j);
    const s = aw.entries[i].sets[j];
    if (s.done) { s.done = false; commit(); return; }
    const h = hint(i, j);
    if (s.w === '') s.w = h.w || '0';
    if (s.r === '') s.r = h.r;
    if (!(Number(s.r) > 0)) { s.r = ''; toast('Type how many reps first'); commit(); return; }
    s.done = true;
    aw.restTotal = state.settings.restSeconds;
    aw.restEndsAt = Date.now() + aw.restTotal * 1000;
    aw.restAlerted = false;
    commit();
  },
  'add-set': (el) => { state.activeWorkout.entries[el.dataset.i].sets.push({ w: '', r: '', done: false }); commit(); },
  'remove-set': (el) => {
    const sets = state.activeWorkout.entries[el.dataset.i].sets;
    if (sets.length > 1) { sets.pop(); commit(); }
  },
  'rest-add': (el) => {
    const aw = state.activeWorkout;
    const d = Number(el.dataset.d) * 1000;
    aw.restEndsAt += d; aw.restTotal += d / 1000;
    commit();
  },
  'rest-skip': () => { state.activeWorkout.restEndsAt = null; state.activeWorkout.restAlerted = true; commit(); },

  // Exercise menu
  'entry-menu': (el) => {
    const i = Number(el.dataset.i);
    const ex = L.exById(state.activeWorkout.entries[i].exerciseId);
    const n = state.activeWorkout.entries.length;
    openSheet(() => `${sheetHead(ex ? ex.name : 'Exercise')}
      <div class="stack sm">
        <button class="btn secondary" data-act="entry-move" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>Move up</button>
        <button class="btn secondary" data-act="entry-move" data-i="${i}" data-d="1" ${i === n - 1 ? 'disabled' : ''}>Move down</button>
        <button class="btn danger" data-act="entry-remove" data-i="${i}">Remove from workout</button>
      </div>`, { label: 'Exercise options' });
  },
  'entry-move': (el) => {
    const e = state.activeWorkout.entries;
    const i = Number(el.dataset.i), j = i + Number(el.dataset.d);
    if (j < 0 || j >= e.length) return;
    [e[i], e[j]] = [e[j], e[i]];
    closeSheet(); commit();
  },
  'entry-remove': (el) => { state.activeWorkout.entries.splice(Number(el.dataset.i), 1); closeSheet(); commit(); },

  // Picker
  'pick-exercise': () => openPicker(),
  'pick-q': (el) => {
    pick.q = el.value;
    const root = sheetRoot();
    const list = root && root.querySelector('#pick-list');
    if (list) list.innerHTML = pickList();
  },
  'pick-muscle': (el) => { pick.muscle = el.dataset.m; refreshSheet(); },
  'add-exercise': (el) => {
    const aw = state.activeWorkout;
    if (!aw) return;
    const last = L.lastTime(el.dataset.id, aw.editingId);
    const n = last ? Math.min(last.sets.length, 8) : 3;
    aw.entries.push({ exerciseId: el.dataset.id, sets: Array.from({ length: n }, () => ({ w: '', r: '', done: false })) });
    closeSheet();
    commit();
    requestAnimationFrame(() => { const s = document.getElementById('screen'); if (s) s.scrollTo({ top: s.scrollHeight, behavior: 'smooth' }); });
  },
  'pick-create': () => { pick.creating = true; pick.form = { name: pick.q.trim(), primary: pick.muscle !== 'all' ? pick.muscle : 'Chest', secondary: [], bodyweight: false }; refreshSheet(); },
  'pick-back': () => { pick.creating = false; refreshSheet(); },
  'ex-name': (el) => { pick.form.name = el.value; },
  'ex-primary': (el) => { pick.form.primary = el.dataset.v; pick.form.secondary = pick.form.secondary.filter((m) => m !== el.dataset.v); refreshSheet(); },
  'ex-secondary': (el) => {
    const m = el.dataset.m, s = pick.form.secondary;
    pick.form.secondary = s.includes(m) ? s.filter((x) => x !== m) : [...s, m];
    refreshSheet();
  },
  'ex-bw': () => { pick.form.bodyweight = !pick.form.bodyweight; refreshSheet(); },
  'ex-save': () => {
    const f = pick.form;
    const name = f.name.trim();
    if (!name) { toast('Give the exercise a name'); return; }
    const dupe = state.exercises.find((e) => e.name.toLowerCase() === name.toLowerCase());
    const ex = dupe || { id: uid(), name, primary: f.primary, secondary: f.secondary, bodyweight: f.bodyweight };
    if (!dupe) state.exercises.push(ex);
    if (state.activeWorkout) state.activeWorkout.entries.push({ exerciseId: ex.id, sets: [0, 1, 2].map(() => ({ w: '', r: '', done: false })) });
    closeSheet();
    commit();
    toast(dupe ? `${dupe.name} was already saved, so it was added` : `${name} saved`);
  },

  // Finish
  'finish-workout': () => openSheet(finishSheet, { label: 'Finish workout' }),
  'save-workout': () => {
    const aw = state.activeWorkout;
    const entries = cleaned(aw);
    if (!entries.length) { toast('Log at least one set first'); return; }
    const id = aw.editingId || aw.id;
    const prs = findPRs(entries, aw.date, id);
    const isLive = aw.date === L.today() && !aw.editingId;
    const workout = {
      id,
      date: aw.date,
      name: aw.name.trim() || L.autoName(entries),
      startedAt: aw.startedAt,
      endedAt: aw.editingId
        ? (aw.origDate === aw.date ? aw.origEndedAt : parseKey(aw.date).getTime() + 18 * 3600e3)
        : isLive ? Date.now() : parseKey(aw.date).getTime() + 18 * 3600e3,
      entries,
    };
    if (aw.editingId) {
      const i = state.workouts.findIndex((w) => w.id === aw.editingId);
      if (i >= 0) state.workouts[i] = workout; else state.workouts.push(workout);
    } else {
      state.workouts.push(workout);
    }
    state.activeWorkout = null;
    ui.sub = null;
    closeSheet();
    commit();
    toast(prs.length ? `New PR: ${prs.map((p) => p.ex.name).join(', ')}` : aw.editingId ? 'Workout updated' : 'Workout saved. Nice work.', 3600);
  },

  // History
  'view-workout': (el) => { const id = el.dataset.id; openSheet(() => workoutSheet(id), { label: 'Workout' }); },
  'edit-workout': (el) => {
    if (state.activeWorkout) { closeSheet(); toast('Finish or discard your current workout first'); return; }
    const w = state.workouts.find((x) => x.id === el.dataset.id);
    if (!w) return;
    state.activeWorkout = newWorkout({
      id: uid(), editingId: w.id, origEndedAt: w.endedAt, origDate: w.date, date: w.date, name: w.name, startedAt: w.startedAt || Date.now(),
      entries: w.entries.map((en) => ({ exerciseId: en.exerciseId, sets: en.sets.map((s) => ({ w: String(s.w), r: String(s.r), done: true })) })),
    });
    closeSheet();
    ui.tab = 'train'; ui.sub = 'session';
    commit();
  },
  'delete-workout': (el) => {
    const id = el.dataset.id;
    confirmSheet({ title: 'Delete this workout?', message: 'It will be removed from your history, records and recovery.', yes: 'Delete', danger: true }, () => {
      state.workouts = state.workouts.filter((w) => w.id !== id);
      commit();
      toast('Workout deleted');
    });
  },

  // Muscles
  muscle: (el) => { muscleOpen = el.dataset.m; openSheet(muscleSheet, { label: el.dataset.m }); },
  'rec-adj-m': (el) => {
    const m = muscleOpen;
    state.settings.recovery[m] = Math.min(120, Math.max(12, state.settings.recovery[m] + Number(el.dataset.d)));
    commit();
    refreshSheet();
  },
});
