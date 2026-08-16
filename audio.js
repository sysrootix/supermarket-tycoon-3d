/* Синтезированные звуки — без файлов. */
'use strict';
/* Общий аудиоконтекст: отдельные шины для эффектов и музыки,
   чтобы музыку можно было приглушить, не трогая звуки. */
let AC = null, sfxBus = null, musBus = null, reverb = null;
function audioCtx() {
  if (!AC) {
    AC = new (window.AudioContext || window.webkitAudioContext)();
    sfxBus = AC.createGain(); sfxBus.gain.value = .3; sfxBus.connect(AC.destination);
    musBus = AC.createGain(); musBus.gain.value = .0; musBus.connect(AC.destination);

    // мягкая «комната»: импульс из затухающего шума, дёшево и сильно красит звук
    reverb = AC.createConvolver();
    const len = AC.sampleRate * 1.6, buf = AC.createBuffer(2, len, AC.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.6);
    }
    reverb.buffer = buf;
    const wet = AC.createGain(); wet.gain.value = .28;
    reverb.connect(wet); wet.connect(AC.destination);
  }
  if (AC.state === 'suspended') AC.resume();
  return AC;
}

const SFX = (() => {
  let on = lsGet('mt3d_sound') !== '0';
  const ctx = audioCtx;
  const master = { get gain() { return sfxBus.gain; } };
  function blip(freq, dur, type, vol, slide) {
    if (!on) return;
    const a = ctx(), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), a.currentTime + dur);
    g.gain.setValueAtTime(0, a.currentTime);
    g.gain.linearRampToValueAtTime(vol || .5, a.currentTime + .01);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    o.connect(g); g.connect(sfxBus);
    o.start(); o.stop(a.currentTime + dur + .02);
  }
  function noise(dur, vol, hp) {
    if (!on) return;
    const a = ctx(), n = a.createBufferSource();
    const buf = a.createBuffer(1, a.sampleRate * dur, a.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    n.buffer = buf;
    const f = a.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp || 800;
    const g = a.createGain(); g.gain.value = vol || .2;
    n.connect(f); f.connect(g); g.connect(sfxBus); n.start();
  }
  return {
    get on() { return on; },
    toggle() { on = !on; lsSet('mt3d_sound', on ? '1' : '0'); if (on) this.ui(); return on; },
    pick() { blip(620, .08, 'triangle', .35, 900); },
    drop() { blip(340, .09, 'triangle', .3, 240); },
    coin() { blip(880, .07, 'square', .22); setTimeout(() => blip(1320, .1, 'square', .18), 60); },
    cash() { blip(660, .06, 'square', .25); setTimeout(() => blip(990, .12, 'square', .2), 70); noise(.08, .08, 2000); },
    build() { blip(300, .12, 'sawtooth', .25, 700); setTimeout(() => blip(700, .18, 'triangle', .28, 1200), 90); },
    quest() {[0, 90, 180].forEach((d, i) => setTimeout(() => blip([523, 659, 784][i], .22, 'triangle', .3), d)); },
    angry() { blip(240, .25, 'sawtooth', .22, 90); },
    error() { blip(180, .18, 'square', .2, 120); },
    ui() { blip(520, .05, 'sine', .18); },
    day() {[0, 130].forEach((d, i) => setTimeout(() => blip([392, 523][i], .3, 'sine', .25), d)); },
  };
})();

/* ---------- фоновая музыка ----------
   Никаких файлов: 20 непохожих тем собираются на лету из аккордовых петель.
   Ноты планируются заранее (look-ahead), иначе на слабых устройствах ритм плывёт. */
const MUSIC = (() => {
  const ROOT = 261.63;                               // до первой октавы
  const semi = (n) => ROOT * Math.pow(2, n / 12);

  // аккордовые петли: [бас, [ступени аккорда]]
  const P = {
    pop: [[-12, [0, 4, 7]], [-5, [-1, 2, 7]], [-3, [0, 4, 9]], [-7, [0, 5, 9]]],          // I V vi IV
    calm: [[-12, [0, 4, 7]], [-7, [0, 5, 9]], [-12, [0, 4, 7]], [-5, [-1, 2, 7]]],
    folk: [[-12, [0, 4, 7]], [-3, [0, 4, 9]], [-7, [0, 5, 9]], [-5, [-1, 2, 7]]],
    minor: [[-3, [0, 4, 9]], [-8, [0, 5, 8]], [-10, [-1, 2, 7]], [-5, [-1, 2, 7]]],       // vi IV V
    jazzy: [[-12, [0, 4, 7, 11]], [-2, [0, 5, 9, 12]], [-7, [-1, 2, 7, 11]], [-12, [0, 4, 7, 11]]],
    waltz: [[-12, [0, 4, 7]], [-5, [-1, 2, 7]], [-8, [0, 5, 8]], [-7, [0, 5, 9]]],
  };
  const SCALES = {
    penta: [0, 2, 4, 7, 9, 12, 14, 16],
    major: [0, 2, 4, 5, 7, 9, 11, 12, 14],
    minorP: [0, 3, 5, 7, 10, 12, 15],
    dorian: [0, 2, 3, 5, 7, 9, 10, 12],
  };

  /* 20 тем в духе игры: утро на ферме, суета зала, ночная смена. */
  const TRACKS = [
    { n: 'Утро на грядке', bpm: 84, key: 0, ch: P.calm, sc: 'penta', lead: 'sine', dens: .5, sh: 1, sw: 0 },
    { n: 'Свежий помидор', bpm: 96, key: 0, ch: P.pop, sc: 'penta', lead: 'triangle', dens: .62, sh: 1, sw: 0 },
    { n: 'Молочный экспресс', bpm: 104, key: 2, ch: P.pop, sc: 'major', lead: 'sine', dens: .66, sh: 1, sw: 0 },
    { n: 'Хлебная печь', bpm: 90, key: -3, ch: P.folk, sc: 'major', lead: 'triangle', dens: .55, sh: 1, sw: 0 },
    { n: 'Кассовый ритм', bpm: 112, key: 5, ch: P.pop, sc: 'penta', lead: 'square', dens: .7, sh: 1, sw: 0 },
    { n: 'Ярмарка', bpm: 118, key: 7, ch: P.folk, sc: 'major', lead: 'triangle', dens: .72, sh: 1, sw: 0 },
    { n: 'Сонный загон', bpm: 74, key: -5, ch: P.calm, sc: 'penta', lead: 'sine', dens: .4, sh: 0, sw: 0 },
    { n: 'Огуречный вальс', bpm: 100, key: 2, ch: P.waltz, sc: 'major', lead: 'triangle', dens: .58, sh: 0, sw: 1 },
    { n: 'Гриль и дым', bpm: 106, key: -2, ch: P.minor, sc: 'minorP', lead: 'triangle', dens: .6, sh: 1, sw: 0 },
    { n: 'Ночная смена', bpm: 78, key: -7, ch: P.minor, sc: 'dorian', lead: 'sine', dens: .42, sh: 0, sw: 0 },
    { n: 'Тележки в ряд', bpm: 110, key: 3, ch: P.pop, sc: 'penta', lead: 'square', dens: .68, sh: 1, sw: 0 },
    { n: 'Сырное соло', bpm: 92, key: 5, ch: P.jazzy, sc: 'dorian', lead: 'sine', dens: .55, sh: 1, sw: 1 },
    { n: 'Яблоневый сад', bpm: 86, key: 7, ch: P.calm, sc: 'major', lead: 'sine', dens: .5, sh: 0, sw: 0 },
    { n: 'Картофельный марш', bpm: 114, key: -4, ch: P.folk, sc: 'penta', lead: 'triangle', dens: .7, sh: 1, sw: 0 },
    { n: 'Пиццерия', bpm: 108, key: 4, ch: P.jazzy, sc: 'major', lead: 'triangle', dens: .64, sh: 1, sw: 1 },
    { n: 'Сладкий цех', bpm: 94, key: 9, ch: P.pop, sc: 'major', lead: 'sine', dens: .6, sh: 1, sw: 0 },
    { n: 'Дождь над фермой', bpm: 80, key: -9, ch: P.minor, sc: 'minorP', lead: 'sine', dens: .45, sh: 0, sw: 0 },
    { n: 'Час пик', bpm: 124, key: 0, ch: P.pop, sc: 'penta', lead: 'square', dens: .78, sh: 1, sw: 0 },
    { n: 'Курочка Ряба', bpm: 98, key: 2, ch: P.folk, sc: 'penta', lead: 'triangle', dens: .6, sh: 1, sw: 1 },
    { n: 'Закрываемся', bpm: 76, key: -12, ch: P.calm, sc: 'penta', lead: 'sine', dens: .38, sh: 0, sw: 0 },
  ];

  let on = lsGet('mt3d_music') !== '0';
  let timer = null, nextAt = 0, step = 0, night = 0;
  let idx = (Math.random() * TRACKS.length) | 0, cur = TRACKS[idx], onTrack = null;

  const env = (g, t, a, d, peak) => {
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(.0008, t + a + d);
  };
  function tone(freq, t, dur, type, peak, toReverb) {
    const o = AC.createOscillator(), g = AC.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    env(g, t, type === 'sine' ? .012 : .035, dur, peak);
    o.connect(g); g.connect(musBus);
    if (toReverb) g.connect(reverb);
    o.start(t); o.stop(t + dur + .12);
  }
  function shaker(t, peak) {
    const n = AC.createBufferSource();
    const len = (AC.sampleRate * .06) | 0, b = AC.createBuffer(1, len, AC.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    n.buffer = b;
    const f = AC.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = 5200;
    const g = AC.createGain(); env(g, t, .005, .05, peak);
    n.connect(f); f.connect(g); g.connect(musBus);
    n.start(t);
  }

  const beatsPerBar = () => (cur.sw ? 6 : 8);        // 3/4 для вальса, 4/4 для остального
  const stepDur = () => 60 / cur.bpm / 2;

  function playStep(i, t) {
    const bpb = beatsPerBar();
    const bar = Math.floor(i / bpb) % cur.ch.length;
    const beat = i % bpb;
    const [bass, notes] = cur.ch[bar];
    const k = cur.key;
    const strong = cur.sw ? beat === 0 : (beat === 0 || beat === 4);

    if (strong) tone(semi(bass + k), t, beat ? .5 : .85, 'triangle', night ? .12 : .17);
    if (beat === 0) for (const n of notes) tone(semi(n + k), t, cur.sw ? 1.3 : 1.7, 'sine', .05, true);
    // вальсовое «раз-два-три»: лёгкие аккорды на 2 и 3 долю
    if (cur.sw && (beat === 2 || beat === 4)) for (const n of notes) tone(semi(n + k + 12), t, .3, 'sine', .028, true);

    const sc = SCALES[cur.sc];
    const melodyBeats = night ? [2, bpb - 2] : (cur.sw ? [1, 3, 5] : [1, 3, 5, 6, 7]);
    if (melodyBeats.includes(beat) && Math.random() < (night ? .4 : cur.dens)) {
      const n = sc[(Math.random() * sc.length) | 0] + (Math.random() < .28 ? 12 : 0) + k;
      tone(semi(n), t, .55, cur.lead, cur.lead === 'square' ? .05 : .085, true);
      if (Math.random() < .22) tone(semi(n + 7), t + .03, .4, 'sine', .035, true);
    }
    if (cur.sh && !night && beat % 2 === 1) shaker(t, .045);
  }

  function scheduler() {
    if (!on || !AC) return;
    let guard = 0;
    while (nextAt < AC.currentTime + .35 && guard++ < 64) {
      playStep(step, nextAt);
      nextAt += stepDur(); step++;
    }
  }
  function start() {
    if (!on || timer) return;
    audioCtx();
    nextAt = AC.currentTime + .1; step = 0;
    musBus.gain.cancelScheduledValues(AC.currentTime);
    musBus.gain.setValueAtTime(musBus.gain.value, AC.currentTime);
    musBus.gain.linearRampToValueAtTime(night ? .3 : .5, AC.currentTime + 2);
    timer = setInterval(scheduler, 90);
    if (onTrack) onTrack(cur.n);
  }
  function stop(fade) {
    if (!timer) return;
    if (AC) {
      musBus.gain.cancelScheduledValues(AC.currentTime);
      musBus.gain.setValueAtTime(musBus.gain.value, AC.currentTime);
      musBus.gain.linearRampToValueAtTime(0, AC.currentTime + (fade === 0 ? .01 : fade || .4));
    }
    clearInterval(timer); timer = null;
  }
  function next(delta) {
    idx = (idx + (delta || 1) + TRACKS.length) % TRACKS.length;
    cur = TRACKS[idx];
    if (timer) { stop(.25); setTimeout(start, 320); } else if (onTrack) onTrack(cur.n);
    return cur.n;
  }

  return {
    get on() { return on; },
    get track() { return cur.n; },
    get list() { return TRACKS.map(t => t.n); },
    start, stop, next,
    onTrack(fn) { onTrack = fn; },
    toggle() {
      on = !on; lsSet('mt3d_music', on ? '1' : '0');
      if (on) start(); else stop();
      return on;
    },
    // ночью петля тише и спокойнее
    setNight(v) {
      const n = v ? 1 : 0;
      if (n === night) return;
      night = n;
      if (AC && timer) musBus.gain.linearRampToValueAtTime(n ? .3 : .5, AC.currentTime + 3);
    },
  };
})();

// автозапуск после первого касания: браузеры не дают играть звук без действия игрока
['pointerdown', 'keydown', 'touchstart'].forEach(ev =>
  addEventListener(ev, () => MUSIC.start(), { once: true }));
