// ui.js — shared building blocks: tap handling, bottom sheets, toasts, progress bars and rings.

import { esc } from './util.js';
import { I } from './icons.js';

/* ---------- Tap / input handling ----------
 * Elements say what they do with data attributes:
 *   data-act="name"  → runs on tap
 *   data-in="name"   → runs while typing
 *   data-ch="name"   → runs when a value is committed (pickers, file inputs)
 *   <form data-submit="name"> → runs on Enter / submit
 * Each view registers its handlers with on({ name(el, event) { … } }).
 */
const actions = {};
export function on(map) { Object.assign(actions, map); }

export function initEvents() {
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = actions[el.dataset.act];
    if (fn) { if (el.tagName === 'A') e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('input', (e) => {
    const el = e.target.closest('[data-in]');
    if (el && actions[el.dataset.in]) actions[el.dataset.in](el, e);
  });
  document.addEventListener('change', (e) => {
    const el = e.target.closest('[data-ch]');
    if (el && actions[el.dataset.ch]) actions[el.dataset.ch](el, e);
  });
  document.addEventListener('submit', (e) => {
    const f = e.target.closest('form[data-submit]');
    if (!f) return;
    e.preventDefault();
    if (actions[f.dataset.submit]) actions[f.dataset.submit](f, e);
  });
}

/* ---------- Bottom sheets ---------- */

let sheetEl = null;
let sheetRender = null;
let sheetOnClose = null;

/** Open a sheet. `render` returns its HTML and is re-run by refreshSheet(). */
export function openSheet(render, { onClose, label = 'Dialog' } = {}) {
  closeSheet(true);
  sheetRender = render;
  sheetOnClose = onClose || null;
  const wrap = document.createElement('div');
  wrap.className = 'sheet-wrap';
  wrap.innerHTML = `<div class="sheet-backdrop" data-act="sheet-close"></div>
    <section class="sheet" role="dialog" aria-modal="true" aria-label="${esc(label)}">
      <div class="grabber" aria-hidden="true"></div><div class="sheet-body"></div>
    </section>`;
  document.body.appendChild(wrap);
  sheetEl = wrap;
  refreshSheet();
  requestAnimationFrame(() => requestAnimationFrame(() => wrap.classList.add('open')));
}

export function refreshSheet() {
  if (!sheetEl || !sheetRender) return;
  const sheet = sheetEl.querySelector('.sheet');
  const top = sheet.scrollTop;
  sheetEl.querySelector('.sheet-body').innerHTML = sheetRender();
  sheet.scrollTop = top;
}

export function closeSheet(immediate = false) {
  if (!sheetEl) return;
  const el = sheetEl;
  const cb = sheetOnClose;
  sheetEl = null; sheetRender = null; sheetOnClose = null;
  if (immediate) el.remove();
  else { el.classList.remove('open'); setTimeout(() => el.remove(), 260); }
  if (cb) cb();
}

export const sheetIsOpen = () => !!sheetEl;
export const sheetRoot = () => sheetEl;

on({ 'sheet-close': () => closeSheet() });

/** Sheet title row with a close button. */
export const sheetHead = (title, right = '') => `
  <div class="sheet-head"><h2 class="h2 lg">${esc(title)}</h2>
  ${right || `<button class="icon-btn sm" data-act="sheet-close" aria-label="Close">${I.x}</button>`}</div>`;

/** A yes/no question in a sheet. */
export function confirmSheet({ title, message = '', yes = 'Yes', danger = false }, onYes) {
  on({ 'confirm-yes': () => { closeSheet(); onYes(); } });
  openSheet(() => `${sheetHead(title)}
    ${message ? `<p class="body-text">${esc(message)}</p>` : ''}
    <div class="stack sm">
      <button class="btn ${danger ? 'danger' : ''}" data-act="confirm-yes">${esc(yes)}</button>
      <button class="btn secondary" data-act="sheet-close">Cancel</button>
    </div>`, { label: title });
}

/* ---------- Toasts ---------- */

export function toast(msg, ms = 2800) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  root.innerHTML = '';
  const t = document.createElement('div');
  t.className = 'toast';
  t.setAttribute('role', 'status');
  t.textContent = msg;
  root.appendChild(t);
  requestAnimationFrame(() => t.classList.add('show'));
  setTimeout(() => { t.classList.remove('show'); setTimeout(() => t.remove(), 300); }, ms);
}

/* ---------- Little visual pieces ---------- */

export const bar = (pct, color = 'var(--accent)', cls = '') =>
  `<div class="bar ${cls}"><i style="width:${Math.round(Math.max(0, Math.min(1, pct)) * 100)}%;background:${color}"></i></div>`;

/** Progress ring. pct 0–1. */
export function ring(pct, size = 30, stroke = 4, color = 'var(--accent)', track = 'var(--ring-track)', label = '') {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct));
  return `<svg class="ring" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" ${label ? `role="img" aria-label="${esc(label)}"` : 'aria-hidden="true"'}>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:${track}" stroke-width="${stroke}"/>
    <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" style="stroke:${color}" stroke-width="${stroke}" stroke-linecap="round"
      stroke-dasharray="${(c * p).toFixed(1)} ${c.toFixed(1)}" ${p < 0.005 ? 'stroke-opacity="0"' : ''} transform="rotate(-90 ${size / 2} ${size / 2})"/></svg>`;
}

/** A row of choice chips. options: [[value, label], …] */
export function chips(act, key, options, current, extra = '') {
  return `<div class="chips" role="group">${options.map(([v, label]) => {
    const on = String(v) === String(current);
    return `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-k="${key}" data-v="${esc(v)}" aria-pressed="${on}" ${extra}>${label}</button>`;
  }).join('')}</div>`;
}

/** Save a file to the phone (Files › Downloads on iPhone). */
export function downloadFile(filename, text, mime) {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 15000);
}

/* ---------- Sound for the rest timer and reminders ---------- */

let audio = null;
export function unlockAudio() {
  if (audio) return;
  try {
    audio = new (window.AudioContext || window.webkitAudioContext)();
    const b = audio.createBuffer(1, 1, 22050);
    const s = audio.createBufferSource();
    s.buffer = b; s.connect(audio.destination); s.start(0);
  } catch (e) { audio = null; }
}

export function beep() {
  try {
    if (!audio) return; // only after the first tap (phones block sound and vibration before that)
    if (navigator.vibrate) navigator.vibrate([160, 90, 160]);
    if (audio.state === 'suspended') audio.resume();
    [0, 0.24].forEach((off) => {
      const o = audio.createOscillator();
      const g = audio.createGain();
      const t0 = audio.currentTime + off;
      o.type = 'sine';
      o.frequency.value = 880;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.18);
      o.connect(g).connect(audio.destination);
      o.start(t0); o.stop(t0 + 0.2);
    });
  } catch (e) { /* sound is a nice-to-have */ }
}
