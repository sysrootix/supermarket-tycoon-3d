/* Точка входа: связывает симуляцию, сцену и интерфейс. */
'use strict';

const V3 = (x, y, z) => new THREE.Vector3(x, y, z);
const entPos = (e) => V3(e.x, 1.0, e.y);

function handleEvents() {
  for (const ev of G.ev) {
    switch (ev.t) {
      case 'pick': {
        const target = ev.to === 'player' ? (() => entPos(player)) : (() => entPos(ev.to));
        spawnFlyer(ev.item, V3(ev.x, .9, ev.y), target, 1.0);
        if (ev.to === 'player') SFX.pick();
        break;
      }
      case 'drop': {
        const from = ev.from === 'player' ? entPos(player) : entPos(ev.from);
        spawnFlyer(ev.item, from, V3(ev.x, .95, ev.y), .8);
        if (ev.from === 'player') SFX.drop();
        break;
      }
      case 'sale':
        floatText(ev.x, ev.y, (ev.vip ? '👑 ' : '') + '+' + rub(ev.v), ev.hot ? '#ff9f68' : '#ffd75e');
        spawnCoins(ev.x, ev.y, ev.vip ? 6 : 3);
        SFX.coin(); bumpMoney();
        break;
      case 'angry':
        floatText(ev.x, ev.y, '😡 ушёл', '#ff6b6b');
        SFX.angry();
        break;
      case 'quest':
        toast('🎯 ' + ev.d + ' · +' + rub(ev.r), 'good');
        floatText(player.x, player.y, '+' + rub(ev.r), '#9fc6ff');
        spawnConfetti(player.x, player.y);
        SFX.quest(); bumpMoney();
        break;
      case 'day':
        MUSIC.next();                     // каждый игровой день — новая тема из 20

        if (ev.sal === 0) toast('🌅 День ' + G.day + ' начался');
        else if (ev.ok) toast('💸 Зарплата: −' + rub(ev.sal));
        else toast('⚠️ Нечем платить зарплату! Репутация −15', 'bad');
        SFX.day();
        break;
      case 'build':
        toast('✅ ' + ev.name + ' — куплено', 'good');
        break;
      case 'level':
        toast('🏆 Уровень ' + ev.lvl + '! +' + rub(ev.r), 'good');
        floatText(player.x, player.y, 'УРОВЕНЬ ' + ev.lvl, '#ffd75e');
        spawnConfetti(player.x, player.y);
        SFX.quest(); bumpMoney();
        break;
      case 'sell':
        toast('🗑️ ' + ev.name + ' снесена · +' + rub(ev.back), 'good');
        floatText(ev.x, ev.y, '+' + rub(ev.back), '#6ee7a0');
        SFX.drop(); bumpMoney();
        break;
      case 'level-up':
        toast('⬆ ' + ev.name + ' — уровень ' + ev.lvl, 'good');
        floatText(ev.x, ev.y, 'УР. ' + ev.lvl, '#c77dff');
        spawnConfetti(ev.x, ev.y);
        break;
      case 'hot':
        toast('🔥 Товар дня: ' + ITEMS[ev.item].e + ' ' + ITEMS[ev.item].n + ' — цена ×' + HOT_MUL);
        break;
      case 'litter':
        floatText(ev.x, ev.y, '🗑️', '#ff9f68');
        break;
      case 'clean':
        SFX.pick();
        break;
    }
  }
  G.ev.length = 0;
}

let last = performance.now(), sheetTick = 0, fpsAcc = 0, fpsN = 0, fpsT = 0, tick = 0;
function frame(now) {
  const dt = Math.max(0, Math.min(.05, (now - last) / 1000));
  last = now;
  const t = now / 1000;
  tick++;

  simUpdate(dt, getInput());
  handleEvents();
  renderFrame(t, dt);
  updateHUD(dt);
  updateFloats(dt);
  if (tick % 3 === 0) drawMinimap();          // мини-карта не нуждается в 60 fps
  if (tick % 60 === 0) {                      // ночью музыка становится тише и спокойнее
    const p = G.dayT / DAY_LEN;
    MUSIC.setNight(p < .24 || p > .8);
  }

  // если кадры стабильно проседают — сами снижаем качество (после прогрева)
  if (dt > 0 && tick > 120) { fpsAcc += 1 / dt; fpsN++; fpsT += dt; }
  if (fpsT > 4) {
    const fps = fpsAcc / fpsN;
    if (fps < 38 && quality > 0) {
      setQuality(quality - 1);
      toast('⚙️ Качество графики снижено ради плавности');
    }
    fpsAcc = fpsN = fpsT = 0;
  }

  if (sheetOpen) { sheetTick += dt; if (sheetTick > .5) { sheetTick = 0; renderSheet(); } }
  requestAnimationFrame(frame);
}

async function boot() {
  await simInit();
  initScene(document.getElementById('cv'));
  wireUI();
  syncWorld();
  renderFrame(0, 0);
  setTimeout(() => {
    document.getElementById('loader').classList.add('gone');
    setTimeout(() => document.getElementById('loader').remove(), 600);
    showTitle();                      // титульный экран вместо мгновенного старта
  }, 350);
  requestAnimationFrame(frame);

  if (location.protocol.startsWith('http')) {
    navigator.serviceWorker?.register('sw.js').catch(() => {});
  }
}
boot();
