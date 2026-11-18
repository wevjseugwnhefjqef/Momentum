// ics.js — turns a task into a calendar file (.ics) with an alert, so your iPhone's
// Calendar app can remind you even when Momentum is closed. Repeats carry over too.

import { addDays, pad } from './util.js';
import { downloadFile } from './ui.js';

const escICS = (s) => String(s || '').replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/[,;]/g, (c) => '\\' + c);
const ymd = (k) => k.replace(/-/g, '');

function utcStamp(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

const RRULES = {
  daily: 'FREQ=DAILY',
  every2: 'FREQ=DAILY;INTERVAL=2',
  weekdays: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
  weekly: 'FREQ=WEEKLY',
};

export function taskToICS(t) {
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Momentum//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${t.id}@momentum.app`,
    `DTSTAMP:${utcStamp(new Date())}`,
    `SUMMARY:${escICS(t.title)}`,
  ];
  if (t.time) {
    // "Floating" local time: your phone reads it in its own time zone.
    const [h, m] = t.time.split(':').map(Number);
    const endMin = h * 60 + m + 30;
    const endKey = endMin >= 1440 ? addDays(t.date, 1) : t.date;
    const em = endMin % 1440;
    lines.push(`DTSTART:${ymd(t.date)}T${pad(h)}${pad(m)}00`, `DTEND:${ymd(endKey)}T${pad(Math.floor(em / 60))}${pad(em % 60)}00`);
  } else {
    lines.push(`DTSTART;VALUE=DATE:${ymd(t.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(t.date, 1))}`);
  }
  if (RRULES[t.repeat]) lines.push(`RRULE:${RRULES[t.repeat]}`);
  if (t.notes) lines.push(`DESCRIPTION:${escICS(t.notes)}`);
  if (t.remind !== 'none' && t.remind != null) {
    const mins = Number(t.remind);
    // All-day tasks remind at 9 AM (or 9 AM the day before).
    const trigger = t.time
      ? (mins === 0 ? 'PT0M' : `-PT${mins}M`)
      : (mins >= 1440 ? '-PT15H' : 'PT9H');
    lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${escICS(t.title)}`, `TRIGGER:${trigger}`, 'END:VALARM');
  }
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}

export function saveTaskToCalendar(t) {
  const safe = (t.title || 'task').replace(/[^a-z0-9]+/gi, '-').replace(/^-|-$/g, '').toLowerCase() || 'task';
  downloadFile(`${safe}.ics`, taskToICS(t), 'text/calendar');
}
