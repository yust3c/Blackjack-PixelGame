/* Pixel-art scenes behind the table: one per Challenge difficulty, plus a space variant of each for that
   difficulty's Endless mode. Everything is drawn from rectangles on a 192x108 grid and scaled up crisp. */
(function (root) {
  'use strict';

  const W = 192;
  const H = 108;
  const FLOOR = 80;

  // ---------------------------------------------------------------- drawing helpers
  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
  }

  function Painter() { this.out = []; }
  Painter.prototype.rect = function (x, y, w, h, c, o) {
    if (w <= 0 || h <= 0) return;
    this.out.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${c}"${o != null ? ` fill-opacity="${o}"` : ''}/>`);
  };
  // Wraps whatever fn draws in a <g> with a CSS class, used for ambient animation (see css/scenarios.css).
  Painter.prototype.g = function (cls, fn) { this.out.push(`<g class="${cls}">`); fn(); this.out.push('</g>'); };
  Painter.prototype.px = function (x, y, c, o) { this.rect(x, y, 1, 1, c, o); };
  // Draws on the left and mirrors onto the right side of the screen.
  Painter.prototype.sym = function (x, y, w, h, c, o) { this.rect(x, y, w, h, c, o); this.rect(W - x - w, y, w, h, c, o); };
  // Calls fn(x, y, dx, dy, dist) for each pixel in a circle; fn returns a colour (or [colour, opacity]) or null.
  Painter.prototype.circle = function (cx, cy, r, fn) {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      let run = null;
      let runX = 0;
      const flush = (x) => { if (run) this.rect(runX, y, x - runX, 1, run[0], run[1]); run = null; };
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r) + 1; x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        const d = Math.sqrt(dx * dx + dy * dy);
        let c = d <= r ? fn(x, y, dx, dy, d) : null;
        if (c && !Array.isArray(c)) c = [c, null];
        if (!c || !run || c[0] !== run[0] || c[1] !== run[1]) { flush(x); if (c) { run = c; runX = x; } }
      }
      flush(Math.ceil(cx + r) + 2);
    }
  };
  Painter.prototype.disc = function (cx, cy, r, c, o) { this.circle(cx, cy, r, () => [c, o == null ? null : o]); };
  // Horizontal colour bands from y0 to y1, with a 1px dither row between bands.
  Painter.prototype.bands = function (y0, y1, colors) {
    const step = (y1 - y0) / colors.length;
    colors.forEach((c, i) => {
      const a = Math.round(y0 + i * step);
      const b = Math.round(y0 + (i + 1) * step);
      this.rect(0, a, W, b - a, c);
      if (i > 0) for (let x = (i % 2); x < W; x += 2) this.px(x, a, colors[i - 1]);
    });
  };
  Painter.prototype.stars = function (seed, n, x0, y0, x1, y1, inside) {
    this.g('sc-twinkle', () => this.starField(seed + 1, Math.ceil(n / 3), x0, y0, x1, y1, inside));
    this.starField(seed, n, x0, y0, x1, y1, inside);
  };
  Painter.prototype.starField = function (seed, n, x0, y0, x1, y1, inside) {
    const r = rng(seed);
    for (let i = 0; i < n; i++) {
      const x = Math.floor(x0 + r() * (x1 - x0));
      const y = Math.floor(y0 + r() * (y1 - y0));
      const t = r();
      if (inside && !inside(x, y)) continue;
      const c = t < 0.15 ? '#ffd7a0' : t < 0.3 ? '#a8d0ff' : '#ffffff';
      this.px(x, y, c, t < 0.6 ? 0.55 : 1);
      if (t > 0.96) { this.px(x - 1, y, c, 0.5); this.px(x + 1, y, c, 0.5); this.px(x, y - 1, c, 0.5); this.px(x, y + 1, c, 0.5); }
    }
  };

  // 3x5 pixel font for signs.
  const FONT = {
    A: ['.X.', 'X.X', 'XXX', 'X.X', 'X.X'], B: ['XX.', 'X.X', 'XX.', 'X.X', 'XX.'], C: ['.XX', 'X..', 'X..', 'X..', '.XX'],
    E: ['XXX', 'X..', 'XX.', 'X..', 'XXX'], K: ['X.X', 'X.X', 'XX.', 'X.X', 'X.X'], L: ['X..', 'X..', 'X..', 'X..', 'XXX'],
    N: ['XX.', 'X.X', 'X.X', 'X.X', 'X.X'], O: ['XXX', 'X.X', 'X.X', 'X.X', 'XXX'], P: ['XX.', 'X.X', 'XX.', 'X..', 'X..'],
    R: ['XX.', 'X.X', 'XX.', 'X.X', 'X.X'], S: ['.XX', 'X..', '.X.', '..X', 'XX.'], T: ['XXX', '.X.', '.X.', '.X.', '.X.'],
    U: ['X.X', 'X.X', 'X.X', 'X.X', 'XXX'], Y: ['X.X', 'X.X', '.X.', '.X.', '.X.'], M: ['X.X', 'XXX', 'XXX', 'X.X', 'X.X'],
    7: ['XXX', '..X', '.X.', '.X.', '.X.'], 2: ['XX.', '..X', '.X.', 'X..', 'XXX'], 1: ['.X.', 'XX.', '.X.', '.X.', 'XXX'],
    ' ': ['...', '...', '...', '...', '...'],
  };
  Painter.prototype.text = function (str, x, y, c, glow) {
    let cx = x;
    for (const ch of str) {
      const g = FONT[ch] || FONT[' '];
      g.forEach((row, gy) => [...row].forEach((v, gx) => {
        if (v !== 'X') return;
        if (glow) this.rect(cx + gx - 1, y + gy - 1, 3, 3, glow, 0.18);
        this.px(cx + gx, y + gy, c);
      }));
      cx += 4;
    }
  };
  const textWidth = (s) => s.length * 4 - 1;

  // ---------------------------------------------------------------- shared props
  function slotMachine(p, x, body, trim, screen, reel, symbol) {
    p.rect(x + 2, 34, 18, 4, trim);          // light box
    p.g('sc-blink', () => { for (let i = 0; i < 14; i += 4) p.rect(x + 4 + i, 35, 2, 2, '#ffffff', 0.9); });
    p.g('sc-blink2', () => { for (let i = 2; i < 14; i += 4) p.rect(x + 4 + i, 35, 2, 2, '#ffffff', 0.9); });
    p.rect(x, 38, 22, 42, body);             // cabinet
    p.rect(x, 38, 22, 2, trim);
    p.rect(x + 2, 44, 18, 12, '#20202a');    // window
    for (let i = 0; i < 3; i++) {
      p.rect(x + 3 + i * 6, 45, 4, 10, reel);
      p.text('7', x + 3 + i * 6 + 0, 47, symbol);
    }
    p.rect(x + 2, 60, 18, 3, screen);        // pay panel
    p.rect(x + 4, 68, 14, 4, '#20202a');     // coin tray
    p.rect(x, 76, 22, 4, trim);
    p.rect(x + 1, 40, 20, 1, '#000000', 0.25);
  }

  function lever(p, x, knob) {
    p.rect(x, 46, 2, 14, '#c8c2ae');
    p.disc(x + 1, 45, 2.2, knob);
  }

  function chandelier(p, x, metal, crystal, glow) {
    p.rect(x, 0, 1, 7, metal);
    p.disc(x + 0.5, 11, 8, glow, 0.05);
    p.rect(x - 7, 7, 15, 2, metal);
    p.rect(x - 5, 9, 11, 2, metal);
    p.rect(x - 3, 11, 7, 2, metal);
    p.g('sc-twinkle', () => { for (let i = -7; i <= 7; i += 4) p.px(x + i, 9 + (Math.abs(i) > 4 ? 0 : 1) + 1, '#ffffff'); });
    for (let i = -5; i <= 7; i += 4) p.px(x + i, 9 + (Math.abs(i) > 4 ? 0 : 1) + 1, crystal);
    for (let i = -5; i <= 5; i += 2) p.px(x + i, 13, crystal);
    p.px(x, 15, crystal);
    p.px(x - 6, 6, glow); p.px(x + 6, 6, glow); p.px(x, 6, glow);
  }

  function fan(p, cx, cy, r, gold, bg) {
    p.circle(cx, cy, r, (x, y, dx, dy, d) => {
      if (dy > 0) return null;
      if (d > r - 1.2) return gold;
      if (d < 3) return gold;
      const a = Math.atan2(-dy, dx);
      return Math.floor(a / (Math.PI / 9)) % 2 === 0 ? [gold, 0.55] : bg;
    });
  }

  function pillar(p, x, w, stone, flute, gold) {
    p.rect(x, 4, w, FLOOR - 4, stone);
    for (let i = 2; i < w - 1; i += 3) p.rect(x + i, 10, 1, FLOOR - 16, flute);
    p.rect(x - 1, 4, w + 2, 3, gold);
    p.rect(x - 1, FLOOR - 4, w + 2, 4, gold);
  }

  function porthole(p, cx, cy, r, frame, rivet, paintInside) {
    p.disc(cx, cy, r + 2, frame);
    p.circle(cx, cy, r + 2, (x, y, dx, dy, d) => (d > r + 1.2 && dy < 0 ? ['#ffffff', 0.15] : null));
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      p.px(Math.round(cx + Math.cos(a) * (r + 1) - 0.5), Math.round(cy + Math.sin(a) * (r + 1) - 0.5), rivet);
    }
    p.circle(cx, cy, r, paintInside);
    // glass glare
    p.circle(cx, cy, r, (x, y, dx, dy, d) => (dx < -r * 0.3 && dy < -r * 0.3 && d > r - 3 ? ['#ffffff', 0.18] : null));
  }

  function noise(seed) {
    const r = rng(seed);
    const g = [];
    for (let i = 0; i < 64; i++) g.push(r());
    return (x, y) => {
      const a = g[(((x >> 2) * 7 + (y >> 2) * 13) & 63)];
      const b = g[(((x >> 1) * 5 + (y >> 1) * 11 + 17) & 63)];
      return a * 0.65 + b * 0.35;
    };
  }

  function skyline(p, seed, y0, base, colorsBack, colorFront, lights) {
    const r = rng(seed);
    [[colorsBack, 0.55, 10], [colorFront, 1, 4]].forEach(([c, lit, dy]) => {
      let x = -2;
      while (x < W) {
        const w = 8 + Math.floor(r() * 12);
        const h = 12 + Math.floor(r() * (base - y0 - 6)) - dy;
        const top = base - h;
        p.rect(x, top, w, base - top, c);
        if (r() < 0.3) p.rect(x + Math.floor(w / 2), top - 5, 1, 5, c);
        for (let wy = top + 3; wy < base - 2; wy += 3) {
          for (let wx = x + 2; wx < x + w - 1; wx += 3) {
            if (r() < 0.35) p.px(wx, wy, lights[Math.floor(r() * lights.length)], lit);
          }
        }
        x += w + Math.floor(r() * 3);
      }
    });
  }

  function curtains(p, velvet, light, dark, tie) {
    for (let x = 0; x < 30; x++) {
      const k = x % 6;
      const c = k === 0 ? dark : k < 3 ? velvet : k === 3 ? light : velvet;
      const bulge = x < 22 ? Math.round(Math.sin((x / 22) * Math.PI) * 4) : 0;
      p.rect(x, 0, 1, FLOOR, c);
      p.rect(W - 1 - x, 0, 1, FLOOR, c);
      if (bulge) { p.rect(x, 40, 1, 6, dark, 0.35); p.rect(W - 1 - x, 40, 1, 6, dark, 0.35); }
    }
    p.sym(30, 0, 2, FLOOR, dark);
    p.sym(0, 42, 30, 3, tie);
    p.sym(24, 40, 6, 7, tie);
    p.sym(26, 47, 2, 6, tie);
  }

  // Low wall under the window: gold-trimmed panels, two lounge chairs and champagne on a side table.
  function lounge(p, gold, panel, chair) {
    p.rect(0, 66, W, 1, gold, 0.6);
    for (let x = 36; x < W - 40; x += 20) { p.rect(x, 69, 16, 8, panel); p.rect(x, 69, 16, 1, gold, 0.4); }
    [34, W - 46].forEach((x) => {
      p.rect(x, 64, 12, 10, chair); p.rect(x - 2, 68, 16, 8, chair); p.rect(x, 64, 12, 1, '#ffffff', 0.12);
      p.rect(x - 1, 76, 2, 4, gold); p.rect(x + 11, 76, 2, 4, gold);
    });
    p.rect(92, 70, 8, 2, gold); p.rect(95, 72, 2, 8, gold);
    p.rect(93, 64, 2, 6, '#2a6a3a'); p.px(93, 63, gold);
    p.rect(97, 66, 2, 4, '#ffe9a0', 0.7);
  }

  function windowFrame(p, x0, y0, x1, y1, frame, inner, noMullions) {
    p.rect(x0 - 3, y0 - 3, x1 - x0 + 6, 3, frame);
    p.rect(x0 - 3, y1, x1 - x0 + 6, 3, frame);
    p.rect(x0 - 3, y0, 3, y1 - y0, frame);
    p.rect(x1, y0, 3, y1 - y0, frame);
    if (!noMullions) for (let x = x0 + 28; x < x1 - 4; x += 28) p.rect(x, y0, 2, y1 - y0, inner);
  }

  // ---------------------------------------------------------------- scenes
  const SCENES = {};

  // EASY: a cozy neighbourhood casino. Wood panelling, wall lamps, red carpet, old slot machines.
  SCENES.corner = {
    wall: '#522b15', floor: '#7a1a26',
    top: '#3a1d0c',
    name: 'El Rincón', subtitle: 'Casino de barrio',
    vars: {},
    draw(p) {
      for (let x = 0; x < W; x += 6) {
        p.rect(x, 0, 6, FLOOR, (x / 6) % 2 ? '#5a3018' : '#522b15');
        p.rect(x, 0, 1, FLOOR, '#3a1d0c');
      }
      p.rect(0, 0, W, 5, '#3a1d0c'); p.rect(0, 5, W, 1, '#9a5a2c');
      p.rect(0, 50, W, 3, '#9a5a2c'); p.rect(0, 53, W, 1, '#2a1408');
      p.rect(0, 54, W, FLOOR - 54, '#3f2010');
      for (let x = 3; x < W - 10; x += 16) {
        p.rect(x, 57, 12, 1, '#5a3018'); p.rect(x, 57, 1, 19, '#5a3018');
        p.rect(x, 76, 12, 1, '#2a1408'); p.rect(x + 11, 57, 1, 19, '#2a1408');
      }
      // wall lamps
      [46, 96, 146].forEach((x) => {
        p.g('sc-pulse', () => p.disc(x, 21, 7, '#ffd75e', 0.1));
        p.rect(x - 1, 22, 2, 8, '#c9a24a');
        p.rect(x - 4, 14, 8, 2, '#ffe9a0');
        p.rect(x - 5, 16, 10, 3, '#ffd75e');
        p.rect(x - 5, 19, 10, 1, '#c9a24a');
      });
      // framed card pictures
      [[66, '#1f7a45'], [120, '#7a1a26']].forEach(([x, bg]) => {
        p.rect(x, 24, 10, 13, '#c9a24a'); p.rect(x + 1, 25, 8, 11, bg);
        p.rect(x + 3, 27, 4, 7, '#fbf6e6'); p.px(x + 4, 29, '#d8323a'); p.px(x + 5, 31, '#20202a');
      });
      // "OPEN" sign
      p.rect(86, 30, 20, 9, '#1a0c06');
      p.g('sc-flicker', () => p.text('OPEN', 88, 32, '#ff6a5a', '#ff3a2a'));
      slotMachine(p, 1, '#b02a3a', '#ffd75e', '#3a6fd8', '#fbf6e6', '#d8323a');
      slotMachine(p, W - 23, '#3a6fd8', '#ffd75e', '#d8323a', '#fbf6e6', '#d8323a');
      // carpet
      p.rect(0, FLOOR, W, H - FLOOR, '#7a1a26');
      p.rect(0, FLOOR, W, 2, '#2a1408');
      for (let y = FLOOR + 4; y < H; y += 6) {
        for (let x = ((y / 6) % 2) * 4; x < W; x += 8) {
          p.px(x, y, '#c9a24a'); p.px(x - 1, y, '#5a1018'); p.px(x + 1, y, '#5a1018'); p.px(x, y - 1, '#5a1018'); p.px(x, y + 1, '#5a1018');
        }
      }
    },
  };

  // EASY · SPACE: the same corner casino, bolted into an orbital station above Earth.
  SCENES.corner.room3d = (p) => room3dCorner(p);
  // (the other rooms' perspective versions are attached after their definitions, below)

  SCENES.orbit = {
    wall: '#2a3344', floor: '#1f2633',
    top: '#1a2130',
    name: 'Estación Órbita', subtitle: 'Rincón en órbita baja',
    space: true,
    vars: {
      '--bg': '#0c1018', '--felt': '#127a7a', '--felt-dot': '#0f6c6c', '--felt-dark': '#0a4e4e', '--felt-line': '#7ff0ff',
      '--rail': '#4a5468', '--rail-light': '#6a7890', '--rail-dark': '#262c3a', '--gold': '#ffe27a',
    },
    draw(p) {
      p.rect(0, 0, W, FLOOR, '#2a3344');
      for (let x = 0; x < W; x += 24) {
        p.rect(x, 0, 1, FLOOR, '#1a2130'); p.rect(x + 1, 0, 1, FLOOR, '#3c4860');
        for (let y = 8; y < FLOOR; y += 20) { p.px(x + 3, y, '#5a6880'); p.px(x + 20, y, '#5a6880'); }
      }
      p.rect(0, 52, W, 1, '#1a2130'); p.rect(0, 53, W, 1, '#3c4860');
      p.rect(0, 0, W, 4, '#1a2130');
      p.rect(0, 4, W, 1, '#7ff0ff'); p.rect(0, 5, W, 3, '#7ff0ff', 0.12);
      // left porthole: Earth
      const n = noise(7);
      const space = (sx, sy, starSeed) => {
        const h = ((sx * 73856093) ^ (sy * 19349663) ^ starSeed) >>> 0;
        return h % 41 === 0 ? '#ffffff' : h % 67 === 0 ? ['#a8d0ff', 0.6] : '#05060f';
      };
      porthole(p, 32, 28, 15, '#5a6880', '#9aa8c0', (x, y) => {
        const ex = x + 0.5 - 40; const ey = y + 0.5 - 40;
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d < 20) {
          if (d > 19) return '#8fd0ff';
          const land = n(x, y) > 0.58;
          const shade = ex + ey > 10;
          if (n(x + 40, y) > 0.8) return '#fbf6e6';
          return land ? (shade ? '#2a7a3a' : '#3fae5a') : (shade ? '#1a4aa0' : '#2a6fd8');
        }
        if (d < 21.5) return ['#8fd0ff', 0.35];
        return space(x, y, 11);
      });
      // right porthole: Moon
      porthole(p, W - 32, 28, 15, '#5a6880', '#9aa8c0', (x, y) => {
        const mx = x + 0.5 - (W - 36); const my = y + 0.5 - 24;
        const d = Math.sqrt(mx * mx + my * my);
        if (d < 7) {
          const crater = n(x * 2, y * 2) > 0.62;
          return mx + my > 4 ? (crater ? '#6a6a72' : '#8a8a92') : (crater ? '#a0a0a8' : '#d0d0d4');
        }
        return space(x, y, 23);
      });
      // centre: little porthole row
      [84, 96, 108].forEach((x) => porthole(p, x, 22, 3, '#5a6880', '#9aa8c0', (sx, sy) => space(sx, sy, 5)));
      p.rect(86, 32, 20, 9, '#0a0e16');
      p.g('sc-flicker', () => p.text('OPEN', 88, 34, '#7ff0ff', '#3fe0e0'));
      // holo terminals instead of slot machines
      [1, W - 23].forEach((x, i) => {
        p.rect(x, 40, 22, 40, '#3c4860'); p.rect(x, 40, 22, 2, '#7ff0ff'); p.rect(x + 1, 42, 1, 38, '#5a6880');
        p.rect(x + 2, 46, 18, 14, '#06131a');
        p.rect(x + 2, 46, 18, 14, '#3fe0e0', 0.12);
        for (let k = 0; k < 3; k++) { p.rect(x + 3 + k * 6, 48, 4, 9, '#3fe0e0', 0.25); p.text('7', x + 3 + k * 6, 50, i ? '#ffd75e' : '#ff7ad8'); }
        p.rect(x + 4, 64, 14, 2, '#3fe0e0', 0.6);
        p.rect(x + 4, 68, 4, 3, '#5fd068'); p.rect(x + 9, 68, 4, 3, '#f05a4f'); p.rect(x + 14, 68, 4, 3, '#ffd75e');
        p.g(i ? 'sc-pulse' : 'sc-pulse2', () => { p.rect(x + 3, 36, 16, 4, '#3fe0e0', 0.18); p.rect(x + 6, 37, 10, 2, '#7ff0ff', 0.5); });
      });
      // grated floor with hazard edge
      p.rect(0, FLOOR, W, H - FLOOR, '#1f2633');
      for (let x = 0; x < W; x += 4) p.rect(x, FLOOR + 3, 1, H - FLOOR, '#2e3848');
      for (let y = FLOOR + 6; y < H; y += 5) p.rect(0, y, W, 1, '#161b25');
      for (let x = 0; x < W; x += 6) { p.rect(x, FLOOR, 3, 3, '#ffd75e'); p.rect(x + 3, FLOOR, 3, 3, '#20202a'); }
    },
  };

  // MEDIUM: a grand art-deco hotel casino. Navy walls, gold fans, chandeliers, marble checkerboard.
  SCENES.deco = {
    wall: '#0f1a32', floor: '#15151c',
    top: '#0a1020',
    name: 'Gran Hotel', subtitle: 'Salón art déco',
    vars: {
      '--bg': '#0b1226', '--felt': '#1f4f9a', '--felt-dot': '#1b468a', '--felt-dark': '#143468', '--felt-line': '#e9d27a',
      '--rail': '#5a1f1f', '--rail-light': '#8a3a2a', '--rail-dark': '#2e0c0c',
    },
    draw(p) {
      p.rect(0, 0, W, FLOOR, '#14213d');
      for (let x = 4; x < W; x += 12) p.rect(x, 20, 1, FLOOR - 20, '#c9a24a', 0.35);
      p.rect(0, 0, W, 4, '#0a1020'); p.rect(0, 4, W, 1, '#c9a24a'); p.rect(0, 19, W, 1, '#c9a24a');
      for (let x = 12; x < W; x += 24) fan(p, x, 19, 11, '#c9a24a', '#14213d');
      p.rect(0, 58, W, 1, '#c9a24a'); p.rect(0, 59, W, FLOOR - 59, '#0f1a32');
      for (let x = 0; x < W; x += 8) { p.rect(x + 2, 63, 4, 4, '#c9a24a', 0.3); p.rect(x + 3, 64, 2, 2, '#14213d'); }
      pillar(p, 30, 10, '#e8e2d0', '#c8c2ae', '#c9a24a');
      pillar(p, W - 40, 10, '#e8e2d0', '#c8c2ae', '#c9a24a');
      chandeliers.forEach((x) => chandelier(p, x, '#c9a24a', '#bfe4ff', '#ffe9a0'));
      // potted palms
      [8, W - 20].forEach((x) => {
        p.rect(x + 2, 66, 8, 14, '#c9a24a'); p.rect(x + 3, 67, 6, 1, '#ffe08a');
        for (let i = 0; i < 6; i++) {
          const a = -Math.PI / 2 + (i - 2.5) * 0.5;
          for (let t = 2; t < 14; t++) p.px(Math.round(x + 6 + Math.cos(a) * t), Math.round(64 + Math.sin(a) * t * 0.9 + (t * t) / 28), i % 2 ? '#2a7a3a' : '#3fae5a');
        }
      });
      // marble checkerboard
      for (let y = FLOOR; y < H; y += 5) {
        for (let x = 0; x < W; x += 8) {
          const light = ((x / 8) + Math.round((y - FLOOR) / 5)) % 2 === 0;
          p.rect(x, y, 8, 5, light ? '#e8e2d0' : '#15151c');
          if (light) p.px(x + 2 + ((x + y) % 4), y + 2, '#c8c2ae');
        }
      }
      p.rect(0, FLOOR, W, 1, '#c9a24a');
    },
  };
  const chandeliers = [56, 96, 136];

  // MEDIUM · SPACE: the deco hotel as a star liner gliding through a nebula.
  SCENES.liner = {
    wall: '#090c20', floor: '#0a0a20',
    top: '#05060f',
    name: 'Crucero Estelar', subtitle: 'Gran Hotel entre nebulosas',
    space: true,
    vars: {
      '--bg': '#070918', '--felt': '#2b2f8a', '--felt-dot': '#25297a', '--felt-dark': '#1a1d5a', '--felt-line': '#ffd75e',
      '--rail': '#5a1f1f', '--rail-light': '#8a3a2a', '--rail-dark': '#2e0c0c',
    },
    draw(p) {
      p.rect(0, 0, W, FLOOR, '#0d1028');
      for (let x = 4; x < W; x += 12) p.rect(x, 20, 1, FLOOR - 20, '#c9a24a', 0.25);
      p.rect(0, 0, W, 4, '#05060f'); p.rect(0, 4, W, 1, '#c9a24a'); p.rect(0, 19, W, 1, '#c9a24a');
      for (let x = 12; x < W; x += 24) fan(p, x, 19, 11, '#c9a24a', '#0d1028');
      // nebula portholes
      const n = noise(31);
      const nebula = (cx) => (x, y, dx, dy, d) => {
        const v = n(x, y);
        const h = ((x * 73856093) ^ (y * 19349663)) >>> 0;
        if (h % 29 === 0) return '#ffffff';
        if (v > 0.72) return '#ff7ad8';
        if (v > 0.6) return '#b04fd0';
        if (v > 0.48) return '#5a2a9a';
        if (v > 0.38) return '#2a1a5a';
        return '#06061a';
      };
      [[64, 40, 10], [96, 38, 12], [128, 40, 10]].forEach(([cx, cy, r]) => porthole(p, cx, cy, r, '#c9a24a', '#ffe08a', nebula(cx)));
      p.rect(0, 58, W, 1, '#c9a24a'); p.rect(0, 59, W, FLOOR - 59, '#090c20');
      for (let x = 0; x < W; x += 8) { p.rect(x + 2, 63, 4, 4, '#c9a24a', 0.3); p.rect(x + 3, 64, 2, 2, '#0d1028'); }
      // pillars become glowing energy tubes
      [30, W - 40].forEach((x) => {
        p.rect(x, 4, 10, FLOOR - 4, '#1a1d3a');
        p.rect(x + 4, 8, 2, FLOOR - 12, '#e0ffff', 0.8);
        p.g('sc-pulse', () => p.rect(x + 3, 8, 4, FLOOR - 12, '#7ff0ff', 0.35));
        p.rect(x - 1, 4, 12, 3, '#c9a24a'); p.rect(x - 1, FLOOR - 4, 12, 4, '#c9a24a');
      });
      // floating ringed orbs instead of chandeliers
      [16, W - 16].forEach((x) => {
        p.g('sc-pulse2', () => p.disc(x, 34, 9, '#ffe9a0', 0.12));
        p.disc(x, 34, 4, '#ffd75e'); p.circle(x, 34, 4, (sx, sy, dx, dy) => (dx + dy > 1 ? '#c9a24a' : null));
        p.rect(x - 8, 34, 17, 1, '#ffe08a'); p.rect(x - 6, 35, 13, 1, '#c9a24a', 0.6);
      });
      // starry checkerboard
      for (let y = FLOOR; y < H; y += 5) {
        for (let x = 0; x < W; x += 8) {
          const light = ((x / 8) + Math.round((y - FLOOR) / 5)) % 2 === 0;
          p.rect(x, y, 8, 5, light ? '#c8c2e0' : '#0a0a20');
          if (!light && (x + y) % 3 === 0) p.px(x + 3, y + 2, '#ffffff', 0.7);
        }
      }
      p.rect(0, FLOOR, W, 1, '#c9a24a');
    },
  };

  // HARD: a neon strip casino at night, behind floor-to-ceiling glass.
  SCENES.neon = {
    wall: '#08040f', floor: '#140a1e',
    top: '#05030a',
    name: 'Neón', subtitle: 'La avenida de noche',
    vars: {
      '--bg': '#0e0820', '--felt': '#8f1d2c', '--felt-dot': '#7f1827', '--felt-dark': '#5e101c', '--felt-line': '#ff9ad6',
      '--rail': '#1a1a22', '--rail-light': '#3a3a48', '--rail-dark': '#08080c',
    },
    draw(p) {
      p.bands(0, FLOOR, ['#0e0820', '#150a2a', '#1e0d36', '#2a1040', '#3a1448']);
      p.stars(3, 40, 0, 0, W, 30);
      p.disc(150, 14, 5, '#fbf6e6'); p.disc(152, 13, 4.5, '#150a2a');
      skyline(p, 9, 12, FLOOR, '#1a1030', '#0c0618', ['#ffd75e', '#7ff0ff', '#ff7ad8']);
      // neon signs on the front buildings
      p.rect(8, 22, 22, 9, '#05030a'); p.g('sc-flicker', () => p.text('BAR', 10, 24, '#7ff0ff', '#3fe0e0'));
      p.rect(W - 34, 16, 26, 9, '#05030a'); p.g('sc-flicker2', () => p.text('LUCKY', W - 32, 18, '#ff7ad8', '#ff3ac8'));
      p.rect(W - 22, 30, 10, 9, '#05030a'); p.g('sc-blink', () => p.text('21', W - 20, 32, '#ffd75e', '#ff9a3a'));
      p.rect(24, 40, 8, 22, '#05030a');
      ['A', 'C', 'E'].forEach((c, i) => p.g(`sc-chase sc-d${i}`, () => p.text(c, 26, 42 + i * 6, '#ff7ad8', '#ff3ac8')));
      // glass wall mullions + reflections
      for (let x = 0; x < W; x += 48) p.rect(x, 0, 2, FLOOR, '#05030a');
      p.rect(0, 0, W, 3, '#05030a');
      for (let x = 10; x < W; x += 48) for (let i = 0; i < 18; i++) p.px(x + i, 50 - i, '#ffffff', 0.08);
      // floor with neon reflections
      p.rect(0, FLOOR, W, H - FLOOR, '#140a1e');
      p.rect(0, FLOOR, W, 1, '#ff7ad8'); p.rect(0, FLOOR + 1, W, 2, '#ff7ad8', 0.2);
      for (let y = FLOOR + 6; y < H; y += 6) p.rect(0, y, W, 1, '#2a1040');
      [[19, '#7ff0ff'], [W - 21, '#ff7ad8'], [W - 17, '#ffd75e']].forEach(([x, c]) => {
        for (let y = FLOOR + 4; y < H; y += 2) p.rect(x - 3, y, 6, 1, c, 0.12);
      });
    },
  };

  // HARD · SPACE: neon domes on Mars.
  SCENES.mars = {
    wall: '#0a0606', floor: '#1a0a0a',
    top: '#05030a',
    name: 'Neón Marte', subtitle: 'La avenida bajo la cúpula',
    space: true,
    vars: {
      '--bg': '#120606', '--felt': '#9a3a12', '--felt-dot': '#8a3410', '--felt-dark': '#6a2408', '--felt-line': '#7ff0ff',
      '--rail': '#1a1a22', '--rail-light': '#3a3a48', '--rail-dark': '#08080c',
    },
    draw(p) {
      p.bands(0, 56, ['#05030a', '#0a0612', '#140a1a', '#2a0f18', '#4a1a16']);
      p.stars(13, 70, 0, 0, W, 40);
      p.disc(40, 12, 3, '#8a7a6a'); p.px(39, 11, '#a89888');
      p.disc(160, 20, 2, '#a89888');
      // Earth as a blue star
      p.px(110, 10, '#8fd0ff'); p.px(110, 9, '#8fd0ff', 0.4); p.px(111, 10, '#8fd0ff', 0.4);
      const n = noise(5);
      for (let x = 0; x < W; x++) {
        const far = 50 + Math.round(Math.sin(x / 13) * 3 + n(x, 0) * 4);
        const near = 62 + Math.round(Math.sin(x / 7 + 1) * 2 + n(x, 9) * 3);
        p.rect(x, far, 1, FLOOR - far, '#8a2a0a');
        p.rect(x, near, 1, FLOOR - near, '#c1440e');
        if (n(x, near) > 0.7) p.px(x, near + 3, '#e2703a');
      }
      // neon domes
      const dome = (cx, r, glow, sign, sx, col) => {
        p.circle(cx, FLOOR, r, (x, y, dx, dy, d) => {
          if (dy > 0) return null;
          if (d > r - 1) return ['#bfe4ff', 0.6];
          return [glow, 0.18];
        });
        p.rect(cx - r + 3, FLOOR - 6, r * 2 - 6, 6, '#1a0a14');
        for (let x = cx - r + 4; x < cx + r - 4; x += 3) p.px(x, FLOOR - 4, col);
        if (sign) { p.rect(sx - 2, FLOOR - r + 3, textWidth(sign) + 4, 9, '#05030a'); p.g(sign === 'BAR' ? 'sc-flicker' : 'sc-flicker2', () => p.text(sign, sx, FLOOR - r + 5, col, glow)); }
      };
      dome(22, 20, '#3fe0e0', 'BAR', 17, '#7ff0ff');
      dome(W - 24, 22, '#ff3ac8', '21', W - 28, '#ff7ad8');
      dome(96, 16, '#ffd75e', null, 0, '#ffd75e');
      // glass mullions
      for (let x = 0; x < W; x += 48) p.rect(x, 0, 2, FLOOR, '#05030a');
      p.rect(0, 0, W, 3, '#05030a');
      p.rect(0, FLOOR, W, H - FLOOR, '#1a0a0a');
      p.rect(0, FLOOR, W, 1, '#7ff0ff'); p.rect(0, FLOOR + 1, W, 2, '#7ff0ff', 0.2);
      for (let y = FLOOR + 6; y < H; y += 6) p.rect(0, y, W, 1, '#2a1010');
      [[22, '#7ff0ff'], [W - 24, '#ff7ad8']].forEach(([x, c]) => {
        for (let y = FLOOR + 4; y < H; y += 2) p.rect(x - 4, y, 8, 1, c, 0.12);
      });
    },
  };

  // EXPERT: high-roller penthouse. Black marble, velvet curtains, the city far below.
  SCENES.vip = {
    wall: '#0c0b10', floor: '#0a090d',
    top: '#0c0b10',
    name: 'Sala VIP', subtitle: 'Penthouse de los grandes apostadores',
    vars: {
      '--bg': '#08070b', '--felt': '#2a1640', '--felt-dot': '#25133a', '--felt-dark': '#1a0c2c', '--felt-line': '#c9a24a',
      '--rail': '#141018', '--rail-light': '#c9a24a', '--rail-dark': '#050407',
    },
    draw(p) {
      p.rect(0, 0, W, FLOOR, '#0c0b10');
      const r = rng(41);
      for (let v = 0; v < 14; v++) {
        let x = Math.floor(r() * W); let y = Math.floor(r() * FLOOR);
        for (let i = 0; i < 30; i++) { p.px(x, y, '#2a2630', 0.6); x += r() < 0.5 ? 1 : 0; y += r() < 0.7 ? 1 : -1; }
      }
      // big window over the city
      p.bands(8, 62, ['#05061a', '#0a0c26', '#141838', '#1e2448']);
      p.stars(19, 30, 40, 8, 152, 30);
      p.disc(70, 18, 4, '#fbf6e6'); p.px(69, 17, '#e8e2d0'); p.px(71, 19, '#c8c2ae');
      skyline(p, 77, 40, 62, '#0e1024', '#080918', ['#ffd75e', '#ffe9a0', '#ff9a3a']);
      for (let x = 40; x < 152; x++) if ((x * 7) % 5 === 0) p.px(x, 61, '#ffd75e', 0.6);
      p.rect(0, 0, 40, 62, '#0c0b10'); p.rect(152, 0, 40, 62, '#0c0b10');
      p.rect(40, 0, 112, 8, '#0c0b10');
      windowFrame(p, 40, 8, 152, 62, '#c9a24a', '#1a1612');
      p.rect(37, 62, 118, 2, '#ffe08a');
      lounge(p, '#c9a24a', '#1a1418', '#5a0f1a');
      curtains(p, '#5a0f1a', '#8a2030', '#2a0610', '#c9a24a');
      p.rect(0, 0, W, 2, '#c9a24a');
      // glossy floor with gold inlay and reflections
      p.rect(0, FLOOR, W, H - FLOOR, '#0a090d');
      p.rect(0, FLOOR, W, 1, '#c9a24a'); p.rect(0, FLOOR + 6, W, 1, '#c9a24a', 0.6); p.rect(0, H - 4, W, 1, '#c9a24a', 0.6);
      for (let x = 0; x < W; x += 16) { p.px(x + 8, FLOOR + 12, '#c9a24a'); p.px(x + 7, FLOOR + 13, '#c9a24a', 0.5); p.px(x + 9, FLOOR + 13, '#c9a24a', 0.5); p.px(x + 8, FLOOR + 14, '#c9a24a'); }
      p.rect(40, FLOOR + 2, 112, 3, '#ffd75e', 0.05);
      p.rect(0, FLOOR + 1, 30, 5, '#5a0f1a', 0.25); p.rect(W - 30, FLOOR + 1, 30, 5, '#5a0f1a', 0.25);
    },
  };

  // EXPERT · SPACE: the VIP lounge parked at the edge of a black hole.
  SCENES.horizon = {
    wall: '#0a0812', floor: '#06050a',
    top: '#0a0812',
    name: 'Horizonte de Sucesos', subtitle: 'Sala VIP al borde del agujero negro',
    space: true,
    vars: {
      '--bg': '#030208', '--felt': '#14102a', '--felt-dot': '#110d24', '--felt-dark': '#0a0818', '--felt-line': '#ffb347',
      '--rail': '#141018', '--rail-light': '#ffb347', '--rail-dark': '#050407', '--gold': '#ffc46a',
    },
    draw(p) {
      p.rect(0, 0, W, FLOOR, '#0a0812');
      const r = rng(43);
      for (let v = 0; v < 14; v++) {
        let x = Math.floor(r() * W); let y = Math.floor(r() * FLOOR);
        for (let i = 0; i < 30; i++) { p.px(x, y, '#2a1a3a', 0.6); x += r() < 0.5 ? 1 : 0; y += r() < 0.7 ? 1 : -1; }
      }
      p.rect(40, 8, 112, 54, '#020108');
      p.stars(29, 90, 40, 8, 152, 62);
      const cx = 96; const cy = 34;
      // back half of the accretion disc, bent over the top by gravity
      p.circle(cx, cy, 15, (x, y, dx, dy, d) => (d > 12.5 && dy < 2 ? (d > 14 ? ['#ff7a2a', 0.7] : '#ffc46a') : null));
      // the disc itself (flattened ellipse)
      for (let y = -6; y <= 6; y++) {
        const half = Math.round(46 * Math.sqrt(1 - (y * y) / 42));
        for (let x = -half; x <= half; x++) {
          const t = Math.abs(x) / 46;
          const c = t < 0.35 ? '#fff4d0' : t < 0.55 ? '#ffd75e' : t < 0.75 ? '#ff9a3a' : '#c84a1a';
          if (Math.abs(y) <= 2 || (Math.abs(y) <= 4 && t < 0.8) || t < 0.5) p.px(cx + x, cy + y, c, Math.abs(y) > 2 ? 0.6 : 1);
        }
      }
      // shadow and photon ring
      p.g('sc-pulse', () => p.disc(cx, cy, 16, '#ff9a3a', 0.12));
      p.disc(cx, cy, 11, '#ffe9a0');
      p.disc(cx, cy, 10, '#000000');
      p.rect(cx - 14, cy, 29, 1, '#fff4d0');
      p.rect(cx - 10, cy + 1, 21, 1, '#ffd75e', 0.7);
      p.rect(0, 0, 40, 62, '#0a0812'); p.rect(152, 0, 40, 62, '#0a0812'); p.rect(40, 0, 112, 8, '#0a0812');
      windowFrame(p, 40, 8, 152, 62, '#ffb347', '#1a1220', true);
      p.rect(37, 62, 118, 2, '#ffd08a');
      lounge(p, '#ffb347', '#140f1c', '#2a0f40');
      curtains(p, '#2a0f40', '#4a1f6a', '#140620', '#ffb347');
      p.rect(0, 0, W, 2, '#ffb347');
      p.rect(0, FLOOR, W, H - FLOOR, '#06050a');
      p.rect(0, FLOOR, W, 1, '#ffb347'); p.rect(0, FLOOR + 6, W, 1, '#ffb347', 0.5); p.rect(0, H - 4, W, 1, '#ffb347', 0.5);
      for (let x = 0; x < W; x += 16) { p.px(x + 8, FLOOR + 12, '#ffb347'); p.px(x + 7, FLOOR + 13, '#ffb347', 0.5); p.px(x + 9, FLOOR + 13, '#ffb347', 0.5); p.px(x + 8, FLOOR + 14, '#ffb347'); }
      p.rect(56, FLOOR + 2, 80, 3, '#ff9a3a', 0.1);
    },
  };

  SCENES.orbit.room3d = (p) => room3dOrbit(p);
  SCENES.deco.room3d = (p) => room3dDeco(p);
  SCENES.liner.room3d = (p) => room3dLiner(p);
  SCENES.neon.room3d = (p) => room3dNeon(p);
  SCENES.mars.room3d = (p) => room3dMars(p);
  SCENES.vip.room3d = (p) => room3dVip(p);
  SCENES.horizon.room3d = (p) => room3dHorizon(p);

  // Which scene each mode uses. Practice and the menu keep the plain default look.
  const BY_DIFFICULTY = {
    easy: { challenge: 'corner', endless: 'orbit' },
    medium: { challenge: 'deco', endless: 'liner' },
    hard: { challenge: 'neon', endless: 'mars' },
    expert: { challenge: 'vip', endless: 'horizon' },
  };

  function forMode(type, difficulty) {
    if (type !== 'challenge' && type !== 'endless') return null;
    const row = BY_DIFFICULTY[difficulty] || BY_DIFFICULTY.easy;
    return row[type];
  }

  // ---------------------------------------------------------------- the stage
  // On desktop the whole game is one picture: a 192x108 scene drawn at 8 CSS px per scene pixel (1536x864), with the
  // room, the dealer, the table rail, the scoreboard and the player's chip tray all painted into it. The HTML (felt,
  // cards, seats, buttons) is laid out on that same 1536x864 grid and the two are scaled together to fit the window.
  const STAGE = { w: W * 8, h: H * 8, u: 8 };
  const TABLE = { x0: 24, x1: 168, top: 31, bottom: 89, r: 20 };           // outer edge of the rail
  const FELT = { x0: 27, x1: 165, top: 32, bottom: 86, r: 17 };            // felt inside the rail
  const BOARD = { x0: 20, x1: 172, top: 1, bottom: 11 };                    // scoreboard (top bar)
  const TRAY = { x0: 40, x1: 152, top: 90, bottom: 108 };                   // player's chip tray (controls)
  const DEALER_AT = { x: 84, y: 8 };

  const DEFAULT_COLORS = {
    felt: '#1f7a45', 'felt-dot': '#1b6c3d', 'felt-dark': '#155a32', 'felt-line': '#e9d27a',
    rail: '#6b3a1e', 'rail-light': '#9a5a2c', 'rail-dark': '#3a1d0c', gold: '#ffd75e',
  };
  const colorOf = (sc, k) => (sc.vars && sc.vars[`--${k}`]) || DEFAULT_COLORS[k];

  // Horizontal extent of a rounded-bottom shape on row y, or null outside it.
  function span(shape, y) {
    if (y < shape.top || y >= shape.bottom) return null;
    const cy = shape.bottom - shape.r;
    let inset = 0;
    if (y + 0.5 > cy) {
      const dy = y + 0.5 - cy;
      inset = Math.round(shape.r - Math.sqrt(Math.max(0, shape.r * shape.r - dy * dy)));
    }
    return [shape.x0 + inset, shape.x1 - inset];
  }

  function drawStage(p, sc, id) {
    const rail = colorOf(sc, 'rail'); const light = colorOf(sc, 'rail-light'); const dark = colorOf(sc, 'rail-dark');
    // shadow of the table on the floor
    for (let y = TABLE.bottom - 2; y < TABLE.bottom + 3; y++) {
      const s = span({ ...TABLE, bottom: TABLE.bottom + 3 }, y);
      if (s) p.rect(s[0] + 2, y, s[1] - s[0] - 4, 1, '#000000', 0.35);
    }
    // dealer, behind the table
    if (root.ScenarioDealers) p.out.push(root.ScenarioDealers.inline(id, DEALER_AT.x, DEALER_AT.y));
    // rail: outer shape minus felt, with a dark outer edge and a light inner lip
    for (let y = TABLE.top; y < TABLE.bottom; y++) {
      const o = span(TABLE, y);
      const f = span(FELT, y);
      if (!f) { p.rect(o[0], y, o[1] - o[0], 1, y === TABLE.bottom - 1 ? dark : rail); continue; }
      p.rect(o[0], y, f[0] - o[0], 1, rail);
      p.rect(f[1], y, o[1] - f[1], 1, rail);
      p.rect(f[0] - 1, y, 1, 1, light); p.rect(f[1], y, 1, 1, dark);
      p.rect(f[0], y, f[1] - f[0], 1, colorOf(sc, 'felt-dark'));      // under the HTML felt
      p.px(o[0], y, dark); p.px(o[1] - 1, y, dark);
    }
    p.rect(TABLE.x0, TABLE.top, TABLE.x1 - TABLE.x0, 1, light);
    for (let y = FELT.bottom; y < TABLE.bottom - 1; y++) { const o = span(TABLE, y); p.rect(o[0] + 1, y, o[1] - o[0] - 2, 1, y === FELT.bottom ? light : rail); }
    for (let x = TABLE.x0 + 6; x < TABLE.x1 - 6; x += 9) { const s = span(TABLE, TABLE.bottom - 2); if (x > s[0] && x < s[1]) p.px(x, TABLE.bottom - 2, light); }
    // dealer's chip rack on the dealer edge
    const rk = TABLE.top - 2;
    p.rect(78, rk, 36, 3, dark);
    const chips = ['#d8323a', '#3a6fd8', '#f2b233', '#2b2b33', '#e04fa8', '#7d4fd0', '#5fd068', '#fbf6e6'];
    for (let i = 0; i < 8; i++) { p.rect(79 + i * 4, rk, 3, 2, chips[i]); p.px(79 + i * 4, rk, '#ffffff', 0.4); }
    // card shoe and discard tray at the felt's top corners
    p.rect(148, rk - 1, 9, 5, '#20202a'); p.rect(149, rk, 7, 2, colorOf(sc, 'felt-dark')); p.rect(150, rk, 5, 1, '#fbf6e6');
    p.rect(35, rk, 8, 4, dark); p.rect(36, rk + 1, 6, 2, '#fbf6e6', 0.7);
    // scoreboard behind the top bar
    const B = BOARD;
    p.rect(B.x0, B.top, B.x1 - B.x0, B.bottom - B.top, dark);
    p.rect(B.x0 + 1, B.top + 1, B.x1 - B.x0 - 2, B.bottom - B.top - 2, rail);
    p.rect(B.x0 + 1, B.top + 1, B.x1 - B.x0 - 2, 1, light);
    p.rect(B.x0 + 1, B.bottom - 2, B.x1 - B.x0 - 2, 1, dark);
    [B.x0 + 3, B.x1 - 4].forEach((x) => { p.px(x, B.top + 2, light); p.px(x, B.bottom - 3, light); });
    p.rect(B.x0 + 30, 0, 1, B.top, dark); p.rect(B.x1 - 31, 0, 1, B.top, dark);   // hanging chains
    // the player's chip tray (holds the chip buttons and actions)
    const T = TRAY;
    p.rect(T.x0 + 1, T.bottom, T.x1 - T.x0 - 2, 1, '#000000', 0.35);
    p.rect(T.x0, T.top, T.x1 - T.x0, T.bottom - T.top, dark);
    p.rect(T.x0 + 1, T.top + 1, T.x1 - T.x0 - 2, T.bottom - T.top - 2, rail);
    p.rect(T.x0 + 1, T.top + 1, T.x1 - T.x0 - 2, 1, light);
    p.rect(T.x0 + 26, T.top + 2, T.x1 - T.x0 - 52, 9, dark);             // recessed chip slot
    p.rect(T.x0 + 26, T.top + 2, T.x1 - T.x0 - 52, 1, '#000000', 0.4);
  }


  // ---------------------------------------------------------------- 3/4 perspective view (prototype: El Rincón)
  // One-point perspective: the camera sits at the near side of the table looking slightly down at the dealer.
  // Room: back wall (BW), side walls converging to VP, floor in perspective. Table: a half-moon seen from above at an
  // angle (straight dealer edge at the back, curved player edge at the front), with its wooden side (apron) visible.
  const VP = { x: 96, y: 24 };
  const BW = { x0: 48, x1: 144, top: 6, bottom: 42 };
  const T3 = { cx: 96, cy: 46, rx: 66, ry: 44, frx: 61, fry: 39, apron: 4 };    // outer rail and felt ellipses
  const FELT3 = { x0: T3.cx - T3.frx, x1: T3.cx + T3.frx, top: T3.cy + 1, bottom: T3.cy + T3.fry };
  const TRAY3 = { x0: 44, x1: 148, top: 94, bottom: 108 };

  // y on a side wall (or its floor edge) for a line at back-wall height yBack, at screen column x
  const wallY = (yBack, x) => VP.y + (yBack - VP.y) * (x < VP.x ? (VP.x - x) / (VP.x - BW.x0) : (x - VP.x) / (BW.x1 - VP.x));
  // half-width of an ellipse row (for y below its centre)
  const ellHalf = (rx, ry, dy) => (dy > ry ? null : rx * Math.sqrt(Math.max(0, 1 - (dy * dy) / (ry * ry))));

  function room3dCorner(p) {
    // ceiling
    p.rect(0, 0, W, H, '#241208');
    // side walls: planks, wainscot and floor edge all converge to VP
    const planks = [0, 13, 24, 32, 38, 43, 48];
    for (let x = 0; x < BW.x0; x++) {
      const top = Math.max(0, Math.round(wallY(BW.top, x)));
      const bot = Math.round(wallY(BW.bottom, x));
      const k = planks.findIndex((b) => b > x) - 1;
      const col = k % 2 ? '#5a3018' : '#4a2712';
      const wain = Math.round(wallY(30, x));
      [x, W - 1 - x].forEach((xx) => {
        p.rect(xx, top, 1, wain - top, col);
        p.rect(xx, wain, 1, 2, '#9a5a2c');
        p.rect(xx, wain + 2, 1, bot - wain - 2, '#3a1d0c');
      });
    }
    planks.slice(1, -1).forEach((x) => {
      [x, W - 1 - x].forEach((xx) => p.rect(xx, Math.max(0, Math.round(wallY(BW.top, x))), 1, Math.round(wallY(30, x)) - Math.max(0, Math.round(wallY(BW.top, x))), '#2a1408'));
    });
    // back wall
    for (let x = BW.x0; x < BW.x1; x += 4) {
      p.rect(x, BW.top, 4, 24, ((x - BW.x0) / 4) % 2 ? '#5a3018' : '#522b15');
      p.rect(x, BW.top, 1, 24, '#3a1d0c');
    }
    p.rect(BW.x0, BW.top + 24, BW.x1 - BW.x0, 2, '#9a5a2c');
    p.rect(BW.x0, BW.top + 26, BW.x1 - BW.x0, BW.bottom - BW.top - 26, '#3f2010');
    for (let x = BW.x0 + 3; x < BW.x1 - 8; x += 12) { p.rect(x, 35, 9, 1, '#5a3018'); p.rect(x, 35, 1, 6, '#5a3018'); }
    p.rect(BW.x0, BW.top, 1, BW.bottom - BW.top, '#2a1408'); p.rect(BW.x1 - 1, BW.top, 1, BW.bottom - BW.top, '#2a1408');
    // OPEN sign and two framed cards on the back wall
    p.rect(86, 13, 20, 9, '#1a0c06');
    p.g('sc-flicker', () => p.text('OPEN', 88, 15, '#ff6a5a', '#ff3a2a'));
    [[58, '#1f7a45'], [126, '#7a1a26']].forEach(([x, bg]) => {
      p.rect(x, 14, 8, 10, '#c9a24a'); p.rect(x + 1, 15, 6, 8, bg); p.rect(x + 2, 16, 4, 6, '#fbf6e6'); p.px(x + 3, 18, '#d8323a');
    });
    // wall sconces on the side walls, larger as they get closer
    [[40, 1], [26, 1.4], [8, 2]].forEach(([x, k]) => {
      [x, W - 1 - x - Math.round(2 * k)].forEach((xx, side) => {
        const y = Math.round(wallY(16, side ? W - 1 - xx : xx));
        p.g('sc-pulse', () => p.disc(xx + k, y + 2 * k, 4 * k, '#ffd75e', 0.1));
        p.rect(xx, y, Math.round(3 * k), Math.round(2 * k), '#ffd75e');
        p.rect(xx, y - Math.round(k), Math.round(3 * k), Math.round(k), '#ffe9a0');
        p.rect(xx + Math.round(k), y + Math.round(2 * k), Math.max(1, Math.round(k)), Math.round(3 * k), '#c9a24a');
      });
    });
    // floor: carpet in perspective, diamonds growing towards the camera
    for (let y = BW.bottom; y < H; y++) {
      let x0 = 0; let x1 = W;
      const yl = wallY(BW.bottom, 0);
      if (y < yl) { const t = (y - BW.bottom) / (yl - BW.bottom); x0 = Math.round(BW.x0 * (1 - t)); x1 = W - x0; }
      p.rect(x0, y, x1 - x0, 1, '#7a1a26');
    }
    p.rect(BW.x0, BW.bottom, BW.x1 - BW.x0, 1, '#2a1408');
    for (let x = 0; x < BW.x0; x++) { const y = Math.round(wallY(BW.bottom, x)); p.px(x, y, '#2a1408'); p.px(W - 1 - x, y, '#2a1408'); }
    [1, 1.3, 1.7, 2.25, 3, 4, 5.4].forEach((s, row) => {
      const y = Math.round(VP.y + (BW.bottom - VP.y) * s + 1);
      if (y >= H) return;
      const step = 10 * s;
      for (let c = -12; c <= 12; c++) {
        const x = Math.round(VP.x + (c + (row % 2) * 0.5) * step);
        if (x < 0 || x >= W || y < wallY(BW.bottom, x)) continue;
        const r = Math.max(0, Math.round(s * 0.5));
        p.rect(x - r, y, 2 * r + 1, 1, '#c9a24a', 0.85); p.rect(x, y - r, 1, 2 * r + 1, '#c9a24a', 0.85);
        p.px(x, y, '#5a1018');
      }
    });
    // slot machines in the near corners (front-facing, standing on the floor)
    p.out.push('<g transform="translate(0 -22)">');
    slotMachine(p, 1, '#b02a3a', '#ffd75e', '#3a6fd8', '#fbf6e6', '#d8323a');
    slotMachine(p, W - 23, '#3a6fd8', '#ffd75e', '#d8323a', '#fbf6e6', '#d8323a');
    p.out.push('</g>');
    p.rect(0, 58, 24, 2, '#000000', 0.3); p.rect(W - 24, 58, 24, 2, '#000000', 0.3);
  }

  function drawTable3d(p, sc, id) {
    const rail = colorOf(sc, 'rail'); const light = colorOf(sc, 'rail-light'); const dark = colorOf(sc, 'rail-dark');
    const { cx, cy, rx, ry, frx, fry, apron } = T3;
    // floor shadow
    for (let y = cy + 2; y <= cy + ry + apron + 3; y++) {
      const h = ellHalf(rx + 2, ry + apron + 2, y - cy);
      if (h != null) p.rect(Math.round(cx - h), y, Math.round(2 * h), 1, '#000000', 0.3);
    }
    // dealer stands behind the straight back edge
    if (root.ScenarioDealers) p.out.push(root.ScenarioDealers.inline(id, cx - 12, cy - 22));
    // apron: the table's wooden side, a band hanging under the front curve
    for (let x = cx - rx; x < cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx;
      const yTop = Math.round(cy + ry * Math.sqrt(Math.max(0, 1 - dx * dx)));
      p.rect(x, yTop, 1, apron, dark);
      p.px(x, yTop + apron - 1, '#1a0c06');
      if (Math.abs(dx) < 0.95 && x % 7 === 0) p.px(x, yTop + 1, rail);
    }
    // rail top surface (outer ellipse minus felt ellipse), light lip on the inside
    for (let y = cy - 1; y <= cy + ry; y++) {
      const ho = ellHalf(rx, ry, Math.max(0, y - cy));
      if (ho == null) continue;
      const a = Math.round(cx - ho); const b = Math.round(cx + ho);
      p.rect(a, y, b - a, 1, rail);
      const hf = y > cy ? ellHalf(frx, fry, y - cy) : null;
      if (hf != null) {
        const fa = Math.round(cx - hf); const fb = Math.round(cx + hf);
        p.rect(fa, y, fb - fa, 1, colorOf(sc, 'felt-dark'));
        p.px(fa - 1, y, light); p.px(fb, y, light);
      }
      p.px(a, y, dark); p.px(b - 1, y, dark);
    }
    for (let x = cx - frx; x < cx + frx; x++) {           // light lip along the front of the felt
      const y = Math.round(cy + fry * Math.sqrt(Math.max(0, 1 - ((x + 0.5 - cx) / frx) ** 2)));
      p.px(x, y, light);
    }
    p.rect(cx - rx, cy - 2, 2 * rx, 2, rail); p.rect(cx - rx, cy - 2, 2 * rx, 1, light);       // back edge
    // dealer's chip rack, shoe and discard tray on the back edge
    p.rect(cx - 16, cy - 3, 32, 3, dark);
    const chips = ['#d8323a', '#3a6fd8', '#f2b233', '#2b2b33', '#e04fa8', '#7d4fd0', '#5fd068', '#fbf6e6'];
    for (let i = 0; i < 8; i++) { p.rect(cx - 15 + i * 4, cy - 3, 3, 2, chips[i]); p.px(cx - 15 + i * 4, cy - 3, '#ffffff', 0.4); }
    p.rect(cx + 40, cy - 5, 9, 5, '#20202a'); p.rect(cx + 41, cy - 4, 7, 2, colorOf(sc, 'felt-dark')); p.rect(cx + 42, cy - 4, 5, 1, '#fbf6e6');
    p.rect(cx - 49, cy - 4, 8, 4, dark); p.rect(cx - 48, cy - 3, 6, 2, '#fbf6e6', 0.7);
    // scoreboard hanging from the ceiling
    const B = BOARD;
    p.rect(B.x0 + 30, 0, 1, B.top, dark); p.rect(B.x1 - 31, 0, 1, B.top, dark);
    p.rect(B.x0, B.top, B.x1 - B.x0, B.bottom - B.top, dark);
    p.rect(B.x0 + 1, B.top + 1, B.x1 - B.x0 - 2, B.bottom - B.top - 2, rail);
    p.rect(B.x0 + 1, B.top + 1, B.x1 - B.x0 - 2, 1, light);
    p.rect(B.x0 + 1, B.bottom - 2, B.x1 - B.x0 - 2, 1, dark);
    // the player's chip tray, nearest to the camera
    const Tr = TRAY3;
    p.rect(Tr.x0 - 2, Tr.top - 1, Tr.x1 - Tr.x0 + 4, Tr.bottom - Tr.top + 1, '#000000', 0.3);
    p.rect(Tr.x0, Tr.top, Tr.x1 - Tr.x0, Tr.bottom - Tr.top, dark);
    p.rect(Tr.x0 + 1, Tr.top + 1, Tr.x1 - Tr.x0 - 2, Tr.bottom - Tr.top - 1, rail);
    p.rect(Tr.x0 + 1, Tr.top + 1, Tr.x1 - Tr.x0 - 2, 1, light);
    p.rect(Tr.x0 + 26, Tr.top + 2, Tr.x1 - Tr.x0 - 52, 7, dark);
    p.rect(Tr.x0 + 26, Tr.top + 2, Tr.x1 - Tr.x0 - 52, 1, '#000000', 0.4);
  }


  // ---------- generic pieces for the perspective rooms ----------
  // Side walls (mirrored): upper colours alternate per plank, a rail line, a lower band; all converge to VP.
  function sideWalls3d(p, o) {
    const planks = o.planks || [0, 13, 24, 32, 38, 43, 48];
    for (let x = 0; x < BW.x0; x++) {
      const top = Math.max(0, Math.round(wallY(BW.top, x)));
      const bot = Math.round(wallY(BW.bottom, x));
      const k = planks.findIndex((b) => b > x) - 1;
      const wain = Math.round(wallY(o.railAt || 30, x));
      [x, W - 1 - x].forEach((xx) => {
        p.rect(xx, top, 1, wain - top, o.upper[k % o.upper.length]);
        p.rect(xx, wain, 1, 2, o.rail);
        p.rect(xx, wain + 2, 1, bot - wain - 2, o.lower);
      });
    }
    if (o.seam) planks.slice(1, -1).forEach((x) => [x, W - 1 - x].forEach((xx) => {
      const t = Math.max(0, Math.round(wallY(BW.top, x)));
      p.rect(xx, t, 1, Math.round(wallY(o.railAt || 30, x)) - t, o.seam);
    }));
    if (o.ceilingEdge) for (let x = 0; x < BW.x0; x++) { const y = Math.round(wallY(BW.top, x)); if (y >= 0) { p.px(x, y, o.ceilingEdge); p.px(W - 1 - x, y, o.ceilingEdge); } }
  }

  // Floor: fn(xw, zw) gets world coordinates (xw across, zw depth: 1 at the back wall, smaller towards the camera).
  function floor3d(p, fn) {
    for (let y = BW.bottom; y < H; y++) {
      const sc = (y + 0.5 - VP.y) / (BW.bottom - VP.y);
      const zw = 1 / sc;
      let run = null; let rx = 0;
      const flush = (x) => { if (run) p.rect(rx, y, x - rx, 1, run[0], run[1]); run = null; };
      for (let x = 0; x <= W; x++) {
        let c = null;
        if (x < W && y + 0.5 >= wallY(BW.bottom, x)) {
          c = fn((x + 0.5 - VP.x) / sc, zw, x, y);
          if (c && !Array.isArray(c)) c = [c, null];
        }
        if (!c || !run || c[0] !== run[0] || c[1] !== run[1]) { flush(x); if (c) { run = c; rx = x; } }
      }
    }
    p.rect(BW.x0, BW.bottom, BW.x1 - BW.x0, 1, '#000000', 0.35);
    for (let x = 0; x < BW.x0; x++) { const y = Math.round(wallY(BW.bottom, x)); p.px(x, y, '#000000', 0.35); p.px(W - 1 - x, y, '#000000', 0.35); }
  }

  // Back wall content is drawn freely, then this trims anything that spilled outside the back wall rectangle.
  function trimBackWall(p, ceiling) {
    p.rect(0, 0, W, BW.top, ceiling);
    p.rect(0, BW.top, BW.x0, BW.bottom - BW.top, ceiling);
    p.rect(BW.x1, BW.top, W - BW.x1, BW.bottom - BW.top, ceiling);
  }

  function holoTerminal(p, x, i) {
    p.rect(x, 40, 22, 40, '#3c4860'); p.rect(x, 40, 22, 2, '#7ff0ff'); p.rect(x + 1, 42, 1, 38, '#5a6880');
    p.rect(x + 2, 46, 18, 14, '#06131a'); p.rect(x + 2, 46, 18, 14, '#3fe0e0', 0.12);
    for (let k = 0; k < 3; k++) { p.rect(x + 3 + k * 6, 48, 4, 9, '#3fe0e0', 0.25); p.text('7', x + 3 + k * 6, 50, i ? '#ffd75e' : '#ff7ad8'); }
    p.rect(x + 4, 64, 14, 2, '#3fe0e0', 0.6);
    p.rect(x + 4, 68, 4, 3, '#5fd068'); p.rect(x + 9, 68, 4, 3, '#f05a4f'); p.rect(x + 14, 68, 4, 3, '#ffd75e');
    p.g(i ? 'sc-pulse' : 'sc-pulse2', () => { p.rect(x + 3, 36, 16, 4, '#3fe0e0', 0.18); p.rect(x + 6, 37, 10, 2, '#7ff0ff', 0.5); });
  }
  // Draws fn's props moved up so that their feet (y=80 in the flat scenes) stand on the near floor.
  const nearCorner = (p, fn) => { p.out.push('<g transform="translate(0 -22)">'); fn(); p.out.push('</g>'); p.rect(0, 58, 24, 2, '#000000', 0.3); p.rect(W - 24, 58, 24, 2, '#000000', 0.3); };

  const starHash = (x, y, seed) => (((x * 73856093) ^ (y * 19349663) ^ seed) >>> 0);

  // ---------- the other seven rooms ----------
  function room3dOrbit(p) {
    p.rect(0, 0, W, H, '#141a26');
    // back wall: panels and a wide window onto Earth
    p.rect(BW.x0, BW.top, BW.x1 - BW.x0, BW.bottom - BW.top, '#2a3344');
    for (let x = BW.x0; x < BW.x1; x += 16) { p.rect(x, BW.top, 1, 36, '#1a2130'); p.rect(x + 1, BW.top, 1, 36, '#3c4860'); }
    p.rect(BW.x0, BW.top, BW.x1 - BW.x0, 1, '#7ff0ff'); p.rect(BW.x0, BW.top + 1, BW.x1 - BW.x0, 2, '#7ff0ff', 0.15);
    const n = noise(7);
    p.rect(57, 10, 78, 24, '#5a6880');
    for (let y = 11; y < 33; y++) for (let x = 58; x < 134; x++) {
      const ex = x + 0.5 - 76; const ey = y + 0.5 - 52; const d = Math.sqrt(ex * ex + ey * ey);
      let c;
      if (d < 30) {
        if (d > 29) c = '#8fd0ff';
        else if (n(x + 40, y) > 0.8) c = '#fbf6e6';
        else c = n(x, y) > 0.58 ? (ex > 8 ? '#2a7a3a' : '#3fae5a') : (ex > 8 ? '#1a4aa0' : '#2a6fd8');
      } else if (d < 31.5) c = '#3a6aa0';
      else { const h = starHash(x, y, 3); c = h % 37 === 0 ? '#ffffff' : h % 61 === 0 ? '#a8d0ff' : '#05060f'; }
      p.px(x, y, c);
    }
    p.disc(122, 17, 3, '#d0d0d4'); p.px(121, 16, '#ffffff'); p.px(123, 18, '#8a8a92');
    for (let x = 76; x < 134; x += 19) p.rect(x, 11, 1, 22, '#5a6880');
    p.rect(57, 33, 78, 1, '#9aa8c0');
    p.rect(BW.x0, 36, BW.x1 - BW.x0, 1, '#7ff0ff', 0.6);
    trimBackWall(p, '#141a26');
    sideWalls3d(p, { upper: ['#2a3344', '#26303f'], rail: '#7ff0ff', lower: '#1f2633', seam: '#1a2130', ceilingEdge: '#7ff0ff' });
    floor3d(p, (xw, zw) => {
      if (zw > 0.93) return Math.floor(xw / 3) % 2 ? '#20202a' : '#ffd75e';
      const gx = ((xw % 6) + 6) % 6; const gz = (zw * 20) % 1;
      return gx < 0.7 ? '#2e3848' : gz < 0.12 ? '#161b25' : '#1f2633';
    });
    nearCorner(p, () => { holoTerminal(p, 1, 0); holoTerminal(p, W - 23, 1); });
  }

  function decoBack(p, bg, stripe, space) {
    p.rect(BW.x0, BW.top, BW.x1 - BW.x0, BW.bottom - BW.top, bg);
    for (let x = BW.x0 + 3; x < BW.x1; x += 6) p.rect(x, 15, 1, 16, stripe, 0.35);
    p.rect(BW.x0, 14, BW.x1 - BW.x0, 1, '#c9a24a');
    for (let x = BW.x0 + 7; x < BW.x1; x += 14) fan(p, x, 14, 7, '#c9a24a', bg);
    p.rect(BW.x0, 31, BW.x1 - BW.x0, 1, '#c9a24a');
    p.rect(BW.x0, 32, BW.x1 - BW.x0, 10, space ? '#090c20' : '#0f1a32');
    for (let x = BW.x0 + 2; x < BW.x1 - 4; x += 6) { p.rect(x, 35, 3, 3, '#c9a24a', 0.3); p.rect(x + 1, 36, 1, 1, bg); }
  }

  function room3dDeco(p) {
    p.rect(0, 0, W, H, '#0a1020');
    decoBack(p, '#14213d', '#c9a24a', false);
    [64, 128].forEach((x) => chandelier(p, x, '#c9a24a', '#bfe4ff', '#ffe9a0'));
    trimBackWall(p, '#0a1020');
    [BW.x0, BW.x1 - 6].forEach((x) => { p.rect(x, BW.top, 6, BW.bottom - BW.top, '#e8e2d0'); p.rect(x + 2, BW.top + 3, 1, 30, '#c8c2ae'); p.rect(x + 4, BW.top + 3, 1, 30, '#c8c2ae'); p.rect(x - 1, BW.top, 8, 2, '#c9a24a'); p.rect(x - 1, BW.bottom - 3, 8, 3, '#c9a24a'); });
    sideWalls3d(p, { upper: ['#14213d', '#162544'], rail: '#c9a24a', lower: '#0f1a32', seam: '#c9a24a', ceilingEdge: '#c9a24a' });
    floor3d(p, (xw, zw) => {
      const a = Math.floor(xw / 8); const b = Math.floor(zw * 10);
      return (a + b) % 2 === 0 ? '#e8e2d0' : '#15151c';
    });
    nearCorner(p, () => [8, W - 20].forEach((x) => {
      p.rect(x + 2, 66, 8, 14, '#c9a24a'); p.rect(x + 3, 67, 6, 1, '#ffe08a');
      for (let i = 0; i < 6; i++) {
        const a = -Math.PI / 2 + (i - 2.5) * 0.5;
        for (let t = 2; t < 16; t++) p.px(Math.round(x + 6 + Math.cos(a) * t), Math.round(64 + Math.sin(a) * t * 0.9 + (t * t) / 28), i % 2 ? '#2a7a3a' : '#3fae5a');
      }
    }));
  }

  function room3dLiner(p) {
    p.rect(0, 0, W, H, '#05060f');
    decoBack(p, '#0d1028', '#c9a24a', true);
    const n = noise(31);
    const nebula = (x, y) => {
      const v = n(x * 2, y * 2);
      if (starHash(x, y, 9) % 23 === 0) return '#ffffff';
      return v > 0.72 ? '#ff7ad8' : v > 0.6 ? '#b04fd0' : v > 0.48 ? '#5a2a9a' : v > 0.38 ? '#2a1a5a' : '#06061a';
    };
    [[64, 23, 7], [128, 23, 7]].forEach(([cx, cy, r]) => porthole(p, cx, cy, r, '#c9a24a', '#ffe08a', nebula));
    [BW.x0, BW.x1 - 4].forEach((x) => { p.rect(x, BW.top, 4, 36, '#1a1d3a'); p.rect(x + 1, BW.top + 2, 2, 32, '#e0ffff', 0.8); p.g('sc-pulse', () => p.rect(x, BW.top + 2, 4, 32, '#7ff0ff', 0.35)); });
    trimBackWall(p, '#05060f');
    sideWalls3d(p, { upper: ['#0d1028', '#0f132e'], rail: '#c9a24a', lower: '#090c20', seam: '#c9a24a', ceilingEdge: '#c9a24a' });
    // portholes on the side walls, squashed by the angle
    [[10, 2], [30, 1.3]].forEach(([x, k]) => [0, 1].forEach((side) => {
      const xx = side ? W - 1 - x : x; const y = Math.round(wallY(20, x));
      p.circle(xx, y, 5 * k, (sx, sy, dx, dy, d) => {
        const ex = dx / 0.55;
        const dd = Math.sqrt(ex * ex + dy * dy);
        if (dd > 5 * k) return null;
        if (dd > 5 * k - 1.2) return '#c9a24a';
        return nebula(sx + side * 50, sy);
      });
    }));
    floor3d(p, (xw, zw, x, y) => {
      const a = Math.floor(xw / 8); const b = Math.floor(zw * 10);
      if ((a + b) % 2 === 0) return '#c8c2e0';
      return starHash(x, y, 4) % 19 === 0 ? '#ffffff' : '#0a0a20';
    });
    nearCorner(p, () => [12, W - 12].forEach((x) => {
      p.g('sc-pulse2', () => p.disc(x, 40, 10, '#ffe9a0', 0.12));
      p.disc(x, 40, 5, '#ffd75e'); p.circle(x, 40, 5, (sx, sy, dx, dy) => (dx + dy > 1 ? '#c9a24a' : null));
      p.rect(x - 9, 40, 19, 1, '#ffe08a'); p.rect(x - 7, 41, 15, 1, '#c9a24a', 0.6);
      p.rect(x - 1, 50, 2, 30, '#c9a24a'); p.rect(x - 4, 78, 8, 2, '#c9a24a');
    }));
  }

  function room3dNeon(p) {
    p.rect(0, 0, W, H, '#08040f');
    p.bands(BW.top, BW.bottom, ['#0e0820', '#150a2a', '#1e0d36', '#2a1040']);
    p.stars(3, 26, BW.x0, BW.top, BW.x1, 22);
    p.disc(132, 12, 3, '#fbf6e6'); p.disc(133, 11, 3, '#150a2a');
    skyline(p, 9, 14, BW.bottom, '#1a1030', '#0c0618', ['#ffd75e', '#7ff0ff', '#ff7ad8']);
    for (let x = BW.x0; x <= BW.x1; x += 24) p.rect(x, BW.top, 1, 36, '#05030a');
    p.rect(118, 8, 23, 9, '#05030a'); p.g('sc-flicker2', () => p.text('LUCKY', 120, 10, '#ff7ad8', '#ff3ac8'));
    trimBackWall(p, '#08040f');
    sideWalls3d(p, { upper: ['#140a1e', '#170c22'], rail: '#ff7ad8', lower: '#0c0614', seam: '#05030a', railAt: 28 });
    // neon signs on the side walls
    p.rect(6, 14, 22, 9, '#05030a'); p.g('sc-flicker', () => p.text('BAR', 8, 16, '#7ff0ff', '#3fe0e0'));
    p.rect(W - 20, 12, 12, 9, '#05030a'); p.g('sc-blink', () => p.text('21', W - 18, 14, '#ffd75e', '#ff9a3a'));
    ['A', 'C', 'E'].forEach((c, i) => p.g(`sc-chase sc-d${i}`, () => p.text(c, 36, 12 + i * 6, '#ff7ad8', '#ff3ac8')));
    floor3d(p, (xw, zw) => {
      const gx = ((xw % 24) + 24) % 24;
      if (gx < 0.6) return Math.floor(xw / 24) % 2 ? ['#7ff0ff', 0.5] : ['#ff7ad8', 0.5];
      return (zw * 14) % 1 < 0.1 ? '#2a1040' : '#140a1e';
    });
    p.rect(BW.x0, BW.bottom, BW.x1 - BW.x0, 1, '#ff7ad8');
  }

  function room3dMars(p) {
    p.rect(0, 0, W, H, '#0a0606');
    p.bands(BW.top, 30, ['#05030a', '#0a0612', '#140a1a', '#2a0f18', '#4a1a16']);
    p.stars(13, 40, BW.x0, BW.top, BW.x1, 24);
    p.disc(60, 11, 2, '#8a7a6a'); p.disc(124, 14, 1.5, '#a89888');
    const n = noise(5);
    for (let x = BW.x0; x < BW.x1; x++) {
      const far = 26 + Math.round(Math.sin(x / 9) * 2 + n(x, 0) * 3);
      const near = 32 + Math.round(Math.sin(x / 5 + 1) * 1.5 + n(x, 9) * 2);
      p.rect(x, far, 1, BW.bottom - far, '#8a2a0a'); p.rect(x, near, 1, BW.bottom - near, '#c1440e');
    }
    [[62, 9, '#3fe0e0'], [132, 10, '#ff3ac8']].forEach(([cx, r, glow]) => p.circle(cx, BW.bottom, r, (x, y, dx, dy, d) => (dy > 0 ? null : d > r - 1 ? ['#bfe4ff', 0.6] : [glow, 0.2])));
    for (let x = BW.x0; x <= BW.x1; x += 24) p.rect(x, BW.top, 1, 36, '#05030a');
    trimBackWall(p, '#0a0606');
    sideWalls3d(p, { upper: ['#1a1a22', '#1e1e28'], rail: '#7ff0ff', lower: '#101016', seam: '#05030a', railAt: 28 });
    p.rect(6, 14, 22, 9, '#05030a'); p.g('sc-flicker', () => p.text('BAR', 8, 16, '#7ff0ff', '#3fe0e0'));
    p.rect(W - 20, 12, 12, 9, '#05030a'); p.g('sc-flicker2', () => p.text('21', W - 18, 14, '#ff7ad8', '#ff3ac8'));
    floor3d(p, (xw, zw) => {
      const gx = ((xw % 16) + 16) % 16;
      if (gx < 0.6) return ['#7ff0ff', 0.35];
      return (zw * 12) % 1 < 0.1 ? '#2a1010' : '#1a0a0a';
    });
    p.rect(BW.x0, BW.bottom, BW.x1 - BW.x0, 1, '#7ff0ff');
  }

  function vipRoom(p, o) {
    p.rect(0, 0, W, H, o.wall);
    p.rect(BW.x0, BW.top, BW.x1 - BW.x0, BW.bottom - BW.top, o.wall);
    // window over the city (or the black hole)
    o.view(p, 58, 9, 134, 34);
    p.rect(56, 7, 80, 2, o.gold); p.rect(56, 34, 80, 2, o.gold); p.rect(56, 9, 2, 25, o.gold); p.rect(134, 9, 2, 25, o.gold);
    if (!o.noMullions) for (let x = 77; x < 134; x += 19) p.rect(x, 9, 1, 25, '#1a1612');
    // curtains framing the window
    for (let x = BW.x0; x < 57; x++) { const k = (x - BW.x0) % 3; const c = k === 0 ? o.velvetDark : k === 1 ? o.velvet : o.velvetLight; p.rect(x, BW.top, 1, 36, c); p.rect(W - 1 - x, BW.top, 1, 36, c); }
    p.rect(BW.x0, 22, 9, 2, o.gold); p.rect(W - 1 - BW.x0 - 8, 22, 9, 2, o.gold);
    p.rect(BW.x0, BW.top, BW.x1 - BW.x0, 1, o.gold);
    trimBackWall(p, o.wall);
    sideWalls3d(p, { upper: [o.wall, o.wall2], rail: o.gold, lower: o.lower, railAt: 32, ceilingEdge: o.gold });
    // marble veins on the side walls
    const r = rng(o.seed);
    for (let v = 0; v < 10; v++) {
      let x = Math.floor(r() * BW.x0); let y = Math.floor(r() * 40);
      for (let i = 0; i < 18; i++) { if (y > wallY(BW.top, x) && y < wallY(32, x)) { p.px(x, y, o.vein, 0.6); p.px(W - 1 - x, y, o.vein, 0.6); } x += r() < 0.5 ? 1 : 0; y += r() < 0.7 ? 1 : -1; }
    }
    floor3d(p, (xw, zw) => {
      const gx = ((xw % 16) + 16) % 16;
      if (gx < 0.5 || (zw * 8) % 1 < 0.06) return [o.gold, 0.45];
      return o.floor;
    });
    // tall plants in gold pots in the near corners
    nearCorner(p, () => [6, W - 18].forEach((x) => {
      p.rect(x + 2, 66, 8, 14, o.gold); p.rect(x + 3, 67, 6, 1, '#ffffff', 0.3);
      for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i - 3) * 0.32; for (let t = 2; t < 24; t++) p.px(Math.round(x + 6 + Math.cos(a) * t * 0.6), Math.round(66 + Math.sin(a) * t), i % 2 ? '#1f5a2a' : '#2a7a3a'); }
    }));
  }

  function room3dVip(p) {
    vipRoom(p, {
      wall: '#0c0b10', wall2: '#0e0d13', lower: '#08070b', gold: '#c9a24a', vein: '#2a2630', floor: '#0a090d', seed: 41,
      velvet: '#5a0f1a', velvetLight: '#8a2030', velvetDark: '#2a0610',
      view: (pp, x0, y0, x1, y1) => {
        for (let y = y0; y < y1; y++) pp.rect(x0, y, x1 - x0, 1, ['#05061a', '#0a0c26', '#141838', '#1e2448'][Math.floor(((y - y0) / (y1 - y0)) * 4)]);
        pp.stars(19, 22, x0, y0, x1, y0 + 12);
        pp.disc(70, 15, 3, '#fbf6e6');
        const rr = rng(77);
        let x = x0;
        while (x < x1) { const w = 4 + Math.floor(rr() * 6); const h = 4 + Math.floor(rr() * 10); pp.rect(x, y1 - h, Math.min(w, x1 - x), h, '#080918'); for (let wy = y1 - h + 2; wy < y1 - 1; wy += 2) for (let wx = x + 1; wx < Math.min(x + w, x1) - 1; wx += 2) if (rr() < 0.35) pp.px(wx, wy, rr() < 0.5 ? '#ffd75e' : '#ff9a3a', 0.8); x += w + 1; }
      },
    });
  }

  function room3dHorizon(p) {
    vipRoom(p, {
      wall: '#0a0812', wall2: '#0c0a16', lower: '#06050a', gold: '#ffb347', vein: '#2a1a3a', floor: '#06050a', seed: 43, noMullions: true,
      velvet: '#2a0f40', velvetLight: '#4a1f6a', velvetDark: '#140620',
      view: (pp, x0, y0, x1, y1) => {
        pp.rect(x0, y0, x1 - x0, y1 - y0, '#020108');
        pp.stars(29, 60, x0, y0, x1, y1);
        const cx = 96; const cy = 20;
        pp.circle(cx, cy, 9, (x, y, dx, dy, d) => (d > 7.5 && dy < 1.5 ? (d > 8.4 ? ['#ff7a2a', 0.7] : '#ffc46a') : null));
        for (let y = -3; y <= 3; y++) {
          const half = Math.round(34 * Math.sqrt(1 - (y * y) / 12));
          for (let x = -half; x <= half; x++) {
            const t = Math.abs(x) / 34;
            const c = t < 0.35 ? '#fff4d0' : t < 0.55 ? '#ffd75e' : t < 0.75 ? '#ff9a3a' : '#c84a1a';
            if (cx + x >= x0 && cx + x < x1 && (Math.abs(y) <= 1 || t < 0.6)) pp.px(cx + x, cy + y, c, Math.abs(y) > 1 ? 0.6 : 1);
          }
        }
        pp.g('sc-pulse', () => pp.disc(cx, cy, 10, '#ff9a3a', 0.12));
        pp.disc(cx, cy, 6.5, '#ffe9a0'); pp.disc(cx, cy, 5.8, '#000000');
        pp.rect(cx - 9, cy, 19, 1, '#fff4d0');
      },
    });
  }

  // The 3D felt's outline (half-ellipse) as a stepped clip-path, relative to its box.
  const feltClip3d = (() => {
    const u = STAGE.u; const pts = [];
    const ox = FELT3.x0; const oy = FELT3.top;
    const rows = [];
    for (let y = FELT3.top; y < FELT3.bottom; y++) {
      const h = ellHalf(T3.frx, T3.fry, y + 1 - T3.cy);
      rows.push([y, Math.round(T3.cx - (h || 0)), Math.round(T3.cx + (h || 0))]);
    }
    rows.forEach(([y, , b]) => pts.push([b - ox, y - oy], [b - ox, y + 1 - oy]));
    rows.slice().reverse().forEach(([y, a]) => pts.push([a - ox, y + 1 - oy], [a - ox, y - oy]));
    return `polygon(${pts.map(([x, y]) => `${x * u}px ${y * u}px`).join(', ')})`;
  })();

  const svgCache = {};
  function svg(id, stage) {
    const key = `${id}:${stage ? 1 : 0}`;
    if (!svgCache[key]) {
      const p = new Painter();
      const sc = SCENES[id];
      if (stage && sc.room3d) { sc.room3d(p); drawTable3d(p, sc, id); } else { sc.draw(p); if (stage) drawStage(p, sc, id); }
      svgCache[key] = `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true">${p.out.join('')}</svg>`;
    }
    return svgCache[key];
  }

  // The felt's outline as a stepped clip-path in px, relative to the .table box (which covers FELT exactly).
  const feltClip = (() => {
    const u = STAGE.u; const pts = [];
    const ox = FELT.x0; const oy = FELT.top;
    for (let y = FELT.top; y < FELT.bottom; y++) { const s = span(FELT, y); pts.push([s[1] - ox, y - oy], [s[1] - ox, y + 1 - oy]); }
    for (let y = FELT.bottom - 1; y >= FELT.top; y--) { const s = span(FELT, y); pts.push([s[0] - ox, y + 1 - oy], [s[0] - ox, y - oy]); }
    return `polygon(${pts.map(([x, y]) => `${x * u}px ${y * u}px`).join(', ')})`;
  })();

  let applied = { id: null, vars: [] };
  let introTimer = null;
  const reduceMotion = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // The stage needs a landscape window big enough for the table; otherwise the game stacks as usual over the room.
  const stageFits = () => root.innerWidth >= 860 && root.innerHeight >= 480 && root.innerWidth / root.innerHeight >= 1.2;

  function layer() {
    let el = root.document.getElementById('scene-backdrop');
    if (!el) {
      el = root.document.createElement('div');
      el.id = 'scene-backdrop';
      el.innerHTML = '<div class="scene-art"></div><div class="scene-plate" aria-hidden="true"><b></b><span></span></div>';
      root.document.body.prepend(el);
    }
    return el;
  }

  /** Shows a scene (or clears it with null). opts.intro: the room and its name first, then the cards and seats fade in. */
  function apply(id, opts) {
    const body = root.document.body;
    applied.vars.forEach((k) => body.style.removeProperty(k));
    applied = { id: null, vars: [] };
    endIntro();
    if (!id || !SCENES[id]) {
      ['scene', 'sceneSpace', 'stage', 'view'].forEach((k) => delete body.dataset[k]);
      const el = root.document.getElementById('scene-backdrop');
      if (el) el.remove();
      const dl = root.document.getElementById('scene-dealer');
      if (dl) dl.remove();
      dealerName(null);
      const table = root.document.querySelector('#game .table');
      if (table) table.style.removeProperty('clip-path');
      ['--scene-px', '--stage-s', '--stage-x', '--stage-y'].forEach((k) => body.style.removeProperty(k));
      return null;
    }
    const sc = SCENES[id];
    const el = layer();
    el.querySelector('.scene-plate b').textContent = sc.name;
    el.querySelector('.scene-plate span').textContent = sc.subtitle;
    body.dataset.scene = id;
    body.dataset.sceneSpace = sc.space ? 'true' : 'false';
    Object.keys(sc.vars).forEach((k) => body.style.setProperty(k, sc.vars[k]));
    applied = { id, vars: Object.keys(sc.vars) };
    dealerName(root.ScenarioDealers && root.ScenarioDealers.DEALERS[id] ? root.ScenarioDealers.DEALERS[id].name : null);
    layout();
    if (opts && opts.intro && !reduceMotion()) {
      body.classList.add('scene-intro');
      introTimer = root.setTimeout(endIntro, opts.intro === true ? 2200 : opts.intro);
    }
    return sc;
  }

  // Picks stage or stacked layout for the current window and sizes everything.
  function layout() {
    const id = applied.id;
    if (!id) return;
    const doc = root.document;
    const body = doc.body;
    const el = layer();
    const stage = stageFits();
    const art = el.querySelector('.scene-art');
    const want = `${id}:${stage ? 1 : 0}`;
    if (art.dataset.key !== want) { art.innerHTML = svg(id, stage); art.dataset.key = want; }
    const table = doc.querySelector('#game .table');
    const sc = SCENES[id];
    if (stage) {
      body.dataset.stage = '1';
      const s = Math.min(root.innerWidth / STAGE.w, root.innerHeight / STAGE.h);
      const x = (root.innerWidth - STAGE.w * s) / 2;
      const y = (root.innerHeight - STAGE.h * s) / 2;
      body.style.setProperty('--stage-s', s.toFixed(5));
      body.style.setProperty('--stage-x', `${x.toFixed(1)}px`);
      body.style.setProperty('--stage-y', `${y.toFixed(1)}px`);
      // Window edges outside the picture continue the wall and the floor.
      const floorY = y + (80 / H) * STAGE.h * s;
      el.style.background = `linear-gradient(to bottom, ${sc.wall || sc.top || '#000'} ${floorY.toFixed(0)}px, ${sc.floor || '#000'} ${floorY.toFixed(0)}px)`;
      if (sc.room3d) body.dataset.view = '3d'; else delete body.dataset.view;
      if (table) table.style.clipPath = sc.room3d ? feltClip3d : feltClip;
      const dl = doc.getElementById('scene-dealer');
      if (dl) dl.remove();
    } else {
      delete body.dataset.stage;
      delete body.dataset.view;
      el.style.background = sc.top || '#000';
      if (table) table.style.removeProperty('clip-path');
      placeDealer(id);
      const svgEl = art.querySelector('svg');
      if (svgEl) body.style.setProperty('--scene-px', `${Math.max(4, Math.min(9, svgEl.getBoundingClientRect().height / H)).toFixed(3)}px`);
    }
  }
  root.addEventListener('resize', layout);

  // Stacked layout only: the dealer stands in a band above the table, at the room's pixel size.
  function placeDealer(id) {
    const doc = root.document;
    const table = doc.querySelector('#game .table');
    const D = root.ScenarioDealers;
    let el = doc.getElementById('scene-dealer');
    if (!table || !D || !D.DEALERS[id]) { if (el) el.remove(); return; }
    if (!el) {
      el = doc.createElement('div');
      el.id = 'scene-dealer';
      el.innerHTML = '<div class="sd-figure"></div>';
    }
    if (el.nextElementSibling !== table) table.parentNode.insertBefore(el, table);
    el.querySelector('.sd-figure').innerHTML = D.sprite(id);
  }

  // The felt says the dealer's name instead of "Dealer" (only the label's text node changes, not the total).
  function dealerName(name) {
    const label = root.document.querySelector('#game .dealer-label');
    if (!label) return;
    const t = [...label.childNodes].find((n) => n.nodeType === 3 && n.textContent.trim());
    if (!t) return;
    if (!label.dataset.defaultName) label.dataset.defaultName = t.textContent;
    t.textContent = name ? `${name} ` : label.dataset.defaultName;
  }

  function endIntro() {
    root.clearTimeout(introTimer);
    root.document.body.classList.remove('scene-intro');
  }
  root.document.addEventListener('click', () => { if (root.document.body.classList.contains('scene-intro')) endIntro(); }, true);
  root.document.addEventListener('keydown', (e) => { if (e.key === 'Escape') endIntro(); });

  root.Scenarios = {
    SCENES,
    BY_DIFFICULTY,
    STAGE,
    forMode,
    apply,
    applyForMode: (type, difficulty, opts) => apply(forMode(type, difficulty), opts || { intro: true }),
    clear: () => apply(null),
    svg,
  };
})(window);
