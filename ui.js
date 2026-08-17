/* HUD, магазин, ввод, обучение. */
'use strict';
const $ = (id) => document.getElementById(id);
const fmt = (v) => Math.round(v).toLocaleString('ru-RU');
const rub = (v) => fmt(v) + ' ₽';

/* ---------- ввод ---------- */
/* Клавиши читаем по физическому коду (e.code), а не по символу —
   тогда WASD работает и на русской раскладке (ЦФЫВ). */
const keys = {};
const stickV = { x: 0, y: 0 };
const HOLD = ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'];
addEventListener('keydown', e => {
  if (e.repeat) return;
  const c = e.code;
  if (HOLD.includes(c)) { keys[c] = 1; e.preventDefault(); }
  if (c === 'KeyB' || c === 'Tab') { toggleSheet(); e.preventDefault(); }
  if (c === 'Escape') { $('sheet').classList.add('hidden'); $('menu').classList.add('hidden'); $('away').classList.add('hidden'); $('trailer').classList.add('hidden'); }
  if (c === 'KeyQ') cam.yaw += .25;
  if (c === 'KeyE') cam.yaw -= .25;
  if (c === 'KeyM') $('menuBtn').click();
});
addEventListener('keyup', e => { keys[e.code] = 0; });
// при потере фокуса клавиши «залипали» — сбрасываем
addEventListener('blur', () => { for (const k in keys) keys[k] = 0; });
addEventListener('visibilitychange', () => { if (document.hidden) { for (const k in keys) keys[k] = 0; save(); } });

function getInput() {
  let x = (keys.KeyD || keys.ArrowRight ? 1 : 0) - (keys.KeyA || keys.ArrowLeft ? 1 : 0);
  let y = (keys.KeyS || keys.ArrowDown ? 1 : 0) - (keys.KeyW || keys.ArrowUp ? 1 : 0);
  if (Math.abs(stickV.x) > .12 || Math.abs(stickV.y) > .12) { x = stickV.x; y = stickV.y; }
  // ввод — относительно направления камеры
  const s = Math.sin(cam.yaw), c = Math.cos(cam.yaw);
  return { x: x * c + y * s, y: y * c - x * s };
}

(function setupStick() {
  const st = $('stick'), kn = $('knob');
  let id = null;
  const set = (dx, dy) => {
    const l = Math.hypot(dx, dy), m = Math.min(l, 48);
    const nx = l ? dx / l * m : 0, ny = l ? dy / l * m : 0;
    kn.style.transform = `translate(${nx}px,${ny}px)`;
    stickV.x = nx / 48; stickV.y = ny / 48;
  };
  const start = e => { const t = e.changedTouches[0]; id = t.identifier; move(e); e.preventDefault(); };
  const move = e => {
    for (const t of e.changedTouches) if (t.identifier === id) {
      const r = st.getBoundingClientRect();
      set(t.clientX - r.left - r.width / 2, t.clientY - r.top - r.height / 2);
    }
  };
  const end = e => { for (const t of e.changedTouches) if (t.identifier === id) { id = null; set(0, 0); } };
  st.addEventListener('touchstart', start, { passive: false });
  addEventListener('touchmove', move, { passive: false });
  addEventListener('touchend', end); addEventListener('touchcancel', end);
  addEventListener('touchstart', () => document.body.classList.add('touch'), { once: true });
})();

(function setupCamera() {
  const cv = $('cv');
  let drag = null, pinch = 0;
  cv.addEventListener('pointerdown', e => { drag = { x: e.clientX, y: e.clientY }; cv.setPointerCapture(e.pointerId); });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    cam.yaw -= (e.clientX - drag.x) * .006;
    cam.dist = Math.min(2.4, Math.max(.6, cam.dist + (e.clientY - drag.y) * .002));
    drag = { x: e.clientX, y: e.clientY };
  });
  const up = () => drag = null;
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('wheel', e => {
    cam.dist = Math.min(2.4, Math.max(.6, cam.dist + Math.sign(e.deltaY) * .09));
    e.preventDefault();
  }, { passive: false });
  cv.addEventListener('touchmove', e => {
    if (e.touches.length !== 2) return;
    const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    if (pinch) cam.dist = Math.min(2.4, Math.max(.6, cam.dist * (pinch / d)));
    pinch = d; drag = null;
  }, { passive: true });
  addEventListener('touchend', e => { if (e.touches.length < 2) pinch = 0; });
})();

/* ---------- всплывающие подписи в мире ---------- */
const floats = [];
function floatText(x, z, text, color) {
  const el = document.createElement('div');
  el.className = 'float'; el.textContent = text; el.style.color = color || '#ffd75e';
  $('world').appendChild(el);
  floats.push({ x, z, el, t: 0 });
}
function updateFloats(dt) {
  for (let i = floats.length - 1; i >= 0; i--) {
    const f = floats[i];
    f.t += dt;
    const p = project(f.x, 1.3 + f.t * 1.4, f.z);
    f.el.style.transform = `translate(${p.x}px,${p.y}px) translate(-50%,-50%) scale(${1 + f.t * .1})`;
    f.el.style.opacity = String(Math.max(0, 1 - f.t / 1.3));
    if (f.t > 1.3 || !p.vis) { f.el.remove(); floats.splice(i, 1); }
  }
}

/* ---------- полный экран и ориентация ---------- */
const isStandalone = () =>
  matchMedia('(display-mode: fullscreen)').matches ||
  matchMedia('(display-mode: standalone)').matches ||
  navigator.standalone === true;

async function goFullscreen() {
  const el = document.documentElement;
  try {
    if (el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
  } catch (e) { /* iOS Safari во вкладке не умеет — там спасает «на экран Домой» */ }
}
// при запуске с домашнего экрана сразу разворачиваем и кладём набок
addEventListener('load', () => {
  if (!isStandalone()) return;
  const mode = lsGet('mt3d_orient') || 'landscape';
  if (mode !== 'auto' && screen.orientation && screen.orientation.lock)
    screen.orientation.lock(mode).catch(() => { });
});

/* ---------- мини-карта ----------
   Карта большая, поэтому сверху всегда видно, где что стоит и где ты сам. */
const mm = $('minimap'), mmx = mm.getContext('2d');
const MS = 6;                                   // пикселей на клетку
function drawMinimap() {
  const w = GW * MS, h = GH * MS;
  mmx.clearRect(0, 0, mm.width, mm.height);
  // зоны
  const zone = (x, y, w2, h2, c) => { mmx.fillStyle = c; mmx.fillRect(x * MS, y * MS, w2 * MS, h2 * MS); };
  zone(0, 0, GW, GH, '#151b28');
  zone(1, 1, 9, 11, '#6b4a2c');
  zone(1, 13, 9, 8, '#6b7a45');
  zone(11, 1, 7, 20, '#4a5464');
  zone(19, 1, 14, 20, '#5a6577');
  // объекты
  for (const b of G.buildings) {
    mmx.fillStyle = DEF[b.t].in ? '#9fd0ff' : (DEF[b.t].zone === 'pen' ? '#ffd08a' : '#8ce07f');
    mmx.fillRect(b.x * MS, b.y * MS, MS, MS);
  }
  for (const s of G.shelves) {
    mmx.fillStyle = s.n ? '#' + ITEMS[s.item].c.toString(16).padStart(6, '0') : '#39415a';
    mmx.fillRect(s.x * MS, s.y * MS, MS, MS);
  }
  for (let i = 0; i < G.regs; i++) {
    mmx.fillStyle = regs[i] && regs[i].manned ? '#41d98a' : '#ff6b6b';
    mmx.fillRect(REG_SLOTS[i].x * MS, REG_SLOTS[i].y * MS, MS, MS);
  }
  mmx.fillStyle = '#ff9f68';
  for (const t of G.trash) mmx.fillRect(t.x * MS - 1, t.y * MS - 1, 3, 3);
  mmx.fillStyle = '#ffffff';
  for (const c of G.customers) mmx.fillRect(c.x * MS - 1, c.y * MS - 1, 3, 3);
  for (const s of G.staff) {
    mmx.fillStyle = '#' + STAFF[s.role].c.toString(16).padStart(6, '0');
    mmx.fillRect(s.x * MS - 1.5, s.y * MS - 1.5, 4, 4);
  }
  // игрок
  mmx.fillStyle = '#4f8cff';
  mmx.beginPath(); mmx.arc(player.x * MS, player.y * MS, 3.6, 0, 7); mmx.fill();
  mmx.strokeStyle = 'rgba(255,255,255,.85)'; mmx.lineWidth = 1.4; mmx.stroke();
  mmx.strokeStyle = 'rgba(255,255,255,.14)'; mmx.lineWidth = 1;
  mmx.strokeRect(.5, .5, w - 1, h - 1);
}

/* ---------- тосты ---------- */
function toast(msg, kind) {
  const box = $('toasts');
  while (box.children.length >= 3) box.firstChild.remove();
  const el = document.createElement('div');
  el.className = 'toast ' + (kind || '');
  el.textContent = msg;
  $('toasts').appendChild(el);
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 300); }, 2200);
}

/* ---------- HUD ---------- */
let shownMoney = 0, bagSig = '';
function updateHUD(dt) {
  shownMoney += (G.money - shownMoney) * Math.min(1, dt * 8);
  if (Math.abs(G.money - shownMoney) < .6) shownMoney = G.money;
  $('money').textContent = fmt(shownMoney);
  const t = G.dayT / DAY_LEN * 24;
  $('clock').textContent = String(Math.floor(t)).padStart(2, '0') + ':' + String(Math.floor(t % 1 * 60)).padStart(2, '0');
  $('sunIc').textContent = (t > 6.5 && t < 19.5) ? '☀️' : (t > 5 && t < 21 ? '🌇' : '🌙');
  $('day').textContent = 'День ' + G.day;
  $('rep').textContent = Math.round(G.rep) + '%';

  $('lvl').textContent = 'Ур. ' + G.level;
  $('xpfill').style.width = Math.min(100, G.xp / xpNeed(G.level) * 100) + '%';
  const hot = ITEMS[G.hot];
  $('hotPill').classList.toggle('off', !hot);
  if (hot) $('hotName').textContent = `${hot.e} ${hot.n} ×${HOT_MUL}`;

  const dem = demandNow();
  const dp = $('demPill');
  dp.classList.toggle('off', !dem);
  if (dem) {
    const list = Object.keys(ITEMS).filter(i => ITEMS[i].dem === dem).slice(0, 4).map(i => ITEMS[i].e).join('');
    $('demName').textContent = `${DEMAND[dem].e} ${list}`;
    dp.title = DEMAND[dem].n + ' спрос: эти товары берут охотнее';
  }

  const q = QUESTS[G.quest];
  $('qtext').textContent = q ? q.d : 'Все задания выполнены 🏆';
  $('qreward').textContent = q ? '+' + rub(q.r) : '';
  $('qfill').style.width = (G.quest / QUESTS.length * 100) + '%';

  const cap = carryCap();
  $('bagn').textContent = player.carry.length + '/' + cap;
  const sig = player.carry.join(',');
  if (sig !== bagSig) {
    bagSig = sig;
    // группируем одинаковое: 🍅×3 вместо трёх помидоров
    const c = {};
    for (const it of player.carry) c[it] = (c[it] || 0) + 1;
    $('bagitems').innerHTML = Object.entries(c)
      .map(([k, v]) => `<b>${ITEMS[k].e}${v > 1 ? '<i>' + v + '</i>' : ''}</b>`).join('');
  }
}
function bumpMoney() {
  const m = document.querySelector('.money');
  m.classList.remove('bump'); void m.offsetWidth; m.classList.add('bump');
}

/* ---------- магазин ---------- */
const TABS = [
  ['field', '🌱 Огород'], ['pen', '🐄 Загон'], ['work', '🍳 Цеха'], ['store', '🏬 Зал'],
  ['price', '💲 Цены'], ['staff', '🧑‍🍳 Персонал'], ['upg', '⚡ Апгрейды'],
];
let tab = 'field', sheetOpen = false, sheetT = 0;

function toggleSheet(force) {
  sheetOpen = force === undefined ? !sheetOpen : force;
  $('sheet').classList.toggle('hidden', !sheetOpen);
  $('shopBtn').classList.remove('pulse');
  if (sheetOpen) renderSheet();
  SFX.ui();
}
function itemCard(emoji, name, sub, desc, cost, canBuy, onBuy, locked, extra) {
  const d = document.createElement('div');
  d.className = 'it' + (locked && !extra ? ' locked' : '');
  d.innerHTML = `<div class="thumb">${emoji}</div><div class="body">
    <h3>${name}<small>${sub || ''}</small></h3><p>${desc}</p>
    <div class="buy"><span class="cost">${cost == null ? '' : rub(cost)}</span></div></div>`;
  const row = d.querySelector('.buy');
  // снос: два нажатия, чтобы не снести случайно
  if (extra && extra.onSell) {
    const del = document.createElement('button');
    del.className = 'delbtn';
    del.textContent = '🗑️';
    del.title = 'Снести одну постройку и вернуть ' + rub(extra.refund);
    del.onclick = () => {
      if (del.dataset.armed) { if (extra.onSell()) { SFX.drop(); renderSheet(); } return; }
      del.dataset.armed = '1';
      del.textContent = '+' + rub(extra.refund) + '?';
      setTimeout(() => { if (del.dataset.armed) { del.dataset.armed = ''; del.textContent = '🗑️'; } }, 3500);
    };
    row.appendChild(del);
  }
  const b = document.createElement('button');
  b.textContent = locked ? 'Мест нет' : 'Купить';
  b.disabled = !canBuy || locked;
  b.onclick = () => { if (onBuy()) { SFX.build(); renderSheet(); } else SFX.error(); };
  // прокачка уже построенного
  if (extra && extra !== 'max' && extra.cost) {
    const u = document.createElement('button');
    u.className = 'lvlbtn';
    u.textContent = '⬆ ' + rub(extra.cost);
    u.title = 'Улучшить самую отстающую постройку этого типа';
    u.disabled = !extra.can;
    u.onclick = () => { if (extra.onBuy()) { SFX.build(); renderSheet(); } else SFX.error(); };
    row.appendChild(u);
  }
  row.appendChild(b);
  $('cards').appendChild(d);
}

function renderSheet() {
  $('sheetMoney').textContent = fmt(G.money);
  const tb = $('tabs'); tb.innerHTML = '';
  for (const [k, n] of TABS) {
    const b = document.createElement('button');
    b.textContent = n; if (k === tab) b.className = 'on';
    b.onclick = () => { tab = k; SFX.ui(); renderSheet(); };
    tb.appendChild(b);
  }
  const cards = $('cards'); cards.innerHTML = '';

  if (tab === 'field' || tab === 'pen' || tab === 'work') {
    const total = SLOTS[tab].length;
    const used = G.buildings.filter(b => DEF[b.t].zone === tab).length;
    const head = document.createElement('div');
    head.className = 'grouphead';
    head.innerHTML = used >= total
      ? `Участок застроен полностью (${used}/${total}). Развивай вглубь — кнопка «⬆ ур.» ускоряет постройку на 18% за уровень и добавляет места под готовый товар.`
      : `Свободных мест: ${total - used} из ${total}`;
    cards.appendChild(head);

    for (const t in DEF) {
      const d = DEF[t];
      if (d.zone !== tab) continue;
      const c = costOf(t);
      const mine = G.buildings.filter(b => b.t === t);
      const rec = d.in
        ? Object.entries(d.in).map(([k, v]) => ITEMS[k].e + '×' + v).join(' + ') + ' → ' + ITEMS[d.out].e
        : 'производит ' + ITEMS[d.out].e;
      const lv = mine.length ? Math.min(...mine.map(lvlOf)) : 0;
      const lvMax = mine.length ? Math.max(...mine.map(lvlOf)) : 0;
      const lvTxt = mine.length
        ? ` · ур. ${lv === lvMax ? lv : lv + '–' + lvMax}${lv >= MAX_LVL ? ' МАКС' : ''}` : '';
      const fastest = mine.length ? Math.min(...mine.map(bTime)) : d.time;
      const lcost = levelCostOf(t);
      itemCard(d.e, d.n, 'у вас: ' + mine.length + lvTxt,
        `${d.d}<br><nobr>${rec}</nobr> · <nobr>${fastest.toFixed(1)} сек</nobr> · <nobr style="color:#ffd75e;font-weight:800">${rub(ITEMS[d.out].price)}/шт</nobr>`,
        c, G.money >= c, () => buyBuilding(t), !hasSlot(t),
        mine.length ? {
          cost: lcost || 0, can: lcost > 0 && G.money >= lcost, onBuy: () => buyLevel(t),
          refund: refundOf(t), onSell: () => sellBuilding(t),
        } : null);
    }
  } else if (tab === 'store') {
    const head = document.createElement('div');
    head.className = 'grouphead';
    head.innerHTML = G.shelves.length >= SHELF_SLOTS.length
      ? `Зал заполнен полностью (${G.shelves.length} полок, ${G.regs} касс). Дальше — апгрейд «Стеллажи»: +2 к вместимости каждой полки.`
      : `Свободных мест под полки: ${SHELF_SLOTS.length - G.shelves.length}, под кассы: ${REG_SLOTS.length - G.regs}`;
    cards.appendChild(head);
    itemCard('🗄️', 'Полка', 'у вас: ' + G.shelves.length,
      'Витрина для товара. Покупатели берут товар только с полок.',
      shelfCost(), G.money >= shelfCost(), buyShelf, G.shelves.length >= SHELF_SLOTS.length);
    itemCard('🛒', 'Касса', 'у вас: ' + G.regs,
      'Ещё одна касса — короче очереди и меньше злых покупателей.',
      regCost(), G.money >= regCost(), buyReg, G.regs >= REG_SLOTS.length);
  } else if (tab === 'price') {
    renderPrices();
  } else if (tab === 'staff') {
    renderPolicy();
    for (const r in STAFF) {
      const s = STAFF[r], c = staffCost(r);
      const sal = salaryOf(r);
      itemCard(s.e, s.n, 'нанято: ' + G.staff.filter(x => x.role === r).length,
        `${s.d}<br>Зарплата <b>${rub(sal)}</b> в день${salaryMul() < 1 ? ' (−' + Math.round((1 - salaryMul()) * 100) + '%)' : ''}.`,
        c, G.money >= c, () => buyStaff(r));
    }
  } else {
    const groups = [['me', '🧑‍🍳 Ты сам'], ['crew', '🧑‍🌾 Смена'], ['shop', '🏬 Магазин']];
    for (const [g, title] of groups) {
      const h = document.createElement('div');
      h.className = 'grouphead'; h.textContent = title;
      $('cards').appendChild(h);
      for (const k in UPG) {
        const u = UPG[k];
        if (u.g !== g) continue;
        const c = upgCost(k);
        itemCard(u.e, u.n, 'уровень ' + (G.upg[k] || 0), u.d, c, G.money >= c, () => buyUpg(k));
      }
    }
  }
}

/* Цены на полках: наценку ставит игрок и сразу видит спрос. */
function renderPrices() {
  const cur = demandNow();
  const head = document.createElement('div');
  head.className = 'grouphead';
  head.innerHTML = cur
    ? `Сейчас ${DEMAND[cur].e} ${DEMAND[cur].n} спрос — эти товары расхватывают охотнее. Дороже базовой цены — выше маржа, но часть покупателей уйдёт мимо.`
    : '🌙 Ночь: покупателей мало и берут неохотно. Днём спрос зависит от времени суток.';
  $('cards').appendChild(head);

  // сначала то, что реально лежит в зале
  const onShelf = new Set(G.shelves.filter(s => s.item).map(s => s.item));
  const items = Object.keys(ITEMS).sort((a, b) =>
    (onShelf.has(b) ? 1 : 0) - (onShelf.has(a) ? 1 : 0) || ITEMS[a].price - ITEMS[b].price);

  for (const it of items) {
    const I = ITEMS[it], m = markup(it), hot = it === G.hot;
    const inDemand = cur && I.dem === cur;
    const row = document.createElement('div');
    row.className = 'it price' + (onShelf.has(it) ? '' : ' locked');
    row.innerHTML = `<div class="thumb">${I.e}</div><div class="body">
      <h3>${I.n}${hot ? ' 🔥' : ''}<small>${inDemand ? DEMAND[cur].e + ' в спросе' : (I.life ? 'портится за ' + I.life + ' с' : 'не портится')}</small></h3>
      <p>Цена <b style="color:#ffd75e">${rub(itemPrice(it))}</b> · базовая ${rub(basePrice(it))} ·
         спрос <b style="color:${inDemand ? '#6ee7a0' : '#93a1ba'}">${Math.round(appeal(it) * 100)}%</b></p>
      <div class="buy"><span class="cost">×${m.toFixed(2)}</span></div></div>`;
    const box = row.querySelector('.buy');
    const mk = (label, delta) => {
      const b = document.createElement('button');
      b.className = 'lvlbtn'; b.textContent = label;
      b.onclick = () => { setMarkup(it, markup(it) + delta); SFX.ui(); renderSheet(); };
      box.appendChild(b);
    };
    mk('−', -.05); mk('+', .05);
    const reset = document.createElement('button');
    reset.textContent = 'база';
    reset.onclick = () => { setMarkup(it, 1); SFX.ui(); renderSheet(); };
    box.appendChild(reset);
    $('cards').appendChild(row);
  }
}

/* Приоритеты грузчиков: общий режим + отдельный для каждого. */
function renderPolicy() {
  const hands = G.staff.filter(s => s.role === 'farmhand');
  const box = document.createElement('div');
  box.className = 'policy';
  box.innerHTML = `<h3>⚙️ Что делают грузчики</h3>
    <p style="margin:0">Общий режим для всех. Ниже можно дать каждому свой участок и собрать конвейер:
    один на огороде, второй в загоне, третий возит готовое из цехов в зал.</p>`;
  const opts = document.createElement('div'); opts.className = 'opts';
  for (const k in POLICY) {
    const b = document.createElement('button');
    b.textContent = POLICY[k].e + ' ' + POLICY[k].n;
    if (G.policy === k) b.className = 'on';
    b.onclick = () => { G.policy = k; SFX.ui(); save(); renderSheet(); };
    opts.appendChild(b);
  }
  const desc = document.createElement('p');
  desc.textContent = POLICY[G.policy].d;
  box.append(opts, desc);

  if (hands.length) {
    const crew = document.createElement('div'); crew.className = 'crew';
    hands.forEach((s, i) => {
      const row = document.createElement('div');
      const cur = s.policy || G.policy;
      row.innerHTML = `<span>${STAFF.farmhand.e}</span><b>Грузчик №${i + 1}</b>
        <span style="color:var(--dim);font-size:12px">${s.policy ? 'свой режим' : 'общий'}</span>`;
      const b = document.createElement('button');
      b.textContent = POLICY[cur].e + ' ' + POLICY[cur].n;
      b.title = POLICY[cur].d;
      b.onclick = () => {                      // общий → участки по кругу
        const order = [null, ...Object.keys(POLICY)];
        s.policy = order[(order.indexOf(s.policy) + 1) % order.length];
        SFX.ui(); save(); renderSheet();
      };
      row.appendChild(b); crew.appendChild(row);
    });
    box.appendChild(crew);
  }
  $('cards').appendChild(box);
}

/* ---------- меню ---------- */
function openMenu() {
  const s = G.stats;
  $('mstats').innerHTML = `
    <div><span>Продано товаров</span><b>${fmt(s.sold)}</b></div>
    <div><span>Всего заработано</span><b>${fmt(s.earned)} ₽</b></div>
    <div><span>Построек</span><b>${G.buildings.length}</b></div>
    <div><span>Сотрудников</span><b>${G.staff.length}</b></div>
    <div><span>Полок / касс</span><b>${G.shelves.length} / ${G.regs}</b></div>
    <div><span>День</span><b>${G.day}</b></div>
    <div><span>Уровень магазина</span><b>${G.level}</b></div>
    <div><span>Убрано мусора</span><b>${fmt(s.cleaned || 0)}</b></div>
    <div><span>Зарплата в день</span><b>${fmt(payroll())} ₽</b></div>
    <div><span>Товар дня</span><b>${ITEMS[G.hot].e} ${ITEMS[G.hot].n}</b></div>`;
  $('resetBtn').textContent = '🗑️ Сбросить прогресс';
  $('resetBtn').dataset.armed = '';
  $('saveInfo').innerHTML = storageOk
    ? `Сохранено ${saveAgeSec()} сек назад · автосохранение каждые 6 сек, дубль в двух хранилищах.<br>
       Скачай бэкап, если играешь в приватном окне или чистишь браузер.`
    : `⚠️ Браузер не даёт сохранять (приватный режим?). Скачай бэкап, иначе прогресс потеряется.`;
  $('menu').classList.remove('hidden');
  SFX.ui();
}
function wireUI() {
  $('shopBtn').onclick = () => toggleSheet();
  $('sheetClose').onclick = () => toggleSheet(false);
  $('menuBtn').onclick = openMenu;
  $('fsBtn').onclick = async () => {
    if (document.fullscreenElement) { document.exitFullscreen(); }
    else { await goFullscreen(); applyOrient(); }
    SFX.ui();
  };
  if (isStandalone()) $('fsBtn').style.display = 'none';   // в приложении уже полный экран
  $('menuClose').onclick = () => { $('menu').classList.add('hidden'); SFX.ui(); };
  // клик по затемнению закрывает окно (в обучении — нет, там надо дочитать)
  for (const id of ['menu', 'away']) {
    $(id).addEventListener('pointerdown', (e) => {
      if (e.target === $(id)) { $(id).classList.add('hidden'); SFX.ui(); }
    });
  }
  // и лист магазина тоже закрывается тапом мимо
  addEventListener('pointerdown', (e) => {
    if (!sheetOpen) return;
    if (!$('sheet').contains(e.target) && !$('shopBtn').contains(e.target)) toggleSheet(false);
  }, true);
  $('camBtn').onclick = () => { cam.yaw = 0; cam.dist = .95; SFX.ui(); };
  $('awayClose').onclick = () => { $('away').classList.add('hidden'); SFX.coin(); };
  // ручной бэкап: файл можно унести на другое устройство или в другой браузер
  $('exportBtn').onclick = () => { save(true); exportSave(); toast('💾 Бэкап сохранён в загрузки', 'good'); };
  $('importBtn').onclick = () => $('importFile').click();
  $('importFile').onchange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = new FileReader();
    r.onload = () => {
      if (importSave(String(r.result))) {
        toast('📂 Бэкап загружен, перезапуск…', 'good');
        setTimeout(() => location.reload(), 900);   // ждём, пока допишется зеркало в IndexedDB
      }
      else toast('⚠️ Файл не похож на сохранение', 'bad');
    };
    r.readAsText(f);
    e.target.value = '';
  };
  const QN = ['низкое', 'среднее', 'высокое'];
  const qLabel = () => $('qualBtn').textContent = '🎚️ Качество: ' + QN[quality];
  qLabel();
  $('qualBtn').onclick = () => { setQuality((quality + 1) % 3); qLabel(); SFX.ui(); };
  $('soundBtn').onclick = () => { $('soundBtn').textContent = SFX.toggle() ? '🔊' : '🔇'; };
  $('soundBtn').textContent = SFX.on ? '🔊' : '🔇';
  const musIcon = () => {
    $('musicBtn').textContent = '🎵';
    $('musicBtn').style.opacity = MUSIC.on ? '1' : '.4';
  };
  musIcon();
  $('musicBtn').onclick = () => { MUSIC.toggle(); musIcon(); SFX.ui(); };
  // список тем: можно выбрать конкретную
  const renderTracks = () => {
    const box = $('trackList');
    box.innerHTML = '';
    MUSIC.list.forEach((name, i) => {
      const b = document.createElement('button');
      b.textContent = name;
      if (i === MUSIC.index) b.className = 'on';
      b.onclick = () => { MUSIC.goTo(i); renderTracks(); SFX.ui(); };
      box.appendChild(b);
    });
  };
  $('trailerBtn').onclick = () => { $('trailer').classList.remove('hidden'); $('trailerVid').play().catch(() => { }); SFX.ui(); };
  const closeTrailer = () => { $('trailerVid').pause(); $('trailer').classList.add('hidden'); SFX.ui(); };
  $('trailerClose').onclick = closeTrailer;
  $('trailer').addEventListener('pointerdown', (e) => { if (e.target === $('trailer')) closeTrailer(); });
  $('trackBtn').onclick = () => {
    const box = $('trackList');
    box.classList.toggle('hidden');
    if (!box.classList.contains('hidden')) renderTracks();
    SFX.ui();
  };
  MUSIC.onTrack(name => toast('🎵 ' + name));

  /* Ориентация: PWA открывается горизонтально, но можно переключить. */
  const ORIENT = ['auto', 'landscape', 'portrait'];
  const ORIENT_RU = { auto: 'как повернёшь', landscape: 'горизонтально', portrait: 'вертикально' };
  let oi = ORIENT.indexOf(lsGet('mt3d_orient') || 'landscape');
  if (oi < 0) oi = 0;
  const applyOrient = async () => {
    const mode = ORIENT[oi];
    lsSet('mt3d_orient', mode);
    $('orientBtn').textContent = '📱 Экран: ' + ORIENT_RU[mode];
    try {
      if (!screen.orientation || !screen.orientation.lock) return;
      if (mode === 'auto') screen.orientation.unlock();
      else await screen.orientation.lock(mode);
    } catch (e) { /* в обычной вкладке браузер блокировку не даёт — это нормально */ }
  };
  $('orientBtn').onclick = async () => {
    oi = (oi + 1) % ORIENT.length;
    // блокировка работает только в полноэкранном/установленном режиме
    if (ORIENT[oi] !== 'auto' && !document.fullscreenElement && !isStandalone()) await goFullscreen();
    applyOrient(); SFX.ui();
  };
  applyOrient();
  $('helpBtn2').onclick = () => { $('menu').classList.add('hidden'); startTutorial(true); };
  $('resetBtn').onclick = (e) => {
    const b = e.currentTarget;
    if (!b.dataset.armed) {
      b.dataset.armed = '1';
      b.textContent = '⚠️ Точно? Нажми ещё раз';
      setTimeout(() => { if (b.dataset.armed) { b.dataset.armed = ''; b.textContent = '🗑️ Сбросить прогресс'; } }, 4000);
      return;
    }
    lsDel('mt3d_tut');
    resetGame();
  };
  // свайп вниз закрывает магазин
  let sy = null;
  $('sheet').addEventListener('touchstart', e => sy = e.touches[0].clientY, { passive: true });
  $('sheet').addEventListener('touchend', e => {
    if (sy !== null && e.changedTouches[0].clientY - sy > 90 && $('cards').scrollTop <= 0) toggleSheet(false);
    sy = null;
  });
}

/* ---------- титульный экран ----------
   Даёт игре «лицо», показывает арт и — главное — первое касание игрока,
   после которого браузер разрешает музыку. */
function showTitle() {
  const t = $('title');
  const started = G.stats.sold > 0 || G.day > 1 || G.buildings.length > 1;
  $('titleSub').textContent = started
    ? `День ${G.day} · ${fmt(G.money)} ₽ · уровень ${G.level}`
    : 'Ферма · цеха · прилавок';
  $('playBtn').textContent = started ? '▶ Продолжить' : '▶ Играть';
  t.classList.remove('hidden', 'out');

  const close = () => {
    t.classList.add('out');
    setTimeout(() => t.classList.add('hidden'), 450);
    MUSIC.start();
    if (offlineReport) showAway(offlineReport); else startTutorial(false);
  };
  $('playBtn').onclick = close;
  $('titleTrailer').onclick = () => { $('trailer').classList.remove('hidden'); $('trailerVid').play().catch(() => { }); };
  $('titleHelp').onclick = () => { close(); setTimeout(() => startTutorial(true), 500); };
}

/* Отчёт о работе смены, пока игра была закрыта. */
function showAway(rep) {
  if (!rep) return;
  const h = Math.floor(rep.secs / 3600), m = Math.round(rep.secs % 3600 / 60);
  const time = (h ? h + ' ч ' : '') + m + ' мин';
  $('awayText').innerHTML = rep.crew
    ? `Смена работала <b>${time}</b>.<br>Заработано <b style="color:#ffd75e">${rub(rep.money)}</b>
       (за вычетом зарплат ${rub(rep.sal)}).`
    : `Прошло <b>${time}</b>, но магазин стоял: без грузчика и кассира смена не работает.
       Найми обоих — и деньги будут капать даже офлайн.`;
  $('away').classList.remove('hidden');
}

/* ---------- обучение ---------- */
const TUT = [
  ['Твой супермаркет 🏪', 'Четыре зоны: <b>огород</b>, <b>загон</b>, <b>цеха</b> и <b>торговый зал</b>. Бегаешь сам: <b>WASD / стрелки</b> или <b>джойстик</b> на телефоне. Камера — перетаскивание, зум колесом/щипком.'],
  ['Огород и загон 🌱', 'Одинаковые грядки встают рядом, между ними всегда есть проход — подходишь и берёшь именно то, что нужно. Животные живут в отдельном загоне за забором.'],
  ['Цеха 🍳', 'Отдельный двор для переработки. Принёс мясо к грилю — получил стейк втрое дороже. Цех сам показывает, какого сырья ему не хватает.'],
  ['Рюкзак умный 🎒', 'Набирай всё подряд и вставай в проходе — товар <b>сам разойдётся по нужным полкам</b>: картошка к картошке, мясо к мясу, а стоящий рядом цех заберёт своё сырьё. Полки, куда сейчас уйдёт груз, подсвечиваются зелёным кольцом.'],
  ['Касса и покупатели 🛒', 'Клиент берёт товар с полки и встаёт в очередь. Встань <b>за кассу</b> — деньги пойдут. Долгая очередь злит, мусор на полу роняет репутацию — убирай его на бегу или найми уборщика.'],
  ['Смена и конвейер 🧑‍🌾', 'Каждому грузчику можно дать участок: один снимает урожай с <b>огорода</b> и везёт в цеха, второй работает по <b>загону</b>, третий возит <b>готовое из цехов</b> в зал. В режиме «Максимум прибыли» он сам считает, что выгоднее — переработать или продать (товар дня ×1.7 учитывается).'],
  ['Цены и свежесть 💲', 'Ты сам ставишь наценку на каждый товар: дороже — выше маржа, но часть покупателей пройдёт мимо. Спрос меняется по времени дня — утром берут молочку и хлеб, днём готовую еду, вечером десерты. Скоропортящееся не лежит вечно: полоска над полкой показывает свежесть, просроченное уходит в мусор и бьёт по репутации.'],
  ['Развивайся ⚡', 'Уровень магазина, VIP-клиенты, апгрейды для себя и для смены. Когда участок застроен целиком — качай постройки кнопкой <b>⬆ ур.</b> (быстрее цикл), а ошибку планировки всегда можно исправить: <b>🗑️</b> сносит постройку и возвращает половину вложенного.'],
];
let tutI = 0;
function startTutorial(force) {
  if (!force && lsGet('mt3d_tut')) return;
  tutI = 0; showTut();
  $('tutNext').onclick = () => {
    tutI++;
    if (tutI >= TUT.length) {
      $('tut').classList.add('hidden');
      lsSet('mt3d_tut', '1');
      $('shopBtn').classList.add('pulse');
    } else showTut();
    SFX.ui();
  };
}
function showTut() {
  $('tutTitle').innerHTML = TUT[tutI][0];
  $('tutText').innerHTML = TUT[tutI][1];
  $('tutNext').textContent = tutI === TUT.length - 1 ? 'Начать игру' : 'Дальше';
  $('tut').classList.remove('hidden');
}
