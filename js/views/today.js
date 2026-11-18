// views/today.js — the home screen: your week, tasks, habits, daily note and food at a glance.
// Also holds the month calendar and the add/edit task sheet.

import { state, ui, commit, refresh, save, LISTS } from '../store.js';
import * as L from '../logic.js';
import { esc, fmtDay, fmtLong, fmtTime, fmtMonth, addDays, startOfWeek, weekday, dayShort, uid, num, pad, parseKey, plural } from '../util.js';
import { on, openSheet, closeSheet, refreshSheet, sheetHead, confirmSheet, toast, bar, ring, chips } from '../ui.js';
import { I } from '../icons.js';
import { saveTaskToCalendar } from '../ics.js';
import { renderSettings } from './settings.js';

export function renderToday() {
  if (ui.sub === 'calendar') return renderCalendar();
  if (ui.sub === 'settings') return renderSettings();
  const t = L.today();
  const sel = ui.selDate || t;
  const isToday = sel === t;
  const hr = new Date().getHours();
  const part = hr < 5 ? 'evening' : hr < 12 ? 'morning' : hr < 17 ? 'afternoon' : 'evening';
  const name = state.settings.name.trim();
  return `<div class="stack">
    <header class="row between">
      <div class="col">
        ${isToday
          ? `<span class="sub">${esc(fmtLong(t))}</span><h1 class="h1">Good ${part}${name ? `, ${esc(name)}` : ''}</h1>`
          : `<button class="link sub" data-act="pick-day" data-date="${t}">${I.chevL}Back to today</button><h1 class="h1">${esc(fmtLong(sel))}</h1>`}
      </div>
      <div class="row gap8">
        <button class="icon-btn" data-act="open-calendar" aria-label="Open calendar">${I.calendar}</button>
        <button class="icon-btn" data-act="open-settings" aria-label="Settings">${I.gear}</button>
      </div>
    </header>
    ${installHint()}
    ${isToday && weekday(t) === 0 ? `<button class="card tint row between recap-banner" data-act="goto-recap">
        <span class="col"><span class="eyebrow">It's Sunday</span><span class="h2">Your weekly recap is ready</span></span>
        <span class="round-btn">${I.arrowR}</span></button>` : ''}
    ${weekStrip(sel, t)}
    ${agendaCard(sel)}
    ${habitsCard(sel)}
    ${noteCard(sel)}
    ${foodCard(sel)}
  </div>`;
}

function installHint() {
  const standalone = window.navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (window.self !== window.top) return ''; // shown inside a preview frame, not installable from here
  let dismissed = false;
  try { dismissed = localStorage.getItem('momentum.installHint') === 'no'; } catch (e) { dismissed = true; }
  if (standalone || dismissed) return '';
  return `<div class="card row between">
    <span class="col"><span class="h3">Install Momentum</span><span class="small">In Safari, tap Share, then Add to Home Screen.</span></span>
    <button class="icon-btn sm" data-act="hide-install" aria-label="Dismiss">${I.x}</button></div>`;
}

/* ---------- Week strip ---------- */

function dots(k) {
  const d = [];
  if (L.workoutsOn(k).length) d.push('var(--accent)');
  if (L.tasksOn(k).length) d.push('var(--blue)');
  if (L.shiftOn(k)) d.push('var(--amber)');
  return `<span class="dots">${d.map((c) => `<i style="background:${c}"></i>`).join('')}</span>`;
}

function weekStrip(sel, t) {
  const start = startOfWeek(sel);
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  return `<section class="week" aria-label="This week">${days.map((k) => `
    <button class="day ${k === sel ? 'on' : ''} ${k === t ? 'is-today' : ''}" data-act="pick-day" data-date="${k}" aria-pressed="${k === sel}" aria-label="${esc(fmtLong(k))}">
      <span class="dname">${dayShort(k)}</span><span class="dnum">${parseKey(k).getDate()}</span>${dots(k)}
    </button>`).join('')}</section>`;
}

/* ---------- Tasks / agenda ---------- */

export function agendaCard(sel, { title = 'Tasks' } = {}) {
  const tasks = L.tasksOn(sel);
  const shift = L.shiftOn(sel);
  const wos = L.workoutsOn(sel);
  const done = tasks.filter((x) => L.isDone(x, sel)).length;
  const rows = [];
  if (shift) {
    rows.push(`<div class="agenda-row"><span class="stripe" style="background:var(--amber)"></span>
      <span class="col grow"><span class="t-title">Work shift</span><span class="t-meta">${fmtTime(shift.start)} – ${fmtTime(shift.end)}</span></span></div>`);
  }
  for (const w of wos) {
    rows.push(`<button class="agenda-row as-btn" data-act="view-workout" data-id="${w.id}">
      <span class="check on" aria-hidden="true">${I.check}</span>
      <span class="col grow"><span class="t-title">${esc(w.name)}</span><span class="t-meta">Workout · ${plural(w.entries.length, 'exercise')}</span></span></button>`);
  }
  for (const task of tasks) rows.push(taskRow(task, sel));
  return `<section class="card" aria-label="${esc(title)}">
    <div class="row between card-head">
      <div class="row gap8 baseline"><h2 class="h2">${esc(title)}</h2>${tasks.length ? `<span class="sub">${done} of ${tasks.length} done</span>` : ''}</div>
      <button class="pill" data-act="new-task" data-date="${sel}">${I.plus}Add</button>
    </div>
    ${rows.length ? `<div class="list">${rows.join('')}</div>` : `<p class="empty">Nothing planned. Tap Add to plan your day.</p>`}
  </section>`;
}

function taskRow(t, k) {
  const done = L.isDone(t, k);
  const late = L.isOverdue(t, k);
  const meta = [];
  if (t.time) meta.push(fmtTime(t.time));
  if (t.repeat !== 'none') meta.push(L.REPEATS[t.repeat]);
  if (t.remind !== 'none' && t.remind != null && !done) meta.push(t.remind === 0 ? 'Reminder on' : `Reminds ${L.REMINDS[t.remind].toLowerCase()}`);
  const list = LISTS[t.list] || LISTS.personal;
  return `<div class="agenda-row ${done ? 'done' : ''}">
    <button class="check ${done ? 'on' : ''}" data-act="toggle-task" data-id="${t.id}" data-date="${k}" aria-pressed="${done}" aria-label="${done ? 'Mark not done' : 'Mark done'}: ${esc(t.title)}">${done ? I.check : ''}</button>
    <button class="col grow as-btn left" data-act="edit-task" data-id="${t.id}">
      <span class="t-title">${esc(t.title)}</span>
      ${meta.length ? `<span class="t-meta ${late ? 'late' : ''}">${t.remind !== 'none' && !done ? I.bell : ''}${late ? 'Overdue · ' : ''}${esc(meta.join(' · '))}</span>` : ''}
    </button>
    <span class="list-dot" style="background:${list.color}" title="${list.label}"></span>
  </div>`;
}

/* ---------- Habits ---------- */

function habitsCard(k) {
  const h = L.habitDay(k);
  const s = state.settings;
  const streak = L.habitStreak();
  const suppsDone = s.supplements.filter((x) => h.supps.includes(x)).length;
  return `<section class="card" aria-label="Habits">
    <div class="row between card-head"><h2 class="h2">Habits</h2>
      <span class="sub ${streak ? 'amber' : ''}">${streak ? `${I.flame}${streak}-day streak` : 'Finish all three to start a streak'}</span></div>
    <div class="grid3">
      <div class="habit">
        <button class="habit-main" data-act="water" data-d="1" data-date="${k}" aria-label="Add a cup of water. ${h.water} of ${s.waterTarget} cups">
          ${ring(h.water / s.waterTarget, 32, 4, 'var(--blue)')}<span class="col"><span class="h-name">Water</span><span class="h-val">${h.water} / ${s.waterTarget}</span></span>
        </button>
        <button class="habit-minus" data-act="water" data-d="-1" data-date="${k}" aria-label="Remove a cup of water">${I.minus}</button>
      </div>
      <button class="habit habit-main" data-act="sleep-edit" data-date="${k}" aria-label="Log sleep">
        ${ring(h.sleep != null ? h.sleep / s.sleepTarget : 0, 32, 4, 'var(--accent)')}<span class="col"><span class="h-name">Sleep</span><span class="h-val">${h.sleep != null ? `${num(h.sleep, 1)} h` : 'Log'}</span></span>
      </button>
      <button class="habit habit-main" data-act="supps-edit" data-date="${k}" aria-label="Check off supplements">
        ${ring(s.supplements.length ? suppsDone / s.supplements.length : 0, 32, 4, 'var(--green-text)')}<span class="col"><span class="h-name">Supps</span><span class="h-val">${suppsDone} / ${s.supplements.length}</span></span>
      </button>
    </div>
  </section>`;
}

/* ---------- Daily note ---------- */

function noteCard(k) {
  return `<section class="card" aria-label="Daily note">
    <label class="h2 card-head block" for="note-${k}">Daily note</label>
    <textarea id="note-${k}" class="input" rows="2" data-in="journal" data-date="${k}" placeholder="How did today go?">${esc(state.journal[k] || '')}</textarea>
  </section>`;
}

/* ---------- Food summary ---------- */

function foodCard(k) {
  const f = L.foodTotals(k);
  const s = state.settings;
  return `<button class="card grid2 food-glance" data-act="goto-food" data-date="${k}" aria-label="Open food log">
    <span class="col gap6"><span class="row between"><span class="small strong">Calories</span><span class="num-sm">${num(f.cal)} / ${num(s.calorieGoal)}</span></span>${bar(f.cal / s.calorieGoal)}</span>
    <span class="col gap6"><span class="row between"><span class="small strong">Protein</span><span class="num-sm">${num(f.p)} / ${num(s.proteinGoal)} g</span></span>${bar(f.p / s.proteinGoal, 'var(--blue)')}</span>
  </button>`;
}

/* ---------- Month calendar ---------- */

function renderCalendar() {
  const t = L.today();
  const sel = ui.selDate || t;
  const month = ui.calMonth || sel.slice(0, 7);
  const [y, m] = month.split('-').map(Number);
  const lead = new Date(y, m - 1, 1).getDay();
  const count = new Date(y, m, 0).getDate();
  const cells = [];
  for (let i = 0; i < lead; i++) cells.push('<span class="cal-cell"></span>');
  for (let d = 1; d <= count; d++) {
    const k = `${y}-${pad(m)}-${pad(d)}`;
    cells.push(`<button class="cal-cell ${k === sel ? 'on' : ''} ${k === t ? 'is-today' : ''} ${k < t ? 'past' : ''}" data-act="cal-pick" data-date="${k}" aria-label="${esc(fmtLong(k))}" aria-pressed="${k === sel}">
      <span class="cal-num">${d}</span>${dots(k)}</button>`);
  }
  return `<div class="stack">
    <header class="row between">
      <div class="row gap12">
        <button class="icon-btn" data-act="close-sub" aria-label="Back to Today">${I.chevL}</button>
        <h1 class="h1 md">${fmtMonth(month)}</h1>
      </div>
      <div class="row gap6">
        <button class="icon-btn sm" data-act="cal-month" data-d="-1" aria-label="Previous month">${I.chevL}</button>
        <button class="icon-btn sm" data-act="cal-month" data-d="1" aria-label="Next month">${I.chevR}</button>
      </div>
    </header>
    <div class="legend"><span><i style="background:var(--accent)"></i>Workout</span><span><i style="background:var(--blue)"></i>Task</span><span><i style="background:var(--amber)"></i>Work shift</span></div>
    <section class="card cal" aria-label="${fmtMonth(month)}">
      <div class="cal-grid cal-head">${['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid">${cells.join('')}</div>
    </section>
    ${agendaCard(sel, { title: fmtDay(sel) })}
    ${state.journal[sel] ? `<section class="card"><h2 class="h2 card-head">Note</h2><p class="body-text">${esc(state.journal[sel])}</p></section>` : ''}
  </div>`;
}

/* ---------- Task sheet ---------- */

let form = null;

function openTaskSheet(task, date) {
  form = task
    ? { ...task }
    : { id: null, title: '', date: date || L.today(), time: '', remind: 'none', repeat: 'none', list: 'personal', notes: '' };
  openSheet(taskSheet, { label: task ? 'Edit task' : 'New task' });
}

function taskSheet() {
  const remindOpts = Object.entries(L.REMINDS).map(([v, l]) => [v, l]);
  return `${sheetHead(form.id ? 'Edit task' : 'New task')}
  <div class="stack">
    <div class="field"><label class="label" for="t-title">Task</label>
      <input id="t-title" class="input" data-in="tf" data-k="title" value="${esc(form.title)}" placeholder="What do you need to do?" autocomplete="off" enterkeyhint="done"></div>
    <div class="grid2">
      <div class="field"><label class="label" for="t-date">Date</label>
        <input id="t-date" type="date" class="input" data-in="tf" data-k="date" value="${form.date}"></div>
      <div class="field"><label class="label" for="t-time">Time <span class="muted">(optional)</span></label>
        <input id="t-time" type="time" class="input" data-in="tf" data-k="time" value="${form.time || ''}"></div>
    </div>
    <div class="field"><span class="label">Remind me</span>${chips('tf-chip', 'remind', remindOpts, form.remind)}</div>
    <div class="field"><span class="label">Repeat</span>${chips('tf-chip', 'repeat', Object.entries(L.REPEATS), form.repeat)}</div>
    <div class="field"><span class="label">List</span>${chips('tf-chip', 'list', Object.entries(LISTS).map(([v, o]) => [v, `<i class="dot" style="background:${o.color}"></i>${o.label}`]), form.list)}</div>
    <div class="field"><label class="label" for="t-notes">Notes</label>
      <textarea id="t-notes" class="input" rows="2" data-in="tf" data-k="notes" placeholder="Optional">${esc(form.notes || '')}</textarea></div>
    <button class="btn" data-act="task-save">Save task</button>
    <button class="btn secondary" data-act="task-save" data-ics="1">${I.calendar}Save and add to iPhone Calendar</button>
    ${form.id ? `<button class="btn danger" data-act="task-delete">Delete task</button>` : ''}
    <p class="small">Reminders pop up while Momentum is open. To get an alert even when it's closed, add the task to your iPhone Calendar. You only need to do this once per task, and repeating tasks keep repeating there.</p>
  </div>`;
}

on({
  'hide-install': () => { try { localStorage.setItem('momentum.installHint', 'no'); } catch (e) { /* ignore */ } refresh(); },
  'pick-day': (el) => { ui.selDate = el.dataset.date; refresh(); },
  'open-calendar': () => { ui.sub = 'calendar'; ui.calMonth = (ui.selDate || L.today()).slice(0, 7); refresh(); },
  'open-settings': () => { ui.sub = 'settings'; refresh(); },
  'close-sub': () => { ui.sub = null; refresh(); },
  'cal-month': (el) => {
    const [y, m] = (ui.calMonth || L.today().slice(0, 7)).split('-').map(Number);
    const d = new Date(y, m - 1 + Number(el.dataset.d), 1);
    ui.calMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    refresh();
  },
  'cal-pick': (el) => { ui.selDate = el.dataset.date; refresh(); },
  'goto-recap': () => { ui.tab = 'progress'; ui.sub = null; ui.progSeg = 'recap'; ui.recapWeek = startOfWeek(L.today()); refresh(); },
  'goto-food': (el) => { ui.tab = 'food'; ui.sub = null; ui.foodSeg = 'log'; ui.foodDate = el.dataset.date; refresh(); },

  // Tasks
  'new-task': (el) => openTaskSheet(null, el.dataset.date),
  'edit-task': (el) => { const t = state.tasks.find((x) => x.id === el.dataset.id); if (t) openTaskSheet(t); },
  'toggle-task': (el) => {
    const t = state.tasks.find((x) => x.id === el.dataset.id);
    if (!t) return;
    t.done = t.done || {};
    if (t.done[el.dataset.date]) delete t.done[el.dataset.date];
    else t.done[el.dataset.date] = Date.now();
    commit();
  },
  tf: (el) => { form[el.dataset.k] = el.value; },
  'tf-chip': (el) => {
    const k = el.dataset.k, v = el.dataset.v;
    form[k] = k === 'remind' && v !== 'none' ? Number(v) : v;
    refreshSheet();
  },
  'task-save': (el) => {
    const title = (form.title || '').trim();
    if (!title) { toast('Give the task a name first'); return; }
    if (!form.date) form.date = L.today();
    const data = { ...form, title };
    if (form.id) {
      const i = state.tasks.findIndex((x) => x.id === form.id);
      if (i >= 0) state.tasks[i] = { ...state.tasks[i], ...data };
    } else {
      data.id = uid();
      data.done = {};
      data.createdAt = Date.now();
      state.tasks.push(data);
    }
    closeSheet();
    commit();
    if (el.dataset.ics) {
      saveTaskToCalendar(data);
      toast('Calendar file saved. Open it from Files › Downloads and tap Add to Calendar.', 5000);
    } else {
      toast(form.id ? 'Task updated' : 'Task added');
    }
  },
  'task-delete': () => {
    const id = form.id;
    confirmSheet({ title: 'Delete this task?', message: form.repeat !== 'none' ? 'This removes every repeat of it too.' : '', yes: 'Delete', danger: true }, () => {
      state.tasks = state.tasks.filter((x) => x.id !== id);
      commit();
      toast('Task deleted');
    });
  },

  // Habits
  water: (el) => {
    const h = L.ensureHabit(el.dataset.date);
    h.water = Math.max(0, (h.water || 0) + Number(el.dataset.d));
    commit();
  },
  'sleep-edit': (el) => openSleepSheet(el.dataset.date),
  'supps-edit': (el) => openSuppsSheet(el.dataset.date),
  journal: (el) => {
    const v = el.value;
    if (v.trim()) state.journal[el.dataset.date] = v;
    else delete state.journal[el.dataset.date];
    save();
  },
});

/* ---------- Sleep & supplement sheets ---------- */

let sleepVal = 8, sleepDate = null;
function openSleepSheet(k) {
  sleepDate = k;
  const h = L.habitDay(k);
  sleepVal = h.sleep != null ? h.sleep : state.settings.sleepTarget;
  openSheet(() => `${sheetHead('Sleep')}
    <div class="stepper big">
      <button class="icon-btn" data-act="sleep-step" data-d="-0.5" aria-label="Less sleep">${I.minus}</button>
      <span class="stepper-val">${num(sleepVal, 1)}<small>hours</small></span>
      <button class="icon-btn" data-act="sleep-step" data-d="0.5" aria-label="More sleep">${I.plus}</button>
    </div>
    <div class="stack sm">
      <button class="btn" data-act="sleep-save">Save</button>
      ${h.sleep != null ? `<button class="btn secondary" data-act="sleep-clear">Clear</button>` : ''}
    </div>`, { label: 'Sleep' });
}
on({
  'sleep-step': (el) => { sleepVal = Math.min(16, Math.max(0, sleepVal + Number(el.dataset.d))); refreshSheet(); },
  'sleep-save': () => { L.ensureHabit(sleepDate).sleep = sleepVal; closeSheet(); commit(); },
  'sleep-clear': () => { L.ensureHabit(sleepDate).sleep = null; closeSheet(); commit(); },
});

let suppDate = null;
function openSuppsSheet(k) {
  suppDate = k;
  openSheet(() => {
    const h = L.habitDay(suppDate);
    const list = state.settings.supplements;
    return `${sheetHead('Supplements')}
      ${list.length ? `<div class="list card flat">${list.map((s) => {
        const on = h.supps.includes(s);
        return `<button class="agenda-row as-btn" data-act="supp-toggle" data-name="${esc(s)}" aria-pressed="${on}">
          <span class="check ${on ? 'on' : ''}" aria-hidden="true">${on ? I.check : ''}</span><span class="t-title grow left">${esc(s)}</span></button>`;
      }).join('')}</div>` : '<p class="empty">No supplements yet. Add them in Settings.</p>'}
      <p class="small">Change this list in Settings › Habits.</p>`;
  }, { label: 'Supplements' });
}
on({
  'supp-toggle': (el) => {
    const h = L.ensureHabit(suppDate);
    const n = el.dataset.name;
    h.supps = h.supps.includes(n) ? h.supps.filter((x) => x !== n) : [...h.supps, n];
    commit();
    refreshSheet();
  },
});
