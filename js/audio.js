/* Game audio: every sound is generated in code with WebAudio (chiptune pulse/triangle waves and noise),
   so the game ships no audio files and still runs offline from a downloaded folder.
   window.GameAudio.play('card_deal') plays a sound effect; GameAudio.voice(sceneId, text) plays a dealer's
   speech blips; GameAudio.settings / setSetting(key, value) hold the volumes. Browsers keep audio locked
   until the first click or key press, so the engine starts itself on that first gesture. */
(function (root) {
  'use strict';

  const DEFAULTS = { master: 0.8, music: 0.6, sfx: 0.8, muted: false, setSounds: true };
  const settings = Object.assign({}, DEFAULTS);
  const listeners = [];

  let ctx = null, master = null, sfxBus = null, musicBus = null, echoIn = null, noiseBuf = null;
  const waves = {};

  // ------------------------------------------------------------------ engine
  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return ctx; }
    const AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
    master = ctx.createGain();
    // a gentle limiter so stacked sounds never clip
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -10; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.12;
    master.connect(comp); comp.connect(ctx.destination);
    sfxBus = ctx.createGain(); sfxBus.connect(master);
    musicBus = ctx.createGain(); musicBus.connect(master);
    // a shared echo for sounds that ask for it (wet: 0-1): delay -> darker -> feedback
    echoIn = ctx.createGain();
    const dl = ctx.createDelay(1), lp = ctx.createBiquadFilter(), fb = ctx.createGain();
    dl.delayTime.value = 0.19; lp.type = 'lowpass'; lp.frequency.value = 2400; fb.gain.value = 0.42;
    echoIn.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(sfxBus);
    // white noise, 1 second, reused by every noise sound
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    // pulse waves (the classic chiptune 12.5% / 25% duty cycles)
    for (const duty of [0.125, 0.25]) waves[duty] = pulseWave(duty);
    applyVolumes(0);
    return ctx;
  }
  function pulseWave(duty) {
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * 2;
    return ctx.createPeriodicWave(re, im);
  }
  function applyVolumes(ramp = 0.05) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const m = settings.muted ? 0 : settings.master;
    master.gain.setTargetAtTime(m * m, t, ramp);          // squared so the slider feels even to the ear
    sfxBus.gain.setTargetAtTime(settings.sfx * settings.sfx, t, ramp);
    musicBus.gain.setTargetAtTime(settings.music * settings.music, t, ramp);
  }
  function unlockOnGesture() {
    const go = () => { ensure(); root.removeEventListener('pointerdown', go, true); root.removeEventListener('keydown', go, true); };
    root.addEventListener('pointerdown', go, true);
    root.addEventListener('keydown', go, true);
  }

  // ------------------------------------------------------------------ primitives
  const NOTE = { C: -9, 'C#': -8, D: -7, 'D#': -6, E: -5, F: -4, 'F#': -3, G: -2, 'G#': -1, A: 0, 'A#': 1, B: 2 };
  function hz(note) {
    if (typeof note === 'number') return note;
    const m = /^([A-G]#?)(-?\d)$/.exec(note);
    return 440 * Math.pow(2, (NOTE[m[1]] + (Number(m[2]) - 4) * 12) / 12);
  }
  function out(bus, pan, wet) {
    let node = bus;
    if (pan && ctx.createStereoPanner) { node = ctx.createStereoPanner(); node.pan.value = pan; node.connect(bus); }
    if (!wet) return node;
    const split = ctx.createGain(), send = ctx.createGain();
    send.gain.value = wet; split.connect(node); split.connect(send); send.connect(echoIn);
    return split;
  }
  // One oscillator note with a quick attack and an exponential fade.
  function tone(o) {
    const t = ctx.currentTime + (o.at || 0), dur = o.dur || 0.1, vol = o.vol == null ? 0.3 : o.vol;
    const osc = ctx.createOscillator(), g = ctx.createGain();
    if (o.wave === 'triangle' || o.wave === 'sine' || o.wave === 'square' || o.wave === 'sawtooth') osc.type = o.wave;
    else osc.setPeriodicWave(waves[o.duty || 0.25]);
    const f0 = hz(o.f);
    osc.frequency.setValueAtTime(f0, t);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(hz(o.to), t + (o.slide || dur));
    if (o.vib) {                                         // vibrato
      const lfo = ctx.createOscillator(), lg = ctx.createGain();
      lfo.frequency.value = o.vib.rate || 6; lg.gain.value = f0 * (o.vib.depth || 0.02);
      lfo.connect(lg); lg.connect(osc.frequency); lfo.start(t); lfo.stop(t + dur + 0.05);
    }
    const a = o.attack || 0.004;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    if (o.hold) g.gain.setValueAtTime(vol, t + a + o.hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(g); g.connect(out(o.bus || sfxBus, o.pan, o.wet));
    osc.start(t); osc.stop(t + dur + 0.02);
  }
  // A burst of filtered noise; f/to sweep the filter for swishes and riffles.
  function noise(o) {
    const t = ctx.currentTime + (o.at || 0), dur = o.dur || 0.08, vol = o.vol == null ? 0.3 : o.vol;
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf; src.loop = true;
    f.type = o.filter || 'bandpass'; f.Q.value = o.q || 1;
    f.frequency.setValueAtTime(o.f || 2000, t);
    if (o.to) f.frequency.exponentialRampToValueAtTime(o.to, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + (o.attack || 0.003));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(out(o.bus || sfxBus, o.pan, o.wet));
    src.start(t, Math.random() * 0.5); src.stop(t + dur + 0.02);
  }
  const seq = (notes, step, o) => notes.forEach((n, i) => n && tone(Object.assign({}, o, { f: n, at: (o.at || 0) + i * step })));
  const jitter = (x, amt) => x * (1 + (Math.random() * 2 - 1) * amt);

  // ------------------------------------------------------------------ sound effects
  const SFX = {
    // --- cards
    card_deal: (o) => {                                   // a card sliding across felt, then landing
      noise({ f: 5200, to: 1400, dur: 0.09, vol: 0.22, q: 0.8, pan: o.pan });
      noise({ at: 0.075, f: 900, filter: 'lowpass', dur: 0.035, vol: 0.25, pan: o.pan });
    },
    card_flip: (o) => {
      noise({ f: 3000, dur: 0.03, vol: 0.2, q: 2, pan: o.pan });
      tone({ at: 0.02, f: 1400, to: 2100, dur: 0.05, vol: 0.06, duty: 0.125, pan: o.pan });
      noise({ at: 0.05, f: 1200, filter: 'lowpass', dur: 0.03, vol: 0.2, pan: o.pan });
    },
    shuffle: () => {                                      // a riffle: many quick flicks speeding up
      let t = 0;
      for (let i = 0; i < 28; i++) { noise({ at: t, f: jitter(3800, 0.25), dur: 0.025, vol: 0.12, q: 3, pan: (i % 2 ? -0.3 : 0.3) }); t += 0.034 - i * 0.0006; }
      noise({ at: t + 0.06, f: 700, filter: 'lowpass', dur: 0.08, vol: 0.35 });   // squared up on the felt
      noise({ at: t + 0.16, f: 700, filter: 'lowpass', dur: 0.06, vol: 0.25 });
    },
    // --- chips (clay chips: a bright click with a short ring)
    chip_place: (o) => chip(0, o.pan),
    chip_stack: (o) => { chip(0, o.pan); chip(0.07, o.pan, 1.06); chip(0.13, o.pan, 1.12); },
    chip_collect: (o) => { for (let i = 0; i < 7; i++) chip(i * 0.045, o.pan, 0.9 + i * 0.05, 0.7); },
    // --- player actions
    bet: () => { seq(['E5', 'A5'], 0.06, { dur: 0.08, vol: 0.12, duty: 0.25 }); },
    deal: () => { seq(['C5', 'G5'], 0.07, { dur: 0.09, vol: 0.14 }); noise({ at: 0.14, f: 4000, to: 1500, dur: 0.12, vol: 0.12 }); },
    hit: () => { tone({ f: 'A5', to: 'E6', dur: 0.07, slide: 0.05, vol: 0.13, duty: 0.25 }); },
    stand: () => { tone({ f: 220, to: 150, dur: 0.12, vol: 0.35, wave: 'triangle' }); noise({ f: 400, filter: 'lowpass', dur: 0.05, vol: 0.25 }); },
    double: () => { seq(['A5', 'A6'], 0.08, { dur: 0.08, vol: 0.12 }); chip(0.16); chip(0.22, 0, 1.08); },
    split: () => {
      tone({ f: 'E5', to: 'B4', dur: 0.14, vol: 0.12, pan: -0.6 });
      tone({ f: 'E5', to: 'B5', dur: 0.14, vol: 0.12, pan: 0.6 });
    },
    insurance: () => { seq(['G5', 'D6'], 0.09, { dur: 0.16, vol: 0.09, duty: 0.125 }); },
    surrender: () => { tone({ f: 'A4', to: 'D4', dur: 0.35, slide: 0.3, vol: 0.13, duty: 0.25 }); },
    // --- results
    win: () => {
      seq(['C5', 'E5', 'G5', 'C6'], 0.075, { dur: 0.12, vol: 0.14 });
      tone({ at: 0.3, f: 'C6', dur: 0.32, vol: 0.12, vib: { rate: 7, depth: 0.012 } });
      seq(['C3', 'G3'], 0.15, { dur: 0.2, vol: 0.3, wave: 'triangle' });
    },
    blackjack: () => {                                    // the big one: fanfare, held chord and sparkles
      seq(['G4', 'C5', 'E5', 'G5', 'C6'], 0.07, { dur: 0.12, vol: 0.14 });
      for (const [n, v] of [['C6', 0.11], ['E5', 0.07], ['G5', 0.07]]) tone({ at: 0.36, f: n, dur: 0.75, hold: 0.25, vol: v, vib: { rate: 6, depth: 0.01 }, duty: n === 'C6' ? 0.25 : 0.125 });
      seq(['C3', 'C3', 'G3', 'C4'], 0.09, { dur: 0.14, vol: 0.3, wave: 'triangle' });
      tone({ at: 0.36, f: 'C3', dur: 0.75, hold: 0.25, vol: 0.3, wave: 'triangle' });
      for (let i = 0; i < 6; i++) tone({ at: 0.45 + i * 0.07, f: jitter(2600 + i * 250, 0.05), dur: 0.06, vol: 0.05, duty: 0.125, pan: i % 2 ? 0.5 : -0.5 });
    },
    push: () => { seq(['E5', 'E5'], 0.13, { dur: 0.1, vol: 0.11 }); seq(['A3', 'A3'], 0.13, { dur: 0.12, vol: 0.25, wave: 'triangle' }); },
    lose: () => { seq(['E5', 'C5', 'A4'], 0.13, { dur: 0.16, vol: 0.12 }); tone({ at: 0.26, f: 'A2', dur: 0.4, vol: 0.3, wave: 'triangle' }); },
    bust: () => {
      noise({ f: 1600, to: 200, dur: 0.3, vol: 0.3, q: 0.7 });
      tone({ f: 'B4', to: 'B2', dur: 0.4, slide: 0.35, vol: 0.13, duty: 0.25 });
      tone({ at: 0.03, f: 'F4', to: 'F2', dur: 0.4, slide: 0.35, vol: 0.08, duty: 0.125 });
    },
    dealer_blackjack: () => { seq(['A4', 'G#4', 'G4'], 0.16, { dur: 0.2, vol: 0.12, vib: { rate: 5, depth: 0.015 } }); tone({ at: 0.48, f: 'F#4', dur: 0.6, vol: 0.12, vib: { rate: 5, depth: 0.02 } }); },
    // --- game flow
    achievement: () => {
      seq(['G5', 'C6', 'E6', 'G6'], 0.07, { dur: 0.1, vol: 0.11, duty: 0.125 });
      tone({ at: 0.28, f: 'C7', dur: 0.5, vol: 0.09, duty: 0.125, vib: { rate: 8, depth: 0.01 } });
      seq(['C4', 'E4', 'G4', 'C5'], 0.07, { dur: 0.12, vol: 0.22, wave: 'triangle' });
      for (let i = 0; i < 5; i++) tone({ at: 0.32 + i * 0.06, f: 3200 + i * 300, dur: 0.05, vol: 0.04, duty: 0.125 });
    },
    goal: () => {                                         // Challenge goal reached
      seq(['C5', 'C5', 'C5', 'G5', 'E5', 'G5', 'C6'], 0.11, { dur: 0.14, vol: 0.13 });
      tone({ at: 0.77, f: 'C6', dur: 0.9, hold: 0.4, vol: 0.12, vib: { rate: 6, depth: 0.012 } });
      seq(['C3', 'C3', 'C3', 'G2', 'C3', 'G2', 'C3'], 0.11, { dur: 0.14, vol: 0.3, wave: 'triangle' });
    },
    broke: () => { seq(['G4', 'F#4', 'F4', 'E4'], 0.22, { dur: 0.26, vol: 0.12, vib: { rate: 5, depth: 0.02 } }); tone({ at: 0.66, f: 'E2', dur: 0.9, vol: 0.32, wave: 'triangle' }); },
    secret_unlock: () => {                                // something hidden opens: a dark swell, then it resolves
      noise({ f: 300, to: 3000, dur: 0.9, vol: 0.12, q: 6, attack: 0.6, wet: 0.3 });
      tone({ f: 'A2', dur: 1.0, attack: 0.5, vol: 0.28, wave: 'triangle' });
      seq(['A5', 'G#5', 'G5', 'F#5'], 0.09, { at: 0.1, dur: 0.12, vol: 0.06, duty: 0.125, wet: 0.5 });
      seq(['A4', 'C5', 'E5', 'A5', 'C#6', 'E6'], 0.08, { at: 0.95, dur: 0.14, vol: 0.12, wet: 0.35 });
      for (const [n, v] of [['A5', 0.1], ['C#6', 0.07], ['E6', 0.07]]) tone({ at: 1.45, f: n, dur: 1.2, hold: 0.4, vol: v, duty: 0.125, vib: { rate: 6, depth: 0.012 }, wet: 0.4 });
      tone({ at: 0.95, f: 'A2', dur: 1.7, hold: 0.6, vol: 0.3, wave: 'triangle' });
      for (let i = 0; i < 8; i++) tone({ at: 1.5 + i * 0.07, f: jitter(3000 + i * 220, 0.05), dur: 0.06, vol: 0.04, duty: 0.125, pan: i % 2 ? 0.6 : -0.6, wet: 0.5 });
    },
    insanity_unlock: () => {                              // The Darkest Run: everything spirals into a black hole, then a vast dark chord
      let t = 0, gap = 0.16;
      for (let i = 0; i < 24; i++) { tone({ at: t, f: 700 * Math.pow(0.93, i), dur: 0.1, vol: 0.08, wave: 'triangle', pan: Math.sin(i * 1.1) * 0.9, wet: 0.4 }); t += gap; gap *= 0.88; }
      noise({ f: 2000, to: 50, dur: 1.4, vol: 0.2, filter: 'lowpass', attack: 0.4 });
      tone({ f: 120, to: 30, slide: 1.4, dur: 1.5, vol: 0.4, wave: 'sine' });
      tone({ at: 1.5, f: 80, to: 22, dur: 1.4, vol: 0.55, wave: 'sine' });                                  // the boom
      noise({ at: 1.5, f: 400, to: 60, dur: 1.2, vol: 0.3, filter: 'lowpass' });
      for (const [n, v] of [['C2', 0.14], ['G2', 0.1], ['D#3', 0.08], ['A#3', 0.06], ['D4', 0.04]]) {
        tone({ at: 1.7, f: n, dur: 2.4, hold: 1.0, attack: 0.5, vol: v, wave: 'sawtooth', wet: 0.5 });
        tone({ at: 1.7, f: hz(n) * 1.008, dur: 2.4, hold: 1.0, attack: 0.5, vol: v * 0.7, wave: 'sine', wet: 0.5 });
      }
      for (let i = 0; i < 6; i++) tone({ at: 2.3 + i * 0.22, f: hz('G4') * (1 - i * 0.03), dur: 0.5, vol: 0.05, wave: 'triangle', pan: i % 2 ? 0.6 : -0.6, wet: 0.6 });
    },
    // --- menus
    ui_click: () => { tone({ f: 1320, dur: 0.035, vol: 0.08, duty: 0.25 }); },
    ui_hover: () => { tone({ f: 2200, dur: 0.018, vol: 0.025, duty: 0.125 }); },
    ui_back: () => { tone({ f: 990, to: 660, dur: 0.06, vol: 0.08, duty: 0.25 }); },
    ui_toggle: () => { seq([880, 1320], 0.04, { dur: 0.04, vol: 0.07 }); },
    ui_locked: () => { tone({ f: 160, dur: 0.12, vol: 0.12, duty: 0.25 }); tone({ at: 0.09, f: 150, dur: 0.12, vol: 0.12, duty: 0.25 }); },
    equip: () => { seq(['E6', 'B6'], 0.05, { dur: 0.06, vol: 0.07, duty: 0.125 }); noise({ f: 6000, dur: 0.05, vol: 0.06, q: 2 }); },
  };
  function chip(at, pan, pitch = 1, vol = 1) {
    noise({ at, f: 4200 * pitch, dur: 0.018, vol: 0.32 * vol, q: 4, pan });
    tone({ at, f: jitter(2350, 0.04) * pitch, dur: 0.05, vol: 0.05 * vol, wave: 'triangle', pan });
    tone({ at, f: jitter(3470, 0.04) * pitch, dur: 0.035, vol: 0.03 * vol, wave: 'sine', pan });
  }

  // ------------------------------------------------------------------ dealer voices
  // Speech-bubble "talk": one blip per syllable-ish chunk of the line, pitched per dealer.
  const VOICES = {
    corner:  { name: 'Old Tito',       wave: 'triangle', lo: 120, hi: 170, rate: 0.085, len: 0.07, vol: 0.32 },
    orbit:   { name: 'T1-T0',          duty: 0.125, lo: 330, hi: 330, alt: 440, rate: 0.06, len: 0.045, vol: 0.09 },
    deco:    { name: 'Madame Odette',  duty: 0.125, lo: 520, hi: 700, rate: 0.07, len: 0.06, vol: 0.08, vib: 0.015 },
    liner:   { name: 'Captain Odette', duty: 0.25, lo: 480, hi: 640, rate: 0.065, len: 0.055, vol: 0.08, vib: 0.03 },
    neon:    { name: 'Vinnie',         duty: 0.25, lo: 230, hi: 330, rate: 0.055, len: 0.045, vol: 0.1 },
    mars:    { name: 'Vinnie X',       duty: 0.25, lo: 230, hi: 330, rate: 0.055, len: 0.045, vol: 0.09, ring: 1.5 },
    vip:     { name: 'Mr. Valdez',     wave: 'triangle', lo: 100, hi: 135, rate: 0.11, len: 0.1, vol: 0.32 },
    horizon: { name: 'Zyx',            wave: 'sine', lo: 280, hi: 900, rate: 0.075, len: 0.07, vol: 0.14, glide: true },
  };
  function voice(sceneId, text) {
    if (!ready()) return 0;
    const v = VOICES[sceneId]; if (!v) return 0;
    const chunks = String(text).split(/\s+/).flatMap((w) => w.match(/[^aeiouy]*[aeiouy]+|[^aeiouy]+$/gi) || [w]).slice(0, 24);
    chunks.forEach((c, i) => {
      const end = /[.!?]$/.test(c), q = /\?$/.test(c);
      let f = v.alt ? (i % 2 ? v.alt : v.lo) : v.lo + Math.random() * (v.hi - v.lo);
      const base = { at: i * v.rate, dur: v.len * (end ? 1.8 : 1), vol: v.vol, wave: v.wave, duty: v.duty };
      if (v.glide) tone(Object.assign(base, { f, to: f * (Math.random() < 0.5 ? 0.6 : 1.6) }));
      else tone(Object.assign(base, { f, to: q && end ? f * 1.35 : undefined, vib: v.vib ? { rate: 18, depth: v.vib } : undefined }));
      if (v.ring) tone(Object.assign({}, base, { f: f * v.ring, vol: v.vol * 0.4, duty: 0.125, wave: undefined }));
    });
    return chunks.length * v.rate;
  }

  // ------------------------------------------------------------------ secret set sounds
  // A secret card back or face equipped swaps the card sounds (deal, flip, shuffle).
  // Wearing the whole set (back, face, felt and chips) also swaps the win, lose and blackjack stings.
  // Turned off by the "Set sounds" setting. Set names match `set` in js/cosmetics.js.
  const CARD_SOUNDS = ['card_deal', 'card_flip', 'shuffle'];
  const swish = (pan, vol = 0.18) => noise({ f: 5200, to: 1400, dur: 0.09, vol, q: 0.8, pan });
  const riffle = (pan, extra) => { let t = 0; for (let i = 0; i < 24; i++) { noise({ at: t, f: jitter(3800, 0.25), dur: 0.025, vol: 0.1, q: 3, pan: i % 2 ? -0.3 : 0.3 }); t += 0.034 - i * 0.0006; } extra(t + 0.06); };
  const chord = (notes, at, dur, o) => notes.forEach((n, i) => tone(Object.assign({ hold: dur * 0.4 }, o, { f: n, at, dur, vol: (o.vol || 0.1) * (i ? 0.7 : 1) })));
  const heartbeat = (at, vol = 0.45) => { tone({ at, f: 70, to: 45, dur: 0.12, vol, wave: 'sine' }); tone({ at: at + 0.16, f: 62, to: 40, dur: 0.14, vol: vol * 0.8, wave: 'sine' }); };
  const bell = (at, f, vol = 0.08, o = {}) => { for (const [m, v] of [[1, 1], [2.76, 0.4], [5.4, 0.2]]) tone(Object.assign({ at, f: hz(f) * m, dur: o.dur || 0.6, vol: vol * v, wave: 'sine' }, o)); };
  const howl = (at, base, vol = 0.1, wet = 0.5) => tone({ at, f: base, to: base * 1.5, slide: 0.35, dur: 1.3, hold: 0.6, attack: 0.15, vol, wave: 'sine', vib: { rate: 5, depth: 0.025 }, wet });

  const PACKS = {
    'Heartbreak': {
      card_deal: (o) => { swish(o.pan, 0.12); tone({ at: 0.06, f: 75, to: 50, dur: 0.1, vol: 0.4, wave: 'sine', pan: o.pan }); },
      card_flip: (o) => { noise({ f: 6000, dur: 0.02, vol: 0.18, q: 5, pan: o.pan }); tone({ at: 0.01, f: 'E6', to: 'D#6', dur: 0.1, vol: 0.05, wave: 'triangle', pan: o.pan }); },
      shuffle: () => riffle(0, (t) => { heartbeat(t); heartbeat(t + 0.5, 0.35); }),
      win: () => { heartbeat(0, 0.3); seq(['E5', 'G#5', 'B5', 'E6'], 0.1, { at: 0.35, dur: 0.18, vol: 0.11, duty: 0.125, vib: { rate: 6, depth: 0.01 }, wet: 0.3 }); chord(['E5', 'G#5'], 0.75, 0.6, { vol: 0.1, duty: 0.125, wet: 0.3 }); },
      lose: () => { noise({ f: 5000, dur: 0.05, vol: 0.3, q: 2 }); noise({ at: 0.07, f: 3000, dur: 0.04, vol: 0.2, q: 2 }); seq(['B4', 'G4', 'E4'], 0.18, { at: 0.15, dur: 0.24, vol: 0.11, vib: { rate: 5, depth: 0.02 } }); tone({ at: 0.85, f: 'B6', to: 'E5', slide: 0.12, dur: 0.15, vol: 0.06, wave: 'sine', wet: 0.4 }); },
      blackjack: () => { heartbeat(0); heartbeat(0.4); seq(['E5', 'G#5', 'B5', 'E6', 'G#6'], 0.08, { at: 0.75, dur: 0.14, vol: 0.12, wet: 0.3 }); chord(['E6', 'B5', 'G#5'], 1.15, 0.9, { vol: 0.11, duty: 0.125, vib: { rate: 6, depth: 0.012 }, wet: 0.4 }); },
    },
    'King of Hearts': {
      card_deal: (o) => { swish(o.pan, 0.13); tone({ at: 0.07, f: jitter(1760, 0.03), dur: 0.08, vol: 0.06, duty: 0.125, pan: o.pan }); },
      card_flip: (o) => { swish(o.pan, 0.1); seq(['C6', 'G6'], 0.04, { dur: 0.06, vol: 0.06, duty: 0.125, pan: o.pan }); },
      shuffle: () => riffle(0, (t) => { noise({ at: t, f: 800, filter: 'lowpass', dur: 0.08, vol: 0.3 }); seq(['G5', 'C6'], 0.09, { at: t + 0.1, dur: 0.12, vol: 0.08 }); }),
      win: () => { seq(['G4', 'C5', 'C5', 'E5', 'G5'], 0.09, { dur: 0.12, vol: 0.13, wave: 'sawtooth' }); chord(['C5', 'E5', 'G5'], 0.45, 0.5, { vol: 0.09, wave: 'sawtooth' }); seq(['C3', 'G2', 'C3'], 0.15, { dur: 0.2, vol: 0.3, wave: 'triangle' }); },
      lose: () => { seq(['C4', 'B3', 'A3'], 0.22, { dur: 0.3, vol: 0.1, wave: 'sawtooth' }); tone({ at: 0.66, f: 'A2', dur: 0.6, vol: 0.3, wave: 'triangle' }); },
      blackjack: () => {
        for (let i = 0; i < 14; i++) noise({ at: i * 0.035, f: 1500, dur: 0.03, vol: 0.12 + i * 0.01, q: 1 });   // drum roll
        seq(['G4', 'G4', 'C5', 'E5', 'G5', 'C6'], 0.1, { at: 0.5, dur: 0.13, vol: 0.13, wave: 'sawtooth' });
        chord(['C6', 'G5', 'E5', 'C5'], 1.1, 1.0, { vol: 0.09, wave: 'sawtooth', vib: { rate: 5, depth: 0.008 } });
        tone({ at: 1.1, f: 'C3', dur: 1.0, hold: 0.4, vol: 0.32, wave: 'triangle' }); noise({ at: 1.1, f: 6000, dur: 0.6, vol: 0.12, q: 0.5 });
      },
    },
    'Seventh Heaven': {
      card_deal: (o) => { swish(o.pan, 0.12); tone({ at: 0.06, f: ['C6', 'D6', 'E6', 'G6', 'A6'][Math.floor(Math.random() * 5)], dur: 0.35, vol: 0.08, wave: 'triangle', pan: o.pan, wet: 0.3 }); },
      card_flip: (o) => { bell(0, 'G6', 0.05, { pan: o.pan, wet: 0.3 }); },
      shuffle: () => riffle(0, (t) => seq(['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6'], 0.035, { at: t, dur: 0.3, vol: 0.07, wave: 'triangle', wet: 0.3 })),
      win: () => { seq(['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'C7'], 0.04, { dur: 0.5, vol: 0.08, wave: 'triangle', wet: 0.4 }); },
      lose: () => { seq(['A5', 'G5', 'E5', 'D5', 'C5', 'A4'], 0.06, { dur: 0.45, vol: 0.07, wave: 'triangle', wet: 0.3 }); },
      blackjack: () => {
        seq(['C5', 'D5', 'E5', 'G5', 'A5', 'C6', 'D6', 'E6', 'G6', 'A6', 'C7'], 0.035, { dur: 0.6, vol: 0.08, wave: 'triangle', wet: 0.4 });
        chord(['C5', 'E5', 'G5', 'B5'], 0.45, 1.6, { vol: 0.07, wave: 'sine', attack: 0.25, vib: { rate: 4.5, depth: 0.015 }, wet: 0.5 });   // the choir
        bell(0.45, 'G6', 0.07, { dur: 1.2, wet: 0.5 }); bell(0.75, 'C7', 0.05, { dur: 1.2, wet: 0.5 });
      },
    },
    'Platinum': {
      card_deal: (o) => { swish(o.pan, 0.12); bell(0.06, jitter(2600, 0.04), 0.035, { dur: 0.3, pan: o.pan }); },
      card_flip: (o) => { bell(0, 'E7', 0.04, { dur: 0.25, pan: o.pan }); bell(0.04, 'B7', 0.025, { dur: 0.25, pan: o.pan }); },
      shuffle: () => riffle(0, (t) => { for (let i = 0; i < 6; i++) bell(t + i * 0.05, 2000 + i * 400, 0.025, { dur: 0.4, pan: i % 2 ? 0.5 : -0.5 }); }),
      win: () => { ['C6', 'E6', 'G6', 'C7'].forEach((n, i) => bell(i * 0.08, n, 0.06, { dur: 0.9, wet: 0.35 })); },
      lose: () => { ['G5', 'E5', 'C5'].forEach((n, i) => bell(i * 0.12, n, 0.05, { dur: 0.5 })); },
      blackjack: () => { ['C6', 'E6', 'G6', 'C7', 'E7', 'G7'].forEach((n, i) => bell(i * 0.06, n, 0.06, { dur: 1.3, wet: 0.4, pan: i % 2 ? 0.4 : -0.4 })); ['C6', 'G6', 'E7'].forEach((n) => bell(0.5, n, 0.05, { dur: 1.6, wet: 0.5 })); },
    },
    'Deadwood': {
      card_deal: (o) => { swish(o.pan, 0.12); noise({ at: 0.07, f: 600, dur: 0.04, vol: 0.35, q: 4, pan: o.pan }); },
      card_flip: (o) => { noise({ f: 3500, dur: 0.012, vol: 0.3, q: 8, pan: o.pan }); noise({ at: 0.05, f: 2500, dur: 0.012, vol: 0.25, q: 8, pan: o.pan }); },   // revolver cylinder
      shuffle: () => riffle(0, (t) => { for (let i = 0; i < 3; i++) { tone({ at: t + i * 0.1, f: 4200, dur: 0.12, vol: 0.03, wave: 'sine' }); tone({ at: t + i * 0.1, f: 5300, dur: 0.1, vol: 0.02, wave: 'sine' }); } }),   // spurs
      win: () => { // a whistled tune
        const w = { wave: 'sine', vol: 0.12, vib: { rate: 6, depth: 0.012 }, wet: 0.3 };
        tone(Object.assign({}, w, { f: 'A5', to: 'D6', slide: 0.08, dur: 0.25 })); tone(Object.assign({}, w, { at: 0.28, f: 'A5', dur: 0.15 }));
        tone(Object.assign({}, w, { at: 0.45, f: 'D6', to: 'E6', slide: 0.05, dur: 0.5, hold: 0.2 }));
      },
      lose: () => { noise({ f: 2500, filter: 'lowpass', dur: 0.25, vol: 0.4 }); tone({ at: 0.05, f: 2600, to: 900, slide: 0.35, dur: 0.4, vol: 0.06, wave: 'sine', wet: 0.4 }); },   // shot and ricochet
      blackjack: () => {
        noise({ f: 2500, filter: 'lowpass', dur: 0.25, vol: 0.4 }); tone({ at: 0.05, f: 1200, to: 3200, slide: 0.3, dur: 0.35, vol: 0.06, wave: 'sine', wet: 0.4 });
        const w = { wave: 'sine', vol: 0.12, vib: { rate: 6, depth: 0.012 }, wet: 0.4 };
        ['D6', 'A5', 'D6', 'F#6'].forEach((n, i) => tone(Object.assign({}, w, { at: 0.5 + i * 0.18, f: n, dur: 0.2 })));
        tone(Object.assign({}, w, { at: 1.25, f: 'A6', to: 'D7', slide: 0.1, dur: 0.8, hold: 0.3 }));
      },
    },
    'Blood Moon': {
      card_deal: (o) => { swish(o.pan, 0.12); tone({ at: 0.06, f: 110, to: 60, dur: 0.12, vol: 0.4, wave: 'sine', pan: o.pan }); },
      card_flip: (o) => { tone({ f: 'D3', dur: 0.4, vol: 0.12, duty: 0.125, pan: o.pan, wet: 0.3 }); tone({ f: 'D#3', dur: 0.4, vol: 0.08, duty: 0.125, pan: o.pan }); },
      shuffle: () => riffle(0, (t) => { [0, 0.15, 0.3].forEach((d, i) => tone({ at: t + d, f: 90, to: 55, dur: 0.15, vol: 0.4 - i * 0.08, wave: 'sine' })); }),
      win: () => { howl(0, 330, 0.12); tone({ f: 'D2', dur: 1.2, attack: 0.3, vol: 0.25, wave: 'triangle' }); },
      lose: () => { tone({ f: 'D2', dur: 1.2, attack: 0.1, vol: 0.32, wave: 'triangle' }); tone({ f: 'D#3', dur: 1.0, attack: 0.2, vol: 0.06, duty: 0.125, wet: 0.4 }); },
      blackjack: () => { [0, 0.2, 0.4, 0.5].forEach((d) => tone({ at: d, f: 95, to: 55, dur: 0.15, vol: 0.45, wave: 'sine' })); howl(0.7, 300, 0.13); howl(0.9, 400, 0.08); chord(['D3', 'A3', 'D4'], 0.7, 1.4, { vol: 0.07, duty: 0.25, attack: 0.3 }); },
    },
    'Silver Wolf': {
      card_deal: (o) => { swish(o.pan, 0.12); tone({ at: 0.06, f: jitter(3500, 0.05), dur: 0.05, vol: 0.05, wave: 'triangle', pan: o.pan, wet: 0.4 }); },
      card_flip: (o) => { noise({ f: 7000, dur: 0.15, vol: 0.08, q: 3, pan: o.pan }); tone({ f: 'B6', dur: 0.2, vol: 0.04, wave: 'sine', pan: o.pan, wet: 0.5 }); },
      shuffle: () => riffle(0, (t) => noise({ at: t, f: 500, to: 1800, dur: 0.6, vol: 0.12, q: 4, attack: 0.25 })),   // a gust of wind
      win: () => { howl(0, 440, 0.09, 0.7); noise({ f: 600, to: 1500, dur: 1.0, vol: 0.06, q: 5, attack: 0.3 }); },
      lose: () => { noise({ f: 1500, to: 400, dur: 1.0, vol: 0.12, q: 5, attack: 0.25 }); tone({ f: 'B4', to: 'E4', slide: 0.8, dur: 0.9, vol: 0.05, wave: 'sine', wet: 0.5 }); },
      blackjack: () => { howl(0, 440, 0.1, 0.7); howl(0.35, 554, 0.07, 0.7); howl(0.7, 660, 0.06, 0.7); noise({ f: 500, to: 2000, dur: 1.6, vol: 0.07, q: 5, attack: 0.5 }); },
    },
    'Unknown Signal': {                                   // radio static, a tuning dial and morse from somewhere far away
      card_deal: (o) => { swish(o.pan, 0.12); noise({ at: 0.06, f: 2500, dur: 0.05, vol: 0.08, q: 6, pan: o.pan }); },
      card_flip: (o) => { tone({ f: 600, to: 2400, slide: 0.12, dur: 0.14, vol: 0.04, wave: 'sine', pan: o.pan }); noise({ f: 3000, dur: 0.12, vol: 0.06, q: 1, pan: o.pan }); },
      shuffle: () => riffle(0, (t) => { noise({ at: t, f: 1800, dur: 0.4, vol: 0.12, q: 0.6, attack: 0.05 }); tone({ at: t + 0.1, f: 300, to: 1600, slide: 0.3, dur: 0.35, vol: 0.04, wave: 'sine' }); }),
      win: () => { [0, 0.09, 0.18, 0.36, 0.54].forEach((d, i) => tone({ at: d, f: 880, dur: i > 2 ? 0.15 : 0.06, vol: 0.06, wave: 'sine', wet: 0.3 })); tone({ at: 0.8, f: 'A5', dur: 0.5, vol: 0.06, wave: 'sine', vib: { rate: 6, depth: 0.02 }, wet: 0.4 }); },
      lose: () => { tone({ f: 880, to: 220, slide: 0.6, dur: 0.7, vol: 0.06, wave: 'sine', vib: { rate: 9, depth: 0.03 } }); noise({ at: 0.3, f: 2500, dur: 0.6, vol: 0.12, q: 0.5, attack: 0.2 }); },
      blackjack: () => {
        noise({ f: 1500, to: 4000, dur: 0.5, vol: 0.12, q: 0.6 }); tone({ f: 200, to: 1760, slide: 0.45, dur: 0.5, vol: 0.05, wave: 'sine' });
        [0, 0.08, 0.16, 0.32, 0.4, 0.56, 0.64, 0.72].forEach((d) => tone({ at: 0.55 + d, f: 1046, dur: 0.06, vol: 0.06, wave: 'sine', wet: 0.3 }));
        for (const n of ['A4', 'E5', 'C#6']) tone({ at: 1.4, f: n, dur: 1.3, hold: 0.5, attack: 0.2, vol: 0.06, wave: 'sine', vib: { rate: 5, depth: 0.015 }, wet: 0.5 });
      },
    },
    'The House': {                                        // an old home computer: key clicks, boot beeps, a level-clear jingle
      card_deal: (o) => { swish(o.pan, 0.12); noise({ at: 0.05, f: 4500, dur: 0.012, vol: 0.14, q: 4, pan: o.pan }); tone({ at: 0.05, f: jitter(1200, 0.05), dur: 0.02, vol: 0.04, wave: 'square', pan: o.pan }); },
      card_flip: (o) => { seq(['C6', 'G6'], 0.05, { dur: 0.05, vol: 0.06, wave: 'square', pan: o.pan }); },
      shuffle: () => riffle(0, (t) => { for (let i = 0; i < 9; i++) noise({ at: t + i * 0.06 + Math.random() * 0.02, f: jitter(4200, 0.2), dur: 0.012, vol: 0.13, q: 4 }); tone({ at: t + 0.6, f: 'C6', dur: 0.08, vol: 0.05, wave: 'square' }); }),
      win: () => { seq(['C5', 'E5', 'G5', 'C6'], 0.07, { dur: 0.09, vol: 0.1, duty: 0.25 }); tone({ at: 0.3, f: 'E6', dur: 0.3, vol: 0.09, duty: 0.25 }); },
      lose: () => { tone({ f: 'A3', dur: 0.18, vol: 0.12, wave: 'square' }); tone({ at: 0.22, f: 'E3', dur: 0.4, vol: 0.12, wave: 'square' }); },
      blackjack: () => {
        tone({ f: 'C4', dur: 0.5, vol: 0.1, wave: 'square', attack: 0.02 }); tone({ f: 'C5', dur: 0.5, vol: 0.06, wave: 'square' });   // power-on
        seq(['C5', 'E5', 'G5', 'C6', 'E6', 'G6'], 0.06, { at: 0.55, dur: 0.08, vol: 0.09, duty: 0.25 });
        chord(['C6', 'E6', 'G6'], 0.95, 0.7, { vol: 0.08, duty: 0.25 }); seq(['C3', 'G3', 'C4'], 0.12, { at: 0.95, dur: 0.15, vol: 0.25, wave: 'triangle' });
      },
    },
    'Hitman': {                                           // silenced shots, a cocked hammer, a ticking watch, a lonely whistle
      card_deal: (o) => { swish(o.pan, 0.11); noise({ at: 0.05, f: 900, to: 300, dur: 0.07, vol: 0.22, filter: 'lowpass', pan: o.pan }); },
      card_flip: (o) => { noise({ f: 5000, dur: 0.015, vol: 0.2, q: 6, pan: o.pan }); noise({ at: 0.07, f: 3500, dur: 0.02, vol: 0.22, q: 6, pan: o.pan }); },
      shuffle: () => riffle(0, (t) => { for (let i = 0; i < 4; i++) noise({ at: t + i * 0.25, f: i % 2 ? 3800 : 4600, dur: 0.012, vol: 0.12, q: 8 }); }),
      win: () => { seq(['E5', 'A5', 'B5', 'E6'], 0.16, { dur: 0.22, vol: 0.07, wave: 'sine', vib: { rate: 6, depth: 0.015 }, wet: 0.5 }); tone({ at: 0.64, f: 'E6', to: 'D6', slide: 0.4, dur: 0.6, vol: 0.06, wave: 'sine', vib: { rate: 6, depth: 0.02 }, wet: 0.6 }); },
      lose: () => { seq(['A3', 'G3', 'E3'], 0.25, { dur: 0.35, vol: 0.12, wave: 'sawtooth', wet: 0.3 }); noise({ at: 0.8, f: 600, to: 200, dur: 0.12, vol: 0.25, filter: 'lowpass' }); },
      blackjack: () => {
        noise({ f: 5000, dur: 0.015, vol: 0.2, q: 6 }); noise({ at: 0.08, f: 3500, dur: 0.02, vol: 0.22, q: 6 });                    // cock
        noise({ at: 0.45, f: 1100, to: 250, dur: 0.12, vol: 0.4, filter: 'lowpass' });                                               // silenced shot
        [0.75, 0.86, 0.94].forEach((d, i) => bell(d, 3400 - i * 300, 0.04, { dur: 0.15 }));                                            // the casing bounces
        seq(['E5', 'A5', 'B5', 'C6', 'B5', 'A5', 'E6'], 0.17, { at: 1.15, dur: 0.24, vol: 0.07, wave: 'sine', vib: { rate: 6, depth: 0.015 }, wet: 0.6 });
        chord(['A2', 'E3'], 1.15, 1.4, { vol: 0.12, wave: 'triangle', wet: 0.4 });
      },
    },
    'Eclipse': {                                          // a black hole: deep groans, things falling in, time slowing down
      card_deal: (o) => {                                 // the card is pulled in: the swish slows and sinks, then a sub thump
        noise({ f: 1400, to: 120, dur: 0.26, vol: 0.18, q: 1.2, pan: o.pan });
        tone({ at: 0.12, f: 70, to: 32, dur: 0.3, vol: 0.4, wave: 'sine', pan: o.pan }); tone({ at: 0.12, f: 70, to: 32, dur: 0.3, vol: 0.12, wave: 'triangle', pan: o.pan });
      },
      card_flip: (o) => {                                 // gravitational lensing: two close tones beating as they sink
        tone({ f: 110, to: 52, slide: 0.45, dur: 0.5, vol: 0.2, wave: 'triangle', pan: o.pan, wet: 0.3 });
        tone({ f: 113, to: 50, slide: 0.45, dur: 0.5, vol: 0.2, wave: 'triangle', pan: o.pan, wet: 0.3 });
      },
      shuffle: () => {                                    // the riffle slows down as it falls, like time dilating
        let t = 0, gap = 0.02;
        for (let i = 0; i < 20; i++) { noise({ at: t, f: 1600 * Math.pow(0.9, i), dur: 0.03 + i * 0.004, vol: 0.12, q: 3, pan: i % 2 ? -0.3 : 0.3 }); t += gap; gap *= 1.12; }
        tone({ at: t, f: 60, to: 28, dur: 0.9, vol: 0.45, wave: 'sine' }); tone({ at: t, f: 60, to: 28, dur: 0.9, vol: 0.14, wave: 'triangle' }); noise({ at: t, f: 300, to: 60, dur: 0.9, vol: 0.2, filter: 'lowpass' });
      },
      win: () => {                                        // escaping the pull: a rise out of the depths into the bright accretion disk
        tone({ f: 30, to: 120, slide: 0.7, dur: 0.8, vol: 0.4, wave: 'sine' });
        noise({ f: 100, to: 1200, dur: 0.7, vol: 0.15, q: 2, attack: 0.5 }); tone({ f: 30, to: 120, slide: 0.7, dur: 0.8, vol: 0.12, wave: 'triangle' });
        for (let i = 0; i < 10; i++) tone({ at: 0.6 + i * 0.05, f: hz('E4') * Math.pow(1.06, i), dur: 0.16, vol: 0.07, wave: 'triangle', pan: i % 2 ? 0.6 : -0.6, wet: 0.4 });
      },
      lose: () => {                                       // swallowed: everything stretches down into nothing
        tone({ f: 'E3', to: 25, slide: 1.3, dur: 1.4, vol: 0.18, wave: 'triangle', wet: 0.3 });
        tone({ f: 'B2', to: 30, slide: 1.3, dur: 1.4, vol: 0.12, wave: 'triangle', wet: 0.3 });
        noise({ f: 1200, to: 50, dur: 1.4, vol: 0.2, filter: 'lowpass' });
        tone({ at: 1.0, f: 45, to: 25, dur: 0.8, vol: 0.4, wave: 'sine' });
      },
      blackjack: () => {                                  // crossing the event horizon
        tone({ f: 38, to: 30, dur: 2.2, hold: 1.2, attack: 0.4, vol: 0.4, wave: 'sine' });                    // the groan
        tone({ f: 57, to: 45, dur: 2.2, hold: 1.2, attack: 0.4, vol: 0.2, wave: 'triangle', vib: { rate: 0.8, depth: 0.05 } }); tone({ f: 76, to: 60, dur: 2.2, hold: 1.2, attack: 0.4, vol: 0.1, wave: 'triangle', vib: { rate: 0.6, depth: 0.06 } });
        let t = 0.2, gap = 0.12;                          // the accretion disk spins faster and faster
        for (let i = 0; i < 22; i++) { tone({ at: t, f: hz('B3') * (1 + (i % 4) * 0.25), dur: 0.1, vol: 0.08, wave: 'triangle', pan: Math.sin(i * 1.3) * 0.8, wet: 0.4 }); t += gap; gap *= 0.9; }
        noise({ at: 1.3, f: 2000, to: 80, dur: 0.5, vol: 0.22, filter: 'lowpass' });
        tone({ at: 1.75, f: 90, to: 25, dur: 1.2, vol: 0.5, wave: 'sine' }); tone({ at: 1.75, f: 90, to: 25, dur: 1.2, vol: 0.15, wave: 'triangle' });                                 // the boom
        for (const n of ['E2', 'B2', 'G3']) tone({ at: 1.8, f: n, to: hz(n) * 0.94, slide: 1.6, dur: 1.8, hold: 0.5, attack: 0.1, vol: 0.12, wave: 'triangle', wet: 0.6 });   // time slowing down
      },
    },
  };
  // pack = { set: 'Heartbreak', full: true } or null
  let pack = null;
  function setPack(setName, full) { pack = setName && PACKS[setName] ? { set: setName, full: !!full } : null; }
  // Picks the pack from what's equipped: { back, face, felt, chips } -> each a cosmetic { set, rarity } or null.
  function packFromEquipped(eq) {
    const special = (c) => c && c.set && PACKS[c.set] && (c.rarity === 'secret' || c.rarity === 'insanity');
    const cardItem = special(eq.back) ? eq.back : special(eq.face) ? eq.face : null;
    if (!cardItem) return null;
    const full = ['back', 'face', 'felt', 'chips'].every((k) => eq[k] && eq[k].set === cardItem.set);
    return { set: cardItem.set, full };
  }

  // ------------------------------------------------------------------ public API
  const lastPlayed = {};
  function ready() { return ensure() && !settings.muted && settings.master > 0; }
  function play(name, opts) {
    const fn = SFX[name]; if (!fn || !ready() || settings.sfx <= 0) return;
    const now = ctx.currentTime;
    if (lastPlayed[name] && now - lastPlayed[name] < 0.03) return;   // several identical triggers in one tick sound like one
    lastPlayed[name] = now;
    const p = settings.setSounds && pack && PACKS[pack.set];
    const alt = p && p[name] && (pack.full || CARD_SOUNDS.includes(name)) ? p[name] : fn;
    alt(opts || {});
  }
  function setSetting(key, value) {
    if (!(key in DEFAULTS)) return;
    settings[key] = typeof DEFAULTS[key] === 'boolean' ? !!value : Math.max(0, Math.min(1, Number(value)));
    applyVolumes();
    listeners.forEach((fn) => fn(key, settings[key]));
  }
  function loadSettings(obj) { for (const k in DEFAULTS) if (obj && k in obj) settings[k] = obj[k]; applyVolumes(0); }

  unlockOnGesture();
  root.addEventListener('keydown', (e) => {               // M toggles mute anywhere except while typing
    if ((e.key === 'm' || e.key === 'M') && !e.ctrlKey && !e.metaKey && !e.altKey && !/INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) setSetting('muted', !settings.muted);
  });

  root.GameAudio = {
    DEFAULTS, settings, play, voice, setSetting, loadSettings,
    onChange: (fn) => listeners.push(fn),
    list: () => Object.keys(SFX), voices: VOICES,
    setPack, packFromEquipped, packs: () => Object.keys(PACKS), get pack() { return pack; },
    // for the music and set-sound packs that come next
    _internal: { ensure, tone, noise, seq, hz, chip, get ctx() { return ctx; }, get musicBus() { return musicBus; }, get sfxBus() { return sfxBus; } },
  };
})(window);
