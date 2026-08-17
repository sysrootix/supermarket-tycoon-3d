/* Симуляция магазина. Без DOM и без рендера: только состояние и правила.
   Все координаты — в клетках (1 клетка = 1 юнит в 3D). */
'use strict';

const G = {
  money: 250, day: 1, dayT: DAY_LEN * 0.35, rep: 100,
  buildings: [], shelves: [], staff: [], customers: [],
  regs: 1, upg: { bag: 0, boots: 0, fert: 0, register: 0, ads: 0, shelf: 0, crewBag: 0, crewFeet: 0, crewSkill: 0, payroll: 0 },
  quest: 0, ev: [], trash: [], hot: 'tomato', level: 1, xp: 0, policy: 'value', price: {}, order: null, noTake: {}, riding: false,
  brand: { name: 'МОЙ СУПЕРМАРКЕТ', wall: 0, trim: 0, floor: 0 },
  stats: { sold: 0, earned: 0, picked: 0, stocked: 0, cleaned: 0, personal: 0, vip: 0, hot: 0, spoiled: 0, orders: 0, stolen: 0, caught: 0, supplies: 0, byItem: {}, daily: [] },
};
const player = { x: START.x, y: START.y, carry: [], act: 0, speed: 4.7, moving: 0, dir: 0 };
const regs = [];
const emit = (o) => G.ev.push(o);

/* ---------- сетка и коллизии ---------- */
const blocked = new Uint8Array(GW * GH);
const idx = (x, y) => y * GW + x;
const inb = (x, y) => x >= 0 && y >= 0 && x < GW && y < GH;

function baseWall(x, y) {
  if (x === 0 || y === 0 || y === GH - 1) return true;                 // внешний контур
  if (x === GW - 1) return !ENTRY_Y.includes(y);                       // вход в магазин
  if (x === WALL_FARM || x === WALL_HALL) return !GATE_Y.includes(y);   // ворота между зонами
  if (y === FENCE_PEN && x < WALL_FARM) return !PEN_GATE_X.includes(x); // забор загона с калиткой в три клетки
  if (y === WALL_BACK && x > WALL_HALL) return !BACK_DOOR_X.includes(x); // дверь в служебку
  return false;
}
function rebuild() {
  blocked.fill(0);
  for (let y = 0; y < GH; y++) for (let x = 0; x < GW; x++) if (baseWall(x, y)) blocked[idx(x, y)] = 1;
  for (const b of G.buildings) blocked[idx(b.x, b.y)] = 1;
  for (const s of G.shelves) blocked[idx(s.x, s.y)] = 1;
  for (let i = 0; i < G.regs; i++) blocked[idx(REG_SLOTS[i].x, REG_SLOTS[i].y)] = 1;
  fields.clear();
}
const walkable = (x, y) => inb(x, y) && !blocked[idx(x, y)];

/* ---------- поиск пути: BFS-поле от цели ---------- */
const fields = new Map();
function field(tx, ty) {
  const k = tx + ',' + ty;
  let f = fields.get(k);
  if (f) return f;
  f = new Int16Array(GW * GH).fill(-1);
  f[idx(tx, ty)] = 0;
  const q = [[tx, ty]];
  for (let h = 0; h < q.length; h++) {
    const [x, y] = q[h], d = f[idx(x, y)];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (!walkable(nx, ny) || f[idx(nx, ny)] !== -1) continue;
      f[idx(nx, ny)] = d + 1;
      q.push([nx, ny]);
    }
  }
  fields.set(k, f);
  return f;
}

function step(e, px, py, dt) {
  const dx = px - e.x, dy = py - e.y, l = Math.hypot(dx, dy);
  if (l < 1e-4) { e.moving = 0; return true; }
  const s = e.speed * dt;
  e.dir = Math.atan2(dx, dy);
  e.moving = 1;
  if (l <= s) { e.x = px; e.y = py; return true; }
  e.x += dx / l * s; e.y += dy / l * s;
  return false;
}
/* arrive: 0 — встать на клетку, 1 — встать вплотную рядом */
function walkTo(e, tx, ty, arrive, dt) {
  const f = field(tx, ty);
  const cx = Math.floor(e.x), cy = Math.floor(e.y);
  const d = inb(cx, cy) ? f[idx(cx, cy)] : -1;
  if (d >= 0 && d <= arrive) { step(e, cx + .5, cy + .5, dt); e.moving = 0; return true; }
  if (d < 0) { step(e, tx + .5, ty + .5, dt); return false; }
  let best = null, bd = 1e9;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    const nx = cx + dx, ny = cy + dy;
    if (!inb(nx, ny)) continue;
    const nd = f[idx(nx, ny)];
    if (nd < 0 || nd >= d) continue;
    const dist = Math.hypot(nx + .5 - e.x, ny + .5 - e.y);
    if (nd * 1000 + dist < bd) { bd = nd * 1000 + dist; best = [nx + .5, ny + .5]; }
  }
  if (best) step(e, best[0], best[1], dt); else e.moving = 0;
  return false;
}

/* ---------- модификаторы ---------- */
const timeMul = () => Math.pow(0.9, G.upg.fert);
const priceMul = () => 1 + 0.05 * G.upg.ads;
/* Электрокар: пока игрок «за рулём», он быстрее и берёт больше.
   Ездить можно только если кар куплен. */
const hasCart = () => (G.upg.cart || 0) > 0;
const onCart = () => hasCart() && G.riding;
/* Сесть можно где угодно — кар «вызывается» как самокат по подписке,
   иначе на карте 72×40 бегать за ним через полкарты было бы издевательством. */
function toggleRide() {
  if (!hasCart()) return false;
  G.riding = !G.riding;
  save(true);
  emit({ t: 'ride', on: G.riding });
  return true;
}
const carryCap = () => 8 + 2 * G.upg.bag + (onCart() ? 4 : 0);
const playerSpeed = () => 4.7 * Math.pow(1.12, G.upg.boots) * (onCart() ? 1.45 : 1);
const serveRate = () => 1.1 * Math.pow(1.25, G.upg.register);
const near = (a, bx, by, r) => Math.hypot(a.x - (bx + .5), a.y - (by + .5)) < r;
const REACH = 1.2;
/* характеристики смены — растут апгрейдами */
const staffCarry = () => 8 + 3 * (G.upg.crewBag || 0);
const staffSpeed = () => 3.9 * Math.pow(1.12, G.upg.crewFeet || 0);
const staffAct = () => .18 * Math.pow(.85, G.upg.crewSkill || 0);
const salaryMul = () => Math.max(.4, 1 - .12 * (G.upg.payroll || 0));
const salaryOf = (role) => STAFF[role].salary * salaryMul();
const payroll = () => G.staff.reduce((s, x) => s + salaryOf(x.role), 0);
/* объекты в радиусе, ближайший первым — чтобы в проходе брать именно ту грядку, у которой стоишь */
const byDist = (e) => (a, b) =>
  Math.hypot(a.x + .5 - e.x, a.y + .5 - e.y) - Math.hypot(b.x + .5 - e.x, b.y + .5 - e.y);
const inReach = (e, list, r) => list.filter(o => near(e, o.x, o.y, r || REACH)).sort(byDist(e));
/* Радиус подбора выбран по геометрии карты: до центра соседней проходимой клетки ровно 1.0,
   а между двумя постройками всегда 2.0 — значит 1.35 достаёт ту, у которой стоишь,
   и физически не дотягивается до соседней. Выкладываем шире (REACH_DROP), чтобы
   с полным рюкзаком разложить всё по соседним полкам и цехам, не бегая от одной к другой. */
const REACH_TAKE = 1.35;
const REACH_DROP = 3.2;

/* Фильтр рюкзака: игрок сам решает, что подбирать на бегу.
   G.noTake хранит только выключенное, поэтому старые сейвы берут всё, как раньше. */
const canTake = (item) => !(G.noTake && G.noTake[item]);
function setTake(item, on) {
  G.noTake = G.noTake || {};
  if (on) delete G.noTake[item]; else G.noTake[item] = 1;
  save(true);
}
/* Постройка, у которой сейчас произойдёт подбор — одна и та же для логики и для подсветки,
   чтобы игрок видел заранее, что именно схватит.
   В проходе между двумя рядами обе грядки равноудалены (по 1.0), поэтому решает взгляд:
   берём ту, что ближе к направлению движения, — так «оно берётся и это» больше не случается. */
function pickTarget() {
  if (player.carry.length >= carryCap()) return null;
  const ready = inReach(player, G.buildings, REACH_TAKE)
    .filter(b => b.out.length && canTake(b.out[b.out.length - 1]));
  if (ready.length < 2) return ready[0] || null;
  const fx = Math.sin(player.dir), fy = Math.cos(player.dir);
  const score = (b) => {
    const dx = b.x + .5 - player.x, dy = b.y + .5 - player.y;
    const len = Math.hypot(dx, dy) || 1;
    return (dx * fx + dy * fy) / len;                  // 1 — прямо перед носом, −1 — за спиной
  };
  return ready.slice().sort((a, b) => score(b) - score(a))[0];
}
const shelfBonus = () => 2 * (G.upg.shelf || 0);
/* ---------- цены и спрос ----------
   Наценку ставит игрок: дороже — выше маржа, но покупатель охотнее пройдёт мимо. */
const PRICE_MIN = .6, PRICE_MAX = 1.8;
const markup = (it) => Math.min(PRICE_MAX, Math.max(PRICE_MIN, G.price[it] || 1));
const setMarkup = (it, v) => {
  G.price[it] = Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(v * 20) / 20));
  save(true);
};
const HOT_MUL = 1.7;
const basePrice = (it) => ITEMS[it].price * priceMul() * (it === G.hot ? HOT_MUL : 1);
const itemPrice = (it) => basePrice(it) * markup(it);

/* Какая категория спроса сейчас в силе. */
function demandNow() {
  const p = G.dayT / DAY_LEN;
  for (const k in DEMAND) if (p >= DEMAND[k].from && p < DEMAND[k].to) return k;
  return null;                                        // ночь: спроса нет ни на что особенно
}
/* Насколько охотно берут этот товар прямо сейчас. */
function appeal(it) {
  const cur = demandNow();
  const d = ITEMS[it].dem;
  let v = cur ? (d === cur ? DEMAND[cur].boost : .7) : .5;
  // реакция на цену: дешевле базовой — расхватывают, дороже — думают
  const m = markup(it);
  v *= Math.max(.08, 1.9 - m * 1.15);
  if (it === G.hot) v *= 1.5;
  return v;
}

/* ---------- уровень магазина ---------- */
const xpNeed = (lvl) => Math.round(120 * Math.pow(lvl, 1.45));
function addXp(v) {
  G.xp += v;
  while (G.xp >= xpNeed(G.level)) {
    G.xp -= xpNeed(G.level);
    G.level++;
    const r = 250 * G.level;
    G.money += r;
    emit({ t: 'level', lvl: G.level, r });
  }
}

/* ---------- размещение ----------
   Каждый тип едет в свою зону, а внутри зоны встаёт вплотную к таким же:
   помидоры к помидорам, цеха к цехам. */
function freeSlots(zone, sec) {
  const used = new Set(G.buildings.filter(b => DEF[b.t].zone === zone).map(b => b.slot));
  return SLOTS[zone].map((s, i) => ({ s, i }))
    .filter(o => !used.has(o.i) && (!sec || o.s.sec === sec));
}
/* Постройка встаёт только в свою секцию: помидор — на помидорную грядку,
   гриль — в горячий цех. Внутри секции выбираем место ближе к таким же,
   чтобы ряд заполнялся подряд, а не с дырами. */
function pickSlot(type) {
  const sec = secOf(type);
  const free = freeSlots(DEF[type].zone, sec && sec.k);
  if (!free.length) return -1;
  const same = G.buildings.filter(b => b.t === type);
  if (!same.length) return free[0].i;
  let best = free[0], bd = 1e9;
  for (const f of free) {
    let d = 1e9;
    for (const b of same) d = Math.min(d, Math.abs(b.x - f.s.x) + Math.abs(b.y - f.s.y));
    if (d < bd) { bd = d; best = f; }
  }
  return best.i;
}
const hasSlot = (type) => freeSlots(DEF[type].zone, (secOf(type) || {}).k).length > 0;
/* Секция считается профильной, когда занята целиком: все её постройки получают
   −15% ко времени цикла. Специализация должна быть выгодна, а не только опрятна. */
const secSlots = (sec) => SLOTS[sec.zone].filter(s => s.sec === sec.k).length;
const secBuilt = (sec) => G.buildings.filter(b => sec.types.includes(b.t)).length;
const secFull = (sec) => sec && secBuilt(sec) >= secSlots(sec);
const isSpec = (b) => secFull(secOf(b.t));

/* ---------- объекты ---------- */
function newBuilding(t, slot) {
  const s = SLOTS[DEF[t].zone][slot];
  return { t, slot, x: s.x, y: s.y, prog: 0, out: [], stock: {}, res: null, anim: 0 };
}
function newShelf(slot) {
  const s = SHELF_SLOTS[slot];
  return { slot, x: s.x, y: s.y, item: null, n: 0, cap: 8, res: 0, age: 0 };
}
const shelfCap = (sh) => sh.cap + shelfBonus();

/* ---------- уровни построек ----------
   Когда участок застроен целиком, развитие идёт вглубь: каждый уровень
   ускоряет цикл на 18% и раз в два уровня добавляет место под готовый товар. */
const MAX_LVL = 6;
const lvlOf = (b) => b.lvl || 1;
const bTime = (b) => DEF[b.t].time * timeMul() * Math.pow(.82, lvlOf(b) - 1) * (isSpec(b) ? SPEC_BONUS : 1);
const bCap = (b) => DEF[b.t].cap + Math.floor((lvlOf(b) - 1) / 2);
const lvlCost = (b) => Math.round(DEF[b.t].cost * 1.6 * Math.pow(2.2, lvlOf(b) - 1));

function updateBuilding(b, dt) {
  const d = DEF[b.t];
  b.working = false;
  if (b.out.length >= bCap(b)) return;
  if (d.in && b.prog === 0) {
    for (const k in d.in) if ((b.stock[k] || 0) < d.in[k]) return;
    for (const k in d.in) b.stock[k] -= d.in[k];
  }
  b.working = true;
  b.prog += dt / bTime(b);
  if (b.prog >= 1) {
    b.prog = 0; b.out.push(d.out);
    emit({ t: 'produce', x: b.x + .5, y: b.y + .5, item: d.out });
  }
}
/* Сколько порций этого ингредиента уже лежит в цехе. */
const portions = (b, k) => (b.stock[k] || 0) / DEF[b.t].in[k];
const minPortions = (b) => Math.min(...Object.keys(DEF[b.t].in).map(k => portions(b, k)));

/* Цех принимает сырьё, только если им не набит впрок: иначе можно засыпать
   его огурцами, пока он ждёт помидор, и «лишнее» поедет в зал. */
function acceptsInput(b, item) {
  const d = DEF[b.t];
  if (!d.in || !d.in[item]) return false;
  const have = portions(b, item);
  return have < 3 && have <= minPortions(b) + 1;
}
/* Этого ингредиента цеху не хватает больше всего. */
const isScarce = (b, item) => DEF[b.t].in && DEF[b.t].in[item] && portions(b, item) <= minPortions(b);

/* ---------- игрок ---------- */
function movePlayer(dx, dy, dt, look) {
  player.speed = playerSpeed();
  // от первого лица направление взгляда задаёт камера, а не последний шаг
  if (look != null) player.dir = look;
  const l = Math.hypot(dx, dy);
  if (!l) { player.moving = 0; return; }
  const s = player.speed * dt;
  if (look == null) player.dir = Math.atan2(dx, dy);
  player.moving = Math.min(1, l);
  slide(player, dx / l * s, dy / l * s);
}
function slide(e, dx, dy) {
  const R = 0.33;
  const hit = (x, y) => {
    for (const [ox, oy] of [[-R, -R], [R, -R], [-R, R], [R, R]])
      if (!walkable(Math.floor(x + ox), Math.floor(y + oy))) return true;
    return false;
  };
  if (!hit(e.x + dx, e.y)) e.x += dx;
  if (!hit(e.x, e.y + dy)) e.y += dy;
}

/* Рюкзак сам находит нужный товар: неважно, в каком порядке ты его собрал. */
function takeFromCarry(carry, item) {
  const i = carry.lastIndexOf(item);
  if (i < 0) return null;
  carry.splice(i, 1);
  return item;
}
// самый частый товар в рюкзаке — им и заполняем пустую полку
function majorItem(carry) {
  const c = {};
  let best = null;
  for (const it of carry) { c[it] = (c[it] || 0) + 1; if (!best || c[it] > c[best]) best = it; }
  return best;
}

/* Автовзаимодействие: сначала отдать, потом взять. */
function playerInteract(dt) {
  player.act -= dt;
  if (player.act > 0) return;

  if (player.carry.length) {
    // 1) цеха вокруг: каждому отдаём то сырьё, которое он ждёт
    for (const b of inReach(player, G.buildings, REACH_DROP)) {
      const item = player.carry.find(it => acceptsInput(b, it));
      if (!item) continue;
      takeFromCarry(player.carry, item);
      b.stock[item] = (b.stock[item] || 0) + 1;
      player.act = .13;
      emit({ t: 'drop', x: b.x + .5, y: b.y + .5, item, from: 'player' });
      return;
    }
    // 2) полки вокруг: сначала те, где уже лежит наш товар (картошка к картошке),
    //    потом пустые — так один заход раскладывает весь рюкзак по местам
    const shelves = inReach(player, G.shelves, REACH_DROP);
    for (const sh of shelves) {
      if (sh.n >= shelfCap(sh) || !sh.item) continue;
      if (!player.carry.includes(sh.item)) continue;
      takeFromCarry(player.carry, sh.item);
      sh.n++; player.act = .13; G.stats.stocked++; addXp(1);
      emit({ t: 'drop', x: sh.x + .5, y: sh.y + .5, item: sh.item, from: 'player' });
      return;
    }
    const empty = shelves.find(sh => !sh.item);
    if (empty) {
      const item = majorItem(player.carry);
      takeFromCarry(player.carry, item);
      empty.item = item; empty.n = 1; empty.age = 0;
      player.act = .13; G.stats.stocked++; addXp(1);
      emit({ t: 'drop', x: empty.x + .5, y: empty.y + .5, item, from: 'player' });
      return;
    }
  }
  const src = pickTarget();
  if (src) {
    const item = src.out.pop();
    player.carry.push(item);
    player.carry.sort();                     // одинаковое лежит рядом
    player.act = .1;
    G.stats.picked++; addXp(1);
    emit({ t: 'pick', x: src.x + .5, y: src.y + .5, item, to: 'player' });
    return;
  }

  // мусор под ногами убираем на ходу
  for (let i = 0; i < G.trash.length; i++) {
    const tr = G.trash[i];
    if (Math.hypot(player.x - tr.x, player.y - tr.y) < .85) {
      G.trash.splice(i, 1); player.act = .1; addXp(3); G.stats.cleaned++;
      emit({ t: 'clean', x: tr.x, y: tr.y });
      return;
    }
  }
}

/* ---------- кассы ---------- */
const QLEN = 3;
/* Покупатель встаёт слева от кассы, кассир — справа, у самого выхода. */
const regQueueTile = (i, k) => ({ x: REG_SLOTS[i].x - 1, y: REG_SLOTS[i].y + k });
const regWorkerTile = (i) => ({ x: REG_SLOTS[i].x + 1, y: REG_SLOTS[i].y });
function syncRegs() { while (regs.length < G.regs) regs.push({ i: regs.length, q: [], t: 0, busy: 0 }); }

function updateRegs(dt) {
  for (const r of regs) {
    const w = regWorkerTile(r.i);
    const byPlayer = near(player, w.x, w.y, .9);
    const manned = byPlayer ||
      G.staff.some(s => s.role === 'cashier' && s.reg === r.i && near(s, w.x, w.y, .85));
    r.manned = manned; r.byPlayer = byPlayer;
    const c = r.q[0];
    if (!manned || !c || !c.atSpot) { r.t = 0; r.busy = 0; continue; }
    r.busy = 1;
    r.t += dt * serveRate();
    while (r.t >= 1 && c.basket.length) {
      r.t -= 1;
      const it = c.basket.pop();
      const v = itemPrice(it) * (c.vip ? 1.75 : 1);
      G.money += v;
      G.stats.sold++; G.stats.earned += v;
      G.stats.byItem[it] = (G.stats.byItem[it] || 0) + 1;
      if (r.byPlayer) G.stats.personal++;
      if (it === G.hot) G.stats.hot++;
      orderProgress(it);
      addXp(Math.max(1, Math.round(v / 12)));
      emit({ t: 'sale', x: c.x, y: c.y, v, item: it, vip: c.vip, hot: it === G.hot });
    }
    if (!c.basket.length) {
      if (c.vip) G.stats.vip++;
      c.state = 'leave'; c.reg = null; c.happy = 1;
      r.q.shift(); r.t = 0; r.busy = 0;
      G.rep = Math.min(100, G.rep + 1);
    }
  }
}

/* ---------- покупатели ---------- */
const SKIN = [0xf1c27d, 0xe0ac69, 0xc68642, 0x8d5524, 0xffdbac];
const SHIRT = [0x4f8cff, 0xff6b6b, 0x7bd389, 0xffd166, 0xc77dff, 0x4ecdc4, 0xff9f68];
const HAIR = [0x3b2f2a, 0x1c1a19, 0x8a5a2b, 0xd9b382, 0x6b4423, 0xa33b3b];
let spawnT = 4;

const stockedShelves = () => G.shelves.filter(s => s.n - s.res > 0);

/* Покупатели приезжают на парковку и идут ко входу пешком. */
const PARKING = () => ({ x: GW + 2.5 + Math.random() * 5, y: 7 + Math.random() * 16 });

function spawnCustomer() {
  if (G.customers.length > 16 || !stockedShelves().length) return;
  // VIP появляется чаще при хорошей репутации: большая корзина, платит ×1.75, но нетерпелив
  const vip = Math.random() < .08 + G.rep / 1000;
  const from = PARKING();
  G.customers.push({
    x: from.x, y: from.y, home: from, speed: (vip ? 2.7 : 2.4) + Math.random() * .7,
    skin: SKIN[(Math.random() * SKIN.length) | 0], shirt: vip ? 0x2b2f45 : SHIRT[(Math.random() * SHIRT.length) | 0],
    hair: HAIR[(Math.random() * HAIR.length) | 0],
    h: .92 + Math.random() * .16, vip,
    basket: [], want: null, need: vip ? 4 + ((Math.random() * 3) | 0) : 1 + ((Math.random() * 3) | 0),
    state: 'arrive', patience: (vip ? 34 : 40) + Math.random() * 25, maxPat: 65, atSpot: false,
    reg: null, takeT: 0, moving: 0, dir: Math.PI, id: Math.random(),
    litter: Math.random() < .45,
    // вор: без охраны иногда уносит корзину мимо кассы
    thief: Math.random() < .06 && G.day > 2,
  });
}
function joinQueue(c) {
  let best = null;
  for (const r of regs) if (r.q.length < QLEN && (!best || r.q.length < best.q.length)) best = r;
  if (!best) return false;
  best.q.push(c); c.reg = best.i; c.state = 'queue'; c.atSpot = false;
  return true;
}
function updateCustomer(c, dt) {
  // дорога от машины до дверей и обратно — терпение в это время не тратится
  if (c.state === 'arrive') {
    if (walkTo(c, DOOR.x, DOOR.y, 0, dt)) c.state = 'shop';
    return;
  }
  if (c.state === 'depart') {
    if (step(c, c.home.x, c.home.y, dt)) c.dead = true;
    return;
  }
  if (c.state !== 'leave') {
    c.patience -= dt;
    if (c.patience <= 0) {
      if (c.reg !== null) { const r = regs[c.reg]; const k = r.q.indexOf(c); if (k >= 0) r.q.splice(k, 1); c.reg = null; }
      if (c.want) { c.want.res = Math.max(0, c.want.res - 1); c.want = null; }
      const lost = c.basket.length;
      c.basket.length = 0; c.state = 'leave'; c.happy = 0;
      G.rep = Math.max(0, G.rep - (lost ? 5 : 2));
      emit({ t: 'angry', x: c.x, y: c.y });
      return;
    }
  }

  if (c.state === 'shop') {
    if (!c.want) {
      const list = stockedShelves();
      if (!list.length) { c.state = c.basket.length ? 'queue0' : 'leave'; return; }
      // выбор с весом: спрос по времени дня и наценка решают, что схватят
      const w = list.map(s => Math.max(.02, appeal(s.item)));
      let r = Math.random() * w.reduce((a, b) => a + b, 0), pick = list[0];
      for (let i = 0; i < list.length; i++) { r -= w[i]; if (r <= 0) { pick = list[i]; break; } }
      // слишком дорого — часть покупателей уходит ни с чем
      if (markup(pick.item) > 1.35 && Math.random() < (markup(pick.item) - 1.35) * 1.6) {
        c.state = c.basket.length ? 'queue0' : 'leave';
        if (!c.basket.length) { G.rep = Math.max(0, G.rep - .5); emit({ t: 'toopricey', x: c.x, y: c.y, item: pick.item }); }
        return;
      }
      c.want = pick; pick.res++;
    }
    const sh = c.want;
    if (walkTo(c, sh.x, sh.y, 1, dt)) {
      c.takeT += dt;
      if (c.takeT > .4) {
        c.takeT = 0;
        if (sh.n > 0 && sh.item) {
          c.basket.push(sh.item); sh.n--;
          emit({ t: 'pick', x: sh.x + .5, y: sh.y + .5, item: sh.item, to: c });
          if (!sh.n) sh.item = null;
        }
        sh.res = Math.max(0, sh.res - 1);
        c.want = null;
        if (c.basket.length >= c.need || !stockedShelves().length) c.state = 'queue0';
      }
    }
  } else if (c.state === 'queue0') {
    if (!c.basket.length) { c.state = 'leave'; return; }
    // вор идёт мимо кассы к выходу, если охранник не поймал
    if (c.thief) {
      const guard = G.staff.find(g => g.role === 'guard');
      if (guard && Math.hypot(guard.x - c.x, guard.y - c.y) < 7) {
        c.thief = false;
        G.stats.caught = (G.stats.caught || 0) + 1;
        emit({ t: 'caught', x: c.x, y: c.y });
      } else {
        const value = c.basket.reduce((a, it) => a + itemPrice(it), 0);
        G.stats.stolen += c.basket.length;
        c.basket.length = 0;
        c.state = 'leave'; c.happy = 0;
        G.rep = Math.max(0, G.rep - 1);
        emit({ t: 'stolen', x: c.x, y: c.y, value });
        return;
      }
    }
    if (!joinQueue(c)) walkTo(c, 29, 10, 0, dt);
  } else if (c.state === 'queue') {
    const r = regs[c.reg];
    const k = r.q.indexOf(c);
    if (k < 0) { c.state = 'queue0'; c.reg = null; return; }
    const t = regQueueTile(c.reg, k);
    c.atSpot = walkTo(c, t.x, t.y, 0, dt);
  } else if (c.state === 'leave') {
    // по дороге к выходу могут бросить мусор
    if (c.litter && Math.random() < dt * .6 && G.trash.length < 24) {
      c.litter = false;
      G.trash.push({ x: c.x, y: c.y, k: (Math.random() * 3) | 0 });
      emit({ t: 'litter', x: c.x, y: c.y });
    }
    if (walkTo(c, DOOR.x, DOOR.y, 0, dt)) c.state = 'depart';
  }
}

/* ---------- персонал ---------- */
function hire(role) {
  G.staff.push({
    role, x: START.x, y: START.y, speed: 3.9, carry: [], dest: null, src: null,
    reg: null, t: 0, hauling: false, moving: 0, dir: 0, id: Math.random(),
  });
  assignRegs();
}
function assignRegs() {
  let i = 0;
  for (const s of G.staff) if (s.role === 'cashier') { s.reg = i % Math.max(1, G.regs); i++; }
}
/* ---------- приоритеты грузчиков ----------
   value    — сначала завалить цеха сырьём, потом вынести готовое, и только потом сырьё на полки
   work     — работать только на цеха (сырьё в цех + готовое из цеха)
   shelves  — тащить всё сразу на полки (старое поведение) */
/* Режимы грузчиков. Можно собрать конвейер: один снимает урожай с огорода,
   второй работает по загону, третий возит готовое из цехов в зал. */
const POLICY = {
  value: {
    n: 'Максимум прибыли', e: '💎', src: 'any', dest: 'auto',
    d: 'Работает везде. Держит полки наполненными, а излишки считает по деньгам: сравнивает цену ' +
      'на прилавке (с учётом товара дня ×' + HOT_MUL + ') с выручкой после переработки и везёт туда, где выгоднее.',
  },
  field: {
    n: 'Участок: огород', e: '🌱', src: 'field', dest: 'work',
    d: 'Снимает урожай с огорода и возит строго в цеха — в зал сырьё не сливает. ' +
      'Подвозит тот ингредиент, которого цеху не хватает, а если цех встал с полным выходом, ' +
      'сам выносит готовое в зал. Когда на участке совсем нечего делать — помогает остальным.',
  },
  pen: {
    n: 'Участок: загон', e: '🐄', src: 'pen', dest: 'work',
    d: 'Обслуживает загон: молоко, яйца и мясо идут строго в цеха. ' +
      'Возит дефицитный ингредиент, разгружает вставшие цеха, а без работы помогает смене.',
  },
  work: {
    n: 'Цеха → полки', e: '🍳', src: 'work', dest: 'shelf',
    d: 'Забирает готовую продукцию из цехов и уносит в зал — цеха не простаивают. ' +
      'Когда выносить нечего, подстрахует смену на других участках.',
  },
  shelves: {
    n: 'Всё на полки', e: '🗄️', src: 'any', dest: 'shelf',
    d: 'Тащит всё подряд сразу в зал, переработку игнорирует.',
  },
};
const POL = (pol) => POLICY[pol] || POLICY.value;
/* цех встал: выход забит, пока не разгрузим — переработка не идёт */
const jammed = (b) => !!DEF[b.t].in && b.out.length >= bCap(b);
/* товар, который вообще ждёт хоть какой-то цех (даже если сейчас он полон) */
const wantsItem = (item) => G.buildings.some(b => DEF[b.t].in && DEF[b.t].in[item]);

/* можно ли этому грузчику брать товар отсюда */
function srcAllowed(b, pol) {
  const src = POL(pol).src;
  if (src === 'any') return true;
  if (src === 'work') return !!DEF[b.t].in;
  // участковый работает по своей зоне и вдобавок разгружает вставшие цеха,
  // иначе готовое зависает в цехе, вход не расходуется и сырьё некуда девать
  return (DEF[b.t].zone === src && !DEF[b.t].in) || jammed(b);
}
const policyOf = (s) => s.policy || G.policy || 'value';
/* Сколько товара сейчас в зале и сколько там должно лежать.
   Правило смены простое и предсказуемое: сначала держим полки наполненными
   (пустой зал = ноль выручки), излишки уже пускаем в переработку. */
const hallStock = () => G.shelves.reduce((n, s) => n + s.n, 0);
const hallTarget = () => Math.max(3, Math.min(10, G.shelves.length));
const hallLow = () => hallStock() < hallTarget();
const storeEmpty = () => hallStock() === 0;

/* Сколько денег принесёт единица сырья, если отдать её в цех.
   Через itemPrice сюда автоматически попадает и «товар дня»: если сегодня
   помидор идёт ×1.7, работник сам посчитает, что выгоднее — цех или прилавок. */
function workshopFor(item) {
  let best = null, bestV = 0;
  for (const b of G.buildings) {
    if (!acceptsInput(b, item)) continue;
    const d = DEF[b.t];
    const units = Object.values(d.in).reduce((a, v) => a + v, 0);
    const v = itemPrice(d.out) / units;
    if (v > bestV) { bestV = v; best = b; }
  }
  return best ? { b: best, v: bestV } : null;
}
/* Что выгоднее для этого товара: переработка или сразу на полку. */
function bestUse(item, pol) {
  const direct = itemPrice(item);
  const w = workshopFor(item);
  const mode = POL(pol).dest;
  if (mode === 'shelf') return { kind: 'shelf', v: direct, alt: w };
  // участковый грузчик всегда сначала пробует цех — так и строится конвейер
  if (mode === 'work') return w ? { kind: 'work', v: w.v, b: w.b } : { kind: 'shelf', v: direct };
  if (!G.shelves.length) return w ? { kind: 'work', v: w.v, b: w.b } : { kind: 'shelf', v: direct };
  if (w && w.v > direct && !hallLow()) return { kind: 'work', v: w.v, b: w.b };
  return { kind: 'shelf', v: direct, alt: w };
}

function destOk(d, item, pol) {
  if (!d) return false;
  if (d.t) return POL(pol).dest !== 'shelf' && acceptsInput(d, item);
  return (d.item === null || d.item === item) && d.n < shelfCap(d);
}
function findDest(item, pol) {
  const use = bestUse(item, pol);
  if (use && use.kind === 'work') return use.b;
  // участковый не ищет полку для сырья, которое ждут цеха: пусть лучше
  // возит другой ингредиент или ждёт, чем сливает переработку в зал
  if (POL(pol).dest === 'work' && wantsItem(item)) return null;
  let empty = null;
  for (const sh of G.shelves) {
    if (sh.item === item && sh.n < shelfCap(sh)) return sh;
    if (sh.item === null && !empty) empty = sh;
  }
  // полок нет или все заняты — тогда хотя бы в цех
  return empty || (use && use.alt ? use.alt.b : null);
}
// куда деть хоть что-то из рюкзака
function findDestForAny(carry, pol) {
  for (const it of carry) { const d = findDest(it, pol); if (d) return d; }
  return null;
}
/* Ценность рейса в рублях за единицу товара — по ней и выбираем, за что взяться.
   Учитывает цену товара дня, простой цеха и пустой торговый зал. */
function jobValue(b, pol) {
  const item = b.out[b.out.length - 1];
  const d = DEF[b.t];
  const use = bestUse(item, pol);
  if (!use) return -1;
  let v = use.v;
  if (use.kind === 'work' && use.b && isScarce(use.b, item)) v *= 1.6;   // цех ждёт именно это
  if (d.in && b.out.length >= bCap(b)) v *= 1.8;              // цех встал, пока не разгрузим
  if (hallLow()) v *= use.kind === 'shelf' ? 2.4 : .5;      // полупустой зал важнее переработки
  if (storeEmpty() && use.kind === 'shelf') v *= 2;         // совсем пусто — бегом на полку
  return v;
}

function releaseSrc(s) { if (s.src && s.src.res === s) s.src.res = null; s.src = null; }

function updateStaff(s, dt) {
  if (s.role === 'guard') {
    // держится рядом с самым «подозрительным» покупателем, иначе патрулирует зал
    const t = G.customers.find(c => c.thief && c.basket.length) ||
      G.customers.find(c => c.state === 'shop' && c.basket.length);
    if (t) { walkTo(s, Math.floor(t.x), Math.floor(t.y), 1, dt); return; }
    s.pt = (s.pt || 0) + dt;
    const spots = [[22, 4], [28, 8], [22, 14], [28, 17], [30, 11]];
    const p = spots[Math.floor(s.pt / 6) % spots.length];
    walkTo(s, p[0], p[1], 0, dt);
    return;
  }
  if (s.role === 'cleaner') {
    let best = null, bd = 1e9;
    for (const tr of G.trash) {
      const d = Math.hypot(tr.x - s.x, tr.y - s.y);
      if (d < bd) { bd = d; best = tr; }
    }
    if (!best) { walkTo(s, 20, 10, 0, dt); return; }
    s.dir = Math.atan2(best.x - s.x, best.y - s.y);
    if (walkTo(s, Math.floor(best.x), Math.floor(best.y), 0, dt) || bd < .8) {
      s.t += dt;
      if (s.t > .35) {
        s.t = 0;
        const i = G.trash.indexOf(best);
        if (i >= 0) { G.trash.splice(i, 1); G.stats.cleaned++; emit({ t: 'clean', x: best.x, y: best.y }); }
      }
    }
    return;
  }
  if (s.role === 'cashier') {
    if (s.reg === null || s.reg >= G.regs) assignRegs();
    const w = regWorkerTile(s.reg || 0);
    walkTo(s, w.x, w.y, 0, dt);
    return;
  }
  /* ---- грузчик: один рейс = один товар ----
     План (откуда, что, куда) фиксируется в начале рейса и не пересчитывается на ходу.
     Раньше работник добирал разное из нескольких мест и метался между зонами. */
  const pol = policyOf(s);

  // цель могли снести — тогда план недействителен
  if (s.job) {
    if (s.job.src && !G.buildings.includes(s.job.src)) s.job.src = null;
    const d = s.job.dest;
    if (d && !G.buildings.includes(d) && !G.shelves.includes(d)) s.job.dest = null;
  }

  if (!s.job) {
    if (s.carry.length) {                       // остался груз без плана — отнести в зал
      const item = s.carry[0];
      const dest = findDest(item, pol) || findDest(item, 'shelves');
      if (!dest) { s.moving = 0; return; }
      s.job = { src: null, item, dest }; s.phase = 'put';
    } else {
      s.job = planRoute(s, pol);
      if (!s.job) { s.moving = 0; s.t = 0; return; }
      s.job.src.res = s; s.src = s.job.src; s.phase = 'take';
    }
  }
  const j = s.job;
  s.dest = j.dest;

  if (s.phase === 'take') {
    if (!j.src || !j.src.out.includes(j.item) || s.carry.length >= staffCarry()) {
      releaseSrc(s);
      if (s.carry.length) s.phase = 'put'; else s.job = null;
      return;
    }
    if (walkTo(s, j.src.x, j.src.y, 1, dt)) {
      s.t += dt;
      if (s.t > staffAct()) {
        s.t = 0;
        const i = j.src.out.lastIndexOf(j.item);   // берём только свой товар
        if (i >= 0) {
          j.src.out.splice(i, 1);
          s.carry.push(j.item);
          G.stats.picked++;
          emit({ t: 'pick', x: j.src.x + .5, y: j.src.y + .5, item: j.item, to: s });
        }
      }
    }
    return;
  }

  // фаза доставки: везём весь груз в одну точку, пересчитываем цель только если она заполнилась
  releaseSrc(s);
  if (!destOk(j.dest, j.item, pol)) {
    j.dest = findDest(j.item, pol);
    // участковый не тащит в зал то, что ждут цеха: лучше подождать, пока освободится.
    // Но если ожидание затянулось, товар всё же уходит на полку — иначе смена встанет.
    const strict = POL(pol).dest === 'work' && wantsItem(j.item);
    if (!j.dest && (!strict || (s.wait || 0) > 8)) j.dest = findDest(j.item, 'shelves');
    if (!j.dest) { s.wait = (s.wait || 0) + dt; s.moving = 0; s.t = 0; return; }
  }
  s.wait = 0;
  const d = j.dest;
  if (walkTo(s, d.x, d.y, 1, dt)) {
    s.t += dt;
    if (s.t > staffAct()) {
      s.t = 0;
      if (destOk(d, j.item, pol) || destOk(d, j.item, 'shelves')) {
        takeFromCarry(s.carry, j.item);
        if (d.t) d.stock[j.item] = (d.stock[j.item] || 0) + 1;
        else { d.item = j.item; d.n++; G.stats.stocked++; }
        emit({ t: 'drop', x: d.x + .5, y: d.y + .5, item: j.item, from: s });
      }
      if (!s.carry.length) { s.job = null; s.dest = null; }   // рейс закрыт
    }
  }
}

/* Планируем рейс целиком: что взять, где и куда отвезти.
   Сначала ищем работу на своём участке, если её нет — помогаем остальным. */
function planRoute(s, pol) {
  const pick = (strict) => {
    let best = null, bestScore = 0;
    for (const b of G.buildings) {
      if (!b.out.length || (b.res && b.res !== s)) continue;
      if (strict && !srcAllowed(b, pol)) continue;
      const item = b.out[b.out.length - 1];
      // сырьё, которое ждут цеха, участковый в зал не планирует
      const keepForWork = POL(pol).dest === 'work' && wantsItem(item);
      const dest = findDest(item, pol) || (keepForWork ? null : findDest(item, 'shelves'));
      if (!dest) continue;
      const v = jobValue(b, pol);
      if (v <= 0) continue;
      const toSrc = Math.hypot(b.x - s.x, b.y - s.y);
      const toDest = Math.hypot(dest.x - b.x, dest.y - b.y);
      const score = v / (1 + toSrc * .05 + toDest * .03);
      if (score > bestScore) { bestScore = score; best = { src: b, item, dest }; }
    }
    return best;
  };
  return pick(true) || pick(false);
}

/* ---------- транспортёр ----------
   Апгрейд «лента»: пока ты бегаешь по ферме, готовая продукция из цехов сама
   уезжает в зал. Не заменяет грузчиков — берёт по одной позиции за такт,
   зато никогда не устаёт и работает через всю карту. */
function updateBelt(dt) {
  const lvl = G.upg.belt || 0;
  if (!lvl) return;
  G.beltT = (G.beltT || 0) - dt;
  if (G.beltT > 0) return;
  G.beltT = Math.max(1.4, 6 * Math.pow(.78, lvl - 1));
  // берём из самого забитого цеха — он же и простаивает
  let src = null;
  for (const b of G.buildings) {
    if (!DEF[b.t].in || !b.out.length) continue;
    if (!src || b.out.length > src.out.length) src = b;
  }
  if (!src) return;
  const item = src.out[src.out.length - 1];
  let dest = null, empty = null;
  for (const sh of G.shelves) {
    if (sh.item === item && sh.n < shelfCap(sh)) { dest = sh; break; }
    if (sh.item === null && !empty) empty = sh;
  }
  dest = dest || empty;
  if (!dest) return;
  src.out.pop();
  if (!dest.item) { dest.item = item; dest.n = 0; }
  dest.n++; dest.age = 0;
  G.stats.stocked++;
  emit({ t: 'belt', item, x: src.x + .5, y: src.y + .5, tx: dest.x + .5, ty: dest.y + .5 });
}

/* ---------- порча товара ----------
   Скоропортящееся не лежит вечно: просроченное уходит в мусор и бьёт по репутации.
   Значит заваливать полки впрок невыгодно, а холодные ряды надо ротировать. */
function updateSpoilage(dt) {
  for (const sh of G.shelves) {
    if (!sh.item || !sh.n) { sh.age = 0; continue; }
    const life = shelfLife(sh.item);
    if (!life) { sh.age = 0; continue; }            // крупа и картошка не портятся
    sh.age += dt;
    if (sh.age < life) continue;
    sh.age = 0;
    sh.n--;
    G.stats.spoiled++;
    G.rep = Math.max(0, G.rep - .6);
    emit({ t: 'spoil', x: sh.x + .5, y: sh.y + .5, item: sh.item });
    if (!sh.n) sh.item = null;
  }
}
/* Срок годности на полке: холодильные витрины продлевают его. */
const shelfLife = (item) => ITEMS[item].life * (1 + .6 * (G.upg.fridge || 0));
/* Свежесть верхней единицы: 1 — только что выложили, 0 — сейчас испортится. */
const freshness = (sh) => {
  const life = sh.item ? shelfLife(sh.item) : 0;
  return life ? Math.max(0, 1 - sh.age / life) : 1;
};

/* ---------- заказы ----------
   Раз в несколько минут приходит контракт на то, что магазин умеет продавать.
   Выполнил вовремя — крупная премия, просрочил — просто исчезает. */
function newOrder() {
  const pool = [...new Set(G.buildings.map(b => DEF[b.t].out))].filter(i => ITEMS[i]);
  if (pool.length < 1 || !G.shelves.length) return;
  const item = pool[(Math.random() * pool.length) | 0];
  const base = Math.max(4, Math.round(6 + G.level * 1.2));
  const need = base + ((Math.random() * 4) | 0);
  G.order = {
    item, need, done: 0,
    left: ORDER_TIME,
    pay: Math.round(itemPrice(item) * need * 1.9 + 400),
  };
  emit({ t: 'order', item, need, pay: G.order.pay });
}
function updateOrder(dt) {
  if (!G.order) {
    G.orderCd = (G.orderCd || 60) - dt;
    if (G.orderCd <= 0) { G.orderCd = 150 + Math.random() * 120; newOrder(); }
    return;
  }
  G.order.left -= dt;
  if (G.order.left <= 0) {
    emit({ t: 'order-fail', item: G.order.item });
    G.order = null;
    G.orderCd = 90;
  }
}
/* Каждая продажа приближает выполнение заказа. */
function orderProgress(item) {
  const o = G.order;
  if (!o || o.item !== item) return;
  o.done++;
  if (o.done < o.need) return;
  G.money += o.pay;
  G.stats.orders++;
  addXp(40);
  emit({ t: 'order-done', item, pay: o.pay });
  G.order = null;
  G.orderCd = 120;
  save(true);
}

/* ---------- что не работает ----------
   На карте 34x22 глазами всё не отследить: собираем список проблем,
   по каждой можно сразу прыгнуть к объекту. */
function problems() {
  const list = [];
  const near2 = (x, y) => ({ x, y });

  // касса без кассира, а в очереди люди
  for (const r of regs) {
    if (r.q.length && !r.manned) {
      const w = regWorkerTile(r.i);
      list.push({ k: 'reg', t: `Касса без кассира — ждут ${r.q.length}`, x: w.x + .5, y: w.y + .5, bad: 2 });
    }
  }
  // пустой зал / пустые полки
  const empty = G.shelves.filter(s => !s.n);
  if (!G.shelves.length) list.push({ k: 'shelf', t: 'Нет ни одной полки', x: START.x, y: START.y, bad: 2 });
  else if (empty.length === G.shelves.length)
    list.push({ k: 'shelf', t: 'Все полки пустые — покупатели не придут', x: empty[0].x + .5, y: empty[0].y + .5, bad: 2 });
  else if (empty.length)
    list.push({ k: 'shelf', t: `Пустых полок: ${empty.length}`, x: empty[0].x + .5, y: empty[0].y + .5, bad: 0 });

  // цех стоит: нет сырья или забит выход
  for (const b of G.buildings) {
    const d = DEF[b.t];
    if (!d.in) continue;
    if (b.out.length >= bCap(b))
      list.push({ k: 'jam', t: `${d.n}: выход забит, не разгружают`, x: b.x + .5, y: b.y + .5, bad: 1 });
    else if (!b.working) {
      const miss = Object.keys(d.in).filter(k => (b.stock[k] || 0) < d.in[k]).map(k => ITEMS[k].e).join('');
      list.push({ k: 'idle', t: `${d.n}: нет сырья ${miss}`, x: b.x + .5, y: b.y + .5, bad: 1 });
    }
  }
  // урожай гниёт на грядке
  const full = G.buildings.filter(b => !DEF[b.t].in && b.out.length >= bCap(b));
  if (full.length) list.push({ k: 'harvest', t: `Урожай не собирают: ${full.length} шт`, x: full[0].x + .5, y: full[0].y + .5, bad: 1 });

  // мусор и репутация
  if (G.trash.length >= 4)
    list.push({ k: 'trash', t: `Мусор в зале: ${G.trash.length}`, x: G.trash[0].x, y: G.trash[0].y, bad: 1 });
  if (G.rep < 70) list.push({ k: 'rep', t: `Репутация ${Math.round(G.rep)}% — людей приходит меньше`, x: START.x, y: START.y, bad: 2 });

  // товар, который вот-вот испортится
  const rot = G.shelves.filter(s => s.n && ITEMS[s.item] && ITEMS[s.item].life && freshness(s) < .25);
  if (rot.length) list.push({ k: 'rot', t: `Скоро испортится: ${rot.map(s => ITEMS[s.item].e).join('')}`, x: rot[0].x + .5, y: rot[0].y + .5, bad: 1 });

  // зарплата не по карману
  if (payroll() > G.money) list.push({ k: 'pay', t: 'Денег не хватит на зарплату', x: START.x, y: START.y, bad: 2 });

  return list.sort((a, b) => b.bad - a.bad);
}

/* ---------- экономика ---------- */
// «товар дня» — выбирается из того, что магазин реально умеет производить
function pickHot() {
  const pool = [...new Set(G.buildings.map(b => DEF[b.t].out))];
  if (!pool.length) pool.push('tomato');
  G.hot = pool[(Math.random() * pool.length) | 0];
}

function endDay() {
  // запоминаем итог прошедшего дня для графика
  const prev = G.stats.dayMark || { sold: 0, earned: 0 };
  G.stats.daily = (G.stats.daily || []).concat([{
    d: G.day,
    sold: G.stats.sold - prev.sold,
    earned: Math.round(G.stats.earned - prev.earned),
  }]).slice(-30);
  G.stats.dayMark = { sold: G.stats.sold, earned: G.stats.earned };

  G.day++;
  pickHot();
  const sal = payroll();
  if (sal) {
    if (G.money >= sal) { G.money -= sal; emit({ t: 'day', sal, ok: true }); }
    else { G.money = 0; G.rep = Math.max(0, G.rep - 15); emit({ t: 'day', sal, ok: false }); }
  } else emit({ t: 'day', sal: 0, ok: true });
  emit({ t: 'hot', item: G.hot });
  save();
}
function checkQuest() {
  const q = QUESTS[G.quest];
  if (q && q.c(G.stats, G)) {
    G.money += q.r; G.quest++;
    emit({ t: 'quest', r: q.r, d: q.d });
    const ch = chapterAt(G.quest);            // задание закрыло главу — рассказываем следующую
    if (ch) emit({ t: 'chapter', n: ch.n, d: ch.t });
    save();
  }
}

/* Оформление: сохраняем и просим сцену перекраситься. */
function setBrand(key, val) {
  G.brand[key] = val;
  if (key === 'name') G.brand.name = String(val).slice(0, 22).toUpperCase() || 'МОЙ СУПЕРМАРКЕТ';
  save(true);
  emit({ t: 'brand' });
}

/* ---------- поставщики ----------
   Не производишь сам — купи партию. Дороже, чем растить, зато сразу и без ожидания. */
const SUPPLY_LOT = 5;
/* Оптовик — не лазейка, а страховка. Два ограничения держат экономику супермаркета:
   1) везёт только сырьё (то, что растёт и добывается) — готовое делай в цехах сам;
   2) лот дороже максимальной розницы (наценка ×1.8), поэтому перепродать в лоб убыточно —
      партия окупается только через переработку или закрытый заказ. */
const SUPPLY_MUL = 1.25;
const isRaw = (item) => G.buildings.some(b => DEF[b.t].out === item && !DEF[b.t].in);
/* Цена лота считается от ТЕКУЩЕЙ цены на полке, а не от базовой: как бы игрок ни задрал
   наценку и что бы ни выпало товаром дня, партия всегда дороже, чем её можно продать. */
const supplyCost = (item) => Math.round(itemPrice(item) * SUPPLY_LOT * SUPPLY_MUL + 40);
/* Куда сгрузить партию: сначала цех, который ждёт это сырьё, потом полка. */
function buySupply(item) {
  if (!isRaw(item)) return false;               // готовую продукцию оптовик не привозит
  const c = supplyCost(item);
  if (G.money < c) return false;
  let left = SUPPLY_LOT;
  for (const b of G.buildings) {
    while (left && acceptsInput(b, item)) { b.stock[item] = (b.stock[item] || 0) + 1; left--; }
  }
  for (const sh of G.shelves) {
    if (!left) break;
    if (sh.item && sh.item !== item) continue;
    while (left && sh.n < shelfCap(sh)) { sh.item = item; sh.n++; sh.age = 0; left--; }
  }
  if (left === SUPPLY_LOT) return false;         // некуда сгружать — не берём деньги
  G.money -= c;
  save(true);
  G.stats.supplies = (G.stats.supplies || 0) + 1;
  emit({ t: 'supply', item, n: SUPPLY_LOT - left, cost: c });
  return true;
}

/* ---------- покупки ---------- */
const countOf = (t) => G.buildings.filter(b => b.t === t).length;
const costOf = (t) => Math.round(DEF[t].cost * Math.pow(1.3, countOf(t)));
const shelfCost = () => Math.round(200 * Math.pow(1.45, G.shelves.length - 2));
const regCost = () => Math.round(4000 * Math.pow(3, G.regs - 1));
const staffCost = (r) => Math.round(STAFF[r].cost * Math.pow(1.6, G.staff.filter(s => s.role === r).length));
const upgCost = (k) => Math.round(UPG[k].base * Math.pow(1.85, G.upg[k] || 0));

function buyBuilding(t) {
  const c = costOf(t);
  if (G.money < c) return false;
  const slot = pickSlot(t);
  if (slot < 0) return false;
  G.money -= c;
  const b = newBuilding(t, slot);
  G.buildings.push(b);
  rebuild(); save(true);
  emit({ t: 'build', name: DEF[t].n });
  return true;
}
/* Улучшаем самую отстающую постройку этого типа — так весь ряд растёт ровно. */
function weakestOf(type) {
  let best = null;
  for (const b of G.buildings)
    if (b.t === type && lvlOf(b) < MAX_LVL && (!best || lvlOf(b) < lvlOf(best))) best = b;
  return best;
}
function levelCostOf(type) {
  const b = weakestOf(type);
  return b ? lvlCost(b) : 0;
}
function buyLevel(type) {
  const b = weakestOf(type);
  if (!b) return false;
  const c = lvlCost(b);
  if (G.money < c) return false;
  G.money -= c;
  b.lvl = lvlOf(b) + 1;
  addXp(12);
  save(true);
  emit({ t: 'level-up', name: DEF[type].n, lvl: b.lvl, x: b.x + .5, y: b.y + .5 });
  return true;
}

/* ---------- снос ----------
   Ошибка планировки не должна быть приговором: любую постройку можно снести
   и вернуть половину вложенного — вместе с деньгами за уровни. */
function refundOf(type) {
  const b = weakestOf(type) || G.buildings.find(x => x.t === type);
  if (!b) return 0;
  const cnt = countOf(type);
  let sum = Math.round(DEF[type].cost * Math.pow(1.3, cnt - 1));   // цена последней купленной
  for (let i = 1; i < lvlOf(b); i++) sum += Math.round(DEF[type].cost * 1.6 * Math.pow(2.2, i - 1));
  return Math.round(sum * .5);
}
function sellBuilding(type) {
  const b = weakestOf(type) || G.buildings.find(x => x.t === type);
  if (!b) return false;
  const back = refundOf(type);
  // отвязываем смену, чтобы никто не шёл к снесённому
  for (const s of G.staff) {
    if (s.src === b) s.src = null;
    if (s.dest === b) s.dest = null;
    if (s.job && (s.job.src === b || s.job.dest === b)) s.job = null;
  }
  G.buildings.splice(G.buildings.indexOf(b), 1);
  G.money += back;
  rebuild(); save(true);
  emit({ t: 'sell', name: DEF[type].n, back, x: b.x + .5, y: b.y + .5 });
  return true;
}

function buyShelf() {
  const c = shelfCost();
  if (G.money < c || G.shelves.length >= SHELF_SLOTS.length) return false;
  G.money -= c;
  const s = newShelf(G.shelves.length);
  G.shelves.push(s);
  rebuild(); save(true);
  emit({ t: 'build', name: 'Полка' });
  return true;
}
function buyReg() {
  const c = regCost();
  if (G.money < c || G.regs >= REG_SLOTS.length) return false;
  G.money -= c; G.regs++; syncRegs(); assignRegs(); rebuild(); save(true);
  emit({ t: 'build', name: 'Касса' });
  return true;
}
function buyStaff(r) {
  const c = staffCost(r);
  if (G.money < c) return false;
  G.money -= c; hire(r); save(true);
  emit({ t: 'build', name: STAFF[r].n });
  return true;
}
function buyUpg(k) {
  const c = upgCost(k);
  if (G.money < c) return false;
  G.money -= c; G.upg[k] = (G.upg[k] || 0) + 1; save(true);
  emit({ t: 'build', name: UPG[k].n + ' ур. ' + G.upg[k] });
  return true;
}

/* ---------- офлайн-доход ----------
   Персонал работает, пока игра закрыта: грузчик носит товар, кассир пробивает.
   Считаем по минимальному «звену» цепочки и режем 4 часами, чтобы не ломать баланс. */
let offlineReport = null;
const OFFLINE_CAP = 4 * 3600;
function offlineIncome(ts) {
  if (!ts) return null;
  const secs = Math.min(OFFLINE_CAP, Math.max(0, (Date.now() - ts) / 1000));
  if (secs < 120) return null;
  const hands = G.staff.filter(s => s.role === 'farmhand').length;
  const cash = Math.min(G.staff.filter(s => s.role === 'cashier').length, G.regs);
  const crew = Math.min(hands, cash);
  if (!crew) return { secs, money: 0, crew: 0 };
  // средняя цена того, что магазин умеет делать
  const outs = [...new Set(G.buildings.map(b => DEF[b.t].out))];
  const avg = outs.length ? outs.reduce((s, i) => s + ITEMS[i].price, 0) / outs.length : 10;
  const perSec = crew * avg * .035 * serveRate() * (.4 + G.rep / 160);
  const gross = perSec * secs;
  const sal = payroll() * (secs / DAY_LEN);
  const money = Math.max(0, gross - sal);
  G.money += money;
  G.stats.earned += gross;
  return { secs, money, crew, sal };
}

/* ---------- сохранение ----------
   Прогресс терять нельзя, поэтому пишем его сразу в несколько мест:
   два чередующихся слота в localStorage (обрыв записи не убьёт целый сейв),
   зеркало в IndexedDB и ручной бэкап файлом. Плюс просим у браузера
   постоянное хранилище, чтобы Safari не вычистил данные «по неактивности». */
const SAVE_KEYS = ['mt3d_save', 'mt3d_save_b'];
const SAVE_VER = 2;
let saveOff = false, saveSlot = 0, lastSaveAt = 0, storageOk = true;

const lsGet = (k) => { try { return localStorage.getItem(k); } catch (e) { storageOk = false; return null; } };
const lsSet = (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { storageOk = false; return false; } };
const lsDel = (k) => { try { localStorage.removeItem(k); } catch (e) { } };

/* минимальная обёртка над IndexedDB — второй носитель на случай чистки localStorage */
function idb(mode, run) {
  return new Promise(res => {
    let done = false;
    const fail = () => { if (!done) { done = true; res(null); } };
    try {
      const req = indexedDB.open('mt3d', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = fail;
      req.onsuccess = () => {
        try {
          const db = req.result;
          const tx = db.transaction('kv', mode);
          const q = run(tx.objectStore('kv'));
          tx.oncomplete = () => { done = true; res(q ? q.result : true); db.close(); };
          tx.onerror = fail; tx.onabort = fail;
        } catch (e) { fail(); }
      };
      setTimeout(fail, 2500);
    } catch (e) { fail(); }
  });
}
const idbSave = (str) => idb('readwrite', st => st.put(str, 'save'));
const idbLoad = () => idb('readonly', st => st.get('save'));

function snapshot() {
  return JSON.stringify({
    v: SAVE_VER, ts: Date.now(),
    money: G.money, day: G.day, dayT: G.dayT, rep: G.rep, regs: G.regs,
    upg: G.upg, quest: G.quest, stats: G.stats,
    level: G.level, xp: G.xp, hot: G.hot, trash: G.trash,
    policy: G.policy, sp: G.staff.map(s => s.policy || null), price: G.price, order: G.order, brand: G.brand,
    noTake: G.noTake, riding: G.riding,
    b: G.buildings.map(b => ({ t: b.t, s: b.slot, st: b.stock, o: b.out, l: b.lvl || 1 })),
    sh: G.shelves.map(s => ({ s: s.slot, i: s.item, n: s.n })),
    st: G.staff.map(s => s.role),
  });
}

function save(force) {
  if (saveOff) return;
  const str = snapshot();
  // пишем по очереди в два слота: если запись оборвётся, второй останется целым
  lsSet(SAVE_KEYS[saveSlot % 2], str);
  saveSlot++;
  lastSaveAt = Date.now();
  if (force || saveSlot % 2 === 0) idbSave(str);      // зеркало: спасает, если localStorage вычистят
}

function parseSave(raw) {
  if (!raw) return null;
  try {
    const d = JSON.parse(raw);
    return (d && typeof d.money === 'number' && Array.isArray(d.b)) ? d : null;   // проверка целостности
  } catch (e) { return null; }
}

/* Берём самый свежий целый сейв из всех источников. */
async function bestSave() {
  const all = SAVE_KEYS.map(k => parseSave(lsGet(k)));
  const fromIdb = parseSave(await idbLoad());
  if (fromIdb) all.push(fromIdb);
  let best = null;
  for (const d of all) if (d && (!best || (d.ts || 0) > (best.ts || 0))) best = d;
  // если localStorage потерялся, а IndexedDB уцелел — сразу восстанавливаем оба слота
  if (best && !SAVE_KEYS.some(k => lsGet(k))) lsSet(SAVE_KEYS[0], JSON.stringify(best));
  return best;
}

function applySave(d) {
  if (!d) return false;
  try {
    // старые сейвы без новых полей грузятся как есть — значения берём по умолчанию
    Object.assign(G, {
      money: d.money, day: d.day, dayT: d.dayT || 0, rep: d.rep, regs: d.regs,
      upg: Object.assign({ bag: 0, boots: 0, fert: 0, register: 0, ads: 0, shelf: 0, crewBag: 0, crewFeet: 0, crewSkill: 0, payroll: 0 }, d.upg),
      quest: d.quest, stats: Object.assign(G.stats, d.stats),
      level: d.level || 1, xp: d.xp || 0, hot: d.hot || 'tomato', trash: d.trash || [],
      policy: d.policy || 'value', price: d.price || {}, order: d.order || null,
      brand: Object.assign({ name: 'МОЙ СУПЕРМАРКЕТ', wall: 0, trim: 0, floor: 0 }, d.brand),
      noTake: d.noTake || {}, riding: !!d.riding,
    });
    // Старые сейвы хранят слоты прежней планировки — раскладываем заново по зонам.
    G.buildings = [];
    for (const x of d.b) {
      if (!DEF[x.t]) continue;
      const slot = pickSlot(x.t);
      if (slot < 0) continue;
      const b = newBuilding(x.t, slot);
      b.stock = x.st || {}; b.out = x.o || []; b.lvl = x.l || 1;
      G.buildings.push(b);
    }
    G.shelves = (d.sh || []).slice(0, SHELF_SLOTS.length).map((x, i) => {
      const s = newShelf(i); s.item = x.i; s.n = x.n; return s;
    });
    G.staff = [];
    (d.st || []).forEach((r, i) => {
      if (STAFF[r]) { hire(r); G.staff[G.staff.length - 1].policy = (d.sp || [])[i] || null; }
    });
    offlineReport = offlineIncome(d.ts);
    return true;
  } catch (e) { return false; }
}

/* ---------- ручной бэкап ---------- */
function exportSave() {
  const blob = new Blob([snapshot()], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `supermarket-save-day${G.day}.json`;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function importSave(text) {
  const d = parseSave(text);
  if (!d) return false;
  // Импорт должен победить: иначе автосохранение при перезагрузке вернёт
  // текущий прогресс, а сравнение по времени выберет местный, более свежий сейв.
  saveOff = true;
  d.ts = Date.now();
  const str = JSON.stringify(d);
  lsSet(SAVE_KEYS[0], str);
  lsSet(SAVE_KEYS[1], str);
  idbSave(str);
  return true;
}

function resetGame() {
  saveOff = true;                       // иначе выгрузка страницы вернёт старое состояние
  SAVE_KEYS.forEach(lsDel);
  idb('readwrite', st => st.delete('save')).then(() => location.reload());
  setTimeout(() => location.reload(), 800);
}

/* ---------- главный тик ---------- */
function simUpdate(dt, input) {
  G.dayT += dt;
  if (G.dayT >= DAY_LEN) { G.dayT -= DAY_LEN; endDay(); }

  movePlayer(input.x, input.y, dt, input.look);
  playerInteract(dt);
  for (const b of G.buildings) updateBuilding(b, dt);
  for (const s of G.staff) { s.speed = staffSpeed(); updateStaff(s, dt); }

  spawnT -= dt * (1 + .25 * G.upg.ads) * (0.4 + G.rep / 100);
  if (spawnT <= 0) { spawnT = 2.6 + Math.random() * 2.1; spawnCustomer(); }

  updateSpoilage(dt);
  updateBelt(dt);
  updateOrder(dt);
  for (const c of G.customers) updateCustomer(c, dt);
  G.customers = G.customers.filter(c => !c.dead);
  updateRegs(dt);
  // грязный магазин отпугивает покупателей
  if (G.trash.length) G.rep = Math.max(0, G.rep - dt * .012 * G.trash.length);
  checkQuest();
}

async function simInit() {
  // просим постоянное хранилище — иначе Safari чистит данные «по неактивности»
  try { if (navigator.storage && navigator.storage.persist) await navigator.storage.persist(); } catch (e) { }

  const d = await bestSave();
  if (!applySave(d)) {
    G.buildings.push(newBuilding('tomato', 0));
    G.shelves.push(newShelf(0), newShelf(1));
  }
  syncRegs(); assignRegs(); rebuild();
  save(true);                      // сразу фиксируем состояние во всех носителях
}

/* Сохраняем на любом событии ухода: beforeunload на iOS часто не срабатывает. */
const saveNow = () => save(true);
addEventListener('beforeunload', saveNow);
addEventListener('pagehide', saveNow);
addEventListener('blur', () => save());
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
setInterval(() => save(), 6000);
const saveAgeSec = () => Math.max(0, Math.round((Date.now() - lastSaveAt) / 1000));
