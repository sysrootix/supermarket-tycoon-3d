/* Синтезированные звуки — без файлов. */
'use strict';
const SFX = (() => {
  let ac = null, master = null, on = lsGet('mt3d_sound') !== '0';
  function ctx() {
    if (!ac) {
      ac = new (window.AudioContext || window.webkitAudioContext)();
      master = ac.createGain(); master.gain.value = .3; master.connect(ac.destination);
    }
    if (ac.state === 'suspended') ac.resume();
    return ac;
  }
  function blip(freq, dur, type, vol, slide) {
    if (!on) return;
    const a = ctx(), o = a.createOscillator(), g = a.createGain();
    o.type = type || 'sine';
    o.frequency.setValueAtTime(freq, a.currentTime);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, slide), a.currentTime + dur);
    g.gain.setValueAtTime(0, a.currentTime);
    g.gain.linearRampToValueAtTime(vol || .5, a.currentTime + .01);
    g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
    o.connect(g); g.connect(master);
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
    n.connect(f); f.connect(g); g.connect(master); n.start();
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
