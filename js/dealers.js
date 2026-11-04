/* Pixel-art dealers, one per scene. Each is composed from parts (head, hair, outfit, accessories) on a 24x28 grid
   and drawn as crisp SVG rectangles. The eyes blink via a CSS-animated overlay. */
(function (root) {
  'use strict';

  const GW = 24;
  const GH = 28;

  function Grid() { this.c = []; for (let y = 0; y < GH; y++) this.c.push(new Array(GW).fill(null)); }
  Grid.prototype.set = function (x, y, col) { if (x >= 0 && x < GW && y >= 0 && y < GH) this.c[y][x] = col; };
  Grid.prototype.rect = function (x, y, w, h, col) { for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) this.set(i, j, col); };
  Grid.prototype.row = function (y, x0, x1, col) { this.rect(x0, y, x1 - x0 + 1, 1, col); };
  Grid.prototype.toRects = function (opacityFor) {
    let out = '';
    for (let y = 0; y < GH; y++) {
      let x = 0;
      while (x < GW) {
        const col = this.c[y][x];
        if (!col) { x++; continue; }
        let w = 1;
        while (x + w < GW && this.c[y][x + w] === col) w++;
        const [fill, op] = col.split('/');
        out += `<rect x="${x}" y="${y}" width="${w}" height="1" fill="${fill}"${op ? ` fill-opacity="${op}"` : ''}/>`;
        x += w;
      }
    }
    return out;
  };

  // ---------------------------------------------------------------- parts
  function torso(g, d) {
    const j = d.outfit; const jd = d.outfitDark;
    g.row(19, 5, 18, j); g.row(20, 3, 20, j);
    g.rect(2, 21, 20, 7, j);
    g.rect(2, 21, 2, 7, jd); g.rect(20, 21, 2, 7, jd);           // arms in shade
    // neckline / shirt V
    const s = d.shirt;
    [[19, 9, 14], [20, 10, 13], [21, 10, 13], [22, 11, 12], [23, 11, 12]].forEach(([y, a, b]) => g.row(y, a, b, s));
    g.set(9, 20, jd); g.set(14, 20, jd); g.set(10, 22, jd); g.set(13, 22, jd); g.set(10, 23, jd); g.set(13, 23, jd);
    if (d.trim) { g.row(19, 5, 8, d.trim); g.row(19, 15, 18, d.trim); }
    if (d.epaulettes) { g.row(20, 3, 6, d.epaulettes); g.row(20, 17, 20, d.epaulettes); g.row(21, 2, 5, d.epaulettes + '/0.6'); g.row(21, 18, 21, d.epaulettes + '/0.6'); }
    // name badge
    g.rect(15, 23, 4, 2, d.badge || '#c9a24a'); g.set(15, 23, '#ffe9a0');
    // neckwear
    const n = d.neckColor;
    if (d.neck === 'bow') { g.row(19, 10, 13, n); g.set(11, 20, n); g.set(12, 20, n); g.set(11, 19, n); g.set(12, 19, d.neckDark || n); }
    if (d.neck === 'tie') { g.row(19, 11, 12, n); g.rect(11, 20, 2, 4, n); g.set(12, 21, d.neckDark || n); }
    if (d.neck === 'pearls') { [[9, 19], [10, 20], [11, 21], [12, 21], [13, 20], [14, 19]].forEach(([x, y]) => g.set(x, y, n)); }
    if (d.neck === 'chain') { [[10, 19], [10, 20], [11, 21], [12, 21], [13, 20], [13, 19]].forEach(([x, y]) => g.set(x, y, n)); g.set(12, 22, n); }
  }

  function head(g, d) {
    const k = d.skin; const ks = d.skinShade;
    g.rect(10, 16, 4, 3, ks);                                        // neck
    g.rect(7, 4, 10, 12, k);
    g.set(7, 4, null); g.set(16, 4, null); g.set(7, 15, null); g.set(16, 15, null);
    g.rect(16, 5, 1, 10, ks); g.row(15, 8, 15, ks);                 // shade
    g.rect(6, 9, 1, 3, k); g.rect(17, 9, 1, 3, ks);                 // ears
    // eyes, brows, nose, mouth
    g.rect(9, 9, 1, 2, d.eye || '#20202a'); g.rect(14, 9, 1, 2, d.eye || '#20202a');
    g.set(10, 9, '#ffffff/0.8'); g.set(13, 9, '#ffffff/0.8');
    const brow = d.brow || d.hair || '#20202a';
    g.row(7, 8, 10, brow); g.row(7, 13, 15, brow);
    g.rect(12, 11, 1, 2, ks);
    g.row(13, 11, 13, d.lip || ks);
    if (d.blush) { g.set(8, 12, d.blush); g.set(15, 12, d.blush); }
  }

  const HAIR = {
    short(g, c, hl) { g.row(2, 8, 15, c); g.row(3, 7, 16, c); g.row(4, 6, 17, c); g.row(5, 6, 17, c); g.rect(6, 6, 1, 3, c); g.rect(17, 6, 1, 3, c); if (hl) g.row(3, 9, 11, hl); },
    slick(g, c, hl) { g.row(2, 8, 15, c); g.row(3, 7, 16, c); g.row(4, 6, 17, c); g.rect(6, 5, 1, 4, c); g.rect(17, 5, 1, 4, c); g.row(5, 13, 16, c); if (hl) { g.row(3, 9, 13, hl); g.set(14, 4, hl); } },
    bob(g, c, hl) { g.row(2, 8, 15, c); g.row(3, 6, 17, c); g.rect(5, 4, 14, 2, c); g.row(6, 7, 16, c); g.rect(5, 6, 2, 9, c); g.rect(17, 6, 2, 9, c); g.set(6, 15, c); g.set(17, 15, c); if (hl) g.row(3, 8, 11, hl); },
    side(g, c) { g.rect(6, 6, 2, 5, c); g.rect(16, 6, 2, 5, c); g.row(5, 6, 8, c); g.row(5, 15, 17, c); },
    bun(g, c, hl) { HAIR.short(g, c, hl); g.rect(10, 0, 4, 2, c); g.row(0, 11, 12, hl || c); },
  };

  const EXTRA = {
    mustache(g, d) { g.row(12, 9, 14, d.mustache); g.set(9, 13, d.mustache); g.set(14, 13, d.mustache); },
    shades(g) { g.row(8, 8, 15, '#08080c'); g.rect(8, 9, 3, 2, '#08080c'); g.rect(13, 9, 3, 2, '#08080c'); g.set(9, 9, '#ff7ad8'); g.set(14, 9, '#7ff0ff'); },
    glasses(g, d) { const f = d.glasses; g.row(8, 8, 10, f); g.row(8, 13, 15, f); g.row(11, 8, 10, f); g.row(11, 13, 15, f); g.rect(8, 8, 1, 4, f); g.rect(10, 8, 1, 4, f); g.rect(13, 8, 1, 4, f); g.rect(15, 8, 1, 4, f); g.row(9, 11, 12, f); g.rect(9, 9, 1, 2, '#20202a'); g.rect(14, 9, 1, 2, '#20202a'); },
    earring(g, d) { g.set(6, 12, d.earring); g.set(17, 12, d.earring); },
    helmet(g, d) {
      const c = d.helmet;
      for (let y = 0; y < 19; y++) for (let x = 0; x < GW; x++) {
        const dx = x + 0.5 - 12; const dy = y + 0.5 - 9.5;
        const r = Math.sqrt(dx * dx + dy * dy);
        if (r > 10.6 && r < 11.6 && y < 18) g.set(x, y, c);
        else if (r <= 10.6 && dx < -4 && dy < -4 && r > 8.5) g.set(x, y, '#ffffff/0.55');
        else if (r <= 10.6 && !g.c[y][x]) g.set(x, y, c + '/0.15');
      }
      g.row(18, 5, 18, d.helmetRing || '#9aa8c0'); g.row(19, 4, 19, d.helmetRing || '#9aa8c0');
    },
    cyborg(g) { g.rect(13, 8, 4, 4, '#6a7890'); g.rect(14, 9, 1, 2, '#ff3a2a'); g.set(15, 9, '#ff3a2a/0.5'); g.row(12, 14, 16, '#4a5468'); g.set(17, 10, '#9aa8c0'); },
    visor(g, d) { g.row(7, 6, 17, d.visor); g.row(8, 7, 16, d.visor + '/0.4'); },
    monocle(g, d) { g.row(8, 13, 15, d.monocle); g.row(11, 13, 15, d.monocle); g.rect(13, 8, 1, 4, d.monocle); g.rect(15, 8, 1, 4, d.monocle); g.rect(16, 11, 1, 5, d.monocle + '/0.7'); },
    antennae(g, d) { const c = d.skin; g.rect(8, 1, 1, 3, c); g.rect(15, 1, 1, 3, c); g.set(7, 0, d.antennaTip); g.set(8, 0, d.antennaTip); g.set(15, 0, d.antennaTip); g.set(16, 0, d.antennaTip); },
    alienEyes(g) { g.rect(8, 8, 3, 3, '#08080c'); g.rect(13, 8, 3, 3, '#08080c'); g.set(8, 8, '#ffffff/0.7'); g.set(13, 8, '#ffffff/0.7'); g.row(7, 8, 10, null); g.row(7, 13, 15, null); g.row(13, 11, 13, '#2a7a3a'); },
  };

  function robotHead(g, d) {
    const m = d.metal; const md = d.metalDark;
    g.rect(10, 16, 4, 3, md);
    g.rect(6, 3, 12, 13, m); g.rect(16, 4, 2, 12, md); g.row(15, 6, 17, md);
    g.rect(5, 7, 1, 4, md); g.rect(18, 7, 1, 4, md);
    g.rect(12, 0, 1, 3, md); g.set(12, 0, '#ff3a2a');
    g.row(8, 7, 16, '#08080c'); g.row(9, 7, 16, '#08080c'); g.row(10, 7, 16, '#08080c');
    g.rect(9, 9, 2, 1, d.visor); g.rect(13, 9, 2, 1, d.visor);
    g.row(13, 9, 14, md); g.set(10, 13, m); g.set(12, 13, m); g.set(14, 13, m);
    [[7, 4], [16, 4], [7, 14], [16, 14]].forEach(([x, y]) => g.set(x, y, '#ffffff/0.5'));
  }

  // ---------------------------------------------------------------- the cast
  const DEALERS = {
    corner: {
      name: 'Old Tito', line: 'Thirty years at the same table.',
      skin: '#e0a878', skinShade: '#b87a50', hair: '#c8c2ae', hairStyle: 'side', brow: '#a8a290', mustache: '#d8d2c0',
      outfit: '#7a1a26', outfitDark: '#5a1018', shirt: '#fbf6e6', neck: 'bow', neckColor: '#20202a', extras: ['mustache'],
    },
    orbit: {
      name: 'T1-T0', line: 'Station dealer unit. Never blinks... mostly.',
      robot: true, metal: '#9aa8c0', metalDark: '#6a7890', visor: '#7ff0ff',
      outfit: '#4a5468', outfitDark: '#323a4a', shirt: '#262c3a', neck: 'bow', neckColor: '#7ff0ff', trim: '#7ff0ff', badge: '#7ff0ff',
    },
    deco: {
      name: 'Madame Odette', line: 'She has seen every trick in the book.',
      skin: '#f0c8a0', skinShade: '#c89870', hair: '#15151c', hairStyle: 'bob', hairHi: '#3a3a48', lip: '#b02a3a', blush: '#e89a90',
      outfit: '#15151c', outfitDark: '#08080c', shirt: '#f0c8a0', neck: 'pearls', neckColor: '#fbf6e6', trim: '#c9a24a', extras: ['earring'], earring: '#fbf6e6',
    },
    liner: {
      name: 'Captain Odette', line: 'Commands the liner and the table.',
      skin: '#f0c8a0', skinShade: '#c89870', hair: '#e8e2d0', hairStyle: 'bob', hairHi: '#ffffff', lip: '#b04fd0',
      outfit: '#1a1d5a', outfitDark: '#10123a', shirt: '#fbf6e6', neck: 'tie', neckColor: '#c9a24a', epaulettes: '#ffd75e',
      extras: ['helmet'], helmet: '#bfe4ff', helmetRing: '#c9a24a',
    },
    neon: {
      name: 'Vinnie', line: 'Smooth hands, smoother talk.',
      skin: '#c8885a', skinShade: '#9a6038', hair: '#15151c', hairStyle: 'slick', hairHi: '#5a5a7a',
      outfit: '#8f1d2c', outfitDark: '#5e101c', shirt: '#15151c', neck: 'chain', neckColor: '#ffd75e', extras: ['shades'],
    },
    mars: {
      name: 'Vinnie X', line: 'Rebuilt on Mars. Still smooth.',
      skin: '#c8885a', skinShade: '#9a6038', hair: '#15151c', hairStyle: 'slick', hairHi: '#7ff0ff',
      outfit: '#1a1a22', outfitDark: '#08080c', shirt: '#9a3a12', neck: 'chain', neckColor: '#7ff0ff', trim: '#7ff0ff', extras: ['cyborg'],
    },
    vip: {
      name: 'Mr. Valdez', line: 'High stakes, white gloves.',
      skin: '#8a5a3a', skinShade: '#6a4028', hair: '#d8d2c0', hairStyle: 'slick', hairHi: '#ffffff', brow: '#c8c2ae',
      outfit: '#141018', outfitDark: '#050407', shirt: '#fbf6e6', neck: 'bow', neckColor: '#141018', trim: '#2a2630', extras: ['monocle'], monocle: '#c9a24a',
    },
    horizon: {
      name: 'Zyx', line: 'Deals from the edge of time.',
      skin: '#5fd068', skinShade: '#3a9a48', hairStyle: null, lip: '#2a7a3a', brow: '#3a9a48',
      outfit: '#141018', outfitDark: '#050407', shirt: '#fbf6e6', neck: 'bow', neckColor: '#ffb347', trim: '#2a1a3a', badge: '#ffb347',
      extras: ['antennae', 'alienEyes'], antennaTip: '#ffb347', eye: '#08080c',
    },
  };

  function compose(d) {
    const g = new Grid();
    torso(g, d);
    if (d.robot) robotHead(g, d);
    else {
      head(g, d);
      if (d.hairStyle) HAIR[d.hairStyle](g, d.hair, d.hairHi);
    }
    (d.extras || []).forEach((e) => { if (e !== 'helmet') EXTRA[e](g, d); });
    if ((d.extras || []).includes('helmet')) EXTRA.helmet(g, d);
    // blink overlay: eyelids over the eyes
    const b = new Grid();
    if (d.robot) { b.rect(9, 9, 2, 1, '#08080c'); b.rect(13, 9, 2, 1, '#08080c'); }
    else if ((d.extras || []).includes('alienEyes')) { b.rect(8, 8, 3, 3, d.skin); b.rect(13, 8, 3, 3, d.skin); b.row(10, 8, 10, '#08080c'); b.row(10, 13, 15, '#08080c'); }
    else if (!(d.extras || []).includes('shades')) {
      b.rect(9, 9, 2, 2, d.skin); b.rect(13, 9, 2, 2, d.skin); b.row(10, 9, 10, d.skinShade); b.row(10, 13, 14, d.skinShade);
      if ((d.extras || []).includes('cyborg')) b.rect(13, 9, 2, 2, null);
    }
    return { base: g.toRects(), blink: b.toRects() };
  }

  const cache = {};
  /** Rect markup for a dealer on the 24x28 grid: { base, blink } (blink = eyelids, shown briefly by CSS). */
  function parts(id) { if (!cache[id] && DEALERS[id]) cache[id] = compose(DEALERS[id]); return cache[id] || null; }
  /** Draws the dealer inside another SVG at (x, y) in that SVG's units. */
  function inline(id, x, y) {
    const pt = parts(id);
    return pt ? `<g transform="translate(${x} ${y})"><g class="dl-body">${pt.base}<g class="dl-blink">${pt.blink}</g></g></g>` : '';
  }
  function sprite(id) {
    const pt = parts(id);
    return pt ? `<svg class="dealer-sprite" viewBox="0 0 ${GW} ${GH}" shape-rendering="crispEdges" aria-hidden="true">${pt.base}<g class="dl-blink">${pt.blink}</g></svg>` : '';
  }

  root.ScenarioDealers = { DEALERS, parts, inline, sprite, GW, GH };
})(window);
