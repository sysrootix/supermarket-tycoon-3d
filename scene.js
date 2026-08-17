/* 3D-сцена: мир, персонажи, свет, день/ночь, камера. */
'use strict';

let renderer, scene, camera, sun, hemi, ambient, sky;
const meshes = { b: new Map(), sh: new Map(), reg: new Map(), cust: new Map(), staff: new Map() };
let playerMesh, playerM, flyers = [], lamps = [], glassMats = [], barTpl, evMesh = null;
const ghosts = { field: [], pen: [], work: [], shelf: [], reg: [] };
let skyDome, skyMat, sunDisc, starMat;
let wallMatRef, trimMatRef, floorMatRef, signRef, signBoardRef;
const clouds = [], doors = [];
/* Низкие стены и потолки: в виде сверху стены по пояс и потолков нет,
   от первого лица стены поднимаются, потолки включаются. */
const lowWalls = [], ceilings = [], secSigns = [];
/* Дальний декор: на карте 72×40 деревья, тара и хозпостройки давали больше тысячи
   лишних draw call. Пока камера в игровом зуме, всё далёкое просто не рисуем;
   при обзорном отъезде показываем целиком — там кадр статичный. */
const decor = [];
const addDecor = (o) => { decor.push(o); return o; };
/* При обзорном отъезде мелочь (ценники, полоски свежести, стопки товара, призраки
   слотов) физически не читается, зато стоит тысячи draw call — гасим её. */
const wideView = () => cam.dist > 2.4;
function updateDecor() {
  const wide = wideView();
  const wantShadows = QUAL[quality].shadows && !wide;
  if (renderer.shadowMap.enabled !== wantShadows) {
    renderer.shadowMap.enabled = wantShadows;   // теневой проход — это второй обход всей сцены
    scene.traverse(o => { if (o.isMesh && o.material) o.material.needsUpdate = true; });
  }
  const r2 = wide ? 1e9 : (26 * cam.dist) ** 2;
  for (const o of decor) o.visible = wide || far2(o.position.x, o.position.z) < r2;
}
const WALL_TALL = 3.2;
const cam = { yaw: 0, dist: .95, tx: START.x, tz: START.y, fps: false, pitch: -.05 };
const V = new THREE.Vector3();

/* Нарисованные текстуры подгружаются поверх процедурных.
   Если файла нет или он не загрузился — остаётся процедурная шашка,
   игра не ломается и продолжает работать офлайн. */
const texLoader = new THREE.TextureLoader();
function skinMaterial(mat, file, repeat, tint) {
  texLoader.load('assets/' + file, (t) => {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    if (repeat) t.repeat.set(repeat[0], repeat[1]);
    t.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    t.encoding = THREE.sRGBEncoding;
    mat.map = t;
    mat.color.setHex(tint || 0xffffff);   // лёгкий тон, чтобы картинка не слепила
    mat.needsUpdate = true;
  }, undefined, () => { });
  return mat;
}

function checkerTex(a, b, n) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = a; x.fillRect(0, 0, 64, 64);
  x.fillStyle = b; x.fillRect(0, 0, 32, 32); x.fillRect(32, 32, 32, 32);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(n, n);
  t.magFilter = THREE.NearestFilter; t.anisotropy = 4;
  return t;
}

/* ---------- качество картинки ----------
   Телефон и слабый ноут не должны лагать: стартуем от возможностей устройства
   и автоматически снижаем качество, если кадры проседают. */
const isMobile = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent) ||
  (navigator.maxTouchPoints > 1 && innerWidth < 1100);
let quality = isMobile ? 1 : 2;
/* maxDist — предел отъезда камеры: на слабом устройстве обзор всей карты
   стоит втрое больше draw call, поэтому там зум ограничен, а на ПК доступен целиком. */
const QUAL = [
  { dpr: 1, shadows: false, aa: false, maxDist: 2.4 },
  { dpr: 1.25, shadows: true, size: 1024, aa: false, maxDist: 3.4 },
  { dpr: 2, shadows: true, size: 2048, aa: true, maxDist: 4.6 },
];
const maxDist = () => QUAL[quality].maxDist;
function applyQuality() {
  const q = QUAL[quality];
  renderer.setPixelRatio(Math.min(devicePixelRatio, q.dpr));
  renderer.shadowMap.enabled = q.shadows;
  if (q.shadows && sun.shadow.mapSize.width !== q.size) {
    sun.shadow.mapSize.set(q.size, q.size);
    if (sun.shadow.map) { sun.shadow.map.dispose(); sun.shadow.map = null; }
  }
  scene.traverse(o => { if (o.isMesh && o.material && o.material.needsUpdate !== undefined) o.material.needsUpdate = true; });
  resize();
}
function setQuality(q) {
  quality = Math.max(0, Math.min(2, q));
  cam.dist = Math.min(cam.dist, maxDist());
  applyQuality();
  return quality;
}

function initScene(canvas) {
  renderer = new THREE.WebGLRenderer({
    canvas, antialias: !isMobile, powerPreference: 'high-performance',
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, QUAL[quality].dpr));
  renderer.shadowMap.enabled = QUAL[quality].shadows;
  renderer.shadowMap.type = isMobile ? THREE.PCFShadowMap : THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
  // ACES выбеливал насыщенные цвета (помидор становился розовым) — берём чистый вывод
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.toneMappingExposure = 1.0;

  scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0x9fd0ff, 62, 150);
  camera = new THREE.PerspectiveCamera(46, 1, .5, 220);

  hemi = new THREE.HemisphereLight(0xbfe0ff, 0x3f6a34, .5); scene.add(hemi);
  ambient = new THREE.AmbientLight(0xffffff, .2); scene.add(ambient);
  sun = new THREE.DirectionalLight(0xfff4dc, 1.15);
  sun.castShadow = true;
  sun.shadow.mapSize.set(QUAL[quality].size || 1024, QUAL[quality].size || 1024);
  // тень следует за игроком — карта большая, светить всю сразу дорого и мыльно
  const sc = sun.shadow.camera;
  sc.left = -16; sc.right = 16; sc.top = 16; sc.bottom = -16; sc.near = 1; sc.far = 90;
  sun.shadow.bias = -0.0009; sun.shadow.normalBias = .03;
  sun.target.position.set(START.x, 0, START.y);
  scene.add(sun, sun.target);

  buildWorld();
  playerMesh = makeChar(0x2b6cff, 0xf1c27d, 0xffffff);
  scene.add(playerMesh);
  playerM = { g: playerMesh, csig: '' };

  addEventListener('resize', resize);
  addEventListener('orientationchange', () => setTimeout(resize, 250));   // поворот телефона
  resize();
  return renderer;
}
function resize() {
  const w = innerWidth, h = innerHeight;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}

/* ---------- статичный мир ----------
   Четыре зоны: огород, загон, цеховой двор и торговый зал.
   Между постройками всегда есть проход в клетку. */
function buildWorld() {
  const add = (m) => { scene.add(m); return m; };
  const plane = (x, z, w, d, color, tex, y) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshStandardMaterial({ color, roughness: 1, map: tex || null }));
    m.rotation.x = -Math.PI / 2; m.position.set(x, y || .02, z); m.receiveShadow = true;
    return add(m);
  };

  // помощники: прямоугольник зоны в мировых координатах (зона задана клетками включительно)
  const zw = (z) => ({ cx: (z.x0 + z.x1 + 1) / 2, cz: (z.y0 + z.y1 + 1) / 2, w: z.x1 - z.x0 + 1, d: z.y1 - z.y0 + 1 });
  const zonePlane = (key, color, a, b, n, file, rep, tint) => {
    const q = zw(ZONES[key]);
    const m = plane(q.cx, q.cz, q.w, q.d, color, checkerTex(a, b, n));
    if (file) skinMaterial(m.material, file, rep, tint);
    return m;
  };

  // земля и парковка
  const ground = plane(GW / 2, GH / 2, 260, 260, 0x4f9a43, checkerTex('#55a447', '#4a903e', 130), -.02);
  skinMaterial(ground.material, 'grass.jpg', [65, 65]);
  plane(GW + 5.5, 15, 18, 26, 0x4a4f5a, null, .01);
  for (let i = 0; i < 7; i++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(7, .18), new THREE.MeshBasicMaterial({ color: 0xf0e6c8 }));
    l.rotation.x = -Math.PI / 2; l.position.set(GW + 5.5, .02, 4 + i * 3.6); add(l);
  }
  // дорожка от парковки ко входу
  plane(GW + .5, DOOR.y + .5, 12, 4, 0x9aa3ae, checkerTex('#a6aeb9', '#98a1ac', 6), .012);

  // полы зон
  zonePlane('field', 0x7a5636, '#835c39', '#734f31', 16, 'soil.jpg', [5, 4.5]);
  zonePlane('pen', 0x8f9a5a, '#96a25f', '#889255', 16, 'grass.jpg', [6, 5], 0xd9d3a4);
  zonePlane('work', 0xb9bfc9, '#c2c8d1', '#b1b8c2', 11, 'concrete.jpg', [3, 7], 0xc4cbd6);
  const floorZ = zonePlane('hall', 0x93a3ba, '#a4b3c8', '#8c9db5', 19, 'floor.jpg', [5, 6], 0xd2dae6);
  floorMatRef = floorZ.material;
  zonePlane('back', 0x7d8794, '#868f9c', '#79828e', 19, 'concrete.jpg', [4, 1.5], 0xaeb6c2);

  /* Секции: у каждой свой островок пола в цвет товара, бордюр и табличка.
     Так «где помидоры» видно с любого места, не заглядывая в мини-карту. */
  for (const sec of SECTIONS) {
    const r = secRect(sec);
    const cx = (r.x0 + r.x1 + 1) / 2, cz = (r.y0 + r.y1 + 1) / 2;
    const w = r.x1 - r.x0 + 1, d = r.y1 - r.y0 + 1;
    const pad = new THREE.Mesh(new THREE.PlaneGeometry(w, d),
      new THREE.MeshBasicMaterial({ color: sec.c, transparent: true, opacity: .17, depthWrite: false }));
    pad.rotation.x = -Math.PI / 2; pad.position.set(cx, .028, cz); add(pad);
    // бордюр по периметру секции
    const edge = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.LineBasicMaterial({ color: sec.c }));
    edge.geometry.setAttribute('position', new THREE.Float32BufferAttribute([
      r.x0, .04, r.y0, r.x1 + 1, .04, r.y0, r.x1 + 1, .04, r.y1 + 1,
      r.x0, .04, r.y1 + 1, r.x0, .04, r.y0], 3));
    add(new THREE.Line(edge.geometry, edge.material));
    // табличка на столбике у ближнего угла
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.9, 6),
      new THREE.MeshStandardMaterial({ color: 0x6b7484 }));
    pole.position.set(r.x0 + .2, .95, r.y1 + .8); pole.castShadow = true; add(pole);
    const board = new THREE.Mesh(new THREE.BoxGeometry(2.9, .58, .1),
      new THREE.MeshStandardMaterial({ color: sec.c, roughness: .7 }));
    board.position.set(r.x0 + 1.6, 1.85, r.y1 + .8); board.castShadow = true; add(board);
    const lbl = makeSign(sec.n, 2.8, .5, null, '#ffffff', 62);
    lbl.position.set(r.x0 + 1.6, 1.85, r.y1 + .86); add(lbl);
    secSigns.push({ sec, board, lbl });
  }

  /* Потолки: нужны только от первого лица, иначе они закрыли бы вид сверху.
     Заодно светильники — без них потолок читается как серая заглушка. */
  const CEIL_Y = WALL_TALL - .35;
  const ceil = (key, color) => {
    const q = zw(ZONES[key]);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(q.w, q.d),
      new THREE.MeshStandardMaterial({ color, roughness: .95, side: THREE.DoubleSide }));
    m.rotation.x = Math.PI / 2; m.position.set(q.cx, CEIL_Y, q.cz);
    m.visible = false; ceilings.push(m); add(m);
  };
  ceil('hall', 0xcdd6e4);
  ceil('back', 0x9aa4b3);
  // балки вдоль зала — без них потолок читается как серая заглушка
  for (let i = 0; i < 11; i++) {
    const beam = new THREE.Mesh(new THREE.BoxGeometry(GW - ZONES.hall.x0, .16, .3),
      new THREE.MeshStandardMaterial({ color: 0xaab4c4, roughness: .8 }));
    beam.position.set((ZONES.hall.x0 + GW) / 2, CEIL_Y - .1, 2 + i * 3);
    beam.visible = false; ceilings.push(beam); add(beam);
  }
  // светильники-панели
  for (let i = 0; i < 8; i++) for (let j = 0; j < 4; j++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(2.6, .55),
      new THREE.MeshBasicMaterial({ color: 0xfffaf0 }));
    p.rotation.x = Math.PI / 2;
    p.position.set(52 + j * 5, CEIL_Y - .04, 3.5 + i * 4);
    p.visible = false; ceilings.push(p); add(p);
  }

  // разметка в зале: полосы по центру широких проходов между рядами полок
  const H = ZONES.hall;
  for (const x of [50, 53, 56, 59, 62, 65]) {
    const st = new THREE.Mesh(new THREE.PlaneGeometry(.5, H.y1 - H.y0),
      new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: .12 }));
    st.rotation.x = -Math.PI / 2; st.position.set(x, .03, (H.y0 + H.y1 + 1) / 2); add(st);
  }
  // зона входа с тележками
  const entryMat = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 4.4),
    new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: .2 }));
  entryMat.rotation.x = -Math.PI / 2; entryMat.position.set(GW - 2.6, .03, DOOR.y + .5); add(entryMat);
  /* Указатели на полу: куда идти платить и где ворота в цеха.
     Рисуем плоскими треугольниками — читается с любого ракурса и стоит один draw call. */
  const arrow = (x, z, rot, color, scale) => {
    const g = new THREE.BufferGeometry();
    const k = scale || 1;
    g.setAttribute('position', new THREE.Float32BufferAttribute(
      [0, 0, -.75 * k, -.45 * k, 0, .32 * k, .45 * k, 0, .32 * k], 3));
    const m = new THREE.Mesh(g, new THREE.MeshBasicMaterial({
      color, transparent: true, opacity: .42, side: THREE.DoubleSide, depthWrite: false
    }));
    m.position.set(x, .035, z); m.rotation.y = rot; add(m);
  };
  for (let i = 0; i < 6; i++) arrow(REG_SLOTS[0].x - 2.6, 4 + i * 4, -Math.PI / 2, 0x6ee7a0);   // к кассам
  const GY = GATE_Y[1] + .5;
  for (const [x, z, r] of [
    [WALL_HALL + 1.6, GY, Math.PI / 2], [WALL_HALL - 1.6, GY, -Math.PI / 2],
    [WALL_FARM + 1.6, GY, Math.PI / 2], [WALL_FARM - 1.6, GY, -Math.PI / 2],
    [PEN_GATE_X[1] + .5, FENCE_PEN - 1.6, 0], [PEN_GATE_X[1] + .5, FENCE_PEN + 1.6, Math.PI]])
    arrow(x, z, r, 0x8fd0ff, .9);                                                  // между зонами
  arrow(BACK_DOOR_X[0] + 1, WALL_BACK - 1.4, 0, 0xffca7a, .9);                     // в служебку

  // прикассовая полоса
  const payLine = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 24),
    new THREE.MeshBasicMaterial({ color: 0x6ee7a0, transparent: true, opacity: .1 }));
  payLine.rotation.x = -Math.PI / 2; payLine.position.set(REG_SLOTS[0].x - 1.5, .03, 14); add(payLine);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xdbe3ee, roughness: .8 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b6cff, roughness: .5 });
  wallMatRef = wallMat; trimMatRef = trimMat;
  const yardMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, roughness: .9 });
  /* Стены низкие (1.3), чтобы вид сверху не упирался в них. От первого лица так нельзя —
     запоминаем каждую стену и в FPS растягиваем её до нормальной высоты. */
  const wall = (x, z, w, d, h, m, trim) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || wallMat);
    o.position.set(x, h / 2, z); o.castShadow = o.receiveShadow = true; add(o);
    let t = null;
    if (trim !== false) {
      t = new THREE.Mesh(new THREE.BoxGeometry(w + .08, .16, d + .08), trimMat);
      t.position.set(x, h + .02, z); add(t);
    }
    if (h < 2) lowWalls.push({ o, t, h });
    return o;
  };

  const LOW = 1.3;
  /* Стены строим из тех же чисел, что и коллизии в sim.js: сегмент до проёма и после.
     Проёмы всегда шириной 2 клетки — в них свободно проходят двое навстречу. */
  const segX = (x, y0, y1, h, m, trim) => wall(x + .5, (y0 + y1 + 1) / 2, .3, y1 - y0 + 1, h, m, trim);
  const segZ = (y, x0, x1, h, m, trim) => wall((x0 + x1 + 1) / 2, y + .5, x1 - x0 + 1, .3, h, m, trim);

  // ферма | цеха и цеха | зал: ворота на GATE_Y
  for (const x of [WALL_FARM, WALL_HALL]) {
    segX(x, 0, GATE_Y[0] - 1, LOW, yardMat, false);
    segX(x, GATE_Y[GATE_Y.length - 1] + 1, GH - 1, LOW, yardMat, false);
  }
  // северная и южная границы цехового двора
  segZ(0, ZONES.work.x0 - 1, ZONES.work.x1 + 1, LOW, yardMat, false);
  segZ(GH - 1, ZONES.work.x0 - 1, ZONES.work.x1 + 1, LOW, yardMat, false);

  // стены зала: юг, север (фасад) и восточная стена с входом
  segZ(GH - 1, ZONES.hall.x0 - 1, GW - 1, LOW);
  segX(GW - 1, 0, ENTRY_Y[0] - 1, LOW);
  segX(GW - 1, ENTRY_Y[ENTRY_Y.length - 1] + 1, GH - 1, LOW);
  const FAC = (ZONES.hall.x0 + GW) / 2;
  wall(FAC, .5, GW - ZONES.hall.x0, .35, 3.4);            // дальний фасад с вывеской

  // стена между залом и служебными помещениями: дверь на BACK_DOOR_X
  segZ(WALL_BACK, ZONES.back.x0, BACK_DOOR_X[0] - 1, 2.4);
  segZ(WALL_BACK, BACK_DOOR_X[BACK_DOOR_X.length - 1] + 1, GW - 1, 2.4);
  const doorTop = new THREE.Mesh(new THREE.BoxGeometry(BACK_DOOR_X.length, .5, .3), wallMat);
  doorTop.position.set((BACK_DOOR_X[0] + BACK_DOOR_X[BACK_DOOR_X.length - 1] + 1) / 2, 2.15, WALL_BACK + .5);
  add(doorTop);
  const backSign = makeSign('СЛУЖЕБНОЕ · ПОСТОРОННИМ НЕЛЬЗЯ', 3.4, .4, null, '#ffca7a', 52);
  backSign.position.set((BACK_DOOR_X[0] + BACK_DOOR_X[BACK_DOOR_X.length - 1] + 1) / 2, 2.15, WALL_BACK + .34);
  backSign.rotation.y = Math.PI; add(backSign);

  // витрина и вывеска
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: .32, roughness: .1, metalness: .1 });
  glassMats.push(glass);
  for (let i = 0; i < 9; i++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.8, .1), glass);
    g.position.set(ZONES.hall.x0 + 1.4 + i * 2.4, 1.6, .66); add(g);
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(12, 1.7, .35),
    new THREE.MeshStandardMaterial({ color: 0x1d2432, roughness: .6 }));
  board.position.set(FAC, 4.4, .5); board.castShadow = true; add(board);
  const sign = makeSign(G.brand.name, 11.2, 1.6, null, '#ffd75e', 82);
  sign.position.set(FAC, 4.4, .78); add(sign);
  signRef = sign; signBoardRef = board;
  const sign2 = makeSign('ФЕРМА · ЦЕХ · ПРИЛАВОК · 24/7', 9, .8, null, '#8fd0ff', 58);
  sign2.position.set(FAC, 3.45, .78); add(sign2);

  // вход с раздвижными дверями (восточная стена, проём ENTRY_Y)
  const EX = GW - .5, EZ = (ENTRY_Y[0] + ENTRY_Y[ENTRY_Y.length - 1] + 1) / 2;
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(.14, 1.9, .95), glass);
    d.position.set(EX, .95, EZ + s * .55);
    d.userData.side = s; d.userData.z0 = d.position.z;
    doors.push(add(d));
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(.45, .3, 2.6), trimMat);
  arch.position.set(EX, 2.05, EZ); arch.castShadow = true; add(arch);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(.4, 2.1, .3), wallMat);
    p.position.set(EX, 1.05, EZ + s * 1.45); p.castShadow = true; add(p);
  }
  const entry = makeSign('ВХОД', 1.6, .4, null, '#ffffff', 90);
  entry.position.set(EX + .29, 2.05, EZ); entry.rotation.y = Math.PI / 2; add(entry);

  // постеры на фасаде
  [['🍅 −30%', '#e4453a'], ['🥩 СВЕЖЕЕ', '#8f4b38'], ['🥛 ФЕРМА', '#4f8cff'], ['🍕 НОВИНКА', '#e07a3c']]
    .forEach(([txt, col], i) => {
      const bgm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, .08),
        new THREE.MeshStandardMaterial({ color: col, roughness: .7 }));
      const px = ZONES.hall.x0 + 2.5 + i * 5.2;
      bgm.position.set(px, 1.9, .72); add(bgm);
      const s = makeSign(txt, 1.35, .5, null, '#ffffff', 80);
      s.position.set(px, 1.9, .77); add(s);
    });

  // подвесные указатели над рядами полок
  // подвесные указатели над каждым рядом полок
  ['🥬 СВЕЖЕЕ', '🥛 МОЛОЧНОЕ', '🍖 ГОРЯЧЕЕ', '🎂 ДЕСЕРТЫ', '🧃 НАПИТКИ'].forEach((txt, i) => {
    const x = 51.5 + i * 3;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(2.2, .55, .1),
      new THREE.MeshStandardMaterial({ color: 0x2b6cff, roughness: .5 }));
    bar.position.set(x, 3.15, 7.5); add(bar);
    const s = makeSign(txt, 2.1, .46, null, '#ffffff', 64);
    s.position.set(x, 3.15, 7.57); add(s);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .8, 6),
      new THREE.MeshStandardMaterial({ color: 0x9aa5b5 }));
    rod.position.set(x, 3.55, 7.5); add(rod);
  });

  // заборы огорода и загона
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xb07d4e, roughness: .9 });
  const post = new THREE.BoxGeometry(.13, .95, .13), railG = new THREE.BoxGeometry(1, .1, .09);
  /* Забор — это сотни одинаковых столбиков и жердей. Раньше каждый был отдельным
     мешем и съедал по draw call, на карте 72×40 это больше трёхсот вызовов.
     Собираем позиции и рисуем тремя InstancedMesh — три вызова вместо трёхсот. */
  const fencePosts = [], fenceRailsX = [], fenceRailsZ = [];
  const fenceRun = (x0, z0, dx, dz, n) => {
    for (let i = 0; i <= n; i++) {
      fencePosts.push([x0 + dx * i, .47, z0 + dz * i]);
      if (i < n) for (const h of [.3, .68])
        (dz ? fenceRailsZ : fenceRailsX).push([x0 + dx * (i + .5), h, z0 + dz * (i + .5)]);
    }
  };
  const flushFence = () => {
    const mk = (geoSrc, list, rotY) => {
      if (!list.length) return;
      const im = new THREE.InstancedMesh(geoSrc, fenceMat, list.length);
      const m = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(1, 1, 1);
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rotY || 0);
      list.forEach(([x, y, z], i) => { m.compose(new THREE.Vector3(x, y, z), q, sc); im.setMatrixAt(i, m); });
      im.castShadow = true; im.instanceMatrix.needsUpdate = true;
      add(im);
    };
    mk(post, fencePosts, 0);
    mk(railG, fenceRailsX, 0);
    mk(railG, fenceRailsZ, Math.PI / 2);
  };
  fenceRun(.5, .5, 1, 0, WALL_FARM);                        // север огорода
  fenceRun(.5, .5, 0, 1, GH - 1);                           // запад (весь бок)
  fenceRun(.5, GH - .5, 1, 0, WALL_FARM);                   // юг загона
  fenceRun(.5, FENCE_PEN + .5, 1, 0, PEN_GATE_X[0] - 1);    // забор огород | загон, калитка у ворот
  flushFence();
  // калитка: створка на петлях, чтобы проём читался как проход, а не как дыра в заборе
  const gate = new THREE.Mesh(new THREE.BoxGeometry(1.8, .8, .1), fenceMat);
  gate.position.set(PEN_GATE_X[0] + .4, .5, FENCE_PEN + .5);
  gate.rotation.y = -.5; gate.castShadow = true; add(gate);

  // таблички зон
  const zoneSign = (txt, x, z, col) => {
    const p = new THREE.Mesh(new THREE.CylinderGeometry(.05, .05, 1.7, 6),
      new THREE.MeshStandardMaterial({ color: 0x8a6238 }));
    p.position.set(x, .85, z); p.castShadow = true; add(p);
    const b = new THREE.Mesh(new THREE.BoxGeometry(2.4, .6, .1),
      new THREE.MeshStandardMaterial({ color: col, roughness: .7 }));
    b.position.set(x, 1.8, z); b.castShadow = true; add(b);
    const s = makeSign(txt, 2.3, .5, null, '#ffffff', 70);
    s.position.set(x, 1.8, z + .06); add(s);
  };
  zoneSign('🌱 ОГОРОД', 11.5, FENCE_PEN - 1.4, 0x3f8f43);
  zoneSign('🐄 ЗАГОН', 11.5, GH - 1.4, 0x8a6238);
  zoneSign('🍳 ЦЕХА', 36, GH - 1.4, 0x546074);
  zoneSign('📦 ПОГРУЗКА', 36, 27, 0x6b7484);

  // фонари
  const lampAt = (x, z) => {
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(.05, .07, 3.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x2f3a4d, roughness: .5, metalness: .3 }));
    pole.position.set(x, 1.6, z); pole.castShadow = true; add(pole);
    const shade = new THREE.Mesh(new THREE.ConeGeometry(.42, .34, 12, 1, true),
      new THREE.MeshStandardMaterial({ color: 0x2f3a4d, side: THREE.DoubleSide, roughness: .5 }));
    shade.position.set(x, 3.24, z); add(shade);
    const body = new THREE.Mesh(new THREE.SphereGeometry(.17, 12, 10),
      new THREE.MeshStandardMaterial({ color: 0xfff6de, emissive: 0xffd98a, emissiveIntensity: 0 }));
    body.position.set(x, 3.08, z); add(body);
    const pl = new THREE.PointLight(0xffdca0, 0, 13); pl.position.set(x, 2.9, z); add(pl);
    lamps.push({ body, pl });
  };
  // фонари: по аллеям секций и в зале, чтобы ночью не оставалось тёмных углов
  const lampSpots = [];
  for (const z of [5, 16, 27, 37]) for (const x of [11.5, WALL_FARM - 1.5, WALL_FARM + 1.5, 36, WALL_HALL - 1.5]) lampSpots.push([x, z]);
  for (const z of [6, 17, 28]) for (const x of [WALL_HALL + 1.5, 56, 66]) lampSpots.push([x, z]);
  lampSpots.push([1.5, 11], [1.5, 31], [GW + 2, 10], [GW + 2, 26], [GW - 3, DOOR.y + .5]);
  lampSpots.forEach(([x, z]) => lampAt(x, z));

  // деревья по периметру участка
  for (let i = 0; i < 14; i++) { const t = makeTree(); t.position.set(-3.2, 0, 2 + i * 2.8); addDecor(add(t)); }
  for (const x of [6, 14, 22, 30, 38, 46, 56, 66]) { const t = makeTree(); t.position.set(x, 0, -3.2); addDecor(add(t)); }
  for (const x of [8, 18, 28, 38, 52, 64]) { const t = makeTree(); t.position.set(x, 0, GH + 3.2); addDecor(add(t)); }
  for (const z of [6, 14, 24, 34]) { const t = makeTree(); t.position.set(GW + 13, 0, z); addDecor(add(t)); }

  /* Свободные ячейки секционной сетки — не пустота, а хозпостройки:
     теплица и колодец в огороде, амбар в загоне. */
  const gh = makeGreenhouse(); gh.position.set(17.5, 0, 19.8); addDecor(add(gh));
  const ghSign = makeSign('🪴 ТЕПЛИЦА', 2.2, .44, null, '#9fe4ff', 60);
  ghSign.position.set(17.5, 2.7, 21.3); add(ghSign);
  const well = makeWell(); well.position.set(12, 0, 8); addDecor(add(well));
  const barn = makeBarn(); barn.position.set(17.5, 0, 34); addDecor(add(barn));
  const barnSign = makeSign('🌾 АМБАР', 1.8, .42, null, '#ffd75e', 60);
  barnSign.position.set(17.5, 3.3, 35.7); add(barnSign);

  // кусты по аллеям огорода
  for (const [x, z] of [[11.5, 4], [11.5, 12], [11.5, 20], [23, 5], [23, 15], [1.7, 8], [1.7, 19]]) {
    const b = makeBush(); b.position.set(x, 0, z); addDecor(add(b));
  }
  // загон: сено и поилки в свободной полосе
  for (const [x, z] of [[14.5, 33.5], [15.6, 33.5], [15, 34.6], [18, 36.5], [22.5, 26]]) {
    const h = makeHay(); h.position.set(x, 0, z); addDecor(add(h));
  }
  for (const [x, z] of [[11.5, 26.5], [11.5, 34], [22.5, 30]]) {
    const tr = makeTrough(); tr.position.set(x, 0, z); addDecor(add(tr));
  }

  /* Погрузочный двор в цехах: свободная южная полоса под тару, поддоны и ленту. */
  for (const [x, z] of [[26.6, 30], [27.5, 30], [26.6, 34], [46.4, 30], [46.4, 34], [36, 36.4]]) {
    const c = makeCrate(); c.position.set(x, 0, z); c.rotation.y = Math.random(); addDecor(add(c));
  }
  for (const [x, z] of [[30, 31], [33, 31], [42, 31], [30, 35], [42, 35]]) {
    const pl = makePallet(); pl.position.set(x, 0, z); pl.rotation.y = Math.random() * .4; addDecor(add(pl));
  }
  /* Погрузочный док: сюда «приезжают» партии от оптовика. */
  const dock = plane(36, 33, 12, 6, 0x8f98a5, checkerTex('#99a2af', '#8b95a2', 8), .015);
  const dockLine = makeSign('🚚 ПОГРУЗКА · ПРИЁМ ТОВАРА', 5.2, .6, null, '#ffca7a', 62);
  dockLine.rotation.x = -Math.PI / 2; dockLine.position.set(36, .04, 30.4); add(dockLine);
  const truck = makeTruck(0x4f8cff); truck.position.set(34, 0, 35.5); truck.rotation.y = Math.PI / 2; addDecor(add(truck));
  const truck2 = makeTruck(0xff9f68); truck2.position.set(40, 0, 35.5); truck2.rotation.y = Math.PI / 2; addDecor(add(truck2));

  /* Лента-транспортёр из цехов в зал: декор, который показывает, за что платит апгрейд. */
  const beltMat = new THREE.MeshStandardMaterial({ color: 0x39414f, roughness: .7, metalness: .2 });
  // от секций цехов до ворот в зал — дальше товар уже разбирают вручную
  const beltSegs = [], beltLegs = [];
  for (let x = ZONES.work.x0 + 1; x < WALL_HALL; x += 1) {
    if (x === WALL_FARM) continue;
    beltSegs.push(x + .5);
    if (x % 3 === 0) beltLegs.push(x + .5);
  }
  const instRow = (geoSrc, mat, xs, y, z) => {
    const im = new THREE.InstancedMesh(geoSrc, mat, xs.length);
    const m = new THREE.Matrix4();
    xs.forEach((x, i) => { m.makeTranslation(x, y, z); im.setMatrixAt(i, m); });
    im.castShadow = true; im.instanceMatrix.needsUpdate = true; add(im);
  };
  instRow(new THREE.BoxGeometry(1, .18, 1.1), beltMat, beltSegs, .55, GATE_Y[2] + .5);
  instRow(new THREE.BoxGeometry(.12, .46, .12), beltMat, beltLegs, .23, GATE_Y[2] + .5);
  const beltSign = makeSign('🛞 ТРАНСПОРТЁР', 2.4, .42, null, '#8fd0ff', 58);
  beltSign.position.set(ZONES.work.x0 + 4, 1.5, GATE_Y[2] + 1.3); add(beltSign);

  /* ---------- служебные помещения ----------
     Склад с холодильной камерой и стеллажами, кабинет, шкафчики и кулер для смены. */
  const backZ = ZONES.back;
  for (let i = 0; i < 6; i++) {
    const r = makeRack(); r.position.set(50.5 + i * 1.8, 0, backZ.y0 + .7); addDecor(add(r));
  }
  const fr = makeFridgeDoor(); fr.position.set(62, 0, backZ.y0 + .4); add(fr);
  const frSign = makeSign('❄ ХОЛОД', 1.3, .34, null, '#9fe4ff', 60);
  frSign.position.set(62, 1.75, backZ.y0 + .58); add(frSign);
  const desk = makeDesk(); desk.position.set(66.5, 0, backZ.y0 + 1.4); desk.rotation.y = Math.PI; add(desk);
  const deskSign = makeSign('🗂 КАБИНЕТ', 1.7, .38, null, '#ffd75e', 58);
  deskSign.position.set(66.5, 2, backZ.y0 - .3); add(deskSign);
  const lock = makeLockers(); lock.position.set(69, 0, backZ.y0 + .6); lock.rotation.y = -Math.PI / 2; add(lock);
  const cool = makeCooler(); cool.position.set(68.6, 0, backZ.y0 + 2.6); add(cool);
  for (const [x, z] of [[52, backZ.y1 - .4], [53.2, backZ.y1 - .4], [57, backZ.y1 - .5], [64, backZ.y1 - .5]]) {
    const c = makeCrate(); c.position.set(x, 0, z); c.rotation.y = Math.random(); addDecor(add(c));
  }
  const pal3 = makePallet(); pal3.position.set(55, 0, backZ.y1 - .5); add(pal3);

  /* Обжитая площадка перед входом. */
  for (const [x, z] of [[GW + .8, DOOR.y - 3], [GW + .8, DOOR.y + 4],
  [ZONES.hall.x0 + 2, -1.2], [ZONES.hall.x0 + 11, -1.2], [GW - 4, -1.2],
  [GW + 1.2, GH + 1.5], [ZONES.hall.x0 - 3, GH + 1.5]]) {
    const f = makeFlowerbed(); f.position.set(x, 0, z); addDecor(add(f));
  }
  for (const [x, z, r] of [[GW + 1.6, DOOR.y - 4.6, 0], [GW + 1.6, DOOR.y + 5.4, 0],
  [ZONES.hall.x0 + 6, -1.4, 0]]) {
    const b = makeBench(); b.position.set(x, 0, z); b.rotation.y = r; addDecor(add(b));
  }
  for (const [x, z] of [[GW + .4, DOOR.y - 1.6], [GW + .4, DOOR.y + 2.6], [GW + 6, 14]]) {
    const bin = makeBin(); bin.position.set(x, 0, z); addDecor(add(bin));
  }
  const pSign = makeSign('🅿 ПАРКОВКА', 2.2, .5, null, '#ffffff', 66);
  pSign.position.set(GW + 6, 2.2, 5.2); add(pSign);
  const pPole = new THREE.Mesh(new THREE.CylinderGeometry(.06, .06, 2.2, 8),
    new THREE.MeshStandardMaterial({ color: 0x2f3a4d }));
  pPole.position.set(GW + 6, 1.1, 5.2); pPole.castShadow = true; add(pPole);

  // парковка: машины покупателей и тележки у входа
  [[0xe4453a, 8], [0x4f8cff, 13], [0x7bd389, 18], [0xf0b429, 30]].forEach(([col, z], i) => {
    const c = makeCar(col); c.position.set(GW + 2.5 + (i % 2) * 6, 0, z);
    c.rotation.y = (i % 2 ? -1 : 1) * Math.PI / 2; addDecor(add(c));
  });
  for (let i = 0; i < 7; i++) {
    const c = makeCart();
    c.position.set(GW - 2.4, 0, DOOR.y + 2.4 + i * .36); addDecor(add(c));
  }

  // небо: купол + солнце/луна + облака + звёзды
  const skyGeo = new THREE.SphereGeometry(190, 24, 16);
  skyMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, side: THREE.BackSide, fog: false, depthWrite: false });
  skinMaterial(skyMat, 'sky.jpg', [3, 1]);      // нарисованные облака; цвет продолжит красить небо по времени суток
  skyDome = new THREE.Mesh(skyGeo, skyMat); skyDome.position.set(GW / 2, 0, GH / 2); add(skyDome);

  sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  add(sunDisc);

  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 260; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * .45;
    sp.push(GW / 2 + Math.cos(th) * Math.cos(ph) * 150, Math.sin(Math.PI / 2 - ph) * 150, GH / 2 + Math.sin(th) * Math.cos(ph) * 150);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, transparent: true, opacity: 0, fog: false });
  add(new THREE.Points(starGeo, starMat));

  for (let i = 0; i < 12; i++) {
    const c = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x9fb8d8, emissiveIntensity: .12 });
    for (let j = 0; j < 4; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random() * 1.4, 10, 8), m);
      s.position.set(j * 2 - 3 + Math.random(), Math.random() * .8, Math.random() * 1.6 - .8);
      c.add(s);
    }
    c.position.set(-40 + Math.random() * (GW + 80), 52 + Math.random() * 14, -40 + Math.random() * (GH + 80));
    c.scale.setScalar(.8 + Math.random());
    clouds.push(c); add(c);
  }

  // призрачные слоты застройки — видно, куда встанет покупка
  const ghostMat = () => new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .3, depthWrite: false });
  const mkGhost = (s, col) => {
    const g = new THREE.Group();
    const p = new THREE.Mesh(new THREE.PlaneGeometry(.92, .92), ghostMat());
    p.material.color.setHex(col); p.rotation.x = -Math.PI / 2; g.add(p);
    const plus = makeSign('+', .42, .42, null, '#ffffff', 200);
    plus.rotation.x = -Math.PI / 2; plus.position.y = .01; g.add(plus);
    g.position.set(s.x + .5, .045, s.y + .5);
    add(g);
    return g;
  };
  ghosts.field = FIELD_SLOTS.map(s => mkGhost(s, 0xa8e06a));
  ghosts.pen = PEN_SLOTS.map(s => mkGhost(s, 0xffd08a));
  ghosts.work = WORK_SLOTS.map(s => mkGhost(s, 0x9fd0ff));
  ghosts.shelf = SHELF_SLOTS.map(s => mkGhost(s, 0x9fd0ff));
  ghosts.reg = REG_SLOTS.map(s => mkGhost(s, 0xffc2e0));

  // шаблон прогресс-бара
  barTpl = new THREE.Group();
  const bg = new THREE.Mesh(new THREE.PlaneGeometry(.66, .1), new THREE.MeshBasicMaterial({ color: 0x0b0f18, transparent: true, opacity: .6, depthTest: false }));
  const fl = new THREE.Mesh(new THREE.PlaneGeometry(.62, .06), new THREE.MeshBasicMaterial({ color: 0x7fe07f, depthTest: false }));
  fl.position.z = .001; barTpl.add(bg, fl); barTpl.userData.fill = fl;
  barTpl.renderOrder = 999;
}

function newBar(color) {
  const b = barTpl.clone(true);
  b.userData.fill = b.children[1];
  b.children[1].material = b.children[1].material.clone();
  if (color) b.children[1].material.color.setHex(color);
  b.renderOrder = 999;
  return b;
}
function setBar(bar, p, color) {
  const f = bar.userData.fill;
  f.scale.x = Math.max(.001, Math.min(1, p));
  f.position.x = -.31 * (1 - f.scale.x);
  if (color !== undefined) f.material.color.setHex(color);
}

/* ---------- синхронизация с симуляцией ---------- */
function syncWorld() {
  // снесённые постройки убираем из сцены
  for (const [b, m] of meshes.b) {
    if (G.buildings.includes(b)) continue;
    scene.remove(m.g);
    meshes.b.delete(b);
  }
  for (const b of G.buildings) {
    if (meshes.b.has(b)) continue;
    const d = DEF[b.t];
    const g = new THREE.Group();
    const model = d.kind === 'plot' ? makePlot(d) : d.kind === 'coop' ? makeCoop()
      : d.kind === 'tree' ? makeTree2()
        : d.kind === 'cow' ? makeCow() : d.kind === 'pig' ? makePig() : makeMachine(d);
    if (d.kind === 'cow' || d.kind === 'pig') model.rotation.y = Math.PI * .5;
    g.add(model);
    const bar = newBar(0x7fe07f); bar.position.y = 1.3; g.add(bar);
    const out = new THREE.Group(); out.position.y = 0; g.add(out);
    g.position.set(b.x + .5, 0, b.y + .5);
    g.scale.setScalar(.001);
    scene.add(g);
    meshes.b.set(b, { g, model, bar, out, sig: '', pop: 0, need: null, needSig: '' });
  }
  for (const sh of G.shelves) {
    if (meshes.sh.has(sh)) continue;
    const g = new THREE.Group();
    const model = makeShelf(); g.add(model);
    const label = makeSign('', .96, .27, 'rgba(11,15,26,.78)', '#ffffff', 66);
    label.position.set(0, 1.28, .1); g.add(label);
    const fresh = newBar(0x6ee7a0); fresh.position.set(0, 1.12, .1); fresh.scale.setScalar(.8); g.add(fresh);
    const box = new THREE.Group(); g.add(box);      // товар на полке — одним переключателем
    g.position.set(sh.x + .5, 0, sh.y + .5);
    g.scale.setScalar(.001);
    scene.add(g);
    meshes.sh.set(sh, { g, model, label, box, fresh, sig: '', items: [], pop: 0 });
  }
  for (let i = 0; i < G.regs; i++) {
    if (meshes.reg.has(i)) continue;
    const g = new THREE.Group();
    g.add(makeRegister());
    g.position.set(REG_SLOTS[i].x + .5, 0, REG_SLOTS[i].y + .5);
    g.rotation.y = -Math.PI / 2;
    g.scale.setScalar(.001);
    scene.add(g);
    meshes.reg.set(i, { g, pop: 0 });
  }
}

function shelfLabelTex(sh) {
  const it = sh.item ? ITEMS[sh.item] : null;
  if (!it) return '';
  const m = markup(sh.item);
  const tag = m > 1.02 ? ' ↑' : (m < .98 ? ' ↓' : '');
  return `${it.n} · ${Math.round(itemPrice(sh.item))}₽${tag}`;
}
function updateShelf(sh, m) {
  const sig = (sh.item || '-') + ':' + sh.n + ':' + (markup(sh.item || 'tomato')).toFixed(2);
  if (sig === m.sig) return;
  m.sig = sig;
  for (const o of m.items) o.parent.remove(o);
  m.items.length = 0;
  const slots = m.model.userData.slots;
  for (let i = 0; i < Math.min(sh.n, 6, slots.length); i++) {
    const it = makeItem(sh.item);
    it.position.copy(slots[i].position);
    it.rotation.y = i * 1.1;
    it.scale.setScalar(.33);
    m.box.add(it); m.items.push(it);
  }
  const empty = !sh.item;
  const txt = empty ? '❗ пусто' : shelfLabelTex(sh);
  const old = m.label;
  const nl = makeSign(txt, .96, .27, empty ? 'rgba(200,60,60,.88)' : 'rgba(11,15,26,.78)', '#ffffff', 66);
  nl.position.copy(old.position);
  m.g.remove(old); old.material.dispose();          // текстура общая, её не трогаем
  m.g.add(nl); m.label = nl;
}

function updateBuildingMesh(b, m, t) {
  const d = DEF[b.t];
  // выход товара
  const sig = b.out.length + '';
  if (sig !== m.sig) {
    m.sig = sig;
    while (m.out.children.length) m.out.remove(m.out.children[0]);
    for (let i = 0; i < b.out.length; i++) {
      const it = makeItem(b.out[i]);
      // от первого лица высокая стопка выглядела как парящий в воздухе товар
      it.scale.setScalar(.78);
      it.position.set(.6, .08 + i * .25, .6 - i * .1);
      m.out.add(it);
    }
  }
  m.out.visible = !wideView() && far2(b.x + .5, b.y + .5) < ITEM_R2;

  // цех подсвечивается, если примет что-то из рюкзака
  const wantsMine = d.in && player.carry.length &&
    (b.x + .5 - player.x) ** 2 + (b.y + .5 - player.y) ** 2 < REACH_DROP * REACH_DROP &&
    player.carry.some(it => acceptsInput(b, it));
  if (wantsMine !== m.glowOn) {
    m.glowOn = wantsMine;
    if (!m.glow) {
      m.glow = new THREE.Mesh(
        new THREE.RingGeometry(.46, .6, 20),
        new THREE.MeshBasicMaterial({ color: 0x8fd0ff, transparent: true, opacity: .6, depthWrite: false }));
      m.glow.rotation.x = -Math.PI / 2; m.glow.position.y = .07;
      m.g.add(m.glow);
    }
    m.glow.visible = wantsMine;
  }
  if (m.glow && m.glow.visible) m.glow.material.opacity = .35 + Math.abs(Math.sin(t * 4)) * .35;
  if (m.out.visible)
    for (let i = 0; i < m.out.children.length; i++)
      m.out.children[i].rotation.y = t * .8 + i;

  setBar(m.bar, b.prog, b.working ? 0x7fe07f : 0xff9f6b);
  m.bar.visible = b.prog > .01;

  // значок уровня прокачанной постройки
  const lv = lvlOf(b);
  if (lv !== m.lvlSig) {
    m.lvlSig = lv;
    if (m.lvlSign) { m.g.remove(m.lvlSign); m.lvlSign.material.dispose(); m.lvlSign = null; }
    if (lv > 1) {
      m.lvlSign = makeSign('ур. ' + lv, .5, .26, 'rgba(122,92,255,.92)', '#ffffff', 74);
      m.lvlSign.position.set(-.42, 1.05, .42);
      m.g.add(m.lvlSign);
    }
  }
  if (m.lvlSign) m.lvlSign.quaternion.copy(camera.quaternion);

  // цех без сырья показывает, чего ждёт
  if (d.in) {
    const miss = Object.entries(d.in)
      .filter(([k, v]) => (b.stock[k] || 0) < v)
      .map(([k, v]) => ITEMS[k].e + (v - (b.stock[k] || 0)));
    const sig = b.working ? '' : miss.join('');
    if (sig !== m.needSig) {
      m.needSig = sig;
      if (m.need) { m.g.remove(m.need); m.need.material.dispose(); m.need = null; }
      if (sig) {
        m.need = makeSign('нужно ' + sig, 1.15, .34, 'rgba(200,60,60,.85)', '#ffffff', 68);
        m.need.position.set(0, 1.62, 0);
        m.g.add(m.need);
      }
    }
    if (m.need) {
      m.need.quaternion.copy(camera.quaternion);
      m.need.position.y = 1.62 + Math.sin(t * 3) * .05;
    }
  }

  const u = m.model.userData;
  if (d.kind === 'plot' && u.plants) {
    const s = .5 + .5 * b.prog;
    for (const p of u.plants) { p.scale.setScalar(s); p.userData.fruit.visible = b.prog > .35; }
  }
  if (u.fruits) {
    u.fruits.forEach((f, i) => { f.visible = b.prog > (i + 1) / (u.fruits.length + 1); });
    m.model.rotation.z = Math.sin(t * .8 + b.slot) * .015;
  }
  if (u.hen) { u.hen.position.y = Math.abs(Math.sin(t * 2)) * .06; u.hen.rotation.y = Math.sin(t * .7) * .8; }
  if (u.body) { u.body.position.y = Math.sin(t * 1.6 + b.slot) * .02; if (u.head) u.head.rotation.x = Math.sin(t * 1.1) * .12; }
  if (u.lamp) {
    u.lamp.material.emissiveIntensity = b.working ? (.4 + Math.sin(t * 6) * .35) : 0;
    u.pipe.rotation.y = b.working ? t * 3 : 0;
    u.pipe.position.y = .95 + (b.working ? Math.sin(t * 8) * .03 : 0);
  }
}

/* ---------- персонажи ---------- */
function charFor(map, key, make) {
  let m = map.get(key);
  if (!m) { m = make(); scene.add(m.g); map.set(key, m); }
  return m;
}
function animChar(m, e, t, dt) {
  const g = m.g, u = g.userData;
  g.position.x += (e.x - g.position.x) * Math.min(1, dt * 18);
  g.position.z += (e.y - g.position.z) * Math.min(1, dt * 18);
  const want = e.dir;
  let diff = want - g.rotation.y;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (e.moving) g.rotation.y += diff * Math.min(1, dt * 12);
  const sp = e.moving ? 11 : 0;
  u.phase += dt * sp;
  const s = Math.sin(u.phase) * (e.moving ? .45 : 0);
  u.legL.rotation.x = s; u.legR.rotation.x = -s;
  u.armL.rotation.x = -s * .7; u.armR.rotation.x = s * .7;
  u.body.position.y = .34 + Math.abs(Math.sin(u.phase)) * .04 * (e.moving ? 1 : 0);
  u.body.rotation.z = Math.sin(u.phase) * .03 * (e.moving ? 1 : 0);
  // руки/товар
  const carry = e.carry || e.basket;
  const sig = carry ? carry.length + ':' + (carry[carry.length - 1] || '') : '0';
  if (sig !== m.csig) {
    m.csig = sig;
    while (u.hold.children.length) u.hold.remove(u.hold.children[0]);
    if (carry) for (let i = 0; i < Math.min(carry.length, 5); i++) {
      const it = makeItem(carry[i]);
      it.position.set(0, i * .3, 0);
      it.scale.setScalar(.36);
      u.hold.add(it);
    }
  }
  u.hold.rotation.y = t * .6;
}

function updateCustomers(t, dt) {
  for (const c of G.customers) {
    const m = charFor(meshes.cust, c, () => {
      const g = makeChar(c.shirt, c.skin, c.vip ? 0x2b2f45 : (Math.random() < .25 ? 0x2b3648 : null), c.hair);
      g.scale.setScalar(c.h);
      const bar = newBar(0x7fe07f); bar.position.y = 1.45; g.add(bar);
      const bub = new THREE.Mesh(new THREE.PlaneGeometry(.46, .46),
        new THREE.MeshBasicMaterial({ map: emojiTex('🛒'), transparent: true, toneMapped: false }));
      bub.position.y = 1.75; g.add(bub);
      return { g, bar, bub, bsig: '🛒' };
    });
    m.g.visible = far2(c.x, c.y) < 40 * 40;
    if (!m.g.visible) { animChar(m, c, t, dt); continue; }
    animChar(m, c, t, dt);
    const p = c.patience / c.maxPat;
    m.bar.visible = c.state !== 'leave' && p < .75;
    setBar(m.bar, p, p > .35 ? 0xffd166 : 0xff6b6b);
    m.bar.quaternion.copy(camera.quaternion);
    const sig = bubbleFor(c);
    if (sig !== m.bsig) { m.bsig = sig; m.bub.material.map = emojiTex(sig); m.bub.material.needsUpdate = true; }
    m.bub.quaternion.copy(camera.quaternion);
    m.bub.position.y = 1.75 + Math.sin(t * 3 + c.id * 9) * .04;
  }
  for (const [c, m] of meshes.cust) if (!G.customers.includes(c)) { scene.remove(m.g); meshes.cust.delete(c); }
}
function updateStaffMeshes(t, dt) {
  for (const s of G.staff) {
    const m = charFor(meshes.staff, s, () => ({ g: makeChar(STAFF[s.role].c, 0xe0ac69, 0xffffff, 0x4a3b2f) }));
    animChar(m, s, t, dt);
  }
}

/* ---------- частицы: монетки и конфетти ---------- */
const parts = [];
let coinGeo, coinMat, confGeo;
function spawnCoins(x, z, n) {
  if (!coinGeo) {
    coinGeo = new THREE.CylinderGeometry(.13, .13, .04, 10);
    coinMat = new THREE.MeshStandardMaterial({ color: 0xffd75e, metalness: .6, roughness: .3, emissive: 0x6b5210 });
  }
  for (let i = 0; i < n; i++) {
    const m = new THREE.Mesh(coinGeo, coinMat);
    m.position.set(x + (Math.random() - .5) * .4, 1, z + (Math.random() - .5) * .4);
    m.rotation.x = Math.PI / 2;
    scene.add(m);
    parts.push({ m, vy: 2.2 + Math.random() * 1.4, vx: (Math.random() - .5) * 1.2, vz: (Math.random() - .5) * 1.2, t: 0, life: .95, spin: 12 });
  }
}
function spawnConfetti(x, z) {
  if (!confGeo) confGeo = new THREE.PlaneGeometry(.14, .2);
  const cols = [0xff6b6b, 0x4f8cff, 0xffd75e, 0x6ee7a0, 0xc77dff];
  for (let i = 0; i < 34; i++) {
    const m = new THREE.Mesh(confGeo, new THREE.MeshBasicMaterial({
      color: cols[i % cols.length], side: THREE.DoubleSide, transparent: true,
    }));
    m.position.set(x + (Math.random() - .5) * 1.2, 2.4 + Math.random(), z + (Math.random() - .5) * 1.2);
    scene.add(m);
    parts.push({ m, vy: 1 + Math.random() * 2, vx: (Math.random() - .5) * 2.4, vz: (Math.random() - .5) * 2.4, t: 0, life: 1.7, spin: 8, fade: true });
  }
}
function updateParts(dt) {
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i];
    p.t += dt; p.vy -= dt * 6.5;
    p.m.position.x += p.vx * dt;
    p.m.position.y += p.vy * dt;
    p.m.position.z += p.vz * dt;
    p.m.rotation.y += dt * p.spin;
    p.m.rotation.z += dt * p.spin * .6;
    if (p.fade) p.m.material.opacity = Math.max(0, 1 - p.t / p.life);
    if (p.t >= p.life || p.m.position.y < 0) {
      scene.remove(p.m);
      if (p.fade) p.m.material.dispose();
      parts.splice(i, 1);
    }
  }
}

/* ---------- пузыри-эмоции над покупателями ---------- */
const emojiTexCache = new Map();
function emojiTex(str) {
  let t = emojiTexCache.get(str);
  if (t) return t;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = 'rgba(255,255,255,.92)';
  x.beginPath();
  if (x.roundRect) x.roundRect(6, 6, 116, 116, 34); else x.rect(6, 6, 116, 116);
  x.fill();
  x.font = '76px system-ui, "Apple Color Emoji", "Segoe UI Emoji"';
  x.textAlign = 'center'; x.textBaseline = 'middle';
  x.fillText(str, 64, 70);
  t = new THREE.CanvasTexture(c); t.anisotropy = 4;
  emojiTexCache.set(str, t);
  return t;
}
function bubbleFor(c) {
  if (c.state === 'leave') return c.happy ? '😊' : '😡';
  if (c.state === 'queue' || c.state === 'queue0') return c.patience < 18 ? '⏳' : '💳';
  return c.want && c.want.item ? ITEMS[c.want.item].e : '🛒';
}

/* ---------- автоматические двери ---------- */
function updateDoors(dt) {
  const nearDoor = (e) => Math.hypot(e.x - 33.5, e.y - 10.5) < 2.6;
  const open = nearDoor(player) || G.customers.some(nearDoor);
  for (const d of doors) {
    const target = d.userData.z0 + (open ? d.userData.side * .92 : 0);
    d.position.z += (target - d.position.z) * Math.min(1, dt * 7);
  }
}

/* ---------- мусор ---------- */
const trashMeshes = new Map();
function updateTrash() {
  for (const tr of G.trash) {
    if (trashMeshes.has(tr)) continue;
    const m = makeTrash(tr.k);
    m.position.set(tr.x, 0, tr.y);
    m.rotation.y = Math.random() * 6.28;
    scene.add(m); trashMeshes.set(tr, m);
  }
  for (const [tr, m] of trashMeshes)
    if (!G.trash.includes(tr)) { scene.remove(m); trashMeshes.delete(tr); }
}

/* ---------- летящие товары ---------- */
function spawnFlyer(item, from, to, arc) {
  const g = makeItem(item);
  g.scale.setScalar(.34);
  g.position.set(from.x, from.y, from.z);
  scene.add(g);
  flyers.push({ g, from: g.position.clone(), to, t: 0, arc: arc || 1.1 });
}
function updateFlyers(dt) {
  for (let i = flyers.length - 1; i >= 0; i--) {
    const f = flyers[i];
    f.t += dt * 2.4;
    const k = Math.min(1, f.t);
    const tgt = typeof f.to === 'function' ? f.to() : f.to;
    f.g.position.lerpVectors(f.from, tgt, k);
    f.g.position.y += Math.sin(k * Math.PI) * f.arc;
    f.g.rotation.y += dt * 7; f.g.rotation.x += dt * 4;
    f.g.scale.setScalar(.34 * (1 - k * .5));
    if (k >= 1) { scene.remove(f.g); flyers.splice(i, 1); }
  }
}

/* ---------- день/ночь ---------- */
const C = {
  night: { sky: 0x141c33, sun: 0x33477d, hemiS: 0x22304f, hemiG: 0x141c2a, si: .10, ai: .10, hi: .12 },
  dawn: { sky: 0xffb27a, sun: 0xffb27a, hemiS: 0xffd0a8, hemiG: 0x5c5a44, si: 1.0, ai: .18, hi: .35 },
  day: { sky: 0x7fc0ff, sun: 0xfff4dc, hemiS: 0xa8d4ff, hemiG: 0x375c2c, si: 1.15, ai: .3, hi: .5 },
  dusk: { sky: 0xff8f6b, sun: 0xff9a5c, hemiS: 0xffc0a0, hemiG: 0x4a3f38, si: .8, ai: .15, hi: .25 },
};
const tmpA = new THREE.Color(), tmpB = new THREE.Color();
function lerpC(a, b, k) { tmpA.setHex(a); tmpB.setHex(b); return tmpA.lerp(tmpB, k); }

function updateDayNight() {
  const p = G.dayT / DAY_LEN;                 // 0 — полночь
  let A, B, k;
  if (p < .2) { A = C.night; B = C.dawn; k = p / .2; }
  else if (p < .35) { A = C.dawn; B = C.day; k = (p - .2) / .15; }
  else if (p < .72) { A = C.day; B = C.day; k = 0; }
  else if (p < .85) { A = C.day; B = C.dusk; k = (p - .72) / .13; }
  else { A = C.dusk; B = C.night; k = (p - .85) / .15; }
  const skyC = lerpC(A.sky, B.sky, k).clone();
  scene.background = scene.background || new THREE.Color();
  scene.background.copy(skyC);
  scene.fog.color.copy(skyC);
  sun.color.copy(lerpC(A.sun, B.sun, k));
  sun.intensity = A.si + (B.si - A.si) * k;
  ambient.intensity = A.ai + (B.ai - A.ai) * k;
  ambient.color.copy(skyC);            // тень окрашивается небом: синяя ночью, тёплая на закате
  hemi.intensity = A.hi + (B.hi - A.hi) * k;
  hemi.color.copy(lerpC(A.hemiS, B.hemiS, k));
  hemi.groundColor.copy(lerpC(A.hemiG, B.hemiG, k));

  // Солнце ходит по небу, но никогда не встаёт в зенит — иначе свет плоский и без теней.
  const ang = (p - .25) * Math.PI * 2;
  const hgt = Math.max(.22, Math.sin(ang));
  const ox = Math.cos(ang) * 24, oy = 5 + hgt * 17;
  sun.target.position.set(cam.tx, 0, cam.tz);
  sun.target.updateMatrixWorld();
  sun.position.set(cam.tx + ox, oy, cam.tz + 15);

  // небо, светило, звёзды, облака
  skyMat.color.copy(skyC);
  const sunUp = Math.max(0, Math.sin(ang));
  sunDisc.position.set(cam.tx + Math.cos(ang) * 95, 6 + sunUp * 78, cam.tz - 40);
  sunDisc.material.color.copy(lerpC(0xdfe9ff, 0xfff3c4, Math.min(1, sunUp * 2 + .2)));
  sunDisc.scale.setScalar(sunUp > 0 ? 1 : .55);
  const nightS = Math.max(0, Math.min(1, (Math.abs(p - .5) - .24) / .14));
  starMat.opacity = nightS * .9;
  for (const c of clouds) {
    c.position.x += .004;
    if (c.position.x > 90) c.position.x = -34;
  }

  const nightK = Math.max(0, Math.min(1, (Math.abs(p - .5) - .22) / .16));
  for (const l of lamps) { l.pl.intensity = nightK * 1.5; l.body.material.emissiveIntensity = nightK; }
  for (const g of glassMats) g.opacity = .3 - nightK * .12;
}

/* ---------- камера ---------- */
let camFocus = null;                 // ненадолго показать проблему на карте
function updateCamera(dt) {
  // цель камеры — игрок, но не даём уехать за пределы карты
  let fx = player.x, fy = player.y;
  if (camFocus) {
    camFocus.t -= dt;
    if (camFocus.t <= 0) camFocus = null;
    else { fx = camFocus.x; fy = camFocus.y; }
  }
  // границы держим от размеров карты, а не константами: иначе камера отстаёт в дальних зонах
  const mx = 4.5 * cam.dist, mz = 4.5 * cam.dist;
  const tx = Math.max(mx, Math.min(GW - mx, fx));
  const tz = Math.max(mz, Math.min(GH - mz, fy));
  const snap = cam.fps ? 1 : Math.min(1, dt * 5);
  cam.tx += (tx - cam.tx) * snap;
  cam.tz += (tz - cam.tz) * snap;

  if (cam.fps) {
    /* Вид от первого лица: камера в глазах игрока, смотрит по cam.yaw и cam.pitch.
       Цель слежения приравниваем к самому игроку, иначе отсечение по дальности
       считалось бы от точки, где камеры уже нет. */
    cam.tx = fx; cam.tz = fy;
    const cp = Math.cos(cam.pitch), sp = Math.sin(cam.pitch);
    const fwd = new THREE.Vector3(-Math.sin(cam.yaw) * cp, sp, -Math.cos(cam.yaw) * cp);
    bobT += dt * player.moving * 9;
    const eye = 1.52 + Math.sin(bobT) * .035 * player.moving;    // лёгкое покачивание при ходьбе
    camera.position.set(fx, eye, fy);
    camera.lookAt(fx + fwd.x, eye + fwd.y, fy + fwd.z);
    return;
  }
  const d = 12.5 * cam.dist, h = 13.5 * cam.dist;
  camera.position.set(
    cam.tx + Math.sin(cam.yaw) * d,
    h,
    cam.tz + Math.cos(cam.yaw) * d);
  camera.lookAt(cam.tx, 1.1, cam.tz);
}

/* Стены и потолки, которые живут по-разному в двух видах. */
function applyViewMode() {
  for (const w of lowWalls) {
    w.o.scale.y = cam.fps ? WALL_TALL / w.h : 1;
    w.o.position.y = (cam.fps ? WALL_TALL : w.h) / 2;
    if (w.t) w.t.position.y = (cam.fps ? WALL_TALL : w.h) + .02;
  }
  for (const c of ceilings) c.visible = cam.fps;
}

/* ---------- кадр ---------- */
let popT = 0, bobT = 0, lastFps = null;
/* Всё, что далеко от камеры, просто не рисуем — иначе на большой карте
   набегает больше тысячи draw call и телефон захлёбывается. */
const GHOST_R2 = 15 * 15, ITEM_R2 = 19 * 19;
const far2 = (x, z) => (x - cam.tx) * (x - cam.tx) + (z - cam.tz) * (z - cam.tz);

function updateGhosts(t) {
  const pulse = .22 + Math.abs(Math.sin(t * 1.6)) * .18;
  const show = (g, free) => {
    g.visible = free && !wideView() && far2(g.position.x, g.position.z) < GHOST_R2;
    if (g.visible) g.children[0].material.opacity = pulse;
  };
  for (const zone of ['field', 'pen', 'work']) {
    const used = new Set(G.buildings.filter(b => DEF[b.t].zone === zone).map(b => b.slot));
    ghosts[zone].forEach((g, i) => show(g, !used.has(i)));
  }
  ghosts.shelf.forEach((g, i) => show(g, i >= G.shelves.length));
  ghosts.reg.forEach((g, i) => show(g, i >= G.regs));
}

function renderFrame(t, dt) {
  if (lastFps !== cam.fps) { lastFps = cam.fps; applyViewMode(); }
  syncWorld();
  updateGhosts(t);
  updateDecor();
  // жёлтое кольцо под той постройкой, с которой сейчас снимем товар:
  // видно заранее, что попадёт в рюкзак, и не берётся «не то»
  const src = pickTarget();
  const near2 = wideView() ? 1e9 : (24 * cam.dist) ** 2;
  for (const [b, m] of meshes.b) {
    m.g.visible = far2(b.x + .5, b.y + .5) < near2;
    if (!m.g.visible) continue;
    updateBuildingMesh(b, m, t);
    const on = b === src;
    if (on || m.takeRing) {
      if (!m.takeRing) {
        m.takeRing = new THREE.Mesh(
          new THREE.RingGeometry(.5, .66, 22),
          new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: .7, depthWrite: false }));
        m.takeRing.rotation.x = -Math.PI / 2; m.takeRing.position.y = .07;
        m.g.add(m.takeRing);
      }
      m.takeRing.visible = on;
      if (on) m.takeRing.material.opacity = .4 + Math.abs(Math.sin(t * 5)) * .4;
    }
    m.pop = Math.min(1, m.pop + dt * 3.5); m.g.scale.setScalar(ease(m.pop));
  }
  for (const [sh, m] of meshes.sh) {
    m.g.visible = far2(sh.x + .5, sh.y + .5) < near2;
    if (!m.g.visible) continue;
    updateShelf(sh, m);
    m.pop = Math.min(1, m.pop + dt * 3.5); m.g.scale.setScalar(ease(m.pop));
    m.label.quaternion.copy(camera.quaternion);
    // ценник показываем рядом с игроком, а пустую полку видно издалека — её надо пополнить
    const d = Math.hypot(sh.x + .5 - player.x, sh.y + .5 - player.y);
    let a = sh.item ? Math.max(0, Math.min(1, (6.5 - d) / 2)) : Math.max(0, Math.min(1, (26 - d) / 4));
    // от первого лица ценник у самого носа занимал пол-экрана: делаем его мельче
    // и убираем, когда стоишь вплотную
    m.label.scale.setScalar(cam.fps ? .45 : 1);
    if (cam.fps && d < 2.2) a = 0;
    m.label.visible = a > .02 && !wideView();
    m.label.material.opacity = a;
    m.box.visible = !wideView() && far2(sh.x + .5, sh.y + .5) < ITEM_R2;
    // полоска свежести: зелёная → жёлтая → красная, показываем только когда товар портится
    const f = freshness(sh);
    const perish = sh.item && ITEMS[sh.item].life > 0;
    m.fresh.visible = !!perish && sh.n > 0 && f < .96 && !wideView() && far2(sh.x + .5, sh.y + .5) < ITEM_R2;
    if (m.fresh.visible) {
      setBar(m.fresh, f, f > .5 ? 0x6ee7a0 : (f > .22 ? 0xffd166 : 0xff6b6b));
      m.fresh.quaternion.copy(camera.quaternion);
    }
    // подсветка полок, куда сейчас уйдёт товар из рюкзака
    const d2 = (sh.x + .5 - player.x) ** 2 + (sh.y + .5 - player.y) ** 2;
    const willFill = player.carry.length && d2 < REACH_DROP * REACH_DROP && sh.n < shelfCap(sh) &&
      (!sh.item || player.carry.includes(sh.item));
    if (willFill !== m.glowOn) {
      m.glowOn = willFill;
      if (!m.glow) {
        m.glow = new THREE.Mesh(
          new THREE.RingGeometry(.44, .58, 20),
          new THREE.MeshBasicMaterial({ color: 0x6ee7a0, transparent: true, opacity: .6, depthWrite: false }));
        m.glow.rotation.x = -Math.PI / 2; m.glow.position.y = .06;
        m.g.add(m.glow);
      }
      m.glow.visible = willFill;
    }
    if (m.glow && m.glow.visible) m.glow.material.opacity = .35 + Math.abs(Math.sin(t * 4)) * .35;
    m.label.position.y = sh.item ? 1.28 : 1.32 + Math.sin(t * 3 + sh.slot) * .05;
  }
  for (const [i, m] of meshes.reg) { m.pop = Math.min(1, m.pop + dt * 3.5); m.g.scale.setScalar(ease(m.pop)); }
  for (const [b, m] of meshes.b) m.bar.quaternion.copy(camera.quaternion);

  playerM.visible = !cam.fps;              // от первого лица себя не видно
  if (playerM.visible) animChar(playerM, player, t, dt);
  // электрокар: модель появляется под игроком, только когда он за рулём
  if (onCart()) {
    if (!evMesh) { evMesh = makeEV(); scene.add(evMesh); }
    evMesh.visible = !cam.fps;
    evMesh.position.set(player.x, .02, player.y);
    evMesh.rotation.y = player.dir + Math.PI;
    if (playerM) playerM.position.y = .34;          // сидит выше, чем стоит
  } else if (evMesh) {
    evMesh.visible = false;
    if (playerM) playerM.position.y = 0;
  }
  updateCustomers(t, dt);
  updateStaffMeshes(t, dt);
  updateTrash();
  updateFlyers(dt);
  updateParts(dt);
  updateDoors(dt);
  updateDayNight();
  updateCamera(dt);
  renderer.render(scene, camera);
}
function ease(x) { return 1 - Math.pow(1 - x, 3); }

/* Применяем оформление: цвет стен, бордюра, пола и название на вывеске. */
function applyBrand() {
  const b = G.brand || {};
  if (wallMatRef) wallMatRef.color.setHex(BRANDS.wall[b.wall || 0].c);
  if (trimMatRef) trimMatRef.color.setHex(BRANDS.trim[b.trim || 0].c);
  if (floorMatRef) floorMatRef.color.setHex(BRANDS.floor[b.floor || 0].c);
  if (signRef && signRef.userData.txt !== b.name) {
    const old = signRef;
    signRef = makeSign(b.name || 'МОЙ СУПЕРМАРКЕТ', 9.4, 1.5, null, '#ffd75e', 82);
    signRef.position.copy(old.position);
    signRef.userData.txt = b.name;
    scene.remove(old); old.material.dispose();
    scene.add(signRef);
  }
}

/* мировая точка в экранные координаты (для HTML-подписей) */
function project(x, y, z) {
  V.set(x, y, z).project(camera);
  return { x: (V.x * .5 + .5) * innerWidth, y: (-V.y * .5 + .5) * innerHeight, vis: V.z < 1 };
}
