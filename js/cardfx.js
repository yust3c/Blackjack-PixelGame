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


  // ======================================================================= INSANITY ROUND 2
  // Four sets for the skill runs promoted to Insanity: Still Water (Flawless), Halcyon (Perfect Day),
  // Ironclad (Iron Professor), Twenty-One (Twenty-One). Each has a long animated back, themed suits and an animated ace.
  const BORDER_RUN = (g, f, base, lit, every = 9, n = 2, speed = 1) => { // lights running around a card's 2px frame
    const per = []; for (let x = 1; x < BW - 1; x++) per.push([x, 1]); for (let y = 2; y < BH - 1; y++) per.push([BW - 2, y]); for (let x = BW - 3; x >= 1; x--) per.push([x, BH - 2]); for (let y = BH - 3; y >= 2; y--) per.push([1, y]);
    g.each((x, y) => (x >= 1 && y >= 1 && x < BW - 1 && y < BH - 1 && (x < IN || y < IN || x >= BW - IN || y >= BH - IN) ? base : null));
    per.forEach(([x, y], i) => { if ((i + f * speed) % every < n) g.set(x, y, lit); });
  };
  const DIG = { // 3 x 5 digits
    0: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], 1: ['.X.', 'XX.', '.X.', '.X.', 'XXX'], 2: ['XXX', '..X', 'XXX', 'X..', 'XXX'], 3: ['XXX', '..X', 'XXX', '..X', 'XXX'],
    4: ['X.X', 'X.X', 'XXX', '..X', '..X'], 5: ['XXX', 'X..', 'XXX', '..X', 'XXX'], 6: ['XXX', 'X..', 'XXX', 'X.X', 'XXX'], 7: ['XXX', '..X', '.X.', '.X.', '.X.'],
    8: ['XXX', 'X.X', 'XXX', 'X.X', 'XXX'], 9: ['XXX', 'X.X', 'XXX', '..X', 'XXX'],
  };

  Object.assign(SUIT_FX, {
    stillwater(s) { // a ripple line under the suit
      const g = pad(grid(BASE[s]), 1);
      for (let x = 1; x < 10; x++) if (x % 2) g[10][x] = 'o';
      return g;
    },
  });

  // ===== STILL WATER (Flawless) =================================================
  SETS.push({
    id: 'stillwater', name: 'Still Water', rarity: 'insanity', code: 'I1',
    border: '#bff4ff', frames: 96, fps: 12,
    backNote: 'A night lake, perfectly still, with the moon on it. One drop falls from the top of the card and lands without a splash. Three rings spread out across the whole card, the moon\'s reflection wobbles as they pass, and the water goes still again.',
    face: { card: '#eefcff', ink: '#0c2a32', red: '#c0306a', edge: '#0c2a32', shade: '#d8f2f8', ring: '#bff4ff', accent: '#3aa0b0' },
    faceNote: '<b>Suits:</b> a dotted ripple under each suit. <b>Ace:</b> a drop falls onto the big suit and rings spread out under it.',
    back(g, f, F) {
      const H = 13, dropX = 11, hitY = 23, hit = 22;
      const r0 = rand(5); const stars = Array.from({ length: 14 }, () => [Math.floor(r0() * IW), Math.floor(r0() * (H - 1)), r0()]);
      const rings = [0, 9, 18].map((d) => (f - hit - d) * 0.42).filter((R) => R > 0 && R < 26);
      g.each((u, v) => {
        if (v < H) return mix('#0a1830', '#163a4e', v / H);
        const du = u + 0.5 - dropX, dv = (v + 0.5 - hitY) / 0.38, r = Math.hypot(du, dv);
        for (const R of rings) if (Math.abs(r - R) < 0.7) return R < 10 ? '#bff4ff' : R < 18 ? '#6ad0e0' : '#2a7a8a';
        return v === H ? '#2a5a6a' : mix('#0e2c3a', '#06141c', (v - H) / (IH - H));
      });
      stars.forEach(([x, y, w], i) => g.set(x, y, (i + (f >> 2)) % 7 ? (w > 0.5 ? '#e8fcff' : '#6a8aa8') : '#163a4e'));
      g.disc(16, 5, 2.6, (x, y, d) => (d < 1.6 ? '#ffffff' : '#d8f4ff'));
      // the moon's reflection: a dashed column that wobbles while rings pass under it
      const wob = rings.some((R) => R > 3 && R < 14) ? 1 : 0;
      for (let v = H + 1; v < IH - 1; v += 1) { if ((v + (f >> 1)) % 3 === 0) continue; const sh = wob ? Math.round(Math.sin(v * 1.3 + f * 0.9) * 1.2) : 0; const w = v < H + 6 ? 2 : 1; for (let i = 0; i < w; i++) g.set(15 + i + sh, v, v < H + 5 ? '#d8f4ff' : '#6ad0e0'); }
      // the drop
      if (f < hit) { const y = (f / hit) * hitY; g.set(dropX - 0.5, y, '#ffffff'); g.set(dropX - 0.5, y - 1, '#bff4ff'); if (y > 2) g.set(dropX - 0.5, y - 2, '#3a7a9a'); }
      else if (f < hit + 3) { g.set(dropX - 0.5, hitY - 1, '#ffffff'); g.set(dropX - 1.5, hitY - 1, '#bff4ff'); g.set(dropX + 0.5, hitY - 1, '#bff4ff'); }
    },
    borderFx(g, f) { BORDER_RUN(g, f, '#bff4ff', '#ffffff', 24, 1, 1); },
    ace(g, f, F, ink) {
      const T = f % 48, cx = 9, cy = 20;
      const rings = [0, 8, 16].map((d) => (T - 10 - d) * 0.45).filter((R) => R > 0 && R < 13);
      g.each((x, y) => { if (y < 15) return null; const r = Math.hypot(x + 0.5 - cx, (y + 0.5 - cy) / 0.4); return rings.some((R) => Math.abs(r - R) < 0.6) ? '#6ad0e0' : null; });
      g.bits(BASE[this.s], 0, 2, { X: ink }, 2);
      if (T < 10) { const y = -2 + T * 0.5; g.set(cx - 0.5, y, '#3aa0b0'); g.set(cx - 0.5, y - 1, '#bff4ff'); }
      else if (T < 13) { g.set(cx - 1.5, 1, '#bff4ff'); g.set(cx + 0.5, 1, '#bff4ff'); }
    },
  });

  // ===== HALCYON (Perfect Day) ==================================================
  // One full day in ten seconds: dawn, the sun's arc, dusk, a starry night with the moon, dawn again.
  const SKY = [[0, '#ff9a7a', '#ffd0a0'], [0.12, '#5aa0ff', '#bfe0ff'], [0.42, '#4a8aff', '#a8d0ff'], [0.55, '#ff7a4a', '#ffc070'], [0.62, '#5a3a8a', '#ff8a6a'], [0.7, '#0a1030', '#1a2a5a'], [0.92, '#0a1030', '#1a2a5a'], [1, '#ff9a7a', '#ffd0a0']];
  const skyAt = (t) => { for (let i = 0; i < SKY.length - 1; i++) { const [a, ta, ba] = SKY[i], [b, tb, bb] = SKY[i + 1]; if (t <= b) { const k = (t - a) / (b - a); return [mix(ta, tb, k), mix(ba, bb, k)]; } } return [SKY[0][1], SKY[0][2]]; };
  SETS.push({
    id: 'halcyon', name: 'Halcyon', rarity: 'insanity', code: 'I2',
    border: '#ffd75e', frames: 120, fps: 12,
    backNote: 'A whole perfect day in ten seconds. Dawn turns the sky pink, the sun climbs its arc over the hills while small clouds drift by, the sky burns orange at dusk, then night falls with stars and a crescent moon crossing, and dawn comes back.',
    face: { card: '#fffaf2', ink: '#1a2a5a', red: '#e0502a', edge: '#1a2a5a', shade: '#f4e6cc', ring: '#ffb040', accent: '#ffb040' },
    faceNote: '<b>Suits:</b> sunset stripes cut across the lower half. <b>Ace:</b> the big suit is a window on the sky: the same day passes inside it as on the back, sun, dusk, stars and moon.',
    back(g, f, F) {
      const t = f / F; const [top, bot] = skyAt(t);
      const day = t < 0.58, night = t > 0.66 && t < 0.95;
      g.each((u, v) => mix(top, bot, v / IH));
      if (night || t > 0.62) { const r0 = rand(31); for (let i = 0; i < 22; i++) { const x = r0() * IW, y = r0() * 24; if ((i + (f >> 2)) % 5) g.set(x, y, i % 3 ? '#ffffff' : '#a8b0e0'); } }
      // sun on its arc
      if (t < 0.62) { const k = t / 0.62; const sx = -2 + k * 26, sy = 22 - Math.sin(k * Math.PI) * 17; g.disc(sx, sy, 3.2, (x, y, d) => (d < 2.2 ? '#fff6c0' : k < 0.12 || k > 0.85 ? '#ff7a3a' : '#ffd75e')); if (k > 0.15 && k < 0.85) for (let a = 0; a < 8; a++) { const ang = a * (TAU / 8) + f * 0.08; g.set(sx - 0.5 + Math.cos(ang) * 4.6, sy - 0.5 + Math.sin(ang) * 4.6, '#ffe9a0'); } }
      // moon
      if (t > 0.64) { const k = (t - 0.64) / 0.36; const mx = -2 + k * 26, my = 20 - Math.sin(k * Math.PI) * 14; g.disc(mx, my, 2.8, (x, y, d) => (Math.hypot(x + 0.5 - mx - 1.4, y + 0.5 - my + 0.6) < 2.4 ? null : '#f4f0d8')); }
      // clouds in the daytime
      if (day) [[3, 6, 0], [14, 11, 40]].forEach(([x0, y0, ph]) => { const x = ((x0 + (f + ph) * 0.25) % 30) - 5; [[0, 1], [1, 0], [2, 0], [3, 1], [1, 1], [2, 1], [4, 1]].forEach(([dx, dy]) => g.set(x + dx, y0 + dy, '#ffffff')); });
      // hills
      const hill = night ? ['#0e1a2a', '#0a1420'] : t > 0.55 ? ['#3a2a3a', '#2a1a2a'] : ['#3a8a4a', '#2a6a3a'];
      g.each((u, v) => { const h1 = 27 + Math.sin(u * 0.35) * 2, h2 = 30 + Math.sin(u * 0.6 + 2) * 1.5; return v >= h2 ? hill[1] : v >= h1 ? hill[0] : null; });
    },
    borderFx(g, f, F) { const t = f / F; BORDER_RUN(g, f, t > 0.64 && t < 0.95 ? '#4a5a9a' : '#ffd75e', '#ffffff', 12, 1, 1); },
    ace(g, f, F, ink) {
      const t = f / F, [top, bot] = skyAt(t), is = big(this.s), night = t > 0.66 && t < 0.95;
      const inside = (x, y) => is(x, y);
      for (let y = -1; y < 19; y++) for (let x = -1; x < 19; x++) {
        if (inside(x, y)) {
          const hill = y >= 13 + Math.round(Math.sin(x * 0.5) * 1.2);
          g.set(x, y + 2, hill ? (night ? '#0e1a2a' : t > 0.55 ? '#3a2a3a' : '#3a8a4a') : mix(top, bot, y / 18));
        } else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(x + dx, y + dy))) g.set(x, y + 2, ink);
      }
      const dot = (x, y, c) => { if (inside(Math.round(x), Math.round(y)) && !(y >= 13)) g.set(x, y + 2, c); };
      if (t < 0.62) { const k = t / 0.62, sx = 1 + k * 16, sy = 15 - Math.sin(k * Math.PI) * 12; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (a * a + b * b <= 5) dot(sx + a, sy + b, a * a + b * b <= 1 ? '#fff6c0' : k < 0.12 || k > 0.85 ? '#ff7a3a' : '#ffd75e'); }
      if (t > 0.62) { const r0 = rand(8); for (let i = 0; i < 12; i++) { const x = r0() * 18, y = r0() * 12; if ((i + (f >> 2)) % 4) dot(x, y, '#ffffff'); } }
      if (t > 0.66) { const k = (t - 0.66) / 0.34, mx = 1 + k * 16, my = 12 - Math.sin(k * Math.PI) * 9; for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) if (a * a + b * b <= 4 && (a + 1) * (a + 1) + (b + 1) * (b + 1) > 3) dot(mx + a, my + b, '#f4f0d8'); }
    },
  });


  // ----- round 2 options: Halcyon faces (Sky Window, Kingfisher), Iron Professor (The Forge, Top Marks), Twenty-One (Marquee, Golden Ace)
  const MINI = { // 5 x 5 suits
    '♠': ['..X..', '.XXX.', 'XXXXX', '..X..', '.XXX.'], '♥': ['XX.XX', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
    '♦': ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'], '♣': ['.XXX.', '.XXX.', 'XXXXX', 'XXXXX', '..X..'],
  };
  const LET = { H: ['X.X', 'X.X', 'XXX', 'X.X', 'X.X'], S: ['XXX', 'X..', 'XXX', '..X', 'XXX'], D: ['XX.', 'X.X', 'X.X', 'X.X', 'XX.'], P: ['XXX', 'X.X', 'XXX', 'X..', 'X..'], A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'], '+': ['...', '.X.', 'XXX', '.X.', '...'] };
  const big = (s) => { const g = grid(BASE[s]); return (x, y) => { const u = Math.floor(x / 2), v = Math.floor(y / 2); return !!(g[v] && g[v][u] === 'X'); }; }; // 18 x 18 suit test
  const putIf = (g, pts, ch) => pts.forEach(([x, y]) => { if (g[y] && g[y][x] === '.') g[y][x] = ch; });
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) >>> 0; h = ((h ^ (h >>> 13)) * 1274126177) >>> 0; return (h & 0xffff) / 65536; };

  Object.assign(SUIT_FX, {
    halcyon(s) { // sunset stripes cut across the lower half of the suit
      const g = grid(BASE[s]);
      [5, 7].forEach((y) => { const n = g[y].filter((c) => c === 'X').length; if (n >= 3) g[y] = g[y].map((c) => (c === 'X' ? 'c' : c)); });
      return g;
    },
    goldace(s) { // art deco corner fans
      const g = pad(grid(BASE[s]), 1);
      putIf(g, [[0, 0], [1, 0], [0, 1], [10, 10], [9, 10], [10, 9]], 'o');
      return g;
    },
  });

  // ===== GOLDEN ACE (Twenty-One) ==================================================
  SETS.push({
    id: 'goldace', name: 'Golden Ace', rarity: 'insanity', code: 'I4',
    border: '#d8a020', frames: 84, fps: 12,
    backNote: 'Black and gold, art deco. A big golden ace of spades over a dark sunburst; a sheen of light runs across the gold, then 21 gold stars light up around it one by one, and at the 21st they all flash and fade.',
    face: { card: '#fbf6e6', ink: '#14110a', red: '#a8142a', edge: '#14110a', shade: '#ece2c4', ring: '#d8a020', accent: '#d8a020' },
    faceNote: '<b>Suits:</b> small gold art deco corners. <b>Ace:</b> the big suit gets a gold outline and a sheen of light runs across it.',
    back(g, f, F) {
      const cx = 11, cy = 17;
      g.each((u, v) => { const a = Math.atan2(v + 0.5 - cy, u + 0.5 - cx); return Math.floor(((a + Math.PI) / TAU) * 16) % 2 ? '#15100a' : '#0c0a08'; });
      g.each((u, v) => ((u === 1 || u === IW - 2 || v === 1 || v === IH - 2) && u >= 1 && v >= 1 && u <= IW - 2 && v <= IH - 2 ? '#8a6a1a' : null));
      [[2, 2, 1, 1], [IW - 3, 2, -1, 1], [2, IH - 3, 1, -1], [IW - 3, IH - 3, -1, -1]].forEach(([x, y, dx, dy]) => { g.set(x, y, '#d8a020'); g.set(x + dx, y, '#8a6a1a'); g.set(x, y + dy, '#8a6a1a'); g.set(x + 2 * dx, y, '#5a420a'); g.set(x, y + 2 * dy, '#5a420a'); });
      const is = (x, y) => { const px = x + 0.5, py = y + 0.5; if (py < 0.5 || py > 19.5 || px < 0 || px > 18) return false; if (py <= 11 && Math.abs(px - 9) <= (py - 0.5) * 0.82) return true; if (Math.hypot(px - 5.2, py - 11) <= 4.2 || Math.hypot(px - 12.8, py - 11) <= 4.2) return true; if (py >= 11 && py <= 17 && Math.abs(px - 9) <= 0.9 + Math.max(0, py - 14) * 0.5) return true; return py > 17 && py <= 19.5 && Math.abs(px - 9) <= 3.5; };
      const ox = 2, oy = 7, sweep = (f % 42) * 1.4 - 8;
      for (let y = -1; y < 21; y++) for (let x = -1; x < 19; x++) {
        if (is(x, y)) { const d = x + y - sweep; g.set(ox + x, oy + y, Math.abs(d) < 1.2 ? '#ffffff' : Math.abs(d) < 2.4 ? '#fff6c0' : y < 6 ? '#fff0a0' : y < 12 ? '#ffd75e' : '#c8961a'); }
        else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => is(x + dx, y + dy))) g.set(ox + x, oy + y, '#5a420a');
      }
      g.bits(LET.A, 3, 3, { X: '#ffd75e' }); g.bits(LET.A, IW - 6, IH - 8, { X: '#ffd75e' });
      // 21 stars around the ace
      const n = Math.min(21, Math.floor(f / 3)), party = f >= 63;
      for (let i = 0; i < 21; i++) {
        const a = -Math.PI / 2 + (i / 21) * TAU, x = cx - 0.5 + Math.cos(a) * 9.6, y = cy - 0.5 + Math.sin(a) * 14.2;
        if (i < n) { const c = party ? (f % 4 < 2 ? '#ffffff' : '#ffd75e') : i === n - 1 ? '#ffffff' : '#ffd75e'; g.set(x, y, c); if (i === n - 1 || (party && f < 72)) { g.set(x - 1, y, '#b8860b'); g.set(x + 1, y, '#b8860b'); g.set(x, y - 1, '#b8860b'); g.set(x, y + 1, '#b8860b'); } }
        else g.set(x, y, '#3a2a0a');
      }
    },
    borderFx(g, f) { BORDER_RUN(g, f, '#d8a020', '#fff6c0', 21, 2, 1); },
    ace(g, f, F, ink) {
      const is = big(this.s), sweep = (f % 42) * 1.3 - 6;
      for (let y = -1; y < 19; y++) for (let x = -1; x < 19; x++) {
        if (is(x, y)) { const d = x + y - sweep; g.set(x, y + 2, Math.abs(d) < 1 ? '#fff6c0' : Math.abs(d) < 2 ? mix(ink, '#ffd75e', 0.5) : ink); }
        else if ([[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => is(x + dx, y + dy))) g.set(x, y + 2, '#d8a020');
      }
      if (f % 42 > 30) { const k = f % 42 - 30; g.set(16, 1, k % 4 < 2 ? '#ffd75e' : '#fff6c0'); if (k % 4 < 2) { g.set(15, 1, '#d8a020'); g.set(17, 1, '#d8a020'); g.set(16, 0, '#d8a020'); } }
    },
  });

  // ===== Iron Professor, round 3 options: Night Owl, Laurel, Iron Knight =========
  Object.assign(SUIT_FX, {
    owl(s) { // two little iron ear tufts above the suit
      const g = pad(grid(BASE[s]), 1);
      putIf(g, [[2, 0], [8, 0]], 'o');
      return g;
    },
    laurel(s) { // laurel sprigs at both lower corners
      const g = pad(grid(BASE[s]), 1);
      putIf(g, [[0, 8], [1, 9], [0, 7], [10, 8], [9, 9], [10, 7]], 'o');
      return g;
    },
  });

  // ===== NIGHT OWL ===============================================================
  SETS.push({
    id: 'owl', name: 'Iron Owl', rarity: 'insanity', code: 'I3',
    border: '#8a909c', frames: 96, fps: 12,
    backNote: 'The Iron Professor: a riveted clockwork owl sits on a stack of books under the moon, its amber lamp eyes in brass rims. Its iron shutters blink, it looks left and right, turns its head and winks, while the wind-up key in its side turns and a firefly drifts by.',
    face: { card: '#f8f2e4', ink: '#22252c', red: '#a8302a', edge: '#22252c', shade: '#e8dcc4', ring: '#8a909c', accent: '#5a606c' },
    faceNote: '<b>Suits:</b> two little iron ear tufts. <b>Ace:</b> two amber lamp eyes in brass rims switch on inside the big suit, look around and blink their iron shutters.',
    back(g, f, F) {
      g.each((u, v) => mix('#0e1630', '#24305a', v / IH));
      const r0 = rand(44); for (let i = 0; i < 16; i++) { const x = r0() * IW, y = r0() * 20; if ((i + (f >> 3)) % 6) g.set(x, y, i % 3 ? '#ffffff' : '#a8b0e0'); }
      g.disc(17, 5, 3.6, (x, y, d) => (Math.hypot(x + 0.5 - 15.6, y + 0.5 - 4.4) < 2.6 ? null : '#f4f0d8'));
      // books
      [[26, 2, 19, '#8a2a2a'], [29, 3, 18, '#2a4a8a'], [31, 1, 20, '#2a6a3a']].forEach(([y0, x0, x1, c], i) => {
        const h = i === 2 ? 3 : i === 1 ? 2 : 3;
        for (let v = y0; v < y0 + h; v++) for (let u = x0; u <= x1; u++) g.set(u, v, u === x1 ? '#f4ecd8' : v === y0 ? mix(c, '#ffffff', 0.18) : c);
        g.set(x0 + 2, y0 + 1, '#d8a020'); g.set(x1 - 3, y0 + 1, '#d8a020');
      });
      // owl
      const turn = f >= 40 && f < 52 ? 1 : f >= 52 && f < 60 ? -1 : 0;
      const look = f >= 20 && f < 30 ? -1 : f >= 30 && f < 38 ? 1 : turn;
      const blink = f === 12 || f === 13 || f === 74 || f === 75, wink = f >= 84 && f < 90;
      const cx = 11, hx = cx + turn;
      g.each((u, v) => { // body
        const du = (u + 0.5 - cx) / 6.2, dv = (v + 0.5 - 20) / 6;
        if (du * du + dv * dv > 1 || v > 25) return null;
        const bu = (u + 0.5 - cx) / 4, bv = (v + 0.5 - 21) / 4.2;
        if (bu * bu + bv * bv <= 1) return v % 3 === 0 ? '#6a707c' : (v % 3 === 1 && (u % 3 === 1)) ? '#e8eaee' : '#b8bec8'; // riveted chest plates
        return Math.abs(u + 0.5 - cx) > 4.5 ? '#4a4e58' : (u + v) % 5 === 0 ? '#6a707c' : '#8a909c';
      });
      g.each((u, v) => { // head
        const du = (u + 0.5 - hx) / 6, dv = (v + 0.5 - 12.5) / 4.6;
        return du * du + dv * dv <= 1 ? (dv > 0.6 ? '#6a707c' : v === 9 && (u + turn) % 2 === 0 ? '#c8ced8' : '#8a909c') : null;
      });
      [[-4, -1], [4, 1]].forEach(([dx, s]) => { g.set(hx + dx, 7, '#4a4e58'); g.set(hx + dx + s, 6, '#4a4e58'); g.set(hx + dx, 8, '#4a4e58'); g.set(hx + dx + s, 7, '#4a4e58'); });
      [-2.5, 2.5].forEach((dx, i) => {
        const ex = hx + dx, closed = blink || (wink && i === 1);
        g.disc(ex, 12.5, 2.9, (x, y, d) => (d > 2.1 ? '#c8a040' : closed ? '#5a606c' : d < 1.2 ? '#fff6c0' : d < 1.8 ? '#ffd040' : '#e8a020'));
        if (closed) for (let a = -1; a <= 1; a++) g.set(ex - 0.5 + a, 12, '#2a2e36');
        else { g.set(ex - 0.5 + look, 12, '#5a2a0a'); g.set(ex - 0.5 + look, 13, '#5a2a0a'); }
      });
      g.set(hx - 0.5, 12, '#c8a040'); // brass bridge
      g.set(hx - 0.5, 15, '#c8a040'); g.set(hx - 0.5, 16, '#8a6a1a');
      [9, 10, 12, 13].forEach((u) => g.set(u, 25, '#c8a040'));
      // wind-up key turning in its side
      const kf = Math.floor(f / 3) % 4; g.set(17, 20, '#c8a040'); g.set(18, 20, '#c8a040');
      (kf === 0 ? [[19, 18], [19, 19], [19, 21], [19, 22]] : kf === 1 ? [[19, 19], [20, 18], [19, 21], [20, 22]] : kf === 2 ? [[19, 20], [20, 20], [19, 19], [19, 21]] : [[19, 19], [20, 22], [19, 21], [20, 18]]).forEach(([x, y]) => g.set(x, y, '#d8b040'));
      // firefly
      const fx = 3 + ((f * 0.25) % 20), fy = 19 + Math.sin(f * 0.3) * 3; if (f % 6 < 4) { g.set(fx, fy, '#d8ff6a'); g.set(fx, fy + 1, '#5a8a2a'); }
    },
    borderFx(g, f) { BORDER_RUN(g, f, '#8a909c', '#ffd040', 24, 1, 1); },
    ace(g, f, F, ink) {
      g.bits(BASE[this.s], 0, 3, { X: ink }, 2);
      const T = f % 48, open = T > 4, half = T === 4 || T === 5 || T === 30;
      const look = T >= 14 && T < 22 ? -1 : T >= 22 && T < 30 ? 1 : 0;
      const ey = this.s === '♥' ? 9 : this.s === '♣' ? 13 : 11;
      [5.5, 12.5].forEach((ex) => {
        g.disc(ex, ey, 2.9, (x, y, d) => (d > 2.1 ? '#c8a040' : !open ? '#5a606c' : d < 1.2 ? '#fff6c0' : d < 1.8 ? '#ffd040' : '#e8a020'));
        if (open && !half) g.set(ex - 0.5 + look, ey - 0.5, '#5a2a0a');
        if (half || !open) for (let a = -1; a <= 1; a++) g.set(ex - 0.5 + a, ey - 0.5, '#2a2e36');
      });
      g.set(8.5, ey - 0.5, '#c8a040');
    },
  });

  // ===== LAUREL ==================================================================
  SETS.push({
    id: 'laurel', name: 'Laurel', rarity: 'secret', code: 'S1',
    border: '#8aa030', frames: 96, fps: 12,
    backNote: 'White marble with grey veins and a gold medallion. A green-gold laurel wreath grows around it one leaf at a time; when it closes, a red ribbon ties it, a sheen runs across, and it starts again.',
    face: { card: '#f6f5f0', ink: '#1e1c1a', red: '#a8202a', edge: '#1e1c1a', shade: '#e2e0d8', ring: '#8aa030', accent: '#7a9a28' },
    faceNote: '<b>Suits:</b> small laurel sprigs at the lower corners. <b>Ace:</b> a laurel wreath grows up around the big suit, leaf by leaf, and shines.',
    back(g, f, F) {
      g.each((u, v) => { const w = Math.abs(Math.sin(u * 0.32 + v * 0.17 + Math.sin(v * 0.28) * 2.2)), w2 = Math.abs(Math.sin(u * 0.21 - v * 0.31 + 1.7)); return w < 0.07 ? '#b8b4ac' : w2 < 0.05 ? '#d0ccc4' : hash(u, v) > 0.85 ? '#e4e2dc' : '#eeede8'; });
      const cx = 11.5, cy = 15.5, sweep = f >= 70 ? (f - 70) * 1.6 - 6 : -99;
      g.disc(cx, cy, 6.6, (x, y, d) => { if (d > 5.7) return '#8a6a1a'; if (d > 4.9) return '#ffe080'; const s = Math.abs(x + y - cx - cy - sweep + 10) < 1.5; return s ? '#ffffff' : y < cy - 1 ? '#ffd75e' : '#d8a020'; });
      g.bits(BASE['♠'], 7, 11, (ch, x, y) => (ch === 'X' ? (y < 4 ? '#8a6a1a' : '#6a4a0a') : null));
      const leaves = 30, n = Math.min(leaves, Math.floor(f / 2.1));
      for (let i = 0; i < leaves; i++) {
        if (i >= n) break;
        const side = i % 2 ? 1 : -1, k = Math.floor(i / 2) / (leaves / 2 - 1), a = Math.PI / 2 + side * (0.25 + k * 2.55);
        const x = cx - 0.5 + Math.cos(a) * 9.2, y = cy - 0.5 + Math.sin(a) * 12;
        const lit = sweep > -99 && Math.abs(x + y - cx - cy - sweep + 10) < 2;
        const tx = -Math.sin(a) * side, ty = Math.cos(a) * side; // along the wreath, towards its tip
        g.set(x - Math.cos(a), y - Math.sin(a), '#4a6a1a');
        g.set(x, y, lit ? '#ffffff' : '#9ab030'); g.set(x + tx, y + ty, lit ? '#fff6c0' : '#d8d870'); g.set(x + Math.cos(a), y + Math.sin(a), lit ? '#fff6c0' : '#6a8a20');
      }
      if (n >= leaves) { [[10, 28], [11, 28], [12, 28], [9, 29], [13, 29], [8, 30], [14, 30]].forEach(([x, y]) => g.set(x, y, '#a8202a')); g.set(11, 29, '#d83040'); }
      if (f >= 80) { const r1 = rand(f); for (let i = 0; i < 3; i++) g.set(2 + r1() * 18, 2 + r1() * 28, '#fff6c0'); }
    },
    borderFx(g, f) { BORDER_RUN(g, f, '#8aa030', '#fff6c0', 26, 1, 1); },
    ace(g, f, F, ink) {
      g.bits(BASE[this.s], 0, 2, { X: ink }, 2);
      const T = f % 48, leaves = 14, n = Math.min(leaves, Math.floor(T / 2));
      for (let i = 0; i < n; i++) {
        const side = i % 2 ? 1 : -1, k = Math.floor(i / 2) / (leaves / 2 - 1), a = Math.PI / 2 + side * (0.35 + k * 1.6);
        const x = 9 - 0.5 + Math.cos(a) * 9.4, y = 12 - 0.5 + Math.sin(a) * 10.2;
        const shine = T > 30 && Math.abs(i - (T - 30)) < 1.5;
        g.set(x, y, shine ? '#fff6c0' : '#7a9a28'); g.set(x + side * Math.sin(a), y - Math.cos(a) * side, shine ? '#ffffff' : '#b8c850');
      }
    },
  });

  Object.assign(SUIT_FX, {
    marquee(s) { // eight bulbs around the suit
      const g = pad(grid(BASE[s]), 1);
      putIf(g, [[0, 0], [5, 0], [10, 0], [0, 5], [10, 5], [0, 10], [5, 10], [10, 10]], 'o');
      return g;
    },
  });

  // ===== MARQUEE (Hat Trick, Legendary) ============================================
  SETS.push({
    id: 'marquee', name: 'Marquee', rarity: 'legendary', code: 'L1',
    border: '#ffd75e', frames: 84, fps: 12,
    backNote: 'An old Vegas sign at night. The bulbs around it chase, the pink neon 21 buzzes and flickers on, the four suits light up one after another in their own neon colours, and at the end the whole sign flashes and changes colour before it starts again.',
    face: { card: '#fff8ee', ink: '#1e0a2e', red: '#e0204a', edge: '#1e0a2e', shade: '#f2e2d0', ring: '#ff4fa8', accent: '#ffb020' },
    faceNote: '<b>Suits:</b> eight little bulbs around each suit. <b>Ace:</b> the big suit sits inside a frame of chasing bulbs and buzzes like neon.',
    back(g, f, F) {
      const party = f >= 60, NEON = ['#ff4fa8', '#ffd75e', '#4ff0ff'];
      const neon = party ? NEON[Math.floor((f - 60) / 4) % 3] : NEON[0];
      g.each((u, v) => mix('#1a0a2e', '#3a0a2a', v / IH));
      const r0 = rand(12); for (let i = 0; i < 10; i++) { const x = r0() * IW, y = 22 + r0() * 10; if ((i + (f >> 2)) % 4) g.set(x, y, '#8a7aa8'); }
      [4, 17].forEach((x) => { for (let v = 21; v < IH; v++) g.set(x, v, '#3a2a3a'); });
      // sign board
      for (let v = 1; v <= 20; v++) for (let u = 1; u <= 20; u++) g.set(u, v, '#2a0a1e');
      const per = []; for (let u = 1; u <= 20; u += 2) per.push([u, 1]); for (let v = 3; v <= 20; v += 2) per.push([20, v]); for (let u = 18; u >= 1; u -= 2) per.push([u, 20]); for (let v = 18; v >= 3; v -= 2) per.push([1, v]);
      per.forEach(([u, v], i) => g.set(u, v, party ? (f % 4 < 2 ? '#fff6c0' : '#8a5a1a') : (i + Math.floor(f / 2)) % 4 < 2 ? '#fff6c0' : '#8a5a1a'));
      // the 21, flickering on
      const on2 = f >= 9 || f === 2 || f === 3 || f === 6, on1 = f >= 14 || f === 11 || f === 12;
      const buzz = !party && f > 20 && f % 23 === 0;
      const lit = []; const put = (d, x0, on) => DIG[d].forEach((r, y) => [...r].forEach((c, x) => { if (c === 'X') for (let a = 0; a < 2; a++) for (let b = 0; b < 2; b++) lit.push([x0 + x * 2 + a, 6 + y * 2 + b, on]); }));
      put(2, 4, on2 && !buzz); put(1, 12, on1);
      const isLit = new Set(lit.filter((p) => p[2]).map(([x, y]) => x + ',' + y));
      g.each((u, v) => { if (u < 2 || u > 19 || v < 2 || v > 19 || isLit.has(u + ',' + v)) return null; return [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => isLit.has(u + dx + ',' + (v + dy))) ? mix(neon, '#2a0a1e', 0.65) : null; });
      lit.forEach(([x, y, on]) => g.set(x, y, on ? (y % 2 ? neon : mix(neon, '#ffffff', 0.4)) : '#4a1a3a'));
      // four neon suits
      const COL = { '♠': '#4ff0ff', '♥': '#ff4f7a', '♦': '#ffd75e', '♣': '#6aff9a' };
      const step = Math.floor(f / 6) % 5;
      ['♠', '♥', '♦', '♣'].forEach((s, i) => { const on = party ? f % 4 < 2 : step === i || step === 4; g.bits(MINI[s], 0 + i * 6 - (i > 1 ? 1 : 0) + 1, 25, { X: on ? COL[s] : mix(COL[s], '#2a0a2a', 0.72) }); });
    },
    borderFx(g, f) { BORDER_RUN(g, f, f >= 60 ? '#ff4fa8' : '#ffd75e', '#ffffff', 4, 1, 1); },
    ace(g, f, F, ink) {
      const per = []; for (let x = 0; x < 18; x += 2) per.push([x, 0]); for (let y = 2; y < 22; y += 2) per.push([17, y]); for (let x = 15; x >= 0; x -= 2) per.push([x, 21]); for (let y = 19; y >= 2; y -= 2) per.push([0, y]);
      per.forEach(([x, y], i) => g.set(x, y, (i + Math.floor(f / 2)) % 4 < 2 ? '#ffb020' : '#e8d8c0'));
      const off = f % 42 === 30 || f % 42 === 32;
      g.bits(BASE[this.s], 0, 2, { X: off ? mix(ink, '#fff8ee', 0.6) : ink }, 2);
    },
  });


  // ===== DRAGON'S HOARD (secret: Insane Win) ====================================
  // A green dragon with crimson wings sleeps on a mountain of gold. It wakes, rears up, spreads its wings,
  // breathes a rainbow of fire into the sky and sends coins flying, then curls up and sleeps again.
  const HUE = (h, s = 1, l = 0.55) => { // hsl -> hex, h in turns
    h = ((h % 1) + 1) % 1; const a = s * Math.min(l, 1 - l); const f = (n) => { const k = (n + h * 12) % 12; const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
    return '#' + f(0) + f(8) + f(4);
  };
  Object.assign(SUIT_FX, {
    dragon(s) { // a little stack of gold coins at the lower right corner
      const g = pad(grid(BASE[s]), 1);
      putIf(g, [[9, 9], [10, 9], [9, 10], [10, 10], [10, 8]], 'o');
      return g;
    },
  });
  const DRG = { g: '#2a9a50', l: '#5fd078', d: '#1a6a38', o: '#0a1e12', bl: '#f0e0a8', bd: '#c8b070', horn: '#f4ecd0', eye: '#ffd040', wm: '#b83a3a', wd: '#7a1a24', claw: '#f4f0e0' };
  const lerp = (a, b, k) => a + (b - a) * k;
  const ease = (k) => (k <= 0 ? 0 : k >= 1 ? 1 : k * k * (3 - 2 * k));
  function goldPile(g, f, top) { // the hoard: coins, a few bars and gems, sparkling
    g.each((u, v) => {
      const t = top(u); if (v < t) return null;
      const h = hash(u, v);
      if (v === Math.round(t)) return h > 0.5 ? '#fff0a0' : '#ffd75e';
      if ((u * 3 + v * 5) % 7 === 0) return '#b8860b';
      if (h > 0.93) return ['#d8323a', '#4f9cff', '#5fd068'][Math.floor(h * 300) % 3];
      return h > 0.6 ? '#ffd75e' : h > 0.3 ? '#e8b030' : '#c89020';
    });
    const r0 = rand(31); for (let i = 0; i < 6; i++) { const x = Math.floor(r0() * IW), y = Math.ceil(top(x)) + Math.floor(r0() * 6), ph = Math.floor(r0() * 24); const k = (f + ph) % 24; if (k < 3) { g.set(x, y, '#ffffff'); if (k === 1) { g.set(x - 1, y, '#fff6c0'); g.set(x + 1, y, '#fff6c0'); g.set(x, y - 1, '#fff6c0'); g.set(x, y + 1, '#fff6c0'); } } }
  }
  function dragonSprite(f) { // returns a map "x,y" -> colour, drawn in card-inner coordinates
    const M = new Map(); const put = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < IW && y < IH) M.set(x + ',' + y, c); };
    const fill = (test, col) => { for (let y = 0; y < IH; y++) for (let x = 0; x < IW; x++) if (test(x + 0.5, y + 0.5)) put(x, y, typeof col === 'function' ? col(x, y) : col); };
    // timeline
    const wake = ease((f - 30) / 12) * (1 - ease((f - 84) / 10));
    const wing = ease((f - 38) / 8) * (1 - ease((f - 80) / 8));
    const breathe = f < 30 || f > 88 ? Math.round((Math.sin(f * 0.4) + 1) / 2) : 0;
    // wings (behind the body): shoulder at (14, 13)
    const tipA = [lerp(19, 23, wing), lerp(9, -1, wing)], tipB = [lerp(20, 23, wing), lerp(15, 8, wing)], tipC = [lerp(17, 19, wing), lerp(19, 17, wing)];
    fill((x, y) => inPoly([[14, 13], tipA, tipB, tipC], x, y), (x, y) => (y > lerp(14, 8, wing) + (x - 14) * 0.3 ? DRG.wd : DRG.wm));
    [tipA, tipB].forEach(([tx, ty]) => { for (let i = 0; i <= 10; i++) put(lerp(14, tx, i / 10), lerp(13, ty, i / 10), DRG.o); });
    // haunch and chest
    fill((x, y) => ((x - 14) / 5.2) ** 2 + ((y - 21) / 4.2) ** 2 <= 1, DRG.g);
    fill((x, y) => ((x - 10.5) / 3.6) ** 2 + ((y - 16.5 + breathe * 0.5) / 5.2) ** 2 <= 1, DRG.g);
    fill((x, y) => ((x - 9.6) / 2) ** 2 + ((y - 17) / 4.4) ** 2 <= 1, (x, y) => (y % 2 ? DRG.bd : DRG.bl)); // belly plates
    // foreleg with claws
    for (let y = 19; y <= 24; y++) { put(7, y, DRG.d); put(8, y, DRG.g); }
    put(6, 25, DRG.claw); put(8, 25, DRG.claw);
    // tail curling round the front of the pile
    [[18, 23], [19, 24], [20, 25], [20, 26], [19, 27], [18, 28], [16, 28], [15, 28], [13, 28]].forEach(([x, y], i) => { put(x, y, DRG.g); if (i < 6) put(x - 1, y, DRG.g); });
    put(12, 27, DRG.d); put(12, 28, DRG.d); put(11, 28, DRG.d); put(12, 29, DRG.d); // spade tip
    // neck and head: asleep the head rests on the gold at the left, awake it rears up high
    const hx = lerp(0, 3, wake), hy = lerp(20, 6, wake);
    const nb = [hx + 6, hy + 3], ns = [10, 13];
    for (let i = 0; i <= 12; i++) { const x = lerp(ns[0], nb[0], i / 12), y = lerp(ns[1], nb[1], i / 12); for (let a = -1; a <= 1; a++) put(x + a, y, a < 0 ? DRG.l : DRG.g); }
    const open = f >= 34 && f < 86, blink = f === 60 || f === 61;
    const HEAD = ['.....h.h.', '...lgggg.', '.ggggggeg', 'kggggggg.', '.ttdddd..'];
    HEAD.forEach((row, y) => [...row].forEach((c, x) => {
      const col = c === 'h' ? DRG.horn : c === 'l' ? DRG.l : c === 'g' ? DRG.g : c === 'd' ? DRG.d : c === 't' ? DRG.claw : c === 'k' ? DRG.o : c === 'e' ? (open && !blink ? DRG.eye : DRG.d) : null;
      if (col) put(hx + x, hy + y, col);
    }));
    if (f >= 48 && f < 76) put(hx + 1, hy + 4, '#3a0a0a'); // jaw open
    // outline
    const out = new Map();
    M.forEach((c, k) => out.set(k, c));
    M.forEach((c, k) => { const [x, y] = k.split(',').map(Number); [[1, 0], [-1, 0], [0, 1], [0, -1]].forEach(([dx, dy]) => { const kk = (x + dx) + ',' + (y + dy); if (!M.has(kk) && x + dx >= 0 && y + dy >= 0 && x + dx < IW && y + dy < IH) out.set(kk, DRG.o); }); });
    M.forEach((c, k) => out.set(k, c));
    return { map: out, hx, hy, wake };
  }
  SETS.push({
    id: 'dragon', name: 'Dragon’s Hoard', rarity: 'secret', code: 'S2',
    border: '#d8a020', frames: 96, fps: 12,
    backNote: 'A green dragon with crimson wings sleeps on a mountain of gold, smoke curling from its nose. It opens its eyes, rears up, spreads its wings and breathes a rainbow of fire into the sky, sending coins flying, then curls up on its hoard again.',
    face: { card: '#fbf6e6', ink: '#0e2a1a', red: '#b8202a', edge: '#0e2a1a', shade: '#ece2c4', ring: '#d8a020', accent: '#d8a020' },
    faceNote: '<b>Suits:</b> a little stack of gold coins at the corner. <b>Ace:</b> a dragon eye inside the big suit opens, looks around and narrows.',
    back(g, f) {
      g.each((u, v) => mix('#120c0a', '#3a2410', Math.max(0, (v - 8) / (IH - 8))));
      const top = (u) => 24.5 + Math.abs(u + 0.5 - 12) * 0.28 + Math.sin(u * 1.3) * 0.5;
      const r0 = rand(41); for (let i = 0; i < 8; i++) g.set(r0() * IW, r0() * 14, '#3a2a1a');
      const D = dragonSprite(f);
      goldPile(g, f, top);
      D.map.forEach((c, k) => { const [x, y] = k.split(',').map(Number); g.set(x, y, c); });
      // smoke while asleep
      if (D.wake < 0.05) { const k = f % 20; if (k < 12) { g.set(D.hx - 1 - k * 0.2, D.hy + 2 - k * 0.6, k < 6 ? '#8a8a94' : '#4a4a54'); } }
      // rainbow fire into the sky
      if (f >= 48 && f < 76) {
        const k = f - 48, len = Math.min(12, k * 2) - Math.max(0, (k - 22) * 2), mx = D.hx, my = D.hy + 2;
        for (let i = 0; i < len * 4; i++) { const t = i / 4, w = 0.5 + t * 0.4, x = mx - t * 0.25 + Math.sin(i * 2.1 + f * 1.3) * w, y = my - t + Math.cos(i * 1.7 + f) * 0.3; const c = HUE(t / 12 + f * 0.04, 1, i % 5 === 0 ? 0.8 : 0.58); g.set(x, y, c); g.set(x + 1, y, c); }
      }
      // coins bursting out of the hoard
      if (f >= 52 && f < 92) { const k = f - 52; const r1 = rand(19); for (let i = 0; i < 14; i++) { const t0 = Math.floor(r1() * 10), age = k - t0; if (age < 0) continue; const vx = (r1() - 0.5) * 1.4, vy = -0.9 - r1() * 0.8, x = 6 + r1() * 12 + vx * age, y = 25 + vy * age + 0.07 * age * age; if (y < top(Math.round(x)) + 1 || age < 4) { g.set(x, y, age % 4 < 2 ? '#ffd75e' : '#fff0a0'); g.set(x + 1, y, '#b8860b'); } } }
    },
    borderFx(g, f) { BORDER_RUN(g, f, f >= 48 && f < 76 ? HUE(f / 20, 1, 0.55) : '#d8a020', '#fff6c0', 12, 1, 1); },
    ace(g, f, F, ink) {
      g.bits(BASE[this.s], 0, 2, { X: ink }, 2);
      const T = f % 48, cx = 9, cy = this.s === '♥' ? 9 : this.s === '♣' ? 13 : 11;
      const lid = T < 4 ? 1 - T / 4 : T > 40 && T < 44 ? (T - 40) / 4 : T >= 44 ? 1 - (T - 44) / 4 : 0; // 0 open, 1 shut
      const look = T >= 14 && T < 22 ? -1 : T >= 22 && T < 30 ? 1 : 0, slit = T >= 30 && T < 38 ? 0 : 1;
      for (let y = -3; y <= 3; y++) for (let x = -5; x <= 5; x++) {
        if ((x / 5.4) ** 2 + (y / 3.2) ** 2 > 1) continue;
        const px = cx - 0.5 + x, py = cy - 0.5 + y;
        if (y + 3 < lid * 7) { g.set(px, py, '#1a6a38'); continue; }
        const r = Math.hypot(x - look, y * 1.2);
        g.set(px, py, Math.abs(x - look) <= (slit ? 0 : 0.6) && Math.abs(y) <= 2 ? '#0a0a0a' : r < 2.4 ? '#ffd040' : r < 3.6 ? '#e8a020' : '#c86a10');
      }
      if (lid > 0 && lid < 1) for (let x = -4; x <= 4; x++) g.set(cx - 0.5 + x, cy - 0.5 - 3 + Math.round(lid * 7) - 1, '#0a1e12');
    },
  });


  // ===== LAST LAP (Card Shark, Legendary) ============================================
  // Seen from above: a lone playing card floats on rippling water while a shark's shadow circles it, closer every lap.
  // On the last lap it lunges, the card is dragged under in a red swirl and bubbles, then a new card drifts in.
  Object.assign(SUIT_FX, {
    shark(s) { // a little dorsal fin cutting the water at the corner
      const g = pad(grid(BASE[s]), 1);
      putIf(g, [[9, 7], [9, 8], [8, 8], [9, 9], [8, 9], [7, 9], [10, 9]], 'o');
      return g;
    },
  });
  const SEA_TOP = ['#2a7aa0', '#145a80', '#0c4468'];
  const seaFromAbove = (g, f, c) => g.each((u, v) => { const s = Math.sin(u * 0.7 + f * 0.12) + Math.sin(v * 0.55 - f * 0.1) + Math.sin((u + v) * 0.4 + f * 0.07); return s > 1.7 ? c[0] : s > 0.6 ? c[1] : c[2]; });
  const sharkShadow = (g, cx, cy, a, R, sx, col, fin) => { // a body of discs trailing the head round a circle, the fin breaking the surface
    for (let i = 9; i >= 0; i--) { const b = a - i * 0.16, x = cx + Math.cos(b) * R, y = cy + Math.sin(b) * R * sx, r = i === 0 ? 1.5 : i < 4 ? 2.2 - i * 0.05 : 2.0 - (i - 3) * 0.28; g.disc(x, y, r, () => col); }
    if (fin) { const b = a - 0.6, x = cx + Math.cos(b) * R, y = cy + Math.sin(b) * R * sx; g.set(x, y, '#8a9aa8'); g.set(x, y - 1, '#c8d4dc'); }
  };
  const floatingCard = (g, x, y, tilt) => { for (let v = 0; v < 5; v++) for (let u = 0; u < 4; u++) g.set(x + u + (tilt && v < 2 ? 1 : 0), y + v, u === 3 || v === 4 ? '#c8d4dc' : '#f2f7fa'); g.set(x + 1 + (tilt ? 1 : 0), y + 1, '#c0202a'); g.set(x + 2, y + 2, '#c0202a'); };
  SETS.push({
    id: 'shark', name: 'Last Lap', rarity: 'legendary', code: 'L2',
    border: '#3a7aa8', frames: 96, fps: 12,
    backNote: 'Seen from above: a lone playing card floats on rippling water while a shark\'s shadow circles it, fin breaking the surface, a little closer every lap. On the last lap it lunges: the card is dragged under in a red swirl and a burst of bubbles, the frame flashes red, then a new card drifts in and it all starts again.',
    face: { card: '#f2f7fa', ink: '#0e1e2e', red: '#c0202a', edge: '#0e1e2e', shade: '#d8e4ec', ring: '#3a7aa8', accent: '#6a7a88' },
    faceNote: '<b>Suits:</b> a little dorsal fin cuts the water at the corner. <b>Ace:</b> a shark\'s shadow circles the big suit, closer and closer, then it snaps and the suit jolts.',
    back(g, f) {
      seaFromAbove(g, f, SEA_TOP);
      const cx = 11, cy = 17, lap = Math.min(1, f / 70), R = lerp(10, 2.5, ease(lap)), a = lap * TAU * 2.5;
      const gone = f >= 72 && f < 86, lunge = f >= 66 && f < 72;
      if (f < 72) {
        const rr = (f % 20) / 3; g.each((u, v) => (Math.abs(Math.hypot(u + 0.5 - cx, (v + 0.5 - cy) * 0.8) - (3 + rr)) < 0.4 && rr < 5 ? '#4a9ac0' : null));
        sharkShadow(g, cx, cy, a, lunge ? lerp(R, 0, (f - 66) / 6) : R, 1.35, '#071e30', true);
      }
      if (lunge || (f >= 72 && f < 80)) { const s = lunge ? (f - 66) / 6 : 1 - (f - 72) / 8; g.disc(cx, cy, 2 + s * 5, (x, y, d) => (d > 1 + s * 4 ? '#e8f8ff' : d > s * 3 ? '#bfe8ff' : '#8a1a2a')); }
      if (gone) { const r0 = rand(8); for (let i = 0; i < 8; i++) g.set(cx - 3 + r0() * 6, cy - 3 + r0() * 6 - (f - 72) * 0.3, '#bfe8ff'); }
      if (f < 66) floatingCard(g, cx - 2, cy - 2, f % 24 < 12);
      else if (f >= 86) floatingCard(g, Math.round(lerp(-4, cx - 2, (f - 86) / 9)), cy - 2, false); // a new card drifts in
    },
    borderFx(g, f) { BORDER_RUN(g, f, f >= 66 && f < 80 ? '#8a1a2a' : '#0c4468', '#bfe8ff', 6, 1, 1); },
    ace(g, f, F, ink) {
      const T = f % 72, cx = 9, cy = this.s === '♥' ? 9 : this.s === '♣' ? 12 : 10;
      // the shadow circles under the suit, tighter each lap, and snaps at the end
      const lap = Math.min(1, T / 56), R = lerp(9.5, 5.5, ease(lap)), a = lap * TAU * 2;
      if (T < 60) for (let i = 7; i >= 0; i--) { const b = a - i * 0.2, x = cx + Math.cos(b) * R, y = cy + Math.sin(b) * R * 1.15, r = i === 0 ? 1.1 : i < 3 ? 1.5 : 1.4 - (i - 2) * 0.22; g.disc(x, y, r, () => '#5a8aa8'); }
      if (T < 60) { const b = a - 0.5; g.set(cx + Math.cos(b) * R, cy + Math.sin(b) * R * 1.15 - 1, '#3a4a5a'); }
      const jolt = T >= 58 && T < 64 ? (T % 2 ? 1 : -1) : 0;
      g.bits(BASE[this.s], jolt, 2, { X: ink }, 2);
      if (T >= 58 && T < 66) { const s = (T - 58) / 8; for (let i = 0; i < 10; i++) { const b = (i / 10) * TAU; g.set(cx + Math.cos(b) * (4 + s * 6), cy + Math.sin(b) * (4 + s * 6), '#8ac8e8'); } }
    },
  });

  // ===== THE HOUSE SEES (Rigged?) and EYE IN THE SKY (new achievement), Legendary back + faces ==========
  const eyeAt = (g, cx, cy, W, H, o) => { // an almond eye: o = { open 0..1, look -1..1, col [inner, outer, rim], spade, glint }
    const open = o.open, hh = H * open;
    for (let y = -H; y <= H; y++) for (let x = -W; x <= W; x++) {
      const edge = hh * (1 - (x / W) ** 2); if (Math.abs(y + 0.5) > edge + 0.3) continue;
      const px = cx + x, py = cy + y, ix = x - o.look * W * 0.35, r = Math.hypot(ix, y + 0.5), R = H * 0.95;
      let c = mix('#f2eee4', '#c8b8a8', Math.min(1, (x / W) ** 2 * 1.2));
      if ((x * 7 + y * 3) % 11 === 0 && r > R && Math.abs(x) > W * 0.5) c = '#d89090';
      if (r < R) { const a = Math.atan2(y + 0.5, ix); c = mix(o.col[0], o.col[1], r / R); if (Math.sin(a * 9) > 0.6 && r > R * 0.45) c = mix(c, '#000000', 0.3); if (r > R - 0.8) c = o.col[2]; }
      if (r < R * 0.42 && !o.spade) c = '#05040c';
      g.set(px, py, c);
    }
    if (o.spade && open > 0.3) g.bits(MINI['♠'], Math.round(cx - 2 + o.look * W * 0.35), Math.round(cy - 2), { X: '#05040c' });
    if (open > 0.3 && o.glint) g.set(cx + Math.round(o.look * W * 0.35) + 1, cy - 2, '#ffffff');
    for (let x = -W; x <= W; x++) { const e = hh * (1 - (x / W) ** 2); g.set(cx + x, cy - Math.round(e) - 1, '#14081a'); if (open > 0.2) g.set(cx + x, cy + Math.round(e) + 1, '#3a2030'); if (open > 0.5 && x % 3 === 0 && Math.abs(x) < W - 1) g.set(cx + x + Math.sign(x), cy - Math.round(e) - 2, '#14081a'); }
  };
  const eyeOpen = (T, a, b) => (T < a ? 0 : T < a + 6 ? (T - a) / 6 : T >= b - 2 && T < b ? 0.15 : 1);
  const GOLD_EYE = ['#ffd75e', '#c88a20', '#6a4410'], RED_EYE = ['#ff6a3a', '#a8102a', '#5a0a14'], GREEN_EYE = ['#a0ffa0', '#2a8a4a', '#0a3a1a'];
  Object.assign(SUIT_FX, {
    houseeye(s) { // a little gold pyramid at the corner
      const g = pad(grid(BASE[s]), 1);
      putIf(g, [[9, 7], [8, 8], [9, 8], [10, 8], [7, 9], [8, 9], [9, 9], [10, 9]], 'o');
      return g;
    },
    skyeye(s) { // a little camera lens at the corner
      const g = pad(grid(BASE[s]), 1);
      putIf(g, [[9, 8], [8, 9], [10, 9], [9, 10]], 'o');
      return g;
    },
  });

  SETS.push({
    id: 'houseeye', name: 'The House Sees', rarity: 'legendary', code: 'L3',
    border: '#c8a040', frames: 96, fps: 12,
    backNote: 'One huge eye fills a gold triangle, rays turning behind it, and its pupil is a spade. It opens, looks left and right, then fixes on you: the iris and the frame burn red.',
    face: { card: '#f6f2ea', ink: '#1a0e2a', red: '#a8102a', edge: '#1a0e2a', shade: '#e2d8c8', ring: '#c8a040', accent: '#c8a040' },
    faceNote: '<b>Suits:</b> a little gold pyramid at the corner. <b>Ace:</b> an eye with a spade pupil opens inside the big suit, looks around and stares at you in red.',
    back(g, f) {
      const T = f % 96, stare = T >= 62 && T < 86;
      g.each((u, v) => { const d = Math.hypot((u + 0.5 - 11) / 11, (v + 0.5 - 17) / 17); return mix(stare ? '#3a0a18' : '#2a1640', '#05030a', Math.min(1, d)); });
      g.each((u, v) => { const top = 4, bot = 29, hw = ((v - top) / (bot - top)) * 11; if (v < top || v > bot) return null; const dx = Math.abs(u + 0.5 - 11); return (Math.abs(dx - hw) < 0.7 || v === bot) && dx <= hw + 0.7 ? (stare && T % 4 < 2 ? '#ff5a3a' : '#c8a040') : null; });
      for (let i = 0; i < 12; i++) { const a = (i / 12) * TAU + T * 0.03; for (let d = 14; d < 22; d += 2) g.set(11 + Math.cos(a) * d, 20 + Math.sin(a) * d * 1.2, stare ? '#8a1a30' : '#5a4278'); }
      const look = T < 14 ? 0 : T < 28 ? -1 : T < 42 ? 1 : T < 50 ? -0.4 : 0;
      eyeAt(g, 11, 21, 8, 4.4, { open: eyeOpen(T, 0, 54), look, col: stare ? RED_EYE : GOLD_EYE, spade: true, glint: true });
    },
    borderFx(g, f) { const T = f % 96; BORDER_RUN(g, f, T >= 62 && T < 86 ? '#5a0a14' : '#2a1640', '#c8a040', 10, 2, 1); },
    ace(g, f, F, ink) {
      const T = f % 72, cy = this.s === '♥' ? 9 : this.s === '♣' ? 12 : 11, stare = T >= 44 && T < 62;
      g.bits(BASE[this.s], 0, 2, { X: ink }, 2);
      const look = T < 12 ? 0 : T < 24 ? -1 : T < 36 ? 1 : 0;
      eyeAt(g, 9, cy, 5, 2.8, { open: eyeOpen(T, 0, 40), look, col: stare ? RED_EYE : GOLD_EYE, spade: false, glint: true });
    },
  });

  SETS.push({
    id: 'skyeye', name: 'Eye in the Sky', rarity: 'legendary', code: 'L4',
    border: '#c0202a', frames: 96, fps: 12,
    backNote: 'The casino ceiling camera is an eye. Its searchlight sweeps over the cards on the felt, then locks onto your chips: the light turns red, the eye glares and the REC light blinks.',
    face: { card: '#f2f2f4', ink: '#14141c', red: '#c0202a', edge: '#14141c', shade: '#dcdce2', ring: '#5a5a64', accent: '#c0202a' },
    faceNote: '<b>Suits:</b> a little red camera lens at the corner. <b>Ace:</b> a camera dome over the big suit; its beam scans across, locks on and goes red.',
    back(g, f) {
      const T = f % 96, lock = T >= 60 && T < 86, cx = 11;
      g.each((u, v) => (v < 8 ? ((u + v) % 4 === 0 ? '#1a1420' : '#100c16') : v >= 22 ? ((u * 3 + v) % 7 === 0 ? '#0c5030' : '#0e5a32') : mix('#100c16', '#0a2a1a', (v - 8) / 14)));
      [[3, 25], [7, 25]].forEach(([x, y]) => { for (let v = 0; v < 6; v++) for (let u = 0; u < 4; u++) g.set(x + u, y + v, u === 3 || v === 5 ? '#c8c4b8' : '#f8f6f0'); g.set(x + 1, y + 1, '#c0202a'); });
      for (let i = 0; i < 4; i++) for (let u = 0; u < 4; u++) g.set(15 + u, 29 - i, ['#d8323a', '#4f9cff', '#20202a', '#ffd75e'][i]);
      const sweep = lock ? 17 : 11 + Math.sin(T * 0.11) * 9;
      for (let v = 9; v < IH; v++) { const k = (v - 9) / (IH - 9), half = 1 + k * 4.5, x = lerp(cx, sweep, k); for (let u = Math.ceil(x - half); u < x + half; u++) if (u >= 0 && u < IW && (u + v + (T >> 1)) % 2 === 0) g.set(u, v, lock ? '#c0202a' : '#d8e8c8'); }
      g.each((u, v) => (v <= 8 && Math.hypot(u + 0.5 - cx, v - 1) < 7 ? (Math.hypot(u + 0.5 - cx, v - 1) > 6 ? '#3a3a44' : '#1a1a22') : null));
      for (let u = 3; u < 20; u++) g.set(u, 1, '#5a5a64');
      eyeAt(g, cx, 5, 4.4, 2.2, { open: eyeOpen(T, 0, 54), look: lock ? 0.8 : Math.sin(T * 0.11) * 0.8, col: lock ? RED_EYE : GREEN_EYE, glint: true });
      if (lock && T % 6 < 3) { g.set(19, 3, '#ff3a4a'); g.set(20, 3, '#ff3a4a'); }
    },
    borderFx(g, f) { const T = f % 96; BORDER_RUN(g, f, T >= 60 && T < 86 ? '#5a0a14' : '#1a1a22', '#c0202a', 6, 1, 1); },
    ace(g, f, F, ink) {
      const T = f % 60, lock = T >= 36 && T < 52;
      g.bits(BASE[this.s], 0, 4, { X: ink }, 2);
      // the beam scanning across the suit, then holding on it in red
      const x = lock ? 9 : Math.round(9 + Math.sin(T * 0.18) * 7);
      for (let y = 4; y < 22; y++) { const half = 1 + (y - 4) * 0.12; for (let u = Math.ceil(x - half); u < x + half; u++) if ((u + y + T) % 2 === 0) g.set(u, y, lock ? '#ff3a4a' : '#bfe8a8'); }
      // the camera dome on top
      for (let u = 4; u < 14; u++) { g.set(u, 0, '#5a5a64'); g.set(u, 1, '#1a1a22'); }
      for (let u = 6; u < 12; u++) g.set(u, 2, '#1a1a22');
      g.set(x < 9 ? 8 : 9, 1, lock ? '#ff3a4a' : '#7aff6a');
    },
  });


  // ===== YELLOW RAINCOAT (secret: the girl from '98) ================================
  // Back: the Corner's front door on a rainy night. The door opens, a girl in a yellow raincoat steps out into the
  // rain and walks away; a gold chip is left glinting on the step. Faces: raindrops by each suit; the ace has rain
  // falling on the big suit, splashing on its top edge, with a gold chip spinning in the puddle below.
  const RAIN_GIRL = [ // 5 x 9, two walking frames share the top 7 rows
    '.YYY.', 'YYYYY', 'YSSSy', 'YYYYy', 'YYYYy', 'YYYYy', 'YYYYy',
  ];
  const RAIN_LEGS = [['.B.B.', '.B.B.'], ['B...B', '.B.B.'], ['.B.B.', '.B.B.'], ['..BB.', '.B.B.']];
  const RAIN_PAL = { Y: '#f0c020', y: '#b88a10', S: '#e8b890', B: '#2a2a33' };
  const OPEN_TXT = { O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], P: ['XXX', 'X.X', 'XXX', 'X..', 'X..'], E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'], N: ['X..X', 'XX.X', 'X.XX', 'X..X', 'X..X'] };
  Object.assign(SUIT_FX, {
    raincoat(s) { // two short raindrops falling past the top corners
      const g = pad(grid(BASE[s]), 1);
      putIf(g, [[0, 0], [1, 1], [9, 2], [10, 3]], 'o');
      return g;
    },
  });
  SETS.push({
    id: 'raincoat', name: 'Yellow Raincoat', rarity: 'secret', code: 'S3',
    border: '#f0c020', frames: 96, fps: 12,
    backNote: 'The Corner on a rainy night. Rain streaks down, the OPEN sign flickers and its red light smears in the puddles. The door swings open, a girl in a yellow raincoat steps out into the rain and walks away down the street. Where she stood, a gold chip is left glinting on the wet step.',
    face: { card: '#f4f0e4', ink: '#1a2430', red: '#b8282a', edge: '#1a2430', shade: '#e2dccc', ring: '#f0c020', accent: '#5a8ab0' },
    faceNote: '<b>Suits:</b> two raindrops falling past the top corners. <b>Ace:</b> rain falls on the big suit and splashes on its top edge, while a gold chip spins in a puddle below.',
    back(g, f, F) {
      const STREET = 27;
      // wall: dark brick with mortar lines
      g.each((u, v) => {
        if (v >= STREET) return null;
        const row = Math.floor(v / 3), brick = (u + (row % 2) * 2) % 5 === 0 || v % 3 === 0;
        return brick ? '#1e161c' : mix('#3a2630', '#2a1c24', v / STREET);
      });
      // OPEN sign, flickering more than it should
      const flick = (f % 37 === 5) || (f % 37 === 6) || (f % 53 === 20) || (f > 40 && f < 43);
      const neon = flick ? '#5a1a20' : '#ff3a4a';
      for (let v = 1; v <= 7; v++) for (let u = 1; u <= 19; u++) g.set(u, v, v === 1 || v === 7 || u === 1 || u === 19 ? '#4a3a40' : '#140c10');
      ['O', 'P', 'E', 'N'].forEach((ch, i) => g.bits(OPEN_TXT[ch], 3 + i * 4, 2, { X: neon }));
      if (!flick) for (let u = 2; u <= 18; u++) g.set(u, 8, '#5a2a30');
      // door with warm light inside; it opens at the start of the loop
      const open = f < 22 ? Math.min(4, Math.floor(f / 3)) : f < 28 ? 4 - Math.floor((f - 22) / 1.5) : 0;
      for (let v = 11; v < STREET; v++) for (let u = 13; u <= 19; u++) {
        const frame = u === 13 || u === 19 || v === 11;
        g.set(u, v, frame ? '#5a3a20' : u - 14 < open ? (v > 20 ? '#ffd890' : '#ffc860') : (u === 18 && v === 19) ? '#d8a020' : '#4a2a18');
      }
      // lamp post with a cone of light
      for (let v = 10; v < STREET; v++) g.set(3, v, '#1a1a20');
      g.set(2, 10, '#1a1a20'); g.set(4, 10, '#1a1a20'); g.set(3, 9, '#fff0b0');
      g.each((u, v) => (v > 10 && v < STREET && u !== 3 && Math.abs(u - 3) < (v - 10) * 0.3 && (u + v) % 2 === 0 ? '#4a3a34' : null));
      // street: wet asphalt with the sign's red light and the door's glow smeared in it
      g.each((u, v) => {
        if (v < STREET) return null;
        const wob = Math.sin(v * 1.7 + f * 0.6) > 0.3 ? 1 : 0;
        if (!flick && v > STREET && (v - STREET) % 2 === 1 && u >= 5 + wob && u <= 15 + wob && (u + v) % 4 !== 0) return '#4a1a26';
        if (open && u >= 14 && u <= 18 && v < STREET + 4) return '#8a6a30';
        return v === STREET ? '#3a4450' : mix('#1a2430', '#0e141c', (v - STREET) / 7);
      });
      // the girl: steps out of the door and walks away to the left
      if (f >= 10 && f < 74) {
        const t = f - 10, x = Math.round(14 - t * 0.33), y = STREET - 9 + (t < 6 ? 0 : 0);
        const legs = RAIN_LEGS[Math.floor(t / 3) % 4];
        g.bits(RAIN_GIRL, x, y, RAIN_PAL); g.bits(legs, x, y + 7, RAIN_PAL);
        // her reflection in the puddle
        if (y + 9 < IH) for (let i = 0; i < 5; i++) if ((i + f) % 2) g.set(x + i, STREET + 2, '#8a7020');
      }
      // the gold chip she left on the step
      if (f >= 24) {
        const glint = (f % 12) < 3;
        g.set(15, STREET, glint ? '#ffffff' : '#ffd75e'); g.set(16, STREET, '#d8a020'); g.set(15, STREET + 1, '#b8860b'); g.set(16, STREET + 1, '#8a6a10');
        if (glint && f > 74) { g.set(15, STREET - 1, '#fff6c0'); g.set(14, STREET, '#fff6c0'); g.set(17, STREET, '#fff6c0'); }
      }
      // rain: diagonal streaks over everything, two pixels long, moving down two pixels a frame
      const r0 = rand(98);
      const drops = Array.from({ length: 16 }, () => [r0() * IW, r0() * IH]);
      drops.forEach(([x0, y0], i) => {
        const y = (y0 + f * 2) % IH, x = (x0 - f * 0.5 + IW * 8) % IW;
        g.set(x, y, i % 4 ? '#6a88a8' : '#a8c4e0'); g.set(x + 0.5, y - 1, '#3a5068');
      });
      [[5, 0], [10, 31], [18, 63], [8, 47], [20, 15]].forEach(([x, k]) => { const t = (f + k) % 24; if (t < 3) { const r = t; g.set(x - r, STREET + 2, '#7a9ab8'); g.set(x + r, STREET + 2, '#7a9ab8'); if (!t) g.set(x, STREET + 1, '#a8c4e0'); } }); // splashes
    },
    borderFx(g, f) { // drops running down both sides of the yellow frame
      for (let i = 0; i < 3; i++) { const y = (f * 1.5 + i * 13) % (BH - 2) + 1; g.set(1, y, '#fff6c0'); g.set(BW - 2, (y + 20) % (BH - 2) + 1, '#fff6c0'); }
    },
    ace(g, f, F, ink) {
      g.bits(BASE[this.s], 0, 2, { X: ink }, 2);
      const T = f % 48;
      // puddle line under the suit, a ripple drifting out from where the chip lands
      for (let x = 0; x < 18; x++) g.set(x, 21, Math.abs(x - 13 - (T % 8) / 2) < 0.6 || Math.abs(x - 13 + (T % 8) / 2) < 0.6 ? '#9ab8d8' : '#5a8ab0');
      // rain: streaks falling on the suit; they stop at its top edge and splash
      const top = (x) => { const row = BASE[this.s].findIndex((r) => r[Math.floor(x / 2)] === 'X'); return row < 0 ? 20 : 2 + row * 2; };
      [1, 5, 8, 12, 15].forEach((x0, i) => {
        const y = ((T * 1.5 + i * 7) % 22) - 2, x = x0, stop = top(x);
        if (y < stop - 1) { g.set(x, y, '#5a8ab0'); g.set(x, y - 1, '#9ab8d8'); }
        else if (y < stop + 2) { g.set(x - 1, stop - 1, '#9ab8d8'); g.set(x + 1, stop - 1, '#9ab8d8'); }
      });
      // the gold chip spinning in the puddle, bottom right
      const k = Math.floor(T / 4) % 4, w = [3, 2, 1, 2][k];
      for (let a = 0; a < w; a++) { g.set(15 + a - (w > 1 ? 1 : 0), 20, a === 0 ? '#fff6c0' : '#ffd75e'); g.set(15 + a - (w > 1 ? 1 : 0), 21, '#b8860b'); }
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
stillwater: ['back_stillwater', 'face_stillwater'], halcyon: ['back_halcyon', 'face_halcyon'], owl: ['back_owl', 'face_owl'], laurel: ['back_laurel', 'face_laurel'], dragon: ['back_dragon', 'face_dragon'], goldace: ['back_goldace', 'face_goldace'], marquee: ['back_marquee', 'face_marquee'],
shark: ['back_shark', 'face_shark'], houseeye: ['back_houseeye', 'face_houseeye'], skyeye: ['back_skyeye', 'face_skyeye'],
    raincoat: ['back_raincoat', 'face_raincoat'],
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
