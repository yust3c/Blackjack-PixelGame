/* Game music: a small chiptune sequencer that plays looping tracks written as text (chords + melody),
   generated live with WebAudio like the sound effects. Needs js/audio.js (window.GameAudio) first.
   GameMusic.play('menu' | sceneId) crossfades to that track; GameMusic.stop() fades out.
   Track ids match the scene ids in js/scenarios.js. Every scene has its own tune and style. */
(function (root) {
  'use strict';
  const A = root.GameAudio;
  const I = A._internal;

  // ------------------------------------------------------------------ notes and chords
  const PC = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };
  function midi(name) {                                   // 'C#4' / 'Bb3' -> 61 / 58
    const m = /^([A-G])([#b]?)(-?\d)$/.exec(name);
    return PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + (Number(m[3]) + 1) * 12;
  }
  const freq = (n) => 440 * Math.pow(2, (n - 69) / 12);
  const QUAL = { '': [0, 4, 7], m: [0, 3, 7], 7: [0, 4, 7, 10], maj7: [0, 4, 7, 11], m7: [0, 3, 7, 10], 6: [0, 4, 7, 9], m6: [0, 3, 7, 9],
    m7b5: [0, 3, 6, 10], 'maj7#11': [0, 4, 6, 11], dim: [0, 3, 6, 9], sus: [0, 5, 7], 9: [0, 4, 7, 10, 14], m9: [0, 3, 7, 10, 14] };
  function chord(sym) {                                   // 'Gm7' -> { root: 43 (G2), tones: [semitones] }
    const m = /^([A-G])([#b]?)(.*)$/.exec(sym);
    const pc = PC[m[1]] + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0);
    return { root: 36 + ((pc + 12) % 12), tones: QUAL[m[3]] || QUAL[''] };
  }
  // voice a chord inside E3..G4 so the comping stays in one place
  const voicing = (c) => c.tones.slice(0, 4).map((t) => { let n = c.root + 12 + t; while (n > 67) n -= 12; while (n < 52) n += 12; return n; }).sort((a, b) => a - b);

  // ------------------------------------------------------------------ instruments
  let ctx, waves = {};
  function pulse(duty) {
    if (waves[duty]) return waves[duty];
    const n = 64, re = new Float32Array(n), im = new Float32Array(n);
    for (let k = 1; k < n; k++) im[k] = (2 / (k * Math.PI)) * Math.sin(k * Math.PI * duty) * 2;
    return (waves[duty] = ctx.createPeriodicWave(re, im));
  }
  function note(dest, t, n, dur, o) {
    const osc = ctx.createOscillator(), g = ctx.createGain();
    if (o.wave) osc.type = o.wave; else osc.setPeriodicWave(pulse(o.duty || 0.25));
    const f = typeof n === 'number' && n < 128 ? freq(n) : n;
    if (o.from) { osc.frequency.setValueAtTime(o.from, t); osc.frequency.exponentialRampToValueAtTime(f, t + (o.glide || 0.06)); }
    else osc.frequency.setValueAtTime(f, t);
    if (o.detune) osc.detune.value = o.detune;
    if (o.vib) {
      const l = ctx.createOscillator(), lg = ctx.createGain();
      l.frequency.value = o.vib[0]; lg.gain.value = f * o.vib[1];
      l.connect(lg); lg.connect(osc.frequency); l.start(t + Math.min(0.12, dur / 2)); l.stop(t + dur + 0.3);
    }
    const a = o.attack || 0.005, v = o.vol, rel = o.release || 0.06;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(v, t + a);
    g.gain.setValueAtTime(v, t + Math.max(a, dur - rel));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur + (o.tail || 0));
    osc.connect(g); g.connect(dest);
    osc.start(t); osc.stop(t + dur + (o.tail || 0) + 0.05);
  }
  function hit(dest, t, o) {                              // drums: filtered noise or a falling sine
    if (o.kick) {
      const osc = ctx.createOscillator(), g = ctx.createGain();
      osc.type = 'sine'; osc.frequency.setValueAtTime(o.kick, t); osc.frequency.exponentialRampToValueAtTime(40, t + 0.12);
      g.gain.setValueAtTime(o.vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.18));
      osc.connect(g); g.connect(dest); osc.start(t); osc.stop(t + 0.25); return;
    }
    const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = noiseBuf(); f.type = o.type || 'highpass'; f.frequency.value = o.f || 7000; f.Q.value = o.q || 0.7;
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(o.vol, t + (o.attack || 0.002));
    g.gain.exponentialRampToValueAtTime(0.0001, t + (o.dur || 0.05));
    src.connect(f); f.connect(g); g.connect(dest); src.start(t, Math.random() * 0.5); src.stop(t + (o.dur || 0.05) + 0.02);
  }
  let nb = null;
  function noiseBuf() {
    if (nb) return nb;
    nb = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = nb.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return nb;
  }
  function bell(dest, t, n, dur, vol) {                    // vibraphone-ish: sine + inharmonic partials, long ring
    const f = freq(n);
    for (const [m, v, d] of [[1, 1, 1], [4, 0.25, 0.4], [10, 0.06, 0.15]]) note(dest, t, f * m, dur * d, { wave: 'sine', vol: vol * v, attack: 0.003, release: dur * d * 0.9, vib: m === 1 ? [4.5, 0.004] : null });
  }

  // ------------------------------------------------------------------ parts
  // Every generator gets (dest, t, step 0-15, bar chord, next bar's chord, track) and plays what falls on that 16th.
  const BASS = {
    walk(d, t, s, c, nx, k) {                             // walking quarters, chromatic step into the next chord
      if (s % 4) return;
      const r = c.root, beat = s / 4;
      const n = [r, r + c.tones[1], r + 7, nx.root + (Math.random() < 0.5 ? 1 : -1)][beat];
      note(d, t, n, k.q * 0.9, k.bass);
    },
    two(d, t, s, c, nx, k) { if (s === 0) note(d, t, c.root, k.q * 1.6, k.bass); if (s === 8) note(d, t, c.root + 7 - 12 * (c.root + 7 > 47), k.q * 1.6, k.bass); },
    eighths(d, t, s, c, nx, k) { if (s % 2 === 0) note(d, t, c.root + (s % 4 === 2 ? 12 : 0), k.q * 0.42, k.bass); },
    long(d, t, s, c, nx, k) { if (s === 0) note(d, t, c.root, k.q * 3.8, Object.assign({}, k.bass, { release: 0.4 })); if (s === 12) note(d, t, c.root + 7, k.q * 0.9, k.bass); },
    bossa(d, t, s, c, nx, k) { const p = { 0: [0, 1.4], 6: [7, 0.45], 8: [7, 1.4], 14: [0, 0.45] }[s]; if (p) note(d, t, c.root + p[0], k.q * p[1], k.bass); },
    tango(d, t, s, c, nx, k) {                            // marcato in four, with a dragged pickup into each bar
      if (s % 4 === 0) note(d, t, c.root + (s >= 8 ? 7 : 0), k.q * 0.35, Object.assign({}, k.bass, { vol: k.bass.vol * (s === 0 ? 1.2 : 0.85) }));
      if (s === 15) note(d, t, nx.root - 1, k.q * 0.2, k.bass);
    },
    waltz(d, t, s, c, nx, k) { if (s === 0) note(d, t, c.root, k.q * 1.6, k.bass); },
    funk(d, t, s, c, nx, k) {                             // syncopated slap line
      const p = { 0: 0, 3: 12, 6: 0, 7: 10, 10: 12, 12: 0, 14: 7 }[s];
      if (p !== undefined) note(d, t, c.root + p, k.q * (s === 0 ? 0.4 : 0.18), Object.assign({}, k.bass, { vol: k.bass.vol * (p === 12 ? 1.15 : 1) }));
    },
    robot(d, t, s, c, nx, k) { if (s % 2 === 0) note(d, t, c.root + 12 * ((s / 2) % 2) + (s === 14 ? 7 : 0), k.q * 0.22, k.bass); },
    lofi(d, t, s, c, nx, k) {                             // round sub bass, a little behind the beat
      if (s === 0) note(d, t, c.root, k.q * 1.6, k.bass);
      if (s === 7) note(d, t, c.root, k.q * 0.3, k.bass);
      if (s === 10) note(d, t, c.root + 7, k.q * 1.2, k.bass);
    },
    ostinato(d, t, s, c, nx, k) {                         // relentless low sixteenths
      const p = [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 1, 0, 12, 0][s];
      note(d, t, c.root - 12 + p, k.q * 0.2, Object.assign({}, k.bass, { vol: k.bass.vol * (s % 4 === 0 ? 1.2 : 0.75) }));
    },
    drone(d, t, s, c, nx, k) { if (s === 0) note(d, t, c.root - 12, k.q * (k.beats + 0.2), Object.assign({}, k.bass, { attack: 0.5, release: 0.8, tail: 0.6 })); },
  };
  const COMP = {
    stabs(d, t, s, c, nx, k) { if (s === 6 || s === 12) voicing(c).forEach((n) => note(d, t, n, k.q * 0.35, k.comp)); },
    oompah(d, t, s, c, nx, k) { if (s === 4 || s === 12) voicing(c).forEach((n) => note(d, t, n, k.q * 0.3, k.comp)); },
    pad(d, t, s, c, nx, k) { if (s === 0) voicing(c).forEach((n, i) => note(d, t, n, k.q * k.beats, Object.assign({}, k.comp, { attack: k.comp.attack || 0.25, release: 0.5, detune: i % 2 ? 6 : -6 }))); },
    gated(d, t, s, c, nx, k) { if (s % 2 === 0) voicing(c).forEach((n) => note(d, t, n, k.q * 0.38, k.comp)); },
    bossa(d, t, s, c, nx, k) { if ([0, 3, 6, 10, 12].includes(s)) voicing(c).forEach((n) => note(d, t, n, k.q * 0.4, k.comp)); },
    nylon(d, t, s, c, nx, k) {                            // bossa guitar: the two-bar syncopated pattern, lightly strummed
      const hits = k.bar % 2 ? [3, 6, 10, 13] : [0, 3, 6, 10, 13];
      if (hits.includes(s)) voicing(c).forEach((n, i) => note(d, t + i * 0.014, n, k.q * 0.5, Object.assign({ wave: 'triangle', release: 0.2 }, k.comp)));
    },
    tango(d, t, s, c, nx, k) { if (s % 4 === 0 || s === 6) voicing(c).forEach((n) => note(d, t, n, k.q * 0.18, Object.assign({}, k.comp, { vol: k.comp.vol * ([0, 6, 12].includes(s) ? 1.3 : 0.8) }))); },
    waltz(d, t, s, c, nx, k) { if (s === 4 || s === 8) voicing(c).forEach((n) => note(d, t, n, k.q * 0.45, k.comp)); },
    rhodes(d, t, s, c, nx, k) {                           // soft electric piano: sine + a touch of triangle
      const hitAt = { 0: 1.6, 10: 0.9 }[s];
      if (hitAt) voicing(c).forEach((n, i) => { note(d, t + i * 0.012, n, k.q * hitAt, Object.assign({ wave: 'sine', release: 0.3 }, k.comp)); note(d, t + i * 0.012, n + 12, k.q * hitAt * 0.5, { wave: 'triangle', vol: k.comp.vol * 0.25 }); });
    },
    organ(d, t, s, c, nx, k) {                            // a wall of brass and organ, swelling each bar
      if (s !== 0) return;
      voicing(c).forEach((n) => { note(d, t, n, k.q * k.beats, Object.assign({ wave: 'sawtooth', attack: 0.25, release: 0.3 }, k.comp)); note(d, t, n - 12, k.q * k.beats, Object.assign({ duty: 0.25, attack: 0.25, release: 0.3 }, k.comp, { wave: undefined, vol: k.comp.vol * 0.8 })); });
    },
    clav(d, t, s, c, nx, k) { if ([2, 5, 10, 13].includes(s)) voicing(c).forEach((n) => note(d, t, n + 12, k.q * 0.12, k.comp)); },
  };
  const DRUMS = {
    brush(d, t, s, c, nx, k) {
      const v = k.drumVol;
      if (s % 4 === 0) hit(d, t, { f: 3000, type: 'bandpass', vol: 0.05 * v, dur: k.q * 0.9, attack: 0.04 });
      if (s % 4 === 2 && Math.random() < 0.7) hit(d, t, { f: 5000, vol: 0.04 * v, dur: 0.05 });
      if (s === 0 || s === 8) hit(d, t, { kick: 90, vol: 0.25 * v });
    },
    swing(d, t, s, c, nx, k) {
      const v = k.drumVol;
      if ([0, 4, 6, 8, 12, 14].includes(s)) hit(d, t, { f: 8000, type: 'bandpass', q: 1.5, vol: 0.06 * v, dur: 0.18 });
      if (s === 4 || s === 12) hit(d, t, { f: 6000, vol: 0.05 * v, dur: 0.04 });
      if (s === 0 || s === 8) hit(d, t, { kick: 80, vol: 0.28 * v });
    },
    synth(d, t, s, c, nx, k) {
      const v = k.drumVol;
      if (s % 4 === 0) hit(d, t, { kick: 150, vol: 0.45 * v, dur: 0.2 });
      if (s === 4 || s === 12) { hit(d, t, { f: 1800, type: 'bandpass', vol: 0.22 * v, dur: 0.16, q: 0.6 }); note(d, t, 190, 0.08, { wave: 'triangle', vol: 0.12 * v }); }
      if (s % 2 === 0) hit(d, t, { f: 9000, vol: (s % 4 ? 0.05 : 0.03) * v, dur: 0.03 });
    },
    lounge(d, t, s, c, nx, k) {
      const v = k.drumVol;
      if (s % 2 === 0) hit(d, t, { f: 7000, vol: (s % 4 ? 0.025 : 0.015) * v, dur: 0.04, attack: 0.01 });
      if (s === 12) hit(d, t, { f: 2200, type: 'bandpass', q: 6, vol: 0.12 * v, dur: 0.03 });
      if (s === 0) hit(d, t, { kick: 70, vol: 0.2 * v, dur: 0.3 });
    },
    bossa(d, t, s, c, nx, k) {
      const v = k.drumVol;
      if ([0, 3, 6, 10, 12].includes(s)) hit(d, t, { f: 2400, type: 'bandpass', q: 6, vol: 0.09 * v, dur: 0.025 });
      hit(d, t, { f: 8000, vol: (s % 2 ? 0.012 : 0.022) * v, dur: 0.03, attack: 0.008 });
      if (s === 0 || s === 8) hit(d, t, { kick: 85, vol: 0.25 * v });
    },
    waltz(d, t, s, c, nx, k) {
      const v = k.drumVol;
      if (s === 0) hit(d, t, { kick: 80, vol: 0.22 * v });
      if (s === 4 || s === 8) hit(d, t, { f: 7000, vol: 0.035 * v, dur: 0.12, attack: 0.01 });
    },
    funk(d, t, s, c, nx, k) {
      const v = k.drumVol;
      if (s === 0 || s === 7 || s === 10) hit(d, t, { kick: 130, vol: 0.45 * v, dur: 0.2 });
      if (s === 4 || s === 12) { hit(d, t, { f: 2000, type: 'bandpass', vol: 0.24 * v, dur: 0.14, q: 0.7 }); note(d, t, 210, 0.07, { wave: 'triangle', vol: 0.1 * v }); }
      if (s === 9 || s === 15) hit(d, t, { f: 2000, type: 'bandpass', vol: 0.05 * v, dur: 0.05 });   // ghost notes
      hit(d, t, { f: 9000, vol: (s === 14 ? 0.05 : s % 2 ? 0.015 : 0.03) * v, dur: s === 14 ? 0.15 : 0.03 });
    },
    robot(d, t, s, c, nx, k) {
      const v = k.drumVol;
      if (s % 4 === 0) hit(d, t, { kick: 160, vol: 0.4 * v, dur: 0.12 });
      if (s === 4 || s === 12) hit(d, t, { f: 3000, type: 'bandpass', q: 3, vol: 0.18 * v, dur: 0.06 });
      note(d, t, s % 4 === 2 ? 2600 : 3900, 0.012, { duty: 0.125, vol: (s % 2 ? 0.012 : 0.02) * v });   // computer ticks
    },
    lofi(d, t, s, c, nx, k) {
      const v = k.drumVol;
      if (s === 0 || s === 10) hit(d, t, { kick: 95, vol: 0.4 * v, dur: 0.25 });
      if (s === 4 || s === 12) hit(d, t, { f: 1300, type: 'bandpass', q: 0.8, vol: 0.13 * v, dur: 0.12 });
      if (s % 2 === 0) hit(d, t + Math.random() * 0.012, { f: 6500, vol: (s % 4 ? 0.022 : 0.012) * v, dur: 0.04 });
      if (Math.random() < 0.25) hit(d, t, { f: 3000, type: 'bandpass', q: 8, vol: 0.012 * v, dur: 0.01 });   // record crackle
    },
    epic(d, t, s, c, nx, k) {                             // timpani and war drums
      const v = k.drumVol;
      if ([0, 3, 6, 8, 11, 14].includes(s)) {
        hit(d, t, { kick: s === 0 || s === 8 ? 75 : 110, vol: (s === 0 || s === 8 ? 0.55 : 0.32) * v, dur: 0.35 });
        hit(d, t, { f: 500, type: 'lowpass', vol: 0.1 * v, dur: 0.18 });
      }
      if (s === 4 || s === 12) hit(d, t, { f: 1500, type: 'bandpass', q: 0.5, vol: 0.22 * v, dur: 0.4 });
      if (s === 0 && Math.floor(t / (k.q * 16)) % 2 === 0) hit(d, t, { f: 5000, vol: 0.06 * v, dur: 1.4, attack: 0.01 });   // cymbal wash
    },
    blips(d, t, s, c, nx, k) {                            // space: no drum kit, just soft radar pings and a heartbeat kick
      const v = k.drumVol;
      if (s === 0) hit(d, t, { kick: 70, vol: 0.2 * v, dur: 0.3 });
      if (s % 4 === 2 && Math.random() < 0.35) note(d, t, freq(84 + [0, 3, 7, 10][Math.floor(Math.random() * 4)]), 0.05, { wave: 'sine', vol: 0.035 * v });
      if (s % 2 === 0) hit(d, t, { f: 10000, vol: 0.01 * v, dur: 0.02 });
    },
  };

  // ------------------------------------------------------------------ the tracks
  // chords: one bar per '|' (two chords in a bar split it). melody: 8 tokens per bar (eighth notes): note, '.' rest, '-' hold.
  const TUNES = {
    menu: { name: 'Main Menu', bpm: 132, swing: 0.5,           // bossa nova: soft nylon guitar and a breathy flute
      chords: 'Fmaj7 | Fmaj7 | G7 | G7 | Gm7 | C7 | Am7b5 D7 | Gm7 C7 | Fmaj7 | Fmaj7 | Bbm6 | Eb7 | Am7 | D7 | Gm7 C7 | Fmaj7',
      melody: 'A4 - C5 E5 - - D5 C5 | A4 - - - . . G4 A4 | B4 - D5 F5 - - E5 D5 | B4 - - - . . A4 B4 | C5 - D5 F5 - A5 G5 F5 | E5 - - - D5 - Bb4 G4 | A4 - C5 Eb5 - - D5 C5 | Bb4 - - - A4 - G4 - | A5 - G5 E5 - - C5 A4 | G4 - A4 - . . . . | Db5 - F5 G5 - - F5 Db5 | G5 - - - F5 - Db5 - | C5 - E5 G5 - - B5 A5 | F#5 - - - E5 - C5 - | D5 - F5 A5 - - G5 E5 | F5 - - - - - . .' },
    corner: { name: 'The Corner', bpm: 88, swing: 0.64,
      chords: 'Gm7 | C7 | Fmaj7 | D7 | Gm7 | C7 | Fmaj7 D7 | Gm7 C7',
      melody: '. . D5 F5 A5 - G5 . | E5 - - . . . . . | . . C5 E5 A5 - G5 F5 | F#5 - - . . . . . | . . A5 Bb5 D6 - C6 Bb5 | G5 - - E5 . . . . | F5 - A5 - . . F#5 . | G5 - - . E5 - . .' },
    deco: { name: 'Grand Hotel', bpm: 132, swing: 0.6,
      chords: 'Bb6 | G7 | Cm7 | F7 | Bb6 | G7 | Cm7 F7 | Bb6',
      melody: 'D5 - F5 G5 F5 - D5 . | B4 - D5 F5 G5 - . . | Eb5 - G5 Bb5 A5 - G5 . | F5 - - - C5 D5 Eb5 E5 | F5 - D5 - Bb4 - D5 F5 | G5 - F5 - D5 - B4 . | C5 - Eb5 - G5 - A5 . | Bb5 - - - . . . .' },
    neon: { name: 'Neon', bpm: 108, swing: 0.5,
      chords: 'Am | F | C | G | Am | F | C | E',
      melody: 'A5 - - - C6 - B5 - | A5 - - - F5 - . . | G5 - - - E5 - G5 - | D5 - - - . . . . | A5 - - - C6 - E6 - | D6 - C6 - A5 - F5 - | G5 - E5 - C5 - E5 - | G#5 - - - B5 - - -' },
    vip: { name: 'VIP Lounge', bpm: 116, swing: 0.5,           // a tango for Mr. Valdez
      chords: 'Dm | Dm | A7 | A7 | Gm | Dm | E7 A7 | Dm',
      melody: 'A5 - - A5 Bb5 A5 G#5 A5 | F5 - - - D5 - . . | E5 - - E5 F5 E5 D#5 E5 | C#5 - - - A4 - . . | G4 - Bb4 - D5 - G5 - | F5 - E5 - D5 - A4 - | G#4 - B4 - C#5 - E5 - | D5 - . D5 D5 - . .' },
    // The space scenes have tunes of their own
    orbit: { name: 'Orbit', bpm: 84, swing: 0.56,              // a late-night groove on the station, for T1-T0
      chords: 'Bm7 | Gmaj7 | Em7 | F#m7 | Bm7 | Gmaj7 | Em7 | F#7',
      melody: 'F#5 - - - D5 - E5 - | F#5 - - - - - . . | . . G5 F#5 E5 - D5 - | C#5 - - - - - . . | F#5 - - - A5 - B5 - | A5 - F#5 - D5 - - - | . . E5 F#5 G5 - B5 - | A#5 - - - - - . .' },
    liner: { name: 'Star Liner', bpm: 150, swing: 0.5, beats: 3, // a waltz in the ship's ballroom
      chords: 'G | Em | Am | D7 | G | E7 | Am D7 | G',
      melody: 'D5 - G5 - B5 - | B5 - - - A5 G5 | A5 - - - E5 - | F#5 - - - D5 - | D5 - G5 - B5 - | D6 - - - B5 G#5 | A5 - C6 - F#5 - | G5 - - - - -' },
    mars: { name: 'Mars', bpm: 100, swing: 0.5,                // Vinnie X's Martian funk
      chords: 'Em9 | Em9 | A9 | A9 | Em9 | Em9 | C9 B7 | Em9',
      melody: '. E5 . G5 A5 . B5 . | D6 . B5 . A5 G5 E5 . | . A5 . C#6 E6 . G6 . | E6 . C#6 . B5 A5 . . | . E5 . G5 A5 . B5 D6 | E6 - D6 . B5 . G5 . | C6 . E6 . D#6 . F#6 . | E6 - . . . . . .' },
    horizon: { name: 'Event Horizon', bpm: 76, swing: 0.5,   // the last table in the universe: Zyx's theme
      chords: 'Dm | Bb | Gm | A | Dm | Bb | Eb | A',
      melody: 'D5 - - - A5 - - - | F5 - - - - - D5 - | G5 - - - Bb5 - A5 G5 | A5 - - - - - . . | D6 - - - C6 - Bb5 - | A5 - - - F5 - D5 - | Eb5 - - - G5 - Bb5 - | A5 - - - C#5 - E5 - ' },
  };
  // Arrangements: which instruments play each part.
  const TRACKS = {
    menu:    { tune: 'menu',   lead: { wave: 'triangle', vol: 0.12, vib: [5, 0.008], attack: 0.04, release: 0.12 }, bass: 'bossa', bassO: { wave: 'triangle', vol: 0.24 }, comp: 'nylon', drums: 'bossa', drumVol: 0.8, echo: 0.15, compO: { vol: 0.05 } },
    corner:  { tune: 'corner', lead: { duty: 0.125, vol: 0.075, vib: [5, 0.01], release: 0.1 }, bass: 'walk', comp: 'stabs', drums: 'brush', compO: { wave: 'triangle', vol: 0.05 } },
    deco:    { tune: 'deco',   lead: { duty: 0.125, vol: 0.075, vib: [5.5, 0.012] }, bass: 'two', comp: 'oompah', drums: 'swing', compO: { duty: 0.25, vol: 0.025 } },
    neon:    { tune: 'neon',   lead: { wave: 'sawtooth', vol: 0.045, vib: [6, 0.006], detuneLayer: 9 }, bass: 'eighths', comp: 'gated', drums: 'synth', arp: { duty: 0.125, vol: 0.02 }, compO: { duty: 0.25, vol: 0.016 } },
    vip:     { tune: 'vip',    lead: { wave: 'sawtooth', vol: 0.06, vib: [5, 0.008], detuneLayer: 12, attack: 0.03, release: 0.12 }, gain: 1.8, bass: 'tango', bassO: { duty: 0.25, vol: 0.15 }, comp: 'tango', drums: null, compO: { duty: 0.25, vol: 0.04 } },
    orbit:   { tune: 'orbit',  gain: 0.65, lead: { wave: 'triangle', vol: 0.11, vib: [4.5, 0.008], attack: 0.02, release: 0.2 }, bass: 'lofi', bassO: { wave: 'sine', vol: 0.3 }, comp: 'rhodes', drums: 'lofi', echo: 0.35, compO: { vol: 0.045 } },
    liner:   { tune: 'liner',  lead: { wave: 'sine', vol: 0.12, vib: [5, 0.014], attack: 0.04, release: 0.15 }, bass: 'waltz', comp: 'waltz', drums: 'waltz', echo: 0.35, compO: { duty: 0.25, vol: 0.022 } },
    mars:    { tune: 'mars',   lead: { duty: 0.25, vol: 0.09, glide: true, vib: [6, 0.01] }, gain: 1.8, bass: 'funk', bassO: { wave: 'sawtooth', vol: 0.12 }, comp: 'clav', drums: 'funk', echo: 0.2, compO: { duty: 0.125, vol: 0.032 } },
    horizon: { tune: 'horizon', gain: 1.9, lead: { wave: 'sawtooth', vol: 0.06, octaveLayer: 0.25, vib: [5, 0.006], attack: 0.04, release: 0.15 }, bass: 'ostinato', bassO: { duty: 0.25, vol: 0.09 }, comp: 'organ', drums: 'epic', echo: 0.25, compO: { vol: 0.018 } },
  };

  function compile(id) {
    const tr = TRACKS[id], tune = Object.assign({ beats: 4 }, TUNES[tr.tune]);
    const bars = tune.chords.split('|').map((b) => b.trim().split(/\s+/).map(chord));
    const barToks = tune.melody.split('|').map((b) => b.trim().split(/\s+/));
    barToks.forEach((b, i) => { if (b.length !== tune.beats * 2) console.warn(`music ${id}: bar ${i + 1} has ${b.length} eighths`); });
    const toks = [].concat(...barToks);
    // melody -> list of { step, n, len } on a 16th grid
    const mel = [];
    toks.forEach((tk, i) => {
      if (tk === '-') { if (mel.length && mel[mel.length - 1].open) mel[mel.length - 1].len += 2; return; }
      if (mel.length) mel[mel.length - 1].open = false;
      if (tk !== '.') mel.push({ step: i * 2, n: midi(tk), len: 2, open: true });
    });
    const q = 60 / (tune.bpm * (tr.bpmMul || 1));       // quarter note seconds
    return {
      id, name: tune.name, tr, bars, mel, q, swing: tune.swing, totalSteps: bars.length * tune.beats * 4, spb: tune.beats * 4, beats: tune.beats,
      bass: Object.assign({ wave: 'triangle', vol: 0.22, release: 0.04 }, tr.bassO),
      comp: Object.assign({}, tr.compO), drumVol: tr.drumVol == null ? 1 : tr.drumVol,
    };
  }

  // ------------------------------------------------------------------ playback
  let cur = null, timer = null, wanted = null;
  function makeOut(k) {
    const g = ctx.createGain(); g.gain.value = 0.0001; g.connect(I.musicBus);
    if (k.tr.echo) {
      const dl = ctx.createDelay(1.5), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), wet = ctx.createGain();
      dl.delayTime.value = k.q * 0.75; fb.gain.value = 0.38; lp.type = 'lowpass'; lp.frequency.value = 2200; wet.gain.value = k.tr.echo;
      const send = ctx.createGain(); send.connect(dl); dl.connect(lp); lp.connect(fb); fb.connect(dl); lp.connect(wet); wet.connect(g);
      return { out: g, dry: g, send };
    }
    return { out: g, dry: g, send: null };
  }
  function start(id) {
    ctx = I.ensure(); if (!ctx) return;
    const k = compile(id), o = makeOut(k);
    const now = ctx.currentTime;
    o.out.gain.exponentialRampToValueAtTime(0.7 * (k.tr.gain || 1), now + 1.2);
    const p = { k, o, step: 0, next: now + 0.1, prevLead: null };
    if (cur) fadeOut(cur);
    cur = p;
    if (!timer) timer = setInterval(tick, 25);
  }
  function fadeOut(p) {
    const t = ctx.currentTime;
    p.o.out.gain.cancelScheduledValues(t); p.o.out.gain.setValueAtTime(Math.max(0.0001, p.o.out.gain.value), t);
    p.o.out.gain.exponentialRampToValueAtTime(0.0001, t + 1.0);
    setTimeout(() => p.o.out.disconnect(), 1500);
  }
  function tick() {
    if (!cur) { clearInterval(timer); timer = null; return; }
    const p = cur, k = p.k, sixteenth = k.q / 4;
    while (p.next < ctx.currentTime + 0.15) {
      const s = p.step % k.spb, bar = Math.floor(p.step / k.spb) % k.bars.length, mid = k.spb / 2;
      const barChords = k.bars[bar], c = barChords.length > 1 && s >= mid ? barChords[1] : barChords[0];
      const nxBar = k.bars[(bar + 1) % k.bars.length], nx = barChords.length > 1 && s < mid ? barChords[1] : nxBar[0];
      // swing pushes the off-beat eighths late
      const t = p.next + (s % 4 === 2 ? (k.swing - 0.5) * k.q : 0);
      const d = p.o.dry, tr = k.tr, half = Object.assign({}, k, { bar });
      if (BASS[tr.bass]) BASS[tr.bass](d, t, s, c, nx, half);
      if (COMP[tr.comp]) COMP[tr.comp](d, t, s, c, nx, half);
      if (DRUMS[tr.drums]) DRUMS[tr.drums](d, t, s, c, nx, half);
      if (tr.arp) { const v = voicing(c); note(p.o.send || d, t, v[s % v.length] + 12 * (1 + (Math.floor(s / v.length) % 2)), sixteenth * 0.8, tr.arp); if (p.o.send) note(d, t, v[s % v.length] + 12, sixteenth * 0.8, Object.assign({}, tr.arp, { vol: tr.arp.vol * 0.6 })); }
      const m = k.mel.find((x) => x.step === (p.step % k.totalSteps));
      if (m) playLead(p, t, m, sixteenth);
      p.step++; p.next += sixteenth;
    }
  }
  function playLead(p, t, m, sixteenth) {
    const L = p.k.tr.lead, dur = m.len * sixteenth * 0.95, dests = [p.o.dry].concat(p.o.send ? [p.o.send] : []);
    for (const d of dests) {
      if (L.bell) { bell(d, t, m.n, Math.max(1.2, dur * 1.5), L.vol); continue; }
      const o = Object.assign({ release: 0.08 }, L);
      if (L.glide && p.prevLead) { o.from = freq(p.prevLead); o.glide = 0.07; }
      note(d, t, m.n, dur, o);
      if (L.detuneLayer) note(d, t, m.n, dur, Object.assign({}, o, { detune: L.detuneLayer, vol: L.vol * 0.7 }));
      if (L.octaveLayer) note(d, t, m.n - 12, dur, Object.assign({}, o, { wave: undefined, duty: L.octaveLayer, vol: L.vol * 0.8, from: o.from && o.from / 2 }));
    }
    p.prevLead = m.n;
  }

  function play(id) {
    if (!TRACKS[id]) return;
    wanted = id;
    if (cur && cur.k.id === id) return;
    if (!I.ctx) return;                                   // starts on the first click, see below
    start(id);
  }
  function stop() { wanted = null; if (cur && ctx) { fadeOut(cur); cur = null; } }
  // Browsers only allow sound after a click: begin the wanted track then.
  const kick = () => { if (wanted && (!cur || cur.k.id !== wanted)) start(wanted); };
  root.addEventListener('pointerdown', () => setTimeout(kick, 0), true);
  root.addEventListener('keydown', () => setTimeout(kick, 0), true);

  root.GameMusic = { play, stop, tracks: () => Object.keys(TRACKS).map((id) => ({ id, name: TUNES[TRACKS[id].tune].name, space: ['orbit', 'liner', 'mars', 'horizon'].includes(id) })), get current() { return cur ? cur.k.id : null; } };
})(window);
