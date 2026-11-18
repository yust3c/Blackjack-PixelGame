/* Win message sounds: a tier sting that grows with the tier, a coin count-up under the amount, and an
   entry sound per casino style, timed to the animation. Built on GameAudio's own synth (js/audio.js).
   WinSounds.play(level 0-4, style, word, countSecs) */
(function (root) {
  'use strict';
  const A = () => root.GameAudio && root.GameAudio._internal;
  const jit = (x, a) => x * (1 + (Math.random() * 2 - 1) * a);

  // ---- the tier sting: one fanfare, more layers per tier
  const KEYS = [['C5', 'E5', 'G5', 'C6'], ['D5', 'F#5', 'A5', 'D6'], ['E5', 'G#5', 'B5', 'E6'], ['F5', 'A5', 'C6', 'F6'], ['G5', 'B5', 'D6', 'G6']];
  function sting(L, at) {
    const { tone, seq, noise, hz } = A(); const k = KEYS[L], root5 = k[0], bass = hz(root5) / 4;
    seq(k, 0.07, { at, dur: 0.12, vol: 0.13 });
    tone({ at: at + 0.28, f: k[3], dur: 0.35 + L * 0.15, hold: L * 0.1, vol: 0.12, vib: { rate: 7, depth: 0.012 } });
    seq([bass, bass * 1.5], 0.14, { at, dur: 0.2, vol: 0.3, wave: 'triangle' });
    if (L >= 1) { tone({ at: at + 0.28, f: bass, dur: 0.6 + L * 0.2, hold: 0.2, vol: 0.3, wave: 'triangle' }); tone({ at: at + 0.28, f: k[1], dur: 0.5 + L * 0.15, hold: 0.15, vol: 0.06, duty: 0.125 }); }
    if (L >= 2) { for (const n of [k[2], k[1]]) tone({ at: at + 0.3, f: hz(n) * 2, dur: 0.9, hold: 0.3, vol: 0.05, duty: 0.125, vib: { rate: 6, depth: 0.01 }, wet: 0.35 });
      for (let i = 0; i < 6; i++) tone({ at: at + 0.4 + i * 0.06, f: jit(2600 + i * 260, 0.04), dur: 0.05, vol: 0.04, duty: 0.125, pan: i % 2 ? 0.5 : -0.5 }); }
    if (L >= 3) {   // a second, higher phrase and the fireworks (same timing as the bursts on screen)
      seq([k[1], k[2], k[3], hz(k[1]) * 2], 0.08, { at: at + 0.75, dur: 0.12, vol: 0.11, wet: 0.3 });
      tone({ at: at + 1.07, f: hz(k[3]) * 2, dur: 1.1, hold: 0.4, vol: 0.09, vib: { rate: 6, depth: 0.012 }, wet: 0.4 });
    }
    if (L === 4) {  // Insane: the spiral rises, a crash, then a big bright chord that shimmers through the rainbow
      let t = at, gap = 0.1; for (let i = 0; i < 16; i++) { tone({ at: t, f: 300 * Math.pow(1.09, i), dur: 0.09, vol: 0.06, wave: 'triangle', pan: Math.sin(i * 1.2) * 0.8, wet: 0.3 }); t += gap; gap *= 0.92; }
      noise({ at, f: 9000, dur: 0.9, vol: 0.12, q: 0.7, wet: 0.4 });
      tone({ at, f: 70, to: 35, dur: 0.8, vol: 0.45, wave: 'sine' });
      for (const [n, v] of [['G4', 0.08], ['B4', 0.06], ['D5', 0.06], ['G5', 0.07], ['D6', 0.04]]) tone({ at: at + 1.0, f: n, dur: 2.2, hold: 0.9, attack: 0.05, vol: v, duty: 0.125, vib: { rate: 5, depth: 0.01 }, wet: 0.45 });
      tone({ at: at + 1.0, f: 'G2', dur: 2.2, hold: 0.9, vol: 0.3, wave: 'triangle' });
      for (let i = 0; i < 14; i++) tone({ at: at + 1.1 + i * 0.09, f: hz(['G6', 'B6', 'D7', 'G7'][i % 4]), dur: 0.08, vol: 0.035, duty: 0.125, pan: i % 2 ? 0.6 : -0.6, wet: 0.5 });
    }
  }

  // ---- fireworks, same timing as the bursts on screen (Legendary and Insane)
  function fireworks(L) {
    const { tone, noise } = A();
    for (let r = 0; r < (L === 4 ? 6 : 3); r++) { const t = 0.3 + r * 0.35; tone({ at: Math.max(0, t - 0.25), f: 400, to: 1800, slide: 0.24, dur: 0.25, vol: 0.03, wave: 'sine' }); noise({ at: t, f: 900, to: 120, dur: 0.35, vol: 0.28, filter: 'lowpass' }); noise({ at: t + 0.04, f: 6000, dur: 0.5, vol: 0.05, q: 1.5, wet: 0.3 }); }
  }
  // ---- the amount counting up: coin ticks that climb in pitch, then a cash ding
  function countUp(L, secs, at) {
    const { tone, chip } = A(); const n = Math.round(8 + L * 4);
    for (let i = 0; i < n; i++) { const t = at + (i / n) * secs; tone({ at: t, f: 1500 + (i / n) * 1500, dur: 0.03, vol: 0.035, duty: 0.125 }); if (i % 3 === 0) chip(t, (i % 2 ? 0.3 : -0.3), 1 + i / n * 0.3, 0.5); }
    tone({ at: at + secs, f: 'E7', dur: 0.25, vol: 0.05, duty: 0.125, wet: 0.3 }); tone({ at: at + secs + 0.05, f: 'B7', dur: 0.35, vol: 0.04, duty: 0.125, wet: 0.3 });
  }

  // ---- the casino entries (times match sceneWord in the effects layer)
  const ENTRY = {
    reel(word) {        // reels whirring, then a clunk + ding as each letter locks, left to right
      const { tone, noise } = A(); const chars = [...word];
      for (let t = 0; t < 0.25 + chars.length * 0.09; t += 0.035) noise({ at: t, f: 3000, dur: 0.015, vol: 0.06, q: 4 });
      chars.forEach((ch, i) => { if (ch === ' ') return; const t = 0.25 + i * 0.09; noise({ at: t, f: 500, dur: 0.04, vol: 0.25, q: 3 }); tone({ at: t, f: hz2(i), dur: 0.12, vol: 0.06, duty: 0.125 }); });
    },
    goldin() {          // a shimmering gold glissando, left to right like the stream
      const { tone } = A(); for (let i = 0; i < 18; i++) tone({ at: 0.05 + i * 0.03, f: 1000 * Math.pow(1.06, i), dur: 0.35, vol: 0.035, wave: 'triangle', pan: -0.7 + i * 0.08, wet: 0.4 });
    },
    neonin(word) {      // the tubes buzz on, crackling per letter, over a hum; light rain
      const { tone, noise } = A(); const chars = [...word];
      chars.forEach((ch, i) => { if (ch === ' ') return; const t = 0.1 + i * 0.07; noise({ at: t, f: 4000, dur: 0.02, vol: 0.12, q: 6 }); noise({ at: t + 0.05, f: 3000, dur: 0.015, vol: 0.08, q: 6 }); });
      tone({ at: 0.1, f: 120, dur: 1.2, hold: 0.6, attack: 0.05, vol: 0.05, wave: 'sawtooth' }); tone({ at: 0.1, f: 240, dur: 1.2, hold: 0.6, attack: 0.05, vol: 0.02, wave: 'sawtooth' });
      noise({ f: 7000, dur: 1.6, attack: 0.3, vol: 0.04, filter: 'highpass' });
    },
    strike() {          // a thunder crack on the bolt, then the rumble
      const { tone, noise } = A(); noise({ f: 6000, to: 800, dur: 0.18, vol: 0.4, q: 0.5 }); noise({ at: 0.02, f: 600, to: 60, dur: 1.4, vol: 0.4, filter: 'lowpass' });
      tone({ at: 0.02, f: 90, to: 40, dur: 0.9, vol: 0.35, wave: 'sine' }); for (let i = 0; i < 4; i++) noise({ at: 0.3 + i * 0.12, f: 5000, dur: 0.02, vol: 0.08, q: 5 });
    },
    radarin() {         // a sonar ping with echo as the sweep starts, then soft blips
      const { tone } = A(); tone({ f: 1320, dur: 0.6, vol: 0.09, wave: 'sine', wet: 0.6 });
      for (let i = 0; i < 5; i++) tone({ at: 0.12 + i * 0.1, f: jit(1760, 0.05), dur: 0.04, vol: 0.04, duty: 0.125 });
    },
    glow() {            // bubbles rising and a soft swell, like the plankton lighting up
      const { tone } = A(); for (let i = 0; i < 9; i++) { const t = 0.05 + i * 0.07 + Math.random() * 0.03; tone({ at: t, f: jit(500 + i * 60, 0.1), to: jit(1100 + i * 80, 0.1), slide: 0.08, dur: 0.09, vol: 0.06, wave: 'sine', wet: 0.4 }); }
      tone({ at: 0.1, f: 'E5', dur: 1.0, attack: 0.3, vol: 0.04, wave: 'triangle', wet: 0.5 }); tone({ at: 0.1, f: 'B5', dur: 1.0, attack: 0.3, vol: 0.03, wave: 'triangle', wet: 0.5 });
    },
    goo() {             // drops of goo falling and splatting, then a drip
      const { tone, noise } = A(); for (let i = 0; i < 7; i++) { const t = 0.12 + i * 0.07; tone({ at: t, f: 900, to: 140, slide: 0.06, dur: 0.07, vol: 0.1, wave: 'sine' }); noise({ at: t + 0.05, f: 700, dur: 0.05, vol: 0.12, filter: 'lowpass' }); }
      tone({ at: 0.8, f: 1400, to: 600, slide: 0.05, dur: 0.06, vol: 0.06, wave: 'sine' });
    },
    glitch() {          // static bursts and broken blips that settle into place
      const { tone, noise } = A(); for (let i = 0; i < 10; i++) { const t = i * 0.065; noise({ at: t, f: jit(3000, 0.5), dur: 0.03, vol: 0.12 * (1 - i / 12), q: 2 }); tone({ at: t + 0.02, f: jit(300 + Math.random() * 1500, 0), dur: 0.03, vol: 0.05, wave: 'square' }); }
      tone({ at: 0.68, f: 'C6', dur: 0.15, vol: 0.06, duty: 0.125 });
    },
  };
  function hz2(i) { return A().hz(['C6', 'D6', 'E6', 'G6', 'A6', 'C7', 'D7', 'E7', 'G7', 'A7', 'C8', 'D8', 'E8'][i % 13]); }
  // when the name has fully arrived (so the sting lands with it)
  const LAND = { reel: (w) => 0.25 + (w.length - 1) * 0.09, goldin: () => 0.55, neonin: (w) => 0.1 + w.length * 0.07, strike: () => 0.12, radarin: () => 0.45, glow: () => 0.5, goo: () => 0.5, glitch: () => 0.6 };

  function play(L, style, word, countSecs) {
    const GA = root.GameAudio; if (!GA || !A() || !A().ensure()) return;
    const s = GA.settings; if (s.muted || s.master <= 0 || s.sfx <= 0) return;
    const land = LAND[style] ? LAND[style](word) : 0.15;
    if (ENTRY[style]) ENTRY[style](word);
    // schedule the sting a bit later by shifting every note: easiest is a timeout for the delayed part
    countUp(L, countSecs, 0);   // the number starts counting right away, like on screen
    if (L >= 3) fireworks(L);
    setTimeout(() => sting(L, 0), land * 1000);   // the fanfare lands with the name
  }
  root.WinSounds = { play };
})(window);
