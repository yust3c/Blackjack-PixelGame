/* Chip stacks on the betting spot: real chips seen from the side, one column per value, like a casino bet.
   The colours (and animated stripes) come from the chip sprite PixelSprites.chip(value), so every chip skin
   in js/cosmetics.js gets matching stacks without its own side-view art.
   ui.js: ChipStacks.html(chips) where chips is the list of chip values on the seat (largest columns first). */
(function (root) {
  'use strict';

  const PX = root.PixelSprites;
  const W = 14;            // chip width in sprite pixels (same as the top-view chip)
  const CAP = 6;           // rows of the top face (an ellipse seen at an angle)
  const EDGE = 3;          // rows of edge per chip in the stack
  const PER_COLUMN = 10;   // a column this tall starts a new one beside it
  const MAX_COLUMNS = 5;

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

  function rect(x, y, p, cls) {
    return cls ? `<rect class="${cls}" x="${x}" y="${y}" width="1" height="1" fill="${p.fill}"/>`
      : `<rect x="${x}" y="${y}" width="1" height="1" fill="${p.fill}"/>`;
  }
  // A stripe pixel: animated skins cycle the three stripe classes along the edge.
  const stripe = (pal, x, y, n) => (pal.anim ? rect(x, y, pal.w, `cos-s${n % 3}`) : rect(x, y, pal.w));

  /** One column of `count` chips of one value, as an SVG in sprite pixels. */
  const columnCache = {};
  function column(value, count) {
    const pal = palette(value);
    const key = `${pal.svgClass}|${pal.svgStyle}|${pal.o.fill}|${pal.m.fill}|${pal.i.fill}|${pal.w.fill}|${pal.anim}|${count}`;
    if (columnCache[key]) return columnCache[key];
    const H = CAP + 1 + EDGE * count;
    let px = '';
    // edges, bottom chip first so each one above overlaps the one below
    for (let k = count - 1; k >= 0; k--) {
      const y0 = CAP - 2 + EDGE * k;
      const shift = (k % 2) * 3;
      for (let r = 0; r < EDGE; r++) {
        const y = y0 + r;
        for (let x = 0; x < W; x++) {
          const last = r === EDGE - 1;
          if (last && (x === 0 || x === W - 1)) continue;          // rounded bottom corners
          if (x === 0 || x === W - 1 || last) { px += rect(x, y, pal.o); continue; }
          const s = (x + shift) % 6;   // short white inserts around the edge, offset chip to chip
          px += s === 2 || s === 3 ? stripe(pal, x, y, x + k) : rect(x, y, pal.m);
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
        if (r > 0.84) px += rect(x, y, pal.o);
        else if (r > 0.6) px += (Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI / 4)) % 2 === 0) ? stripe(pal, x, y, x) : rect(x, y, pal.m);
        else if (r > 0.42) px += rect(x, y, pal.i);
        else px += rect(x, y, pal.m);
      }
    }
    const svg = `<svg class="${pal.svgClass}"${pal.svgStyle} viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" shape-rendering="crispEdges" aria-hidden="true">${px}</svg>`;
    return (columnCache[key] = { svg, h: H });
  }

  /** Groups chips into columns: one per value, largest first; very tall ones carry on in a new column. */
  function columns(chips) {
    const counts = new Map();
    chips.slice().sort((a, b) => b - a).forEach((v) => counts.set(v, (counts.get(v) || 0) + 1));
    const out = [];
    for (const [v, n] of counts) for (let left = n; left > 0; left -= PER_COLUMN) out.push([v, Math.min(left, PER_COLUMN)]);
    return out;
  }

  /** The chips to show for an amount when we don't know which chips were placed: fewest chips. */
  function breakdown(amount) { return PX.breakdown(amount); }

  /** Chips placed on a seat, coloured up to bigger chips if they wouldn't fit in MAX_COLUMNS. */
  function fit(chips) {
    let cols = columns(chips);
    if (cols.length > MAX_COLUMNS) cols = columns(breakdown(chips.reduce((a, b) => a + b, 0)));
    return cols.slice(0, MAX_COLUMNS);
  }

  // Chips whose edge and colour are both close to the felt get a one-pixel rim in the felt's line colour
  // (css/style.css .cs-col.rim), so dark chips stay visible on dark felts. Other chips are left as they are.
  const hex = (h) => {
    let x = String(h || '').trim().replace('#', '');
    if (x.length === 3) x = x.split('').map((c) => c + c).join('');
    const n = parseInt(x, 16);
    return Number.isNaN(n) ? null : [n >> 16, (n >> 8) & 255, n & 255];
  };
  function colourDistance(a, b) {   // "redmean" RGB distance, close to how different two colours look
    const p = hex(a); const q = hex(b);
    if (!p || !q) return Infinity;
    const rm = (p[0] + q[0]) / 2;
    return Math.sqrt((2 + rm / 256) * (p[0] - q[0]) ** 2 + 4 * (p[1] - q[1]) ** 2 + (2 + (255 - rm) / 256) * (p[2] - q[2]) ** 2);
  }
  const NEAR = 90;
  function feltColour() {
    const C = root.Cosmetics; const v = C && C.feltVars ? C.feltVars() : null;
    if (v && v['--felt']) return v['--felt'];
    return root.getComputedStyle(root.document.documentElement).getPropertyValue('--felt').trim() || '#1f7a45';
  }
  function blendsIn(value, felt) {
    const pal = palette(value);
    return colourDistance(pal.o.fill, felt) < NEAR && colourDistance(pal.m.fill, felt) < NEAR;
  }

  function html(chips) {
    const cols = fit(chips);
    if (!cols.length) return '';
    const felt = feltColour();
    const parts = cols.map(([v, n], i) => {
      const c = column(v, n);
      return `<span class="cs-col${blendsIn(v, felt) ? ' rim' : ''}" style="--i:${i};--h:${c.h}">${c.svg}</span>`;
    });
    return `<span class="chip-stacks" style="--cols:${cols.length}">${parts.join('')}</span>`;
  }

  root.ChipStacks = { html, columns: fit, breakdown, PER_COLUMN, MAX_COLUMNS };
})(window);
