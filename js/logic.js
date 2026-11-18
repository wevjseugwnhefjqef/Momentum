// logic.js — the app's "brain": recovery, records, food totals, streaks, goals and weekly recaps.
// Everything here only reads data and returns answers; views decide how to show them.

import { state, MUSCLES } from './store.js';
import { todayKey, addDays, diffDays, weekday, parseKey, e1rm, startOfWeek, clamp, num } from './util.js';

export const today = () => todayKey(state.settings.dayStartHour);
export const exById = (id) => state.exercises.find((e) => e.id === id);

/* ---------- Workouts & strength ---------- */

/** Finished workouts, newest first. */
export function workoutsNewest() {
  return [...state.workouts].sort((a, b) => b.date.localeCompare(a.date) || (b.endedAt || 0) - (a.endedAt || 0));
}

export const workoutsOn = (k) => state.workouts.filter((w) => w.date === k);

/** Most recent weigh-in on or before a date (used for bodyweight exercises). */
export function bodyweightOn(k) {
  let best = null;
  for (const w of state.weights) if (w.date <= k && (!best || w.date > best.date)) best = w;
  if (!best) best = weightsSorted()[0] || null;
  return best ? best.lb : 0;
}

/** The real load of a set. Bodyweight exercises = your weight + any added weight. */
export function setLoad(ex, set, k) {
  const w = Number(set.w) || 0;
  return ex && ex.bodyweight ? bodyweightOn(k) + w : w;
}
export const setE1rm = (ex, set, k) => e1rm(setLoad(ex, set, k), set.r);

/** The sets you did for an exercise last time (skips the workout being edited). */
export function lastTime(exId, skipId) {
  for (const w of workoutsNewest()) {
    if (w.id === skipId) continue;
    const en = w.entries.find((e) => e.exerciseId === exId);
    if (en && en.sets.length) return { date: w.date, sets: en.sets };
  }
  return null;
}

/** Best estimated max for an exercise across all workouts (optionally skipping one). */
export function bestFor(exId, skipId = null) {
  const ex = exById(exId);
  let best = null;
  for (const w of state.workouts) {
    if (w.id === skipId) continue;
    for (const en of w.entries) {
      if (en.exerciseId !== exId) continue;
      for (const s of en.sets) {
        const v = setE1rm(ex, s, w.date);
        if (v > 0 && (!best || v > best.e1rm)) best = { e1rm: v, w: Number(s.w) || 0, r: Number(s.r) || 0, date: w.date, workoutId: w.id };
      }
    }
  }
  return best;
}

/** Best estimated max for one exercise inside a list of workouts. */
function bestIn(workouts, exId) {
  const ex = exById(exId);
  let best = 0;
  for (const w of workouts) for (const en of w.entries) if (en.exerciseId === exId) {
    for (const s of en.sets) best = Math.max(best, setE1rm(ex, s, w.date));
  }
  return best || null;
}

export function volume(w) {
  let v = 0;
  for (const en of w.entries) {
    const ex = exById(en.exerciseId);
    for (const s of en.sets) v += setLoad(ex, s, w.date) * (Number(s.r) || 0);
  }
  return v;
}

/** "Push Day", "Pull Day", "Leg Day"… from the main muscles in a workout. */
export function autoName(entries) {
  const prim = new Set(entries.map((en) => exById(en.exerciseId)).filter(Boolean).map((ex) => ex.primary));
  if (!prim.size) return 'Workout';
  const within = (set) => [...prim].every((m) => set.includes(m));
  if (within(['Chest', 'Shoulders', 'Triceps'])) return 'Push Day';
  if (within(['Back', 'Biceps'])) return 'Pull Day';
  if (within(['Legs', 'Core'])) return 'Leg Day';
  if (within(['Biceps', 'Triceps', 'Shoulders'])) return 'Arm Day';
  if (prim.size >= 4) return 'Full Body';
  return [...prim].slice(0, 2).join(' & ');
}

/** Every exercise with its best lift and heaviest set, most recent record first. */
export function personalRecords() {
  const out = [];
  for (const ex of state.exercises) {
    const best = bestFor(ex.id);
    if (!best) continue;
    let heavy = null;
    for (const w of state.workouts) for (const en of w.entries) if (en.exerciseId === ex.id) {
      for (const s of en.sets) {
        const load = setLoad(ex, s, w.date);
        if (!heavy || load > heavy.load) heavy = { load, w: Number(s.w) || 0, r: Number(s.r) || 0, date: w.date };
      }
    }
    out.push({ ex, best, heavy });
  }
  return out.sort((a, b) => b.best.date.localeCompare(a.best.date));
}

/** Estimated max per workout for one exercise, oldest first (for the strength chart). */
export function strengthSeries(exId) {
  const byDay = {};
  for (const w of state.workouts) {
    const b = bestIn([w], exId);
    if (b) byDay[w.date] = Math.max(byDay[w.date] || 0, b);
  }
  return Object.keys(byDay).sort().map((k) => ({ k, y: Math.round(byDay[k]) }));
}

/* ---------- Recovery ---------- */

/**
 * For each muscle: when it's ready again, based on your finished workouts.
 * Main muscle of an exercise = full recovery time; helper muscles = half.
 */
export function recovery(now = Date.now()) {
  const R = state.settings.recovery;
  const out = {};
  for (const m of MUSCLES) out[m] = { muscle: m, readyAt: 0, hours: R[m] || 48, last: null };
  for (const w of state.workouts) {
    const t = w.endedAt || parseKey(w.date).getTime() + 18 * 3600e3;
    for (const en of w.entries) {
      const ex = exById(en.exerciseId);
      if (!ex || !en.sets.length) continue;
      const hit = (m, factor) => {
        const o = out[m];
        if (!o) return;
        const hrs = (R[m] || 48) * factor;
        const ready = t + hrs * 3600e3;
        if (ready > o.readyAt) { o.readyAt = ready; o.hours = hrs; }
        if (!o.last || t > o.last) o.last = t;
      };
      hit(ex.primary, 1);
      (ex.secondary || []).forEach((m) => hit(m, 0.5));
    }
  }
  for (const m of MUSCLES) {
    const o = out[m];
    const left = o.readyAt - now;
    o.left = Math.max(0, left);
    if (left <= 0) { o.status = 'ready'; o.pct = 1; continue; }
    const win = o.hours * 3600e3;
    o.pct = clamp(1 - left / win, 0, 1);
    o.status = left <= Math.min(12 * 3600e3, win * 0.35) ? 'almost' : 'recovering';
  }
  return out;
}

/** 14 hours → "14h", 50 hours → "2d" */
export function fmtLeft(ms) {
  const h = Math.ceil(ms / 3600e3);
  return h >= 72 ? `${Math.round(h / 24)}d` : `${h}h`;
}

/* ---------- Tasks, shifts & reminders ---------- */

export const REPEATS = { none: 'Never', daily: 'Daily', every2: 'Every 2 days', weekdays: 'Weekdays', weekly: 'Weekly' };
export const REMINDS = { none: 'None', 0: 'At time', 15: '15 min before', 60: '1 hour before', 1440: 'Day before' };

export function occursOn(t, k) {
  if (k < t.date) return false;
  switch (t.repeat) {
    case 'daily': return true;
    case 'every2': return diffDays(t.date, k) % 2 === 0;
    case 'weekdays': { const d = weekday(k); return d >= 1 && d <= 5; }
    case 'weekly': return weekday(k) === weekday(t.date);
    default: return k === t.date;
  }
}

/** Tasks on a day, timed ones first in time order. */
export function tasksOn(k) {
  return state.tasks.filter((t) => occursOn(t, k))
    .sort((a, b) => (a.time || '99:99').localeCompare(b.time || '99:99') || a.title.localeCompare(b.title));
}

export const isDone = (t, k) => !!(t.done && t.done[k]);

/** When to remind about a task on a given day (ms), or null for no reminder. */
export function remindAt(t, k) {
  if (t.remind === 'none' || t.remind == null) return null;
  const d = parseKey(k);
  const [h, m] = (t.time || '09:00').split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return d.getTime() - Number(t.remind) * 60000;
}

/** Has a timed task's time passed without being done? */
export function isOverdue(t, k) {
  if (!t.time || isDone(t, k)) return false;
  const d = parseKey(k);
  const [h, m] = t.time.split(':').map(Number);
  d.setHours(h, m, 0, 0);
  return Date.now() > d.getTime();
}

export function shiftOn(k) {
  const s = state.settings.shifts;
  return s.enabled && s.days.includes(weekday(k)) ? s : null;
}

/* ---------- Food ---------- */

export function foodOn(k) {
  return state.foodLog.filter((e) => e.date === k).sort((a, b) => (a.time || 0) - (b.time || 0));
}

export function foodTotals(k) {
  const t = { cal: 0, p: 0, c: 0, f: 0 };
  for (const e of state.foodLog) {
    if (e.date !== k) continue;
    const q = Number(e.qty) || 1;
    t.cal += (Number(e.cal) || 0) * q;
    t.p += (Number(e.p) || 0) * q;
    t.c += (Number(e.c) || 0) * q;
    t.f += (Number(e.f) || 0) * q;
  }
  return t;
}

/** Did you hit your calorie goal that day? Depends on bulk / cut / maintain. */
export function calorieHit(k) {
  const { cal } = foodTotals(k);
  const g = state.settings.calorieGoal;
  if (!cal || !g) return false;
  if (state.settings.goalType === 'bulk') return cal >= g * 0.95;
  if (state.settings.goalType === 'cut') return cal <= g;
  return Math.abs(cal - g) <= g * 0.1;
}
export const proteinHit = (k) => foodTotals(k).p >= (state.settings.proteinGoal || Infinity);

/* ---------- Habits ---------- */

export const habitDay = (k) => state.habits[k] || { water: 0, sleep: null, supps: [] };
export function ensureHabit(k) {
  if (!state.habits[k]) state.habits[k] = { water: 0, sleep: null, supps: [] };
  return state.habits[k];
}

/** A habit day counts when water hits target, sleep is logged and every supplement is checked. */
export function habitsComplete(k) {
  const h = state.habits[k];
  if (!h) return false;
  const s = state.settings;
  return h.water >= s.waterTarget && h.sleep != null && s.supplements.every((x) => h.supps.includes(x));
}

export function habitStreak() {
  let k = today();
  if (!habitsComplete(k)) k = addDays(k, -1);
  let n = 0;
  while (habitsComplete(k) && n < 3650) { n++; k = addDays(k, -1); }
  return n;
}

/* ---------- Body weight ---------- */

export const weightsSorted = () => [...state.weights].sort((a, b) => a.date.localeCompare(b.date));
export const latestWeight = () => { const s = weightsSorted(); return s.length ? s[s.length - 1] : null; };

/** Average of weigh-ins in the `days` days ending on `end`. */
export function avgWeight(end, days = 7) {
  const start = addDays(end, -(days - 1));
  const xs = state.weights.filter((w) => w.date >= start && w.date <= end).map((w) => w.lb);
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null;
}

/* ---------- Weekly recap ---------- */

export function recap(weekStart) {
  const end = addDays(weekStart, 6);
  const t = today();
  const lastDay = end < t ? end : t;
  const days = [];
  for (let k = weekStart; k <= lastDay; k = addDays(k, 1)) days.push(k);
  const prevStart = addDays(weekStart, -7), prevEnd = addDays(weekStart, -1);
  const wos = state.workouts.filter((w) => w.date >= weekStart && w.date <= end);
  const prevWos = state.workouts.filter((w) => w.date >= prevStart && w.date <= prevEnd);

  const lifts = [];
  const ids = new Set(wos.flatMap((w) => w.entries.map((e) => e.exerciseId)));
  for (const id of ids) {
    const ex = exById(id);
    if (!ex) continue;
    const cur = bestIn(wos, id), prev = bestIn(prevWos, id);
    if (!cur) continue;
    const trend = prev == null ? 'new' : cur > prev * 1.005 ? 'up' : cur < prev * 0.995 ? 'down' : 'same';
    lifts.push({ ex, cur: Math.round(cur), prev: prev && Math.round(prev), trend });
  }
  lifts.sort((a, b) => ['up', 'same', 'down', 'new'].indexOf(a.trend) - ['up', 'same', 'down', 'new'].indexOf(b.trend));

  const trained = new Set();
  for (const w of wos) for (const en of w.entries) { const ex = exById(en.exerciseId); if (ex && en.sets.length) trained.add(ex.primary); }

  const logged = days.filter((k) => foodTotals(k).cal > 0);
  const sum = (f) => logged.reduce((a, k) => a + f(foodTotals(k)), 0);

  const wkWeights = state.weights.filter((w) => w.date >= weekStart && w.date <= end).map((w) => w.lb);
  const pvWeights = state.weights.filter((w) => w.date >= prevStart && w.date <= prevEnd).map((w) => w.lb);
  const avg = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

  let tasksTotal = 0, tasksDone = 0;
  for (const k of days) for (const task of tasksOn(k)) { tasksTotal++; if (isDone(task, k)) tasksDone++; }

  return {
    weekStart, end, days,
    workouts: wos, prevWorkoutCount: prevWos.length,
    lifts,
    skipped: MUSCLES.filter((m) => !trained.has(m)),
    foodDays: logged.length,
    calDays: days.filter(calorieHit).length,
    proteinDays: days.filter(proteinHit).length,
    avgCal: logged.length ? sum((x) => x.cal) / logged.length : null,
    avgP: logged.length ? sum((x) => x.p) / logged.length : null,
    weight: avg(wkWeights), prevWeight: avg(pvWeights),
    tasksTotal, tasksDone,
    habitDays: days.filter(habitsComplete).length,
  };
}

/* ---------- Goals ---------- */

export const WEEKLY_METRICS = {
  workouts: { label: 'Workouts', title: (n) => `Train ${n}× a week` },
  protein: { label: 'Protein goal days', title: (n) => `Hit protein ${n} days a week` },
  calories: { label: 'Calorie goal days', title: (n) => `Hit calories ${n} days a week` },
  habits: { label: 'All-habits days', title: (n) => `All habits ${n} days a week` },
  tasks: { label: 'Tasks finished', title: (n) => `Finish ${n} tasks a week` },
};

function weeklyCount(metric) {
  const start = startOfWeek(today());
  const r = recap(start);
  switch (metric) {
    case 'workouts': return r.workouts.length;
    case 'protein': return r.proteinDays;
    case 'calories': return r.calDays;
    case 'habits': return r.habitDays;
    case 'tasks': return r.tasksDone;
    default: return 0;
  }
}

/** How far along a goal is: { pct 0–1, current, text, sub, done }. */
export function goalProgress(g) {
  const span = (Number(g.target) || 0) - (Number(g.start) || 0);
  const pctOf = (cur) => (span === 0 ? 1 : clamp((cur - g.start) / span, 0, 1));
  switch (g.kind) {
    case 'weight': {
      const lw = latestWeight();
      const cur = lw ? lw.lb : g.start;
      const a = avgWeight(today()), b = avgWeight(addDays(today(), -7));
      const delta = a != null && b != null ? a - b : null;
      let sub = 'Log your weight to track this goal';
      if (lw) sub = delta == null ? `Last weigh-in ${num(cur, 1)} lb` : `${delta >= 0 ? '+' : ''}${num(delta, 1)} lb vs last week`;
      let eta = null;
      if (delta && Math.sign(delta) === Math.sign(span) && pctOf(cur) < 1) {
        eta = addDays(today(), Math.round(Math.abs((g.target - cur) / delta) * 7));
      }
      return { pct: pctOf(cur), current: cur, text: `${num(cur, 1)} / ${num(g.target, 1)} lb`, sub, eta, done: pctOf(cur) >= 1 };
    }
    case 'lift': {
      const b = bestFor(g.exerciseId);
      const cur = b ? Math.round(b.e1rm) : g.start;
      const ex = exById(g.exerciseId);
      const sub = b ? `Est. max from ${num(b.w, 1)}${ex && ex.bodyweight ? ' added' : ''} lb × ${b.r}` : 'Log this lift to track it';
      return { pct: pctOf(cur), current: cur, text: `${num(cur)} / ${num(g.target)} lb`, sub, done: pctOf(cur) >= 1 };
    }
    case 'weekly': {
      const n = weeklyCount(g.metric);
      const per = Number(g.perWeek) || 1;
      return { pct: clamp(n / per, 0, 1), current: n, text: `${n} / ${per}`, sub: `${n} of ${per} this week`, weekly: true, per, done: false };
    }
    case 'checklist': {
      const steps = g.steps || [];
      const d = steps.filter((s) => s.done).length;
      const next = steps.find((s) => !s.done);
      return { pct: steps.length ? d / steps.length : 0, current: d, text: `${d} of ${steps.length} steps`, sub: next ? `Next: ${next.text}` : 'All steps done', done: steps.length > 0 && d === steps.length };
    }
    default: { // number
      const cur = Number(g.current) || 0;
      return { pct: pctOf(cur), current: cur, text: `${num(cur, 1)} / ${num(g.target, 1)}${g.unit ? ' ' + g.unit : ''}`, sub: g.unit ? `Counting ${g.unit}` : 'Update as you go', done: pctOf(cur) >= 1 };
    }
  }
}
