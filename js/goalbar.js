/* Goal bar: the Challenge, Endless and Daily progress bar, drawn as pixel art on a canvas. Each casino has its own bar
   (slot reels with a JACKPOT sign at the Corner, a gold stream at the Grand Hotel, neon in the rain, gold lightning in
   the VIP Lounge, a radar sweep, glowing plankton, alien goo, a plasma storm) and the Daily has a heartbeat.
   The bar fills smoothly; a loss leaves a red ghost that drains away, a win flashes the new part, and reaching the
   goal sets off a burst. ui.js calls GoalBar.set(progressEl, pct, barId) whenever the bar changes. */
(function (root) {
  'use strict';

  const doc = root.document;
  const W = 576, H = 20, BY = 11, BH = 9, IX = 1, IW = W - 2, IY = BY + 1, IH = BH - 2;   // canvas px (2 screen px each)
  const STEP = 1000 / 18;
  const reduce = () => (root.Prefs ? root.Prefs.reduceMotion() : !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const R = new Float32Array(4096); for (let i = 0; i < R.length; i++) R[i] = Math.random();
  const rnd = (x, y) => R[((x & 63) + ((y & 63) << 6)) & 4095];
  function noise(x, y) { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = rnd(xi, yi), b = rnd(xi + 1, yi), c = rnd(xi, yi + 1), d = rnd(xi + 1, yi + 1); return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy; }
  const pick = (pal, v) => pal[Math.max(0, Math.min(pal.length - 1, Math.floor(v * pal.length)))];
  const ASH = ['#2a2624', '#3e3834', '#56504a', '#787068', '#9a9088', '#c0b8b0'];
  // tiny 3x5 letters for the JACKPOT sign
  const TINY = { A: ['.#.', '#.#', '###', '#.#', '#.#'], C: ['.##', '#..', '#..', '#..', '.##'], K: ['#.#', '#.#', '##.', '#.#', '#.#'],
    J: ['..#', '..#', '..#', '#.#', '.#.'], P: ['##.', '#.#', '##.', '#..', '#..'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], ' ': ['...', '...', '...', '...', '...'] };

  // cell(x, y, k) gives the colour of a fill pixel; over() draws on top and adds particles.
  // k: { t (seconds), p (0..1 filled), fw (fill width), frame, goal (blinks at the goal) }
  const VERSIONS = [
    { id: 'rain', full: true,
      cell(x, y, k) { const rain = (x * 7 + Math.floor(k.t * 18) * 3 - y * 2) % 23 === 0; const c = k.p > 0.8 ? ['#2a6aff', '#7ab0ff', '#e0f0ff'] : ['#ff2a8a', '#ff7ab8', '#ffd0e8'];
        if (rain) return '#e8f6ff'; const core = Math.abs(y - 3); return core === 0 ? c[2] : core === 1 ? c[1] : core === 2 ? c[0] : '#3a0c2a'; } },
    { id: 'radar', full: true,
      cell(x, y, k) { const sw = (k.frame * 10) % (k.fw + 60); const d = sw - x; if (d >= 0 && d < 2) return '#c8ffd0';
        if (d >= 0 && d < 40) { if (rnd(x, y * 5) > 0.97 - k.p * 0.04 * (x / k.fw)) return '#8aff9a'; return d < 12 ? '#1a6a2a' : '#0e3a18'; }
        if (x % 16 === 0 || y === 3) return '#0e3a18'; return '#06200c'; } },
    { id: 'slime', full: true,
      cell(x, y, k) { const surf = Math.round(1 + Math.sin(x * 0.2 + k.t * 4) * 0.8 + Math.sin(x * 0.05 - k.t) * 0.5); if (y < surf) return '#0b140a';
        if (y === surf) return '#d8ffb0'; if (rnd(x, Math.floor(y + k.t * 4) & 63) > 0.95) return '#eaffd0'; return pick(['#1a5a1a', '#2f8a40', '#5fd068', '#9af0a0'], noise(x * 0.12, y * 0.4 + k.t) * 0.8 + k.p * 0.25); },
      over(B, rect, k) { const s = 2 + Math.round(Math.sin(k.t * 5) * 1.5); rect(IX + k.fw, IY + 2, s, 3, '#5fd068'); rect(IX + k.fw, IY + 2, s, 1, '#d8ffb0'); } },
    { id: 'ecg', full: true,
      cell(x, y, k) { const bpm = 1 + k.p * 3, per = Math.max(14, Math.round(60 / bpm)), ph = ((x - Math.floor(k.t * 30)) % per + per) % per;
        const wy = ph === 3 ? 0 : ph === 4 ? 6 : ph === 5 ? 1 : ph === 2 || ph === 6 ? 2 : 3; if (y === wy || (ph >= 3 && ph <= 5 && ((y > Math.min(wy, 3) && y < Math.max(wy, 3))))) return k.p > 0.8 ? '#ff4a5a' : '#6aff9a'; return x % 10 === 0 ? '#0a2014' : '#040c08'; } },
    { id: 'biolum', full: true,
      cell(x, y, k) { const wave = Math.sin(x * 0.04 - k.t * (2 + k.p * 3)) * 0.5 + 0.5; const sp = rnd(x, y * 5 + 1); if (sp > 0.85 - wave * 0.4 * (0.5 + k.p)) return wave > 0.7 ? '#bff8ff' : '#3ae8d8';
        return wave > 0.6 ? '#0a3a4a' : '#020a14'; } },
    { id: 'plasma', full: true,
      cell(x, y, k) { const n = noise(x * 0.15 + k.t * 6, y * 0.6); return n > 0.7 ? '#8a5aff' : n > 0.45 ? '#4a2aa8' : '#140830'; },
      over(B, rect, k) { const arcs = 2 + Math.floor(k.p * 3); for (let a = 0; a < arcs; a++) { let y = IY + 3; for (let x = IX; x < IX + k.fw; x++) { if (Math.random() < 0.5) y += Math.random() < 0.5 ? -1 : 1; y = Math.max(IY, Math.min(IY + IH - 1, y)); rect(x, y, 1, a ? 1 : 2, a ? '#bfa0ff' : '#ffffff'); if (Math.random() < 0.004 * (1 + k.p * 4)) { let yy = BY, xx = x; for (let i = 0; i < 6; i++) { rect(xx, yy, 1, 1, '#e8e0ff'); yy--; xx += Math.random() < 0.5 ? -1 : 1; } } } } } },
    { id: 'goldflow', full: true,
      cell(x, y, k) { const sp = 10 + k.p * 40, head = (Math.floor(k.t * sp) + Math.floor(rnd(y, 3) * 300)) % 90, d = ((head - (x % 90)) + 90) % 90;
        if (d === 0) return '#ffffff'; if (d < 12 && rnd(x, y) > 0.3) return d < 4 ? '#ffe9a0' : '#c9a24a'; return rnd(x, y * 3) > 0.9 ? '#1c2a4a' : '#0a1024'; } },
    { id: 'boltvip', full: true,
      cell(x, y, k) { const n = noise(x * 0.3 + k.t * 8, y * 0.8); return n > 0.75 ? '#3a2a20' : n > 0.5 ? '#1e1610' : '#0a0806'; },
      over(B, rect, k) {
        const arcs = 1 + Math.floor(k.p * 3);
        for (let a = 0; a < arcs; a++) { let y = IY + 3; for (let x = IX; x < IX + k.fw; x++) { if (Math.random() < 0.35) y += Math.random() < 0.5 ? -1 : 1; y = Math.max(IY, Math.min(IY + IH - 1, y)); rect(x, y, 1, 1, a ? '#c9a24a' : '#fff6d8'); } }
        if (k.p >= 0.8) for (let j = 0; j < 2; j++) if (Math.random() < 0.4) { let x = IX + k.fw - Math.floor(Math.random() * 80), y = BY; for (let i = 0; i < 4 + Math.random() * 5; i++) { rect(x, y, 1, 1, '#ffe9a0'); y--; x += Math.random() < 0.5 ? -1 : 1; } }
        const r = 1 + ((k.frame >> 1) % 2); rect(IX + k.fw - 1 - r, IY + 3 - r, r * 2 + 1, r * 2 + 1, '#ffd75e', 0.6); rect(IX + k.fw - 1, IY + 2, 1, 3, '#ffffff'); },
      noFrameGlow: true },
    { id: 'jacktext', full: true,
      cell(x, y, k) {
        if (k.p >= 1) { if (x % 2) return '#1a0606'; const msg = 'JACKPOT  '; const xx = Math.floor((x + Math.floor(k.t * 20)) / 2), ci = Math.floor(xx / 4) % msg.length, col = xx % 4;
          const g = TINY[msg[ci]] || TINY[' ']; const on = col < 3 && y >= 1 && y <= 5 && g[y - 1][col] === '#'; return on ? (k.frame % 4 < 2 ? '#ffd75e' : '#ffffff') : '#3a0c0c'; }
        const n = Math.ceil(IW / 7), i = Math.floor(x / 7), cx = x % 7 - 1; if (cx < 0 || cx > 4) return '#5a3a1a';
        const locked = k.p >= 0.9 && i / n < (k.p - 0.9) * 10;
        const sp = 6 + k.p * 24, off = locked ? 0 : Math.floor(k.t * sp + rnd(i, 5) * 20), sym = locked ? 0 : (Math.floor((y + off) / 7) + i) % 4, ry = ((y + off) % 7 + 7) % 7 - 1;
        const S = [['###', '..#', '.#.', '.#.', '.#.'], ['..#', '.#.', '#.#', '#.#', '...'], ['...', '###', '#.#', '###', '...'], ['.#.', '###', '###', '###', '.#.']][sym];
        const C = locked ? '#ff2a2a' : ['#d8323a', '#e0303a', '#20202a', '#ffb02a'][sym];
        if (ry >= 0 && ry < 5 && cx >= 1 && cx <= 3 && S[ry][cx - 1] === '#') return C; return locked ? '#fff0c0' : '#fbf6e6'; },
      over(B, rect, k) {
        if (k.p < 1) { B.jack = 0; return; }
        B.jack = (B.jack || 0) + 1;
        const ph = Math.floor(B.jack / 2); for (let x = 0; x < W; x += 6) { const on = ((x / 6) + ph) % 3 === 0; rect(x, BY, 3, 1, on ? '#fff6c0' : '#c89a3a'); rect(x, BY + BH - 1, 3, 1, on ? '#fff6c0' : '#c89a3a'); }
        if (B.jack < 90 && B.jack % 2) for (let i = 0; i < 2; i++) B.parts.push({ kind: 'coin', spin: Math.floor(Math.random() * 4), x: IX + Math.random() * k.fw, y: BY - 2, vx: (Math.random() - 0.5) * 2, vy: -1.4 - Math.random() * 1.2, age: 0, life: 16 + Math.random() * 6 });
        if (B.jack < 6) rect(0, BY, W, BH, '#ffffff', 1 - B.jack / 6);
      },
      noFrameGlow: true },
  ];
  const BYID = Object.fromEntries(VERSIONS.map((v) => [v.id, v]));
  // which bar each casino uses, and the dark edge of its frame
  const BARS = {
    corner: ['jacktext', '#3a1d0c'], deco: ['goldflow', '#2e0c0c'], neon: ['rain', '#08080c'], vip: ['boltvip', '#050407'],
    orbit: ['radar', '#262c3a'], liner: ['biolum', '#2e0c0c'], mars: ['slime', '#08080c'], horizon: ['plasma', '#050407'],
    daily: ['ecg', '#1a0c06'],
  };

  const bars = new Map();   // progress element -> bar state
  function mount(el) {
    let B = bars.get(el);
    if (B) return B;
    const c = doc.createElement('canvas'); c.width = W; c.height = H; c.className = 'goalbar';
    el.classList.add('has-goalbar'); el.appendChild(c);
    B = { el, c, g: c.getContext('2d'), id: null, target: 0, shown: 0, ghost: 0, ghostHold: 0, gain: 0, burst: 0, parts: [], jack: 0 };
    bars.set(el, B);
    return B;
  }

  /** Sets the bar under a progress element to pct (0..1), drawn in the style of barId (a scene id or 'daily'). */
  function set(el, pct, barId) {
    const B = mount(el);
    pct = Math.max(0, Math.min(1, pct || 0));
    const id = BARS[barId] ? barId : 'corner';
    if (B.id !== id) { B.id = id; B.shown = pct; B.target = pct; B.ghost = 0; B.gain = 0; B.burst = 0; B.parts = []; B.jack = 0; start(); return; }
    if (pct < B.target) { B.ghost = Math.max(B.ghost, B.shown); B.ghostHold = 8; B.gain = 0; }
    if (pct > B.target) B.gain = pct;
    if (pct >= 1 && B.target < 1) B.burst = 1;
    B.target = pct;
    start();
  }

  let frame = 0;
  function draw(B) {
    const { g } = B, v = BYID[BARS[B.id][0]], still = reduce();
    const rect = (x, y, w, h, c, a = 1) => { g.globalAlpha = a; g.fillStyle = c; g.fillRect(x, y, w, h); };
    const d = B.target - B.shown; B.shown += Math.abs(d) < 1 / IW || still ? d : d * 0.18;
    if (B.ghost > B.shown) { if (B.ghostHold > 0) B.ghostHold--; else B.ghost = Math.max(B.shown, B.ghost - 0.008); }
    if (B.gain && B.shown >= B.gain - 1 / IW) B.gain = 0;
    const fw = Math.round(B.shown * IW), p = B.shown, t = still ? 0 : frame / 18;

    g.clearRect(0, 0, W, H); g.save();
    if (!still && ((p >= 0.95 && p < 1 && frame % 3 === 0) || (B.jack && B.jack < 40))) g.translate(frame % 2 ? 1 : -1, B.jack && B.jack < 40 ? (frame % 3) - 1 : 0);
    rect(0, BY, W, BH, BARS[B.id][1]); rect(IX, IY, IW, IH, '#0b0f0a');
    if (B.ghost > B.shown) rect(IX + fw, IY, Math.round(B.ghost * IW) - fw, IH, frame % 6 < 3 ? '#ff4a5a' : '#c8283a');
    if (B.gain > B.shown) rect(IX + fw, IY, Math.round(B.gain * IW) - fw, IH, '#fff6c0', 0.3 + (frame % 4 < 2 ? 0.2 : 0));

    const k = { t, fw, p, frame: still ? 0 : frame, goal: p >= 1 && frame % 4 < 2 };
    for (let x = 0; x < fw; x++) for (let y = 0; y < IH; y++) rect(IX + x, IY + y, 1, 1, v.cell(x, y, k));
    if (fw > 0 && v.over && !still) v.over(B, rect, k);

    B.parts = B.parts.filter((e) => {
      e.age++; if (e.age > e.life) return false;
      e.x += e.vx; e.y += e.vy;
      if (e.kind === 'bubble2') { e.y += e.vy; if (e.y < 0) return false; rect(Math.round(e.x), Math.round(e.y), 1, 1, '#ffffff', 0.8); return true; }
      if (e.kind === 'coin') {   // a little coin: round gold face with a rim and shine, spinning (face, narrow, edge, narrow)
        e.vy += 0.12; if (e.y > BY + 1) return false;
        const f = ((e.age >> 1) + (e.spin || 0)) % 4, x = Math.round(e.x), y = Math.round(e.y);
        if (f === 0) { rect(x - 1, y - 2, 3, 1, '#c08a10'); rect(x - 2, y - 1, 5, 3, '#c08a10'); rect(x - 1, y + 2, 3, 1, '#c08a10');
          rect(x - 1, y - 1, 3, 3, '#ffd75e'); rect(x - 1, y - 1, 1, 1, '#fff6c0'); rect(x, y, 1, 1, '#ffb02a'); }
        else if (f === 2) { rect(x, y - 2, 1, 5, '#c08a10'); rect(x, y - 1, 1, 1, '#fff6c0'); }
        else { rect(x - 1, y - 2, 2, 5, '#c08a10'); rect(x - 1, y - 1, 1, 3, '#ffd75e'); rect(x, y - 1, 1, 1, '#fff6c0'); }
        return true; }
      if (e.kind === 'ash') { e.vx += (Math.random() - 0.5) * 0.15; if ((e.age >> 1) % 4) rect(Math.round(e.x), Math.round(e.y), e.age % 6 < 3 ? 2 : 1, 1, e.c, 1 - e.age / e.life * 0.6); return e.y > 0; }
      e.vy += 0.04; if (e.y > BY) return false; rect(Math.round(e.x), Math.round(e.y), 1, 1, e.age < e.life / 2 ? '#fff6c0' : '#ff7a2a'); return true;   // spark
    });
    if (B.burst) {   // the goal: a white flash, a shockwave back along the bar, sparks and ash thrown up
      if (B.burst < 5) rect(0, BY, W, BH, '#ffffff', 1 - B.burst / 5);
      if (B.burst < 16) { const r = B.burst * 40; [W - r, W - r - 12].forEach((x, i) => rect(Math.max(0, x), BY, 6, BH, '#ffffff', i ? 0.4 : 0.9)); }
      if (B.burst === 2 && !still) for (let i = 0; i < 90; i++) B.parts.push(i % 2 ? { kind: 'spark', x: Math.random() * W, y: BY, vy: -0.8 - Math.random() * 1.2, vx: (Math.random() - 0.5) * 2, age: 0, life: 10 + Math.random() * 12 } : { kind: 'ash', x: Math.random() * W, y: BY, vx: (Math.random() - 0.5) * 1.5, vy: -0.4 - Math.random() * 0.6, age: 0, life: 24, c: pick(ASH, 0.4 + Math.random() * 0.6) });
      B.burst++; if (B.burst > 30) B.burst = 0;
    }
    g.restore(); g.globalAlpha = 1;
  }

  // One stepped loop for every bar on screen; it stops while no bar is visible.
  let running = false, acc = 0, last = 0;
  function loop(now) {
    const live = [...bars.values()].filter((B) => B.id && B.el.isConnected && !B.el.hidden && B.el.offsetParent !== null && !doc.hidden);
    if (!live.length) { running = false; return; }
    acc += now - last; last = now; if (acc > 200) acc = 200;
    while (acc >= STEP) { acc -= STEP; frame++; live.forEach(draw); }
    root.requestAnimationFrame(loop);
  }
  function start() {
    if (running) return;
    running = true; last = root.performance.now(); acc = STEP;
    root.requestAnimationFrame(loop);
  }
  doc.addEventListener('visibilitychange', () => { if (!doc.hidden) start(); });

  root.GoalBar = { set, BARS: Object.keys(BARS) };
})(window);
