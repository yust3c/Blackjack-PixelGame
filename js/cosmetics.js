/*
 * Cosmetics: card backs, table felts, chip sets and card faces.
 * Every design is generated pixel art (SVG rectangles), so there are no image files to load.
 *
 * Load after sprites.js. Defines window.Cosmetics.
 *   Cosmetics.apply()                 apply what the player has equipped (call once at start)
 *   Cosmetics.equip(type, id)         equip an unlocked item and apply it
 *   Cosmetics.isUnlocked(id)          true for defaults and for items whose achievement is earned
 *   Cosmetics.openLocker(tab)         full-screen collection/equip screen (needs achievements.js for the list)
 *   Cosmetics.swatch(item)            HTML preview of one item
 */
(function (root) {
  'use strict';

  const doc = root.document;
  const RARITIES = {
    default:   { name: 'Default',   color: '#8a8370' },
    common:    { name: 'Common',    color: '#c8c2ae' },
    rare:      { name: 'Rare',      color: '#4f9cff' },
    epic:      { name: 'Epic',      color: '#c069f0' },
    legendary: { name: 'Legendary', color: '#ffb020' },
    secret:    { name: 'Secret',    color: '#ff5a6a' },
    insanity:  { name: 'Insanity',  color: '#5af2ff' },
  };
  const TYPES = [
    { id: 'back',  name: 'Card backs' },
    { id: 'felt',  name: 'Felts' },
    { id: 'chips', name: 'Chips' },
    { id: 'face',  name: 'Card faces' },
    { id: 'title', name: 'Titles' },
  ];

  // ======================================================================
  // Pixel helpers
  // ======================================================================
  function hex(c) { return c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c; }
  function mix(a, b, t) {
    a = hex(a); b = hex(b);
    const p = (s, i) => parseInt(s.slice(i, i + 2), 16);
    const ch = (i) => Math.round(p(a, i) + (p(b, i) - p(a, i)) * t).toString(16).padStart(2, '0');
    return '#' + ch(1) + ch(3) + ch(5);
  }
  function grey(c) {
    c = hex(c);
    const p = (i) => parseInt(c.slice(i, i + 2), 16);
    const l = Math.round(0.3 * p(1) + 0.59 * p(3) + 0.11 * p(5)).toString(16).padStart(2, '0');
    return '#' + l + l + l;
  }
  // Small deterministic random so the art is the same on every load.
  function rand(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  /** Grid of colours (array of rows, null = transparent) to SVG, merging runs into one rect. */
  function gridToRects(grid, ox) {
    let out = '';
    for (let y = 0; y < grid.length; y++) {
      const row = grid[y];
      let x = 0;
      while (x < row.length) {
        const c = row[x];
        let w = 1;
        while (x + w < row.length && row[x + w] === c) w++;
        if (c) out += `<rect x="${ox + x}" y="${y}" width="${w}" height="1" fill="${c}"/>`;
        x += w;
      }
    }
    return out;
  }
  function svgUrl(svg) { return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`; }

  /** Draw a text bitmap ('.' = empty, other chars looked up in fills) onto a grid, centred or at x,y. */
  function stamp(grid, rows, fills, x0, y0, scale = 1) {
    for (let y = 0; y < rows.length; y++) {
      for (let x = 0; x < rows[y].length; x++) {
        const c = fills[rows[y][x]];
        if (!c) continue;
        for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) {
          const gy = y0 + y * scale + sy; const gx = x0 + x * scale + sx;
          if (grid[gy] && gx >= 0 && gx < grid[gy].length) grid[gy][gx] = c;
        }
      }
    }
  }
  /** Same as stamp, but first paints a 1px outline around the shape. */
  function stampOutlined(grid, rows, fills, outline, x0, y0, scale = 1) {
    const h = rows.length * scale; const w = rows[0].length * scale;
    const solid = (x, y) => {
      const r = rows[Math.floor(y / scale)];
      return r && x >= 0 && x < w && fills[r[Math.floor(x / scale)]];
    };
    for (let y = -1; y <= h; y++) for (let x = -1; x <= w; x++) {
      if (solid(x, y)) continue;
      if (solid(x - 1, y) || solid(x + 1, y) || solid(x, y - 1) || solid(x, y + 1)) {
        const gy = y0 + y; const gx = x0 + x;
        if (grid[gy] && gx >= 0 && gx < grid[gy].length) grid[gy][gx] = outline;
      }
    }
    stamp(grid, rows, fills, x0, y0, scale);
  }

  // ======================================================================
  // Card backs: 28 x 40 pixel grid, drawn at 2px per pixel on a 56 x 80 card.
  // Pixel 0 is under the card's dark edge, pixels 1-2 are the border, the design fills the inside.
  // ======================================================================
  const BW = 28, BH = 40, IN = 3, IW = BW - 2 * IN, IH = BH - 2 * IN; // inner area 22 x 34

  function backFrame(border, inner, f) {
    const g = [];
    for (let y = 0; y < BH; y++) {
      const row = [];
      for (let x = 0; x < BW; x++) {
        if (x < IN || y < IN || x >= BW - IN || y >= BH - IN) row.push(x === 0 || y === 0 || x === BW - 1 || y === BH - 1 ? '#2a2a33' : border);
        else row.push(inner(x - IN, y - IN, f));
      }
      g.push(row);
    }
    return g;
  }

  /** Builds { url, frames, dur } for a back. draw(f) returns a full grid for frame f. */
  function buildBack(frames, draw, dur) {
    let rects = '';
    for (let f = 0; f < frames; f++) rects += gridToRects(draw(f), f * BW);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${BW * frames} ${BH}" width="${BW * frames * 2}" height="${BH * 2}" shape-rendering="crispEdges">${rects}</svg>`;
    return { url: svgUrl(svg), frames, dur: dur || 1 };
  }
  const simpleBack = (border, inner) => () => buildBack(1, () => backFrame(border, inner, 0));

  const CREAM = '#fbf6e6';
  const checker = (a, b) => (u, v) => (((u >> 1) + (v >> 1)) % 2 ? a : b);

  // ---------- emblems ----------
  const LUCKY7 = [
    'XXXXXXXXXX',
    'XXXXXXXXXX',
    'XX....XXX.',
    '.....XXX..',
    '.....XXX..',
    '....XXX...',
    '....XXX...',
    '...XXX....',
    '...XXX....',
    '..XXX.....',
    '..XXX.....',
    '..XXX.....',
  ];
  const CROWN = [
    '.o.....o.....o.',
    'oXo...oXo...oXo',
    '.X.....X.....X.',
    '.XX...XXX...XX.',
    '.XXX.XXXXX.XXX.',
    '.XXXXXXXXXXXXX.',
    '.XXXXXXXXXXXXX.',
    '.XXJXXXJXXXJXX.',
    '.XXXXXXXXXXXXX.',
    '.ddddddddddddd.',
  ];
  const SPADE = [
    '.......X.......',
    '......XXX......',
    '.....XXXXX.....',
    '....XXXXXXX....',
    '...XXXXXXXXX...',
    '..XXXXXXXXXXX..',
    '.XXXXXXXXXXXXX.',
    'XXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXX',
    'XXXXXXXXXXXXXXX',
    '.XXXXX.X.XXXXX.',
    '..XXX..X..XXX..',
    '......XXX......',
    '.....XXXXX.....',
  ];
  const GLYPH_A = ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'];
  const DIGIT_2 = ['XXX.', '...X', '...X', '.XX.', 'X...', 'X...', 'XXXX'];
  const DIGIT_1 = ['.X.', 'XX.', '.X.', '.X.', '.X.', '.X.', 'XXX'];
  const DIAMOND = [
    '....X....',
    '...XXX...',
    '..XXoXX..',
    '.XXoXXXX.',
    'XXoXXXXXX',
    '.XXXXXXX.',
    '..XXXXX..',
    '...XXX...',
    '....X....',
  ];

  function withEmblem(border, inner, emblem, fills, outline, scale = 1) {
    return () => buildBack(1, () => {
      const g = backFrame(border, inner, 0);
      const w = emblem[0].length * scale; const h = emblem.length * scale;
      const x0 = Math.floor((BW - w) / 2); const y0 = Math.floor((BH - h) / 2);
      if (outline) stampOutlined(g, emblem, fills, outline, x0, y0, scale);
      else stamp(g, emblem, fills, x0, y0, scale);
      return g;
    });
  }

  // ---------- static backs ----------
  const BACKS = {
    back_classic: null, // the default red back from style.css
    back_blue: simpleBack(CREAM, checker('#1a347a', '#3a6fd8')),
    back_emerald: simpleBack(CREAM, checker('#0f5a32', '#2f9a5a')),
    back_charcoal: simpleBack(CREAM, checker('#16161c', '#3a3a46')),

    back_argyle: simpleBack(CREAM, (u, v) => {
      const tx = Math.floor(u / 11), ty = Math.floor(v / 17);
      const du = Math.abs((u % 11) - 5), dv = Math.abs((v % 17) - 8);
      const d = du / 5.5 + dv / 8.5;
      if (Math.abs(du - dv * 5.5 / 8.5) < 0.6 && (u + v) % 2 === 0) return '#e9c25a';
      if (d <= 1) return (tx + ty) % 2 ? '#6a4fb0' : '#a0306a';
      return '#2e2252';
    }),
    back_chevron: simpleBack(CREAM, (u, v) => (((v + Math.abs((u % 8) - 4)) % 6) < 3 ? '#0f5a5a' : '#2aa0a0')),
    back_waves: simpleBack(CREAM, (u, v) => {
      const k = (v + Math.round(1.6 * Math.sin((u * Math.PI) / 5.5))) % 6;
      return k === 0 ? '#cfe8ff' : k < 3 ? '#2a6fd8' : '#16407a';
    }),
    back_tartan: simpleBack(CREAM, (u, v) => {
      const su = u % 8 < 2, sv = v % 8 < 2;
      if (u % 8 === 5 || v % 8 === 5) return (u + v) % 2 ? '#f2c23a' : '#1e4a2e';
      if (su && sv) return '#7a141a';
      if (su || sv) return '#b02a3a';
      return '#1e4a2e';
    }),

    back_lucky7: withEmblem('#ffd75e', (u, v) => {
      const d = Math.abs(u - 10.5) + Math.abs(v - 16.5);
      return d < 12 ? ((u + v) % 2 ? '#fff0b0' : '#ffe080') : ((u >> 1) + (v >> 1)) % 2 ? '#d8323a' : '#a01a24';
    }, LUCKY7, { X: '#d8323a' }, '#3a0a0e'),

    back_crown: withEmblem('#ffd75e', (u, v) => {
      const k = (Math.abs((u % 6) - 3) + Math.abs((v % 6) - 3));
      return k === 3 ? '#6a3aa8' : '#3a1d6a';
    }, CROWN, { X: '#ffd75e', o: '#ffffff', J: '#d8323a', d: '#b8860b' }, '#1a0a33'),

    back_ace: () => buildBack(1, () => {
      const g = backFrame('#20202a', (u, v) => (u === 1 || v === 1 || u === IW - 2 || v === IH - 2) ? '#c8a03a' : ((u + v) % 4 === 0 ? '#ece4cc' : CREAM), 0);
      stampOutlined(g, SPADE, { X: '#20202a' }, '#c8a03a', 6, 13);
      stamp(g, GLYPH_A, { X: '#d8323a' }, 6, 6);
      stamp(g, GLYPH_A, { X: '#d8323a' }, 19, 29);
      return g;
    }),

    back_moon: () => buildBack(1, () => {
      const r = rand(7);
      const stars = Array.from({ length: 22 }, () => [Math.floor(r() * IW), Math.floor(r() * IH)]);
      const g = backFrame('#c8d0ff', (u, v) => {
        if (stars.some(([x, y]) => x === u && y === v)) return (u + v) % 3 ? '#ffffff' : '#ffe080';
        return v > 26 ? '#1a1a4a' : '#0c0c2a';
      }, 0);
      for (let y = 0; y < 14; y++) for (let x = 0; x < 14; x++) {
        const inA = (x - 6.5) ** 2 + (y - 6.5) ** 2 <= 42;
        const inB = (x - 9.5) ** 2 + (y - 4.5) ** 2 <= 34;
        if (inA && !inB) g[8 + y][7 + x] = (x + y) % 5 === 0 ? '#e8d890' : '#fff4c0';
      }
      return g;
    }),

    // ---------- animated backs ----------
    // Neon marquee: casino bulbs chase round the edge, "21" glows in the middle.
    back_neon: () => buildBack(3, (f) => {
      const ring = [];
      for (let u = 0; u < IW; u++) ring.push([u, 0]);
      for (let v = 1; v < IH; v++) ring.push([IW - 1, v]);
      for (let u = IW - 2; u >= 0; u--) ring.push([u, IH - 1]);
      for (let v = IH - 2; v > 0; v--) ring.push([0, v]);
      const bulbs = new Map();
      ring.forEach(([u, v], i) => { if (i % 2 === 0) bulbs.set(u + ',' + v, (i / 2 + f) % 3 === 0); });
      const g = backFrame('#2a1a3a', (u, v) => {
        const b = bulbs.get(u + ',' + v);
        if (b !== undefined) return b ? '#fff27a' : '#6a4a1a';
        if (u === 2 || v === 2 || u === IW - 3 || v === IH - 3) return '#ff4fa8';
        return (u + v) % 2 ? '#1a0a28' : '#140820';
      }, f);
      const glow = f === 1 ? '#4ff0ff' : '#2a9ac0';
      stampOutlined(g, DIGIT_2, { X: '#ff7ac8' }, glow, 6, 13, 2);
      stampOutlined(g, DIGIT_1, { X: '#ff7ac8' }, glow, 16, 13, 2);
      return g;
    }, 0.6),

    // Gold rush: solid gold with a diamond, and a shine that sweeps across every two seconds.
    back_goldrush: () => buildBack(16, (f) => {
      const shine = f < 10 ? f * 6 - 6 : -99;
      const g = backFrame('#fff0a0', (u, v) => {
        const s = u + v - shine;
        if (s >= 0 && s < 3) return s === 1 ? '#ffffff' : '#fff6c8';
        const d = Math.abs(u - 10.5) + Math.abs(v - 16.5);
        if (d > 13 && d < 15) return '#8a5a0a';
        return ((u >> 1) + (v >> 1)) % 2 ? '#f2b233' : '#d89a1a';
      }, f);
      const fills = { X: '#5fd0ff', o: '#e0f8ff' };
      stampOutlined(g, DIAMOND, fills, '#1a3a7a', 9, 15);
      // the shine passes over the gem too
      for (let y = 15; y < 24; y++) for (let x = 9; x < 18; x++) {
        const s = (x - IN) + (y - IN) - shine;
        if (s >= 0 && s < 3 && g[y][x] !== '#f2b233' && g[y][x] !== '#d89a1a') g[y][x] = '#ffffff';
      }
      return g;
    }, 2.2),

    // Inferno: flames flicker up from the bottom of the card.
    back_inferno: () => buildBack(4, (f) => backFrame('#3a0a0a', (u, v) => {
      const d = IH - 1 - v;
      const h = 17 + 5 * Math.sin(u * 0.9 + f * 1.7) + 3 * Math.sin(u * 2.3 - f * 2.4) + 2 * Math.cos(u * 0.4 + f);
      const t = d / h;
      if (t < 0.25) return '#fff6c0';
      if (t < 0.5) return '#ffc030';
      if (t < 0.75) return '#ff7a1a';
      if (t < 1) return '#d8323a';
      if ((u * 7 + (v + f * 3) * 13) % 41 === 0) return '#ff9a3a'; // embers
      return ((u >> 1) + (v >> 1)) % 2 ? '#1a0606' : '#240808';
    }, f), 0.5),


    // ---------- added in round 2 ----------
    back_orange: simpleBack(CREAM, checker('#8a320a', '#f07a1f')),
    back_pink: simpleBack(CREAM, checker('#8a1f5a', '#f07ac0')),

    back_polka: simpleBack(CREAM, (u, v) => {
      const sh = Math.floor(v / 6) % 2 ? 3 : 0;
      const du = ((u + sh) % 6) - 2.5, dv = (v % 6) - 2.5;
      return du * du + dv * dv < 3.2 ? '#ffe08a' : '#1a5a8a';
    }),
    back_herringbone: simpleBack(CREAM, (u, v) => {
      const k = (u % 8 < 4 ? u + v : v - u + 64) % 4;
      return k < 2 ? '#6a4a2a' : '#c89a5a';
    }),
    back_lattice: simpleBack(CREAM, (u, v) => {
      if ((u + v) % 6 === 0 || (u - v + 60) % 6 === 0) return '#e0c060';
      if ((u + v) % 6 === 3 && (u - v + 60) % 6 === 3) return '#ff8a9a';
      return '#5a0f2a';
    }),
    back_scales: simpleBack(CREAM, (u, v) => {
      let best = 99, dvBest = 0;
      for (let j = -1; j <= 9; j++) for (let i = -1; i <= 4; i++) {
        const cx = i * 6 + (j % 2 ? 3 : 0), cy = j * 4;
        if (cy > v) continue; // scales overlap downwards: take the lowest centre above
        const d = Math.hypot(u - cx, (v - cy) * 1.2);
        if (d < 3.6 && cy >= dvBest) { best = d; dvBest = cy; }
      }
      if (best > 3.6) return '#0f4a3a';
      if (best > 2.8) return '#9ae0b0';
      return best < 1.4 ? '#3aa078' : '#1f7a5a';
    }),
    back_kaleido: simpleBack(CREAM, (u, v) => {
      const a = Math.floor(Math.abs(u - 10.5)), b = Math.floor(Math.abs(v - 16.5));
      const k = (a * 3 + b * 2 + Math.floor((a * b) / 6)) % 5;
      return ['#2a1a5a', '#e04fa8', '#4fd0e0', '#ffd75e', '#5a2a9a'][k];
    }),

    back_dice: () => buildBack(1, () => {
      const g = backFrame('#fbf6e6', (u, v) => (((u >> 1) + (v >> 1)) % 2 ? '#1f7a45' : '#1b6c3d'), 0);
      const die = (x0, y0, pips) => {
        for (let y = -1; y <= 9; y++) for (let x = -1; x <= 9; x++) {
          const edge = x === -1 || y === -1 || x === 9 || y === 9;
          const corner = (x === -1 || x === 9) && (y === -1 || y === 9);
          if (corner) continue;
          g[y0 + y][x0 + x] = edge ? '#20202a' : (x === 8 || y === 8 ? '#d8d0b8' : '#ffffff');
        }
        for (const [px, py] of pips) { g[y0 + py][x0 + px] = '#d8323a'; g[y0 + py][x0 + px + 1] = '#d8323a'; g[y0 + py + 1][x0 + px] = '#d8323a'; g[y0 + py + 1][x0 + px + 1] = '#d8323a'; }
      };
      die(5, 8, [[3, 3]]);
      die(14, 22, [[3, 3]]);
      return g;
    }),
    back_cherry: withEmblem('#fbf6e6', (u, v) => {
      const d = Math.abs(u - 10.5) + Math.abs(v - 16.5);
      if (d < 11) return (u + v) % 2 ? '#fff6d8' : '#ffeebb';
      return ((u >> 1) + (v >> 1)) % 2 ? '#2a8a4a' : '#1f6a38';
    }, [
      '.......GGG..',
      '.....GG.G...',
      '....G...G...',
      '...G.....G..',
      '..G......G..',
      '.RRR....RRR.',
      'RRwRR..RRwRR',
      'RRRRR..RRRRR',
      'RRRRR..RRRRR',
      '.RRR....RRR.',
    ], { G: '#2a8a2a', R: '#d8323a', w: '#ffffff' }, '#3a0a0e'),
    back_skull: withEmblem('#c8c2ae', (u, v) => {
      const k = Math.abs((u % 6) - 3) + Math.abs((v % 6) - 3);
      return k === 3 ? '#5a0f1a' : '#1a0a14';
    }, [
      '...XXXXXXX...',
      '..XXXXXXXXX..',
      '.XXXXXXXXXXX.',
      '.XXXXXXXXXXX.',
      '.XXeeeXeeeXX.',
      '.XXeeeXeeeXX.',
      '.XXXXXXXXXXX.',
      '..XXXXeXXXX..',
      '..XXXXXXXXX..',
      '...XeXeXeX...',
      '...XXXXXXX...',
    ], { X: '#f0ece0', e: '#1a0a14' }, '#000000'),

    // Jackpot: three slot reels spinning.
    back_slots: () => {
      const SYM = [
        { rows: ['XXXXX', '...X.', '..X..', '.X...', '.X...'], c: '#d8323a' },
        { rows: ['...G.', '..G.G', 'RRG.G', 'RR.RR', '...RR'], c: null },
        { rows: ['XXXXX', '.....', 'XXXXX', '.....', 'XXXXX'], c: '#20202a' },
        { rows: ['..X..', '.XXX.', '.XXX.', 'XXXXX', '..X..'], c: '#e0a020' },
      ];
      const STRIP = 28; // 4 symbols x 7 rows
      const symAt = (row) => { const r = ((row % STRIP) + STRIP) % STRIP; return [SYM[Math.floor(r / 7)], r % 7]; };
      const speeds = [4, 8, 4], starts = [0, 9, 17];
      return buildBack(7, (f) => {
        const g = backFrame('#ffd75e', (u, v) => {
          if (v < 6 || v > 27) { // cabinet top and bottom with blinking bulbs
            if ((v === 2 || v === 31) && u % 3 === 1) return (u / 3 + f) % 2 < 1 ? '#fff27a' : '#8a5a0a';
            return '#b02a3a';
          }
          if (v === 6 || v === 27) return '#20202a';
          const reel = u < 7 ? 0 : u < 14 ? 1 : 2;
          const ru = u - reel * 7 - 1;
          if (ru < 0 || ru > 5) return '#20202a';
          if (v === 16 && (ru === 0 || ru === 5)) return '#d8323a'; // pay line
          const [sym, sy] = symAt(v - 7 + starts[reel] - f * speeds[reel]);
          const sx = ru - 0;
          if (sy < 5 && sx < 5) {
            const ch = sym.rows[sy][sx];
            if (ch === 'X') return sym.c;
            if (ch === 'G') return '#2a8a2a';
            if (ch === 'R') return '#d8323a';
          }
          return v < 9 || v > 24 ? '#d8d0b8' : '#ffffff';
        }, f);
        return g;
      }, 0.7);
    },

    // Prismatic: rainbow bands sliding across, with a white gem.
    back_prism: () => buildBack(9, (f) => {
      const RAIN = ['#ff4f6a', '#ff9a3a', '#ffe066', '#5fd068', '#4fb0ff', '#a06aff'];
      const g = backFrame('#ffffff', (u, v) => RAIN[Math.floor((u + v + 60 - f * 2) / 3) % 6], f);
      stampOutlined(g, DIAMOND, { X: '#ffffff', o: '#d0e8ff' }, '#20202a', 9, 15);
      return g;
    }, 0.9),

    // Thunderstorm: rain falls, lightning strikes now and then.
    back_storm: () => {
      const bolt = [[11, 4], [10, 5], [10, 6], [9, 7], [9, 8], [10, 9], [11, 10], [11, 11], [10, 12], [9, 13], [9, 14], [8, 15], [9, 16], [10, 17], [10, 18], [9, 19], [8, 20], [8, 21], [7, 22], [7, 23]];
      const boltSet = new Set(bolt.map(([u, v]) => u + ',' + v));
      return buildBack(10, (f) => backFrame('#8a9ab0', (u, v) => {
        const flash = f === 0 || f === 2;
        if (flash && boltSet.has(u + ',' + v)) return '#ffffff';
        if (flash && (boltSet.has((u - 1) + ',' + v) || boltSet.has((u + 1) + ',' + v))) return '#fff27a';
        const cloud = v < 5 + Math.round(1.5 * Math.sin(u * 0.8)) + (u % 5 === 0 ? 1 : 0);
        if (cloud) return flash ? '#8a8aa8' : (u + v) % 3 ? '#3a3a52' : '#4a4a64';
        if (v > 6 && u % 3 === (v + f * 2) % 3 && (v + f * 3) % 5 === 0) return '#7a9ad8'; // rain
        return flash ? '#2a2a4a' : '#12121e';
      }, f), 1.6);
    },


    // Heartbreak (secret): a heart cracks, splits, and a tear falls. Then it mends and it happens again.
    back_heartbreak: () => {
      const W = 15, H = 13, cx = 7;
      const inHeart = (x, y) => {
        const X = (x - 7) / 6.2, Y = (6 - y) / 5.8 + 0.25;
        return Math.pow(X * X + Y * Y - 1, 3) - X * X * Y * Y * Y <= 0;
      };
      const crack = [0, 1, 0, -1, 0, 1, 1, 0, -1, 0, 1, 0, 0];
      return buildBack(10, (f) => {
        const g = backFrame('#c8c2ae', (u, v) => {
          if ((u * 5 + (v - f * 2) * 3 + 400) % 23 === 0 && u % 2 === 0) return '#3a3a5a'; // drizzle
          return ((u >> 1) + (v >> 1)) % 2 ? '#14101c' : '#18121f';
        }, f);
        const split = [0, 0, 0, 1, 2, 2, 2, 2, 2, 1][f];
        const showCrack = f >= 2;
        const x0 = IN + Math.floor((IW - W) / 2), y0 = IN + 9;
        for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
          if (!inHeart(x, y)) continue;
          const line = cx + crack[y];
          const left = x < line;
          if (showCrack && split === 0 && x === line) { g[y0 + y][x0 + x] = '#14101c'; continue; }
          if (split > 0 && x === line) continue;
          const dx = split ? (left ? -split : split) : 0;
          const dy = split && !left ? 1 : 0;
          const edge = !inHeart(x - 1, y) || !inHeart(x + 1, y) || !inHeart(x, y - 1) || !inHeart(x, y + 1);
          const shine = x >= 3 && x <= 4 && y >= 2 && y <= 3;
          g[y0 + y + dy][x0 + x + dx] = shine ? '#ff9aa8' : edge ? '#7a0f1e' : '#d8323a';
        }
        if (f >= 4) { // one tear rolls down
          const ty = y0 + H + 1 + (f - 4) * 2;
          if (ty < BH - IN - 1) { g[ty][BW / 2 - 1] = '#9ad0ff'; g[ty + 1][BW / 2 - 1] = '#4f9cff'; }
        }
        return g;
      }, 2.6);
    },


    // ---------- added in round 3 ----------
    back_mint: simpleBack(CREAM, checker('#0f6a5a', '#3ad0a8')),
    back_candystripe: simpleBack(CREAM, (u, v) => ((u + v) % 8 < 4 ? '#d8323a' : '#fbf6e6')),
    back_circuit: simpleBack(CREAM, (u, v) => {
      const h = (a, b) => (a * 73 + b * 151) % 7;
      const hz = v % 6 === 2 && h(Math.floor(u / 5), Math.floor(v / 6)) % 3 !== 0;
      const vt = u % 5 === 2 && h(Math.floor(v / 6), Math.floor(u / 5) + 3) % 2 === 0;
      if (hz && vt) return '#ffe08a';
      if (hz || vt) return '#c8a03a';
      return (u + v) % 2 ? '#0f3a22' : '#123f26';
    }),
    back_allin: simpleBack(CREAM, (u, v) => {
      const du = u - 10.5, dv = v - 16.5, r = Math.hypot(du, dv);
      const a = (Math.atan2(dv, du) * 180) / Math.PI + 180;
      if (r <= 4.6) return (Math.abs(du) + Math.abs(dv) < 3 ? '#d8323a' : '#fbf6e6');
      if (r <= 5.6) return '#7a141a';
      if (r <= 8.8) return Math.floor(a / 30) % 2 ? '#fbf6e6' : '#d8323a';
      if (r <= 9.8) return '#3a0a0e';
      return ((u >> 1) + (v >> 1)) % 2 ? '#1f7a45' : '#1b6c3d';
    }),
    back_hilo: simpleBack(CREAM, (u, v) => {
      const tx = Math.floor(u / 7), ty = Math.floor(v / 7), x = u % 7, y = v % 7;
      const plus = (tx + ty) % 2 === 0;
      const bar = y === 3 && x >= 1 && x <= 5;
      const stem = plus && x === 3 && y >= 1 && y <= 5;
      if (bar || stem) return plus ? '#5fd068' : '#f05a4f';
      return (u + v) % 2 ? '#141a3a' : '#18204a';
    }),
    back_orbit: () => buildBack(1, () => {
      const r = rand(5);
      const stars = new Set(Array.from({ length: 20 }, () => Math.floor(r() * IW) + ',' + Math.floor(r() * IH)));
      return backFrame('#9ab0ff', (u, v) => {
        const du = u - 10.5, dv = v - 16.5;
        const ring = Math.abs((du / 10) ** 2 + (dv / 2.6) ** 2 - 1) < 0.22;
        const planet = Math.hypot(du, dv) <= 6.2;
        if (ring && !(planet && dv < 0)) return (u % 3) ? '#e8d8b0' : '#c8b890';
        if (planet) return Math.hypot(du + 2, dv + 2) < 2.5 ? '#f2c08a' : (Math.floor(v / 2) % 2 ? '#d89a5a' : '#b8783a');
        if (stars.has(u + ',' + v)) return '#ffffff';
        return '#0a0a24';
      }, 0);
    }),

    // Platinum (secret set): silver lattice whose joints sparkle through the rainbow.
    back_platinum: () => buildBack(6, (f) => {
      const RAIN = ['#ff4f6a', '#ff9a3a', '#ffe066', '#5fd068', '#4fb0ff', '#a06aff'];
      const g = backFrame('#ffffff', (u, v) => {
        const a = (u + v) % 8 === 0, b = (u - v + 64) % 8 === 0;
        if (a && b) return RAIN[(Math.floor((u + v) / 8) + f) % 6];
        if (a || b) return '#ffffff';
        return ((u >> 1) + (v >> 1)) % 2 ? '#c8ccd8' : '#a8adbc';
      }, f);
      stampOutlined(g, DIAMOND, { X: '#eef4ff', o: RAIN[f] }, '#3a3e4a', 9, 15);
      return g;
    }, 1.2),

    // King of Hearts (secret set): hearts float up behind a golden crown.
    back_kinghearts: () => {
      const HEART = ['.X.X.', 'XXXXX', '.XXX.', '..X..'];
      const spots = [[1, 3], [8, 20], [15, 9], [4, 27], [17, 30], [11, 0], [0, 15]];
      return buildBack(17, (f) => {
        const g = backFrame('#ffd75e', (u, v) => (((u >> 1) + (v >> 1)) % 2 ? '#8a0f1e' : '#a01a2a'), f);
        for (const [x, y] of spots) {
          const yy = ((y - f * 2) % IH + IH) % IH;
          stamp(g, HEART, { X: '#ff9aa8' }, IN + x, IN + yy);
        }
        stampOutlined(g, CROWN, { X: '#ffd75e', o: '#ffffff', J: '#d8323a', d: '#b8860b' }, '#3a0a0e', 6, 15);
        for (let y = 0; y < BH; y++) for (let x = 0; x < BW; x++) if (x < IN || y < IN || x >= BW - IN || y >= BH - IN) g[y][x] = x === 0 || y === 0 || x === BW - 1 || y === BH - 1 ? '#2a2a33' : '#ffd75e';
        return g;
      }, 1.7);
    },

    // Seventh Heaven (secret set): clouds drift past a glowing golden 7.
    back_heaven: () => {
      const clouds = [[2, 4, 5, 2], [14, 9, 6, 2.5], [6, 24, 6, 2], [18, 29, 5, 2], [-4, 15, 4, 1.8]];
      return buildBack(12, (f) => {
        const g = backFrame('#ffffff', (u, v) => {
          for (const [cx, cy, rx, ry] of clouds) {
            let dx = ((u - cx - f * 2) % 24 + 24) % 24; if (dx > 12) dx -= 24;
            const k = (dx / rx) ** 2 + ((v - cy) / ry) ** 2;
            if (k <= 1) return v > cy + ry * 0.4 ? '#d8ecff' : '#ffffff';
          }
          return v < 10 ? '#5aa8f0' : v < 22 ? '#7ac0ff' : '#a8d8ff';
        }, f);
        const glow = f % 4 < 2 ? '#fff6c0' : '#ffe9a0';
        stampOutlined(g, LUCKY7, { X: '#ffd75e' }, '#b8860b', 9, 14);
        g[13][8] = glow; g[13][19] = glow; g[26][10] = glow; g[26][17] = glow;
        return g;
      }, 2.4);
    },

    // Event Horizon (Expert Endless set): a black hole with a spinning accretion disk.
    back_horizon: () => {
      const r0 = rand(77);
      const stars = new Set(Array.from({ length: 26 }, () => Math.floor(r0() * IW) + ',' + Math.floor(r0() * IH)));
      return buildBack(8, (f) => backFrame('#ff9a3a', (u, v) => {
        const du = u - 10.5, dv = v - 16.5, r = Math.hypot(du, dv);
        const th = Math.atan2(dv, du);
        if (r < 3.6) return '#000000';
        if (r < 4.6) return '#ffe9a0';
        const d = Math.hypot(du, dv * 3.2);
        if (d > 5 && d < 11.5) return Math.sin(th * 3 - (f * Math.PI) / 4 + d * 0.6) > 0 ? '#ff9a3a' : '#d8501a';
        if (r < 6.2 && dv < 0) return '#a03a0a';
        if (stars.has(u + ',' + v)) return f % 2 && (u + v) % 3 === 0 ? '#6a6a8a' : '#ffffff';
        return '#05040c';
      }, f), 1.0);
    },

    // Starfield: twinkling stars and a shooting star.
    back_starfield: () => {
      const r = rand(42);
      const stars = Array.from({ length: 34 }, () => ({ u: Math.floor(r() * IW), v: Math.floor(r() * IH), p: Math.floor(r() * 8) }));
      return buildBack(8, (f) => {
        const g = backFrame('#9ab0ff', (u, v) => {
          const s = stars.find((st) => st.u === u && st.v === v);
          if (s) {
            const k = (f + s.p) % 8;
            if (k === 0) return '#ffffff';
            if (k === 1 || k === 7) return '#9ab0ff';
            return '#2a2a6a';
          }
          const neb = Math.sin(u * 0.3 + v * 0.2) + Math.cos(v * 0.25 - u * 0.1);
          return neb > 1.3 ? '#2a1450' : '#0a0a24';
        }, f);
        for (let t = 0; t < 4; t++) { // shooting star with a fading tail
          const x = IN + 2 + f * 3 - t; const y = IN + 3 + f * 2 - Math.floor(t * 0.66);
          if (g[y] && x >= IN && x < BW - IN) g[y][x] = ['#ffffff', '#ffe080', '#ff9a3a', '#7a3a1a'][t];
        }
        return g;
      }, 1.4);
    },
  };

  // ======================================================================
  // Felts: colour sets for the table (CSS variables from style.css)
  // ======================================================================
  const FELTS = {
    felt_classic: null,
    felt_blue:    { '--felt': '#1f4f9a', '--felt-dot': '#1b468a', '--felt-dark': '#143670', '--felt-line': '#e9d27a' },
    felt_crimson: { '--felt': '#8a1f2a', '--felt-dot': '#7a1b25', '--felt-dark': '#5a121a', '--felt-line': '#f2d27a' },
    felt_purple:  { '--felt': '#4a2a7a', '--felt-dot': '#42246e', '--felt-dark': '#2e1852', '--felt-line': '#e9c9ff',
                    '--rail': '#3a2030', '--rail-light': '#5a3448', '--rail-dark': '#1e0e18' },
    felt_blackgold: { '--felt': '#1c1c22', '--felt-dot': '#16161b', '--felt-dark': '#0a0a0e', '--felt-line': '#ffd75e',
                      '--rail': '#9a7420', '--rail-light': '#d8aa3a', '--rail-dark': '#4a3608' },
    felt_galaxy:  { '--felt': '#141038', '--felt-dot': '#110d30', '--felt-dark': '#08061c', '--felt-line': '#9ad0ff',
                    '--rail': '#2a2a3a', '--rail-light': '#4a4a64', '--rail-dark': '#10101a' },
    felt_heartbreak: { '--felt': '#3a0f1e', '--felt-dot': '#330d1a', '--felt-dark': '#22080f', '--felt-line': '#ff9aa8',
                       '--rail': '#2a2228', '--rail-light': '#443a42', '--rail-dark': '#141014' },
    felt_forest:   { '--felt': '#2a5a2a', '--felt-dot': '#255024', '--felt-dark': '#1a3a1a', '--felt-line': '#e0d090' },
    felt_nebula:   { '--felt': '#2a1450', '--felt-dot': '#24104a', '--felt-dark': '#160a30', '--felt-line': '#ff9ad6' },
    felt_platinum: { '--felt': '#1c1e26', '--felt-dot': '#181a21', '--felt-dark': '#0e1016', '--felt-line': '#e8ecf8',
                     '--rail': '#9aa0b0', '--rail-light': '#d8dce8', '--rail-dark': '#4a4e5a' },
    felt_kinghearts: { '--felt': '#6a0a18', '--felt-dot': '#600916', '--felt-dark': '#40060f', '--felt-line': '#ffd75e',
                       '--rail': '#8a6a1a', '--rail-light': '#c8a03a', '--rail-dark': '#4a3608' },
    felt_heaven:   { '--felt': '#4a8ac8', '--felt-dot': '#4482be', '--felt-dark': '#2e6498', '--felt-line': '#ffffff',
                     '--rail': '#e8e0d0', '--rail-light': '#ffffff', '--rail-dark': '#a89a80' },
    felt_horizon:  { '--felt': '#0a0814', '--felt-dot': '#08060f', '--felt-dark': '#020206', '--felt-line': '#ff9a3a',
                     '--rail': '#1a1420', '--rail-light': '#2e2438', '--rail-dark': '#0a0810' },
    felt_teal:     { '--felt': '#1a7a7a', '--felt-dot': '#166b6b', '--felt-dark': '#0f5050', '--felt-line': '#f2e0a0' },
    felt_midnight: { '--felt': '#1a2238', '--felt-dot': '#161d30', '--felt-dark': '#0c1020', '--felt-line': '#c0c8e0',
                     '--rail': '#2a2a33', '--rail-light': '#44444f', '--rail-dark': '#121218' },
    felt_glacier:  { '--felt': '#3a7a9a', '--felt-dot': '#346e8b', '--felt-dark': '#245a74', '--felt-line': '#e0f4ff',
                     '--rail': '#9ab8c8', '--rail-light': '#d8ecf4', '--rail-dark': '#4a6a7a' },
    felt_aurora:   { '--felt': '#0c1a28', '--felt-dot': '#0a1622', '--felt-dark': '#060e16', '--felt-line': '#8affc8',
                     '--rail': '#1e2a3a', '--rail-light': '#344a5e', '--rail-dark': '#0a1018' },
  };
  // Two star layers for the galaxy felt; they drift at different speeds.
  function starTile(seed, n, colors) {
    const r = rand(seed); const S = 64; let rects = '';
    for (let i = 0; i < n; i++) {
      const x = Math.floor(r() * S), y = Math.floor(r() * S);
      const c = colors[Math.floor(r() * colors.length)];
      rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${c}"/>`;
      if (r() < 0.12) rects += `<rect x="${x - 1}" y="${y}" width="3" height="1" fill="${c}" opacity="0.5"/><rect x="${x}" y="${y - 1}" width="1" height="3" fill="${c}" opacity="0.5"/>`;
    }
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${S} ${S}" width="${S * 2}" height="${S * 2}" shape-rendering="crispEdges">${rects}</svg>`);
  }

  function cloudTile() {
    const W = 64, H = 32; const r = rand(31); let rects = '';
    for (let i = 0; i < 4; i++) {
      const cx = r() * W, cy = 6 + r() * 20, rx = 5 + r() * 6, ry = 2 + r() * 2;
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        let dx = Math.abs(x - cx); dx = Math.min(dx, W - dx);
        if ((dx / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${y > cy ? '#d8ecff' : '#ffffff'}"/>`;
      }
    }
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" width="${W * 4}" height="${H * 4}" shape-rendering="crispEdges" opacity="0.55">${rects}</svg>`);
  }
  function heartTile() {
    const rows = ['.X.X.', 'XXXXX', '.XXX.', '..X..']; let rects = '';
    rows.forEach((row, y) => [...row].forEach((c, x) => { if (c === 'X') rects += `<rect x="${x + 2}" y="${y + 3}" width="1" height="1" fill="#8a1a2a"/><rect x="${x + 10}" y="${y + 11}" width="1" height="1" fill="#8a1a2a"/>`; }));
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" width="32" height="32" shape-rendering="crispEdges">${rects}</svg>`);
  }
  // Extra layers and motion for felts: [layer images], [sizes], [pan per layer], duration, steps
  const FELT_FX = {
    felt_nebula: () => [[starTile(51, 16, ['#ffffff', '#ff9ad6']), 'radial-gradient(ellipse at 30% 40%, rgba(255, 90, 200, 0.22), transparent 60%)'], ['128px 128px', '100% 100%']],
    felt_platinum: () => [[starTile(61, 22, ['#ffffff', '#ff9aa8', '#9ad0ff', '#ffe9a0', '#b0ffc8']), 'none'], ['128px 128px', 'auto'], ['0 128px', '0 0'], '30s', 120],
    felt_kinghearts: () => [[heartTile(), 'none'], ['32px 32px', 'auto']],
    felt_heaven: () => [[cloudTile(), 'none'], ['256px 128px', 'auto'], ['256px 0', '0 0'], '40s', 128],
    felt_horizon: () => [[starTile(71, 24, ['#ffffff', '#ffd0a0', '#8a8aa8']), 'radial-gradient(ellipse at 50% 120%, rgba(255, 122, 26, 0.28), transparent 55%)'], ['128px 128px', '100% 100%'], ['128px 0', '0 0'], '60s', 128],
  };
  // Card faces drawn by injected CSS: vars, box-shadow, optional ::after overlay
  const RAINBOW_BAND = 'linear-gradient(115deg, transparent 0 30%, #ff6ad0 30% 34%, #ffe66a 34% 38%, #6aff9a 38% 42%, #6ad0ff 42% 46%, #b06aff 46% 50%, transparent 50% 100%) 0 0 / 300% 100%';
  const FACE_FX = {
    face_newsprint: { vars: { '--card': '#e8e6dc', '--card-ink': '#2a2a2a', '--card-red': '#8a3a3a' },
      shadow: 'inset 0 0 0 2px #2a2a2a, inset -4px -4px 0 2px #d0cec2',
      after: 'radial-gradient(rgba(0, 0, 0, 0.13) 1px, transparent 1.5px) 0 0 / 4px 4px', opacity: 1 },
    face_platinum: { vars: { '--card': '#eef0f6', '--card-ink': '#1e2230', '--card-red': '#d0306a' },
      shadow: 'inset 0 0 0 2px #4a4e5a, inset 0 0 0 4px #c8ccd8, inset -4px -4px 0 4px #dde0ea',
      after: RAINBOW_BAND, opacity: 0.3, anim: 'cos-holo 2s steps(20) infinite' },
    face_kinghearts: { vars: { '--card': '#fff4ec', '--card-ink': '#3a0a14', '--card-red': '#c0102a' },
      shadow: 'inset 0 0 0 2px #6a4a08, inset 0 0 0 4px #ffd75e, inset 0 0 0 6px #c0102a, inset -4px -4px 0 6px #f4e0d4' },
    face_heaven: { vars: { '--card': '#f4faff', '--card-ink': '#1a3a6a', '--card-red': '#e0304a' },
      shadow: 'inset 0 0 0 2px #3a6aa0, inset 0 0 0 4px #bfe0ff, inset -4px -4px 0 4px #dcecfa',
      after: 'linear-gradient(135deg, transparent 0 40%, #fff6c0 40% 44%, #ffd75e 44% 46%, transparent 46% 100%) 0 0 / 400% 100%', opacity: 0.5, anim: 'cos-holo 3.5s steps(35) infinite' },
    face_void: { vars: { '--card': '#14101e', '--card-ink': '#e8e0ff', '--card-red': '#ff6a9a' },
      shadow: 'inset 0 0 0 2px #000, inset 0 0 0 4px #ff7a1a, inset -4px -4px 0 4px #1e1830' },
  };
  function injectFx() {
    if (doc.getElementById('cos-fx-style')) return;
    let css = '@keyframes cos-pan { from { background-position: 0 0, 0 0, 0 0; } to { background-position: var(--pan-a), var(--pan-b), 0 0; } }\n';
    for (const [id, make] of Object.entries(FELT_FX)) {
      const [layers, sizes, pan, dur, steps] = make();
      const body = `background-image: ${layers.join(', ')}, repeating-conic-gradient(var(--felt-dot) 0 25%, transparent 0 50%);
        background-size: ${sizes.join(', ')}, 4px 4px;` + (pan ? ` --pan-a: ${pan[0]}; --pan-b: ${pan[1]}; animation: cos-pan ${dur} steps(${steps}) infinite;` : '');
      css += `html[data-cos-felt="${id}"] .table, .cos-sw-felt[data-felt="${id}"] { ${body} }\n`;
    }
    for (const [id, fx] of Object.entries(FACE_FX)) {
      const vars = Object.entries(fx.vars).map(([k, v]) => `${k}: ${v};`).join(' ');
      const after = fx.after ? `content: ""; position: absolute; inset: 2px; pointer-events: none; background: ${fx.after}; opacity: ${fx.opacity};${fx.anim ? ` animation: ${fx.anim};` : ''}` : 'content: none;';
      css += `html[data-cos-face="${id}"] { ${vars} }
html[data-cos-face="${id}"] .card:not(.back) { box-shadow: ${fx.shadow}; }
html[data-cos-face="${id}"] .card:not(.back)::after { ${after} }
html .cos-sw-faces.cos-sw-faces[data-face="${id}"] { ${vars} }
html .cos-sw-faces.cos-sw-faces[data-face="${id}"] .card { box-shadow: ${fx.shadow}; }
html .cos-sw-faces.cos-sw-faces[data-face="${id}"] .card::after { ${after} }\n`;
    }
    css += '@media (prefers-reduced-motion: reduce) { html[data-cos-felt] .table, .cos-sw-felt, .card::after { animation: none !important; } }\n';
    const el = doc.createElement('style'); el.id = 'cos-fx-style'; el.textContent = css; doc.head.appendChild(el);
  }

  // ======================================================================
  // Chip sets: recolour the chip sprite per denomination
  // ======================================================================
  const BASE_CHIPS = (root.PixelSprites && root.PixelSprites.CHIP_COLORS) || {};
  const CHIP_SETS = {
    chips_classic: null,
    chips_pastel: { stripe: '#ffffff', colors: (m, d, l) => [mix(m, '#ffffff', 0.45), mix(d, m, 0.4), mix(l, '#ffffff', 0.5)] },
    chips_noir:   { stripe: '#e8e8e8', colors: (m, d, l) => [mix(grey(m), '#000000', 0.35), '#050507', m] },
    chips_vip:    { stripe: '#ffd75e', colors: (m, d, l) => [mix(m, '#000000', 0.35), '#2a1a00', '#ffe9a0'] },
    chips_spin:   { stripe: 'spin', colors: (m, d, l) => [m, d, '#ffe9a0'] },
    chips_ocean:  { stripe: '#e0f4ff', colors: (m, d, l) => [mix(m, '#2a6fd8', 0.55), mix(d, '#0a2a5a', 0.6), mix(l, '#bfe0ff', 0.6)] },
    chips_jade:   { stripe: '#e8fff0', colors: (m, d, l) => [mix(m, '#1f8a5a', 0.6), '#0a3a22', mix(l, '#9ae0b0', 0.6)] },
    chips_neon:   { stripe: (m) => mix(m, '#ffffff', 0.25), colors: (m, d, l) => ['#14141c', mix(m, '#ffffff', 0.15), m] },
    chips_heartbreak: { stripe: 'beat', colors: (m, d, l) => [mix(m, '#7a0f1e', 0.6), '#1a0608', mix(l, '#ff9aa8', 0.6)] },
    chips_rainbow: { stripe: 'rainbow', colors: (m, d, l) => ['#e8ecf4', '#4a4e5a', m] },
    chips_candy:  { stripe: '#fff0f8', colors: (m, d, l) => [mix(m, '#ff8ad0', 0.45), mix(d, '#8a2a6a', 0.5), mix(l, '#fff08a', 0.6)] },
    chips_mars:   { stripe: '#ffd0a0', colors: (m, d, l) => [mix(m, '#c04a1a', 0.6), '#3a1206', mix(l, '#ff9a5a', 0.6)] },
    chips_kinghearts: { stripe: 'spin', spin: ['#ffe9a0', '#ffd75e', '#a07818'], colors: (m, d, l) => [mix(m, '#b0102a', 0.65), '#3a0610', '#ff9aa8'] },
    chips_heaven: { stripe: 'spin', spin: ['#ffffff', '#bfe0ff', '#7ab0e0'], colors: (m, d, l) => [mix(m, '#ffffff', 0.6), '#3a6aa0', '#ffd75e'] },
    chips_horizon: { stripe: 'spin', spin: ['#ffe9a0', '#ff9a3a', '#a03a0a'], colors: (m, d, l) => ['#0a0810', '#000000', mix(m, '#ff7a1a', 0.5)] },
  };

  const CHIP_N = 14;
  const chipCells = (() => { // [kind, segment] per pixel, same shape as sprites.js
    const rows = []; const c = (CHIP_N - 1) / 2;
    for (let y = 0; y < CHIP_N; y++) {
      const row = [];
      for (let x = 0; x < CHIP_N; x++) {
        const dx = x - c, dy = y - c, r = Math.sqrt(dx * dx + dy * dy);
        const a = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
        if (r > 6.9) row.push(null);
        else if (r > 6.0) row.push(['o']);
        else if (r > 4.6) row.push(Math.floor(a / 45) % 2 === 0 ? ['w', Math.floor(a / 30) % 3] : ['m']);
        else if (r > 3.6) row.push(['i']);
        else row.push(['m']);
      }
      rows.push(row);
    }
    return rows;
  })();

  const chipCache = {};
  function chipSvg(setId, value) {
    const key = setId + ':' + value;
    if (chipCache[key]) return chipCache[key];
    const set = CHIP_SETS[setId];
    const [m0, d0, l0] = BASE_CHIPS[value] || BASE_CHIPS[5] || ['#d8323a', '#7a141a', '#ff8a8f'];
    const [m, d, l] = set.colors(m0, d0, l0);
    const anim = ['spin', 'rainbow', 'beat'].includes(set.stripe) ? set.stripe : null;
    const fills = { o: d, m, i: l, w: typeof set.stripe === 'function' ? set.stripe(m0) : set.stripe };
    let rects = '';
    chipCells.forEach((row, y) => row.forEach((cell, x) => {
      if (!cell) return;
      if (cell[0] === 'w' && anim) rects += `<rect class="cos-s${cell[1]}" x="${x}" y="${y}" width="1" height="1" fill="#ffd75e"/>`;
      else rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fills[cell[0]]}"/>`;
    }));
    const cls = anim ? 'px-chip cos-chip-' + anim : 'px-chip';
    const spinVars = set.spin ? ` style="--sp0:${set.spin[0]};--sp1:${set.spin[1]};--sp2:${set.spin[2]}"` : '';
    return (chipCache[key] = `<svg class="${cls}"${spinVars} viewBox="0 0 ${CHIP_N} ${CHIP_N}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`);
  }

  // Wrap the sprite function so the existing UI picks up the equipped chips without changes.
  const originalChip = root.PixelSprites ? root.PixelSprites.chip : null;
  if (root.PixelSprites) {
    root.PixelSprites.chip = function (value) {
      const id = state.equipped.chips;
      return CHIP_SETS[id] ? chipSvg(id, value) : originalChip(value);
    };
  }

  // ======================================================================
  // Catalogue
  // ======================================================================
  // `by` is the achievement that unlocks it (see achievements.js). Defaults have none.
  // ======================================================================
  // Round 4: new backs, felts, chips and faces
  // ======================================================================
  /** Back with free drawing: draw(set, f) paints the 22 x 34 inner area through set(u, v, colour). */
  function artBack(frames, dur, border, bg, draw) {
    return () => buildBack(frames, (f) => {
      const g = backFrame(border, (u, v) => bg(u, v, f), f);
      const set = (u, v, c) => { u = Math.round(u); v = Math.round(v); if (c && u >= 0 && v >= 0 && u < IW && v < IH) g[v + IN][u + IN] = c; };
      draw(set, f);
      return g;
    }, dur);
  }
  function inPoly(pts, x, y) {
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const [xi, yi] = pts[i], [xj, yj] = pts[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
    }
    return inside;
  }
  const fillPoly = (set, pts, c) => { for (let v = 0; v < IH; v++) for (let u = 0; u < IW; u++) if (inPoly(pts, u + 0.5, v + 0.5)) set(u, v, typeof c === 'function' ? c(u, v) : c); };
  const fillDisc = (set, cx, cy, r, c) => { for (let v = 0; v < IH; v++) for (let u = 0; u < IW; u++) { const d = Math.hypot(u + 0.5 - cx, v + 0.5 - cy); if (d <= r) set(u, v, typeof c === 'function' ? c(u, v, d) : c); } };
  const bits = (set, rows, x0, y0, c) => rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'X') set(x0 + x, y0 + y, c); }));
  const BIG_A = ['.XXX.', 'X...X', 'X...X', 'XXXXX', 'X...X', 'X...X', 'X...X'];
  const PIP = { s: ['..X..', '.XXX.', 'XXXXX', '..X..', '.XXX.'], h: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'] };
  const WOLF = [[0, 34], [1, 26], [3, 21], [5, 18], [6, 13], [8, 15], [9, 12], [11, 16], [15, 19], [16, 22], [12, 22], [11, 26], [13, 34]];
  const starsAt = (seed, n) => { const r = rand(seed); return Array.from({ length: n }, () => [Math.floor(r() * IW), Math.floor(r() * IH), Math.floor(r() * 8)]); };

  Object.assign(BACKS, {
    back_twinaces: artBack(1, 1, CREAM, (u, v) => (((u >> 1) + (v >> 1)) % 2 ? '#0f3a22' : '#145030'), (set) => {
      fillDisc(set, 11, 17, 10.5, (u, v, d) => (d > 9.5 ? '#ffd75e' : d > 8.7 ? '#a07818' : CREAM));
      bits(set, BIG_A, 3, 9, '#20202a'); bits(set, BIG_A, 14, 9, '#c0303a');
      bits(set, PIP.s, 3, 18, '#20202a'); bits(set, PIP.h, 14, 18, '#c0303a');
      for (let i = -3; i <= 3; i++) set(11, 17 + i, '#a07818');
    }),
    back_phoenix: artBack(1, 1, '#ffd75e', (u, v) => mix('#5a0a0a', '#1a0204', v / IH), (set) => {
      fillPoly(set, [[11, 12], [21, 3], [17, 16], [12, 19]], (u, v) => (v < 9 ? '#ffe066' : '#ff9a3a'));
      fillPoly(set, [[11, 12], [1, 3], [5, 16], [10, 19]], (u, v) => (v < 9 ? '#ffe066' : '#ff9a3a'));
      fillDisc(set, 11, 16, 3.4, '#d8323a'); fillDisc(set, 11, 10, 2.2, '#d8323a'); set(12, 9, '#ffe066'); set(13, 10, '#ff9a3a');
      fillPoly(set, [[8, 19], [14, 19], [16, 31], [11, 26], [6, 31]], (u, v) => (v > 25 ? '#ffe066' : '#ff6a2a'));
    }),
    back_moonlight: artBack(8, 2.4, '#c0c8e0', (u, v) => mix('#06081a', '#2a3a7a', v / IH), (set, f) => {
      for (const [x, y, k] of starsAt(91, 22)) if (y < 24) set(x, y, (k + f) % 8 === 0 ? '#ffffff' : (k + f) % 4 === 0 ? '#9ab0e0' : '#4a5a8a');
      fillDisc(set, 15, 8, 5, (u, v, d) => (d > 4.2 ? '#c8c2ae' : (u * 7 + v * 3) % 11 === 0 ? '#d8d2bc' : '#fbf6e6'));
      if (f >= 4) for (let i = 0; i < 3; i++) set(1 + (f - 4) * 4 + i, 3 + (f - 4) * 2 + Math.floor(i / 2), i === 2 ? '#ffffff' : '#9ab0e0');
      fillPoly(set, [[0, 34], [0, 28], [8, 25], [22, 30], [22, 34]], '#000004');
      fillPoly(set, WOLF.map(([x, y]) => [x + 2, y - 7]), '#000004');
    }),
    back_deadwood: artBack(1, 1, '#3a2410', (u, v) => {
      const plank = Math.floor(v / 6), grain = (u * 3 + plank * 17) % 13;
      if (v % 6 === 5) return '#2a1606';
      return grain === 0 ? '#5a3418' : plank % 2 ? '#7a4a24' : '#6a4020';
    }, (set) => {
      fillDisc(set, 11, 17, 8.5, (u, v, d) => (d > 7.6 ? '#3a2410' : '#e8d4a8'));
      const star = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + (i * Math.PI) / 5, r = i % 2 ? 2.6 : 6.4; star.push([11 + Math.cos(a) * r, 17 + Math.sin(a) * r]); }
      fillPoly(set, star, (u, v) => (u + v < 27 ? '#ffe9a0' : '#c8a03a'));
      fillDisc(set, 11, 17, 1.4, '#8a6a1a');
    }),
    back_bloodmoon: artBack(6, 1.8, '#5a0a10', (u, v) => mix('#2a0408', '#08020a', v / IH), (set, f) => {
      const pulse = [0, 0.4, 0.8, 1.1, 0.8, 0.4][f];
      fillDisc(set, 11, 11, 8.6 + pulse, (u, v, d) => (d > 7.8 ? '#5a0a10' : d > 7 ? '#8a0a14' : (u * 5 + v * 7) % 13 === 0 ? '#a01420' : '#d8202e'));
      for (let u = 0; u < IW; u++) if ((u + f) % 5 < 3) set(u, 20 + ((u + f) % 2), '#3a060c');
      fillPoly(set, [[0, 34], [0, 27], [9, 25], [22, 30], [22, 34]], '#05020a');
      fillPoly(set, WOLF.map(([x, y]) => [x + 3, y - 8]), '#05020a');
    }),
    back_eclipse: artBack(8, 1.6, '#ffb040', (u, v) => ((u * 13 + v * 7) % 41 === 0 ? '#5a5070' : '#05040a'), (set, f) => {
      fillDisc(set, 11, 17, 10.4, (u, v, d) => {
        const a = Math.atan2(v + 0.5 - 17, u + 0.5 - 11);
        const ray = Math.sin(a * 7 + (f * Math.PI) / 4) > 0.15;
        if (d < 7.2) return '#ffe9a0';
        if (!ray) return null;
        return d < 8.6 ? '#ff9a3a' : '#a03a0a';
      });
      fillDisc(set, 11, 17, 6.4, '#000000');
      set(8, 14, '#1c1626'); set(9, 13, '#1c1626');
    }),
  });

  BACKS.back_silverwolf = artBack(6, 2.4, '#e8ecf8', (u, v) => mix('#1a2232', '#05070c', v / IH), (set, f) => {
    for (const [x, y, k] of starsAt(113, 26)) set(x, (y + f * 2 + k) % IH, (k % 3) ? '#8a94aa' : '#ffffff');
    fillDisc(set, 11, 14, 9.5, (u, v, d) => (d > 8.8 ? '#6a6e7a' : d > 8 ? '#c8ccd8' : (u * 5 + v * 3) % 9 === 0 ? '#d8dce8' : '#eef0f6'));
    fillPoly(set, [[3, 26], [5, 18], [7, 12], [9, 15], [11, 9], [13, 14], [17, 17], [18, 20], [14, 20], [13, 26]], '#05070c');
    set(10, 15, f % 3 === 0 ? '#9ae8ff' : '#5a8ab0');
    fillPoly(set, [[0, 34], [0, 27], [22, 25], [22, 34]], '#c8ccd8');
    fillPoly(set, [[0, 34], [0, 29], [22, 27], [22, 34]], '#eef0f6');
  });
  Object.assign(FELTS, {
    felt_silverwolf: { '--felt': '#1c2230', '--felt-dot': '#19202c', '--felt-dark': '#0e121a', '--felt-line': '#e8ecf8',
                       '--rail': '#8a90a0', '--rail-light': '#c8ccd8', '--rail-dark': '#3a3e4a' },
    felt_domino:    { '--felt': '#16161c', '--felt-dot': '#121217', '--felt-dark': '#08080c', '--felt-line': '#f4f4f4',
                      '--rail': '#2a2a33', '--rail-light': '#44444f', '--rail-dark': '#121218' },
    felt_blacktie:  { '--felt': '#141018', '--felt-dot': '#100c14', '--felt-dark': '#06040a', '--felt-line': '#ffd75e',
                      '--rail': '#1a1a20', '--rail-light': '#2e2e38', '--rail-dark': '#08080c' },
    felt_howl:      { '--felt': '#101a34', '--felt-dot': '#0e172e', '--felt-dark': '#080e20', '--felt-line': '#c0d0ff',
                      '--rail': '#2a2a3a', '--rail-light': '#44445a', '--rail-dark': '#10101a' },
    felt_deadwood:  { '--felt': '#7a5a32', '--felt-dot': '#6e512d', '--felt-dark': '#4a3418', '--felt-line': '#f0dca8',
                      '--rail': '#4a2a12', '--rail-light': '#6a4020', '--rail-dark': '#24140a' },
    felt_bloodmoon: { '--felt': '#3a0a10', '--felt-dot': '#33090e', '--felt-dark': '#1e0408', '--felt-line': '#ff5a5a',
                      '--rail': '#140a0c', '--rail-light': '#2a1418', '--rail-dark': '#060204' },
    felt_eclipse:   { '--felt': '#08060c', '--felt-dot': '#060409', '--felt-dark': '#000000', '--felt-line': '#ffb040',
                      '--rail': '#16121c', '--rail-light': '#2a2232', '--rail-dark': '#06040a' },
  });
  function dominoTile() {
    const pips = [[3, 3], [5, 5], [7, 7], [19, 13], [23, 13], [19, 17], [23, 17]]; let rects = '';
    for (const [x, y] of pips) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="#f4f4f4" opacity="0.28"/>`;
    rects += '<rect x="1" y="1" width="9" height="9" fill="none" stroke="#f4f4f4" stroke-opacity="0.12" stroke-width="0.5"/><rect x="17" y="11" width="9" height="9" fill="none" stroke="#f4f4f4" stroke-opacity="0.12" stroke-width="0.5"/>';
    return svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 22" width="56" height="44" shape-rendering="crispEdges">${rects}</svg>`);
  }
  Object.assign(FELT_FX, {
    felt_silverwolf: () => [[starTile(117, 26, ['#ffffff', '#c8ccd8', '#8a94aa']), 'radial-gradient(circle at 80% 18%, rgba(238, 240, 246, 0.25) 0 7%, transparent 25%)'], ['128px 128px', '100% 100%'], ['16px 128px', '0 0'], '12s', 64],
    felt_domino: () => [[dominoTile(), 'none'], ['56px 44px', 'auto']],
    felt_blacktie: () => [['linear-gradient(110deg, transparent 0 42%, rgba(255, 215, 94, 0.10) 46%, rgba(255, 240, 180, 0.22) 50%, rgba(255, 215, 94, 0.10) 54%, transparent 58% 100%)', 'radial-gradient(rgba(255, 215, 94, 0.06) 1px, transparent 1.5px)'], ['800px 100%', '6px 6px'], ['800px 0', '0 0'], '5s', 50],
    felt_howl: () => [[starTile(97, 18, ['#ffffff', '#c0d0ff', '#6a7ab0']), 'radial-gradient(circle at 85% 15%, rgba(250, 246, 230, 0.35) 0 6%, rgba(160, 180, 255, 0.12) 7% 18%, transparent 30%)'], ['128px 128px', '100% 100%'], ['-128px 0', '0 0'], '50s', 128],
    felt_deadwood: () => [['radial-gradient(rgba(40, 20, 4, 0.18) 1px, transparent 1.5px)', 'radial-gradient(ellipse at 50% 50%, transparent 40%, rgba(30, 14, 2, 0.45) 100%)'], ['5px 5px', '100% 100%']],
    felt_bloodmoon: () => [['radial-gradient(circle at 50% -10%, rgba(255, 60, 60, 0.35), transparent 55%)', 'none'], ['100% 100%', 'auto']],
    felt_eclipse: () => [[starTile(103, 20, ['#ffffff', '#ffd0a0', '#6a6080']), 'radial-gradient(circle at 50% 45%, transparent 0 14%, rgba(255, 176, 64, 0.30) 16%, rgba(255, 120, 30, 0.10) 22%, transparent 32%)'], ['128px 128px', '100% 100%'], ['128px 128px', '0 0'], '80s', 128],
  });

  Object.assign(CHIP_SETS, {
    chips_silverwolf: { stripe: 'spin', spin: ['#ffffff', '#c8ccd8', '#6a6e7a'], colors: (m, d, l) => [mix(grey(m), '#2a3040', 0.45), '#0a0c12', '#e8ecf8'] },
    chips_duel:     { stripe: '#f4f4f4', colors: (m, d, l) => [mix(grey(m), '#000000', 0.55), '#000000', mix(grey(l), '#ffffff', 0.4)] },
    chips_twins:    { stripe: (m) => mix(m, '#000000', 0.45), colors: (m, d, l) => [m, mix(d, '#000000', 0.3), mix(m, '#ffffff', 0.75)] },
    chips_abacus:   { stripe: '#f4e0b0', colors: (m, d, l) => [mix(m, '#a0683a', 0.7), '#3a1e0a', mix(l, '#e8c890', 0.7)] },
    chips_lucky7:   { stripe: 'spin', spin: ['#ffffff', '#ff4f6a', '#ffd75e'], colors: (m, d, l) => [mix(m, '#d8a020', 0.55), '#4a3608', '#fff6c0'] },
    chips_deadwood: { stripe: '#e8c890', colors: (m, d, l) => [mix(m, '#8a6a3a', 0.6), '#2a1a0a', mix(l, '#d0b080', 0.6)] },
    chips_bloodmoon: { stripe: 'beat', colors: (m, d, l) => [mix(m, '#8a0a14', 0.7), '#100204', '#ff6a6a'] },
    chips_eclipse:  { stripe: 'spin', spin: ['#fff6c0', '#ff9a3a', '#a03a0a'], colors: (m, d, l) => ['#050508', '#000000', '#ffd75e'] },
  });

  Object.assign(FACE_FX, {
    face_silverwolf: { vars: { '--card': '#e8ecf4', '--card-ink': '#1a2030', '--card-red': '#8a1a2a' },
      shadow: 'inset 0 0 0 2px #3a3e4a, inset 0 0 0 4px #c8ccd8, inset 0 0 0 5px #6a6e7a, inset -4px -4px 0 5px #d4d8e2',
      after: 'linear-gradient(135deg, transparent 0 42%, rgba(255, 255, 255, 0.7) 46%, rgba(190, 220, 255, 0.6) 50%, transparent 56% 100%) 0 0 / 400% 100%', opacity: 0.35, anim: 'cos-holo 4s steps(40) infinite' },
    face_charlie: { vars: { '--card': '#fbf6e6', '--card-ink': '#1a347a', '--card-red': '#c0303a' },
      shadow: 'inset 0 0 0 2px #1a347a, inset 0 0 0 4px #fbf6e6, inset 0 0 0 5px #9ab0e0, inset -4px -4px 0 5px #e8e0c8' },
    face_deadwood: { vars: { '--card': '#e8d4a8', '--card-ink': '#3a2410', '--card-red': '#8a2a14' },
      shadow: 'inset 0 0 0 2px #3a2410, inset -4px -4px 0 2px #d0b888',
      after: 'radial-gradient(rgba(90, 50, 10, 0.18) 1px, transparent 1.5px) 0 0 / 5px 5px', opacity: 1 },
    face_bloodmoon: { vars: { '--card': '#eef0f6', '--card-ink': '#1e1e28', '--card-red': '#c0101e' },
      shadow: 'inset 0 0 0 2px #2a0a10, inset 0 0 0 4px #c0101e, inset -4px -4px 0 4px #dcdfe8' },
    face_eclipse: { vars: { '--card': '#100c14', '--card-ink': '#ffe9c0', '--card-red': '#ff7a3a' },
      shadow: 'inset 0 0 0 2px #000, inset 0 0 0 4px #ffb040, inset -4px -4px 0 4px #1c1620',
      after: 'linear-gradient(120deg, transparent 0 40%, rgba(255, 176, 64, 0.5) 46%, rgba(255, 240, 200, 0.6) 50%, rgba(255, 176, 64, 0.5) 54%, transparent 60% 100%) 0 0 / 400% 100%', opacity: 0.35, anim: 'cos-holo 3s steps(30) infinite' },
  });

  const CATALOG = [
    { id: 'back_classic',   type: 'back', name: 'Classic Red',   rarity: 'default' },
    { id: 'back_blue',      type: 'back', name: 'Royal Blue',    rarity: 'common',    by: 'first_hand' },
    { id: 'back_emerald',   type: 'back', name: 'Emerald',       rarity: 'common',    by: 'natural' },
    { id: 'back_charcoal',  type: 'back', name: 'Charcoal',      rarity: 'common',    by: 'bad_beat' },
    { id: 'back_argyle',    type: 'back', name: 'Argyle',        rarity: 'rare',      by: 'beat_medium' },
    { id: 'back_chevron',   type: 'back', name: 'Chevron',       rarity: 'rare',      by: 'charlie' },
    { id: 'back_waves',     type: 'back', name: 'High Tide',     rarity: 'rare',      by: 'meltdown' },
    { id: 'back_tartan',    type: 'back', name: 'Tartan',        rarity: 'rare',      by: 'veteran' },
    { id: 'back_lucky7',    type: 'back', name: 'Lucky 7',       rarity: 'epic',      by: 'beat_hard' },
    { id: 'back_crown',     type: 'back', name: 'Crown Jewels',  rarity: 'epic',      by: 'double_natural' },
    { id: 'back_ace',       type: 'back', name: 'Ace of Spades', rarity: 'epic',      by: 'black_jack' },
    { id: 'back_moon',      type: 'back', name: 'Midnight Moon', rarity: 'epic',      by: 'endless_10k' },
    { id: 'back_neon',      type: 'back', name: 'Neon Marquee',  rarity: 'legendary', by: 'beat_expert',  animated: true },
    { id: 'back_goldrush',  type: 'back', name: 'Gold Rush',     rarity: 'legendary', by: 'grand_slam',   animated: true },
    { id: 'back_inferno',   type: 'back', name: 'Inferno',       rarity: 'legendary', by: 'hat_trick',    animated: true },
    { id: 'back_starfield', type: 'back', name: 'Starfield',     rarity: 'legendary', by: 'whale',        animated: true },
    { id: 'back_orange',    type: 'back', name: 'Sunset',        rarity: 'common',    by: 'winner' },
    { id: 'back_pink',      type: 'back', name: 'Bubblegum',     rarity: 'common',    by: 'bj_5' },
    { id: 'back_polka',     type: 'back', name: 'Polka Dot',     rarity: 'rare',      by: 'centurion' },
    { id: 'back_herringbone', type: 'back', name: 'Herringbone', rarity: 'rare',      by: 'bj_25' },
    { id: 'back_lattice',   type: 'back', name: 'Lattice',       rarity: 'rare',      by: 'double_agent' },
    { id: 'back_scales',    type: 'back', name: 'Dragon Scales', rarity: 'rare',      by: 'bust_collector' },
    { id: 'back_kaleido',   type: 'back', name: 'Kaleidoscope',  rarity: 'rare',      by: 'mirror_match' },
    { id: 'back_dice',      type: 'back', name: 'Snake Eyes',    rarity: 'epic',      by: 'five_hundred' },
    { id: 'back_cherry',    type: 'back', name: 'Cherries',      rarity: 'epic',      by: 'bj_100' },
    { id: 'back_skull',     type: 'back', name: 'Skull',         rarity: 'epic',      by: 'lifer' },
    { id: 'back_slots',     type: 'back', name: 'Jackpot',       rarity: 'legendary', by: 'legend',       animated: true },
    { id: 'back_prism',     type: 'back', name: 'Prismatic',     rarity: 'legendary', by: 'bj_250',       animated: true },
    { id: 'back_heartbreak', type: 'back', name: 'Heartbreak',  rarity: 'secret',    by: 'worst_beat',   animated: true, set: 'Heartbreak' },
    { id: 'felt_heartbreak', type: 'felt', name: 'Heartbreak',  rarity: 'secret',    by: 'worst_beat',   animated: true, set: 'Heartbreak' },
    { id: 'chips_heartbreak', type: 'chips', name: 'Heartbreak', rarity: 'secret',   by: 'worst_beat',   animated: true, set: 'Heartbreak' },
    { id: 'face_heartbreak', type: 'face', name: 'Heartbreak',  rarity: 'secret',    by: 'worst_beat',   set: 'Heartbreak' },
    { id: 'back_mint',      type: 'back', name: 'Mint',          rarity: 'common',    by: 'full_table' },
    { id: 'back_candystripe', type: 'back', name: 'Candy Cane',  rarity: 'rare',      by: 'dealer_streak' },
    { id: 'back_circuit',   type: 'back', name: 'Circuit',       rarity: 'rare',      by: 'last_standing' },
    { id: 'back_orbit',     type: 'back', name: 'Orbit',         rarity: 'rare',      by: 'endless_easy' },
    { id: 'back_allin',     type: 'back', name: 'All In',        rarity: 'epic',      by: 'all_in' },
    { id: 'back_hilo',      type: 'back', name: 'Hi-Lo',         rarity: 'epic',      by: 'counter' },
    { id: 'back_horizon',   type: 'back', name: 'Event Horizon', rarity: 'legendary', by: 'endless_expert', animated: true, set: 'Event Horizon' },
    { id: 'back_platinum',  type: 'back', name: 'Platinum',      rarity: 'secret',    by: 'completionist', animated: true, set: 'Platinum' },
    { id: 'back_kinghearts', type: 'back', name: 'King of Hearts', rarity: 'secret',  by: 'suited_royalty', animated: true, set: 'King of Hearts' },
    { id: 'back_heaven',    type: 'back', name: 'Seventh Heaven', rarity: 'secret',   by: 'seventh_heaven', animated: true, set: 'Seventh Heaven' },
    { id: 'back_storm',     type: 'back', name: 'Thunderstorm',  rarity: 'legendary', by: 'six_shooter',  animated: true },

    { id: 'felt_classic',   type: 'felt', name: 'Casino Green',  rarity: 'default' },
    { id: 'felt_blue',      type: 'felt', name: 'Ocean Blue',    rarity: 'common',    by: 'insured' },
    { id: 'felt_crimson',   type: 'felt', name: 'Crimson',       rarity: 'rare',      by: 'beat_easy' },
    { id: 'felt_purple',    type: 'felt', name: 'Velvet',        rarity: 'rare',      by: 'endless_2500' },
    { id: 'felt_blackgold', type: 'felt', name: 'Black & Gold',  rarity: 'epic',      by: 'hot_streak' },
    { id: 'felt_galaxy',    type: 'felt', name: 'Galaxy',        rarity: 'legendary', by: 'endless_all',  animated: true },
    { id: 'felt_forest',    type: 'felt', name: 'Forest',        rarity: 'common',    by: 'photo_finish' },
    { id: 'felt_nebula',    type: 'felt', name: 'Nebula',        rarity: 'epic',      by: 'endless_medium' },
    { id: 'felt_horizon',   type: 'felt', name: 'Event Horizon', rarity: 'legendary', by: 'endless_expert', animated: true, set: 'Event Horizon' },
    { id: 'felt_platinum',  type: 'felt', name: 'Platinum',      rarity: 'secret',    by: 'completionist', animated: true, set: 'Platinum' },
    { id: 'felt_kinghearts', type: 'felt', name: 'King of Hearts', rarity: 'secret',  by: 'suited_royalty', set: 'King of Hearts' },
    { id: 'felt_heaven',    type: 'felt', name: 'Seventh Heaven', rarity: 'secret',   by: 'seventh_heaven', animated: true, set: 'Seventh Heaven' },
    { id: 'felt_teal',      type: 'felt', name: 'Lagoon',        rarity: 'common',    by: 'doubled_up' },
    { id: 'felt_midnight',  type: 'felt', name: 'Midnight',      rarity: 'rare',      by: 'bankroll' },
    { id: 'felt_glacier',   type: 'felt', name: 'Glacier',       rarity: 'epic',      by: 'fortune' },
    { id: 'felt_aurora',    type: 'felt', name: 'Aurora',        rarity: 'legendary', by: 'millionaire',  animated: true },

    { id: 'chips_classic',  type: 'chips', name: 'Casino',       rarity: 'default' },
    { id: 'chips_pastel',   type: 'chips', name: 'Pastel',       rarity: 'common',    by: 'high_roller' },
    { id: 'chips_noir',     type: 'chips', name: 'Noir',         rarity: 'rare',      by: 'double_trouble' },
    { id: 'chips_vip',      type: 'chips', name: 'VIP Gold',     rarity: 'epic',      by: 'triple_seven' },
    { id: 'chips_spin',     type: 'chips', name: 'Spinning Gold', rarity: 'legendary', by: 'four_of_a_kind', animated: true },
    { id: 'chips_ocean',    type: 'chips', name: 'Ocean',        rarity: 'common',    by: 'fold' },
    { id: 'chips_jade',     type: 'chips', name: 'Jade',         rarity: 'rare',      by: 'big_score' },
    { id: 'chips_neon',     type: 'chips', name: 'Neon',         rarity: 'epic',      by: 'table_sweep' },
    { id: 'chips_candy',    type: 'chips', name: 'Candy',        rarity: 'common',    by: 'lucky_break' },
    { id: 'chips_mars',     type: 'chips', name: 'Red Planet',   rarity: 'epic',      by: 'endless_hard' },
    { id: 'chips_horizon',  type: 'chips', name: 'Event Horizon', rarity: 'legendary', by: 'endless_expert', animated: true, set: 'Event Horizon' },
    { id: 'chips_rainbow',  type: 'chips', name: 'Platinum',     rarity: 'secret',    by: 'completionist', animated: true, set: 'Platinum' },
    { id: 'chips_kinghearts', type: 'chips', name: 'King of Hearts', rarity: 'secret', by: 'suited_royalty', animated: true, set: 'King of Hearts' },
    { id: 'chips_heaven',   type: 'chips', name: 'Seventh Heaven', rarity: 'secret',  by: 'seventh_heaven', animated: true, set: 'Seventh Heaven' },

    { id: 'face_classic',   type: 'face', name: 'Classic',       rarity: 'default' },
    { id: 'face_fourcolor', type: 'face', name: 'Four-Colour',   rarity: 'common',    by: 'regular' },
    { id: 'face_ivory',     type: 'face', name: 'Ivory & Gold',  rarity: 'rare',      by: 'split_sweep' },
    { id: 'face_noir',      type: 'face', name: 'Noir',          rarity: 'epic',      by: 'comeback' },
    { id: 'face_holo',      type: 'face', name: 'Holo Foil',     rarity: 'legendary', by: 'flawless',     animated: true },
    { id: 'face_newsprint', type: 'face', name: 'Newsprint',     rarity: 'common',    by: 'overinsured' },
    { id: 'face_void',      type: 'face', name: 'Event Horizon', rarity: 'legendary', by: 'endless_expert', set: 'Event Horizon' },
    { id: 'face_platinum',  type: 'face', name: 'Platinum',      rarity: 'secret',    by: 'completionist', animated: true, set: 'Platinum' },
    { id: 'face_kinghearts', type: 'face', name: 'King of Hearts', rarity: 'secret',  by: 'suited_royalty', set: 'King of Hearts' },
    { id: 'face_heaven',    type: 'face', name: 'Seventh Heaven', rarity: 'secret',   by: 'seventh_heaven', animated: true, set: 'Seventh Heaven' },
    { id: 'face_retro',     type: 'face', name: 'Handheld',      rarity: 'common',    by: 'pocket_money' },
    { id: 'face_royal',     type: 'face', name: 'Royal Purple',  rarity: 'rare',      by: 'soft_touch' },
    { id: 'face_gilded',    type: 'face', name: 'Gilded',        rarity: 'legendary', by: 'untouchable',  animated: true },
  ];
  // Keep each type ordered from default to legendary.
  CATALOG.push(
    { id: 'back_twinaces',   type: 'back',  name: 'Twin Aces',   rarity: 'rare',      by: 'twin_aces' },
    { id: 'back_phoenix',    type: 'back',  name: 'Phoenix',     rarity: 'rare',      by: 'phoenix' },
    { id: 'back_moonlight',  type: 'back',  name: 'Moonlight',   rarity: 'legendary', by: 'lone_wolf', animated: true },
    { id: 'felt_domino',     type: 'felt',  name: 'Domino',      rarity: 'epic',      by: 'dealer_collapse' },
    { id: 'felt_blacktie',   type: 'felt',  name: 'Black Tie',   rarity: 'legendary', by: 'high_society', animated: true },
    { id: 'felt_howl',       type: 'felt',  name: 'Howl',        rarity: 'legendary', by: 'wolf_expert', animated: true },
    { id: 'chips_duel',      type: 'chips', name: 'Duel',        rarity: 'rare',      by: 'standoff' },
    { id: 'chips_twins',     type: 'chips', name: 'Twins',       rarity: 'epic',      by: 'split_double' },
    { id: 'chips_abacus',    type: 'chips', name: 'Abacus',      rarity: 'epic',      by: 'pro_counter' },
    { id: 'chips_lucky7',    type: 'chips', name: 'Lucky Seven', rarity: 'legendary', by: 'seven_up', animated: true },
    { id: 'face_charlie',    type: 'face',  name: 'Charlie',     rarity: 'epic',      by: 'seven_charlie' },
    { id: 'back_deadwood',   type: 'back',  name: 'Deadwood',    rarity: 'secret', by: 'dead_mans_hand', set: 'Deadwood' },
    { id: 'felt_deadwood',   type: 'felt',  name: 'Deadwood',    rarity: 'secret', by: 'dead_mans_hand', set: 'Deadwood' },
    { id: 'chips_deadwood',  type: 'chips', name: 'Deadwood',    rarity: 'secret', by: 'dead_mans_hand', set: 'Deadwood' },
    { id: 'face_deadwood',   type: 'face',  name: 'Deadwood',    rarity: 'secret', by: 'dead_mans_hand', set: 'Deadwood' },
    { id: 'back_bloodmoon',  type: 'back',  name: 'Blood Moon',  rarity: 'secret', by: 'wolf_endless', animated: true, set: 'Blood Moon' },
    { id: 'felt_bloodmoon',  type: 'felt',  name: 'Blood Moon',  rarity: 'secret', by: 'wolf_endless', set: 'Blood Moon' },
    { id: 'chips_bloodmoon', type: 'chips', name: 'Blood Moon',  rarity: 'secret', by: 'wolf_endless', animated: true, set: 'Blood Moon' },
    { id: 'face_bloodmoon',  type: 'face',  name: 'Blood Moon',  rarity: 'secret', by: 'wolf_endless', set: 'Blood Moon' },
    { id: 'back_silverwolf',  type: 'back',  name: 'Silver Wolf', rarity: 'secret', by: 'wolf_endless_expert', animated: true, set: 'Silver Wolf' },
    { id: 'felt_silverwolf',  type: 'felt',  name: 'Silver Wolf', rarity: 'secret', by: 'wolf_endless_expert', animated: true, set: 'Silver Wolf' },
    { id: 'chips_silverwolf', type: 'chips', name: 'Silver Wolf', rarity: 'secret', by: 'wolf_endless_expert', animated: true, set: 'Silver Wolf' },
    { id: 'face_silverwolf',  type: 'face',  name: 'Silver Wolf', rarity: 'secret', by: 'wolf_endless_expert', animated: true, set: 'Silver Wolf' },
    { id: 'back_eclipse',    type: 'back',  name: 'Eclipse',     rarity: 'insanity', by: 'darkest_run', animated: true, set: 'Eclipse' },
    { id: 'felt_eclipse',    type: 'felt',  name: 'Eclipse',     rarity: 'insanity', by: 'darkest_run', animated: true, set: 'Eclipse' },
    { id: 'chips_eclipse',   type: 'chips', name: 'Eclipse',     rarity: 'insanity', by: 'darkest_run', animated: true, set: 'Eclipse' },
    { id: 'face_eclipse',    type: 'face',  name: 'Eclipse',     rarity: 'insanity', by: 'darkest_run', animated: true, set: 'Eclipse' },
  );  // Titles: one equipped at a time, shown on the Profile.
  CATALOG.push(
    { id: 'title_none', type: 'title', name: 'No title', rarity: 'default' },
    { id: 'title_split_first', type: 'title', name: "The Splitter", rarity: 'common', by: 'split_first' },
    { id: 'title_push_first', type: 'title', name: "Even Steven", rarity: 'common', by: 'push_first' },
    { id: 'title_overeager', type: 'title', name: "The Optimist", rarity: 'common', by: 'overeager' },
    { id: 'title_company', type: 'title', name: "The Host", rarity: 'common', by: 'company' },
    { id: 'title_doubler', type: 'title', name: "Doubler", rarity: 'common', by: 'doubler' },
    { id: 'title_penny_pincher', type: 'title', name: "Penny Pincher", rarity: 'common', by: 'penny_pincher' },
    { id: 'title_soft_21', type: 'title', name: "Soft Hands", rarity: 'common', by: 'soft_21' },
    { id: 'title_tourist', type: 'title', name: "Tourist", rarity: 'common', by: 'tourist' },
    { id: 'title_corner_regular', type: 'title', name: "Tito's Friend", rarity: 'rare', by: 'corner_regular' },
    { id: 'title_hotel_guest', type: 'title', name: "Hotel Guest", rarity: 'rare', by: 'hotel_guest' },
    { id: 'title_tactical_retreat', type: 'title', name: "The Tactician", rarity: 'rare', by: 'tactical_retreat' },
    { id: 'title_daredevil', type: 'title', name: "Daredevil", rarity: 'rare', by: 'daredevil' },
    { id: 'title_last_chip', type: 'title', name: "Survivor", rarity: 'rare', by: 'last_chip' },
    { id: 'title_night_shift', type: 'title', name: "Night Owl", rarity: 'rare', by: 'night_shift' },
    { id: 'title_neon_owl', type: 'title', name: "Vinnie's Pal", rarity: 'epic', by: 'neon_owl' },
    { id: 'title_vip_member', type: 'title', name: "VIP", rarity: 'epic', by: 'vip_member' },
    { id: 'title_steady_hands', type: 'title', name: "Steady Hands", rarity: 'epic', by: 'steady_hands' },
    { id: 'title_by_the_book', type: 'title', name: "By the Book", rarity: 'epic', by: 'by_the_book' },
    { id: 'title_speedrun', type: 'title', name: "Speedrunner", rarity: 'epic', by: 'speedrun' },
    { id: 'title_rigged', type: 'title', name: "Conspiracy Theorist", rarity: 'legendary', by: 'rigged', animated: true },
    { id: 'title_professor', type: 'title', name: "Professor", rarity: 'legendary', by: 'professor', animated: true },
    { id: 'title_lifetime', type: 'title', name: "Part of the Furniture", rarity: 'legendary', by: 'lifetime', animated: true },
    { id: 'title_lone_wolf', type: 'title', name: "Lone Wolf", rarity: 'legendary', by: 'lone_wolf', animated: true },
    { id: 'title_wolf_expert', type: 'title', name: "Alpha", rarity: 'legendary', by: 'wolf_expert', animated: true },
    { id: 'title_high_society', type: 'title', name: "High Society", rarity: 'legendary', by: 'high_society', animated: true },
    { id: 'title_bankrupt', type: 'title', name: "Broke", rarity: 'common', by: 'bankrupt' },
    { id: 'title_shuffler', type: 'title', name: "Shuffler", rarity: 'common', by: 'shuffler' },
    { id: 'title_perfect_pair', type: 'title', name: "Twin Souls", rarity: 'common', by: 'perfect_pair' },
    { id: 'title_insomniac', type: 'title', name: "Insomniac", rarity: 'common', by: 'insomniac' },
    { id: 'title_halfway', type: 'title', name: "Climber", rarity: 'common', by: 'halfway' },
    { id: 'title_bot_whisperer', type: 'title', name: "Bot Whisperer", rarity: 'rare', by: 'bot_whisperer' },
    { id: 'title_disciplined', type: 'title', name: "Disciplined", rarity: 'rare', by: 'disciplined' },
    { id: 'title_nerves_of_steel', type: 'title', name: "Ice Cold", rarity: 'rare', by: 'nerves_of_steel' },
    { id: 'title_weekend_warrior', type: 'title', name: "Regular Face", rarity: 'rare', by: 'weekend_warrior' },
    { id: 'title_phoenix', type: 'title', name: "Phoenix", rarity: 'rare', by: 'phoenix' },
    { id: 'title_split_blackjack', type: 'title', name: "Sharp Edge", rarity: 'rare', by: 'split_blackjack' },
    { id: 'title_full_recovery', type: 'title', name: "Unbreakable", rarity: 'epic', by: 'full_recovery' },
    { id: 'title_pro_counter', type: 'title', name: "The Count", rarity: 'epic', by: 'pro_counter' },
    { id: 'title_double_or_nothing', type: 'title', name: "Double or Nothing", rarity: 'epic', by: 'double_or_nothing' },
    { id: 'title_seven_up', type: 'title', name: "Seven Up", rarity: 'legendary', by: 'seven_up', animated: true },
    { id: 'title_dead_mans_hand', type: 'title', name: "Gunslinger", rarity: 'secret', by: 'dead_mans_hand', animated: true },
    { id: 'title_wolf_endless', type: 'title', name: "Blood Moon", rarity: 'secret', by: 'wolf_endless', animated: true },
    { id: 'title_wolf_endless_expert', type: 'title', name: "Silver Fang", rarity: 'secret', by: 'wolf_endless_expert', animated: true },
    { id: 'title_darkest_run', type: 'title', name: "Eclipse", rarity: 'insanity', by: 'darkest_run', animated: true },
  );
  const RANK = { default: 0, common: 1, rare: 2, epic: 3, legendary: 4, secret: 5, insanity: 6 };
  const TYPE_ORDER = { back: 0, felt: 1, chips: 2, face: 3, title: 4 };
  CATALOG.sort((a, b) => TYPE_ORDER[a.type] - TYPE_ORDER[b.type] || RANK[a.rarity] - RANK[b.rarity]);
  const byId = Object.fromEntries(CATALOG.map((c) => [c.id, c]));

  // ======================================================================
  // State
  // ======================================================================
  const SAVE_KEY = 'blackjack-cosmetics-v1';
  const DEFAULTS = { back: 'back_classic', felt: 'felt_classic', chips: 'chips_classic', face: 'face_classic', title: 'title_none' };
  const state = { equipped: Object.assign({}, DEFAULTS), previewAll: false, name: 'Player' };
  try {
    const raw = root.localStorage.getItem(SAVE_KEY);
    if (raw) { const s = JSON.parse(raw); Object.assign(state.equipped, s.equipped || {}); if (typeof s.name === 'string' && s.name.trim()) state.name = s.name; }
  } catch (e) { /* no storage: defaults */ }
  function persist() {
    try { root.localStorage.setItem(SAVE_KEY, JSON.stringify({ equipped: state.equipped, name: state.name })); } catch (e) { /* ignore */ }
  }

  function isUnlocked(id) {
    const item = byId[id];
    if (!item) return false;
    if (!item.by || state.previewAll) return true;
    return !!(root.Achievements && root.Achievements.isUnlocked(item.by));
  }

  // ======================================================================
  // Applying
  // ======================================================================
  const backCache = {};
  function backArt(id) {
    if (!BACKS[id]) return null;
    return backCache[id] || (backCache[id] = BACKS[id]());
  }
  let galaxyLayers = null;
  function galaxy() {
    return galaxyLayers || (galaxyLayers = [starTile(11, 18, ['#ffffff', '#9ad0ff', '#ffe9a0']), starTile(23, 30, ['#6a6aa8', '#4a4a8a', '#8a6ab0'])]);
  }

  function apply() {
    injectFx();
    const html = doc.documentElement;
    // fall back to defaults for anything no longer unlocked (e.g. after leaving preview mode)
    for (const t of Object.keys(DEFAULTS)) if (!isUnlocked(state.equipped[t])) state.equipped[t] = DEFAULTS[t];
    const eq = state.equipped;

    // card back
    const art = backArt(eq.back);
    if (art) {
      html.dataset.cosBack = eq.back;
      html.style.setProperty('--cos-back-img', art.url);
      html.style.setProperty('--cos-back-frames', art.frames);
      html.style.setProperty('--cos-back-dur', art.dur + 's');
      if (art.frames > 1) html.dataset.cosBackAnim = ''; else delete html.dataset.cosBackAnim;
    } else {
      delete html.dataset.cosBack; delete html.dataset.cosBackAnim;
    }

    // felt
    // Felt variables go on .table (not <html>) so an equipped felt wins over a scene that sets them on <body>.
    // With the default felt nothing is set, and the scene's own felt shows.
    let feltStyle = doc.getElementById('cos-felt-style');
    if (!feltStyle) { feltStyle = doc.createElement('style'); feltStyle.id = 'cos-felt-style'; doc.head.appendChild(feltStyle); }
    const felt = FELTS[eq.felt];
    feltStyle.textContent = felt ? `.table { ${Object.entries(felt).map(([k, v]) => `${k}: ${v};`).join(' ')} }` : '';
    html.dataset.cosFelt = eq.felt;
    if (eq.felt === 'felt_galaxy') {
      const [a, b] = galaxy();
      html.style.setProperty('--cos-stars-a', a);
      html.style.setProperty('--cos-stars-b', b);
    }

    // face and chips
    html.dataset.cosFace = eq.face;
    html.dataset.cosChips = eq.chips;

    doc.dispatchEvent(new CustomEvent('cosmetics:change', { detail: Object.assign({}, eq) }));
  }

  function equip(type, id) {
    if (!byId[id] || byId[id].type !== type || !isUnlocked(id)) return false;
    state.equipped[type] = id;
    persist();
    apply();
    return true;
  }

  // ======================================================================
  // Previews
  // ======================================================================
  const SAMPLE_FACE = (s) => (root.PixelSprites ? root.PixelSprites.suit(s) : s);
  function swatch(item) {
    switch (item.type) {
      case 'back': {
        const art = backArt(item.id);
        if (!art) return '<div class="cos-sw-card cos-classic-back" aria-hidden="true"></div>';
        const anim = art.frames > 1 ? ' cos-anim' : '';
        return `<div class="cos-sw-card cos-back-art${anim}" style="--img:${art.url.replace(/"/g, '&quot;')};--frames:${art.frames};--dur:${art.dur}s" aria-hidden="true"></div>`;
      }
      case 'felt': {
        const vars = Object.assign({}, FELTS[item.id] || {});
        if (item.id === 'felt_galaxy') { const [a, b] = galaxy(); vars['--cos-stars-a'] = a; vars['--cos-stars-b'] = b; }
        const style = Object.entries(vars).map(([k, v]) => `${k}:${v}`).join(';').replace(/"/g, '&quot;');
        return `<div class="cos-sw-felt" data-felt="${item.id}" style="${style}" aria-hidden="true"><span></span></div>`;
      }
      case 'chips': {
        const chip = (v) => (CHIP_SETS[item.id] ? chipSvg(item.id, v) : originalChip ? originalChip(v) : '');
        return `<div class="cos-sw-chips" aria-hidden="true">${[5, 100, 500].map(chip).join('')}</div>`;
      }
      case 'face':
        return `<div class="cos-sw-faces" data-face="${item.id}" aria-hidden="true">
          <div class="card red" aria-label="A♥"><span class="corner"><span class="rank">A</span>${SAMPLE_FACE('♥')}</span><span class="pip">${SAMPLE_FACE('♥')}</span></div>
          <div class="card" aria-label="K♣"><span class="corner"><span class="rank">K</span>${SAMPLE_FACE('♣')}</span><span class="pip">${SAMPLE_FACE('♣')}</span></div>
          <div class="card red" aria-label="7♦"><span class="corner"><span class="rank">7</span>${SAMPLE_FACE('♦')}</span><span class="pip">${SAMPLE_FACE('♦')}</span></div></div>`;
      case 'title':
        return `<div class="cos-sw-title">${titleHtml(item)}</div>`;
      default: return '';
    }
  }
  /** A title as a coloured plate. Legendary and secret titles shimmer. */
  function titleHtml(item, big) {
    if (!item || item.id === 'title_none') return `<span class="cos-title cos-title-none${big ? ' big' : ''}">No title</span>`;
    const r = RARITIES[item.rarity];
    return `<span class="cos-title${item.animated ? ' shine' : ''}${big ? ' big' : ''}" style="--rar:${r.color}">${esc(item.name)}</span>`;
  }

  // ======================================================================
  // Locker screen
  // ======================================================================
  let lockerEl = null;
  let lockerTab = 'achievements';
  let lockerOnly = null;
  function esc(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

  function fmtN(n) { return Math.round(n || 0).toLocaleString('en-US'); }
  function profileBody() {
    const A = root.Achievements;
    const st = A && A.stats ? A.stats() : {};
    const eq = state.equipped;
    const t = byId[eq.title];
    const pieces = ['back', 'felt', 'chips', 'face'].map((k) => byId[eq[k]]).filter(Boolean);
    const setName = pieces.length === 4 && pieces[0].set && pieces.every((p) => p.set === pieces[0].set) ? pieces[0].set : null;
    const M = root.Modes && root.Modes.load ? root.Modes.load() : {};
    const best = Math.max(0, ...Object.values(M.endless || {}).map((r) => (r && r.best) || 0), M.endlessBest || 0);
    const beaten = Object.values(M.challengeWins || {}).filter(Boolean).length;
    const achTotal = A ? A.list().length : 0;
    const achGot = A ? A.list().filter((a) => A.isUnlocked(a.id)).length : 0;
    const titlesOwned = CATALOG.filter((c) => c.type === 'title' && c.id !== 'title_none' && isUnlocked(c.id)).length;
    const winRate = st.hands ? ((st.handsWon / st.hands) * 100).toFixed(1) + '%' : '-';
    const stats = [[fmtN(st.hands), 'Hands played'], [fmtN(st.handsWon), 'Hands won'], [winRate, 'Win rate'], [fmtN(st.blackjacks), 'Blackjacks'],
      [fmtN(st.chipsWon), 'Chips won'], [fmtN(best), 'Best Endless'], [`${beaten} / 4`, 'Challenges beaten'], [`${achGot} / ${achTotal}`, 'Achievements'], [fmtN(titlesOwned), 'Titles']];
    const KIND = { back: 'Back', felt: 'Felt', chips: 'Chips', face: 'Faces' };
    return `<div class="cos-profile">
      <div>
        <label class="cos-pf-k" for="cos-pf-name">NAME</label>
        <input class="cos-pf-name" id="cos-pf-name" data-name maxlength="16" value="${esc(state.name)}" autocomplete="off" spellcheck="false">
        <div class="cos-pf-k">TITLE</div>
        <div class="cos-pf-title">${titleHtml(t, true)}<button type="button" class="cos-pf-btn" data-tab="title">Change</button></div>
        <div class="cos-pf-k">EQUIPPED</div>
        <div class="cos-pf-eq">${pieces.map((p) => `<figure><div class="cos-pf-sw">${swatch(p)}</div><figcaption>${KIND[p.type]}: ${esc(p.name)}</figcaption></figure>`).join('')}</div>
        ${setName ? `<div class="cos-pf-set" style="--rar:${RARITIES[pieces[0].rarity].color}">Full set: ${esc(setName)}</div>` : ''}
      </div>
      <div>
        <div class="cos-pf-k">STATS</div>
        <div class="cos-pf-stats">${stats.map(([v, k]) => `<div><b>${v}</b><span>${k}</span></div>`).join('')}</div>
      </div>
    </div>`;
  }

  function lockerBody() {
    const A = root.Achievements;
    if (lockerTab === 'profile') return profileBody();
    if (lockerTab === 'achievements') {
      if (!A) return '<p class="cos-empty">Achievements are not loaded.</p>';
      return `<ul class="cos-ach-list">${A.list().map((a) => {
        const got = A.isUnlocked(a.id);
        const rewards = CATALOG.filter((c) => c.by === a.id);
        const reward = rewards[0];
        const rewardName = rewards.length > 1 ? `${reward.set} set (${rewards.length} items)` : reward ? reward.name : '';
        const r = RARITIES[a.rarity];
        const prog = !got && a.progress ? a.progress() : null;
        const shown = A.shown(a.id);
        return `<li class="cos-ach ${got ? 'got' : 'locked'}" style="--rar:${r.color}">
          <div class="cos-ach-icon">${(got || !a.secret) && root.AchievementIcons ? root.AchievementIcons.html(a.id, 32) : '?'}</div>
          <div class="cos-ach-text">
            <div class="cos-ach-name">${esc(shown.name)} <span class="cos-rar">${r.name}</span></div>
            <div class="cos-ach-desc">${esc(shown.desc)}</div>
            ${prog ? `<div class="cos-bar"><span style="width:${Math.min(100, (prog[0] / prog[1]) * 100)}%"></span></div><div class="cos-ach-desc">${prog[0]} / ${prog[1]}</div>` : ''}
          </div>
          ${reward && !(a.secret && !got) ? `<div class="cos-ach-reward" title="${esc(rewardName)}">${swatch(reward)}<span>${esc(rewardName)}</span></div>` : ''}
        </li>`;
      }).join('')}</ul>`;
    }
    const items = CATALOG.filter((c) => c.type === lockerTab);
    return `<div class="cos-grid">${items.map((item) => {
      const open = isUnlocked(item.id);
      const on = state.equipped[item.type] === item.id;
      const ach = item.by && A ? A.get(item.by) : null;
      const r = RARITIES[item.rarity];
      return `<button type="button" class="cos-item${open ? '' : ' locked'}${on ? ' on' : ''}" data-equip="${item.id}" ${open ? '' : 'disabled'} style="--rar:${r.color}">
        <div class="cos-item-art">${!open && ach && ach.secret ? '<div class="cos-sw-card cos-secret-art"></div>' : swatch(item)}${open ? '' : '<div class="cos-lock">?</div>'}</div>
        <div class="cos-item-name">${open || !(ach && ach.secret) ? esc(item.name) : '???'}</div>
        <div class="cos-rar">${r.name}${item.animated && (open || !(ach && ach.secret)) ? ' · animated' : ''}</div>
        <div class="cos-item-how">${on ? 'Equipped' : open ? 'Click to equip' : ach ? esc(A.shown(ach.id).desc) : ''}</div>
      </button>`;
    }).join('')}</div>`;
  }

  function renderLocker() {
    if (!lockerEl) return;
    const A = root.Achievements;
    const total = A ? A.list().length : 0;
    const got = A ? A.list().filter((a) => A.isUnlocked(a.id)).length : 0;
    let title = 'Collection';
    let tabs = [{ id: 'profile', name: 'Profile' }, { id: 'achievements', name: 'Achievements' }].concat(TYPES);
    let count = `${got} / ${total} achievements`;
    if (lockerOnly === 'achievements') {
      title = 'Achievements'; tabs = []; lockerTab = 'achievements';
    } else if (lockerOnly === 'profile') {
      title = 'Profile'; tabs = [{ id: 'profile', name: 'Profile' }, { id: 'title', name: 'Titles' }];
      if (!['profile', 'title'].includes(lockerTab)) lockerTab = 'profile';
      count = state.name;
    } else if (lockerOnly === 'cosmetics') {
      title = 'Cosmetics'; tabs = TYPES.slice();
      if (!TYPES.some((t) => t.id === lockerTab)) lockerTab = TYPES[0].id;
      const owned = CATALOG.filter((c) => isUnlocked(c.id)).length;
      count = `${owned} / ${CATALOG.length} unlocked`;
    }
    lockerEl.innerHTML = `
      <div class="cos-panel" role="dialog" aria-modal="true" aria-label="${title}">
        <header class="cos-head">
          <h2>${title}</h2>
          <span class="cos-count">${count}</span>
          <button type="button" class="cos-close" data-close aria-label="Close">X</button>
        </header>
        ${tabs.length ? `<nav class="cos-tabs">${tabs.map((t) => `<button type="button" class="${t.id === lockerTab ? 'on' : ''}" data-tab="${t.id}">${t.name}</button>`).join('')}</nav>` : ''}
        <div class="cos-body">${lockerBody()}</div>
      </div>`;
  }

  /** opts.only: 'achievements' (just the list) or 'cosmetics' (just the item tabs). Without it: everything. */
  function openLocker(tab, opts) {
    lockerOnly = (opts && opts.only) || null;
    if (tab) lockerTab = tab;
    if (!lockerEl) {
      lockerEl = doc.createElement('div');
      lockerEl.className = 'cos-locker';
      lockerEl.addEventListener('click', (e) => {
        const t = e.target.closest('[data-tab],[data-equip],[data-close]');
        if (e.target === lockerEl || (t && t.hasAttribute('data-close'))) return closeLocker();
        if (!t) return;
        if (t.dataset.tab) { lockerTab = t.dataset.tab; renderLocker(); }
        if (t.dataset.equip) { const it = byId[t.dataset.equip]; equip(it.type, it.id); renderLocker(); }
      });
      lockerEl.addEventListener('change', (e) => {
        if (!e.target.matches('[data-name]')) return;
        state.name = e.target.value.trim().slice(0, 16) || 'Player';
        persist(); renderLocker();
      });
      doc.addEventListener('keydown', (e) => { if (e.key === 'Escape' && lockerEl && !lockerEl.hidden) closeLocker(); });
      doc.body.appendChild(lockerEl);
    }
    lockerEl.hidden = false;
    renderLocker();
    const b = lockerEl.querySelector('.cos-close'); if (b) b.focus();
  }
  function closeLocker() { if (lockerEl) lockerEl.hidden = true; doc.dispatchEvent(new CustomEvent('cosmetics:close')); }

  /** Testing aid: treat everything as unlocked without saving it. */
  function setPreviewAll(on) { state.previewAll = !!on; apply(); renderLocker(); }

  // Apply once everything (including achievements.js) has loaded.
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', apply); else setTimeout(apply, 0);

  root.Cosmetics = {
    /** CSS variables of the equipped felt, or null for the default felt (scenes use this to match their painted edges). */
    feltVars: () => FELTS[state.equipped.felt] || null,
    RARITIES, TYPES, CATALOG,
    get: (id) => byId[id],
    equipped: () => Object.assign({}, state.equipped),
    isUnlocked, equip, apply, swatch, openLocker, closeLocker, setPreviewAll,
    rewardFor: (achievementId) => CATALOG.find((c) => c.by === achievementId) || null,
    rewardsFor: (achievementId) => CATALOG.filter((c) => c.by === achievementId),
    refresh: renderLocker,
    /** The player's name and equipped title (for the menu or anywhere else that wants them). */
    playerName: () => state.name,
    title: () => byId[state.equipped.title] || null,
    titleHtml,
  };
})(window);
