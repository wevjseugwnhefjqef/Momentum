// main.js — starts the app: draws the current tab, the bottom tabs, live timers and in-app reminders.

import { state, ui, subscribe, save, refresh } from './store.js';
import * as L from './logic.js';
import { esc, fmtClock, fmtTime, addDays } from './util.js';
import { initEvents, on, toast, beep, unlockAudio, sheetIsOpen } from './ui.js';
import { I } from './icons.js';
import { renderToday } from './views/today.js';
import { renderTrain } from './views/train.js';
import { renderFood } from './views/food.js';
import { renderGoals } from './views/goals.js';
import { renderProgress } from './views/progress.js';
import { openWelcome } from './views/settings.js';

const TABS = [
  ['today', 'Today', I.today, renderToday],
  ['train', 'Train', I.dumbbell, renderTrain],
  ['food', 'Food', I.food, renderFood],
  ['goals', 'Goals', I.target, renderGoals],
  ['progress', 'Progress', I.chart, renderProgress],
];

const app = document.getElementById('app');
const scrollMemory = {};
let lastView = null;
let lastDay = L.today();

function render() {
  const screen = document.getElementById('screen');
  if (screen && lastView) scrollMemory[lastView] = screen.scrollTop;
  const view = ui.tab + ':' + (ui.sub || '');
  const tab = TABS.find((t) => t[0] === ui.tab) || TABS[0];
  let html;
  try {
    html = tab[3]();
  } catch (err) {
    console.error(err);
    html = `<div class="card stack"><h1 class="h2">Something went wrong on this screen</h1>
      <p class="small">Your data is safe. Try another tab, or go to Settings and back up your data.</p>
      <p class="small mono">${esc(err && err.message)}</p></div>`;
  }
  app.innerHTML = `<main class="screen" id="screen">${html}</main>${miniBar()}${nav()}`;
  const s = document.getElementById('screen');
  s.scrollTop = view === lastView ? (scrollMemory[view] || 0) : (scrollMemory[view] && ui.sub !== 'session' ? scrollMemory[view] : 0);
  lastView = view;
  tick();
}

function nav() {
  return `<nav class="tabs" aria-label="Main">${TABS.map(([id, label, icon]) => `
    <button class="tab ${ui.tab === id ? 'on' : ''}" data-act="tab" data-tab="${id}" ${ui.tab === id ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></button>`).join('')}</nav>`;
}

/** Small bar above the tabs while a workout is running and you're on another screen. */
function miniBar() {
  const aw = state.activeWorkout;
  if (!aw || (ui.tab === 'train' && ui.sub === 'session')) return '';
  const resting = aw.restEndsAt && aw.restEndsAt > Date.now();
  return `<button class="mini-bar" data-act="resume-workout">
    <span class="pulse" aria-hidden="true"></span>
    <span class="grow left">${esc(aw.name || L.autoName(aw.entries))}${aw.date === L.today() && !aw.editingId ? ` · <span data-tick="elapsed">${fmtClock(Date.now() - aw.startedAt)}</span>` : ''}</span>
    ${resting ? `<span class="mini-rest">Rest <span data-tick="rest">${fmtClock(aw.restEndsAt - Date.now())}</span></span>` : ''}
    <span class="mini-go">Resume</span></button>`;
}

on({
  tab: (el) => {
    const id = el.dataset.tab;
    if (ui.tab === id) {
      // Tapping the open tab goes back to its main page
      if (ui.sub && ui.sub !== 'session') { ui.sub = null; refresh(); }
      else document.getElementById('screen').scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    ui.tab = id;
    ui.sub = id === 'train' && state.activeWorkout ? 'session' : null;
    if (id === 'today') ui.selDate = null;
    if (id === 'food') ui.foodDate = null;
    refresh();
  },
});

/* ---------- Live timers (once a second) ---------- */

function tick() {
  const aw = state.activeWorkout;
  const now = Date.now();
  if (aw) {
    document.querySelectorAll('[data-tick="elapsed"]').forEach((el) => { el.textContent = fmtClock(now - aw.startedAt); });
    const left = aw.restEndsAt ? aw.restEndsAt - now : 0;
    document.querySelectorAll('[data-tick="rest"]').forEach((el) => { el.textContent = fmtClock(left); });
    const ringEl = document.querySelector('[data-tick="rest-ring"] circle:last-of-type');
    if (ringEl && aw.restEndsAt) {
      const r = Number(ringEl.getAttribute('r'));
      const c = 2 * Math.PI * r;
      const pct = Math.max(0, left / ((aw.restTotal || 90) * 1000));
      ringEl.setAttribute('stroke-dasharray', `${(c * pct).toFixed(1)} ${c.toFixed(1)}`);
    }
    if (aw.restEndsAt && left <= 0 && !aw.restAlerted) {
      aw.restAlerted = true;
      save();
      beep();
      toast('Rest is over. Time for your next set.');
      if (!sheetIsOpen() && !isTyping()) refresh();
    }
  }
}

const isTyping = () => {
  const a = document.activeElement;
  return a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA' || a.tagName === 'SELECT');
};

/* ---------- In-app reminders ---------- */

const alerted = new Set((() => { try { return JSON.parse(sessionStorage.getItem('momentum.alerted') || '[]'); } catch (e) { return []; } })());
const snoozed = {};
let alertQueue = [];

function remember() { try { sessionStorage.setItem('momentum.alerted', JSON.stringify([...alerted])); } catch (e) { /* ignore */ } }

function checkReminders() {
  const now = Date.now();
  const t = L.today();
  // Today's tasks, plus tomorrow's tasks that remind the day before
  const days = [t, addDays(t, 1)];
  for (const k of days) {
    for (const task of L.tasksOn(k)) {
      if (L.isDone(task, k)) continue;
      const at = L.remindAt(task, k);
      if (at == null) continue;
      const key = `${task.id}|${k}`;
      const due = Math.max(at, snoozed[key] || 0);
      if (now < due || now - due > 12 * 3600e3 || alerted.has(key)) continue;
      alerted.add(key);
      remember();
      alertQueue.push({ id: task.id, k, key });
    }
  }
  showNextAlert();
}

function showNextAlert() {
  if (document.querySelector('.alert') || !alertQueue.length) return;
  const a = alertQueue.shift();
  const task = state.tasks.find((x) => x.id === a.id);
  if (!task) { showNextAlert(); return; }
  const el = document.createElement('div');
  el.className = 'alert';
  el.setAttribute('role', 'alert');
  el.dataset.id = a.id; el.dataset.k = a.k; el.dataset.key = a.key;
  el.innerHTML = `<div class="row gap12"><span class="alert-icon">${I.bell}</span>
    <span class="col grow"><span class="t-title">${esc(task.title)}</span><span class="t-meta">${task.time ? fmtTime(task.time) : 'Today'}${a.k !== L.today() ? ' tomorrow' : ''}</span></span>
    <button class="icon-btn sm ghost" data-act="alert-close" aria-label="Dismiss">${I.x}</button></div>
    <div class="grid2"><button class="pill tall solid" data-act="alert-done">Done</button><button class="pill tall ghost" data-act="alert-snooze">Snooze 10 min</button></div>`;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  beep();
}

function closeAlert(el) {
  el.classList.remove('show');
  setTimeout(() => { el.remove(); showNextAlert(); }, 250);
}

on({
  'alert-close': (btn) => closeAlert(btn.closest('.alert')),
  'alert-done': (btn) => {
    const el = btn.closest('.alert');
    const task = state.tasks.find((x) => x.id === el.dataset.id);
    if (task) { task.done = task.done || {}; task.done[el.dataset.k] = Date.now(); save(); refresh(); }
    closeAlert(el);
  },
  'alert-snooze': (btn) => {
    const el = btn.closest('.alert');
    snoozed[el.dataset.key] = Date.now() + 10 * 60000;
    alerted.delete(el.dataset.key);
    remember();
    closeAlert(el);
    toast('Snoozed for 10 minutes');
  },
});

/* ---------- Start up ---------- */

subscribe((info) => {
  if (info && info.storageError) { toast('Your phone is out of space for app data. Back up and clear old data in Settings.', 6000); return; }
  render();
});

initEvents();
['touchstart', 'mousedown', 'keydown'].forEach((ev) => document.addEventListener(ev, unlockAudio, { once: true, passive: true }));

render();
if (!state.settings.onboarded) openWelcome();

setInterval(tick, 1000);
setInterval(checkReminders, 20000);
setTimeout(checkReminders, 1500);

// When you come back to the app: catch up reminders, and redraw if the day changed
document.addEventListener('visibilitychange', () => {
  if (document.hidden) return;
  checkReminders();
  const d = L.today();
  if (d !== lastDay) { lastDay = d; ui.selDate = null; ui.foodDate = null; if (!sheetIsOpen()) refresh(); }
  else if (!sheetIsOpen() && !isTyping()) refresh();
});

// Ask the phone to keep this app's data even when storage runs low
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

// Offline support
if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
