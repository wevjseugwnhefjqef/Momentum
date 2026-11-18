// store.js — every piece of data the app keeps, saved on this phone (localStorage).
// Nothing is sent anywhere. Use Settings › Back up to save a copy.

import { uid } from './util.js';

const KEY = 'momentum.v1';

export const MUSCLES = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Legs', 'Core'];

/** Task lists and their colors. */
export const LISTS = {
  personal: { label: 'Personal', color: 'var(--blue)' },
  fitness: { label: 'Fitness', color: 'var(--accent)' },
  work: { label: 'Work', color: 'var(--amber)' },
  home: { label: 'Home', color: 'var(--green-text)' },
};

// [name, primary muscle, secondary muscles, bodyweight?]
const STARTER_EXERCISES = [
  ['Bench Press', 'Chest', ['Triceps', 'Shoulders']],
  ['Incline Dumbbell Press', 'Chest', ['Shoulders', 'Triceps']],
  ['Dumbbell Bench Press', 'Chest', ['Triceps', 'Shoulders']],
  ['Cable Fly', 'Chest', []],
  ['Push-up', 'Chest', ['Triceps', 'Shoulders'], true],
  ['Dips', 'Triceps', ['Chest', 'Shoulders'], true],
  ['Deadlift', 'Back', ['Legs', 'Core']],
  ['Pull-up', 'Back', ['Biceps'], true],
  ['Lat Pulldown', 'Back', ['Biceps']],
  ['Barbell Row', 'Back', ['Biceps']],
  ['Seated Cable Row', 'Back', ['Biceps']],
  ['Overhead Press', 'Shoulders', ['Triceps']],
  ['Dumbbell Shoulder Press', 'Shoulders', ['Triceps']],
  ['Lateral Raise', 'Shoulders', []],
  ['Face Pull', 'Shoulders', ['Back']],
  ['Barbell Curl', 'Biceps', []],
  ['Dumbbell Curl', 'Biceps', []],
  ['Hammer Curl', 'Biceps', []],
  ['Tricep Pushdown', 'Triceps', []],
  ['Skull Crusher', 'Triceps', []],
  ['Overhead Tricep Extension', 'Triceps', []],
  ['Squat', 'Legs', ['Core']],
  ['Leg Press', 'Legs', []],
  ['Romanian Deadlift', 'Legs', ['Back']],
  ['Leg Curl', 'Legs', []],
  ['Leg Extension', 'Legs', []],
  ['Walking Lunge', 'Legs', []],
  ['Calf Raise', 'Legs', []],
  ['Hanging Leg Raise', 'Core', [], true],
  ['Cable Crunch', 'Core', []],
  ['Ab Wheel', 'Core', [], true],
];

/** A brand-new, empty app. */
export function freshState() {
  return {
    version: 1,
    settings: {
      onboarded: false,
      name: '',
      calorieGoal: 2700,
      proteinGoal: 150,
      goalType: 'bulk', // bulk | cut | maintain — changes how calorie progress is judged
      dayStartHour: 4, // the day rolls over at 4 AM, so late-night meals count for "today"
      restSeconds: 90,
      // Hours a muscle needs after being trained as the main muscle (half that as a helper muscle)
      recovery: { Chest: 48, Back: 72, Shoulders: 48, Biceps: 48, Triceps: 48, Legs: 72, Core: 24 },
      waterTarget: 8,
      sleepTarget: 8,
      supplements: ['Creatine', 'Vitamin D3', 'Fish oil'],
      shifts: { enabled: false, days: [], start: '15:00', end: '23:30' },
    },
    exercises: STARTER_EXERCISES.map(([name, primary, secondary, bodyweight]) => (
      { id: uid(), name, primary, secondary, bodyweight: !!bodyweight }
    )),
    workouts: [], // finished workouts
    activeWorkout: null, // the workout in progress, if any
    tasks: [],
    foods: [], // saved foods for one-tap logging (and barcode matches)
    foodLog: [],
    weights: [],
    habits: {}, // { 'YYYY-MM-DD': { water, sleep, supps: [] } }
    journal: {}, // { 'YYYY-MM-DD': 'text' }
    goals: [],
    grocery: [],
  };
}

/** Fill in anything missing from older saves so new features never crash on old data. */
function upgrade(s) {
  const d = freshState();
  if (!s || typeof s !== 'object') return d;
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.settings = {
    ...d.settings,
    ...s.settings,
    recovery: { ...d.settings.recovery, ...(s.settings && s.settings.recovery) },
    shifts: { ...d.settings.shifts, ...(s.settings && s.settings.shifts) },
  };
  return s;
}

function load() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return upgrade(JSON.parse(raw));
  } catch (e) { /* storage unavailable or corrupt: start fresh */ }
  return freshState();
}

export let state = load();

/** Screen state that doesn't need saving (which tab is open, etc). */
export const ui = {
  tab: 'today',
  sub: null, // a page inside a tab: 'calendar', 'settings', 'session'
  selDate: null,
  calMonth: null,
  foodDate: null,
  foodSeg: 'log',
  progSeg: 'recap',
  recapWeek: null,
  goalFilter: 'all',
  strengthEx: null,
  showAllHistory: false,
};

let saveTimer = null;
let storageWarned = false;

export function saveNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
  } catch (e) {
    if (!storageWarned) {
      storageWarned = true;
      listeners.forEach((fn) => fn({ storageError: true }));
    }
  }
}

/** Save soon (batches fast typing into one write). */
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 200);
}

const listeners = new Set();
export const subscribe = (fn) => listeners.add(fn);

/** Save and redraw the screen. Call after any change the user should see. */
export function commit() {
  save();
  listeners.forEach((fn) => fn({}));
}

/** Redraw without saving (for navigation). */
export function refresh() {
  listeners.forEach((fn) => fn({}));
}

/** Swap in a whole new data set (restore from backup, or erase). */
export function replaceState(next) {
  state = upgrade(next);
  saveNow();
  listeners.forEach((fn) => fn({}));
}

// Make sure nothing is lost when the app is closed or switched away from.
addEventListener('pagehide', saveNow);
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
