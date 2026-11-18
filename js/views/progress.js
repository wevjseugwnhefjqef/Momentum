// views/progress.js — weekly recap, body weight, personal records and strength charts.

import { state, ui, commit, refresh } from '../store.js';
import * as L from '../logic.js';
import { esc, fmtShort, fmtDay, num, uid, parseNum, addDays, startOfWeek, plural } from '../util.js';
import { on, openSheet, closeSheet, refreshSheet, sheetHead, confirmSheet, toast } from '../ui.js';
import { I } from '../icons.js';
import { lineChart } from '../charts.js';

export function renderProgress() {
  const segs = [['recap', 'Recap'], ['weight', 'Weight'], ['records', 'Records'], ['strength', 'Strength']];
  const body = { recap: recapView, weight: weightView, records: recordsView, strength: strengthView }[ui.progSeg] || recapView;
  return `<div class="stack">
    <header class="row between"><h1 class="h1">Progress</h1></header>
    <div class="seg four" role="tablist">${segs.map(([v, l]) => `<button class="seg-btn ${ui.progSeg === v ? 'on' : ''}" role="tab" aria-selected="${ui.progSeg === v}" data-act="prog-seg" data-v="${v}">${l}</button>`).join('')}</div>
    ${body()}
  </div>`;
}

/* ---------- Weekly recap ---------- */

const trendIcon = { up: I.up, down: I.down, same: I.flat, new: I.plus };
const trendWord = { up: 'up', down: 'down', same: 'same', new: 'first time' };

function recapView() {
  const t = L.today();
  const week = ui.recapWeek || startOfWeek(t);
  const r = L.recap(week);
  const isCurrent = week === startOfWeek(t);
  const s = state.settings;
  const elapsed = r.days.length;

  // A few plain-English lines at the top
  const lines = [];
  if (r.workouts.length) {
    const diff = r.workouts.length - r.prevWorkoutCount;
    lines.push(`You trained ${plural(r.workouts.length, 'time')}${r.prevWorkoutCount || diff ? ` (${diff >= 0 ? '+' : ''}${diff} vs last week)` : ''}.`);
  } else lines.push(isCurrent ? 'No workouts logged yet this week.' : 'No workouts that week.');
  const ups = r.lifts.filter((l) => l.trend === 'up');
  const downs = r.lifts.filter((l) => l.trend === 'down');
  if (ups.length) lines.push(`${ups.map((l) => l.ex.name).slice(0, 3).join(', ')} went up.`);
  if (downs.length) lines.push(`${downs.map((l) => l.ex.name).slice(0, 2).join(' and ')} dipped a bit. That's normal week to week.`);
  if (r.foodDays) lines.push(`Protein goal hit ${r.proteinDays} of ${elapsed} days.`);
  if (r.weight != null && r.prevWeight != null) {
    const d = r.weight - r.prevWeight;
    lines.push(Math.abs(d) < 0.3 ? 'Weight held steady.' : `Weight is ${d > 0 ? 'up' : 'down'} ${num(Math.abs(d), 1)} lb on average.`);
  }
  if (r.skipped.length && r.skipped.length < 7) lines.push(`Not trained: ${r.skipped.join(', ')}.`);

  const calLabel = s.goalType === 'bulk' ? 'Calorie goal reached' : s.goalType === 'cut' ? 'Stayed under calories' : 'Calories on target';

  return `
    <div class="row between date-nav">
      <button class="icon-btn sm" data-act="recap-week" data-d="-7" aria-label="Previous week">${I.chevL}</button>
      <span class="h3">${isCurrent ? 'This week' : `${fmtShort(week)} – ${fmtShort(r.end)}`}</span>
      <button class="icon-btn sm" data-act="recap-week" data-d="7" aria-label="Next week" ${isCurrent ? 'disabled' : ''}>${I.chevR}</button>
    </div>
    <section class="card tint stack sm" aria-label="Summary">
      <span class="eyebrow">${isCurrent ? `So far · ${plural(elapsed, 'day')} in` : 'Week summary'}</span>
      ${lines.map((l) => `<p class="body-text">${esc(l)}</p>`).join('')}
    </section>

    <div class="grid2">
      ${statTile(r.workouts.length, 'workouts')}
      ${statTile(r.tasksTotal ? `${r.tasksDone}/${r.tasksTotal}` : '0', 'tasks done')}
      ${statTile(`${r.calDays}/${elapsed}`, calLabel.toLowerCase())}
      ${statTile(`${r.habitDays}/${elapsed}`, 'all-habit days')}
    </div>

    <section class="card" aria-label="Lifts">
      <h2 class="h2 card-head">Lifts vs last week</h2>
      ${r.lifts.length ? `<div class="list">${r.lifts.map((l) => `
        <div class="agenda-row"><span class="trend ${l.trend}" aria-hidden="true">${trendIcon[l.trend]}</span>
          <span class="col grow"><span class="t-title">${esc(l.ex.name)}</span><span class="t-meta">${l.prev ? `${num(l.prev)} → ${num(l.cur)} lb est. max` : `${num(l.cur)} lb est. max`}</span></span>
          <span class="small strong trend-word ${l.trend}">${trendWord[l.trend]}</span></div>`).join('')}</div>`
      : `<p class="empty">Log workouts to compare your lifts week to week.</p>`}
    </section>

    <section class="card stack sm" aria-label="Food and body">
      <h2 class="h2">Food and body</h2>
      <div class="kv"><span>Average calories</span><strong>${r.avgCal != null ? `${num(r.avgCal)} kcal` : '—'}</strong></div>
      <div class="kv"><span>Average protein</span><strong>${r.avgP != null ? `${num(r.avgP)} g` : '—'}</strong></div>
      <div class="kv"><span>Protein goal days</span><strong>${r.proteinDays} of ${elapsed}</strong></div>
      <div class="kv"><span>Average weight</span><strong>${r.weight != null ? `${num(r.weight, 1)} lb${r.prevWeight != null ? ` (${r.weight - r.prevWeight >= 0 ? '+' : ''}${num(r.weight - r.prevWeight, 1)})` : ''}` : '—'}</strong></div>
    </section>

    <section class="card stack sm" aria-label="Muscles">
      <h2 class="h2">Muscle groups ${r.skipped.length ? 'not trained' : ''}</h2>
      ${r.skipped.length ? `<div class="chips">${r.skipped.map((m) => `<span class="chip static st-rec">${m}</span>`).join('')}</div>`
        : `<p class="body-text">You trained every muscle group this week.</p>`}
    </section>`;
}

const statTile = (n, label) => `<div class="card tile"><span class="tile-num">${esc(String(n))}</span><span class="small">${esc(label)}</span></div>`;

/* ---------- Weight ---------- */

function weightView() {
  const list = L.weightsSorted();
  const recent = list.filter((w) => w.date >= addDays(L.today(), -180));
  const trend = recent.map((w) => ({ k: w.date, y: Math.round(L.avgWeight(w.date) * 10) / 10 }));
  const latest = list[list.length - 1];
  const a = L.avgWeight(L.today()), b = L.avgWeight(addDays(L.today(), -7));
  const delta = a != null && b != null ? a - b : null;
  return `
    <section class="card stack" aria-label="Body weight">
      <div class="row between">
        <span class="col"><span class="small strong">Latest</span><span class="big-num">${latest ? `${num(latest.lb, 1)}<small> lb</small>` : '—'}</span>
          <span class="small">${delta != null ? `${delta >= 0 ? '+' : ''}${num(delta, 1)} lb vs last week (7-day average)` : latest ? `Logged ${fmtShort(latest.date)}` : 'Weigh in at the same time each day for the best trend.'}</span></span>
        <button class="pill solid tall" data-act="weight-new">${I.plus}Log</button>
      </div>
      ${lineChart({ series: recent.map((w) => ({ k: w.date, y: w.lb })), trend, unit: 'lb', label: 'Body weight' })}
      ${recent.length > 1 ? `<div class="legend"><span><i style="background:var(--accent)"></i>Weigh-ins</span><span><i style="background:var(--blue)"></i>7-day average</span></div>` : ''}
    </section>
    ${list.length ? `<section class="card" aria-label="Weigh-ins"><h2 class="h2 card-head">Weigh-ins</h2>
      <div class="list">${[...list].reverse().slice(0, 30).map((w) => `
        <button class="agenda-row as-btn" data-act="weight-edit" data-id="${w.id}"><span class="t-title grow left">${esc(fmtDay(w.date))}</span><span class="num-sm">${num(w.lb, 1)} lb</span></button>`).join('')}</div></section>` : ''}`;
}

let wf = null;
function weightSheet() {
  return `${sheetHead(wf.id ? 'Edit weigh-in' : 'Log weight')}
  <div class="stack">
    <div class="grid2">
      <div class="field"><label class="label" for="wf-lb">Weight (lb)</label><input id="wf-lb" class="input" inputmode="decimal" data-in="wf" data-k="lb" value="${esc(wf.lb)}" placeholder="0.0" autocomplete="off"></div>
      <div class="field"><label class="label" for="wf-date">Date</label><input id="wf-date" type="date" class="input" data-in="wf" data-k="date" value="${esc(wf.date)}"></div>
    </div>
    <button class="btn" data-act="wf-save">Save</button>
    ${wf.id ? `<button class="btn danger" data-act="wf-delete">Delete</button>` : ''}
  </div>`;
}

/* ---------- Records ---------- */

function recordsView() {
  const recs = L.personalRecords();
  if (!recs.length) return `<p class="empty card">Your best lifts show up here once you log workouts.</p>`;
  const recentCut = addDays(L.today(), -14);
  return `<section class="card" aria-label="Personal records">
    <div class="row between card-head"><h2 class="h2">Personal records</h2><span class="sub">Best estimated max</span></div>
    <div class="list">${recs.map(({ ex, best, heavy }) => `
      <button class="agenda-row as-btn" data-act="strength-open" data-id="${ex.id}">
        <span class="col grow left min0"><span class="t-title ellipsis">${esc(ex.name)}${best.date >= recentCut ? ' <span class="badge pr static">New</span>' : ''}</span>
        <span class="t-meta">${num(best.w, 1)}${ex.bodyweight ? ' added' : ''} lb × ${best.r} on ${esc(fmtShort(best.date))} · heaviest ${num(heavy.load, 1)} lb</span></span>
        <span class="col right"><span class="num-sm">${num(best.e1rm)} lb</span><span class="t-meta">est. max</span></span></button>`).join('')}</div>
  </section>
  <p class="small center">Estimated max uses the Epley formula: weight × (1 + reps ÷ 30).</p>`;
}

/* ---------- Strength ---------- */

function strengthView() {
  // Exercises you've logged, most-trained first
  const counts = {};
  for (const w of state.workouts) for (const e of w.entries) counts[e.exerciseId] = (counts[e.exerciseId] || 0) + 1;
  const used = Object.keys(counts).map(L.exById).filter(Boolean)
    .sort((a, b) => counts[b.id] - counts[a.id] || a.name.localeCompare(b.name));
  if (!used.length) return `<p class="empty card">Log a few workouts to see your strength over time.</p>`;
  if (!ui.strengthEx || !used.find((e) => e.id === ui.strengthEx)) ui.strengthEx = used[0].id;
  const ex = L.exById(ui.strengthEx);
  const series = L.strengthSeries(ex.id);
  const first = series[0], last = series[series.length - 1];
  return `
    <div class="chips scroll-x" role="group" aria-label="Exercise">${used.map((e) => `<button class="chip small ${e.id === ex.id ? 'on' : ''}" data-act="strength-pick" data-id="${e.id}" aria-pressed="${e.id === ex.id}">${esc(e.name)}</button>`).join('')}</div>
    <section class="card stack" aria-label="${esc(ex.name)} progress">
      <div class="row between"><span class="col"><span class="small strong">${esc(ex.name)}</span><span class="big-num">${num(last.y)}<small> lb est. max</small></span></span>
        ${series.length > 1 ? `<span class="tag ${last.y >= first.y ? 'green' : 'amber'}">${last.y >= first.y ? '+' : ''}${num(last.y - first.y)} lb since ${esc(fmtShort(first.k))}</span>` : ''}</div>
      ${lineChart({ series, unit: 'lb', label: `${ex.name} estimated max` })}
    </section>`;
}

/* ---------- Actions ---------- */

on({
  'prog-seg': (el) => { ui.progSeg = el.dataset.v; refresh(); },
  'recap-week': (el) => {
    const cur = startOfWeek(L.today());
    const next = addDays(ui.recapWeek || cur, Number(el.dataset.d));
    ui.recapWeek = next > cur ? cur : next;
    refresh();
  },
  'strength-pick': (el) => { ui.strengthEx = el.dataset.id; refresh(); },
  'strength-open': (el) => { ui.strengthEx = el.dataset.id; ui.progSeg = 'strength'; refresh(); },
  'weight-new': () => {
    const lw = L.latestWeight();
    wf = { id: null, lb: lw ? String(lw.lb) : '', date: L.today() };
    openSheet(weightSheet, { label: 'Log weight' });
  },
  'weight-edit': (el) => {
    const w = state.weights.find((x) => x.id === el.dataset.id);
    if (!w) return;
    wf = { id: w.id, lb: String(w.lb), date: w.date };
    openSheet(weightSheet, { label: 'Edit weigh-in' });
  },
  wf: (el) => { wf[el.dataset.k] = el.value; },
  'wf-save': () => {
    const lb = parseNum(wf.lb);
    if (!lb || lb < 50 || lb > 700) { toast('Enter your weight in pounds'); return; }
    const date = wf.date || L.today();
    if (wf.id) {
      const w = state.weights.find((x) => x.id === wf.id);
      if (w) { w.lb = lb; w.date = date; }
    } else {
      // One weigh-in per day: replace that day's if it exists
      const same = state.weights.find((x) => x.date === date);
      if (same) same.lb = lb; else state.weights.push({ id: uid(), date, lb });
    }
    closeSheet(); commit();
    toast(`Saved ${num(lb, 1)} lb`);
  },
  'wf-delete': () => {
    state.weights = state.weights.filter((x) => x.id !== wf.id);
    closeSheet(); commit();
    toast('Weigh-in deleted');
  },
});
