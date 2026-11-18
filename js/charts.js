// charts.js — a small line chart drawn as SVG (no libraries needed).

import { parseKey, fmtShort, num } from './util.js';

/**
 * series: [{ k: 'YYYY-MM-DD', y: number }] oldest first.
 * trend:  optional second line (e.g. 7-day average) in the same shape.
 */
export function lineChart({ series, trend = null, unit = '', color = 'var(--accent)', trendColor = 'var(--blue)', height = 190, label = 'Chart' }) {
  if (!series || series.length < 2) {
    return `<p class="empty">Log at least two entries to see the chart.</p>`;
  }
  const W = 326, H = height, L = 40, R = 10, T = 12, B = 26;
  const xs = series.map((p) => parseKey(p.k).getTime());
  const all = series.map((p) => p.y).concat(trend ? trend.map((p) => p.y) : []);
  let lo = Math.min(...all), hi = Math.max(...all);
  if (hi - lo < 2) { lo -= 1; hi += 1; }
  const padY = (hi - lo) * 0.12;
  lo -= padY; hi += padY;
  const x0 = xs[0], x1 = xs[xs.length - 1] === x0 ? x0 + 1 : xs[xs.length - 1];
  const X = (t) => L + ((t - x0) / (x1 - x0)) * (W - L - R);
  const Y = (v) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B);
  const path = (pts) => pts.map((p, i) => `${i ? 'L' : 'M'}${X(parseKey(p.k).getTime()).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ');

  // Four evenly spaced grid lines with labels
  const ticks = [0, 1, 2, 3].map((i) => lo + ((hi - lo) * i) / 3);
  const decimals = hi - lo < 10 ? 1 : 0;
  const grid = ticks.map((v) => `<line x1="${L}" x2="${W - R}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" style="stroke:var(--line)" stroke-width="1"/>
    <text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" text-anchor="end" class="chart-label">${num(v, decimals)}</text>`).join('');

  const last = series[series.length - 1];
  const lx = X(parseKey(last.k).getTime()), ly = Y(last.y);
  const area = `${path(series)} L${lx.toFixed(1)},${H - B} L${X(x0).toFixed(1)},${H - B} Z`;
  const dots = series.length <= 40
    ? series.map((p) => `<circle cx="${X(parseKey(p.k).getTime()).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="2.4" style="fill:${color}"/>`).join('')
    : '';

  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${label}: from ${num(series[0].y, 1)} to ${num(last.y, 1)} ${unit}">
    ${grid}
    <path d="${area}" style="fill:${color};opacity:.12"/>
    <path d="${path(series)}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round" ${trend ? 'opacity=".55"' : ''}/>
    ${dots}
    ${trend && trend.length > 1 ? `<path d="${path(trend)}" fill="none" style="stroke:${trendColor}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round"/>` : ''}
    <circle cx="${lx.toFixed(1)}" cy="${ly.toFixed(1)}" r="5" style="fill:${color};stroke:var(--surface)" stroke-width="2.5"/>
    <text x="${L}" y="${H - 6}" class="chart-label">${fmtShort(series[0].k)}</text>
    <text x="${W - R}" y="${H - 6}" text-anchor="end" class="chart-label">${fmtShort(last.k)}</text>
  </svg>`;
}
