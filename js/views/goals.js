// views/goals.js — body weight, lift, weekly, checklist and number goals.
// Weight, lift and weekly goals update themselves from what you log.

import { state, ui, commit, refresh } from '../store.js';
import * as L from '../logic.js';
import { esc, fmtShort, fmtDay, num, uid, parseNum } from '../util.js';
import { on, openSheet, closeSheet, refreshSheet, sheetHead, confirmSheet, toast, bar, chips } from '../ui.js';
import { I } from '../icons.js';

const KINDS = {
  weight: 'Body weight',
  lift: 'Lift',
  weekly: 'Weekly',
  checklist: 'Checklist',
  number: 'Number',
};
const isFitness = (g) => g.category === 'fitness';

export function renderGoals() {
  const active = state.goals.filter((g) => !g.completedAt);
  const finished = state.goals.filter((g) => g.completedAt).sort((a, b) => b.completedAt - a.completedAt);
  const month = L.today().slice(0, 7);
  const finishedThisMonth = finished.filter((g) => dateOf(g.completedAt).slice(0, 7) === month).length;
  const filtered = active.filter((g) => ui.goalFilter === 'all' || (ui.goalFilter === 'fitness' ? isFitness(g) : !isFitness(g)));
  const featured = filtered.find((g) => g.kind === 'weight') || filtered[0];
  const rest = filtered.filter((g) => g !== featured);

  return `<div class="stack">
    <header class="row between">
      <div class="col"><h1 class="h1">Goals</h1>
        <span class="sub">${active.length} active${finishedThisMonth ? ` · ${finishedThisMonth} finished this month` : ''}</span></div>
      <button class="pill solid tall" data-act="goal-new">${I.plus}New goal</button>
    </header>
    <div class="chips" role="group" aria-label="Filter goals">
      ${[['all', 'All'], ['fitness', 'Fitness'], ['life', 'Life']].map(([v, l]) => `<button class="chip small ${ui.goalFilter === v ? 'on solid' : ''}" data-act="goal-filter" data-v="${v}" aria-pressed="${ui.goalFilter === v}">${l}</button>`).join('')}
    </div>
    ${!active.length ? emptyState() : ''}
    ${featured ? featuredCard(featured) : active.length ? `<p class="empty card">No ${ui.goalFilter} goals yet.</p>` : ''}
    ${rest.length ? `<section class="card list-card" aria-label="Goals">${rest.map(goalRow).join('')}</section>` : ''}
    ${finished.length ? `<section class="card" aria-label="Finished goals">
      <h2 class="h2 card-head">Finished</h2>
      <div class="list">${finished.slice(0, 10).map((g) => `<button class="agenda-row as-btn" data-act="goal-open" data-id="${g.id}">
        <span class="check on" aria-hidden="true">${I.check}</span>
        <span class="col grow left"><span class="t-title">${esc(g.title)}</span><span class="t-meta">Finished ${esc(fmtShort(dateOf(g.completedAt)))}</span></span></button>`).join('')}</div>
    </section>` : ''}
  </div>`;
}

const dateOf = (ms) => { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

function emptyState() {
  return `<section class="card stack" aria-label="Ideas">
    <span class="h2">Pick something to work toward</span>
    <span class="small">Weight, lift and weekly goals fill in by themselves from what you log.</span>
    <div class="chips">
      <button class="chip" data-act="goal-new" data-kind="weight">${I.target}Reach a body weight</button>
      <button class="chip" data-act="goal-new" data-kind="lift">${I.dumbbell}Hit a lift</button>
      <button class="chip" data-act="goal-new" data-kind="weekly">${I.calendar}Train every week</button>
      <button class="chip" data-act="goal-new" data-kind="checklist">${I.check}A project with steps</button>
    </div></section>`;
}

function featuredCard(g) {
  const p = L.goalProgress(g);
  return `<button class="card tint stack featured as-btn" data-act="goal-open" data-id="${g.id}">
    <span class="row between"><span class="eyebrow">${esc(KINDS[g.kind])}</span>${statusPill(g, p)}</span>
    <span class="row between baseline gap12"><span class="h2 lg">${esc(g.title)}</span><span class="num-sm nowrap">${esc(p.text)}</span></span>
    ${p.weekly ? weekDots(p) : `${bar(p.pct, 'var(--accent)', 'thick on-tint')}`}
    <span class="small soft">${esc(p.sub)}${p.eta ? ` · on track for ${esc(fmtShort(p.eta))}` : ''}${g.deadline ? ` · due ${esc(fmtShort(g.deadline))}` : ''}</span>
  </button>`;
}

function statusPill(g, p) {
  if (p.done) return `<span class="tag green">Goal reached</span>`;
  if (g.kind === 'weight' && p.eta) {
    if (g.deadline && p.eta > g.deadline) return `<span class="tag amber">Behind pace</span>`;
    return `<span class="tag green">On pace</span>`;
  }
  return '';
}

function weekDots(p) {
  if (p.per > 10) return bar(p.pct, 'var(--accent)', 'thick');
  return `<span class="week-dots" aria-label="${p.current} of ${p.per}">${Array.from({ length: p.per }, (_, i) => `<i class="${i < p.current ? 'on' : ''}"></i>`).join('')}</span>`;
}

function goalRow(g) {
  const p = L.goalProgress(g);
  const color = g.kind === 'checklist' ? 'var(--green-text)' : g.kind === 'weekly' ? 'var(--blue)' : 'var(--accent)';
  return `<button class="goal-row as-btn" data-act="goal-open" data-id="${g.id}">
    <span class="row between baseline gap12"><span class="t-title">${esc(g.title)}</span><span class="num-sm muted nowrap">${esc(p.text)}</span></span>
    ${p.weekly ? weekDots(p) : bar(p.pct, color)}
    <span class="t-meta">${p.done ? 'Goal reached · tap to mark it finished' : esc(p.sub)}</span>
  </button>`;
}

/* ---------- Goal detail ---------- */

let openId = null;
function goalSheet() {
  const g = state.goals.find((x) => x.id === openId);
  if (!g) return `${sheetHead('Goal')}<p class="empty">This goal was deleted.</p>`;
  const p = L.goalProgress(g);
  let body = '';
  if (g.kind === 'checklist') {
    body = `<div class="list card flat">${(g.steps || []).map((s, i) => `
      <button class="agenda-row as-btn" data-act="goal-step" data-i="${i}" aria-pressed="${s.done}">
        <span class="check ${s.done ? 'on' : ''}" aria-hidden="true">${s.done ? I.check : ''}</span><span class="t-title grow left ${s.done ? 'struck' : ''}">${esc(s.text)}</span></button>`).join('')}</div>
      <form class="row gap8" data-submit="goal-add-step"><input class="input" name="step" placeholder="Add a step" aria-label="New step" autocomplete="off"><button class="pill solid tall">Add</button></form>`;
  } else if (g.kind === 'number') {
    body = `<div class="stepper big">
      <button class="icon-btn" data-act="goal-num" data-d="-1" aria-label="Decrease">${I.minus}</button>
      <span class="stepper-val">${num(g.current, 1)}<small>${esc(g.unit || '')}</small></span>
      <button class="icon-btn" data-act="goal-num" data-d="1" aria-label="Increase">${I.plus}</button></div>`;
  } else if (g.kind === 'weight') {
    body = `<button class="btn secondary" data-act="weight-new">${I.plus}Log today's weight</button>`;
  }
  return `${sheetHead(g.title)}
  <div class="stack">
    <span class="eyebrow">${esc(KINDS[g.kind])}${g.deadline ? ` · due ${esc(fmtDay(g.deadline))}` : ''}</span>
    <div class="row between baseline"><span class="big-num">${esc(p.text)}</span>${statusPill(g, p)}</div>
    ${p.weekly ? weekDots(p) : bar(p.pct, 'var(--accent)', 'thick')}
    <span class="small">${esc(p.sub)}${p.eta ? ` · on track for ${esc(fmtShort(p.eta))}` : ''}</span>
    ${body}
    ${g.completedAt
      ? `<button class="btn secondary" data-act="goal-reopen">Move back to active</button>`
      : `<button class="btn ${p.done ? '' : 'secondary'}" data-act="goal-complete">${I.trophy}Mark as finished</button>`}
    <div class="grid2"><button class="btn secondary" data-act="goal-edit">Edit</button><button class="btn danger" data-act="goal-delete">Delete</button></div>
  </div>`;
}

/* ---------- New / edit goal ---------- */

let gf = null;

function openGoalForm(goal, kind) {
  const lw = L.latestWeight();
  gf = goal ? {
    ...goal,
    stepsText: (goal.steps || []).map((s) => s.text).join('\n'),
    target: String(goal.target ?? ''), start: String(goal.start ?? ''), perWeek: String(goal.perWeek ?? ''), current: String(goal.current ?? ''),
  } : {
    id: null, kind: kind || 'weight', title: '', target: '', start: lw ? String(lw.lb) : '', exerciseId: null, metric: 'workouts', perWeek: '4',
    stepsText: '', unit: '', current: '0', category: '', deadline: '',
  };
  openSheet(goalForm, { label: goal ? 'Edit goal' : 'New goal' });
}

function exercisesWithHistory() {
  const used = new Set(state.workouts.flatMap((w) => w.entries.map((e) => e.exerciseId)));
  return [...state.exercises].sort((a, b) => Number(used.has(b.id)) - Number(used.has(a.id)) || a.name.localeCompare(b.name));
}

function goalForm() {
  const f = gf;
  const field = (k, label, mode = 'decimal', ph = '') => `<div class="field"><label class="label" for="gf-${k}">${label}</label>
    <input id="gf-${k}" class="input" inputmode="${mode}" data-in="gf" data-k="${k}" value="${esc(f[k])}" placeholder="${ph}" autocomplete="off"></div>`;
  let fields = '';
  if (f.kind === 'weight') {
    fields = `<div class="grid2">${field('target', 'Goal weight (lb)', 'decimal', '135')}${field('start', 'Starting weight (lb)', 'decimal', '128')}</div>`;
  } else if (f.kind === 'lift') {
    const list = exercisesWithHistory();
    if (!f.exerciseId) f.exerciseId = list[0] && list[0].id;
    const best = f.exerciseId && L.bestFor(f.exerciseId);
    fields = `<div class="field"><label class="label" for="gf-ex">Exercise</label>
      <select id="gf-ex" class="input" data-ch="gf-ex">${list.map((e) => `<option value="${e.id}" ${e.id === f.exerciseId ? 'selected' : ''}>${esc(e.name)}</option>`).join('')}</select></div>
      <div class="grid2">${field('target', 'Goal (lb)', 'decimal', '185')}${field('start', 'Starting max (lb)', 'decimal', best ? String(Math.round(best.e1rm)) : '')}</div>
      <span class="small">Progress uses your estimated one-rep max, worked out from your best set. ${best ? `Right now it's about ${num(best.e1rm)} lb.` : ''}</span>`;
  } else if (f.kind === 'weekly') {
    fields = `<div class="field"><span class="label">Count</span>${chips('gf-chip', 'metric', Object.entries(L.WEEKLY_METRICS).map(([v, m]) => [v, m.label]), f.metric)}</div>
      ${field('perWeek', 'How many per week', 'numeric', '4')}`;
  } else if (f.kind === 'checklist') {
    fields = `<div class="field"><label class="label" for="gf-steps">Steps, one per line</label>
      <textarea id="gf-steps" class="input" rows="5" data-in="gf" data-k="stepsText" placeholder="Measure the room&#10;Order the loft bed&#10;Build it">${esc(f.stepsText)}</textarea></div>`;
  } else {
    fields = `<div class="grid2">${field('target', 'Goal', 'decimal', '12')}${field('unit', 'Unit', 'text', 'books, $, miles')}</div>
      ${field('current', 'Where you are now', 'decimal', '0')}`;
  }
  const needsTitle = f.kind === 'checklist' || f.kind === 'number';
  const autoCat = ['weight', 'lift'].includes(f.kind) || (f.kind === 'weekly' && ['workouts', 'protein', 'calories'].includes(f.metric)) ? 'fitness' : 'life';
  return `${sheetHead(f.id ? 'Edit goal' : 'New goal')}
  <div class="stack">
    ${f.id ? '' : `<div class="field"><span class="label">Type</span>${chips('gf-kind', 'kind', Object.entries(KINDS), f.kind)}</div>`}
    <div class="field"><label class="label" for="gf-title">Name ${needsTitle ? '' : '<span class="muted">(optional)</span>'}</label>
      <input id="gf-title" class="input" data-in="gf" data-k="title" value="${esc(f.title)}" placeholder="${needsTitle ? (f.kind === 'checklist' ? 'Room makeover' : 'Read 12 books') : 'We’ll name it for you'}" autocomplete="off"></div>
    ${fields}
    <div class="field"><span class="label">Category</span>${chips('gf-chip', 'category', [['fitness', 'Fitness'], ['life', 'Life']], f.category || autoCat)}</div>
    <div class="field"><label class="label" for="gf-deadline">Deadline <span class="muted">(optional)</span></label>
      <input id="gf-deadline" type="date" class="input" data-in="gf" data-k="deadline" value="${esc(f.deadline || '')}"></div>
    <button class="btn" data-act="gf-save">Save goal</button>
  </div>`;
}

function buildGoal() {
  const f = gf;
  const n = (v) => parseNum(v);
  const g = {
    id: f.id || uid(), kind: f.kind, category: f.category, deadline: f.deadline || null,
    createdAt: f.createdAt || Date.now(), completedAt: f.completedAt || null,
  };
  if (f.kind === 'weight') {
    g.target = n(f.target); g.start = n(f.start) ?? (L.latestWeight() || {}).lb;
    if (g.target == null) return 'Add your goal weight';
    if (g.start == null) return 'Add your starting weight';
    g.title = f.title.trim() || `Reach ${num(g.target, 1)} lb`;
  } else if (f.kind === 'lift') {
    const ex = L.exById(f.exerciseId);
    if (!ex) return 'Pick an exercise';
    const best = L.bestFor(ex.id);
    g.exerciseId = ex.id; g.target = n(f.target); g.start = n(f.start) ?? (best ? Math.round(best.e1rm) : 0);
    if (g.target == null) return 'Add the weight you’re aiming for';
    g.title = f.title.trim() || `${ex.name} ${num(g.target)} lb`;
  } else if (f.kind === 'weekly') {
    g.metric = f.metric; g.perWeek = Math.max(1, Math.round(n(f.perWeek) || 1));
    g.title = f.title.trim() || L.WEEKLY_METRICS[g.metric].title(g.perWeek);
  } else if (f.kind === 'checklist') {
    const old = f.steps || [];
    g.steps = f.stepsText.split('\n').map((t) => t.trim()).filter(Boolean)
      .map((text) => ({ text, done: !!(old.find((s) => s.text === text) || {}).done }));
    if (!g.steps.length) return 'Add at least one step';
    g.title = f.title.trim();
    if (!g.title) return 'Give the goal a name';
  } else {
    g.target = n(f.target); g.start = 0; g.current = n(f.current) || 0; g.unit = f.unit.trim();
    if (g.target == null) return 'Add the number you’re aiming for';
    g.title = f.title.trim();
    if (!g.title) return 'Give the goal a name';
  }
  if (!g.category) {
    g.category = ['weight', 'lift'].includes(g.kind) || (g.kind === 'weekly' && ['workouts', 'protein', 'calories'].includes(g.metric)) ? 'fitness' : 'life';
  }
  return g;
}

/* ---------- Actions ---------- */

on({
  'goal-filter': (el) => { ui.goalFilter = el.dataset.v; refresh(); },
  'goal-new': (el) => openGoalForm(null, el.dataset.kind),
  'goal-open': (el) => { openId = el.dataset.id; openSheet(goalSheet, { label: 'Goal' }); },
  'goal-edit': () => { const g = state.goals.find((x) => x.id === openId); if (g) openGoalForm(g); },
  'goal-delete': () => {
    const id = openId;
    confirmSheet({ title: 'Delete this goal?', yes: 'Delete', danger: true }, () => {
      state.goals = state.goals.filter((g) => g.id !== id);
      commit();
      toast('Goal deleted');
    });
  },
  'goal-complete': () => {
    const g = state.goals.find((x) => x.id === openId);
    if (!g) return;
    g.completedAt = Date.now();
    closeSheet(); commit();
    toast(`Finished: ${g.title}. Great work.`, 3600);
  },
  'goal-reopen': () => {
    const g = state.goals.find((x) => x.id === openId);
    if (g) { g.completedAt = null; commit(); refreshSheet(); }
  },
  'goal-step': (el) => {
    const g = state.goals.find((x) => x.id === openId);
    const s = g && g.steps[Number(el.dataset.i)];
    if (!s) return;
    s.done = !s.done;
    commit(); refreshSheet();
  },
  'goal-add-step': (f) => {
    const g = state.goals.find((x) => x.id === openId);
    const t = f.step.value.trim();
    if (!g || !t) return;
    g.steps.push({ text: t, done: false });
    commit(); refreshSheet();
  },
  'goal-num': (el) => {
    const g = state.goals.find((x) => x.id === openId);
    if (!g) return;
    g.current = Math.max(0, (Number(g.current) || 0) + Number(el.dataset.d));
    commit(); refreshSheet();
  },
  gf: (el) => { gf[el.dataset.k] = el.value; },
  'gf-ex': (el) => {
    gf.exerciseId = el.value;
    const b = L.bestFor(el.value);
    gf.start = b ? String(Math.round(b.e1rm)) : '';
    refreshSheet();
  },
  'gf-kind': (el) => {
    gf.kind = el.dataset.v;
    gf.category = '';
    if (gf.kind === 'weight' && !gf.start) { const lw = L.latestWeight(); if (lw) gf.start = String(lw.lb); }
    if (gf.kind === 'lift') { gf.start = ''; gf.exerciseId = null; }
    refreshSheet();
  },
  'gf-chip': (el) => { gf[el.dataset.k] = el.dataset.v; refreshSheet(); },
  'gf-save': () => {
    const g = buildGoal();
    if (typeof g === 'string') { toast(g); return; }
    const i = state.goals.findIndex((x) => x.id === g.id);
    if (i >= 0) state.goals[i] = { ...state.goals[i], ...g };
    else state.goals.push(g);
    closeSheet(); commit();
    toast(i >= 0 ? 'Goal updated' : 'Goal added');
  },
});

