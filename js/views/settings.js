// views/settings.js — goals, recovery times, habits, work shifts, and backup / restore.

import { state, ui, commit, save, refresh, replaceState, freshState, MUSCLES } from '../store.js';
import { esc, parseNum, fmtTime, todayKey } from '../util.js';
import { on, confirmSheet, toast, chips, downloadFile, openSheet, closeSheet, sheetHead } from '../ui.js';
import { I } from '../icons.js';

const DAY_LETTERS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export function renderSettings() {
  const s = state.settings;
  const numField = (id, label, key, unit = '') => `
    <div class="field"><label class="label" for="${id}">${label}</label>
      <div class="input-wrap"><input id="${id}" class="input" inputmode="numeric" data-in="set-num" data-k="${key}" value="${s[key] || ''}">${unit ? `<span class="suffix">${unit}</span>` : ''}</div></div>`;
  return `<div class="stack">
    <header class="row gap12">
      <button class="icon-btn" data-act="close-sub" aria-label="Back to Today">${I.chevL}</button>
      <h1 class="h1 md">Settings</h1>
    </header>

    <section class="card stack" aria-label="You">
      <h2 class="h2">You</h2>
      <div class="field"><label class="label" for="s-name">Name</label>
        <input id="s-name" class="input" data-in="set-text" data-k="name" value="${esc(s.name)}" placeholder="Your first name" autocomplete="given-name"></div>
    </section>

    <section class="card stack" aria-label="Food goals">
      <h2 class="h2">Food goals</h2>
      <div class="field"><span class="label">I'm trying to</span>
        ${chips('set-chip', 'goalType', [['bulk', 'Gain (bulk)'], ['maintain', 'Maintain'], ['cut', 'Lose (cut)']], s.goalType)}
        <span class="small">${s.goalType === 'bulk' ? 'Your calorie goal is a number to reach. Going over is fine.' : s.goalType === 'cut' ? 'Your calorie goal is a limit to stay under.' : 'Staying within 10% of your goal counts as on target.'}</span></div>
      <div class="grid2">${numField('s-cal', 'Calories per day', 'calorieGoal', 'kcal')}${numField('s-pro', 'Protein per day', 'proteinGoal', 'g')}</div>
      <div class="field"><label class="label" for="s-day">A new day starts at</label>
        <select id="s-day" class="input" data-ch="set-select" data-k="dayStartHour">
          ${[0, 1, 2, 3, 4, 5, 6].map((h) => `<option value="${h}" ${s.dayStartHour === h ? 'selected' : ''}>${h === 0 ? 'Midnight' : `${h}:00 AM`}</option>`).join('')}
        </select>
        <span class="small">Handy for late shifts: food you log after midnight still counts for the day before.</span></div>
    </section>

    <section class="card stack" aria-label="Training">
      <h2 class="h2">Training</h2>
      <div class="field"><span class="label">Rest timer</span>
        ${chips('set-chip', 'restSeconds', [[60, '1:00'], [90, '1:30'], [120, '2:00'], [180, '3:00'], [240, '4:00']], s.restSeconds)}</div>
      <div class="field"><span class="label">Recovery time per muscle</span>
        <div class="list">${MUSCLES.map((m) => `
          <div class="agenda-row"><span class="t-title grow">${m}</span>
            <div class="stepper">
              <button class="icon-btn sm" data-act="rec-adj" data-m="${m}" data-d="-12" aria-label="Less recovery time for ${m}">${I.minus}</button>
              <span class="stepper-val sm">${s.recovery[m]}h</span>
              <button class="icon-btn sm" data-act="rec-adj" data-m="${m}" data-d="12" aria-label="More recovery time for ${m}">${I.plus}</button>
            </div></div>`).join('')}</div>
        <span class="small">Muscles that only help in a lift (like triceps on bench) get half this time.</span></div>
    </section>

    <section class="card stack" aria-label="Habits">
      <h2 class="h2">Habits</h2>
      <div class="grid2">${numField('s-water', 'Water goal', 'waterTarget', 'cups')}${numField('s-sleep', 'Sleep goal', 'sleepTarget', 'hours')}</div>
      <div class="field"><span class="label">Supplements</span>
        <div class="chips">${s.supplements.map((x, i) => `<span class="chip static">${esc(x)}<button class="chip-x" data-act="supp-remove" data-i="${i}" aria-label="Remove ${esc(x)}">${I.x}</button></span>`).join('')}</div>
        <form class="row gap8" data-submit="supp-add"><input class="input" name="supp" placeholder="Add a supplement" aria-label="New supplement" autocomplete="off"><button class="pill solid tall">Add</button></form>
      </div>
    </section>

    <section class="card stack" aria-label="Work shifts">
      <div class="row between"><h2 class="h2">Work shifts</h2>
        <button class="switch ${s.shifts.enabled ? 'on' : ''}" data-act="shift-toggle" role="switch" aria-checked="${s.shifts.enabled}" aria-label="Show work shifts on the calendar"><i></i></button></div>
      <span class="small">Shows your shifts on Today and the calendar so you can plan workouts around them.</span>
      ${s.shifts.enabled ? `
        <div class="field"><span class="label">Days I work</span>
          <div class="chips">${DAY_LETTERS.map((d, i) => {
            const onDay = s.shifts.days.includes(i);
            return `<button class="chip round ${onDay ? 'on' : ''}" data-act="shift-day" data-i="${i}" aria-pressed="${onDay}" aria-label="${DAY_NAMES[i]}">${d}</button>`;
          }).join('')}</div></div>
        <div class="grid2">
          <div class="field"><label class="label" for="s-start">Starts</label><input id="s-start" type="time" class="input" data-ch="shift-time" data-k="start" value="${s.shifts.start}"></div>
          <div class="field"><label class="label" for="s-end">Ends</label><input id="s-end" type="time" class="input" data-ch="shift-time" data-k="end" value="${s.shifts.end}"></div>
        </div>
        <span class="small">${s.shifts.days.length ? `${s.shifts.days.map((i) => DAY_NAMES[i].slice(0, 3)).join(', ')} · ${fmtTime(s.shifts.start)} – ${fmtTime(s.shifts.end)}` : 'Pick the days you work.'}</span>` : ''}
    </section>

    <section class="card stack" aria-label="Your data">
      <h2 class="h2">Your data</h2>
      <p class="small">Everything is saved on this phone only. Back up every week or two so you never lose it. Save the file to iCloud Drive and it's safe even if you lose your phone.</p>
      <button class="btn secondary" data-act="export">${I.share}Back up my data</button>
      <label class="btn secondary file-btn">${I.note}Restore from a backup<input type="file" accept="application/json,.json" data-ch="import" hidden></label>
      <button class="btn danger" data-act="erase">Erase everything</button>
    </section>
    <p class="small center">Momentum · v1.0</p>
  </div>`;
}

on({
  'set-text': (el) => { state.settings[el.dataset.k] = el.value; save(); },
  'set-num': (el) => {
    const n = parseNum(el.value);
    if (n != null && n > 0) { state.settings[el.dataset.k] = Math.round(n); save(); }
  },
  'set-select': (el) => { state.settings[el.dataset.k] = Number(el.value); commit(); },
  'set-chip': (el) => {
    const k = el.dataset.k;
    state.settings[k] = k === 'restSeconds' ? Number(el.dataset.v) : el.dataset.v;
    commit();
  },
  'rec-adj': (el) => {
    const m = el.dataset.m;
    state.settings.recovery[m] = Math.min(120, Math.max(12, state.settings.recovery[m] + Number(el.dataset.d)));
    commit();
  },
  'supp-add': (f) => {
    const v = f.supp.value.trim();
    if (!v) return;
    if (!state.settings.supplements.includes(v)) state.settings.supplements.push(v);
    commit();
  },
  'supp-remove': (el) => { state.settings.supplements.splice(Number(el.dataset.i), 1); commit(); },
  'shift-toggle': () => { state.settings.shifts.enabled = !state.settings.shifts.enabled; commit(); },
  'shift-day': (el) => {
    const i = Number(el.dataset.i);
    const d = state.settings.shifts.days;
    state.settings.shifts.days = d.includes(i) ? d.filter((x) => x !== i) : [...d, i].sort();
    commit();
  },
  'shift-time': (el) => { if (el.value) { state.settings.shifts[el.dataset.k] = el.value; commit(); } },

  export: async () => {
    const name = `momentum-backup-${todayKey()}.json`;
    const text = JSON.stringify(state);
    try {
      const file = new File([text], name, { type: 'application/json' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'Momentum backup' });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return;
    }
    downloadFile(name, text, 'application/json');
    toast('Backup saved to Files › Downloads');
  },
  import: (el) => {
    const file = el.files && el.files[0];
    el.value = '';
    if (!file) return;
    file.text().then((txt) => {
      let data;
      try { data = JSON.parse(txt); } catch (e) { toast("That file isn't a Momentum backup"); return; }
      if (!data || !data.settings || !Array.isArray(data.workouts)) { toast("That file isn't a Momentum backup"); return; }
      confirmSheet({ title: 'Restore this backup?', message: 'This replaces everything in the app with the backup.', yes: 'Restore' }, () => {
        replaceState(data);
        toast('Backup restored');
      });
    });
  },
  erase: () => {
    confirmSheet({ title: 'Erase everything?', message: 'Every workout, task, food and goal is deleted from this phone. This can’t be undone, so back up first if you might want it.', yes: 'Erase everything', danger: true }, () => {
      const fresh = freshState();
      fresh.settings.onboarded = true;
      replaceState(fresh);
      ui.sub = null;
      refresh();
      toast('All data erased');
    });
  },
});

/* ---------- First-launch welcome ---------- */

export function openWelcome() {
  const s = state.settings;
  openSheet(() => `${sheetHead('Welcome to Momentum', '<span></span>')}
    <div class="stack">
      <p class="body-text">Your workouts, food, tasks and goals in one place. Set a few things up and you're ready.</p>
      <div class="field"><label class="label" for="w-name">Your name</label>
        <input id="w-name" class="input" data-in="set-text" data-k="name" value="${esc(s.name)}" placeholder="First name" autocomplete="given-name"></div>
      <div class="field"><span class="label">I'm trying to</span>
        ${chips('welcome-goal', 'goalType', [['bulk', 'Gain'], ['maintain', 'Maintain'], ['cut', 'Lose']], s.goalType)}</div>
      <div class="grid2">
        <div class="field"><label class="label" for="w-cal">Calories / day</label><input id="w-cal" class="input" inputmode="numeric" data-in="set-num" data-k="calorieGoal" value="${s.calorieGoal}"></div>
        <div class="field"><label class="label" for="w-pro">Protein / day (g)</label><input id="w-pro" class="input" inputmode="numeric" data-in="set-num" data-k="proteinGoal" value="${s.proteinGoal}"></div>
      </div>
      <button class="btn" data-act="welcome-done">Get started</button>
      <label class="btn secondary file-btn">Restore from a backup<input type="file" accept="application/json,.json" data-ch="import" hidden></label>
    </div>`, { label: 'Welcome' });
}

on({
  'welcome-goal': (el) => {
    state.settings.goalType = el.dataset.v;
    save();
    el.parentElement.querySelectorAll('.chip').forEach((c) => { c.classList.toggle('on', c === el); c.setAttribute('aria-pressed', c === el); });
  },
  'welcome-done': () => { state.settings.onboarded = true; closeSheet(); commit(); },
});
