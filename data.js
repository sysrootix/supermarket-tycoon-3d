/* Контент, баланс и планировка. Сетка: 1 клетка = 1 юнит в 3D. */
const GW = 34, GH = 22;

const ITEMS = {
  tomato:   { n: 'Помидор',  e: '🍅', price: 10,  c: 0xe4453a, m: 'sphere' },
  cucumber: { n: 'Огурец',   e: '🥒', price: 16,  c: 0x4aa04e, m: 'capsule' },
  potato:   { n: 'Картофель', e: '🥔', price: 14, c: 0xc9a15a, m: 'egg' },
  wheat:    { n: 'Пшеница',  e: '🌾', price: 12,  c: 0xdfb445, m: 'bundle' },
  apple:    { n: 'Яблоко',   e: '🍎', price: 20,  c: 0xd6342f, m: 'sphere' },
  egg:      { n: 'Яйцо',     e: '🥚', price: 22,  c: 0xf6efe2, m: 'egg' },
  milk:     { n: 'Молоко',   e: '🥛', price: 28,  c: 0xf3f7ff, m: 'carton' },
  meat:     { n: 'Мясо',     e: '🥩', price: 42,  c: 0xd9707c, m: 'slab' },
  salad:    { n: 'Салат',    e: '🥗', price: 60,  c: 0x6cc46f, m: 'bowl' },
  fries:    { n: 'Картошка фри', e: '🍟', price: 72, c: 0xf0b429, m: 'fries' },
  bread:    { n: 'Хлеб',     e: '🥖', price: 48,  c: 0xc98a4b, m: 'loaf' },
  juice:    { n: 'Сок',      e: '🧃', price: 88,  c: 0xff9f43, m: 'carton' },
  cheese:   { n: 'Сыр',      e: '🧀', price: 95,  c: 0xf2c14e, m: 'wedge' },
  steak:    { n: 'Стейк',    e: '🍖', price: 135, c: 0x8f4b38, m: 'slab' },
  cake:     { n: 'Торт',     e: '🎂', price: 260, c: 0xf2a2c0, m: 'cake' },
  pizza:    { n: 'Пицца',    e: '🍕', price: 430, c: 0xe07a3c, m: 'pizza' },
};

/* zone: field — огород, pen — загон, work — цеха
   in: рецепт (что принести), нет in — производит само по таймеру */
const DEF = {
  tomato:   { n: 'Грядка помидоров', e: '🍅', zone: 'field', cost: 60,    time: 9,  out: 'tomato',   cap: 4, kind: 'plot', d: 'Растит помидоры сама.' },
  cucumber: { n: 'Грядка огурцов',   e: '🥒', zone: 'field', cost: 220,   time: 11, out: 'cucumber', cap: 4, kind: 'plot', d: 'Огурцы дороже помидоров.' },
  potato:   { n: 'Картофельное поле', e: '🥔', zone: 'field', cost: 420,  time: 12, out: 'potato',   cap: 5, kind: 'plot', d: 'Сырьё для фритюра.' },
  wheat:    { n: 'Поле пшеницы',     e: '🌾', zone: 'field', cost: 700,   time: 13, out: 'wheat',    cap: 5, kind: 'plot', d: 'Сырьё для пекарни, торта и пиццы.' },
  apple:    { n: 'Яблоня',           e: '🍎', zone: 'field', cost: 1600,  time: 16, out: 'apple',    cap: 4, kind: 'tree', d: 'Яблоки для сока.' },

  chicken:  { n: 'Курятник',         e: '🐔', zone: 'pen', cost: 900,   time: 12, out: 'egg',  cap: 4, kind: 'coop', d: 'Куры несут яйца.' },
  cow:      { n: 'Корова',           e: '🐄', zone: 'pen', cost: 1800,  time: 15, out: 'milk', cap: 4, kind: 'cow',  d: 'Даёт молоко.' },
  pig:      { n: 'Свинья',           e: '🐖', zone: 'pen', cost: 4200,  time: 19, out: 'meat', cap: 3, kind: 'pig',  d: 'Даёт мясо для гриля.' },

  saladbar: { n: 'Салат-бар',    e: '🥗', zone: 'work', cost: 1400,  time: 6,  cap: 3, in: { tomato: 1, cucumber: 1 },        out: 'salad',  kind: 'machine', ac: 0x6cc46f, d: 'Помидор + огурец → салат.' },
  bakery:   { n: 'Пекарня',      e: '🥖', zone: 'work', cost: 2400,  time: 7,  cap: 3, in: { wheat: 2 },                      out: 'bread',  kind: 'machine', ac: 0xd8a05a, d: '2 пшеницы → хлеб.' },
  fryer:    { n: 'Фритюрница',   e: '🍟', zone: 'work', cost: 3600,  time: 7,  cap: 3, in: { potato: 2 },                     out: 'fries',  kind: 'machine', ac: 0xf0b429, d: '2 картошки → фри.' },
  juicer:   { n: 'Соковыжималка', e: '🧃', zone: 'work', cost: 4800, time: 8,  cap: 3, in: { apple: 2 },                      out: 'juice',  kind: 'machine', ac: 0xff9f43, d: '2 яблока → сок.' },
  dairy:    { n: 'Сыроварня',    e: '🧀', zone: 'work', cost: 6000,  time: 9,  cap: 3, in: { milk: 2 },                       out: 'cheese', kind: 'machine', ac: 0xf2c14e, d: '2 молока → сыр.' },
  grill:    { n: 'Гриль',        e: '🔥', zone: 'work', cost: 9000,  time: 8,  cap: 3, in: { meat: 1 },                       out: 'steak',  kind: 'machine', ac: 0xff7043, d: 'Мясо → стейк. Очень выгодно.' },
  cakeshop: { n: 'Кондитерская', e: '🎂', zone: 'work', cost: 20000, time: 12, cap: 2, in: { milk: 1, egg: 2, wheat: 1 },     out: 'cake',   kind: 'machine', ac: 0xf2a2c0, d: 'Дорогой десерт.' },
  pizzeria: { n: 'Пиццерия',     e: '🍕', zone: 'work', cost: 45000, time: 14, cap: 2, in: { cheese: 1, tomato: 2, wheat: 1 }, out: 'pizza', kind: 'machine', ac: 0xe07a3c, d: 'Вершина меню: 430 ₽ за штуку.' },
};

const STAFF = {
  farmhand: { n: 'Грузчик', e: '🧑‍🌾', cost: 1200, salary: 90,  c: 0xffb703, d: 'Сам собирает урожай, носит в цеха и на полки.' },
  cashier:  { n: 'Кассир',  e: '🧑‍💼', cost: 2500, salary: 180, c: 0xc77dff, d: 'Встаёт за свободную кассу и пробивает сам.' },
  cleaner:  { n: 'Уборщик', e: '🧹', cost: 1800, salary: 120, c: 0x4ecdc4, d: 'Убирает мусор за покупателями, держит репутацию.' },
};

/* g: 'me' — про игрока, 'crew' — про персонал, 'shop' — про магазин */
const UPG = {
  bag:      { n: 'Рюкзак',        e: '🎒', g: 'me',   base: 400,  d: '+2 к переносу товаров.' },
  boots:    { n: 'Кроссовки',     e: '👟', g: 'me',   base: 500,  d: '+12% к скорости бега.' },

  crewBag: { n: 'Тележки для персонала', e: '🛒', g: 'crew', base: 1500, d: '+3 к переносу каждому грузчику — меньше ходок.' },
  crewFeet: { n: 'Обувь для смены',      e: '🥾', g: 'crew', base: 1800, d: '+12% к скорости всего персонала.' },
  crewSkill: { n: 'Обучение смены',      e: '🎓', g: 'crew', base: 2600, d: '−15% времени на каждую операцию: быстрее берут и выкладывают.' },
  payroll: { n: 'Оптимизация ФОТ',       e: '📊', g: 'crew', base: 3200, d: '−12% к зарплатам (до −60%).' },

  fert:     { n: 'Удобрения',     e: '🧪', g: 'shop', base: 900,  d: '−10% ко времени производства.' },
  shelf:    { n: 'Стеллажи',      e: '🗄️', g: 'shop', base: 1200, d: '+2 к вместимости каждой полки.' },
  register: { n: 'Сканер',        e: '📟', g: 'shop', base: 800,  d: '+25% к скорости кассы.' },
  ads:      { n: 'Реклама',       e: '📣', g: 'shop', base: 1000, d: '+25% покупателей и +5% к цене.' },
};

const QUESTS = [
  { d: 'Собери первый урожай',            c: (s) => s.picked >= 1,      r: 100 },
  { d: 'Выложи товар на полку',           c: (s) => s.stocked >= 1,     r: 150 },
  { d: 'Продай 5 товаров',                c: (s) => s.sold >= 5,        r: 250 },
  { d: 'Пробей 10 покупателей лично',     c: (s) => (s.personal || 0) >= 10, r: 350 },
  { d: 'Заработай 500 ₽',                 c: (s) => s.earned >= 500,    r: 300 },
  { d: 'Построй 3 грядки',                c: (s, G) => G.buildings.filter(b => DEF[b.t].zone === 'field').length >= 3, r: 400 },
  { d: 'Открой 4 полки',                  c: (s, G) => G.shelves.length >= 4,   r: 500 },
  { d: 'Наними сотрудника',               c: (s, G) => G.staff.length >= 1,     r: 800 },
  { d: 'Продай 5 товаров дня',            c: (s) => (s.hot || 0) >= 5,  r: 900 },
  { d: 'Продай 50 товаров',               c: (s) => s.sold >= 50,       r: 1000 },
  { d: 'Построй первый цех',              c: (s, G) => G.buildings.some(b => DEF[b.t].in), r: 1500 },
  { d: 'Обслужи VIP-покупателя',          c: (s) => (s.vip || 0) >= 1,  r: 1800 },
  { d: 'Заработай 10 000 ₽',              c: (s) => s.earned >= 10000,  r: 2000 },
  { d: 'Заведи животное в загоне',        c: (s, G) => G.buildings.some(b => DEF[b.t].zone === 'pen'), r: 2500 },
  { d: 'Открой вторую кассу',             c: (s, G) => G.regs >= 2,     r: 3000 },
  { d: 'Убери 10 мусорок',                c: (s) => (s.cleaned || 0) >= 10, r: 3500 },
  { d: 'Прокачай постройку до 3 уровня',  c: (s, G) => G.buildings.some(b => (b.lvl || 1) >= 3), r: 4000 },
  { d: 'Продай первый стейк',             c: (s) => (s.byItem.steak || 0) >= 1, r: 5000 },
  { d: 'Достигни 5 уровня магазина',      c: (s, G) => G.level >= 5,    r: 6000 },
  { d: 'Наними 3 сотрудников',            c: (s, G) => G.staff.length >= 3, r: 7000 },
  { d: 'Собери 200 урожая',               c: (s) => s.picked >= 200,    r: 8000 },
  { d: 'Заведи уборщика',                 c: (s, G) => G.staff.some(x => x.role === 'cleaner'), r: 9000 },
  { d: 'Три разных цеха в работе',        c: (s, G) => new Set(G.buildings.filter(b => DEF[b.t].in).map(b => b.t)).size >= 3, r: 12000 },
  { d: 'Заработай 100 000 ₽',             c: (s) => s.earned >= 100000, r: 20000 },
  { d: 'Продай торт',                     c: (s) => (s.byItem.cake || 0) >= 1,  r: 25000 },
  { d: 'Пробей 100 покупателей лично',    c: (s) => (s.personal || 0) >= 100, r: 28000 },
  { d: 'Открой все 4 кассы',              c: (s, G) => G.regs >= 4,     r: 30000 },
  { d: 'Обслужи 25 VIP-покупателей',      c: (s) => (s.vip || 0) >= 25, r: 35000 },
  { d: 'Открой 16 полок',                 c: (s, G) => G.shelves.length >= 16, r: 40000 },
  { d: 'Достигни 10 уровня магазина',     c: (s, G) => G.level >= 10,   r: 45000 },
  { d: 'Открой пиццерию',                 c: (s, G) => G.buildings.some(b => b.t === 'pizzeria'), r: 60000 },
  { d: 'Прокачай постройку до максимума', c: (s, G) => G.buildings.some(b => (b.lvl || 1) >= 6), r: 70000 },
  { d: 'Продай 1 000 товаров',            c: (s) => s.sold >= 1000,     r: 80000 },
  { d: 'Застрой огород полностью',        c: (s, G) => G.buildings.filter(b => DEF[b.t].zone === 'field').length >= FIELD_SLOTS.length, r: 90000 },
  { d: 'Убери 100 мусорок',               c: (s) => (s.cleaned || 0) >= 100, r: 95000 },
  { d: 'Продай пиццу',                    c: (s) => (s.byItem.pizza || 0) >= 1, r: 120000 },
  { d: 'Собери все виды цехов',           c: (s, G) => Object.keys(DEF).filter(t => DEF[t].in).every(t => G.buildings.some(b => b.t === t)), r: 200000 },
  { d: 'Доживи до 30 дня',                c: (s, G) => G.day >= 30,     r: 250000 },
  { d: 'Достигни 20 уровня магазина',     c: (s, G) => G.level >= 20,   r: 300000 },
  { d: 'Заработай 1 000 000 ₽',           c: (s) => s.earned >= 1000000, r: 500000 },
];


/* ---------- планировка ----------
   Четыре зоны, каждая за своим забором/стеной, между постройками — проход в клетку,
   чтобы подходить к нужной грядке, а не хватать что попало. */
const FIELD_SLOTS = [];                    // огород: x 1..9,  y 1..11
for (const y of [2, 4, 6, 8, 10]) for (const x of [2, 4, 6, 8]) FIELD_SLOTS.push({ x, y });

const PEN_SLOTS = [];                      // загон: x 1..9, y 13..20
for (const y of [14, 16, 18]) for (const x of [2, 4, 6, 8]) PEN_SLOTS.push({ x, y });

const WORK_SLOTS = [];                     // цеха: x 11..17
for (const y of [2, 4, 6, 8, 10, 12, 14, 16, 18]) for (const x of [12, 14, 16]) WORK_SLOTS.push({ x, y });

const SHELF_SLOTS = [];                    // зал: x 19..32
for (const y of [3, 5, 7, 9, 11, 13, 15, 17]) for (const x of [21, 23, 25, 27]) SHELF_SLOTS.push({ x, y });

const REG_SLOTS = [{ x: 31, y: 4 }, { x: 31, y: 8 }, { x: 31, y: 12 }, { x: 31, y: 16 }];
const SLOTS = { field: FIELD_SLOTS, pen: PEN_SLOTS, work: WORK_SLOTS };

const DOOR = { x: 33, y: 10 };
const GATES = [[10, 10], [10, 11], [18, 10], [18, 11], [9, 12]];   // проходы между зонами
const START = { x: 19.5, y: 10.5 };
const DAY_LEN = 180;
