/* Card FX: animated card backs, themed suits and animated aces for the top-rarity sets.
 * Everything is drawn here at load time on the game's pixel grid (28 x 40 backs, 9 x 9 suits, 18 x 22 aces)
 * and handed to cosmetics.js (backs) or to CSS (aces). Load after js/sprites.js and before js/cosmetics.js. */
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- helpers
  const BW = 28, BH = 40, IN = 3, IW = 22, IH = 34; // same grid as the game's card backs
  const TAU = Math.PI * 2;
  function rand(seed) { let s = seed >>> 0; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; }
  function mix(a, b, t) {
    const p = (c) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    const A = p(a), B = p(b); t = Math.max(0, Math.min(1, t));
    return '#' + A.map((v, i) => Math.round(v + (B[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  function inPoly(pts, x, y) {
    let c = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  /** Grid painter over a canvas context, one cell = one game pixel. */
  function painter(ctx, w, h, ox = 0, oy = 0) {
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (c && x >= 0 && y >= 0 && x < w && y < h) { ctx.fillStyle = c; ctx.fillRect(ox + x, oy + y, 1, 1); } };
    const each = (fn) => { for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const c = fn(x, y); if (c) set(x, y, c); } };
    const disc = (cx, cy, r, col) => each((x, y) => { const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy); return d <= r ? (typeof col === 'function' ? col(x, y, d) : col) : null; });
    const poly = (pts, col) => each((x, y) => (inPoly(pts, x + 0.5, y + 0.5) ? (typeof col === 'function' ? col(x, y) : col) : null));
    const bits = (rows, x0, y0, map, s = 1) => rows.forEach((r, y) => [...r].forEach((ch, x) => {
      const c = typeof map === 'function' ? map(ch, x, y) : map[ch];
      if (c) for (let a = 0; a < s; a++) for (let b = 0; b < s; b++) set(x0 + x * s + a, y0 + y * s + b, c);
    }));
    return { set, each, disc, poly, bits, w, h };
  }
  /** Card back = dark edge + 2px border + inner 22x34 scene, like backFrame() in cosmetics.js. */
  function drawBackFrame(ctx, border, f, F, scene) {
    ctx.fillStyle = '#2a2a33'; ctx.fillRect(0, 0, BW, BH);
    ctx.fillStyle = border; ctx.fillRect(1, 1, BW - 2, BH - 2);
    const g = painter(ctx, IW, IH, IN, IN);
    scene(g, f, F);
  }
  // ---------------------------------------------------------------- suits (9 x 9 base)
  const BASE = {
    '♥': ['.XX...XX.', 'XXXX.XXXX', 'XXXXXXXXX', 'XXXXXXXXX', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'],
    '♦': ['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', '.XXXXXXX.', '..XXXXX..', '...XXX...', '....X....'],
    '♠': ['....X....', '...XXX...', '..XXXXX..', '.XXXXXXX.', 'XXXXXXXXX', 'XXXXXXXXX', '.XX.X.XX.', '....X....', '..XXXXX..'],
    '♣': ['...XXX...', '..XXXXX..', '...XXX...', '.XX.X.XX.', 'XXXXXXXXX', 'XXXXXXXXX', '.XX.X.XX.', '....X....', '..XXXXX..'],
  };
  const grid = (rows) => rows.map((r) => [...r]);
  const pad = (g, n) => { const w = g[0].length + 2 * n; const e = () => Array(w).fill('.'); return [...Array(n)].map(e).concat(g.map((r) => [...Array(n).fill('.'), ...r, ...Array(n).fill('.')]), [...Array(n)].map(e)); };
  const at = (g, x, y) => (g[y] && g[y][x]) || '.';
  function svgOf(g, map, cls = '') {
    let r = '';
    g.forEach((row, y) => row.forEach((ch, x) => { const c = map[ch]; if (c) r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`; }));
    return `<svg class="${cls}" viewBox="0 0 ${g[0].length} ${g.length}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`;
  }
  // Theme transforms. Letters: X = suit colour, c = card colour (a cut), o = accent, h = highlight.
  const SUIT_FX = {
    heartbreak(s) { // a crack zig-zags down the middle of every suit
      const g = grid(BASE[s]); [[4, 1], [4, 2], [3, 3], [4, 4], [5, 5], [4, 6]].forEach(([x, y]) => { if (g[y][x] === 'X' && !(s !== '♥' && s !== '♦' && y > 5)) g[y][x] = 'c'; });
      if (s === '♥') g[1][4] = '.';
      return g;
    },
    horizon(s) { // a tilted orbit ring passes behind on the left, in front on the right
      const g = pad(grid(BASE[s]), 1); const base = g.map((r) => r.slice());
      for (let x = 0; x < 11; x++) {
        const y = Math.round(6.4 - 0.42 * (x - 5));
        if (base[y][x] !== 'X') g[y][x] = 'o';
        else if (x >= 5) { g[y][x] = 'o'; if (base[y - 1] && base[y - 1][x] === 'X') g[y - 1][x] = 'c'; }
      }
      return g;
    },
    eclipse(s) { // a corona rim of light around the solid suit
      const g = pad(grid(BASE[s]), 1); const base = g.map((r) => r.slice());
      for (let y = 0; y < g.length; y++) for (let x = 0; x < g[0].length; x++) {
        if (base[y][x] === 'X') continue;
        const n = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(base, x + dx, y + dy) === 'X');
        if (n && (x + y) % 2 === 0) g[y][x] = 'o';
      }
      return g;
    },
    bloodmoon(s) { // three claw marks rake the lower right of the suit
      const g = grid(BASE[s]);
      [[[5, 3], [6, 4], [7, 5]], [[4, 4], [5, 5], [6, 6]], [[3, 5], [4, 6]]].forEach((cl) => cl.forEach(([x, y]) => { if (g[y][x] === 'X') g[y][x] = 'c'; }));
      return g;
    },
    hitman(s) { // crosshair ticks frame the suit
      const g = pad(grid(BASE[s]), 1);
      [[5, 0], [0, 5], [10, 5], [5, 10]].forEach(([x, y]) => { g[y][x] = 'o'; });
      return g;
    },
  };
  // ---------------------------------------------------------------- set definitions
  const SETS = [];

  // ===== EVENT HORIZON ==========================================================
  SETS.push({
    id: 'horizon', name: 'Event Horizon', rarity: 'legendary', code: 'A1',
    border: '#ff9a3a', frames: 48, fps: 12,
    backNote: 'The disk spins nonstop; stars drift in, speed up, stretch and vanish into the hole. Every few seconds a flare runs around the photon ring.',
    face: { card: '#14101e', ink: '#e8e0ff', red: '#ff6a9a', edge: '#000000', shade: '#1e1830', ring: '#ff7a1a', accent: '#ff9a3a' },
    faceNote: '<b>Suits:</b> a tilted orbit ring passes behind the suit and in front of it, like a small planet. <b>Ace:</b> the suit sits inside a spinning accretion disk with stars falling in.',
    back(g, f, F) {
      const cx = 11, cy = 16.5, r0 = rand(77);
      const stars = Array.from({ length: 22 }, () => ({ a: r0() * TAU, p: r0(), w: r0() }));
      const flare = (f % 24) / 24;
      g.each((u, v) => {
        const du = u + 0.5 - cx, dv = v + 0.5 - cy, r = Math.hypot(du, dv), th = Math.atan2(dv, du);
        const d = Math.hypot(du, dv * 3.2);
        const disk = d > 5 && d < 11.5 ? (Math.sin(th * 3 - (f * TAU) / 12 + d * 0.6) > 0 ? '#ff9a3a' : '#d8501a') : null;
        if (disk && dv > 0) return disk; // front of the disk
        if (r < 3.6) return '#000000';
        if (r < 4.6) { const fa = ((th / TAU + 1) % 1); return Math.abs(fa - flare) < 0.08 ? '#ffffff' : '#ffe9a0'; }
        if (r < 6 && dv < 0 && Math.abs(du) < 5) return '#a03a0a'; // lensed back of the disk
        if (disk) return disk;
        return '#05040c';
      });
      // infalling stars
      stars.forEach((s) => {
        const t = ((f / F) * 2 + s.p) % 1;
        const rad = 17 - t * 13; if (rad < 4.2) return;
        const ang = s.a + (t * t) * 6;
        const x = cx + Math.cos(ang) * rad - 0.5, y = cy + Math.sin(ang) * rad * 1.15 - 0.5;
        const col = rad < 7 ? '#ffb060' : s.w > 0.6 ? '#ffffff' : '#9a9ac0';
        g.set(x, y, col);
        if (rad < 9) g.set(cx + Math.cos(ang - 0.25) * (rad + 1) - 0.5, cy + Math.sin(ang - 0.25) * (rad + 1) * 1.15 - 0.5, '#6a3a1a'); // stretch trail
      });
    },
    ace(g, f, F, ink) {
      const cx = 9, cy = 11;
      g.each((x, y) => {
        const du = x + 0.5 - cx, dv = y + 0.5 - cy, d = Math.hypot(du, dv * 3), th = Math.atan2(dv, du);
        if (d > 8 && d < 17.5 && dv < 0) return Math.sin(th * 3 - (f * TAU) / 12 + d * 0.5) > 0 ? '#a03a0a' : '#6a240a';
        return null;
      });
      g.bits(BASE[this.s], 0, 2, { X: ink }, 2);
      g.each((x, y) => {
        const du = x + 0.5 - cx, dv = y + 0.5 - cy, d = Math.hypot(du, dv * 3), th = Math.atan2(dv, du);
        if (d > 8 && d < 17.5 && dv >= 0) return Math.sin(th * 3 - (f * TAU) / 12 + d * 0.5) > 0 ? '#ff9a3a' : '#d8501a';
        return null;
      });
      for (let i = 0; i < 3; i++) { const t = ((f / F) * 3 + i / 3) % 1; const a = i * 2.1 + t * 5; const rr = 10 - t * 7; g.set(cx + Math.cos(a) * rr - 0.5, cy + Math.sin(a) * rr * 1.2 - 0.5, t > 0.7 ? '#ffb060' : '#ffffff'); }
    },
  });

  // ===== ECLIPSE (insanity) ======================================================
  const ECL = { sx: 11, sy: 16 };
  function eclState(f, F) {
    const t = f / F, { sx, sy } = ECL;
    let mx;
    if (t < 0.36) mx = -9 + (sx - 1.8 + 9) * (t / 0.36);
    else if (t < 0.68) mx = sx - 1.8 + 3.6 * ((t - 0.36) / 0.32);
    else mx = sx + 1.8 + (31 - sx - 1.8) * ((t - 0.68) / 0.32);
    const my = sy + (t - 0.5) * 2;
    const off = Math.hypot(mx - sx, my - sy);
    const total = off < 1.1;
    const cover = Math.max(0, 1 - off / 14);
    const totStart = Math.round(F * (0.36 + 0.32 * (0.7 / 3.6)));
    return { mx, my, off, total, cover, totStart };
  }
  SETS.push({
    id: 'eclipse', name: 'Eclipse', rarity: 'insanity', code: 'A2', v2: true,
    border: '#ffb040', frames: 120, fps: 12,
    backNote: 'Ten seconds, one full eclipse. The moon creeps over the sun and the sky and the card\'s own frame go dark. Baily\'s beads sparkle on the edge, a diamond-ring flash, then totality: a shockwave rolls out to the frame, the corona explodes into long waving streamers with red prominences on the rim, stars come out and lights race around the border. Another diamond ring on the way out, and daylight returns.',
    face: { card: '#100c14', ink: '#ffe9c0', red: '#ff7a3a', edge: '#000000', shade: '#1c1620', ring: '#ffb040', accent: '#ffb040' },
    faceNote: '<b>Suits:</b> solid suit with a dotted corona around it. <b>Ace:</b> the suit is the moon, black, with long streamers turning behind it, red prominences on the rim and a diamond-ring flare that bursts every few seconds.',
    back(g, f, F) {
      const { sx, sy } = ECL; const S = eclState(f, F); const { mx, my, off, total, cover } = S;
      const sky = mix('#2a2040', '#010004', Math.min(1, cover * 1.25));
      const r0 = rand(9); const stars = Array.from({ length: 26 }, () => [Math.floor(r0() * IW), Math.floor(r0() * IH), r0()]);
      const ft = f - S.totStart;
      g.each((u, v) => {
        const du = u + 0.5 - sx, dv = v + 0.5 - sy, r = Math.hypot(du, dv), a = Math.atan2(dv, du);
        const dm = Math.hypot(u + 0.5 - mx, v + 0.5 - my); const inMoon = dm < 7.1;
        if (total) {
          if (r < 6.9) return '#000000';
          // streamers: four long arms that rotate slowly and wave
          let s = 0;
          for (let k = 0; k < 4; k++) { const ak = k * (TAU / 4) + 0.5 + f * 0.012 + Math.sin(f * 0.15 + k) * 0.12; let da = Math.abs(((a - ak) % TAU + TAU + Math.PI) % TAU - Math.PI); s = Math.max(s, 1 - da / (0.5 - (r - 7) * 0.025)); }
          const glow = r < 8.4 ? 1 : 0;
          const reach = 7.5 + s * 10;
          if (glow || (s > 0 && r < reach)) {
            const q = (r - 6.9) / Math.max(1, reach - 6.9);
            return r < 7.8 ? '#fff3c0' : q < 0.35 ? '#ffd080' : q < 0.6 ? '#ffb040' : q < 0.85 ? '#c8601a' : '#6a2a10';
          }
          if (Math.sin(a * 11 + f * 0.3) > 0.6 && r < 10.5) return '#5a2a14';
          return sky;
        }
        if (r < 6.8) return inMoon ? '#0a0810' : '#fff3c0';
        const reach = 7 + cover * 3;
        if (r < reach && Math.sin(a * 7 + f * 0.18) > 0.35 && !inMoon) return r < 8.2 ? '#ffb040' : '#a03a0a';
        if (inMoon) return '#0a0810';
        return sky;
      });
      if (cover > 0.5) stars.forEach(([x, y, w], i) => { if (Math.hypot(x - sx, y - sy) > 12) g.set(x, y, (i + (f >> 1)) % 6 ? (w > 0.5 ? '#ffffff' : '#a8a0c8') : '#3a3050'); });
      if (total) {
        // red prominences on the rim
        [[0.6, 0], [2.4, 3], [4.3, 7]].forEach(([a, ph]) => {
          const h = 1 + ((f + ph) % 12 < 6 ? 1 : 0);
          for (let i = 0; i <= h; i++) { g.set(sx - 0.5 + Math.cos(a) * (7 + i), sy - 0.5 + Math.sin(a) * (7 + i), '#ff3a3a'); }
          g.set(sx - 0.5 + Math.cos(a + 0.18) * 7.4, sy - 0.5 + Math.sin(a + 0.18) * 7.4, '#ff6a5a');
        });
        // shockwave
        if (ft >= 0 && ft < 14) { const R = 7 + ft * 1.6; g.each((u, v) => { const r = Math.hypot(u + 0.5 - sx, v + 0.5 - sy); return Math.abs(r - R) < 0.55 ? (ft < 7 ? '#ffffff' : '#ffd080') : null; }); }
      }
      // Baily's beads + diamond ring
      if (off >= 1.1 && off < 2.6) {
        const a = Math.atan2(sy - my, sx - mx);
        for (let k = -3; k <= 3; k++) if ((k + f) % 2 === 0) g.set(sx - 0.5 + Math.cos(a + k * 0.22) * 6.9, sy - 0.5 + Math.sin(a + k * 0.22) * 6.9, '#ffffff');
        if (off < 1.8) {
          const bx = sx - 0.5 + Math.cos(a) * 7, by = sy - 0.5 + Math.sin(a) * 7, L = f % 2 ? 4 : 3;
          for (let i = -L; i <= L; i++) { g.set(bx + i, by, Math.abs(i) < 2 ? '#ffffff' : '#fff3c0'); g.set(bx, by + i, Math.abs(i) < 2 ? '#ffffff' : '#fff3c0'); }
          g.set(bx + 1, by + 1, '#fff3c0'); g.set(bx - 1, by - 1, '#fff3c0'); g.set(bx + 1, by - 1, '#fff3c0'); g.set(bx - 1, by + 1, '#fff3c0');
        }
      }
    },
    borderFx(g, f, F) {
      const S = eclState(f, F);
      const base = S.total ? '#ffd080' : mix('#ffb040', '#4a2a10', Math.min(1, S.cover * 1.3));
      const per = []; for (let x = 1; x < BW - 1; x++) per.push([x, 1]); for (let y = 2; y < BH - 1; y++) per.push([BW - 2, y]); for (let x = BW - 3; x >= 1; x--) per.push([x, BH - 2]); for (let y = BH - 3; y >= 2; y--) per.push([1, y]);
      g.each((x, y) => (x >= 1 && y >= 1 && x < BW - 1 && y < BH - 1 && (x < IN || y < IN || x >= BW - IN || y >= BH - IN) ? base : null));
      if (S.total) per.forEach(([x, y], i) => { if ((i + f * 3) % 10 < 3) { g.set(x, y, '#ffffff'); const ix = x === 1 ? 2 : x === BW - 2 ? BW - 3 : x, iy = y === 1 ? 2 : y === BH - 2 ? BH - 3 : y; g.set(ix, iy, '#fff3c0'); } });
    },
    ace(g, f, F, ink, red) {
      const cx = 9, cy = 11; const hot = red ? '#ff7a3a' : '#ffd080', mid = red ? '#c8401a' : '#ffb040', far = red ? '#6a1a0a' : '#8a4a10';
      g.each((x, y) => {
        const du = x + 0.5 - cx, dv = y + 0.5 - cy, r = Math.hypot(du, dv), a = Math.atan2(dv, du);
        let s = 0;
        for (let k = 0; k < 4; k++) { const ak = k * (TAU / 4) + 0.3 + f * 0.02 + Math.sin(f * 0.2 + k) * 0.15; const da = Math.abs(((a - ak) % TAU + TAU + Math.PI) % TAU - Math.PI); s = Math.max(s, 1 - da / 0.45); }
        const reach = 8.5 + s * 4;
        if (r < 9.2) return hot;
        if (s > 0 && r < reach) return r < reach - 2 ? mid : far;
        return null;
      });
      const B = BASE[this.s];
      g.bits(B, 0, 2, { X: red ? '#ff7a3a' : '#ffe9c0' }, 2);
      g.bits(B.map((r, y) => [...r].map((c, x) => (c === 'X' && x > 0 && y > 0 && B[y][x - 1] === 'X' && B[y - 1][x] === 'X' && B[y][x + 1] === 'X' && (B[y + 1] || '')[x] === 'X' ? 'X' : '.')).join('')), 0, 2, { X: '#000000' }, 2);
      [[1, 8, 0], [16, 13, 4], [6, 20, 8]].forEach(([x, y, ph]) => { if ((f + ph) % 12 < 8) { g.set(x, y, '#ff3a3a'); if ((f + ph) % 12 < 4) g.set(x, y - 1, '#ff6a5a'); } });
      const k = f % 36; if (k < 8) { const bx = 14, by = 4, L = k < 2 || k > 5 ? 1 : 3; for (let i = -L; i <= L; i++) { g.set(bx + i, by, '#fff3c0'); g.set(bx, by + i, '#fff3c0'); } g.set(bx, by, '#ffffff'); }
    },
  });

  // ===== BLOOD MOON =============================================================
  const WOLF_DOWN = [[1, 34], [2, 28], [3, 25], [6, 23], [8, 21], [10, 22], [12, 22], [13, 23], [11, 25], [10, 28], [11, 34]];
  const WOLF_UP = [[1, 34], [2, 28], [3, 25], [5, 22], [6, 18], [7, 16], [8, 17], [9, 15], [9, 18], [10, 21], [10, 24], [10, 28], [11, 34]];
  SETS.push({
    id: 'bloodmoon', name: 'Blood Moon', rarity: 'secret', code: 'A3',
    border: '#5a0a10', title: '#ff5a6a', frames: 64, fps: 10,
    backNote: 'A lunar eclipse: the earth\'s shadow slides over a pale moon and turns it blood red. When it is fully red, the wolf on the hill lifts its head and howls, then the shadow moves on. Clouds drift past the whole time.',
    face: { card: '#eef0f6', ink: '#1e1e28', red: '#c0101e', edge: '#2a0a10', shade: '#dcdfe8', ring: '#c0101e', accent: '#c0101e' },
    faceNote: '<b>Suits:</b> three claw marks rake through each suit. <b>Ace:</b> the suit stands in front of a moon that slowly turns red and back, with a cloud passing over it.',
    back(g, f, F) {
      const mx = 11, my = 11;
      const t = f / F; const shx = -14 + t * 50; // shadow centre
      const redness = Math.max(0, 1 - Math.abs(shx - mx) / 9);
      const howl = Math.abs(shx - mx) < 4;
      g.each((u, v) => {
        const d = Math.hypot(u + 0.5 - mx, v + 0.5 - my);
        if (d < 8.4) {
          const inShadow = Math.hypot(u + 0.5 - shx, v + 0.5 - my - 1) < 11;
          const crater = (u * 5 + v * 7) % 13 === 0 || (u * 3 + v * 11) % 17 === 0;
          if (d > 7.6) return inShadow ? '#8a0a14' : '#b8bcc8';
          if (inShadow) return crater ? '#a01420' : '#d8202e';
          return crater ? '#c8ccd8' : '#eef0f6';
        }
        if (d < 10 && redness > 0.6) return (u + v + f) % 3 ? '#3a060c' : '#2a0408'; // red glow
        return mix('#1e1428', '#06020a', v / IH);
      });
      // clouds
      for (let c = 0; c < 2; c++) {
        const cxx = ((f * (c ? 0.35 : 0.5) + c * 15) % 36) - 8, cyy = 7 + c * 9;
        for (let i = -4; i <= 4; i++) { g.set(cxx + i, cyy, c ? '#2a1a30' : '#3a2438'); if (Math.abs(i) < 3) g.set(cxx + i, cyy - 1, c ? '#2a1a30' : '#3a2438'); }
      }
      g.poly([[0, 34], [0, 29], [9, 26], [22, 31], [22, 34]], '#05020a');
      g.poly(howl ? WOLF_UP : WOLF_DOWN, '#05020a');
      if (howl && f % 4 < 2) { g.set(12, 14, '#5a0a10'); g.set(13, 13, '#5a0a10'); } // howl lines
    },
    ace(g, f, F, ink, red) {
      const cx = 9, cy = 9.5; const t = (Math.sin((f / F) * TAU) + 1) / 2;
      const pale = '#d8dce8', blood = '#e04050';
      g.disc(cx, cy, 8.6, (x, y, d) => {
        const col = red ? mix(pale, '#f0c8cc', t) : mix(pale, blood, t);
        return d > 7.8 ? mix(col, '#5a0a10', 0.4) : ((x * 5 + y * 7) % 11 === 0 ? mix(col, '#000000', 0.12) : col);
      });
      const cxx = ((f * 0.6) % 30) - 7;
      for (let i = -3; i <= 3; i++) { g.set(cxx + i, 5, '#8a8ea0'); if (Math.abs(i) < 2) g.set(cxx + i, 4, '#8a8ea0'); }
      g.bits(BASE[this.s], 0, 4, { X: ink }, 2);
      const claws = SUIT_FX.bloodmoon(this.s);
      g.bits(claws.map((r) => r.join('')), 0, 4, { c: red ? mix('#f0c8cc', blood, t * 0.3) : mix(pale, blood, t) }, 2);
    },
  });

  // ===== HEARTBREAK =============================================================
  function heartAt(x, y, cx, cy, s) { const X = (x - cx) / (6.2 * s), Y = (cy - y) / (5.8 * s) + 0.25; return Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y <= 0; }
  const CRACK = [0, 1, 0, -1, 0, 1, 1, 0, -1, 0, 1, 0, 0, -1];
  SETS.push({
    id: 'heartbreak', name: 'Heartbreak', rarity: 'secret', code: 'A4',
    border: '#c8c2ae', title: '#ff6a7a', frames: 60, fps: 12,
    backNote: 'The heart beats twice, a crack runs down it, it splits and the halves fall apart in the rain. Then the pieces drift back together and it starts beating again.',
    face: { card: '#f6e8ec', ink: '#2a1018', red: '#c0102a', edge: '#3a0f1e', shade: '#e8d0d8', ring: '#3a0f1e', accent: '#c0102a' },
    faceNote: '<b>Suits:</b> a crack zig-zags through every suit, so all four read as broken. <b>Ace:</b> the big suit beats, cracks, splits in two and mends, on a loop.',
    back(g, f, F) {
      const beatT = [0, 0.06, 0.1, 0.06, 0, 0, 0.06, 0.1, 0.06, 0, 0, 0];
      const s = 1 + (f < 12 ? beatT[f] : 0);
      const crackLen = f < 14 ? 0 : Math.min(14, (f - 14) * 2);
      const sep = f < 22 ? 0 : f < 36 ? Math.min(4, (f - 22) * 0.5) : Math.max(0, 4 - (f - 36) * 0.25);
      const drop = f < 22 ? 0 : f < 36 ? Math.min(3, (f - 22) * 0.3) : Math.max(0, 3 - (f - 36) * 0.2);
      const heavy = f >= 22 && f < 44;
      g.each((u, v) => {
        if ((u * 5 + (v - f * 2) * 3 + 400) % (heavy ? 11 : 23) === 0 && u % 2 === 0) return '#3a3a5a';
        return ((u >> 1) + (v >> 1)) % 2 ? '#14101c' : '#18121f';
      });
      const cx = 11, cy = 15;
      for (let v = 0; v < IH; v++) for (let u = 0; u < IW; u++) {
        for (const side of [-1, 1]) {
          const ox = u - side * sep, oy = v - drop;
          const cu = ox + 0.5, cv = oy + 0.5;
          if (!heartAt(cu, cv, cx, cy, s)) continue;
          const row = Math.round(cv - 9);
          const split = cx + (CRACK[Math.max(0, Math.min(13, row))] || 0);
          if (side < 0 ? cu > split + 0.5 : cu < split + 0.5) continue;
          if (sep === 0 && row >= 0 && row < crackLen && Math.abs(cu - (split + 0.5)) < 0.6) { g.set(u, v, '#2a0810'); continue; }
          const hi = ox < cx - 3 && oy < cy - 1;
          g.set(u, v, hi ? '#ff6a7a' : (ox + oy) % 7 === 0 ? '#a00c22' : '#d8203a');
        }
      }
    },
    ace(g, f, F, ink) {
      const st = f % 30; const s = st < 8 ? [0, 1, 0, 0, 1, 0, 0, 0][st] : 0;
      const sep = st < 12 ? 0 : st < 20 ? Math.min(2, (st - 12) * 0.5) : Math.max(0, 2 - (st - 20) * 0.25);
      const crackOn = st >= 8 && st < 28;
      const shape = BASE[this.s];
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) {
        if (shape[y][x] !== 'X') continue;
        const cut = 4 + (CRACK[y] || 0) * 0.5;
        const side = x < cut ? -1 : 1;
        const isCrack = crackOn && sep === 0 && Math.abs(x - cut) < 0.6 && y > 0;
        const px = x * 2 + side * Math.round(sep) - (s && 0), py = y * 2 + 3 + (sep > 0 ? Math.round(sep / 2) : 0) - s;
        for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) g.set(px + a, py + b, isCrack ? '#f6e8ec' : ink);
      }
    },
  });

  // ===== HITMAN =================================================================
  SETS.push({
    id: 'hitman', name: 'Hitman', rarity: 'secret', code: 'A5',
    border: '#d8b040', frames: 64, fps: 12,
    backNote: 'A scope sweeps the dark, finds an ace pinned to the wall and locks on: the reticle tightens, the red dot steadies, muzzle flash, a bullet hole appears in the card and a gold shell casing bounces across the bottom.',
    face: { card: '#f4efe2', ink: '#0c0c0e', red: '#a0101a', edge: '#000000', shade: '#e0d8c4', ring: '#d8b040', accent: '#d8b040' },
    faceNote: '<b>Suits:</b> four gold crosshair ticks frame each suit. <b>Ace:</b> the big suit sits in a scope reticle; the red dot wanders, settles on the centre and leaves a bullet hole.',
    back(g, f, F) {
      const flash = f === 34 || f === 35;
      g.each((u, v) => (flash ? (f === 34 ? '#fff6c0' : '#d8b040') : (u + v) % 2 ? '#0c0c0e' : '#08080a'));
      if (flash) return;
      // pinned card target
      const tx = 8, ty = 12;
      g.poly([[tx, ty], [tx + 7, ty], [tx + 7, ty + 10], [tx, ty + 10]], '#e8e2d0');
      g.set(tx + 3, ty - 1, '#d8b040');
      g.bits(['.X.', 'XXX', 'XXX', '.X.'], tx + 2, ty + 3, { X: '#0c0c0e' });
      const hit = f > 35;
      if (hit) { g.set(tx + 3, ty + 5, '#000000'); g.set(tx + 4, ty + 5, '#000000'); g.set(tx + 3, ty + 6, '#000000'); g.set(tx + 4, ty + 6, '#000000'); [[2, 4], [5, 3], [6, 7], [2, 8], [1, 6]].forEach(([a, b]) => g.set(tx + a, ty + b, '#8a8470')); }
      // scope path
      const path = [[4, 6], [16, 8], [18, 24], [6, 26], [5, 14], [12, 18]];
      let cx, cy, rad = 6.6;
      if (f < 24) { const p = (f / 24) * (path.length - 1), i = Math.floor(p), k = p - i; const A = path[i], B = path[Math.min(i + 1, path.length - 1)]; cx = A[0] + (B[0] - A[0]) * k; cy = A[1] + (B[1] - A[1]) * k; }
      else if (f < 34) { cx = 11.5; cy = 17.5; rad = 6.6 - (f - 24) * 0.2; }
      else if (f < 50) { cx = 11.5; cy = 17.5 - Math.max(0, 3 - (f - 36) * 0.4); rad = 4.6 + Math.min(2, (f - 36) * 0.3); }
      else { cx = 11.5 + (f - 50) * 0.6; cy = 17.5 - (f - 50) * 0.5; }
      if (f < 34 || f >= 50) {
        g.disc(cx, cy, rad, (x, y, d) => (d > rad - 0.8 ? '#d8b040' : null));
        for (let i = -8; i <= 8; i++) if (Math.abs(i) > 2) { g.set(cx + i, cy, '#d8b040'); g.set(cx, cy + i, '#d8b040'); }
        if (f >= 24 && f < 34 && f % 2 === 0) g.set(cx, cy, '#ff2a2a');
        if (f < 24 && f % 6 < 3) g.set(cx, cy, '#ff2a2a');
      }
      // shell casing
      if (f > 35 && f < 58) { const k = f - 36; const x = 4 + k * 0.7, y = 30 - Math.abs(Math.sin(k * 0.45)) * 4 * Math.max(0, 1 - k / 20); g.set(x, y, '#ffd75e'); g.set(x + 1, y, '#b08a2a'); }
      for (let u = 0; u < IW; u++) if (u % 3 === 0) { g.set(u, 1, '#3a3020'); g.set(u, IH - 2, '#3a3020'); }
    },
    ace(g, f, F, ink) {
      g.bits(BASE[this.s], 0, 3, { X: ink }, 2);
      const cx = 9, cy = 12;
      const k = f % 40; let dx = cx, dy = cy;
      if (k < 20) { dx = cx + Math.sin(k * 0.7) * 5; dy = cy + Math.cos(k * 0.5) * 5; }
      g.disc(cx, cy, 10.4, (x, y, d) => (d > 9.6 ? '#d8b040' : null));
      for (let i = -10; i <= 10; i++) if (Math.abs(i) > 6) { g.set(cx + i - 0.5, cy - 0.5, '#d8b040'); g.set(cx - 0.5, cy + i - 0.5, '#d8b040'); }
      if (k >= 22 && k < 38) { g.set(cx - 1, cy - 1, '#f4efe2'); g.set(cx, cy - 1, '#f4efe2'); g.set(cx - 1, cy, '#f4efe2'); g.set(cx, cy, '#f4efe2'); g.set(cx - 2, cy - 2, '#8a8470'); g.set(cx + 1, cy - 2, '#8a8470'); g.set(cx + 1, cy + 1, '#8a8470'); g.set(cx - 2, cy + 1, '#8a8470'); }
      if (k < 22 && k % 2 === 0) { g.set(dx - 0.5, dy - 0.5, '#ff2a2a'); }
      if (k === 20 || k === 21) { g.set(cx - 0.5, cy - 0.5, '#ff2a2a'); }
    },
  });

  const BRACKETS = ['..X.....X..', '.X...X...X.', 'X....X....X', '.X..X....X.', '..X.X...X..'];
  // ===================================================================== ROUND 2
  const CROWN_S = ['o.o.o', 'ooooo'];
  const BIG_CROWN = ['o...o...o', 'oo.ooo.oo', 'ooooooooo', 'oJoooooJo', 'ddddddddd'];
  const HEART5 = ['.X.X.', 'XXXXX', '.XXX.', '..X..'];
  Object.assign(SUIT_FX, {
    kinghearts(s) { // a little gold crown sits on every suit
      const g = pad(grid(BASE[s]), 1); const out = [[...'...........'], [...'...........'], ...g.slice(1)];
      CROWN_S.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'o') out[y][3 + x] = 'o'; }));
      return out;
    },
    heaven(s) { // small gold wings on both sides
      const g = pad(grid(BASE[s]), 1);
      [[0, 2], [0, 3], [1, 3], [0, 4], [1, 4]].forEach(([x, y]) => { g[y][x] = 'o'; g[y][10 - x] = 'o'; });
      return g;
    },
    silverwolf(s) { // an ice cap on top of the suit and one icicle
      const g = grid(BASE[s]);
      for (let x = 0; x < 9; x++) for (let y = 0; y < 9; y++) if (g[y][x] === 'X') { g[y][x] = 'o'; break; }
      return g;
    },
    deadwood(s) { // one bullet hole with a scorched rim
      const g = grid(BASE[s]); const [hx, hy] = s === '♣' ? [5, 5] : [5, 4];
      g[hy][hx] = 'c'; [[1, 0], [0, 1], [-1, 0], [0, -1]].forEach(([dx, dy]) => { if (g[hy + dy][hx + dx] === 'X') g[hy + dy][hx + dx] = 'h'; });
      return g;
    },
    ghost(s) { // a glitch slice: two rows shift right with a magenta / cyan split
      const g = pad(grid(BASE[s]), 1);
      for (const y of [5, 6]) { const row = g[y]; const first = row.indexOf('X'); const last = row.lastIndexOf('X'); if (first < 0) continue; row.splice(first, 0, '.'); row.pop(); row[first] = 'o'; if (last + 2 < row.length) row[last + 2] = 'h'; }
      return g;
    },
    platinum(s) { // faceted: a light diagonal facet line through the suit
      const g = grid(BASE[s]);
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (g[y][x] === 'X' && (x + y === 6 || x - y === 2)) g[y][x] = 'h';
      return g;
    },
    house(s) { // wireframe: outlined suit with a light fill
      const g = grid(BASE[s]); const b = BASE[s];
      for (let y = 0; y < 9; y++) for (let x = 0; x < 9; x++) if (b[y][x] === 'X' && x > 0 && y > 0 && b[y][x - 1] === 'X' && b[y - 1][x] === 'X' && b[y][x + 1] === 'X' && (b[y + 1] || '')[x] === 'X') g[y][x] = 'h';
      return g;
    },
  });

  // ----- King of Hearts
  SETS.push({
    id: 'kinghearts', name: 'King of Hearts', rarity: 'secret', code: 'B1', round: 2,
    border: '#ffd75e', frames: 72, fps: 12,
    backNote: 'Hearts float up the crimson back. A gold crown drops from the top, lands on a big heart with a little bounce and bursts into sparkles; the crowned heart beats a few times, then the crown lifts off and the scene starts over.',
    face: { card: '#fff4ec', ink: '#3a0a14', red: '#c0102a', edge: '#6a4a08', shade: '#f4e0d4', ring: '#ffd75e', accent: '#d8a020', extra: '#c0102a' },
    faceNote: '<b>Suits:</b> every suit wears a tiny gold crown. <b>Ace:</b> a big crown hovers over the suit, settles on it and sparkles.',
    back(g, f, F) {
      g.each((u, v) => (((u >> 1) + (v >> 1)) % 2 ? '#8a0f1e' : '#a01a2a'));
      [[1, 3], [8, 20], [15, 9], [4, 27], [17, 30], [11, 0], [0, 15]].forEach(([x, y]) => { const yy = ((y - f) % IH + IH) % IH; g.bits(HEART5, x, yy, { X: '#ff9aa8' }); });
      const beat = f > 30 && f < 52 && (f - 30) % 8 < 2 ? 1 : 0;
      g.each((u, v) => (heartAt(u + 0.5, v + 0.5, 11, 21, 1.05 + beat * 0.08) ? (u < 8 && v < 19 ? '#ff6a7a' : '#d8203a') : null));
      g.each((u, v) => (heartAt(u + 0.5, v + 0.5, 11, 21, 1.05 + beat * 0.08) && !heartAt(u + 0.5, v + 0.5, 11, 21, 0.9 + beat * 0.08) ? '#5a0a14' : null));
      let cy;
      if (f < 18) cy = -6 + (f / 18) * 18; else if (f < 22) cy = 12 - [0, 1, 1, 0][f - 18]; else if (f < 56) cy = 12; else cy = 12 - (f - 56) * 1.2;
      g.bits(BIG_CROWN, 7, Math.round(cy), { o: '#ffd75e', J: '#d8323a', d: '#b8860b' });
      if (f >= 20 && f < 34) { const k = f - 20; [[-1, -1], [1, -1], [-1, 0], [1, 0], [0, -1]].forEach(([dx, dy], i) => { const x = 11 + dx * (2 + k * 0.6) * (i % 2 ? 1.2 : 1), y = 13 + dy * (1 + k * 0.5); g.set(x, y, k % 2 ? '#ffffff' : '#fff6c0'); }); }
      if (f >= 34 && f < 56 && f % 6 < 2) { g.set(6, 12, '#ffffff'); g.set(17, 11, '#ffffff'); }
    },
    ace(g, f, F, ink) {
      const k = f % 36; const cy = k < 10 ? -5 + k * 0.6 : k < 30 ? 1 : 1 - (k - 30) * 1;
      g.bits(BASE[this.s], 0, 5, { X: ink }, 2);
      g.bits(BIG_CROWN, 4, Math.round(cy), { o: '#d8a020', J: '#c0102a', d: '#8a6a08' });
      if (k >= 10 && k < 30 && k % 4 < 2) { g.set(2, 2, '#ffd75e'); g.set(15, 1, '#ffd75e'); g.set(17, 9, '#ffd75e'); }
    },
  });

  // ----- Seventh Heaven
  const SEVEN = ['XXXXXXXX', 'XXXXXXXX', '......XX', '.....XX.', '....XX..', '....XX..', '...XX...', '...XX...', '..XX....', '..XX....'];
  SETS.push({
    id: 'heaven', name: 'Seventh Heaven', rarity: 'secret', code: 'B2', round: 2,
    border: '#ffffff', frames: 72, fps: 12,
    backNote: 'Two big clouds part like curtains; behind them seven golden rays turn slowly around a shining 7, and small clouds drift through the light. Then the clouds close again.',
    face: { card: '#f4faff', ink: '#1a3a6a', red: '#e0304a', edge: '#3a6aa0', shade: '#dcecfa', ring: '#bfe0ff', accent: '#d8a020' },
    faceNote: '<b>Suits:</b> small gold wings on each side. <b>Ace:</b> the suit flaps a pair of big gold wings under a halo.',
    back(g, f, F) {
      const open = f < 12 ? f / 12 : f < 56 ? 1 : Math.max(0, 1 - (f - 56) / 12);
      const cx = 11, cy = 16;
      g.each((u, v) => {
        const a = Math.atan2(v + 0.5 - cy, u + 0.5 - cx), r = Math.hypot(u + 0.5 - cx, v + 0.5 - cy);
        const ray = Math.sin(a * 7 + f * 0.09) > 0.82 && r > 4;
        if (ray && open > 0.3) return r < 9 ? '#fff6c0' : '#d8ecff';
        return v < 10 ? '#5aa8f0' : v < 22 ? '#7ac0ff' : '#a8d8ff';
      });
      [[2, 6, 5, 2], [14, 28, 6, 2]].forEach(([x, y, rx, ry], i) => { const dx = ((x + f * 0.4 * (i ? -1 : 1)) % 30 + 30) % 30 - 4; g.each((u, v) => (((u - dx) / rx) ** 2 + ((v - y) / ry) ** 2 <= 1 ? (v > y ? '#d8ecff' : '#ffffff') : null)); });
      [[-1, 0], [1, 0], [0, -1], [0, 1], [1, 1]].forEach(([dx, dy]) => g.bits(SEVEN, 7 + dx, 11 + dy, { X: '#b8860b' }));
      g.bits(SEVEN, 7, 11, { X: f % 6 < 3 ? '#ffd75e' : '#ffe9a0' });
      const curtain = (1 - open) * 11.5;
      g.each((u, v) => {
        const left = u + 0.5 < curtain + Math.sin(v * 0.8) * 1.5, right = u + 0.5 > IW - curtain - Math.sin(v * 0.8 + 1) * 1.5;
        return left || right ? ((u + v) % 5 === 0 ? '#d8ecff' : '#ffffff') : null;
      });
    },
    ace(g, f, F, ink) {
      const up = (f >> 2) % 2 === 0;
      const wing = up ? ['oo.......', 'ooo......', '.ooo.....', '..oooo...', '...ooooo.'] : ['.........', '.........', 'ooooo....', '.oooooo..', '...ooooo.'];
      g.bits(wing, 0, 7, { o: '#d8a020' });
      g.bits(wing.map((r) => [...r].reverse().join('')), 9, 7, { o: '#d8a020' });
      g.bits(BASE[this.s], 4, 8, { X: ink });
      for (let x = 5; x < 13; x++) g.set(x, 5, x === 5 || x === 12 ? null : '#d8a020');
      g.set(5, 4, null); g.set(6, 4, '#ffd75e'); g.set(11, 4, '#ffd75e'); g.set(4, 5, null);
      for (let x = 6; x < 12; x++) g.set(x, 4, (x + f) % 6 === 0 ? '#ffffff' : '#ffd75e');
    },
  });

  // ----- Silver Wolf
  SETS.push({
    id: 'silverwolf', name: 'Silver Wolf', rarity: 'secret', code: 'B3', round: 2,
    border: '#e8ecf8', frames: 72, fps: 10,
    backNote: 'Snow falls in two layers in front of a silver moon and the wolf on the ridge. Pairs of eyes blink open in the dark trees below, one after another; then the wolf turns its head, its own eyes glow ice blue and a gust of snow sweeps across the card.',
    face: { card: '#e8ecf4', ink: '#1a2030', red: '#8a1a2a', edge: '#3a3e4a', shade: '#d4d8e2', ring: '#c8ccd8', accent: '#4a8ac8' },
    faceNote: '<b>Suits:</b> an ice-blue cap on the top edge of each suit. <b>Ace:</b> snow falls over the suit and two wolf eyes open inside it and blink.',
    back(g, f, F) {
      const gust = f >= 52 && f < 64;
      g.each((u, v) => mix('#1a2232', '#05070c', v / IH));
      g.disc(11, 11, 8, (u, v, d) => (d > 7.3 ? '#8a8ea0' : (u * 5 + v * 3) % 9 === 0 ? '#d0d4e0' : '#eef0f6'));
      g.poly([[2, 23], [5, 17], [7, 11], [9, 14], [11, 8], [13, 13], [17, 16], [18, 19], [14, 19], [13, 23]], '#05070c');
      if (f >= 44) { g.set(10, 13, '#5af2ff'); if (f % 4 < 2) g.set(11, 13, '#9ae8ff'); }
      g.poly([[0, 34], [0, 23], [6, 21], [11, 23], [22, 22], [22, 34]], '#0a0e16');
      for (let i = 0; i < 6; i++) { const x = 2 + i * 4, y = 28 - (i % 2) * 3; g.poly([[x - 2, 34], [x, y - 4], [x + 2, 34]], '#060910'); }
      [[3, 30, 8], [12, 28, 20], [17, 31, 30], [7, 27, 38]].forEach(([x, y, t]) => { const k = f - t; if (k >= 0 && k < 10 && !(k > 3 && k < 5)) { g.set(x, y, '#e0ffff'); g.set(x + 2, y, '#e0ffff'); } });
      const r0 = rand(31);
      for (let i = 0; i < 34; i++) {
        const far = i % 2, sp = far ? 0.5 : 1, x0 = r0() * IW, y0 = r0() * IH;
        const x = ((x0 + (gust ? (f - 52) * (far ? 1.5 : 3) : Math.sin(f * 0.1 + i) * 0.8)) % IW + IW) % IW, y = (y0 + f * sp) % IH;
        g.set(x, y, far ? '#8a94aa' : '#ffffff');
        if (gust && !far) g.set(x - 1, y, '#c8d0e0');
      }
    },
    ace(g, f, F, ink, red) {
      g.bits(BASE[this.s], 0, 3, { X: ink }, 2);
      const k = f % 40; const open = !(k > 30 && k < 33);
      if (open) { [[5, 11], [6, 11], [11, 11], [12, 11]].forEach(([x, y]) => g.set(x, y, '#5af2ff')); g.set(6, 10, '#c8f8ff'); g.set(12, 10, '#c8f8ff'); }
      const r0 = rand(5); for (let i = 0; i < 9; i++) { const x = Math.floor(r0() * 18), y = (Math.floor(r0() * 22) + (f >> 1)) % 22; g.set(x, y, '#8ab0d8'); }
    },
  });

  // ----- Deadwood
  const CYL_OFF = [[0, -3], [2.6, -1.5], [2.6, 1.5], [0, 3], [-2.6, 1.5], [-2.6, -1.5]];
  SETS.push({
    id: 'deadwood', name: 'Deadwood', rarity: 'secret', code: 'B4', round: 2, title: '#e8c890',
    border: '#3a2410', frames: 84, fps: 12,
    backNote: 'On the saloon planks, a revolver cylinder spins fast, slows down and clicks into place with a glint. Then a tumbleweed bounces across the floor kicking up dust, and the cylinder spins again.',
    face: { card: '#e8d4a8', ink: '#3a2410', red: '#8a2a14', edge: '#3a2410', shade: '#d0b888', ring: '#a07040', accent: '#a07040', hole: '#2a1606' },
    faceNote: '<b>Suits:</b> each suit has one bullet hole with a scorched rim. <b>Ace:</b> the suit is pinned like a wanted poster; three shots hit it one by one, then it gets a fresh nail and starts again.',
    back(g, f, F) {
      g.each((u, v) => { const plank = Math.floor(v / 6), grain = (u * 3 + plank * 17) % 13; if (v % 6 === 5) return '#2a1606'; return grain === 0 ? '#5a3418' : plank % 2 ? '#7a4a24' : '#6a4020'; });
      const spinT = f < 40 ? f : 0; const ang = spinT < 40 ? (1 - Math.pow(1 - spinT / 40, 2)) * TAU * 3 : 0;
      const cx = 11, cy = 13;
      g.disc(cx, cy, 6.6, (u, v, d) => (d > 5.8 ? '#3a3a42' : '#7a7a86'));
      CYL_OFF.forEach(([dx, dy]) => { const a = Math.atan2(dy, dx) + ang, r = 3.2; g.disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.4, '#1a1a20'); g.set(cx + Math.cos(a) * r - 0.5, cy + Math.sin(a) * r - 0.5, '#c8a040'); });
      g.disc(cx, cy, 1, '#b0b0bc');
      if (f >= 40 && f < 44) { g.set(cx + 4, cy - 4, '#ffffff'); g.set(cx + 5, cy - 4, '#fff6c0'); g.set(cx + 4, cy - 5, '#fff6c0'); }
      if (f >= 44) {
        const k = f - 44; const tx = -4 + k * 0.7, ty = 29 - Math.abs(Math.sin(k * 0.35)) * 4;
        g.disc(tx, ty, 2.6, (u, v, d) => ((u * 3 + v * 5 + k) % 4 === 0 ? null : (u + v + k) % 3 ? '#a07040' : '#6a4020'));
        if (Math.abs(Math.sin(k * 0.35)) < 0.25) { g.set(tx - 3, 32, '#c8a878'); g.set(tx - 4, 31, '#b09060'); g.set(tx + 3, 32, '#c8a878'); }
      }
    },
    ace(g, f, F, ink) {
      g.bits(BASE[this.s], 0, 3, { X: ink }, 2);
      const k = f % 48; const holes = [[5, 8, 6], [12, 10, 14], [8, 15, 22]];
      holes.forEach(([x, y, t]) => { if (k >= t) { g.set(x, y, '#2a1606'); g.set(x + 1, y, '#2a1606'); g.set(x, y + 1, '#2a1606'); g.set(x + 1, y + 1, '#2a1606'); if (k - t < 2) { g.set(x - 1, y - 1, '#ffd75e'); g.set(x + 2, y + 2, '#ffd75e'); g.set(x + 2, y - 1, '#fff6c0'); } } });
      g.set(8, 1, '#8a8a96'); g.set(9, 1, '#5a5a66'); g.set(8, 2, '#5a5a66');
    },
  });

  // ----- Unknown Signal
  const QMARK = ['.XXXX.', 'XX..XX', '....XX', '...XX.', '..XX..', '..XX..', '......', '..XX..'];
  SETS.push({
    id: 'ghost', name: 'Unknown Signal', rarity: 'secret', code: 'B5', round: 2,
    border: '#5affd8', frames: 72, fps: 12,
    backNote: 'A radar sweep turns on a dark green screen, leaving a fading trail. On the second pass it catches a blip that pings and grows; the screen tears into static and RGB glitches for a moment, and a question mark is left flickering before the sweep starts again.',
    face: { card: '#dcfff6', ink: '#0a2a2a', red: '#d0207a', edge: '#0e3a36', shade: '#c0ece2', ring: '#0e3a36', accent: '#ff3ad0', extra: '#3ad8ff' },
    faceNote: '<b>Suits:</b> a glitch slice shifts the middle rows with a magenta and cyan split. <b>Ace:</b> a scanline rolls down the big suit and every few seconds it tears into offset, colour-split slices.',
    back(g, f, F) {
      const cx = 11, cy = 15; const sweep = (f / 24) * TAU;
      const glitch = f >= 44 && f < 54;
      if (glitch) {
        const r0 = rand(f * 7 + 1);
        g.each((u, v) => { const n = r0(); return n < 0.1 ? '#ff3ad0' : n < 0.2 ? '#3ad8ff' : n < 0.5 ? '#5affd8' : n < 0.7 ? '#123a36' : '#061214'; });
        for (let i = 0; i < 4; i++) { const y = Math.floor(r0() * IH); for (let u = 0; u < IW; u++) g.set(u, y, '#ffffff'); }
        return;
      }
      g.each((u, v) => {
        const du = u + 0.5 - cx, dv = v + 0.5 - cy, r = Math.hypot(du, dv);
        if (r > 10.5) return v % 2 ? '#061214' : '#0a1c1e';
        const a = Math.atan2(dv, du); const lag = ((sweep - a) % TAU + TAU) % TAU;
        if (lag < 0.12) return '#5affd8';
        if (Math.abs(r - 10) < 0.5 || Math.abs(r - 6.5) < 0.4 || Math.abs(r - 3) < 0.4 || Math.abs(du) < 0.5 || Math.abs(dv) < 0.5) return lag < 1.2 ? '#2a8a7a' : '#123a36';
        return lag < 0.6 ? '#1a5a50' : lag < 1.2 ? '#0e3a36' : '#071a1a';
      });
      if (f >= 24 && f < 44) { const k = f - 24; const bx = 15, by = 10; const R = Math.min(2, k * 0.2); g.disc(bx + 0.5, by + 0.5, R + 0.6, k % 4 < 2 ? '#ffffff' : '#5affd8'); if (k % 8 < 4) g.disc(bx + 0.5, by + 0.5, R + 2.6, (u, v, d) => (d > R + 1.8 ? '#5affd8' : null)); }
      if (f >= 54) { if (f % 3) g.bits(QMARK, 8, 11, { X: '#5affd8' }); for (let u = 0; u < IW; u++) g.set(u, (f * 3) % IH, '#123a36'); }
    },
    ace(g, f, F, ink, red) {
      const k = f % 36; const tear = k >= 28 && k < 33;
      const B = BASE[this.s];
      for (let y = 0; y < 9; y++) {
        const shift = tear ? [0, 1, 0, -2, 2, 0, -1, 0, 1][(y + k) % 9] : 0;
        for (let x = 0; x < 9; x++) if (B[y][x] === 'X') for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) {
          if (tear && shift) { g.set(x * 2 + a + shift - 1, y * 2 + 3 + b, '#ff3ad0'); g.set(x * 2 + a + shift + 1, y * 2 + 3 + b, '#3ad8ff'); }
          g.set(x * 2 + a + shift, y * 2 + 3 + b, ink);
        }
      }
      const sy = (f % 22); for (let x = 0; x < 18; x++) if (g) { /* scanline */ }
      for (let x = 0; x < 18; x += 1) if ((x + sy) % 2 === 0) g.set(x, sy, '#5affd8');
    },
  });

  // ----- Platinum
  const RAIN = ['#ff4f6a', '#ff9a3a', '#ffe066', '#5fd068', '#4fb0ff', '#a06aff'];
  const GEM = ['....XXXXXX....', '...XoXooXoX...', '..XooXooXooX..', '.XXXXXXXXXXXX.', 'XooXooooooXooX', '.XooXooooXooX.', '..XooXooXooX..', '...XooXXooX...', '....XooooX....', '.....XooX.....', '......XX......'];
  SETS.push({
    id: 'platinum', name: 'Platinum', rarity: 'secret', code: 'B6', round: 2,
    border: '#ffffff', frames: 72, fps: 12,
    backNote: 'A brushed platinum plate. A bright glint sweeps across it diagonally, the cut gem in the middle turns on its axis, and when it faces you it throws rainbow light around the card and sparkles.',
    face: { card: '#eef0f6', ink: '#1e2230', red: '#d0306a', edge: '#4a4e5a', shade: '#dde0ea', ring: '#c8ccd8', accent: '#d0306a' },
    faceNote: '<b>Suits:</b> lighter facet lines cut into each suit, like a gem. <b>Ace:</b> the big suit is cut into facets and a rainbow glint runs across it.',
    facetMix: 0.5,
    back(g, f, F) {
      const sweep = (f % 36) * 1.6 - 14;
      g.each((u, v) => { const d = u + v * 0.6 - sweep; if (Math.abs(d) < 1.2) return '#ffffff'; if (Math.abs(d) < 2.6) return '#e8ecf6'; return (v % 3 === 0) ? '#a8adbc' : '#c0c4d0'; });
      const w = Math.abs(Math.cos((f / F) * TAU * 2));
      const front = w > 0.92;
      if (front) { g.each((u, v) => { const a = Math.atan2(v + 0.5 - 17, u + 0.5 - 11); const k = Math.floor(((a + Math.PI) / TAU) * 12 + f * 0.3) % 6; const r = Math.hypot(u + 0.5 - 11, v + 0.5 - 17); return r > 9 && Math.sin(a * 6) > 0.7 ? RAIN[k] : null; }); }
      GEM.forEach((row, y) => [...row].forEach((c, x) => {
        if (c === '.') return; const dx = (x - 6.5) * w; const px = 11 + dx;
        g.set(px - 0.5, 12 + y, c === 'X' ? '#3a3e4a' : (x + y + (f >> 2)) % 5 === 0 ? RAIN[(x + (f >> 2)) % 6] : '#eef4ff');
      }));
      if (front) [[4, 8], [18, 10], [3, 27], [17, 28]].forEach(([x, y], i) => { if ((f + i) % 3) { g.set(x, y, '#ffffff'); g.set(x + 1, y, '#e0e4f0'); g.set(x - 1, y, '#e0e4f0'); g.set(x, y + 1, '#e0e4f0'); g.set(x, y - 1, '#e0e4f0'); } });
    },
    ace(g, f, F, ink, red) {
      const B = SUIT_FX.platinum(this.s); const lt = mix(red ? '#d0306a' : '#1e2230', '#eef0f6', 0.5);
      g.bits(B.map((r) => r.join('')), 0, 3, { X: ink, h: lt }, 2);
      const k = (f % 30) - 4;
      for (let y = 0; y < 22; y++) for (let x = 0; x < 18; x++) { const d = x + y * 0.5 - k * 1.2; const yy = Math.floor((y - 3) / 2), xx = Math.floor(x / 2); if (Math.abs(d) < 1 && B[yy] && B[yy][xx] && B[yy][xx] !== '.') g.set(x, y, RAIN[(y >> 1) % 6]); }
    },
  });

  // ----- The House
  SETS.push({
    id: 'house', name: 'The House', rarity: 'secret', code: 'B7', round: 2,
    border: '#5a8aff', frames: 84, fps: 12,
    backNote: 'Code types itself out line by line with a blinking cursor. A progress bar fills up, the screen flashes, and the bracket logo builds itself with a heart in the middle, beating. Then the screen clears and the code starts again.',
    face: { card: '#fbfbff', ink: '#14183a', red: '#e0204a', edge: '#14183a', shade: '#e4e6f4', ring: '#5a8aff', accent: '#5a8aff' },
    faceNote: '<b>Suits:</b> drawn as a wireframe, a solid outline with a light fill. <b>Ace:</b> the big suit renders itself line by line behind a cursor, then fills in.',
    facetMix: 0.75,
    back(g, f, F) {
      g.each(() => '#0a1030');
      const lines = [[1, 9, '#ff6ad0'], [3, 13, '#9ad0ff'], [3, 7, '#ffd75e'], [1, 15, '#6aff9a'], [5, 10, '#9ad0ff'], [3, 6, '#ff6ad0'], [1, 12, '#ffd75e'], [3, 14, '#6aff9a'], [1, 8, '#9ad0ff'], [5, 11, '#ffd75e']];
      if (f < 40) {
        const typed = f * 3; let used = 0;
        lines.forEach(([x, w, c], i) => { const y = 2 + i * 3; const n = Math.max(0, Math.min(w, typed - used)); for (let u = 0; u < n; u++) g.set(x + u, y, c); if (n > 0 && n < w && f % 4 < 2) g.set(x + n, y, '#ffffff'); used += w; });
      } else if (f < 56) {
        const p = (f - 40) / 15; for (let u = 2; u < 20; u++) { g.set(u, 15, '#5a8aff'); g.set(u, 19, '#5a8aff'); } g.set(2, 16, '#5a8aff'); g.set(2, 17, '#5a8aff'); g.set(2, 18, '#5a8aff'); g.set(19, 16, '#5a8aff'); g.set(19, 17, '#5a8aff'); g.set(19, 18, '#5a8aff');
        for (let u = 3; u < 3 + Math.round(p * 16); u++) for (let v = 16; v < 19; v++) g.set(u, v, '#6aff9a');
      } else {
        if (f < 58) { g.each(() => '#cfe2ff'); return; }
        const k = f - 58; const n = Math.min(BRACKETS.length * 11, k * 6); let i = 0;
        BRACKETS.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'X' && i++ < n) { g.set(5 + x, 11 + y * 2, '#ffffff'); g.set(5 + x, 12 + y * 2, '#ffffff'); } }));
        if (k > 8) { const b = k % 8 < 2 ? 1 : 0; g.bits(HEART5, 9 - b * 0, 14 - b, { X: '#ff6ad0' }); }
      }
    },
    ace(g, f, F, ink, red) {
      const B = SUIT_FX.house(this.s); const lt = mix(red ? '#e0204a' : '#14183a', '#fbfbff', 0.75);
      const k = f % 40; const lineY = k < 24 ? 3 + k * 0.8 : 99;
      B.forEach((row, y) => row.forEach((c, x) => { if (c === '.') return; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const py = y * 2 + 3 + b; if (py > lineY) continue; g.set(x * 2 + a, py, c === 'X' ? ink : (k < 24 ? '#ffffff' : lt)); } }));
      if (k < 24) { for (let x = 0; x < 18; x++) g.set(x, Math.floor(lineY), (x + k) % 3 ? '#5a8aff' : null); if (k % 4 < 2) { g.set(17, Math.floor(lineY) - 1, '#14183a'); } }
    },
  });

  // ===================================================================== ROUND 3: Eyewitness + Sunrise
  Object.assign(SUIT_FX, {
    eye(s) { // a tiny eye opens in the middle of every suit
      const g = grid(BASE[s]); const y = s === '♥' ? 3 : 4;
      g[y][3] = 'c'; g[y][4] = 'o'; g[y][5] = 'c';
      return g;
    },
    sunrise(s) { // the suit stands on a gold horizon, with two small rays
      const g = pad(grid(BASE[s]), 1);
      for (let x = 0; x < 11; x++) g[10][x] = 'o';
      g[1][0] = 'o'; g[1][10] = 'o'; g[0][1] = 'o'; g[0][9] = 'o';
      return g;
    },
  });
  const EYE_BIG = [ // 18 x 9, lids open; X = lid line, w = white
    '......XXXXXX......',
    '...XXXwwwwwwXXX...',
    '.XXwwwwwwwwwwwwXX.',
    'XwwwwwwwwwwwwwwwwX',
    'XwwwwwwwwwwwwwwwwX',
    'XwwwwwwwwwwwwwwwwX',
    '.XXwwwwwwwwwwwwXX.',
    '...XXXwwwwwwXXX...',
    '......XXXXXX......',
  ];
  const SIL = { // little silhouettes of the secret scene events
    ghost: ['.XXX.', 'XXXXX', 'X.X.X', 'XXXXX', 'X.X.X'],
    ufo: ['..XX..', '.XXXX.', 'XXXXXX', '.X..X.'],
    whale: ['....X..', '.XXXXXX', 'XXXXXXX', '.XXXX..'],
    astro: ['.XX.', 'XXXX', '.XX.', 'X..X'],
  };
  SETS.push({
    id: 'eye', name: 'Eyewitness', rarity: 'secret', code: 'D1', round: 3,
    border: '#c084ff', frames: 96, fps: 12,
    backNote: 'A big eye opens slowly in a dark violet room. Little silhouettes of the secret scene events drift past one by one (the ghost, the UFO, the space whale, the astronaut) and the eye follows each one, its pupil narrowing as it locks on. Then a camera shutter snaps closed over the whole card and opens again.',
    face: { card: '#f4ecff', ink: '#2a1440', red: '#b0206a', edge: '#2a1440', shade: '#e0d0f8', ring: '#c084ff', accent: '#8a4ae0' },
    faceNote: '<b>Suits:</b> a tiny violet eye is set in the middle of each suit. <b>Ace:</b> the big suit has an eye in it that opens, looks around, narrows and blinks.',
    back(g, f, F) {
      g.each((u, v) => { const d = Math.hypot(u - 10.5, v - 16.5); return Math.floor(d - f * 0.25) % 5 === 0 ? '#2a1446' : (u + v) % 2 ? '#140a24' : '#180c2a'; });
      // the visitor of the moment
      const vis = [['ghost', '#d8d0f0'], ['ufo', '#5affb0'], ['whale', '#6a9ad8'], ['astro', '#f0f0f0']];
      const k = Math.floor(f / 20) % 4, t = (f % 20) / 20;
      let tx = 11, ty = 16;
      if (f < 80) {
        const [name, col] = vis[k]; const rows = SIL[name];
        const x = -6 + t * 30, y = k % 2 ? 4 + Math.sin(t * 6) : 28 - Math.sin(t * 5);
        g.bits(rows, x, y, { X: col });
        tx = x + 2; ty = y + 2;
      }
      // eye
      const open = f < 8 ? f / 8 : 1;
      const cy = 16.5; const ex = 2, ey = 12;
      const lidRow = (y) => Math.abs(y - 4) <= open * 4.5;
      EYE_BIG.forEach((r, y) => [...r].forEach((ch, x) => {
        if (ch === '.') return;
        if (!lidRow(y)) { if (Math.abs(y - 4) <= open * 4.5 + 1 && ch === 'X') g.set(ex + x, ey + y, '#c084ff'); return; }
        g.set(ex + x, ey + y, ch === 'X' ? '#c084ff' : '#f4ecff');
      }));
      if (open < 0.3) { for (let x = 0; x < 18; x++) g.set(ex + x, ey + 4, '#c084ff'); }
      else {
        const dx = Math.max(-5, Math.min(5, (tx - 11) * 0.35)), dy = Math.max(-1.5, Math.min(1.5, (ty - cy) * 0.12));
        const ix = 11 + dx, iy = cy + dy; const near = f < 80 && t > 0.3 && t < 0.7;
        g.each((u, v) => {
          const yy = v - ey; if (yy < 0 || yy > 8 || EYE_BIG[yy][u - ex] !== 'w' || !lidRow(yy)) return null;
          const d = Math.hypot(u + 0.5 - ix, v + 0.5 - iy);
          if (d < (near ? 1.2 : 2)) return '#0a0414';
          if (d < 3.4) return d < 2.6 ? '#5a2a8a' : '#a06aff';
          return null;
        });
        g.set(ix + 0.5, iy - 1.5, '#ffffff');
      }
      // camera shutter
      if (f >= 82 && f < 94) {
        const p = f < 88 ? (f - 82) / 6 : 1 - (f - 88) / 6; const R = 22 * (1 - p);
        g.each((u, v) => { const du = u + 0.5 - 11, dv = v + 0.5 - 17; const r = Math.hypot(du, dv); if (r < R) return null; const a = Math.atan2(dv, du) + r * 0.08; return Math.floor((a + Math.PI) / (TAU / 6)) % 2 ? '#2a1446' : '#3a1a5a'; });
        if (p > 0.95) g.each(() => '#3a1a5a');
      }
    },
    ace(g, f, F, ink, red) {
      g.bits(BASE[this.s], 0, 3, { X: ink }, 2);
      const k = f % 48; const cy = this.s === '♥' ? 10 : 11;
      const open = k < 4 ? k / 4 : k > 40 && k < 44 ? 0 : 1;
      const look = [0, 0, -2, -2, 0, 2, 2, 0][Math.floor(k / 6) % 8];
      const rows = ['..wwwww..', '.wwwwwww.', 'wwwwwwwww', '.wwwwwww.', '..wwwww..'];
      rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === 'w' && Math.abs(y - 2) <= open * 2.5) g.set(4.5 + x, cy - 2 + y, '#f4ecff'); }));
      if (open > 0.4) { const px = 9 + look, narrow = k >= 24 && k < 30; g.set(px - 1, cy, '#8a4ae0'); g.set(px + 1, cy, '#8a4ae0'); g.set(px, cy - 1, '#8a4ae0'); g.set(px, cy + 1, '#8a4ae0'); g.set(px, cy, narrow ? '#000000' : '#140a24'); if (!narrow) { g.set(px - 1, cy - 1, '#5a2a8a'); } }
      else for (let x = 5; x < 14; x++) g.set(x, cy, '#c084ff');
    },
  });

  SETS.push({
    id: 'sunrise', name: 'Sunrise', rarity: 'legendary', code: 'D2', round: 3,
    border: '#ffb040', frames: 108, fps: 12,
    backNote: 'Nine seconds from night to morning. Stars twinkle over a dark sea, the sky warms from violet to orange, and the sun climbs out of the water with its reflection shimmering below. At the top it throws out turning rays, birds cross, the stars are gone; then dusk falls quickly and the night starts again.',
    face: { card: '#fff4e0', ink: '#3a1a10', red: '#d84a1a', edge: '#5a2a1a', shade: '#f8e0c0', ring: '#ffb040', accent: '#e0801a' },
    faceNote: '<b>Suits:</b> each suit stands on a gold horizon with two little rays. <b>Ace:</b> the big suit rises out of the horizon like the sun, its rays turn behind it, and it sets again.',
    back(g, f, F) {
      const t = f / F; const day = t < 0.7 ? Math.min(1, t / 0.55) : Math.max(0, 1 - (t - 0.7) / 0.3);
      const sunY = 27 - day * 17; const H = 22;
      const sky = (v) => (v < 8 ? mix(mix('#140a24', '#2a1446', v / 8), '#ff9a5a', day * 0.75) : v < 15 ? mix('#3a1a4a', '#ffc070', day) : mix('#6a2a4a', '#ffe0a0', day));
      g.each((u, v) => {
        if (v > H) { const sh = Math.abs(u + 0.5 - 11) < (2 + (v - H) * 0.3) * day && (v + f) % 3 !== 0; return sh ? (day > 0.5 ? '#ffd75e' : '#c8603a') : (v + (u >> 2) + (f >> 2)) % 4 === 0 ? mix('#2a1a3a', '#c86a3a', day) : mix('#140a24', '#8a3a2a', day); }
        if (v === H) return '#ffd75e';
        return sky(v);
      });
      const r0 = rand(8); for (let i = 0; i < 20; i++) { const x = r0() * IW, y = r0() * 18; if (day < 0.6 && r0() > day * 1.4) g.set(x, y, (i + (f >> 2)) % 5 ? '#ffffff' : '#8a7aa8'); }
      if (day > 0.85) g.each((u, v) => { if (v >= H) return null; const a = Math.atan2(v + 0.5 - sunY, u + 0.5 - 11), r = Math.hypot(u + 0.5 - 11, v + 0.5 - sunY); return r > 7 && Math.sin(a * 8 + f * 0.15) > 0.75 ? '#fff0b0' : null; });
      g.disc(11, sunY, 5.8, (u, v, d) => (v >= H ? null : d < 3 ? '#fff6c0' : d < 4.6 ? '#ffd75e' : '#ff9a3a'));
      if (day > 0.9) for (let i = 0; i < 3; i++) { const bx = ((f * 0.5 + i * 9) % 30) - 4, by = 6 + i * 2 + Math.sin(f * 0.3 + i); g.set(bx, by, '#3a1a10'); g.set(bx + 1, by - ((f >> 1) % 2), '#3a1a10'); g.set(bx - 1, by - ((f >> 1) % 2), '#3a1a10'); }
    },
    ace(g, f, F, ink, red) {
      const k = f % 54; const rise = k < 14 ? k / 14 : k < 40 ? 1 : Math.max(0, 1 - (k - 40) / 14);
      const H = 20; const top = Math.round(H - rise * 18);
      if (rise > 0.95) g.each((x, y) => { if (y >= H) return null; const a = Math.atan2(y + 0.5 - 10, x + 0.5 - 9); return Math.sin(a * 6 + f * 0.25) > 0.6 && Math.hypot(x + 0.5 - 9, y + 0.5 - 10) > 6 ? '#ffd080' : null; });
      BASE[this.s].forEach((r, y) => [...r].forEach((c, x) => { if (c !== 'X') return; for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) { const py = top + y * 2 + b; if (py < H) g.set(x * 2 + a, py, ink); } }));
      for (let x = 0; x < 18; x++) g.set(x, H, '#e0801a');
      if (rise > 0.3) for (let x = 6; x < 12; x++) if ((x + (f >> 1)) % 3) g.set(x, H + 1, '#ffb040');
    },
  });

  // ===================================================================== legendary backs only
  SETS.push({
    id: 'inferno', name: 'Inferno', rarity: 'legendary', code: 'C1', backOnly: true, border: '#3a0a0a', frames: 60, fps: 12,
    backNote: 'Low flames lick the bottom, then build up and roar to the top of the card in a burst of embers before dying back down.',
    back(g, f, F) {
      const roar = Math.max(0, Math.sin((f / F) * TAU - 1)); const base = 10 + roar * 18;
      g.each((u, v) => {
        const d = IH - 1 - v; const h = base + 4 * Math.sin(u * 0.9 + f * 0.9) + 2.5 * Math.sin(u * 2.3 - f * 1.3) + 1.5 * Math.cos(u * 0.4 + f * 0.5);
        const t = d / h; if (t < 0.25) return '#fff6c0'; if (t < 0.5) return '#ffc030'; if (t < 0.75) return '#ff7a1a'; if (t < 1) return '#c0281a';
        return (u * 7 + v * 3) % 19 === 0 ? '#3a0a0a' : '#1a0606';
      });
      const r0 = rand(3); for (let i = 0; i < 12; i++) { const x = r0() * IW, sp = 0.6 + r0(), y = IH - ((f * sp * (1 + roar) + r0() * IH) % IH); if (y < IH - base) g.set(x + Math.sin(f * 0.3 + i), y, i % 3 ? '#ffc030' : '#ff7a1a'); }
    },
  });
  SETS.push({
    id: 'storm', name: 'Thunderstorm', rarity: 'legendary', code: 'C2', backOnly: true, border: '#8a9ab0', frames: 72, fps: 12,
    backNote: 'Rain slants across dark rolling clouds. A forked bolt strikes from top to bottom, the whole card flashes white, then a second smaller flicker, and the rain keeps going.',
    back(g, f, F) {
      const strike = f >= 30 && f < 40; const flash = f === 30 || f === 31 || f === 35;
      g.each((u, v) => {
        if (flash) return v < 8 ? '#e8ecf8' : '#c8d0e0';
        if (v < 9) { const n = Math.sin(u * 0.7 + f * 0.15) + Math.sin(u * 1.9 - f * 0.1 + v); return n > 0.6 ? '#4a5268' : n > -0.4 ? '#3a4054' : '#2a3040'; }
        if ((u * 2 + v - f * 3 + 900) % 9 === 0) return '#6a7a98';
        return v > 30 ? '#141820' : '#1a2030';
      });
      if (strike) {
        const bolt = [[12, 8], [11, 10], [11, 12], [10, 14], [12, 16], [11, 18], [9, 20], [10, 22], [9, 25], [8, 28], [8, 31], [7, 34]];
        const branch = [[10, 14], [7, 16], [6, 18], [4, 21]];
        const k = Math.min(bolt.length, (f - 30) * 4);
        for (let i = 0; i < k - 1; i++) { const [x0, y0] = bolt[i], [x1, y1] = bolt[i + 1]; for (let s = 0; s <= 4; s++) { const x = x0 + (x1 - x0) * s / 4, y = y0 + (y1 - y0) * s / 4; g.set(x, y, '#ffffff'); if (f < 34) { g.set(x - 1, y, '#fff27a'); g.set(x + 1, y, '#fff27a'); } } }
        if (k >= 5 && f < 36) for (let i = 0; i < branch.length - 1; i++) { const [x0, y0] = branch[i], [x1, y1] = branch[i + 1]; for (let s = 0; s <= 3; s++) g.set(x0 + (x1 - x0) * s / 3, y0 + (y1 - y0) * s / 3, '#fff27a'); }
      }
    },
  });
  const REEL_SYM = [{ rows: ['XXXXX', '...X.', '..X..', '.X...', '.X...'], c: '#d8323a' }, { rows: ['...G.', '..G.G', 'RRG.G', 'RR.RR', '...RR'], c: null }, { rows: ['XXXXX', '.....', 'XXXXX', '.....', 'XXXXX'], c: '#20202a' }, { rows: ['..X..', '.XXX.', '.XXX.', 'XXXXX', '..X..'], c: '#e0a020' }];
  SETS.push({
    id: 'slots', name: 'Jackpot', rarity: 'legendary', code: 'C3', backOnly: true, border: '#ffd75e', frames: 84, fps: 12,
    backNote: 'Three reels spin and stop one after another, left to right, landing on 7-7-7. The marquee lights chase, coins spray out, then the reels spin again.',
    back(g, f, F) {
      g.each((u, v) => (v < 6 ? ((u + (f >> 1)) % 4 === 0 ? '#ffffff' : '#c0102a') : v > 27 ? '#3a0a10' : '#5a0a14'));
      const stops = [30, 40, 50];
      for (let r = 0; r < 3; r++) {
        const x0 = 1 + r * 7; for (let v = 9; v < 25; v++) for (let u = x0; u < x0 + 6; u++) g.set(u, v, '#fbf6e6');
        const spinning = f < stops[r] || f > 76; const off = spinning ? (f * 3 + r * 5) % 28 : 0;
        for (let k = -1; k <= 2; k++) {
          const idx = spinning ? ((Math.floor(off / 7) + k) % 4 + 4) % 4 : (k === 0 ? 0 : (k + 4) % 4);
          const y = 14 + k * 7 - (spinning ? off % 7 : 0);
          const sy = REEL_SYM[idx]; sy.rows.forEach((row, yy) => [...row].forEach((c, xx) => { const py = y + yy; if (py < 9 || py >= 25 || c === '.') return; g.set(x0 + 0.5 + xx, py, sy.c || (c === 'G' ? '#3a9a3a' : '#d8323a')); }));
        }
      }
      for (let u = 0; u < IW; u++) { g.set(u, 8, '#ffd75e'); g.set(u, 25, '#ffd75e'); }
      if (f >= 50 && f < 76) {
        const k = f - 50; if (k % 4 < 2) for (let u = 0; u < IW; u++) { g.set(u, 16, '#ffd75e'); }
        const r0 = rand(11); for (let i = 0; i < 10; i++) { const vx = (r0() - 0.5) * 1.6, vy = -1 - r0() * 1.2; const x = 11 + vx * k, y = 26 + vy * k + 0.08 * k * k; g.set(x, y, '#ffd75e'); g.set(x + 1, y, '#b8860b'); }
      }
    },
  });
  SETS.push({
    id: 'starfield', name: 'Starfield', rarity: 'legendary', code: 'C4', backOnly: true, border: '#1a2a6a', frames: 72, fps: 12,
    backNote: 'Three layers of stars drift at different speeds. A shooting star crosses with a long fading tail, and later a slow comet glides through.',
    back(g, f, F) {
      g.each((u, v) => mix('#0a0e2a', '#02030a', v / IH));
      const r0 = rand(42);
      for (let i = 0; i < 40; i++) { const layer = i % 3, x0 = r0() * IW, y0 = r0() * IH; const y = (y0 + f * (0.15 + layer * 0.25)) % IH; g.set(x0, y, layer === 2 ? '#ffffff' : layer === 1 ? '#a8b0e0' : '#4a5490'); }
      if (f >= 10 && f < 24) { const k = f - 10; const hx = 22 - k * 2.2, hy = 2 + k * 1.3; for (let t = 0; t < 7; t++) g.set(hx + t * 1.6, hy - t * 0.95, t === 0 ? '#ffffff' : t < 3 ? '#fff6c0' : '#6a70a8'); }
      if (f >= 40) { const k = f - 40; const hx = -2 + k * 0.8, hy = 26 - k * 0.3; g.set(hx, hy, '#cfffff'); g.set(hx + 1, hy, '#8af2ff'); for (let t = 1; t < 6; t++) g.set(hx - t, hy + t * 0.35, t < 3 ? '#5ab0d0' : '#2a5a7a'); }
    },
  });

  // ======================================================================== game glue
  const doc = root.document;
  // set id -> cosmetic ids in js/cosmetics.js
  const IDS = {
    horizon: ['back_horizon', 'face_void'], eclipse: ['back_eclipse', 'face_eclipse'], bloodmoon: ['back_bloodmoon', 'face_bloodmoon'],
    heartbreak: ['back_heartbreak', 'face_heartbreak'], hitman: ['back_hitman', 'face_hitman'], kinghearts: ['back_kinghearts', 'face_kinghearts'],
    heaven: ['back_heaven', 'face_heaven'], silverwolf: ['back_silverwolf', 'face_silverwolf'], deadwood: ['back_deadwood', 'face_deadwood'],
    ghost: ['back_ghost', 'face_ghost'], platinum: ['back_platinum', 'face_platinum'], house: ['back_house', 'face_house'],
    eye: ['back_eye', 'face_eye'], sunrise: ['back_sunrise', 'face_sunrise'],
    inferno: ['back_inferno'], storm: ['back_storm'], slots: ['back_slots'], starfield: ['back_starfield'],
  };
  const BY_BACK = {}, BY_FACE = {};
  SETS.forEach((set) => { const [b, f] = IDS[set.id] || []; if (b) BY_BACK[b] = set; if (f && set.face) BY_FACE[f] = set; });
  const canDraw = !!(doc && doc.createElement('canvas').getContext);

  // ---- backs: a PNG sprite sheet, one 28 x 40 frame per step (cosmetics.css scales it to the card)
  const backCache = {};
  function back(id) {
    const set = BY_BACK[id]; if (!set || !canDraw) return null;
    if (backCache[id]) return backCache[id];
    const c = doc.createElement('canvas'); c.width = BW * set.frames; c.height = BH;
    const ctx = c.getContext('2d');
    for (let f = 0; f < set.frames; f++) {
      ctx.save(); ctx.translate(f * BW, 0);
      drawBackFrame(ctx, set.border, f, set.frames, set.back.bind(set));
      if (set.borderFx) set.borderFx(painter(ctx, BW, BH), f, set.frames);
      ctx.restore();
    }
    return (backCache[id] = { url: `url("${c.toDataURL('image/png')}")`, frames: set.frames, dur: +(set.frames / set.fps).toFixed(2) });
  }

  // ---- themed suits: same <svg class="px-suit"> shape as PixelSprites.suit, coloured with currentColor
  const suitCache = {};
  function suitFor(s, faceId) {
    const set = BY_FACE[faceId]; if (!set || !BASE[s]) return null;
    const key = faceId + s; if (suitCache[key]) return suitCache[key];
    const g = SUIT_FX[set.id](s); const red = s === '♥' || s === '♦';
    const hFill = set.facetMix ? `fill="currentColor" opacity="${1 - set.facetMix}"` : `fill="${set.face.extra || set.face.hole}"`;
    let r = '';
    g.forEach((row, y) => row.forEach((ch, x) => {
      if (ch === 'X') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="currentColor"/>`;
      else if (ch === 'o') r += `<rect x="${x}" y="${y}" width="1" height="1" fill="${set.face.accent}"/>`;
      else if (ch === 'h') r += `<rect x="${x}" y="${y}" width="1" height="1" ${hFill}/>`;
    }));
    void red;
    return (suitCache[key] = `<svg class="px-suit fx-suit" viewBox="0 0 ${g[0].length} ${g.length}" shape-rendering="crispEdges" aria-hidden="true">${r}</svg>`);
  }
  const PX = root.PixelSprites;
  const originalSuit = PX ? PX.suit : null;
  if (PX) {
    /** suit(s) uses the equipped face; suit(s, faceId) draws that face's suits (locker swatches). */
    PX.suit = function (s, faceId) {
      const face = faceId === undefined ? (doc && doc.documentElement.dataset.cosFace) : faceId;
      return suitFor(s, face) || originalSuit(s);
    };
  }

  // ---- aces: an 18 x 22 animated sprite sheet per suit, shown in place of the big pip
  const SUITS = { '♠': 's', '♥': 'h', '♦': 'd', '♣': 'c' };
  const aceDone = {};
  let aceStyle = null;
  function aceCss(faceId) {
    const set = BY_FACE[faceId]; if (!set || aceDone[faceId] || !canDraw) return '';
    aceDone[faceId] = true;
    let css = '';
    for (const s of Object.keys(SUITS)) {
      const red = s === '♥' || s === '♦'; const ink = red ? set.face.red : set.face.ink;
      const c = doc.createElement('canvas'); c.width = 18 * set.frames; c.height = 22;
      const ctx = c.getContext('2d'); const me = Object.create(set); me.s = s;
      for (let f = 0; f < set.frames; f++) set.ace.call(me, painter(ctx, 18, 22, f * 18, 0), f, set.frames, ink, red);
      const sel = (pre) => `${pre} .card[aria-label="A${s}"]`;
      const both = (suffix) => `${sel(`html[data-cos-face="${faceId}"]`)}${suffix}, ${sel(`.cos-sw-faces.cos-sw-faces[data-face="${faceId}"]`)}${suffix}`;
      css += `${both(' .pip')} { visibility: hidden; }
  ${both('::before')} { content: ""; background-image: url("${c.toDataURL('image/png')}"); background-size: ${set.frames * 100}% 100%; animation-duration: ${(set.frames / set.fps).toFixed(2)}s; animation-timing-function: steps(${set.frames}, jump-none); }\n`;
    }
    return css;
  }
  function addAce(faceId) {
    const css = aceCss(faceId); if (!css) return;
    if (!aceStyle) { aceStyle = doc.createElement('style'); aceStyle.id = 'cardfx-ace-style'; doc.head.appendChild(aceStyle); }
    aceStyle.textContent += css;
  }
  if (doc) {
    // the equipped face right away, the rest when the browser is idle (the locker and gallery show them all)
    const sync = () => addAce(doc.documentElement.dataset.cosFace);
    doc.addEventListener('cosmetics:change', sync);
    const later = root.requestIdleCallback ? (fn) => root.requestIdleCallback(fn, { timeout: 1000 }) : (fn) => setTimeout(fn, 400);
    const queue = Object.keys(BY_FACE);
    const step = () => { const id = queue.shift(); if (!id) return; addAce(id); later(step); };
    if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', () => { sync(); later(step); }); else { sync(); later(step); }
  }

  root.CardFX = {
    /** { url, frames, dur } for an animated back, or null if CardFX has no design for it. */
    back,
    /** Themed suit SVG for a face, or null. */
    suit: suitFor,
    hasFace: (id) => !!BY_FACE[id],
    hasBack: (id) => !!BY_BACK[id],
    /** How many faces still wait for their ace art (the share-gallery builder waits for 0). */
    pending: () => Object.keys(BY_FACE).filter((id) => !aceDone[id]).length,
  };
})(typeof window !== 'undefined' ? window : globalThis);
