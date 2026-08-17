/* Процедурные low-poly модели. Никаких внешних ассетов. */
'use strict';

const matCache = new Map();
function mat(color, o) {
  const key = color + '|' + JSON.stringify(o || {});
  let m = matCache.get(key);
  if (!m) {
    m = new THREE.MeshStandardMaterial(Object.assign({ color, roughness: .78, metalness: .02 }, o));
    matCache.set(key, m);
  }
  return m;
}
/* Геометрия кешируется: без этого каждая полка и каждый летящий товар
   плодили новые буферы и игра начинала тормозить. */
const geoCache = new Map();
function geo(key, make) {
  let g = geoCache.get(key);
  if (!g) { g = make(); geoCache.set(key, g); }
  return g;
}
function box(w, h, d, c, o) { const m = new THREE.Mesh(geo(`b${w},${h},${d}`, () => new THREE.BoxGeometry(w, h, d)), mat(c, o)); m.castShadow = m.receiveShadow = true; return m; }
function cyl(rt, rb, h, c, seg, o) { const s = seg || 14; const m = new THREE.Mesh(geo(`c${rt},${rb},${h},${s}`, () => new THREE.CylinderGeometry(rt, rb, h, s)), mat(c, o)); m.castShadow = m.receiveShadow = true; return m; }
function sph(r, c, o) { const m = new THREE.Mesh(geo(`s${r}`, () => new THREE.SphereGeometry(r, 14, 10)), mat(c, o)); m.castShadow = m.receiveShadow = true; return m; }
function cap(r, l, c, o) { const m = new THREE.Mesh(geo(`p${r},${l}`, () => new THREE.CapsuleGeometry(r, l, 5, 12)), mat(c, o)); m.castShadow = m.receiveShadow = true; return m; }
function at(m, x, y, z) { m.position.set(x, y, z); return m; }

/* ---------- товары ----------
   Модель товара собирается один раз и дальше клонируется. */
const itemTpl = new Map();
function makeItem(key) {
  let t = itemTpl.get(key);
  if (!t) { t = buildItem(key); itemTpl.set(key, t); }
  return t.clone(true);
}
const noShadow = (g) => { g.traverse(o => { o.castShadow = false; o.receiveShadow = false; }); return g; };

function buildItem(key) {
  const it = ITEMS[key], g = new THREE.Group(), c = it.c;
  const glossy = { roughness: .34 }, matte = { roughness: .92 };
  const stem = (h, r) => cyl(r || .045, (r || .045) * 1.3, h, 0x4a7c3f, 6);
  const leaf = (col, sx, sy) => {           // лист-лепесток
    const l = sph(.16, col || 0x4faf50, { roughness: .7 });
    l.scale.set(sx || 1.5, .22, sy || .8);
    return l;
  };

  switch (it.m) {
    case 'sphere': {                        // помидор / яблоко
      const body = sph(.5, c, glossy);
      body.scale.set(1, key === 'apple' ? 1.02 : .9, 1);
      g.add(at(body, 0, .48, 0));
      g.add(at(sph(.17, 0xffffff, { roughness: .05 }), -.2, .72, .22));   // блик
      g.children[1].scale.set(.5, .28, .35);
      g.add(at(stem(.22), 0, .92, 0));
      for (let i = 0; i < 5; i++) {         // чашелистик
        const l = leaf(0x3f8f43, 1.1, .55);
        l.position.set(Math.cos(i / 5 * 6.28) * .17, .84, Math.sin(i / 5 * 6.28) * .17);
        l.rotation.y = i / 5 * 6.28; l.rotation.z = -.35;
        g.add(l);
      }
      if (key === 'apple') { const lf = leaf(0x4faf50, 1.6, .7); lf.position.set(.16, .98, 0); lf.rotation.z = .4; g.add(lf); }
      break;
    }
    case 'capsule': {                       // огурец с пупырышками
      const m = cap(.24, .52, c); m.rotation.z = Math.PI / 2;
      g.add(at(m, 0, .3, 0));
      for (let i = 0; i < 7; i++) {
        const b = sph(.05, 0x5cb85f, matte);
        const a = i * 1.9;
        g.add(at(b, -.3 + i * .1, .3 + Math.sin(a) * .2, Math.cos(a) * .2));
      }
      g.add(at(cyl(.05, .06, .1, 0x6b8f3f, 6), .48, .3, 0));
      break;
    }
    case 'bundle': {                        // сноп пшеницы
      for (let i = 0; i < 5; i++) {
        const st = cyl(.028, .034, .95, 0xd9c07a, 5);
        st.position.set((i - 2) * .07, .5, (i % 2) * .06);
        st.rotation.z = (i - 2) * .05;
        g.add(st);
        for (let k = 0; k < 5; k++) {       // зёрна колоса
          const grain = sph(.055, c, matte);
          grain.scale.set(.8, 1.4, .8);
          grain.position.set(st.position.x + (k % 2 ? .05 : -.05), .72 + k * .08, st.position.z);
          g.add(grain);
        }
      }
      g.add(at(cyl(.24, .24, .09, 0xb5822f, 10, matte), 0, .3, 0));   // перевязь
      break;
    }
    case 'egg': {                           // яйцо / картофель
      const m = sph(.4, c, key === 'potato' ? matte : { roughness: .45 });
      m.scale.set(1, key === 'potato' ? .82 : 1.32, key === 'potato' ? .92 : 1);
      g.add(at(m, 0, .45, 0));
      if (key === 'potato') {               // неровности и глазки
        for (let i = 0; i < 4; i++) {
          const bump = sph(.12, c, matte);
          const a = i * 1.6;
          g.add(at(bump, Math.cos(a) * .26, .42 + Math.sin(a * 2) * .12, Math.sin(a) * .24));
          const eye = sph(.045, 0x7a5a2e, matte);
          g.add(at(eye, Math.cos(a + 1) * .3, .5, Math.sin(a + 1) * .28));
        }
      } else {
        const sh = sph(.16, 0xffffff, { roughness: .05 });
        sh.scale.set(.5, .5, .3); g.add(at(sh, -.14, .66, .26));
      }
      break;
    }
    case 'carton': {                        // тетрапак: молоко / сок
      g.add(at(box(.6, .82, .6, c, { roughness: .5 }), 0, .42, 0));
      const gable = cyl(.001, .43, .26, c, 4);   // «домик» сверху
      gable.rotation.y = Math.PI / 4;
      g.add(at(gable, 0, .95, 0));
      g.add(at(box(.62, .22, .62, key === 'juice' ? 0xd96a1f : 0x4f8cff), 0, .3, 0));
      g.add(at(cyl(.09, .09, .1, key === 'juice' ? 0x2b3648 : 0xffd75e, 10), .14, 1.08, 0));
      if (key === 'juice') {                     // трубочка
        const straw = cyl(.035, .035, .55, 0xffffff, 6);
        straw.rotation.z = .35; g.add(at(straw, -.16, 1.2, 0));
      }
      break;
    }
    case 'slab': {                          // мясо / стейк
      const meat = box(.86, .26, .58, c, matte);
      g.add(at(meat, 0, .16, 0));
      g.add(at(box(.86, .07, .58, key === 'steak' ? 0x5e2f22 : 0xe0919a, matte), 0, .31, 0));
      if (key === 'steak') for (let i = 0; i < 3; i++)   // следы от решётки
        g.add(at(box(.8, .02, .06, 0x2b1a12), 0, .35, -.16 + i * .16));
      else {
        g.add(at(box(.24, .1, .5, 0xf3ece0, matte), .3, .3, 0));       // жирок
        g.add(at(cyl(.09, .09, .3, 0xf7f2e6, 8, matte), -.36, .3, 0)); // косточка
      }
      break;
    }
    case 'bowl': {                          // салат в миске
      g.add(at(cyl(.55, .34, .3, 0xffffff, 16, glossy), 0, .16, 0));
      g.add(at(cyl(.56, .56, .05, 0xe8edf4, 16), 0, .3, 0));
      for (let i = 0; i < 7; i++) {
        const l = leaf(i % 2 ? 0x6cc46f : 0x4faf50, 1.8, 1.2);
        const a = i / 7 * 6.28;
        l.position.set(Math.cos(a) * .2, .34 + (i % 3) * .05, Math.sin(a) * .2);
        l.rotation.set(.2, a, .25);
        g.add(l);
      }
      g.add(at(sph(.1, 0xe4453a, glossy), .12, .44, .1));
      g.add(at(sph(.09, 0xe4453a, glossy), -.14, .42, -.08));
      break;
    }
    case 'loaf': {                          // батон
      const b = cap(.27, .66, c, matte); b.rotation.z = Math.PI / 2;
      g.add(at(b, 0, .3, 0));
      for (let i = 0; i < 4; i++) {         // надрезы
        const cut = box(.06, .1, .34, 0xe8b877, matte);
        cut.rotation.y = .35;
        g.add(at(cut, -.3 + i * .2, .5, 0));
      }
      break;
    }
    case 'wedge': {                         // сыр с дырками
      const w = cyl(.55, .55, .42, c, 3); w.rotation.y = .4;
      g.add(at(w, 0, .22, 0));
      for (let i = 0; i < 5; i++) {
        const hole = sph(.07, 0xd9a63c, matte);
        g.add(at(hole, -.1 + (i % 3) * .16, .12 + (i % 2) * .2, .02 + (i % 2) * .12));
      }
      g.add(at(box(.5, .02, .5, 0xffe9a8), 0, .44, 0));
      break;
    }
    case 'fries': {                         // фри в пачке
      const boxm = cyl(.3, .22, .5, 0xe4453a, 4); boxm.rotation.y = Math.PI / 4;
      g.add(at(boxm, 0, .25, 0));
      g.add(at(box(.34, .12, .34, 0xffffff), 0, .5, 0));
      for (let i = 0; i < 7; i++) {
        const f = box(.075, .42 + (i % 3) * .12, .075, c, matte);
        f.rotation.z = (Math.random() - .5) * .5; f.rotation.x = (Math.random() - .5) * .4;
        g.add(at(f, -.14 + (i % 4) * .09, .68, -.08 + Math.floor(i / 4) * .12));
      }
      break;
    }
    case 'cake': {                          // двухъярусный торт
      g.add(at(cyl(.56, .58, .3, c, 18, matte), 0, .15, 0));
      g.add(at(cyl(.57, .57, .08, 0xffffff, 18), 0, .32, 0));
      g.add(at(cyl(.38, .4, .26, c, 16, matte), 0, .49, 0));
      g.add(at(cyl(.39, .39, .07, 0xffffff, 16), 0, .64, 0));
      for (let i = 0; i < 6; i++) {         // розочки крема
        const a = i / 6 * 6.28;
        g.add(at(sph(.08, 0xffffff, glossy), Math.cos(a) * .42, .38, Math.sin(a) * .42));
      }
      g.add(at(cyl(.03, .03, .22, 0xff6b6b, 6), 0, .78, 0));
      g.add(at(sph(.05, 0xffd75e, { emissive: 0xffb703, emissiveIntensity: .8 }), 0, .92, 0));
      break;
    }
    case 'pizza': {                         // пицца с начинкой
      g.add(at(cyl(.62, .62, .09, 0xe8c48a, 20, matte), 0, .05, 0));
      const crust = new THREE.Mesh(
        geo('torus.62', () => new THREE.TorusGeometry(.6, .075, 8, 22)), mat(0xdcae72, matte));
      crust.rotation.x = Math.PI / 2; g.add(at(crust, 0, .09, 0));
      g.add(at(cyl(.54, .54, .05, 0xf0c04a, 20, matte), 0, .12, 0));
      for (let i = 0; i < 7; i++) {
        const a = i / 7 * 6.28, r = i % 2 ? .34 : .18;
        g.add(at(cyl(.1, .1, .035, 0xc0392b, 10, matte), Math.cos(a) * r, .16, Math.sin(a) * r));
        if (i % 3 === 0) g.add(at(leaf(0x4faf50, .5, .5), Math.cos(a + .6) * .28, .16, Math.sin(a + .6) * .28));
      }
      break;
    }
  }
  g.scale.setScalar(.42);
  return noShadow(g);          // мелочь тени не отбрасывает — иначе сотни лишних объектов в shadow map
}

/* ---------- фермы ---------- */
function makePlot(def) {
  const g = new THREE.Group();
  const soil = { roughness: 1 };
  g.add(at(box(.98, .12, .98, 0x8a6238, soil), 0, .04, 0));      // короб грядки
  g.add(at(box(.94, .2, .94, 0x5b3d24, soil), 0, .12, 0));       // земля
  for (let i = 0; i < 3; i++)                                     // борозды
    g.add(at(box(.86, .05, .1, 0x4a3120, soil), 0, .22, -.28 + i * .28));
  for (const s of [-1, 1]) {                                      // бортики
    g.add(at(box(.06, .16, .98, 0x9c7040, soil), s * .48, .16, 0));
    g.add(at(box(.98, .16, .06, 0x9c7040, soil), 0, .16, s * .48));
  }
  const plants = [];
  const c = ITEMS[def.out].c;
  for (let i = 0; i < 4; i++) {
    const p = new THREE.Group();
    p.add(at(cyl(.028, .05, .4, 0x3f8f3f, 6), 0, .2, 0));
    for (let k = 0; k < 4; k++) {                                 // листья веером
      const l = sph(.15, k % 2 ? 0x4faf50 : 0x3f8f43, { roughness: .75 });
      l.scale.set(1.5, .18, .8);
      const a = k / 4 * 6.28;
      l.position.set(Math.cos(a) * .13, .18 + k * .05, Math.sin(a) * .13);
      l.rotation.set(.15, a, .3);
      p.add(l);
    }
    const fruit = sph(.15, c, { roughness: .4 });
    fruit.scale.set(1, .9, 1);
    p.add(at(fruit, 0, .46, 0));
    p.add(at(sph(.05, 0x3f8f43, { roughness: .8 }), 0, .58, 0));
    p.position.set((i % 2 ? .21 : -.21), .22, (i < 2 ? .21 : -.21));
    p.userData.fruit = fruit;
    g.add(p); plants.push(p);
  }
  g.userData.plants = plants;
  return g;
}
function makeCoop() {
  const g = new THREE.Group();
  const wood = { roughness: .9 };
  g.add(at(box(.9, .5, .8, 0xdca86a, wood), 0, .25, 0));
  for (let i = 0; i < 4; i++)                                     // доски
    g.add(at(box(.92, .04, .82, 0xc08f56, wood), 0, .12 + i * .12, 0));
  const roof = cyl(.001, .74, .42, 0xc0392b, 4, wood); roof.rotation.y = Math.PI / 4;
  g.add(at(roof, 0, .7, 0));
  g.add(at(cyl(.05, .05, .16, 0xf7f2ea, 8), 0, .95, 0));
  g.add(at(box(.28, .3, .05, 0x5b3a1e, wood), 0, .17, .42));      // лаз
  g.add(at(box(.34, .05, .22, 0xa8813f, wood), 0, .04, .52));     // трапик
  const hen = new THREE.Group();
  const body = sph(.17, 0xf7f2ea, { roughness: .7 }); body.scale.set(1.15, 1, .9);
  hen.add(at(body, 0, .17, 0));
  hen.add(at(sph(.1, 0xf7f2ea, { roughness: .7 }), 0, .32, .09));
  const beak = cyl(.001, .045, .1, 0xe8a33d, 6); beak.rotation.x = Math.PI / 2;
  hen.add(at(beak, 0, .31, .2));
  for (const s of [-1, 1]) hen.add(at(sph(.022, 0x1c1a19), s * .045, .35, .16));  // глаза
  for (let i = 0; i < 3; i++) hen.add(at(sph(.045, 0xe74c3c), -.04 + i * .04, .4 + (i % 2) * .02, .06));
  for (let i = 0; i < 3; i++) {                                   // хвост
    const f = sph(.09, 0xf0e8dc, { roughness: .8 }); f.scale.set(.4, 1.1, .5);
    f.rotation.z = -.5 + i * .3;
    hen.add(at(f, -.16, .26 + i * .03, 0));
  }
  for (const s of [-1, 1]) hen.add(at(cyl(.018, .018, .1, 0xe8a33d, 5), s * .05, .06, .02));
  hen.position.set(.3, 0, .3);
  g.add(hen); g.userData.hen = hen;
  return g;
}
function makeCow() {
  const g = new THREE.Group(), body = new THREE.Group();
  const hide = { roughness: .85 };
  const torso = cap(.24, .52, 0xf3f1ec, hide); torso.rotation.z = Math.PI / 2;
  body.add(at(torso, 0, .66, 0));
  for (const [x, y, z, r] of [[.12, .82, .1, .12], [-.18, .64, .2, .1], [-.05, .58, -.22, .11]])
    body.add(at(sph(r, 0x2c2c2c, hide), x, y, z));                // пятна
  const head = new THREE.Group();
  const skull = sph(.19, 0xf3f1ec, hide); skull.scale.set(1, 1.05, 1.15);
  head.add(skull);
  const muzzle = sph(.13, 0xf1a7b0, { roughness: .6 }); muzzle.scale.set(1, .8, .7);
  head.add(at(muzzle, 0, -.06, .18));
  for (const s of [-1, 1]) head.add(at(sph(.022, 0x1c1a19), s * .09, .06, .16));
  for (const s of [-1, 1]) {                                      // рога
    const horn = cyl(.02, .045, .16, 0xe8dfcf, 6); horn.rotation.z = s * .5;
    head.add(at(horn, s * .12, .2, 0));
    const ear = sph(.07, 0xf3f1ec, hide); ear.scale.set(1.3, .5, .8);
    head.add(at(ear, s * .2, .06, -.02));
  }
  head.position.set(.48, .78, 0);
  body.add(head);
  for (const [x, z] of [[.24, .16], [.24, -.16], [-.24, .16], [-.24, -.16]]) {
    body.add(at(cyl(.055, .05, .48, 0xf3f1ec, 7, hide), x, .26, z));
    body.add(at(cyl(.062, .062, .1, 0x2c2c2c, 7), x, .05, z));     // копыта
  }
  body.add(at(sph(.1, 0xf1c9cf, { roughness: .6 }), -.05, .42, 0));   // вымя
  const tail = cyl(.02, .015, .34, 0xf3f1ec, 5, hide); tail.rotation.z = .35;
  body.add(at(tail, -.44, .64, 0));
  body.add(at(sph(.05, 0x2c2c2c, hide), -.52, .46, 0));
  g.add(body); g.userData.body = body; g.userData.head = head;
  return g;
}
function makePig() {
  const g = new THREE.Group(), body = new THREE.Group();
  const skin = { roughness: .8 };
  const torso = cap(.23, .4, 0xf1a7b0, skin); torso.rotation.z = Math.PI / 2;
  body.add(at(torso, 0, .52, 0));
  const head = sph(.21, 0xf1a7b0, skin); head.scale.set(1, .95, 1.05);
  body.add(at(head, .4, .56, 0));
  const snout = cyl(.1, .11, .1, 0xe08a96, 10, { roughness: .6 }); snout.rotation.z = Math.PI / 2;
  body.add(at(snout, .58, .52, 0));
  for (const s of [-1, 1]) {
    body.add(at(sph(.018, 0x2b1a12), .63, .52, s * .04));          // ноздри
    body.add(at(sph(.022, 0x1c1a19), .5, .64, s * .1));           // глаза
    const ear = sph(.08, 0xe08a96, skin); ear.scale.set(.6, 1, .35);
    ear.rotation.z = s * .3;
    body.add(at(ear, .32, .74, s * .11));
  }
  for (const [x, z] of [[.16, .13], [.16, -.13], [-.16, .13], [-.16, -.13]]) {
    body.add(at(cyl(.055, .05, .36, 0xf1a7b0, 7, skin), x, .2, z));
    body.add(at(cyl(.062, .062, .08, 0xd07a86, 7), x, .04, z));
  }
  for (let i = 0; i < 5; i++) {                                   // хвост-спираль
    const a = i * 1.5;
    body.add(at(sph(.028, 0xe08a96, skin), -.4 - Math.sin(a) * .05, .5 + i * .035, Math.cos(a) * .06));
  }
  g.add(body); g.userData.body = body;
  return g;
}
function makeTree2() {                       // яблоня
  const g = new THREE.Group();
  const bark = { roughness: 1 };
  g.add(at(cyl(.1, .17, .85, 0x6b4a2c, 8, bark), 0, .42, 0));
  for (const s of [-1, 1]) {                 // ветви
    const br = cyl(.04, .06, .38, 0x6b4a2c, 6, bark);
    br.rotation.z = s * .8; g.add(at(br, s * .13, .78, 0));
  }
  const crown = [[0, 1.08, 0, .46], [.3, .92, .18, .3], [-.28, .96, -.16, .28], [.1, 1.2, -.24, .26]];
  for (const [x, y, z, r] of crown)
    g.add(at(sph(r, y > 1.1 ? 0x4faf50 : 0x3e8e41, { roughness: .85 }), x, y, z));
  const apples = [];
  for (let i = 0; i < 6; i++) {
    const a = sph(.1, 0xd6342f, { roughness: .35 });
    const t = i / 6 * 6.28;
    a.position.set(Math.cos(t) * .4, .92 + Math.sin(t * 2) * .2, Math.sin(t) * .36);
    g.add(a); apples.push(a);
  }
  g.userData.fruits = apples;
  return g;
}
function makeHay() {
  const g = new THREE.Group();
  const straw = { roughness: 1 };
  const b = cyl(.34, .34, .72, 0xd9b46a, 14, straw); b.rotation.z = Math.PI / 2;
  g.add(at(b, 0, .34, 0));
  for (let i = 0; i < 5; i++)                // фактура соломы
    g.add(at(cyl(.345, .345, .03, 0xc9a25a, 14, straw), -.28 + i * .14, .34, 0));
  for (const s of [-1, 1]) g.add(at(box(.05, .7, .7, 0xb08a45, straw), s * .2, .34, 0));
  return g;
}
function makeTrough() {                      // поилка
  const g = new THREE.Group();
  const wood = { roughness: .95 };
  g.add(at(box(1.4, .3, .5, 0x8a6238, wood), 0, .16, 0));
  for (const s of [-1, 1]) g.add(at(box(.08, .34, .5, 0x6b4a2c, wood), s * .66, .17, 0));
  g.add(at(box(1.24, .06, .38, 0x4f8cff, { roughness: .1, metalness: .1 }), 0, .28, 0));
  return g;
}
function makeCart() {                        // тележка
  const g = new THREE.Group();
  const steel = { metalness: .45, roughness: .35 };
  g.add(at(box(.5, .04, .62, 0x9fb4cc, steel), 0, .26, 0));
  for (let i = 0; i < 4; i++) {              // решётка корзины
    g.add(at(box(.5, .3, .03, 0x9fb4cc, steel), 0, .42, -.28 + i * .19));
  }
  for (const s of [-1, 1]) g.add(at(box(.03, .3, .6, 0x9fb4cc, steel), s * .24, .42, 0));
  g.add(at(box(.5, .05, .05, 0x2b6cff, { roughness: .5 }), 0, .6, -.3));   // ручка
  for (const [x, z] of [[.2, .26], [-.2, .26], [.2, -.26], [-.2, -.26]]) {
    const w = cyl(.06, .06, .04, 0x2b3648, 8); w.rotation.x = Math.PI / 2;
    g.add(at(w, x, .06, z));
    g.add(at(box(.03, .16, .03, 0x6b7a90, steel), x, .16, z));
  }
  return g;
}
function makeCar(color) {
  const g = new THREE.Group();
  const paint = { roughness: .3, metalness: .35 }, glass = { roughness: .05, metalness: .2 };
  g.add(at(box(3.4, .5, 1.62, color, paint), 0, .52, 0));
  g.add(at(box(3.3, .18, 1.66, color, paint), 0, .8, 0));
  const cabin = box(1.7, .5, 1.5, color, paint);
  g.add(at(cabin, -.15, 1.1, 0));
  g.add(at(box(1.5, .34, 1.54, 0x2b3648, glass), -.15, 1.14, 0));          // окна
  g.add(at(box(.1, .3, 1.4, 0x2b3648, glass), .72, 1.1, 0));
  for (const [x, z] of [[1.1, .84], [1.1, -.84], [-1.1, .84], [-1.1, -.84]]) {
    const w = cyl(.32, .32, .24, 0x1c1f26, 14); w.rotation.x = Math.PI / 2;
    g.add(at(w, x, .32, z));
    const rim = cyl(.16, .16, .26, 0xb9c2cf, 10, { metalness: .6, roughness: .3 });
    rim.rotation.x = Math.PI / 2; g.add(at(rim, x, .32, z));
  }
  for (const s of [-1, 1]) {
    g.add(at(box(.1, .18, .34, 0xfff3c4, { emissive: 0xfff3c4, emissiveIntensity: .4 }), 1.72, .62, s * .52));
    g.add(at(box(.08, .16, .3, 0xd94f4f, { emissive: 0xd94f4f, emissiveIntensity: .3 }), -1.72, .62, s * .52));
  }
  g.add(at(box(.2, .12, 1.5, 0x2b3648, { roughness: .6 }), 1.76, .42, 0));  // бампер
  return g;
}
function makeTrash(kind) {
  const g = new THREE.Group();
  const matte = { roughness: .95 };
  if (kind === 0) {                          // смятый стакан
    const c = cyl(.11, .07, .26, 0xd94f4f, 10, matte); c.rotation.z = .9;
    g.add(at(c, 0, .1, 0));
    g.add(at(cyl(.12, .12, .03, 0xffffff, 10), .1, .2, .04));
  } else if (kind === 1) {                    // бутылка
    const b = cyl(.07, .08, .3, 0x4f8cff, 8, { roughness: .2 }); b.rotation.z = 1.4;
    g.add(at(b, 0, .08, 0));
    g.add(at(cyl(.03, .03, .07, 0xffffff, 6), .18, .08, 0));
  } else {                                    // пакет с обёрткой
    const p = box(.3, .06, .26, 0xf0b429, matte); p.rotation.y = .5;
    g.add(at(p, 0, .04, 0));
    const q = box(.18, .05, .16, 0xffffff, matte); q.rotation.y = -.4;
    g.add(at(q, .08, .09, .05));
  }
  return g;
}
function makeMachine(def) {
  const g = new THREE.Group();
  g.add(at(box(.92, .62, .84, 0xd8dee9, { roughness: .5 }), 0, .31, 0));
  g.add(at(box(.96, .12, .88, def.ac, { roughness: .4 }), 0, .68, 0));
  g.add(at(box(.5, .3, .04, 0x2b3648, { roughness: .2, metalness: .3 }), 0, .38, .43));
  const lamp = sph(.09, def.ac, { emissive: def.ac, emissiveIntensity: 0 });
  g.add(at(lamp, .3, .82, 0));
  const pipe = cyl(.07, .07, .5, 0x9aa5b5, 8);
  g.add(at(pipe, -.3, .95, 0));
  g.userData.lamp = lamp; g.userData.pipe = pipe;
  return g;
}

/* ---------- магазин ---------- */
function makeShelf() {
  const g = new THREE.Group();
  const w = .94, d = .82;
  g.add(at(box(w, .08, d, 0xc9d1dc), 0, .05, 0));
  g.add(at(box(w, .06, d, 0xe6ebf2), 0, .46, 0));
  g.add(at(box(w, .06, d, 0xe6ebf2), 0, .86, 0));
  g.add(at(box(.06, .95, .06, 0x9aa5b5), -.44, .5, .38));
  g.add(at(box(.06, .95, .06, 0x9aa5b5), .44, .5, .38));
  g.add(at(box(.06, .95, .06, 0x9aa5b5), -.44, .5, -.38));
  g.add(at(box(.06, .95, .06, 0x9aa5b5), .44, .5, -.38));
  g.add(at(box(w, .82, .05, 0x4f8cff), 0, .55, -.42));
  g.add(at(box(w, .1, .07, 0xffd75e), 0, .12, -.42));
  const slots = [];
  for (let r = 0; r < 2; r++) for (let i = 0; i < 4; i++) {
    const s = new THREE.Object3D();
    s.position.set(-.3 + (i % 2) * .6, r ? .89 : .49, .18 - Math.floor(i / 2) * .36);
    g.add(s); slots.push(s);
  }
  g.userData.slots = slots;
  return g;
}
function makeRegister() {
  const g = new THREE.Group();
  g.add(at(box(.96, .78, .9, 0xe8edf4), 0, .39, 0));
  g.add(at(box(1.0, .08, .94, 0x4f8cff), 0, .82, 0));
  const scr = box(.34, .26, .06, 0x1d2432, { emissive: 0x2b6cff, emissiveIntensity: .35 });
  scr.rotation.x = -.25; g.add(at(scr, .22, 1.02, -.1));
  g.add(at(box(.36, .1, .28, 0x2b3648), -.2, .91, .05));
  g.add(at(box(.9, .04, .34, 0x3a4358), 0, .88, .34));
  return g;
}

/* ---------- персонажи ---------- */
function makeChar(shirt, skin, hat, hair) {
  const g = new THREE.Group();
  const cloth = { roughness: .85 }, boot = { roughness: .6 };

  // ноги с ботинками
  const legL = new THREE.Group(), legR = new THREE.Group();
  for (const [grp, s] of [[legL, 1], [legR, -1]]) {
    grp.add(at(cyl(.065, .06, .32, 0x2f3a4d, 7, cloth), 0, -.16, 0));
    grp.add(at(box(.13, .07, .2, 0x1f2733, boot), 0, -.33, .03));
    grp.position.set(s * .1, .34, 0);
    g.add(grp);
  }

  const body = new THREE.Group();
  const torso = cap(.17, .24, shirt, cloth);
  body.add(at(torso, 0, .21, 0));
  body.add(at(box(.3, .06, .21, 0x2f3a4d, cloth), 0, .06, 0));        // пояс

  // руки с кистями
  const armL = new THREE.Group(), armR = new THREE.Group();
  for (const [grp, s] of [[armL, 1], [armR, -1]]) {
    grp.add(at(cap(.052, .15, shirt, cloth), 0, -.09, 0));
    grp.add(at(sph(.062, skin, { roughness: .7 }), 0, -.2, 0));
    grp.position.set(s * .23, .3, 0);
    body.add(grp);
  }

  // голова: лицо, волосы, уши
  const head = new THREE.Group();
  const skull = sph(.185, skin, { roughness: .72 });
  skull.scale.set(1, 1.08, .96);
  head.add(skull);
  for (const s of [-1, 1]) {
    head.add(at(sph(.026, 0x2b2118), s * .07, .02, .16));             // глаза
    head.add(at(sph(.035, skin, { roughness: .72 }), s * .18, -.01, 0));  // уши
  }
  head.add(at(box(.07, .015, .03, 0xb56a5c), 0, -.07, .17));          // рот
  const hairCap = sph(.196, hair || 0x3b2f2a, { roughness: .95 });
  hairCap.scale.set(1, .62, 1);
  head.add(at(hairCap, 0, .08, -.01));
  head.position.y = .56;
  body.add(head);

  if (hat) {                                                          // колпак/кепка
    body.add(at(cyl(.15, .175, .1, hat, 14, cloth), 0, .74, 0));
    body.add(at(cyl(.14, .14, .16, hat, 14, cloth), 0, .84, 0));
    body.add(at(box(.2, .04, .16, hat, cloth), 0, .72, .14));
  }
  body.position.y = .34;
  g.add(body);

  const hold = new THREE.Object3D(); hold.position.set(0, .78, .3); g.add(hold);
  g.userData = { legL, legR, body, armL, armR, head, hold, phase: Math.random() * 6 };
  // Персонажей много: вместо честных теней — мягкое пятно под ногами.
  noShadow(g);
  const blob = new THREE.Mesh(
    geo('blob', () => new THREE.CircleGeometry(.3, 14)),
    new THREE.MeshBasicMaterial({ color: 0x0b1220, transparent: true, opacity: .26, depthWrite: false }));
  blob.rotation.x = -Math.PI / 2; blob.position.y = .03; blob.renderOrder = -1;
  g.add(blob);
  return g;
}

/* ---------- декор ---------- */
function makeTree() {
  const g = new THREE.Group();
  g.add(at(cyl(.1, .14, .7, 0x6b4a2c, 7), 0, .35, 0));
  g.add(at(sph(.46, 0x3e8e41), 0, .95, 0));
  g.add(at(sph(.32, 0x4faf50), .28, .78, .18));
  g.add(at(sph(.28, 0x357e39), -.24, .82, -.16));
  g.scale.setScalar(.9 + Math.random() * .5);
  return g;
}
function makeBush() {
  const g = new THREE.Group();
  g.add(at(sph(.26, 0x4faf50), 0, .2, 0));
  g.add(at(sph(.18, 0x3e8e41), .22, .16, .1));
  return g;
}
function makeCrate() {
  const g = new THREE.Group();
  g.add(at(box(.5, .4, .5, 0xb98a52), 0, .2, 0));
  g.add(at(box(.52, .06, .52, 0x8a6238), 0, .38, 0));
  return g;
}

/* ---------- служебные помещения ----------
   Склад, погрузка, кабинет и комната персонала: только реквизит, играть тут не надо,
   но магазин без подсобки выглядит недостроенным. */
function makeRack() {                        // стеллаж с коробками
  const g = new THREE.Group();
  const post = 0x6b7484;
  for (const x of [-.62, .62]) for (const z of [-.24, .24]) g.add(at(box(.08, 2.1, .08, post), x, 1.05, z));
  for (const y of [.42, 1.06, 1.7]) {
    g.add(at(box(1.4, .07, .58, 0x8d97a8), 0, y, 0));
    const n = 1 + ((Math.random() * 3) | 0);
    for (let i = 0; i < n; i++) {
      const c = [0xb98a52, 0xc79a63, 0xa87b48][(Math.random() * 3) | 0];
      g.add(at(box(.34, .28, .38, c), -.45 + i * .45, y + .18, 0));
    }
  }
  return g;
}
function makePallet() {                      // поддон с мешками
  const g = new THREE.Group();
  g.add(at(box(1.2, .12, .9, 0x9a7b4f), 0, .06, 0));
  for (const z of [-.28, .28]) g.add(at(box(1.2, .07, .16, 0x8a6238), 0, .16, z));
  for (let i = 0; i < 3; i++) {
    const sack = sph(.3, [0xe8dcc0, 0xd9cbaa, 0xefe6d2][i], { roughness: .95 });
    sack.scale.set(1.5, .8, 1.1);
    g.add(at(sack, -.28 + i * .28, .3 + (i % 2) * .3, (i % 2 ? .1 : -.1)));
  }
  return g;
}
function makeDesk() {                        // стол с монитором и стулом
  const g = new THREE.Group();
  g.add(at(box(1.3, .07, .7, 0xb98a52), 0, .74, 0));
  for (const x of [-.58, .58]) for (const z of [-.28, .28]) g.add(at(box(.07, .74, .07, 0x8a6238), x, .37, z));
  g.add(at(box(.5, .34, .04, 0x1d2432), 0, .96, -.2));
  g.add(at(box(.16, .06, .1, 0x2f3a4d), 0, .79, -.2));
  const ch = new THREE.Group();
  ch.add(at(box(.44, .07, .44, 0x2b6cff), 0, .44, 0));
  ch.add(at(box(.44, .5, .07, 0x2b6cff), 0, .68, -.2));
  ch.add(at(cyl(.05, .05, .44, 0x6b7484, 8), 0, .22, 0));
  ch.add(at(cyl(.22, .22, .06, 0x3a4152, 10), 0, .03, 0));
  ch.position.set(0, 0, .62);
  g.add(ch);
  return g;
}
function makeLockers() {                     // шкафчики персонала
  const g = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    g.add(at(box(.56, 1.7, .5, 0x4f6b9a), i * .6, .85, 0));
    g.add(at(box(.06, .1, .04, 0xd7e2f2), i * .6 + .2, 1.0, .26));
    g.add(at(box(.4, .05, .02, 0x2b3a55), i * .6, 1.45, .26));
  }
  return g;
}
function makeCooler() {                      // кулер с водой
  const g = new THREE.Group();
  g.add(at(box(.42, .95, .42, 0xe9eef6), 0, .48, 0));
  g.add(at(cyl(.19, .21, .48, 0x8fd0ff, 12, { transparent: true, opacity: .75 }), 0, 1.2, 0));
  g.add(at(box(.12, .12, .1, 0x2b6cff), 0, .62, .24));
  return g;
}
function makeFridgeDoor() {                  // морозильная камера на складе
  const g = new THREE.Group();
  g.add(at(box(1.8, 2.2, .35, 0xc9d4e2), 0, 1.1, 0));
  g.add(at(box(1.5, 1.9, .06, 0x9fb4cc), 0, 1.1, .2));
  g.add(at(box(.1, .5, .08, 0x6b7484), .55, 1.1, .26));
  return g;
}

function makeBench() {                       // скамейка
  const g = new THREE.Group();
  for (const x of [-.55, .55]) {
    g.add(at(box(.12, .42, .5, 0x6b7484), x, .21, 0));
    g.add(at(box(.12, .5, .1, 0x6b7484), x, .66, -.2));
  }
  for (let i = 0; i < 3; i++) g.add(at(box(1.4, .07, .14, 0xb98a52), 0, .45, -.16 + i * .16));
  for (let i = 0; i < 2; i++) g.add(at(box(1.4, .14, .07, 0xb98a52), 0, .66 + i * .18, -.24));
  return g;
}
function makeFlowerbed() {                   // клумба
  const g = new THREE.Group();
  g.add(at(cyl(.62, .68, .28, 0xa9744a, 12), 0, .14, 0));
  g.add(at(cyl(.54, .54, .06, 0x6b4a2c, 12), 0, .29, 0));
  const cols = [0xff6b6b, 0xffd166, 0xf2a2c0, 0xc77dff, 0xffffff];
  for (let i = 0; i < 9; i++) {
    const a = i / 9 * 6.28, r = .12 + Math.random() * .3;
    g.add(at(sph(.055, 0x4faf50), Math.cos(a) * r, .34, Math.sin(a) * r));
    g.add(at(sph(.085, cols[i % cols.length], { roughness: .5 }), Math.cos(a) * r, .44, Math.sin(a) * r));
  }
  return g;
}
function makeBin() {                         // урна
  const g = new THREE.Group();
  g.add(at(cyl(.24, .2, .62, 0x3f4a5c, 10), 0, .31, 0));
  g.add(at(cyl(.27, .27, .05, 0x6ee7a0, 10), 0, .63, 0));
  g.add(at(cyl(.12, .12, .02, 0x1d2432, 8), 0, .66, 0));
  return g;
}

/* Текстовая табличка (вывеска, ценники). Текстуры кешируются по содержимому —
   ценники на полках меняются часто, каждый раз рисовать холст дорого. */
const signCache = new Map();
function makeSign(text, w, h, bg, fg, fontPx) {
  const key = [text, w, h, bg, fg, fontPx].join('|');
  const cached = signCache.get(key);
  const mkMesh = (tex) => new THREE.Mesh(
    geo(`pl${w},${h}`, () => new THREE.PlaneGeometry(w, h)),
    new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false }));
  if (cached) return mkMesh(cached);

  const c = document.createElement('canvas');
  c.width = 256; c.height = Math.max(16, Math.round(256 * h / w));
  const x = c.getContext('2d');
  if (bg) {
    const r = Math.min(c.width, c.height) * .28;
    x.fillStyle = bg;
    x.beginPath();
    if (x.roundRect) x.roundRect(2, 2, c.width - 4, c.height - 4, r);
    else x.rect(2, 2, c.width - 4, c.height - 4);
    x.fill();
  }
  let fp = (fontPx || 90) * .5;                 // холст 256, размеры заданы в масштабе 512
  x.textAlign = 'center'; x.textBaseline = 'middle';
  do { x.font = `800 ${fp}px system-ui, sans-serif`; fp -= 2; }
  while (fp > 7 && x.measureText(text).width > c.width * .92);
  x.fillStyle = fg;
  x.fillText(text, c.width / 2, c.height / 2 + 2);
  const tex = new THREE.CanvasTexture(c);
  tex.anisotropy = 4;
  if (signCache.size < 400) signCache.set(key, tex);
  return mkMesh(tex);
}
