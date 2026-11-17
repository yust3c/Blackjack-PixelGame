/* Chip stacks on the table: real chips seen from the side, stacked like a casino bet (biggest chips at the bottom).
   The colours (and animated stripes) come from the chip sprite PixelSprites.chip(value), so every chip skin
   in js/cosmetics.js gets matching stacks without its own side-view art.
   ui.js: ChipStacks.html(chips) where chips is a list of chip values (a bet, a double or a payout). */
(function (root) {
  'use strict';

  const PX = root.PixelSprites;
  const W = 14;            // chip width in sprite pixels (same as the top-view chip)
  const CAP = 6;           // rows of the top face (an ellipse seen at an angle)
  const EDGE = 3;          // rows of edge per chip in the stack
  const PER_COLUMN = 6;    // a pile taller than this is split into two even columns
  const MAX_CHIPS = 16;    // a pile with more chips than this colours up to bigger chips

  // Colours of one chip, read off its top-view sprite: outline, main, inner ring, stripe (with its class
  // when the skin animates the stripes).
  const paletteCache = {};
  function palette(value) {
    const svg = PX.chip(value);
    if (paletteCache[svg]) return paletteCache[svg];
    const at = {};
    const re = /<rect(?: class="([^"]*)")? x="(\d+)" y="(\d+)" width="1" height="1" fill="([^"]+)"\/>/g;
    let m;
    while ((m = re.exec(svg))) at[`${m[2]},${m[3]}`] = { cls: m[1] || '', fill: m[4] };
    const root0 = /<svg class="([^"]*)"((?: style="[^"]*")?)/.exec(svg) || [];
    const pick = (k, fb) => at[k] || fb;
    const out = {
      o: pick('0,6', { fill: '#000' }),     // outline ring
      m: pick('6,6', { fill: '#888' }),     // centre
      i: pick('2,6', { fill: '#ccc' }),     // inner ring
      w: pick('1,6', { fill: '#fff' }),     // stripe on the edge
      svgClass: (root0[1] || 'px-chip').replace('px-chip', 'px-stack'),
      svgStyle: root0[2] || '',
    };
    // The stripe pixel's class (cos-s0..2) carries the skin's stripe animation; reuse all three.
    out.anim = /cos-s\d/.test(out.w.cls);
    return (paletteCache[svg] = out);
  }

  // ---------------------------------------------------------------- colours
  const hex = (h) => {
    let x = String(h || '').trim().replace('#', '');
    if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    const n = parseInt(x, 16);
    return Number.isNaN(n) || x.length !== 6 ? null : [n >> 16, (n >> 8) & 255, n & 255];
  };
  function colourDistance(a, b) {   // "redmean" RGB distance, close to how different two colours look
    const p = hex(a); const q = hex(b);
    if (!p || !q) return Infinity;
    const rm = (p[0] + q[0]) / 2;
    return Math.sqrt((2 + rm / 256) * (p[0] - q[0]) ** 2 + 4 * (p[1] - q[1]) ** 2 + (2 + (255 - rm) / 256) * (p[2] - q[2]) ** 2);
  }
  function mix(a, b, t) {
    const p = hex(a); const q = hex(b);
    if (!p || !q) return a;
    return '#' + p.map((v, i) => Math.round(v + (q[i] - v) * t).toString(16).padStart(2, '0')).join('');
  }
  const NEAR_FELT = 90;   // a chip whose edge and colour are both this close to the felt gets a rim
  const NEAR_LINE = 70;   // a chip's bottom line must stand out this much from the chip under it
  function feltColours() {
    const C = root.Cosmetics; const v = C && C.feltVars ? C.feltVars() : null;
    const css = root.getComputedStyle(root.document.documentElement);
    const get = (k, fb) => (v && v[k]) || css.getPropertyValue(k).trim() || fb;
    return { felt: get('--felt', '#1f7a45'), line: get('--felt-line', '#e9d27a') };
  }

  // ---------------------------------------------------------------- one column
  /** A column of chips, `list` from the bottom up (values can be mixed), in the equipped chip set's colours.
      Drawn with a free pixel all round, which carries the felt rim when a chip would vanish into the felt. */
  const columnCache = {};
  function column(list, felt) {
    const pals = list.map(palette);
    const top = pals[pals.length - 1];
    const key = `${list.join(',')}|${pals.map((p) => p.o.fill + p.m.fill + p.w.fill).join('')}|${top.svgClass}|${top.svgStyle}|${felt.felt}|${felt.line}`;
    if (columnCache[key]) return columnCache[key];
    const n = list.length;
    const H = CAP + 1 + EDGE * n;
    let px = '';
    const filled = new Set();
    const put = (x, y, fill, cls) => {
      filled.add(`${x},${y}`);
      px += cls ? `<rect class="${cls}" x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${fill}"/>`
        : `<rect x="${x + 1}" y="${y + 1}" width="1" height="1" fill="${fill}"/>`;
    };
    // edges, bottom chip first so each one above overlaps the one below (k = 0 is the top chip)
    for (let k = n - 1; k >= 0; k--) {
      const idx = n - 1 - k; const p = pals[idx]; const below = pals[idx - 1];
      const y0 = CAP - 2 + EDGE * k;
      const shift = (k % 2) * 3;
      // the chip's bottom line: when it fades into the chip under it, a darker or lighter line, whichever shows
      let line = p.o.fill;
      if (below && colourDistance(line, below.m.fill) < NEAR_LINE) {
        const score = (c) => Math.min(colourDistance(c, below.m.fill), colourDistance(c, p.m.fill));
        line = [mix(p.o.fill, '#000000', 0.7), mix(p.m.fill, '#ffffff', 0.7), '#000000', '#ffffff'].reduce((a, c) => (score(c) > score(a) ? c : a));
      }
      for (let r = 0; r < EDGE; r++) {
        const y = y0 + r; const last = r === EDGE - 1;
        for (let x = 0; x < W; x++) {
          if (last && (x === 0 || x === W - 1)) continue;          // rounded bottom corners
          if (last) { put(x, y, line); continue; }
          if (x === 0 || x === W - 1) { put(x, y, p.o.fill); continue; }
          const s = (x + shift) % 6;   // short white inserts around the edge, offset chip to chip
          if (s === 2 || s === 3) put(x, y, p.w.fill, p.anim ? `cos-s${(x + k) % 3}` : '');
          else put(x, y, p.m.fill);
        }
      }
    }
    // the top chip's face
    const cx = (W - 1) / 2; const cy = (CAP - 1) / 2;
    for (let y = 0; y < CAP; y++) {
      for (let x = 0; x < W; x++) {
        const dx = (x - cx) / (W / 2); const dy = (y - cy) / (CAP / 2);
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > 1.02) continue;
        if (r > 0.84) put(x, y, top.o.fill);
        else if (r > 0.6) {
          if (Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 2 === 0) put(x, y, top.w.fill, top.anim ? `cos-s${x % 3}` : '');
          else put(x, y, top.m.fill);
        } else if (r > 0.42) put(x, y, top.i.fill);
        else put(x, y, top.m.fill);
      }
    }
    // A column with a chip that would vanish into the felt gets a one-pixel rim in the felt's line colour.
    if (pals.some((p) => colourDistance(p.o.fill, felt.felt) < NEAR_FELT && colourDistance(p.m.fill, felt.felt) < NEAR_FELT)) {
      const rim = mix(felt.line, felt.felt, 0.25);
      const ring = [];
      for (let y = -1; y <= H; y++) {
        for (let x = -1; x <= W; x++) {
          if (filled.has(`${x},${y}`)) continue;
          if (filled.has(`${x + 1},${y}`) || filled.has(`${x - 1},${y}`) || filled.has(`${x},${y + 1}`) || filled.has(`${x},${y - 1}`)) ring.push([x, y]);
        }
      }
      ring.forEach(([x, y]) => put(x, y, rim));
    }
    const svg = `<svg class="${top.svgClass}"${top.svgStyle} viewBox="0 0 ${W + 2} ${H + 2}" width="${W + 2}" height="${H + 2}" shape-rendering="crispEdges" aria-hidden="true">${px}</svg>`;
    return (columnCache[key] = { svg, h: H + 2 });
  }

  // ---------------------------------------------------------------- piles
  /** The chips to show for an amount when we don't know which chips were placed: fewest chips. */
  function breakdown(amount) { return PX.breakdown(amount); }

  /** A pile is one column, or two even columns once it holds more than PER_COLUMN chips: biggest chips at the
      bottom of the first column, the way a dealer stacks a mixed bet. Over MAX_CHIPS it colours up. */
  function fit(chips) {
    let list = chips.slice().sort((a, b) => b - a);
    if (list.length > MAX_CHIPS) list = breakdown(chips.reduce((a, b) => a + b, 0));
    if (list.length <= PER_COLUMN) return [list];
    const half = Math.ceil(list.length / 2);
    return [list.slice(0, half), list.slice(half)];
  }

  function html(chips) {
    if (!chips || !chips.length) return '';
    const felt = feltColours();
    const parts = fit(chips).map((list, i) => {
      const c = column(list, felt);
      return `<span class="cs-col" style="--i:${i};--h:${c.h}">${c.svg}</span>`;
    });
    return `<span class="chip-stacks" style="--cols:${parts.length}">${parts.join('')}</span>`;
  }

  root.ChipStacks = { html, columns: fit, breakdown, PER_COLUMN, MAX_CHIPS };
})(window);
