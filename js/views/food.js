// views/food.js — food log, saved foods, barcode scanning and the grocery list.

import { state, ui, commit, refresh } from '../store.js';
import * as L from '../logic.js';
import { esc, fmtDay, num, uid, parseNum, addDays } from '../util.js';
import { on, openSheet, closeSheet, refreshSheet, sheetHead, confirmSheet, toast, bar, sheetRoot } from '../ui.js';
import { I } from '../icons.js';

export function renderFood() {
  const seg = `<div class="seg" role="tablist">
    <button class="seg-btn ${ui.foodSeg === 'log' ? 'on' : ''}" role="tab" aria-selected="${ui.foodSeg === 'log'}" data-act="food-seg" data-v="log">Log</button>
    <button class="seg-btn ${ui.foodSeg === 'grocery' ? 'on' : ''}" role="tab" aria-selected="${ui.foodSeg === 'grocery'}" data-act="food-seg" data-v="grocery">Groceries${state.grocery.filter((g) => !g.done).length ? ` · ${state.grocery.filter((g) => !g.done).length}` : ''}</button>
  </div>`;
  return `<div class="stack">
    <header class="row between"><h1 class="h1">Food</h1></header>
    ${seg}
    ${ui.foodSeg === 'grocery' ? groceryView() : logView()}
  </div>`;
}

/* ---------- Log ---------- */

function calText(cal) {
  const g = state.settings.calorieGoal, type = state.settings.goalType;
  const diff = Math.round(g - cal);
  if (type === 'cut') return diff >= 0 ? `${num(diff)} left` : `${num(-diff)} over`;
  if (type === 'bulk') return diff > 0 ? `${num(diff)} to go` : `Goal hit${diff < 0 ? ` · +${num(-diff)}` : ''}`;
  return Math.abs(diff) <= g * 0.1 ? 'On target' : diff > 0 ? `${num(diff)} to go` : `${num(-diff)} over`;
}

function logView() {
  const t = L.today();
  const d = ui.foodDate || t;
  const tot = L.foodTotals(d);
  const s = state.settings;
  const over = s.goalType === 'cut' && tot.cal > s.calorieGoal;
  const pLeft = Math.round(s.proteinGoal - tot.p);
  const entries = L.foodOn(d);
  return `
    <div class="row between date-nav">
      <button class="icon-btn sm" data-act="food-day" data-d="-1" aria-label="Previous day">${I.chevL}</button>
      <span class="h3">${d === t ? 'Today' : d === addDays(t, -1) ? 'Yesterday' : esc(fmtDay(d))}</span>
      <button class="icon-btn sm" data-act="food-day" data-d="1" aria-label="Next day" ${d >= t ? 'disabled' : ''}>${I.chevR}</button>
    </div>
    <section class="card stack" aria-label="Totals">
      <div class="row between baseline"><span class="col"><span class="small strong">Calories</span>
        <span class="big-num">${num(tot.cal)}<small> / ${num(s.calorieGoal)}</small></span></span>
        <span class="sub ${over ? 'red' : ''}">${calText(tot.cal)}</span></div>
      ${bar(tot.cal / s.calorieGoal, over ? 'var(--red)' : 'var(--accent)', 'thick')}
      <div class="row between baseline"><span class="small strong">Protein</span>
        <span class="num-sm">${num(tot.p)} / ${num(s.proteinGoal)} g · <span class="${pLeft <= 0 ? 'green' : ''}">${pLeft > 0 ? `${num(pLeft)} g to go` : 'goal hit'}</span></span></div>
      ${bar(tot.p / s.proteinGoal, 'var(--blue)', 'thick')}
      <div class="row gap16 small"><span>Carbs ${num(tot.c)} g</span><span>Fat ${num(tot.f)} g</span></div>
    </section>
    <div class="grid2">
      <button class="btn" data-act="add-food" data-date="${d}">${I.plus}Add food</button>
      <button class="btn secondary" data-act="scan" data-date="${d}">${I.scan}Scan barcode</button>
    </div>
    <section class="card" aria-label="Logged food">
      <div class="row between card-head"><h2 class="h2">Logged</h2><span class="sub">${entries.length ? `${entries.length} item${entries.length > 1 ? 's' : ''}` : ''}</span></div>
      ${entries.length ? `<div class="list">${entries.map((e) => {
        const q = Number(e.qty) || 1;
        return `<button class="agenda-row as-btn" data-act="food-edit" data-id="${e.id}">
          <span class="col grow left min0"><span class="t-title ellipsis">${esc(e.name)}</span>
          <span class="t-meta">${q !== 1 ? `${num(q, 2)} × ` : ''}${esc(e.serving || '1 serving')}</span></span>
          <span class="col right"><span class="num-sm">${num(e.cal * q)} kcal</span><span class="t-meta">${num(e.p * q)} g protein</span></span></button>`;
      }).join('')}</div>` : `<p class="empty">Nothing logged ${d === t ? 'yet today' : 'this day'}.</p>`}
    </section>`;
}

/* ---------- Add food sheet ---------- */

const add = { date: null, tab: 'mine', q: '', pickId: null, qty: 1, form: null, note: '' };

const blankForm = () => ({ name: '', serving: '', cal: '', p: '', c: '', f: '', qty: 1, save: true, barcode: null, editFoodId: null });

export function openAddFood(date, opts = {}) {
  add.date = date || L.today();
  add.tab = opts.tab || 'mine';
  add.q = '';
  add.pickId = opts.pickId || null;
  add.qty = 1;
  add.form = opts.form || blankForm();
  add.note = opts.note || '';
  openSheet(addFoodSheet, { label: 'Add food' });
}

function foodList() {
  const q = add.q.trim().toLowerCase();
  const list = state.foods
    .filter((f) => !q || f.name.toLowerCase().includes(q))
    .sort((a, b) => (b.uses || 0) - (a.uses || 0) || (b.lastUsed || 0) - (a.lastUsed || 0) || a.name.localeCompare(b.name));
  if (!state.foods.length) return `<p class="empty">Foods you log are saved here so you can log them again in one tap.</p>`;
  if (!list.length) return `<p class="empty">No saved food matches. Try the New food tab.</p>`;
  return list.map((f) => `<button class="agenda-row as-btn" data-act="af-pick" data-id="${f.id}">
    <span class="col grow left min0"><span class="t-title ellipsis">${esc(f.name)}</span><span class="t-meta">${esc(f.serving || '1 serving')}${f.barcode ? ' · scanned' : ''}</span></span>
    <span class="col right"><span class="num-sm">${num(f.cal)} kcal</span><span class="t-meta">${num(f.p, 1)} g protein</span></span></button>`).join('');
}

function addFoodSheet() {
  const tabs = `<div class="seg" role="tablist">
    <button class="seg-btn ${add.tab === 'mine' ? 'on' : ''}" data-act="af-tab" data-v="mine" role="tab" aria-selected="${add.tab === 'mine'}">My foods</button>
    <button class="seg-btn ${add.tab === 'new' ? 'on' : ''}" data-act="af-tab" data-v="new" role="tab" aria-selected="${add.tab === 'new'}">New food</button></div>`;

  if (add.pickId) {
    const f = state.foods.find((x) => x.id === add.pickId);
    if (!f) { add.pickId = null; return addFoodSheet(); }
    return `${sheetHead(f.name)}
    <div class="stack">
      ${add.note ? `<p class="note">${esc(add.note)}</p>` : ''}
      <span class="sub">Per ${esc(f.serving || 'serving')}: ${num(f.cal)} kcal · ${num(f.p, 1)} g protein${f.c ? ` · ${num(f.c)} g carbs` : ''}${f.f ? ` · ${num(f.f)} g fat` : ''}</span>
      ${qtyStepper(add.qty)}
      <div class="card flat row between"><span class="small strong">Total</span>
        <span class="num-sm">${num(f.cal * add.qty)} kcal · ${num(f.p * add.qty, 1)} g protein</span></div>
      <button class="btn" data-act="af-log-saved">Log it</button>
      <div class="grid2"><button class="btn secondary" data-act="af-unpick">Back</button><button class="btn secondary" data-act="af-edit-food">Edit food</button></div>
    </div>`;
  }

  if (add.tab === 'new') {
    const f = add.form;
    const fld = (k, label, mode = 'decimal', ph = '') => `<div class="field"><label class="label" for="af-${k}">${label}</label>
      <input id="af-${k}" class="input" inputmode="${mode}" data-in="aff" data-k="${k}" value="${esc(f[k])}" placeholder="${ph}" autocomplete="off"></div>`;
    return `${sheetHead(f.editFoodId ? 'Edit food' : 'Add food')}
    <div class="stack">
      ${f.editFoodId ? '' : tabs}
      ${add.note ? `<p class="note">${esc(add.note)}</p>` : ''}
      <div class="field"><label class="label" for="af-name">Food</label>
        <input id="af-name" class="input" data-in="aff" data-k="name" value="${esc(f.name)}" placeholder="e.g. Chicken burrito bowl" autocomplete="off"></div>
      ${fld('serving', 'Serving size', 'text', 'e.g. 1 bowl, 2 eggs, 100 g')}
      <div class="grid2">${fld('cal', 'Calories', 'numeric', '0')}${fld('p', 'Protein (g)', 'decimal', '0')}</div>
      <div class="grid2">${fld('c', 'Carbs (g)', 'decimal', 'optional')}${fld('f', 'Fat (g)', 'decimal', 'optional')}</div>
      ${f.barcode ? `<span class="small">Barcode ${esc(f.barcode)}</span>` : ''}
      ${f.editFoodId ? `
        <button class="btn" data-act="af-save-food">Save changes</button>
        <button class="btn danger" data-act="af-delete-food">Delete saved food</button>`
      : `${qtyStepper(f.qty)}
        <button class="row between toggle-row" data-act="af-save-toggle" role="switch" aria-checked="${f.save}">
          <span class="col left"><span class="t-title">Save to My foods</span><span class="t-meta">Log it again with one tap next time</span></span>
          <span class="switch ${f.save ? 'on' : ''}"><i></i></span></button>
        <button class="btn" data-act="af-log-new">Log it</button>`}
    </div>`;
  }

  return `${sheetHead('Add food')}
  <div class="stack">
    ${tabs}
    <div class="input-wrap"><span class="prefix">${I.search}</span>
      <input class="input with-prefix" data-in="af-q" value="${esc(add.q)}" placeholder="Search my foods" aria-label="Search my foods" autocomplete="off" enterkeyhint="search"></div>
    <div class="list" id="af-list">${foodList()}</div>
    <button class="btn secondary" data-act="af-scan">${I.scan}Scan a barcode</button>
  </div>`;
}

function qtyStepper(q) {
  return `<div class="row between"><span class="col"><span class="t-title">Servings</span><span class="t-meta">Use halves for smaller portions</span></span>
    <div class="stepper">
      <button class="icon-btn sm" data-act="qty" data-d="-0.5" aria-label="Fewer servings">${I.minus}</button>
      <span class="stepper-val sm">${num(q, 2)}</span>
      <button class="icon-btn sm" data-act="qty" data-d="0.5" aria-label="More servings">${I.plus}</button>
    </div></div>`;
}

function readForm() {
  const f = add.form;
  return {
    name: f.name.trim(),
    serving: String(f.serving || '').trim(),
    cal: parseNum(f.cal) || 0,
    p: parseNum(f.p) || 0,
    c: parseNum(f.c) || 0,
    f: parseNum(f.f) || 0,
  };
}

function logEntry(base, qty, foodId) {
  state.foodLog.push({ id: uid(), date: add.date, time: Date.now(), name: base.name, serving: base.serving, cal: base.cal, p: base.p, c: base.c, f: base.f, qty, foodId: foodId || null });
}

/* ---------- Barcode scanning ---------- */

let scanner = null;
let scanDate = null;
let scanBusy = false;

function loadScript(src) {
  return new Promise((resolve, reject) => {
    if (window.__Html5QrcodeLibrary__) { resolve(); return; }
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

function setScanStatus(text) {
  const root = sheetRoot();
  const el = root && root.querySelector('#scan-status');
  if (el) el.textContent = text;
}

async function stopScanner() {
  const sc = scanner;
  scanner = null;
  if (!sc) return;
  try { await sc.stop(); } catch (e) { /* already stopped */ }
  try { sc.clear(); } catch (e) { /* ignore */ }
}

function openScanner(date) {
  scanDate = date || L.today();
  scanBusy = false;
  openSheet(() => `${sheetHead('Scan barcode')}
    <div class="stack">
      <div id="scan-view" class="scan-view"></div>
      <p id="scan-status" class="small center" role="status">Starting camera…</p>
      <form class="row gap8" data-submit="scan-manual">
        <input class="input" name="code" inputmode="numeric" placeholder="Or type the barcode number" aria-label="Barcode number" autocomplete="off">
        <button class="pill solid tall">Look up</button>
      </form>
      <p class="small">Food info comes from Open Food Facts, a free food database. If a food isn't there, you enter it once and it's saved for your next scan.</p>
    </div>`, { label: 'Scan barcode', onClose: stopScanner });
  startCamera();
}

async function startCamera() {
  try {
    await loadScript('vendor/html5-qrcode.min.js');
    const lib = window.__Html5QrcodeLibrary__;
    if (!lib || !document.getElementById('scan-view')) return;
    const F = lib.Html5QrcodeSupportedFormats;
    scanner = new lib.Html5Qrcode('scan-view', {
      formatsToSupport: [F.EAN_13, F.EAN_8, F.UPC_A, F.UPC_E],
      verbose: false,
      experimentalFeatures: { useBarCodeDetectorIfSupported: true },
    });
    await scanner.start(
      { facingMode: 'environment' },
      { fps: 12, qrbox: (w) => ({ width: Math.round(Math.min(300, w * 0.86)), height: 130 }) },
      (code) => { if (!scanBusy) { scanBusy = true; handleBarcode(code); } },
      () => {},
    );
    setScanStatus('Point the camera at the barcode');
  } catch (e) {
    setScanStatus('The camera isn’t available. Allow camera access for Momentum, or type the barcode below.');
  }
}

async function handleBarcode(raw) {
  const code = String(raw).replace(/\D/g, '');
  if (code.length < 6) { scanBusy = false; toast('That barcode looks too short'); return; }
  await stopScanner();
  const local = state.foods.find((f) => f.barcode === code || (f.barcode && f.barcode.replace(/^0+/, '') === code.replace(/^0+/, '')));
  if (local) { openAddFood(scanDate, { pickId: local.id, note: 'Found in your foods.' }); return; }
  setScanStatus('Looking it up…');
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 9000);
    const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json?fields=product_name,product_name_en,brands,serving_size,serving_quantity,nutriments`, { signal: ctrl.signal });
    clearTimeout(timer);
    const data = await res.json();
    if (data && data.status === 1 && data.product) {
      openAddFood(scanDate, { tab: 'new', form: fromOpenFoodFacts(code, data.product), note: 'Found it. Check the numbers against the label, then log it.' });
    } else {
      openAddFood(scanDate, { tab: 'new', form: { ...blankForm(), barcode: code }, note: 'This one isn’t in the food database yet. Enter it from the label once and it’s saved for next time.' });
    }
  } catch (e) {
    openAddFood(scanDate, { tab: 'new', form: { ...blankForm(), barcode: code }, note: 'Couldn’t reach the food database. Check your connection, or enter it from the label.' });
  }
}

/** Turn an Open Food Facts product into our food form (per serving when possible). */
function fromOpenFoodFacts(code, p) {
  const n = p.nutriments || {};
  const val = (k) => (n[k] == null || n[k] === '' ? null : Number(n[k]));
  const kcal = (suffix) => val(`energy-kcal${suffix}`) ?? (val(`energy${suffix}`) != null ? val(`energy${suffix}`) / 4.184 : null);
  let cal = kcal('_serving'), pr = val('proteins_serving'), c = val('carbohydrates_serving'), f = val('fat_serving');
  let serving = p.serving_size || '';
  const grams = Number(p.serving_quantity);
  if (cal == null && grams > 0 && kcal('_100g') != null) {
    const k = grams / 100;
    cal = kcal('_100g') * k; pr = (val('proteins_100g') || 0) * k; c = (val('carbohydrates_100g') || 0) * k; f = (val('fat_100g') || 0) * k;
    serving = serving || `${grams} g`;
  } else if (cal == null) {
    cal = kcal('_100g'); pr = val('proteins_100g'); c = val('carbohydrates_100g'); f = val('fat_100g');
    serving = '100 g';
  }
  const name = (p.product_name_en || p.product_name || '').trim();
  const brand = (p.brands || '').split(',')[0].trim();
  const r = (x, d = 0) => (x == null || Number.isNaN(x) ? '' : String(Math.round(x * 10 ** d) / 10 ** d));
  return {
    ...blankForm(),
    name: brand && name && !name.toLowerCase().includes(brand.toLowerCase()) ? `${brand} ${name}` : name || brand || 'Scanned food',
    serving, cal: r(cal), p: r(pr, 1), c: r(c), f: r(f, 1), barcode: code,
  };
}

/* ---------- Edit a logged entry ---------- */

let editId = null;
let editQty = 1;
function entrySheet() {
  const e = state.foodLog.find((x) => x.id === editId);
  if (!e) return `${sheetHead('Food')}<p class="empty">This entry was deleted.</p>`;
  return `${sheetHead(e.name)}
  <div class="stack">
    <span class="sub">Per ${esc(e.serving || 'serving')}: ${num(e.cal)} kcal · ${num(e.p, 1)} g protein</span>
    ${qtyStepper(editQty).replace(/data-act="qty"/g, 'data-act="entry-qty"')}
    <div class="card flat row between"><span class="small strong">Total</span><span class="num-sm">${num(e.cal * editQty)} kcal · ${num(e.p * editQty, 1)} g protein</span></div>
    <button class="btn" data-act="entry-save">Save</button>
    <button class="btn secondary" data-act="entry-again">Log again today</button>
    <button class="btn danger" data-act="entry-delete">Delete</button>
  </div>`;
}

/* ---------- Groceries ---------- */

function groceryView() {
  const items = [...state.grocery].sort((a, b) => Number(a.done) - Number(b.done));
  const onList = new Set(state.grocery.map((g) => g.name.toLowerCase()));
  const suggestions = [...state.foods].sort((a, b) => (b.uses || 0) - (a.uses || 0))
    .filter((f) => (f.uses || 0) > 0 && !onList.has(f.name.toLowerCase())).slice(0, 8);
  const doneCount = state.grocery.filter((g) => g.done).length;
  return `
    <section class="card stack" aria-label="Grocery list">
      <form class="row gap8" data-submit="g-add">
        <input class="input" name="item" placeholder="Add an item" aria-label="Grocery item" autocomplete="off" enterkeyhint="done">
        <button class="pill solid tall">Add</button>
      </form>
      ${items.length ? `<div class="list">${items.map((g) => `
        <div class="agenda-row ${g.done ? 'done' : ''}">
          <button class="check ${g.done ? 'on' : ''}" data-act="g-toggle" data-id="${g.id}" aria-pressed="${g.done}" aria-label="${g.done ? 'Uncheck' : 'Check off'} ${esc(g.name)}">${g.done ? I.check : ''}</button>
          <span class="t-title grow">${esc(g.name)}</span>
          <button class="icon-btn sm ghost" data-act="g-del" data-id="${g.id}" aria-label="Remove ${esc(g.name)}">${I.x}</button>
        </div>`).join('')}</div>` : `<p class="empty">Your list is empty.</p>`}
      ${doneCount ? `<button class="link center" data-act="g-clear">Clear ${doneCount} checked</button>` : ''}
    </section>
    ${suggestions.length ? `<section class="card stack" aria-label="Suggestions">
      <div class="col"><h2 class="h2">From foods you eat often</h2><span class="small">Tap to add to your list</span></div>
      <div class="chips">${suggestions.map((f) => `<button class="chip" data-act="g-add-food" data-name="${esc(f.name)}">${I.plus}${esc(f.name)}</button>`).join('')}</div>
    </section>` : ''}`;
}

/* ---------- Actions ---------- */

on({
  'food-seg': (el) => { ui.foodSeg = el.dataset.v; refresh(); },
  'food-day': (el) => {
    const t = L.today();
    const next = addDays(ui.foodDate || t, Number(el.dataset.d));
    ui.foodDate = next > t ? t : next;
    refresh();
  },
  'add-food': (el) => openAddFood(el.dataset.date),
  scan: (el) => openScanner(el.dataset.date),
  'af-scan': () => openScanner(add.date),
  'scan-manual': (f) => { const v = f.code.value.trim(); if (v && !scanBusy) { scanBusy = true; handleBarcode(v); } },
  'af-tab': (el) => { add.tab = el.dataset.v; add.note = ''; refreshSheet(); },
  'af-q': (el) => {
    add.q = el.value;
    const root = sheetRoot();
    const list = root && root.querySelector('#af-list');
    if (list) list.innerHTML = foodList();
  },
  'af-pick': (el) => { add.pickId = el.dataset.id; add.qty = 1; add.note = ''; refreshSheet(); },
  'af-unpick': () => { add.pickId = null; add.note = ''; refreshSheet(); },
  qty: (el) => {
    const d = Number(el.dataset.d);
    if (add.pickId) add.qty = Math.max(0.5, add.qty + d);
    else add.form.qty = Math.max(0.5, (Number(add.form.qty) || 1) + d);
    refreshSheet();
  },
  aff: (el) => { add.form[el.dataset.k] = el.value; },
  'af-save-toggle': () => { add.form.save = !add.form.save; refreshSheet(); },
  'af-log-saved': () => {
    const f = state.foods.find((x) => x.id === add.pickId);
    if (!f) return;
    logEntry(f, add.qty, f.id);
    f.uses = (f.uses || 0) + 1;
    f.lastUsed = Date.now();
    closeSheet();
    commit();
    toast(`Logged ${f.name}`);
  },
  'af-log-new': () => {
    const base = readForm();
    if (!base.name) { toast('Give the food a name'); return; }
    if (!base.cal && !base.p) { toast('Add the calories or protein'); return; }
    let foodId = null;
    if (add.form.save) {
      const existing = add.form.barcode ? state.foods.find((x) => x.barcode === add.form.barcode) : state.foods.find((x) => x.name.toLowerCase() === base.name.toLowerCase());
      if (existing) { Object.assign(existing, base); foodId = existing.id; existing.uses = (existing.uses || 0) + 1; existing.lastUsed = Date.now(); }
      else {
        const food = { id: uid(), ...base, barcode: add.form.barcode || null, uses: 1, lastUsed: Date.now() };
        state.foods.push(food);
        foodId = food.id;
      }
    }
    logEntry(base, Number(add.form.qty) || 1, foodId);
    closeSheet();
    commit();
    toast(`Logged ${base.name}`);
  },
  'af-edit-food': () => {
    const f = state.foods.find((x) => x.id === add.pickId);
    if (!f) return;
    add.form = { ...blankForm(), name: f.name, serving: f.serving || '', cal: String(f.cal), p: String(f.p), c: String(f.c || ''), f: String(f.f || ''), barcode: f.barcode, editFoodId: f.id };
    add.pickId = null; add.tab = 'new'; add.note = '';
    refreshSheet();
  },
  'af-save-food': () => {
    const f = state.foods.find((x) => x.id === add.form.editFoodId);
    const base = readForm();
    if (!f || !base.name) { toast('Give the food a name'); return; }
    Object.assign(f, base);
    closeSheet();
    commit();
    toast('Food updated');
  },
  'af-delete-food': () => {
    const id = add.form.editFoodId;
    confirmSheet({ title: 'Delete this saved food?', message: 'Days you already logged it stay the same.', yes: 'Delete', danger: true }, () => {
      state.foods = state.foods.filter((x) => x.id !== id);
      commit();
      toast('Food deleted');
    });
  },

  'food-edit': (el) => {
    editId = el.dataset.id;
    const e = state.foodLog.find((x) => x.id === editId);
    editQty = e ? Number(e.qty) || 1 : 1;
    openSheet(entrySheet, { label: 'Logged food' });
  },
  'entry-qty': (el) => { editQty = Math.max(0.5, editQty + Number(el.dataset.d)); refreshSheet(); },
  'entry-save': () => {
    const e = state.foodLog.find((x) => x.id === editId);
    if (e) e.qty = editQty;
    closeSheet(); commit();
  },
  'entry-again': () => {
    const e = state.foodLog.find((x) => x.id === editId);
    if (!e) return;
    state.foodLog.push({ ...e, id: uid(), date: L.today(), time: Date.now(), qty: editQty });
    const f = e.foodId && state.foods.find((x) => x.id === e.foodId);
    if (f) { f.uses = (f.uses || 0) + 1; f.lastUsed = Date.now(); }
    closeSheet(); commit();
    toast(`Logged ${e.name} for today`);
  },
  'entry-delete': () => {
    state.foodLog = state.foodLog.filter((x) => x.id !== editId);
    closeSheet(); commit();
    toast('Removed');
  },

  // Groceries
  'g-add': (f) => {
    const name = f.item.value.trim();
    if (!name) return;
    state.grocery.push({ id: uid(), name, done: false });
    commit();
    requestAnimationFrame(() => { const i = document.querySelector('form[data-submit="g-add"] input'); if (i) i.focus(); });
  },
  'g-add-food': (el) => { state.grocery.push({ id: uid(), name: el.dataset.name, done: false }); commit(); },
  'g-toggle': (el) => { const g = state.grocery.find((x) => x.id === el.dataset.id); if (g) { g.done = !g.done; commit(); } },
  'g-del': (el) => { state.grocery = state.grocery.filter((x) => x.id !== el.dataset.id); commit(); },
  'g-clear': () => { state.grocery = state.grocery.filter((x) => !x.done); commit(); },
});
