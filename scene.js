/* 3D-сцена: мир, персонажи, свет, день/ночь, камера. */
'use strict';

let renderer, scene, camera, sun, hemi, ambient, sky;
const meshes = { b: new Map(), sh: new Map(), reg: new Map(), cust: new Map(), staff: new Map() };
let playerMesh, playerM, flyers = [], lamps = [], glassMats = [], barTpl;
const ghosts = { field: [], pen: [], work: [], shelf: [], reg: [] };
let skyDome, skyMat, sunDisc, starMat;
let wallMatRef, trimMatRef, floorMatRef, signRef, signBoardRef;
const clouds = [], doors = [];
const cam = { yaw: 0, dist: .95, tx: START.x, tz: START.y };
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
const QUAL = [
  { dpr: 1, shadows: false, aa: false },
  { dpr: 1.25, shadows: true, size: 1024, aa: false },
  { dpr: 2, shadows: true, size: 2048, aa: true },
];
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
function setQuality(q) { quality = Math.max(0, Math.min(2, q)); applyQuality(); return quality; }

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

  // земля и парковка
  const ground = plane(17, 10, 200, 200, 0x4f9a43, checkerTex('#55a447', '#4a903e', 100), -.02);
  skinMaterial(ground.material, 'grass.jpg', [50, 50]);
  plane(41, 11, 16, 24, 0x4a4f5a, null, .01);
  for (let i = 0; i < 6; i++) {
    const l = new THREE.Mesh(new THREE.PlaneGeometry(6, .18), new THREE.MeshBasicMaterial({ color: 0xf0e6c8 }));
    l.rotation.x = -Math.PI / 2; l.position.set(41, .02, 2 + i * 3.6); add(l);
  }

  // зоны: рисованные текстуры поверх процедурных
  const field = plane(5, 6, 9, 11, 0x7a5636, checkerTex('#835c39', '#734f31', 9));      // огород
  skinMaterial(field.material, 'soil.jpg', [3.5, 4]);
  const pen = plane(5, 16.5, 9, 8, 0x8f9a5a, checkerTex('#96a25f', '#889255', 9));      // загон
  skinMaterial(pen.material, 'grass.jpg', [4, 3.5], 0xd9d3a4);      // подсохшая трава загона
  const yard = plane(14, 10.5, 7, 20, 0xb9bfc9, checkerTex('#c2c8d1', '#b1b8c2', 14));  // цеховой двор
  skinMaterial(yard.material, 'concrete.jpg', [2, 5], 0xc4cbd6);
  const floorZ = plane(25.5, 10.5, 14, 20, 0x93a3ba, checkerTex('#a4b3c8', '#8c9db5', 14)); // зал
  skinMaterial(floorZ.material, 'floor.jpg', [3.5, 5], 0xd2dae6);
  floorMatRef = floorZ.material;

  // разметка в зале: широкие проходы между рядами
  for (const x of [20, 22, 24, 26, 28]) {
    const s = new THREE.Mesh(new THREE.PlaneGeometry(.5, 18),
      new THREE.MeshBasicMaterial({ color: 0x4f8cff, transparent: true, opacity: .13 }));
    s.rotation.x = -Math.PI / 2; s.position.set(x, .03, 10.5); add(s);
  }
  const mat = new THREE.Mesh(new THREE.PlaneGeometry(2.6, 3.4),
    new THREE.MeshBasicMaterial({ color: 0xffd75e, transparent: true, opacity: .22 }));
  mat.rotation.x = -Math.PI / 2; mat.position.set(31.6, .03, 10.5); add(mat);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0xdbe3ee, roughness: .8 });
  const trimMat = new THREE.MeshStandardMaterial({ color: 0x2b6cff, roughness: .5 });
  wallMatRef = wallMat; trimMatRef = trimMat;
  const yardMat = new THREE.MeshStandardMaterial({ color: 0xb0b8c4, roughness: .9 });
  const wall = (x, z, w, d, h, m, trim) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m || wallMat);
    o.position.set(x, h / 2, z); o.castShadow = o.receiveShadow = true; add(o);
    if (trim !== false) {
      const t = new THREE.Mesh(new THREE.BoxGeometry(w + .08, .16, d + .08), trimMat);
      t.position.set(x, h + .02, z); add(t);
    }
    return o;
  };

  const LOW = 1.3;
  // стена между огородом и цехами (x = 10), ворота на y = 10..11
  wall(10.5, 5.5, .3, 9, LOW, yardMat, false);
  wall(10.5, 16.5, .3, 8, LOW, yardMat, false);
  // стена между цехами и залом (x = 18), ворота на y = 10..11
  wall(18.5, 5.5, .3, 9, LOW, yardMat, false);
  wall(18.5, 16.5, .3, 8, LOW, yardMat, false);
  // границы цехового двора
  wall(14.5, .5, 8, .3, LOW, yardMat, false);
  wall(14.5, 21.5, 8, .3, LOW, yardMat, false);

  // стены зала
  wall(25.5, 21.5, 14, .3, LOW);
  wall(33.5, 5, .3, 10, LOW);
  wall(33.5, 16.5, .3, 9, LOW);
  wall(25.5, .5, 14, .35, 3.4);            // дальний фасад

  // витрина и вывеска
  const glass = new THREE.MeshStandardMaterial({ color: 0xbfe0ff, transparent: true, opacity: .32, roughness: .1, metalness: .1 });
  glassMats.push(glass);
  for (let i = 0; i < 6; i++) {
    const g = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.8, .1), glass);
    g.position.set(20.2 + i * 2.2, 1.6, .66); add(g);
  }
  const board = new THREE.Mesh(new THREE.BoxGeometry(10, 1.6, .35),
    new THREE.MeshStandardMaterial({ color: 0x1d2432, roughness: .6 }));
  board.position.set(25.5, 4.3, .5); board.castShadow = true; add(board);
  const sign = makeSign(G.brand.name, 9.4, 1.5, null, '#ffd75e', 82);
  sign.position.set(25.5, 4.3, .78); add(sign);
  signRef = sign; signBoardRef = board;
  const sign2 = makeSign('ФЕРМА · ЦЕХ · ПРИЛАВОК · 24/7', 8, .8, null, '#8fd0ff', 58);
  sign2.position.set(25.5, 3.45, .78); add(sign2);

  // вход с раздвижными дверями
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.BoxGeometry(.14, 1.9, .95), glass);
    d.position.set(33.5, .95, 10.5 + s * .55);
    d.userData.side = s; d.userData.z0 = d.position.z;
    doors.push(add(d));
  }
  const arch = new THREE.Mesh(new THREE.BoxGeometry(.45, .3, 2.6), trimMat);
  arch.position.set(33.5, 2.05, 10.5); arch.castShadow = true; add(arch);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(.4, 2.1, .3), wallMat);
    p.position.set(33.5, 1.05, 10.5 + s * 1.45); p.castShadow = true; add(p);
  }
  const entry = makeSign('ВХОД', 1.6, .4, null, '#ffffff', 90);
  entry.position.set(33.79, 2.05, 10.5); entry.rotation.y = Math.PI / 2; add(entry);

  // постеры на фасаде
  [['🍅 −30%', '#e4453a'], ['🥩 СВЕЖЕЕ', '#8f4b38'], ['🥛 ФЕРМА', '#4f8cff'], ['🍕 НОВИНКА', '#e07a3c']]
    .forEach(([txt, col], i) => {
      const bgm = new THREE.Mesh(new THREE.BoxGeometry(1.5, 1.05, .08),
        new THREE.MeshStandardMaterial({ color: col, roughness: .7 }));
      bgm.position.set(20.6 + i * 3.4, 1.9, .72); add(bgm);
      const s = makeSign(txt, 1.35, .5, null, '#ffffff', 80);
      s.position.set(20.6 + i * 3.4, 1.9, .77); add(s);
    });

  // подвесные указатели над рядами полок
  ['🥬 СВЕЖЕЕ', '🥛 МОЛОЧНОЕ', '🍖 ГОРЯЧЕЕ', '🎂 ДЕСЕРТЫ'].forEach((txt, i) => {
    const x = 21 + i * 2;
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.7, .5, .1),
      new THREE.MeshStandardMaterial({ color: 0x2b6cff, roughness: .5 }));
    bar.position.set(x, 3.15, 5); add(bar);
    const s = makeSign(txt, 1.6, .42, null, '#ffffff', 64);
    s.position.set(x, 3.15, 5.07); add(s);
    const rod = new THREE.Mesh(new THREE.CylinderGeometry(.03, .03, .8, 6),
      new THREE.MeshStandardMaterial({ color: 0x9aa5b5 }));
    rod.position.set(x, 3.55, 5); add(rod);
  });

  // заборы огорода и загона
  const fenceMat = new THREE.MeshStandardMaterial({ color: 0xb07d4e, roughness: .9 });
  const post = new THREE.BoxGeometry(.13, .95, .13), railG = new THREE.BoxGeometry(1, .1, .09);
  const fenceRun = (x0, z0, dx, dz, n) => {
    for (let i = 0; i <= n; i++) {
      const p = new THREE.Mesh(post, fenceMat);
      p.position.set(x0 + dx * i, .47, z0 + dz * i); p.castShadow = true; add(p);
      if (i < n) for (const h of [.3, .68]) {
        const r = new THREE.Mesh(railG, fenceMat);
        r.position.set(x0 + dx * (i + .5), h, z0 + dz * (i + .5));
        if (dz) r.rotation.y = Math.PI / 2;
        add(r);
      }
    }
  };
  fenceRun(.5, .5, 1, 0, 10);        // север огорода
  fenceRun(.5, .5, 0, 1, 21);        // запад (весь бок)
  fenceRun(.5, 21.5, 1, 0, 10);      // юг загона
  fenceRun(.5, 12.5, 1, 0, 8);       // забор между огородом и загоном (калитка у x=9)

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
  zoneSign('🌱 ОГОРОД', 5, 11.6, 0x3f8f43);
  zoneSign('🐄 ЗАГОН', 5, 20.4, 0x8a6238);
  zoneSign('🍳 ЦЕХА', 14, 20.4, 0x546074);

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
  [[19.4, 3], [19.4, 18], [30, 3], [30, 18], [25.5, 10.5], [11.4, 3], [11.4, 18],
  [1.4, 3], [1.4, 18], [35.5, 10.5]].forEach(([x, z]) => lampAt(x, z));

  // реквизит
  for (const [x, z] of [[-2.5, 4], [-3, 12], [-2.5, 19], [6, -2.5], [16, -2.5], [30, -2.5], [36, 3], [36, 19], [-4, 25], [4, 25]]) {
    const t = makeTree(); t.position.set(x, 0, z); add(t);
  }
  for (const [x, z] of [[9.4, 2.5], [9.4, 9], [1.6, 6], [1.6, 15.5], [9.4, 19]]) {
    const b = makeBush(); b.position.set(x, 0, z); add(b);
  }
  for (const [x, z] of [[11.6, 1.6], [12.4, 1.6], [11.6, 20.4], [17, 1.6]]) {
    const c = makeCrate(); c.position.set(x, 0, z); c.rotation.y = Math.random(); add(c);
  }
  for (const [x, z] of [[1.8, 13.6], [2.6, 13.6], [1.8, 19.6]]) {
    const h = makeHay(); h.position.set(x, 0, z); add(h);
  }
  const trough = makeTrough(); trough.position.set(8.4, 0, 13.6); add(trough);
  const car = makeCar(0xe4453a); car.position.set(38.5, 0, 7); car.rotation.y = Math.PI / 2; add(car);
  const car2 = makeCar(0x4f8cff); car2.position.set(38.5, 0, 14); car2.rotation.y = Math.PI / 2; add(car2);
  for (let i = 0; i < 5; i++) {
    const c = makeCart();
    c.position.set(32.4, 0, 6.4 + i * .36); add(c);
  }

  // небо: купол + солнце/луна + облака + звёзды
  const skyGeo = new THREE.SphereGeometry(150, 24, 16);
  skyMat = new THREE.MeshBasicMaterial({ color: 0x9fd0ff, side: THREE.BackSide, fog: false, depthWrite: false });
  skinMaterial(skyMat, 'sky.jpg', [3, 1]);      // нарисованные облака; цвет продолжит красить небо по времени суток
  skyDome = new THREE.Mesh(skyGeo, skyMat); skyDome.position.set(17, 0, 10); add(skyDome);

  sunDisc = new THREE.Mesh(new THREE.SphereGeometry(3.2, 16, 12),
    new THREE.MeshBasicMaterial({ color: 0xfff3c4, fog: false }));
  add(sunDisc);

  const starGeo = new THREE.BufferGeometry();
  const sp = [];
  for (let i = 0; i < 260; i++) {
    const th = Math.random() * Math.PI * 2, ph = Math.random() * Math.PI * .45;
    sp.push(17 + Math.cos(th) * Math.cos(ph) * 120, Math.sin(Math.PI / 2 - ph) * 120, 10 + Math.sin(th) * Math.cos(ph) * 120);
  }
  starGeo.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3));
  starMat = new THREE.PointsMaterial({ color: 0xffffff, size: 1.1, transparent: true, opacity: 0, fog: false });
  add(new THREE.Points(starGeo, starMat));

  for (let i = 0; i < 9; i++) {
    const c = new THREE.Group();
    const m = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0x9fb8d8, emissiveIntensity: .12 });
    for (let j = 0; j < 4; j++) {
      const s = new THREE.Mesh(new THREE.SphereGeometry(1.6 + Math.random() * 1.4, 10, 8), m);
      s.position.set(j * 2 - 3 + Math.random(), Math.random() * .8, Math.random() * 1.6 - .8);
      c.add(s);
    }
    c.position.set(-30 + Math.random() * 110, 26 + Math.random() * 10, -30 + Math.random() * 90);
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
      it.position.set(.62, .1 + i * .34, .62 - i * .12);
      m.out.add(it);
    }
  }
  m.out.visible = far2(b.x + .5, b.y + .5) < ITEM_R2;

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
  const tx = Math.max(4.5, Math.min(30, fx));
  const tz = Math.max(4.5, Math.min(17, fy));
  cam.tx += (tx - cam.tx) * Math.min(1, dt * 5);
  cam.tz += (tz - cam.tz) * Math.min(1, dt * 5);
  const d = 12.5 * cam.dist, h = 13.5 * cam.dist;
  camera.position.set(
    cam.tx + Math.sin(cam.yaw) * d,
    h,
    cam.tz + Math.cos(cam.yaw) * d);
  camera.lookAt(cam.tx, 1.1, cam.tz);
}

/* ---------- кадр ---------- */
let popT = 0;
/* Всё, что далеко от камеры, просто не рисуем — иначе на большой карте
   набегает больше тысячи draw call и телефон захлёбывается. */
const GHOST_R2 = 15 * 15, ITEM_R2 = 19 * 19;
const far2 = (x, z) => (x - cam.tx) * (x - cam.tx) + (z - cam.tz) * (z - cam.tz);

function updateGhosts(t) {
  const pulse = .22 + Math.abs(Math.sin(t * 1.6)) * .18;
  const show = (g, free) => {
    g.visible = free && far2(g.position.x, g.position.z) < GHOST_R2;
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
  syncWorld();
  updateGhosts(t);
  for (const [b, m] of meshes.b) { updateBuildingMesh(b, m, t); m.pop = Math.min(1, m.pop + dt * 3.5); m.g.scale.setScalar(ease(m.pop)); }
  for (const [sh, m] of meshes.sh) {
    updateShelf(sh, m);
    m.pop = Math.min(1, m.pop + dt * 3.5); m.g.scale.setScalar(ease(m.pop));
    m.label.quaternion.copy(camera.quaternion);
    // ценник показываем рядом с игроком, а пустую полку видно издалека — её надо пополнить
    const d = Math.hypot(sh.x + .5 - player.x, sh.y + .5 - player.y);
    const a = sh.item ? Math.max(0, Math.min(1, (6.5 - d) / 2)) : Math.max(0, Math.min(1, (26 - d) / 4));
    m.label.visible = a > .02;
    m.label.material.opacity = a;
    m.box.visible = far2(sh.x + .5, sh.y + .5) < ITEM_R2;
    // полоска свежести: зелёная → жёлтая → красная, показываем только когда товар портится
    const f = freshness(sh);
    const perish = sh.item && ITEMS[sh.item].life > 0;
    m.fresh.visible = !!perish && sh.n > 0 && f < .96 && far2(sh.x + .5, sh.y + .5) < ITEM_R2;
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

  animChar(playerM, player, t, dt);
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
