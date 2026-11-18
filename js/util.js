// util.js — small helpers for dates, numbers and safe HTML.
// Dates are stored as "YYYY-MM-DD" strings ("day keys") in the phone's local time.

export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

/** Escape text before putting it inside HTML. Use for anything the user typed. */
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => (
  { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
));

export const pad = (n) => String(n).padStart(2, '0');
export const keyOf = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseKey = (k) => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
export const addDays = (k, n) => { const d = parseKey(k); d.setDate(d.getDate() + n); return keyOf(d); };
/** Whole days from a to b (b − a). */
export const diffDays = (a, b) => Math.round((parseKey(b) - parseKey(a)) / 86400000);
/** 0 = Sunday … 6 = Saturday */
export const weekday = (k) => parseKey(k).getDay();
/** Weeks start on Sunday. */
export const startOfWeek = (k) => addDays(k, -weekday(k));

/** Today's key, where the day only rolls over at `dayStartHour` (e.g. 4 AM for late shifts). */
export function todayKey(dayStartHour = 0) {
  const d = new Date();
  d.setHours(d.getHours() - dayStartHour);
  return keyOf(d);
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAYS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

export const dayShort = (k) => DAYS[weekday(k)];
/** "Tue, Nov 17" */
export const fmtDay = (k) => { const d = parseKey(k); return `${DAYS[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
/** "Tuesday, Nov 17" */
export const fmtLong = (k) => { const d = parseKey(k); return `${DAYS_LONG[d.getDay()]}, ${MONTHS[d.getMonth()]} ${d.getDate()}`; };
/** "Nov 17" */
export const fmtShort = (k) => { const d = parseKey(k); return `${MONTHS[d.getMonth()]} ${d.getDate()}`; };
/** "November 2026" from "2026-11" */
export const fmtMonth = (ym) => { const [y, m] = ym.split('-').map(Number); return `${MONTHS_LONG[m - 1]} ${y}`; };

/** "17:00" → "5:00 PM" */
export function fmtTime(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  const ap = h >= 12 ? 'PM' : 'AM';
  return `${((h + 11) % 12) + 1}:${pad(m)} ${ap}`;
}

/** Milliseconds → "1:24" or "1:02:03" */
export function fmtClock(ms) {
  const t = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/** Format a number with commas and up to `d` decimals. */
export const num = (n, d = 0) => (Number(n) || 0).toLocaleString('en-US', { maximumFractionDigits: d });
export const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));
export const plural = (n, word, many = word + 's') => `${n} ${n === 1 ? word : many}`;

/** Read a number from an input value; returns null when blank or invalid. */
export function parseNum(v) {
  if (v === '' || v == null) return null;
  const n = Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Estimated one-rep max (Epley formula). */
export function e1rm(weight, reps) {
  const w = Number(weight) || 0, r = Number(reps) || 0;
  if (w <= 0 || r <= 0) return 0;
  return r === 1 ? w : w * (1 + r / 30);
}
