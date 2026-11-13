/* Scene events: every few minutes something small happens in the room (a cat crosses the bar, a ship passes the
   window...), for a few seconds and never over the cards or buttons. The dealer sometimes comments (lines in
   js/phrases.js, events "fx_<id>"). Each scene also has one ultra-rare secret event.
   Seen events are saved (SaveData.KEYS.sceneevents) and reported with the document event
   'sceneevents:seen' { scene, id, secret, seen, total, secretsSeen, totalSecrets } for the achievements.
   ui.js calls SceneEvents.start(game, sceneId) in startMode and SceneEvents.stop() in showMenu.
   Art is drawn on the scene's own 192x108 grid, in two layers that follow the scene picture: one just over the
   room (things in the room pass behind the dealer and the table) and one over everything (flashes, glare). */
(function (root) {
  'use strict';

  const doc = root.document;
  const W = 192; const H = 108;
  const KEY = (root.SaveData && root.SaveData.KEYS.sceneevents) || 'blackjack-sceneevents-v1';
  const FIRST_MS = [90e3, 180e3];       // first event after 1.5-3 minutes at the table
  const EVERY_MS = [180e3, 360e3];      // then one every 3-6 minutes
  const SECRET_CHANCE = 1 / 30;         // share of events that are the scene's secret one
  const SAY_CHANCE = 0.6;               // how often the dealer comments

  // ---------------------------------------------------------------- pixel helpers
  const op = (o) => (o == null || o === 1 ? '' : ` opacity="${o}"`);
  const R = (x, y, w, h, c, o) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"${op(o)}/>`;
  /** A bitmap: rows of palette letters ('.' = clear), drawn at (x, y), runs merged into one rect. */
  function bmp(rows, pal, x, y, o) {
    let s = '';
    rows.forEach((row, j) => {
      let i = 0;
      while (i < row.length) {
        const ch = row[i];
        if (!pal[ch]) { i++; continue; }
        let k = i; while (k < row.length && row[k] === ch) k++;
        s += R(x + i, y + j, k - i, 1, pal[ch], o);
        i = k;
      }
    });
    return s;
  }
  const flip = (rows) => rows.map((r) => r.split('').reverse().join(''));

  // ---------------------------------------------------------------- sprites
  const CAT = {
    walk: [
      ['.k.k.......', '.kkk......k', 'kykk.....k.', '.kkkkkkkkk.', '..kkkkkkk..', '.k..k..k..k'],
      ['.k.k.......', '.kkk.....k.', 'kykk.....k.', '.kkkkkkkkk.', '..kkkkkkk..', '..k.k..k.k.'],
      ['...........', '.k.k.....k.', '.kkk......k', 'kykkkkkkkk.', '.kkkkkkkkk.', '...kk...kk.'],
      ['.k.k.......', '.kkk......k', 'kykk......k', '.kkkkkkkkk.', '..kkkkkkk..', '..k.k..k.k.'],
    ],
    leap: ['.k.k.........', '.kkk........k', 'kykkkkkkkkkk.', '.kkkkkkkkkk..', 'k..........k.'],
    sit: ['.k.k....', '.kkk....', 'kykk....', '.kkkk...', '.kkkkk.k', '.kkkkkkk', '..k.kk..'],
    sitTail: ['.k.k....', '.kkk....', 'kykk...k', '.kkkk..k', '.kkkkk.k', '.kkkkkk.', '..k.kk..'],
  };
  const CAT_PAL = { k: '#121016', y: '#ffd75e' };



  // ---------------------------------------------------------------- timing helpers (SVG animation, so every event
  // runs on its own clock from the moment it is drawn)
  const ms = (t) => `${Math.round(t)}ms`;
  /** Moves `inner` through points [[0..1, x, y], ...] over `dur` ms, starting after `begin` ms; it waits at the first point. */
  function path(points, dur, inner, begin, spline) {
    const vals = points.map((p) => `${p[1]} ${p[2]}`).join(';');
    const keys = points.map((p) => p[0]).join(';');
    const sp = spline ? ` calcMode="spline" keySplines="${points.slice(1).map(() => spline).join(';')}"` : '';
    return `<g transform="translate(${points[0][1]} ${points[0][2]})"><animateTransform attributeName="transform" type="translate" values="${vals}" keyTimes="${keys}" dur="${ms(dur)}" begin="${ms(begin || 0)}" fill="freeze"${sp}/>${inner}</g>`;
  }
  /** Shows `inner` only between `from` and `to` ms. */
  const during = (from, to, inner) => `<g opacity="0"><set attributeName="opacity" to="1" begin="${ms(from)}" dur="${ms(to - from)}"/>${inner}</g>`;
  /** Fades `inner` in and out over `dur` ms (to opacity `o`), starting after `begin`. */
  const fadeIO = (dur, inner, o, begin, edge) => {
    const e = edge == null ? 0.15 : edge;
    return `<g opacity="0"><animate attributeName="opacity" values="0;${o == null ? 1 : o};${o == null ? 1 : o};0" keyTimes="0;${e};${1 - e};1" dur="${ms(dur)}" begin="${ms(begin || 0)}" fill="freeze"/>${inner}</g>`;
  };
  /** Opacity keyframes: values like '0;1;0.2;1', evenly spaced or at keyTimes. */
  const flick = (dur, values, inner, begin, keyTimes, repeat) => `<g opacity="${values.split(';')[0]}"><animate attributeName="opacity" values="${values}"${keyTimes ? ` keyTimes="${keyTimes}"` : ''} calcMode="discrete" dur="${ms(dur)}" begin="${ms(begin || 0)}"${repeat ? ` repeatCount="${repeat}"` : ' fill="freeze"'}/>${inner}</g>`;
  /** Cycles through drawings, `each` ms per frame, forever. */
  const cycle = (frames, each) => frames.map((f, i) => `<g opacity="${i ? 0 : 1}"><animate attributeName="opacity" values="${frames.map((_, j) => (j === i ? 1 : 0)).join(';')}" calcMode="discrete" dur="${ms(each * frames.length)}" repeatCount="indefinite"/>${f}</g>`).join('');
  /** Scales `inner` (drawn round 0,0) from a to b. */
  const grow = (a, b, dur, inner, begin) => `<g transform="scale(${a})"><animateTransform attributeName="transform" type="scale" values="${a};${b}" dur="${ms(dur)}" begin="${ms(begin || 0)}" fill="freeze"/>${inner}</g>`;
  const clipWin = (inner) => `<g clip-path="url(#fx-win)">${inner}</g>`;
  /** A soft round glow: stacked ellipses, brightest in the middle (no hard box edges). */
  const glow = (cx, cy, rx, ry, col, o) => [1, 0.7, 0.45].map((k) => `<ellipse cx="${cx}" cy="${cy}" rx="${rx * k}" ry="${ry * k}" fill="${col}" opacity="${(o * (k === 1 ? 0.45 : 0.4)).toFixed(3)}"/>`).join('');

  // ---------------------------------------------------------------- more sprites
  const SLOT_SYMS = {
    seven: [['rrr', '..r', '.r.', '.r.', '.r.'], { r: '#d8323a' }],
    cherry: [['..g', '.g.', 'g.g', 'r.r', 'r.r'], { g: '#3a9a4a', r: '#e0303a' }],
    bar: [['...', 'kkk', 'wkw', 'kkk', '...'], { k: '#20202a', w: '#fbf6e6' }],
    bell: [['.y.', 'yyy', 'yyy', 'yyy', '.o.'], { y: '#ffd75e', o: '#c08a10' }],
  };
  const GOLD_COIN = ['.yy.', 'ywoy', 'yooy', '.yy.'];
  const COIN_PAL = { y: '#ffd75e', w: '#fff6c0', o: '#c08a10' };
  const POLICE = [
    '....rrbb....', '...kkkkkk...', '..kwwkkwwk..', 'kkkkkkkkkkkk', 'kwwwwwwwwwwy', 'kkkkkkkkkkkk', '.oo......oo.',
  ];
  const POLICE_PAL = { k: '#14141c', w: '#e8e8f0', y: '#ffd75e', o: '#3a3a44', r: '#ff2a3a', b: '#2a6aff' };
  const CAR = ['..kkkk..', '.kwwkwk.', 'kkkkkkkk', '.o....o.'];
  const CAR_PAL = { k: '#5a2a7a', w: '#9ad0ff', o: '#14141c' };
  const UFO2 = [
    '.....ccc.....', '....cwccc....', '...ccccccc...', '.mmmmmmmmmmm.', 'mlmmlmmmlmmlm', '.mmmmmmmmmmm.', '...nn...nn...',
  ];
  const UFO2_PAL = { c: '#9af0b0', w: '#ffffff', m: '#a8b0c0', l: '#ffd75e', n: '#5a6070' };
  // A shadowy patron in an armchair, smoking.
  const PATRON = [
    '......hhh....', '.....hhhhh...', '.....hsss....', '......ss.....', '....cccccc...', 'aa.ccccccca.a',
    'aaccccccccaaa', 'aacccccccaaaa', 'aaaaaaaaaaaaa', 'aaaaaaaaaaaaa', '.a.........a.',
  ];
  const PATRON_PAL = { h: '#2a2028', s: '#5a4038', c: '#1a141c', a: '#4a1420' };
  const ASTRO2 = [
    '....kkkkk.....', '...kwwwwwk....', '..kwwbbbbwk...', '.pkwbccbbbwk..', '.pkwbcbbbbwk..', '.pkwbbbbbbwk..', '.pkkwwwwwwkk..',
    '.pkwwoowwrwwk.', 'kwwkwwwwwwkwwk', 'kwk.wwsswwk.wk', '.k..wwwwww..k.', '....kwwwwk....', '....ww..ww....', '....ws..sw....', '....kk..kk....',
  ];
  const ASTRO2_WAVE = [
    '....kkkkk.....', '...kwwwwwk..k.', '..kwwbbbbwk.wk', '.pkwbccbbbwkwk', '.pkwbcbbbbwkwk', '.pkwbbbbbbwkw.', '.pkkwwwwwwkkw.',
    '.pkwwoowwrwk..', 'kwwkwwwwwwk...', 'kwk.wwsswwk...', '.k..wwwwww....', '....kwwwwk....', '....ww..ww....', '....ws..sw....', '....kk..kk....',
  ];
  const ASTRO2_PAL = { w: '#e8ecf4', s: '#a8b0c4', k: '#4a5068', b: '#1a2448', c: '#9ff4ff', o: '#ff9a3a', r: '#ff4a5a', p: '#8890a8' };
  const MARTIAN2 = [
    '.t............t.', '.ta..........at.', '...a........a...', '....dggggggd....', '..gglllggggggd..', '.glwwwggggwwwgd.',
    '.gwwkkggggwkkwd.', '.gwwkkggggwkkwd.', '.ggwwgsgggswwgd.', '.ggggggggggggdd.', '..ggkggggggkgd..', '..gggkkkkkkggd..',
    '...ddggggggdd...', '....dddddddd....',
  ];
  const MARTIAN2_BLINK = MARTIAN2.map((r, i) => (i === 5 ? '.glgggggggggggd.' : i === 6 ? '.gkkkkggggkkkkd.' : i === 7 ? '.ggggggggggggd..' : r));
  const MARTIAN2_PAL = { a: '#7fe08a', t: '#d8ff7a', g: '#5fd068', l: '#9af0a0', d: '#2f8a40', s: '#3fae52', w: '#fbf6e6', k: '#08080c' };
  const HAND = ['g.g.g', 'ggggg', '.ggg.', '.ggg.'];
  const ROCK = ['.rr.', 'rrrd', 'rrdd', '.dd.'];
  // The Corner's secret: a mouse running off with a chip (faces right, tail left).
  const MOUSE = [
    ['.......gp..', '....ggggkg.', 'tgggggggggn', '...g...g...'],
    ['.......gp..', '....ggggkg.', 'tgggggggggn', '....g.g....'],
  ];
  const MOUSE_PAL = { g: '#8a8494', p: '#ffa0b8', k: '#08080c', n: '#ffa0b8', t: '#c890a0' };
  const CHIP_GOLD = ['.yy.', 'yooy', 'yooy', '.yy.'];
  const CHIP_PAL = { y: '#ffd75e', o: '#b8860b' };
  // The Grand Hotel's secret: a cat burglar on a rope (masked, dark suit with a rim light).
  // 11 wide x 15 tall, facing you: goggles up on the forehead, white eyes in the mask slit, harness, belt, gloves, soft boots.
  const THIEF = [
    '....kkk....', '...eeeee...', '...kwkwk...', '...kkkkh...', '....kkk....', '..hkbkbkh..', '.hkkkbkkkh.', 'nkkkbkbkkkn',
    'n.kkkkkkk.n', '..yyyoyyy..', '..kkk.kkh..', '..kkk.kkh..', '..kk...kh..', '..kk...kh..', '.nnn...nnn.',
  ];
  const THIEF_GRAB = THIEF.map((r, i) => ({ 5: '..hkbkbkhn.', 6: '.hkkkbkkkn.', 7: 'nkkkbkbkk..', 8: 'n.kkkkkkk..' }[i] || r));
  const THIEF_WINK = THIEF_GRAB.map((r, i) => (i === 2 ? '...kwkkk...' : r));
  const THIEF_PAL = { k: '#3a2a52', h: '#a890d8', w: '#fbf6e6', e: '#9fe0ff', b: '#d8c49a', y: '#8a7038', o: '#ffd75e', n: '#16101e' };
  // The Star Liner's secret: a ghost galleon sailing through space.
  const GALLEON = [
    '.........m..............', '.........m.....m........', '......ssssss...m........', '......ssssss.ssss.......',
    '.....sssssss.ssss.......', '.....sssssss.sssss......', '......ssssss.sssss......', '.........m....m.........',
    'hhh......m....m.....hh..', '.hhhhhhhhhhhhhhhhhhhhh..', '..hwhwhwhwhwhwhwhwhhh...', '...hhhhhhhhhhhhhhhhh....',
    '....hhhhhhhhhhhhhhh.....', '......hhhhhhhhhhh.......',
  ];
  const GALLEON_PAL = { s: '#c8ffe0', m: '#7fd8b0', h: '#4aa888', w: '#eaffb0' };
  const ROCK_HOT = { r: '#d8c8d8', d: '#ff8a3a' };   // lit by the accretion disc

  // ---------------------------------------------------------------- sounds (js/audio.js internals, so volume and mute apply)
  // Event sounds are written quiet and lifted here, so they read over the scene music (which also ducks, below).
  const LOUD = 2.4; const MAX_VOL = 0.5;
  const lift = (o) => Object.assign({}, o, { vol: Math.min(MAX_VOL, (o && o.vol != null ? o.vol : 0.3) * LOUD) });
  function sfx(fn) {
    const A = root.GameAudio && root.GameAudio._internal;
    if (!A || !A.ctx) return;
    const B = { hz: A.hz, chip: A.chip, tone: (o) => A.tone(lift(o)), noise: (o) => A.noise(lift(o)), seq: (n, step, o) => A.seq(n, step, lift(o)) };
    try { fn(B); } catch (e) { /* sound must never break an event */ }
  }
  // While an event sound plays the music drops to 30%, then comes back.
  let duckTimer = 0;
  function musicLevel(k, ramp) {
    const GA = root.GameAudio; const A = GA && GA._internal;
    if (!A || !A.ctx || !A.musicBus || !GA.settings) return;
    A.musicBus.gain.setTargetAtTime(GA.settings.music * GA.settings.music * k, A.ctx.currentTime, ramp);
  }
  function duck(ms) {
    root.clearTimeout(duckTimer);
    musicLevel(0.3, 0.15);
    duckTimer = root.setTimeout(() => { duckTimer = 0; musicLevel(1, 0.6); }, ms);
  }
  function unduck() { if (duckTimer) { root.clearTimeout(duckTimer); duckTimer = 0; musicLevel(1, 0.3); } }
  const SOUNDS = {
    // smoke: a lighter clicks, then slow puffs and a crackling ember
    puff: () => sfx((A) => {
      A.noise({ f: 5000, dur: 0.03, vol: 0.06 }); A.noise({ at: 0.06, f: 1800, dur: 0.25, vol: 0.03, q: 2 });
      [0.6, 1.9, 3.2, 4.5].forEach((t) => { A.noise({ at: t, f: 700, to: 400, dur: 1.1, vol: 0.035, filter: 'lowpass', attack: 0.25 }); A.noise({ at: t - 0.3, f: 6000, dur: 0.02, vol: 0.02 }); });
    }),
    // meteor shower: soft falling whistles with a fizz, one per streak
    streak: () => sfx((A) => { for (let i = 0; i < 12; i++) { A.tone({ at: i * 0.3, f: ['G7', 'E7', 'A7'][i % 3], to: 'C6', dur: 0.7, slide: 0.7, vol: 0.012, wave: 'sine' }); A.noise({ at: i * 0.3 + 0.1, f: 7000, dur: 0.5, vol: 0.008, q: 3 }); } }),
    // Event Horizon rocks: each one drops in pitch as it shrinks into the hole, then a dull thump
    fallin: () => sfx((A) => { for (let i = 0; i < 8; i++) { const t = i * 0.42; A.tone({ at: t, f: ['E4', 'C4', 'G4', 'D4'][i % 4], to: 'C2', dur: 1.6, slide: 1.6, vol: 0.03, wave: 'triangle' }); A.noise({ at: t + 1.55, f: 120, dur: 0.25, vol: 0.12, filter: 'lowpass' }); } }),
    // jewel thief: the rope whizzes down, a crystal tings, a cheeky ding on the wink, then a fast zip up
    heist: () => sfx((A) => {
      A.noise({ f: 3500, to: 900, dur: 2.0, vol: 0.03, q: 6 });
      A.tone({ at: 2.6, f: 'A7', dur: 0.4, vol: 0.03, wave: 'sine' }); A.tone({ at: 2.7, f: 'E8', dur: 0.3, vol: 0.02, wave: 'sine' });
      A.tone({ at: 4.6, f: 'C7', to: 'G7', dur: 0.12, slide: 0.1, vol: 0.025, duty: 0.125 });
      A.noise({ at: 5.6, f: 800, to: 5000, dur: 0.6, vol: 0.05, q: 6 });
    }),
    // ghost galleon: creaking timbers, wind in the sails and a far-off choir
    ghostship: () => sfx((A) => {
      for (let i = 0; i < 6; i++) A.tone({ at: 0.5 + i * 1.6, f: ['A2', 'G2', 'B2'][i % 3], to: ['G2', 'E2', 'A2'][i % 3], dur: 0.7, slide: 0.7, vol: 0.03, wave: 'sawtooth', vib: { rate: 22, depth: 0.03 } });
      A.noise({ f: 500, to: 1200, dur: 9, vol: 0.03, q: 1.5, attack: 2 });
      ['A4', 'C5', 'E5'].forEach((n, k) => A.tone({ at: 2 + k * 0.4, f: n, dur: 5, vol: 0.016, wave: 'sine', vib: { rate: 4, depth: 0.02 } }));
    }),
    // the hole blinks: a slow, deep heartbeat while it is open, and a wet blink
    heartbeat: () => sfx((A) => {
      for (let t = 1.0; t < 6.1; t += 0.95) { A.tone({ at: t, f: 'A1', to: 'E1', dur: 0.18, slide: 0.18, vol: 0.2, wave: 'sine' }); A.tone({ at: t + 0.22, f: 'G1', to: 'D1', dur: 0.16, slide: 0.16, vol: 0.14, wave: 'sine' }); }
      [0.6, 3.75, 6.2].forEach((t) => A.noise({ at: t, f: 400, to: 150, dur: 0.18, vol: 0.06, filter: 'lowpass' }));
    }),
    // Martian dust storm: wind that swells and howls, grit ticking on the glass
    storm: () => sfx((A) => {
      A.noise({ f: 300, to: 900, dur: 3.2, vol: 0.06, q: 2, attack: 1.5 }); A.noise({ at: 3, f: 900, to: 250, dur: 3.8, vol: 0.06, q: 2, attack: 0.2 });
      A.tone({ at: 1.2, f: 'D5', to: 'F5', dur: 2.4, slide: 2.4, vol: 0.008, wave: 'sine', vib: { rate: 3, depth: 0.04 } });
      for (let i = 0; i < 26; i++) A.noise({ at: 0.6 + i * 0.22 + Math.random() * 0.1, f: 6000, dur: 0.015, vol: 0.015 });
    }),
    // a Martian says hi: a wobbly alien chirp
    chirp: () => sfx((A) => { [1.2, 2.4, 3.4].forEach((t, i) => A.tone({ at: t, f: ['C6', 'E6', 'G5'][i], to: ['G6', 'C6', 'D6'][i], dur: 0.22, slide: 0.2, vol: 0.03, duty: 0.25, vib: { rate: 30, depth: 0.05 } })); }),
    // UFO: a pulsing tractor-beam hum that rises while the car is lifted
    tractor: () => sfx((A) => { A.tone({ at: 0.2, f: 'E3', dur: 7, vol: 0.03, wave: 'sine', vib: { rate: 7, depth: 0.04 } }); A.tone({ at: 2.2, f: 'E4', to: 'E5', dur: 3, slide: 3, vol: 0.025, wave: 'triangle', vib: { rate: 12, depth: 0.03 } }); A.seq(['A6', null, 'A6', 'E6'], 0.12, { at: 0, dur: 0.08, vol: 0.025, duty: 0.125 }); }),
    // astronaut: a burst of radio static and a friendly beep while he waves
    radio: () => sfx((A) => { A.noise({ at: 3.1, f: 2500, dur: 0.4, vol: 0.03, q: 0.6 }); A.seq(['A6', null, 'A6', 'E6', null, 'C7'], 0.12, { at: 3.5, dur: 0.08, vol: 0.03, duty: 0.125 }); A.noise({ at: 4.4, f: 2500, dur: 0.2, vol: 0.02, q: 0.6 }); }),
    meow: () => sfx((A) => { A.tone({ f: 'A5', to: 'D6', dur: 0.18, slide: 0.08, vol: 0.06, duty: 0.25 }); A.tone({ at: 0.16, f: 'D6', to: 'G5', dur: 0.3, slide: 0.25, vol: 0.06, duty: 0.25 }); }),
    jackpot: () => sfx((A) => {
      for (let i = 0; i < 14; i++) A.tone({ at: i * 0.11, f: 'C6', dur: 0.03, vol: 0.02, duty: 0.25 });   // reels ticking
      A.tone({ at: 1.0, f: 'G5', dur: 0.06, vol: 0.04, duty: 0.25 }); A.tone({ at: 1.4, f: 'G5', dur: 0.06, vol: 0.04, duty: 0.25 }); A.tone({ at: 1.8, f: 'C6', dur: 0.06, vol: 0.05, duty: 0.25 });
      A.seq(['C6', 'E6', 'G6', 'C7', 'G6', 'C7', 'E7'], 0.08, { at: 2.0, dur: 0.09, vol: 0.05, duty: 0.25 });
      for (let i = 0; i < 14; i++) A.chip(2.1 + i * 0.12, -0.7, 1.2 + (i % 3) * 0.1, 0.4);
    }),
    hum: () => sfx((A) => { A.tone({ f: 55, dur: 1.8, vol: 0.08, wave: 'sawtooth' }); A.noise({ at: 0.3, f: 3000, dur: 0.06, vol: 0.05 }); A.noise({ at: 0.9, f: 3000, dur: 0.05, vol: 0.05 }); }),
    clink: () => sfx((A) => { for (let i = 0; i < 6; i++) A.tone({ at: i * 0.32 + Math.random() * 0.05, f: ['E7', 'G7', 'C7', 'A7'][i % 4], dur: 0.14, vol: 0.025, wave: 'sine' }); }),
    siren: () => sfx((A) => { for (let i = 0; i < 5; i++) A.tone({ at: i * 0.7, f: 'A5', to: 'E6', dur: 0.68, slide: 0.34, vol: 0.025, wave: 'sine' }); A.noise({ f: 300, to: 500, dur: 3, vol: 0.03, filter: 'lowpass' }); }),
    thunder: () => sfx((A) => { A.noise({ f: 6000, dur: 0.12, vol: 0.12 }); A.noise({ at: 0.35, f: 300, to: 60, filter: 'lowpass', dur: 2.4, vol: 0.32 }); A.noise({ at: 0.9, f: 2500, dur: 2.5, vol: 0.025, q: 0.5 }); }),
    zap: () => sfx((A) => { A.tone({ f: 'C4', to: 'C6', dur: 0.8, slide: 0.8, vol: 0.04, duty: 0.125, vib: { rate: 18, depth: 0.04 } }); }),
    cheer: () => sfx((A) => { A.noise({ f: 2500, dur: 0.06, vol: 0.15 }); A.noise({ at: 0.05, f: 1400, to: 900, dur: 1.6, vol: 0.06, q: 0.7 }); A.seq(['G5', 'C6', 'E6'], 0.12, { at: 0.15, dur: 0.12, vol: 0.02 }); }),
    fireworks: () => sfx((A) => {
      [0.3, 1.3, 2.2, 3.1, 3.5, 4.5].forEach((t) => {
        A.tone({ at: t, f: 'C6', to: 'C7', dur: 0.45, slide: 0.45, vol: 0.02, duty: 0.125 });
        A.noise({ at: t + 0.5, f: 900, to: 200, dur: 0.5, vol: 0.07, q: 0.8 });
        for (let i = 0; i < 5; i++) A.noise({ at: t + 0.7 + i * 0.09, f: 5000, dur: 0.03, vol: 0.02 });
      });
    }),
    rumble: () => sfx((A) => { A.noise({ f: 200, to: 60, filter: 'lowpass', dur: 0.9, vol: 0.35 }); for (let i = 0; i < 5; i++) A.chip(0.05 + i * 0.06, 0, 1 + i * 0.03, 0.5); A.tone({ at: 0.3, f: 'A5', dur: 0.25, vol: 0.02, duty: 0.25 }); A.tone({ at: 0.8, f: 'A5', dur: 0.25, vol: 0.02, duty: 0.25 }); }),
    flare: () => sfx((A) => { A.noise({ f: 800, to: 4000, dur: 2, vol: 0.05, q: 0.6 }); A.tone({ f: 'C3', to: 'G3', dur: 2, slide: 2, vol: 0.04, wave: 'sawtooth' }); }),
    beep: () => sfx((A) => A.seq(['A6', null, 'A6', 'E6'], 0.12, { dur: 0.08, vol: 0.03, duty: 0.125 })),
    warp: () => sfx((A) => { A.tone({ f: 'C2', to: 'C1', dur: 3, slide: 3, vol: 0.18, wave: 'sine' }); A.noise({ f: 200, to: 2000, dur: 3, vol: 0.04 }); }),
    eerie: () => sfx((A) => A.seq(['E5', 'F5', 'E5', 'D#5'], 0.5, { dur: 0.9, vol: 0.03, wave: 'sine', vib: { rate: 4, depth: 0.03 } })),
    squeak: () => sfx((A) => { A.tone({ f: 'E7', to: 'A7', dur: 0.06, slide: 0.05, vol: 0.03, duty: 0.125 }); A.tone({ at: 0.12, f: 'E7', to: 'B7', dur: 0.05, slide: 0.04, vol: 0.03, duty: 0.125 }); }),
  };

  // ---------------------------------------------------------------- shared event pieces
  // Red alert lights and a few sparks from the ceiling, on top of the room shaking.
  const shake = {
    body: 'fx-shake', sound: 'rumble', dur: 2200,
    front: () => flick(2200, '0.22;0;0.22;0;0.22;0', R(0, 0, W, H, '#ff2a2a'))
      + [30, 70, 122, 160].map((x, i) => path([[0, x, 8], [1, x + (i % 2 ? 4 : -4), 44]], 900, R(0, 0, 1, 1, '#ffd75e') + R(0, -1, 1, 1, '#ff9a3a', 0.6), 150 + i * 120, '0.4 0 1 1')).join('')
      + fadeIO(1800, [26, 66, 110, 150].map((x) => R(x, 6, 18, 3, '#8a8094', 0.25)).join(''), 1, 100),
  };
  // Meteors: a bright head with a long tail, crossing the window.
  function meteors(x0, y0, x1, y1, n, toward) {
    let s = '';
    for (let i = 0; i < n; i++) {
      const sx = x0 + ((i * 37) % (x1 - x0)); const sy = y0 + ((i * 13) % 6);
      const big = i % 3 === 0;
      const tail = R(0, 0, big ? 2 : 1, big ? 2 : 1, '#ffffff') + R(big ? 2 : 1, -1, 1, 1, '#fff6c0') + R(big ? 3 : 2, -2, 1, 1, '#ffd75e')
        + R(big ? 4 : 3, -3, 1, 1, '#ff9a3a', 0.85) + R(big ? 5 : 4, -4, 1, 1, '#ff9a3a', 0.6) + R(big ? 6 : 5, -5, 1, 1, '#ff6a1a', 0.35) + (big ? R(7, -6, 1, 1, '#ff6a1a', 0.2) : '');
      const to = toward ? [toward[0], toward[1]] : [sx - 30, sy + 26];
      const head = toward ? grow(1, 0.15, 1100, tail, i * 300) : tail;
      s += during(i * 300, i * 300 + 1100, path([[0, sx, sy], [1, to[0], to[1]]], 1100, head, i * 300, toward ? '0.5 0 1 1' : null));
    }
    return clipWin(s);
  }
  // The scene's signs stutter (CSS on .sc-sign) and spit a few sparks; nothing else in the room changes.
  const signGlitch = (signs) => ({
    body: 'fx-glitch', sound: 'zap', dur: 2400,
    back: () => signs.map(([x, y], k) => [0, 1, 2, 3].map((i) => path([[0, x + (i % 2 ? 1 : -1), y], [1, x + (i - 1.5) * 3, y + 6 + i]], 450,
      R(0, 0, 1, 1, '#ffffff') + R(0, -1, 1, 1, '#7ff0ff', 0.6), 200 + k * 330 + i * 90 + (i > 1 ? 900 : 0), '0.3 0 1 1')).join('')
      + flick(2400, '0;0.5;0;0.35;0', glow(x, y - 3, 9, 5, '#ffffff', 0.35), 0, '0;0.1;0.16;0.5;0.56')).join(''),
  });
  const flare = {
    dur: 3400, sound: 'flare',
    front: () => fadeIO(3400, `<rect width="${W}" height="${H}" fill="url(#fx-flare-g)"/>`, 0.85, 0, 0.3)
      + fadeIO(3400, [[40, 30, 6], [70, 50, 3], [110, 62, 4], [150, 78, 8]].map(([x, y, r], i) => `<circle cx="${x}" cy="${y}" r="${r}" fill="${['#fff6d0', '#ffb04a', '#ff6a1a', '#ffb04a'][i]}" opacity="0.18"/>`).join(''), 1, 300, 0.3),
  };

  // Event Horizon secret: the black hole opens as a pixel eye (lids, bloodshot sclera, slit iris that looks around).
  const EYE_OPEN = ['.....ooooooo.....', '...oowwwwwwwoo...', '..owwwwwwwwwwvo..', '.owvwwwwwwwwwwso.', 'owwwwwwwwwwwwwwso', '.oswwwwwwwwwwvso.', '..osswwwwwwwsso..', '...oosssssssoo...', '.....ooooooo.....'];
  const EYE_HALF = ['.................', '.................', '...ooooooooooo...', '.oowwwwwwwwwwsoo.', 'owwwwwwwwwwwwwwso', '.oosswwwwwwwssoo.', '...ooooooooooo...', '.................', '.................'];
  const EYE_SHUT = ['.................', '.................', '.................', '.................', 'ooooooooooooooooo', '.................', '.................', '.................', '.................'];
  const EYE_PAL = { o: '#5a0a12', w: '#fff0d0', s: '#e0b890', v: '#d04040' };
  const IRIS = ['..rrr..', '.rRkRr.', 'rRRkRRr', 'rRRkRRr', 'rRRkRRr', '.rRkRr.', '..rrr..'];
  const IRIS_PAL = { r: '#ff8a2a', R: '#c83a10', k: '#08080c' };
  function holeEye() {
    const x0 = 88; const y0 = 16;   // top-left of the 17x9 eye, centred on the hole at (96, 20)
    const clip = (rows, id) => `<clipPath id="${id}">${rows.map((r, j) => [...r].map((c, i) => (c === 'w' || c === 's' || c === 'v' ? `<rect x="${x0 + i}" y="${y0 + j}" width="1" height="1"/>` : '')).join('')).join('')}</clipPath>`;
    const iris = path([[0, 93, 17], [0.3, 93, 17], [0.36, 89, 17], [0.48, 89, 17], [0.56, 98, 17], [0.7, 98, 17], [0.76, 93, 18], [1, 93, 18]], 7000,
      bmp(IRIS, IRIS_PAL, 0, 0) + R(4, 1, 1, 1, '#ffffff'), 0, null);
    const frame = (rows, id) => clip(rows, id) + bmp(rows, EYE_PAL, x0, y0) + `<g clip-path="url(#${id})">${iris}</g>`;
    const show = [[600, 800, EYE_SHUT], [800, 1000, EYE_HALF], [1000, 3700, EYE_OPEN], [3700, 3820, EYE_HALF], [3820, 3960, EYE_SHUT], [3960, 4080, EYE_HALF],
      [4080, 6100, EYE_OPEN], [6100, 6300, EYE_HALF], [6300, 6600, EYE_SHUT]];
    // a dim red ring of pixels pulses round the hole while it is open
    const ring = during(1000, 6100, flick(900, '0.9;0.4', [[-9, 0], [9, 0], [-7, -4], [7, -4], [-7, 4], [7, 4], [0, -6], [0, 6], [-4, -6], [4, -6], [-4, 6], [4, 6]].map(([dx, dy]) => R(96 + dx, 20 + dy, 1, 1, '#ff3a2a')).join(''), 0, null, 'indefinite'));
    return ring + show.map(([a, b, rows], k) => during(a, b, frame(rows, `fx-eye${k}`))).join('');
  }

  // Grand Hotel: fireworks over the city, seen through the gilded grille behind the dealer.
  function fireworks() {
    const COL = [['#ff7ad8', '#ffd0f0'], ['#7ff0ff', '#e0ffff'], ['#ffd75e', '#fff6c0'], ['#9af0a0', '#e8ffe0'], ['#ff9a3a', '#ffe0b0']];
    const bursts = [[80, 18, 300], [112, 17, 1300], [96, 15, 2200], [86, 20, 3100], [106, 19, 3500], [92, 16, 4500]];
    let s = '';
    bursts.forEach(([x, y, t0], k) => {
      const [c, hi] = COL[k % COL.length];
      s += during(t0, t0 + 500, path([[0, x, 31], [1, x, y]], 500, R(0, 0, 1, 1, '#fff6c0') + R(0, 1, 1, 1, '#ffb070', 0.6), t0, '0.2 0.6 0.4 1'));
      const t1 = t0 + 500;
      s += during(t1, t1 + 220, R(x - 1, y - 1, 3, 3, '#ffffff'));
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2; const r = i % 2 ? 6 : 9;
        const tx = Math.round(x + Math.cos(a) * r); const ty = Math.round(y + Math.sin(a) * r * 0.8) + 1;
        s += during(t1, t1 + 1100, path([[0, x, y], [0.5, Math.round(x + Math.cos(a) * r * 0.8), Math.round(y + Math.sin(a) * r * 0.65)], [1, tx, ty + 2]], 1100,
          flick(1100, '1;1;0.6;0', R(0, 0, 1, 1, i % 3 ? c : hi) + R(-Math.sign(Math.round(Math.cos(a))), -Math.sign(Math.round(Math.sin(a))), 1, 1, c, 0.45), t1, '0;0.5;0.75;0.9'), t1, null));
      }
      s += during(t1, t1 + 400, R(54, 15, 84, 16, c, 0.1));
    });
    // the grille bars stay in front of the sky
    let bars = '';
    for (let bx = 57; bx <= 135; bx += 6) bars += R(bx, 15, 1, 16, '#534e41');
    return `<clipPath id="fx-grille"><rect x="54" y="15" width="84" height="16"/></clipPath><g clip-path="url(#fx-grille)">${s}${bars}</g>`;
  }

  function dustStorm() {
    const haze = fadeIO(7000, R(48, 9, 96, 33, '#b8501e', 0.6), 1, 0, 0.3);
    // bands of dust roll across at different speeds and heights (the front edge arrives first)
    const bands = [[12, 4, 70, 0, 2600], [20, 6, 90, 300, 2200], [29, 5, 80, 700, 2400], [36, 4, 100, 1100, 2000], [16, 3, 60, 2600, 2300], [25, 5, 90, 3200, 2100], [33, 4, 70, 3900, 2500]]
      .map(([y, h, w, t0, d], i) => path([[0, 146, y], [1, 44 - w, y + 2]], d, R(0, 0, w, h, i % 2 ? '#e88a40' : '#a8461a', 0.35) + R(4, 1, w - 8, Math.max(1, h - 3), '#ffb070', 0.2), t0, null)).join('');
    let grit = '';
    for (let i = 0; i < 34; i++) {
      const y = 11 + ((i * 7) % 30); const t0 = 600 + ((i * 173) % 5200); const len = 2 + (i % 3) * 2;
      grit += path([[0, 146, y], [1, 44, y + 3]], 520 + (i % 4) * 120, fadeIO(700, R(0, 0, len, 1, i % 3 ? '#ffb070' : '#ffe0b0', 0.8), 1, t0, 0.2), t0, null);
    }
    return clipWin(haze + bands + grit);
  }

  // Window shapes per scene (for clipping things seen outside).
  const WINDOWS = {
    neon: [[48, 9, 96, 33]], mars: [[48, 9, 96, 33]], vip: [[57, 11, 77, 23]], horizon: [[57, 11, 77, 23]],
    orbit: [[57, 11, 78, 22]], liner: [['c', 64, 22, 8], ['c', 128, 22, 8], ['c', 29, 18, 3], ['c', 161, 18, 3]],
  };

  // ---------------------------------------------------------------- the events
  function reels() {   // the left slot machine: three reels spin, stop on 7s one by one
    const syms = Object.values(SLOT_SYMS);
    return [4, 10, 16].map((x, i) => {
      const stop = 1000 + i * 400;
      const spin = syms.map(([rows, pal], k) => R(x - 1, 23, 5, 10, '#fbf6e6') + bmp(rows, pal, x, 25 + (k % 2 ? 1 : -1)) + R(x - 1, 23, 5, 2, '#c8bfa4') + R(x - 1, 31, 5, 2, '#c8bfa4'));
      return during(0, stop, cycle(spin, 70)) + during(stop, 5400, R(x - 1, 23, 5, 10, '#fbf6e6') + bmp(SLOT_SYMS.seven[0], SLOT_SYMS.seven[1], x, 25)
        + flick(600, '0;1', R(x - 1, 23, 5, 10, '#fff6b0', 0.5), stop + 900, null, 'indefinite'));
    }).join('');
  }
  function coinShower() {
    let s = '';
    for (let i = 0; i < 16; i++) {
      const t0 = 2000 + i * 140; const tx = 4 + ((i * 7) % 26); const ty = 58 + ((i * 5) % 6);
      s += during(t0, 6000, path([[0, 10 + (i % 3) * 2, 46], [0.35, 8 + ((i * 3) % 14), 40 - (i % 4) * 2], [1, tx, ty]], 700, bmp(GOLD_COIN, COIN_PAL, 0, 0), t0, null));
    }
    return s;
  }
  const smokePuff = (x, y, t0, r) => `<circle cx="0" cy="0" r="${r}" fill="#c8c8d4" opacity="0"><animate attributeName="r" values="${r};${r * 3.5}" dur="3200ms" begin="${ms(t0)}" fill="freeze"/><animate attributeName="opacity" values="0;0.6;0.35;0" keyTimes="0;0.15;0.6;1" dur="3200ms" begin="${ms(t0)}" fill="freeze"/></circle>`;
  function confetti(n, ox, oy, spread, height, delays) {
    const COL = ['#ffd75e', '#ff7ad8', '#7ff0ff', '#5fd068', '#ffffff', '#ff9a3a'];
    let s = '';
    for (let i = 0; i < n; i++) {
      const t0 = delays[i % delays.length] + (i % 5) * 40;
      const dx = ((i * 29) % (spread * 2)) - spread; const top = oy - height + ((i * 7) % 10);
      const piece = cycle([R(0, 0, 2, 1, COL[i % 6]), R(0, 0, 1, 2, COL[(i + 2) % 6]), R(0, 0, 1, 1, COL[i % 6])], 120 + (i % 3) * 40);
      s += during(t0, t0 + 2600, path([[0, ox, oy], [0.3, ox + dx * 0.7, top], [1, ox + dx, top + 34 + (i % 6) * 2]], 2600, piece, t0, null));
    }
    return s;
  }

  const EVENTS = {
    corner: [
      { id: 'flicker', name: 'Power flicker', dur: 2800, sound: 'hum',
        front: () => flick(2800, '0.6;0.1;0.65;0.05;0.7;0.7;0.2;0.5;0', R(0, 0, W, H, '#05030a'), 0, '0;0.08;0.14;0.22;0.3;0.7;0.76;0.82;0.9')
          // sparks drop from the two sconces nearest the sign
          + [[44, 20], [151, 20]].map(([x, y], k) => [0, 1, 2].map((i) => path([[0, x, y], [1, x + (i - 1) * 3, y + 14 + i * 2]], 600, R(0, 0, 1, 1, '#ffd75e') + R(0, -1, 1, 1, '#ff9a3a', 0.6), 250 + i * 160 + k * 500, '0.4 0 1 1')).join('')).join('') },
      // jumps up onto the back-wall ledge from behind the bar, strolls to the picture, sits a while, turns and hops down
      { id: 'cat', name: 'The bar cat', dur: 10400, sound: 'meow', soundAt: 3900,
        back: () => `<clipPath id="fx-ledge"><rect x="0" y="0" width="${W}" height="30"/></clipPath><g clip-path="url(#fx-ledge)">`
          + during(0, 700, path([[0, 138, 31], [0.55, 135, 19], [1, 132, 24]], 700, bmp(CAT.leap, CAT_PAL, 0, 0), 0, null))
          + during(700, 3700, path([[0, 132, 24], [1, 110, 24]], 3000, cycle(CAT.walk.map((f) => bmp(f, CAT_PAL, 0, 0)), 130), 700))
          + during(3700, 7300, cycle([bmp(CAT.sit, CAT_PAL, 110, 23), bmp(CAT.sit, CAT_PAL, 110, 23), bmp(CAT.sitTail, CAT_PAL, 110, 23)], 450)
            + flick(2400, '1;0;1;1;0;1', R(111, 25, 1, 1, '#ffd75e'), 4000, null, 1))
          + during(7300, 9700, path([[0, 109, 24], [1, 130, 24]], 2400, cycle(CAT.walk.map((f) => bmp(flip(f), CAT_PAL, 0, 0)), 130), 7300))
          + during(9700, 10400, path([[0, 130, 24], [0.4, 134, 21], [1, 139, 33]], 700, bmp(flip(CAT.leap), CAT_PAL, 0, 0), 9700, null))
          + '</g>' },
      // secret: a mouse pops up on the ledge with a gold chip, stops to look at you, and bolts
      { id: 'thief', secret: true, name: 'The chip thief', dur: 6000, sound: 'squeak', soundAt: 1700,
        back: () => `<clipPath id="fx-ledge2"><rect x="0" y="0" width="${W}" height="30"/></clipPath><g clip-path="url(#fx-ledge2)">`
          + path([[0, 50, 31], [0.06, 52, 26], [0.25, 74, 26], [0.6, 74, 26], [0.95, 136, 26], [1, 140, 33]], 6000,
            during(0, 1500, cycle(MOUSE.map((f) => bmp(f, MOUSE_PAL, 0, 0)), 90)) + during(1500, 3600, bmp(MOUSE[0], MOUSE_PAL, 0, 0) + cycle([R(10, 2, 1, 1, '#ffa0b8'), ''], 140))
            + during(3600, 6000, cycle(MOUSE.map((f) => bmp(f, MOUSE_PAL, 0, 0)), 70))
            + bmp(CHIP_GOLD, CHIP_PAL, 9, -2) + flick(900, '0;1;0', R(10, -2, 1, 1, '#ffffff'), 1800, null, 'indefinite'), 0, null)
          + '</g>' },
      { id: 'jackpot', name: 'Jackpot on the slots', dur: 6000, sound: 'jackpot',
        back: () => reels()
          + during(1800, 6000, flick(300, '0;1', R(3, 12, 20, 3, '#fff6b0', 0.7), 0, null, 'indefinite') + flick(300, '1;0', R(3, 15, 20, 2, '#ffffff', 0.5), 0, null, 'indefinite'))
          + coinShower() },
    ],
    deco: [
      { id: 'chandelier', name: 'The chandeliers sway', dur: 4400, body: 'fx-chandelier', sound: 'clink',
        front: () => [64, 128].map((x) => [[-6, 10], [0, 13], [6, 10], [-3, 12], [3, 12]].map(([dx, y], i) => flick(700, '0;1;0', `<g transform="translate(${x + dx} ${y + 6})">${R(0, -1, 1, 3, '#ffffff')}${R(-1, 0, 3, 1, '#ffffff')}</g>`, 200 + i * 520 + (x > 100 ? 260 : 0), null, 1)).join('')).join('') },
      { id: 'fireworks', name: 'Fireworks over the city', dur: 6000, sound: 'fireworks', back: fireworks },
      // secret: a cat burglar drops from the ceiling on a rope, takes the top crystal of a chandelier, winks, zips up
      { id: 'burglar', secret: true, name: 'The jewel thief', dur: 7200, sound: 'heist',
        back: () => path([[0, 107, -24], [0.3, 107, 4], [0.62, 107, 4], [0.78, 107, 4], [1, 107, -26]], 7200,
            R(5, -60, 1, 60, '#d8c49a') + R(4, -1, 3, 1, '#8a7038')
            + during(0, 2400, bmp(THIEF, THIEF_PAL, 0, 0)) + during(2400, 4600, bmp(THIEF_GRAB, THIEF_PAL, 0, 0))
            + during(4600, 5200, bmp(THIEF_WINK, THIEF_PAL, 0, 0)) + during(5200, 7200, bmp(THIEF_GRAB, THIEF_PAL, 0, 0))
            + during(2600, 7200, R(10, 4, 1, 2, '#bfe4ff') + R(10, 4, 1, 1, '#ffffff') + flick(500, '0;1', R(9, 3, 3, 3, '#ffffff', 0.4), 0, null, 'indefinite')), 0, '0.4 0 0.6 1')
          + during(0, 2600, flick(400, '0;1', `<g transform="translate(121 14)">${R(0, -1, 1, 3, '#ffffff')}${R(-1, 0, 3, 1, '#ffffff')}</g>`, 0, null, 'indefinite')) },
    ],
    neon: [
      { id: 'glitch', name: 'Sign glitch', ...signGlitch([[129, 17], [17, 23], [W - 14, 21], [37, 30]]) },
      { id: 'siren', name: 'Police lights', dur: 4200, sound: 'siren',
        back: () => clipWin(path([[0, 150, 35], [1, 30, 35]], 4200, bmp(flip(POLICE), POLICE_PAL, 0, 0)
            + cycle([R(4, 0, 2, 1, '#ff2a3a') + `<circle cx="5" cy="0" r="5" fill="#ff2a3a" opacity="0.25"/>`, R(6, 0, 2, 1, '#2a6aff') + `<circle cx="7" cy="0" r="5" fill="#2a6aff" opacity="0.25"/>`], 200))) },
      { id: 'lightning', name: 'Lightning', dur: 3600, sound: 'thunder',
        back: () => clipWin(flick(3600, '1;0;1;1;0;0', `<polyline points="84,9 80,16 86,19 79,27 85,30 81,42" fill="none" stroke="#ffffff" stroke-width="1.5"/><polyline points="86,19 92,23 90,28" fill="none" stroke="#e8f0ff" stroke-width="1"/><polyline points="84,9 80,16 86,19 79,27 85,30 81,42" fill="none" stroke="#9ad0ff" stroke-width="4" opacity="0.35"/>`, 0, '0;0.04;0.08;0.16;0.2;1')
            + during(500, 3600, [...Array(26)].map((_, i) => flick(260, '1;0', R(50 + ((i * 37) % 92), 10 + ((i * 11) % 30), 1, 3, '#9ad0ff', 0.5), (i % 6) * 45, null, 'indefinite')).join(''))),
        front: () => flick(3600, '0.85;0;0.6;0.25;0', R(0, 0, W, H, '#e8f0ff'), 0, '0;0.04;0.08;0.14;0.2') },
      { id: 'ufo', secret: true, name: 'Abduction', dur: 7600, sound: 'tractor',
        back: () => clipWin(path([[0, 150, 2], [0.25, 112, 12], [0.7, 112, 12], [1, 40, -4]], 7600, bmp(UFO2, UFO2_PAL, 0, 0)
            + cycle([R(1, 4, 1, 1, '#ffffff'), R(5, 4, 1, 1, '#ffffff'), R(9, 4, 1, 1, '#ffffff')], 160), 0, null)
          + during(2000, 5300, flick(160, '1;0.6', `<polygon points="115,19 122,19 128,42 109,42" fill="#9af0b0" opacity="0.3"/>`, 0, null, 'indefinite'))
          + during(2200, 5300, path([[0, 115, 39], [1, 115, 19]], 3000, bmp(CAR, CAR_PAL, 0, 0), 2200, '0.4 0 0.6 1'))) },
    ],
    vip: [
      { id: 'smoke', name: 'Cigar smoke', dur: 7000, sound: 'puff',
        back: () => fadeIO(7000, bmp(PATRON, PATRON_PAL, 148, 33) + flick(1400, '0;1;1;0', R(155, 37, 1, 1, '#ff6a1a') + `<circle cx="155.5" cy="37.5" r="1.6" fill="#ff9a3a" opacity="0.4"/>`, 0, null, 'indefinite'), 1, 0, 0.12)
          + [0, 1, 2, 3, 4, 5, 6, 7].map((i) => path([[0, 156, 36], [0.5, 152 - (i % 3) * 2, 25], [1, 144 + (i % 2) * 6, 8]], 3200, smokePuff(0, 0, 500 + i * 650, 1.8), 500 + i * 650)).join('') },
      { id: 'cheer', name: 'A big winner', dur: 4400, sound: 'cheer', on: 'bigwin',
        back: () => confetti(46, 28, 40, 24, 30, [0, 900]) + confetti(30, 166, 40, 20, 28, [300])
          + flick(4400, '0;1;0;0.8;0', glow(24, 28, 30, 24, '#ffd75e', 0.3) + glow(168, 28, 30, 24, '#ffd75e', 0.3), 0, '0;0.03;0.1;0.22;0.3') },
      { id: 'double', secret: true, name: 'Mr. Valdez, twice', dur: 8400, sound: 'eerie',
        back: () => clipWin(fadeIO(8400, path([[0, 134, 12], [1, 50, 12]], 8400, `<g transform="scale(0.8)">${dealerArt('vip')}</g>`), 1, 0, 0.08)) },
    ],
    orbit: [
      { id: 'meteors', name: 'Meteor shower', dur: 4600, sound: 'streak', back: () => meteors(70, 10, 136, 18, 12) },
      { id: 'bump', name: 'Asteroid bump', ...shake },
      { id: 'astronaut', secret: true, name: 'Someone waves', dur: 9600, sound: 'radio',
        // drifts past, stops at the window to wave (visor glint, backpack jets puffing)
        back: () => clipWin(path([[0, 136, 9], [0.35, 110, 10], [0.65, 108, 10], [0.78, 104, 5], [1, 58, -4]], 9600,
            during(0, 3300, bmp(ASTRO2, ASTRO2_PAL, 0, 0)) + during(3300, 6300, cycle([bmp(ASTRO2, ASTRO2_PAL, 0, 0), bmp(ASTRO2_WAVE, ASTRO2_PAL, 0, 0)], 300))
            + during(6300, 9600, bmp(ASTRO2, ASTRO2_PAL, 0, 0))
            + flick(2200, '0;1;0', R(5, 3, 1, 1, '#ffffff'), 600, null, 'indefinite')
            + cycle([R(-1, 4, 1, 1, '#bfe4ff', 0.8) + R(-2, 5, 1, 1, '#bfe4ff', 0.4), R(-1, 5, 1, 1, '#bfe4ff', 0.6), ''], 160))) },
    ],
    liner: [
      { id: 'flare', name: 'Solar flare', ...flare,
        back: () => clipWin(fadeIO(3400, R(0, 0, W, 44, '#ffe9a0', 0.75), 1, 0, 0.3)) },
      { id: 'bump', name: 'Asteroid bump', ...shake },
      // secret: a ghost galleon sails past the portholes, its green light washing over the room
      { id: 'galleon', secret: true, name: 'The ghost galleon', dur: 11000, sound: 'ghostship',
        back: () => clipWin(path([[0, 196, 4], [0.25, 140, 6], [0.5, 90, 4], [0.75, 40, 6], [1, -60, 4]], 11000,
            flick(1600, '0.85;0.55;0.8;0.5;0.85', `<g transform="scale(2)">${bmp(GALLEON, GALLEON_PAL, 0, 0)}</g>`, 0, null, 'indefinite'))) },
    ],
    mars: [
      { id: 'meteors', name: 'Meteor shower', dur: 4600, sound: 'streak', back: () => meteors(60, 9, 144, 16, 12) },
      { id: 'dust', name: 'Dust storm', dur: 7000, sound: 'storm', back: dustStorm },
      { id: 'glitch', name: 'Sign glitch', ...signGlitch([[17, 23], [W - 14, 21]]) },
      { id: 'martian', secret: true, name: 'A local', dur: 7000, sound: 'chirp',
        back: () => clipWin(path([[0, 62, 44], [0.15, 62, 29], [0.85, 62, 29], [1, 62, 44]], 7000,
          cycle([bmp(MARTIAN2, MARTIAN2_PAL, 0, 0), bmp(MARTIAN2, MARTIAN2_PAL, 0, 0), bmp(MARTIAN2, MARTIAN2_PAL, 0, 0), bmp(MARTIAN2_BLINK, MARTIAN2_PAL, 0, 0)], 300)
          + cycle([R(1, 0, 1, 1, '#ffffff') + R(14, 0, 1, 1, '#d8ff7a'), R(1, 0, 1, 1, '#d8ff7a') + R(14, 0, 1, 1, '#ffffff')], 220)
          + during(2200, 4800, cycle([bmp(HAND, MARTIAN2_PAL, 16, 6), bmp(HAND, MARTIAN2_PAL, 17, 4)], 250)))) },
    ],
    horizon: [
      { id: 'warp', name: 'Light bends', dur: 3400, body: 'fx-warp', sound: 'warp',
        front: () => [0, 900].map((t) => `<circle cx="96" cy="20" r="2" fill="none" stroke="#fff6c0" stroke-width="1.2" opacity="0"><animate attributeName="r" values="2;70" dur="2000ms" begin="${t}ms" fill="freeze"/><animate attributeName="opacity" values="0.9;0" dur="2000ms" begin="${t}ms" fill="freeze"/><animate attributeName="stroke-width" values="1.2;4" dur="2000ms" begin="${t}ms" fill="freeze"/></circle>`).join('') },
      { id: 'meteors', name: 'Falling in', dur: 5000, sound: 'fallin',
        back: () => clipWin([[60, 12], [130, 30], [64, 32], [128, 12], [72, 22], [120, 24], [90, 32], [104, 12]].map(([x, y], i) =>
          during(i * 420, i * 420 + 1600, path([[0, x, y], [0.5, (x + 96) / 2 + (y < 20 ? 6 : -6), (y + 20) / 2 + (x < 96 ? 4 : -4)], [1, 96, 20]], 1600, grow(2.2, 0.1, 1600, bmp(ROCK, ROCK_HOT, -2, -2), i * 420), i * 420, null))).join('')) },
      // secret: the black hole opens like an eye, looks around the room, blinks, and closes again
      { id: 'eye', secret: true, name: 'It blinks', dur: 7000, sound: 'heartbeat', front: holeEye },
    ],
  };
  function dealerArt(id) { const D = root.ScenarioDealers; const pt = D && D.parts(id); return pt ? pt.base : ''; }

  // ---------------------------------------------------------------- saved sightings
  function load() {
    try {
      const v = JSON.parse(root.localStorage.getItem(KEY) || 'null');
      return v && typeof v.seen === 'object' && v.seen ? v : { seen: {} };
    } catch (e) { return { seen: {} }; }
  }
  function markSeen(scene, ev) {
    const s = load();
    const list = s.seen[scene] = Array.isArray(s.seen[scene]) ? s.seen[scene] : [];
    if (!list.includes(ev.id)) list.push(ev.id);
    try { root.localStorage.setItem(KEY, JSON.stringify(s)); } catch (e) { /* storage blocked */ }
    const normal = EVENTS[scene].filter((e) => !e.secret).map((e) => e.id);
    doc.dispatchEvent(new CustomEvent('sceneevents:seen', { detail: Object.assign({ scene, id: ev.id, secret: !!ev.secret }, progress(s, scene, normal)) }));
  }
  function progress(s, scene, normal) {
    s = s || load();
    normal = normal || EVENTS[scene].filter((e) => !e.secret).map((e) => e.id);
    const secretsSeen = Object.keys(EVENTS).filter((k) => { const sec = EVENTS[k].find((e) => e.secret); return sec && (s.seen[k] || []).includes(sec.id); });
    return { seen: normal.filter((id) => (s.seen[scene] || []).includes(id)).length, total: normal.length, secretsSeen: secretsSeen.length, totalSecrets: Object.keys(EVENTS).length };
  }

  // ---------------------------------------------------------------- layers
  let back = null; let front = null; let st = null;
  function layers() {
    const art = doc.querySelector('#scene-backdrop .scene-art svg');
    const host = doc.getElementById('scene-backdrop');
    if (!art || !host) return null;
    if (!back || !back.isConnected) { back = doc.createElement('div'); back.className = 'scene-fx scene-fx-back'; host.appendChild(back); }
    if (!front || !front.isConnected) { front = doc.createElement('div'); front.className = 'scene-fx scene-fx-front'; doc.body.appendChild(front); }
    const r = art.getBoundingClientRect();
    for (const el of [back, front]) Object.assign(el.style, { left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px` });
    return { art };
  }
  // Things in the room pass behind the dealer and the table: clip the back layer around them.
  function backClip(art, scene) {
    let hole = '';
    const dl = art.querySelector('.dl-body');
    if (dl && dl.getBBox) {
      try {
        const b = dl.getBBox(); const t = dl.parentNode.transform && dl.parentNode.transform.baseVal.consolidate();
        const ox = t ? t.matrix.e : 0; const oy = t ? t.matrix.f : 0;
        hole = ` M${ox + b.x} ${oy + b.y}v${b.height}h${b.width}v${-b.height}Z`;
      } catch (e) { /* not rendered */ }
    }
    const win = (WINDOWS[scene] || []).map((w) => (w[0] === 'c' ? `<circle cx="${w[1]}" cy="${w[2]}" r="${w[3]}"/>` : `<rect x="${w[0]}" y="${w[1]}" width="${w[2]}" height="${w[3]}"/>`)).join('');
    return `<clipPath id="fx-room" clip-rule="evenodd"><path clip-rule="evenodd" d="M0 0H${W}V44H0Z${hole}"/><rect x="0" y="44" width="46" height="64"/><rect x="146" y="44" width="46" height="64"/></clipPath>
      <clipPath id="fx-win">${win || `<rect width="${W}" height="${H}"/>`}</clipPath>`;
  }
  const DEFS = `<defs>
    <radialGradient id="fx-flare-g" cx="0.15" cy="0" r="1.1"><stop offset="0" stop-color="#fff6d0" stop-opacity="0.9"/><stop offset="0.35" stop-color="#ffb04a" stop-opacity="0.45"/><stop offset="1" stop-color="#ff6a1a" stop-opacity="0"/></radialGradient>
  </defs>`;

  function play(ev, scene) {
    const L = layers();
    if (!L) return false;
    clear();
    // Chrome can leave an SVG whose only animations are transforms frozen on its first frame when it replaces an
    // earlier one; a running (invisible) opacity animation keeps the timeline ticking.
    const tick = `<rect width="0" height="0"><animate attributeName="opacity" values="1;0.99" dur="${ms(ev.dur)}"/></rect>`;
    const svg = (head, inner, clip) => `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" shape-rendering="crispEdges">${head}${tick}<g${clip ? ' clip-path="url(#fx-room)"' : ''}>${inner}</g></svg>`;
    // the back layer owns the clip paths, the front one the gradient and the warp filter
    back.innerHTML = ev.back ? svg(`<defs>${backClip(L.art, scene)}</defs>`, ev.back(), true) : '';
    front.innerHTML = svg(DEFS, ev.front ? ev.front() : '', false);
    // every event starts its own animation clock at zero (a new svg can otherwise inherit a running clock)
    if (ev.body) doc.body.classList.add(ev.body);
    if (ev.sound) {
      duck(ev.dur);
      root.setTimeout(() => { if (st && st.current === ev && SOUNDS[ev.sound]) SOUNDS[ev.sound](); }, ev.soundAt || 0);
    }
    const cur = { ev, timer: root.setTimeout(clear, ev.dur + 200) };
    if (st) st.current = ev;
    playing = cur;
    markSeen(scene, ev);
    const D = root.DealerTalk;
    if (D && D.say && Math.random() < (ev.secret ? 1 : SAY_CHANCE)) root.setTimeout(() => { if (playing === cur) D.say(`fx_${ev.id}`); }, Math.min(1600, ev.dur / 3));
    return true;
  }
  let playing = null;
  function clear() {
    if (playing) root.clearTimeout(playing.timer);
    playing = null;
    unduck();
    if (st) st.current = null;
    ['fx-shake', 'fx-chandelier', 'fx-glitch', 'fx-warp'].forEach((c) => doc.body.classList.remove(c));
    if (back) back.innerHTML = '';
    if (front) front.innerHTML = '';
  }

  // ---------------------------------------------------------------- scheduling
  const reduce = () => (root.Prefs ? root.Prefs.reduceMotion() : root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const between = ([a, b]) => a + Math.random() * (b - a);
  function pick(scene) {
    const list = EVENTS[scene];
    const secret = list.find((e) => e.secret);
    if (secret && Math.random() < SECRET_CHANCE) return secret;
    const seen = load().seen[scene] || [];
    const pool = [];
    list.filter((e) => !e.secret && !e.on).forEach((e) => { pool.push(e); if (!seen.includes(e.id)) pool.push(e); });   // unseen ones twice as likely
    return pool[Math.floor(Math.random() * pool.length)];
  }
  function schedule(ms) {
    root.clearTimeout(st.timer);
    st.timer = root.setTimeout(tick, ms);
  }
  function busyNow() {
    const overlay = doc.getElementById('overlay');
    return doc.hidden || (overlay && !overlay.hidden) || reduce() || playing || doc.body.classList.contains('scene-intro');
  }
  // Events with `on` only play when the table gives them a reason (ui.js reports every finished round).
  // The bigger the round's win, the likelier the room cheers: none under 200 chips, 20% at 400, up to 50% from 850.
  // A blackjack on a bet of 200+ adds 15%.
  const cheerChance = (net, bigNatural) => (net < 200 ? 0 : Math.min(0.5, (net - 100) / 1500)) + (bigNatural ? 0.15 : 0);
  function roundEnd(game) {
    if (!st || game !== st.game) return;
    const seats = game.seats.filter((x) => x.type === 'player' && x.hands && x.hands.length);
    let net = 0; let bigNatural = false;
    seats.forEach((x) => x.hands.forEach((h) => { net += h.net || 0; if (h.natural && h.bet >= 200) bigNatural = true; }));
    const ev = EVENTS[st.scene].find((e) => e.on === 'bigwin');
    if (ev && Math.random() < cheerChance(net, bigNatural)) root.setTimeout(() => { if (st && !busyNow()) play(ev, st.scene); }, 900);
  }
  function tick() {
    if (!st) return;
    if (busyNow()) { schedule(20e3); return; }
    play(pick(st.scene), st.scene);
    schedule(between(EVERY_MS));
  }

  function start(game, sceneId) {
    stop();
    if (!sceneId || !EVENTS[sceneId]) return;
    st = { game, scene: sceneId, timer: null, current: null };
    schedule(between(FIRST_MS));
  }
  function stop() {
    if (st) root.clearTimeout(st.timer);
    st = null;
    clear();
  }
  root.addEventListener('resize', () => { if (playing) layers(); });

  root.SceneEvents = {
    EVENTS, start, stop, roundEnd,
    /** Plays an event now (testing and the preview): SceneEvents.play('cat'), or ('ship', 'orbit'). */
    play: (id, scene) => {
      scene = scene || (st && st.scene) || doc.body.dataset.scene;
      const ev = EVENTS[scene] && EVENTS[scene].find((e) => e.id === id);
      return ev ? play(ev, scene) : false;
    },
    /** { seen, total, secretsSeen, totalSecrets } for a scene. */
    progress: (scene) => progress(null, scene),
    seen: () => load().seen,
  };
})(window);
