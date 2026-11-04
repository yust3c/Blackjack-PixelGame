/* Pixel-art sprites built from tiny bitmaps and drawn as crisp SVG rectangles. */
(function (root) {
  'use strict';

  const SUITS = {
    '♥': [
      '.XX.XX.',
      'XXXXXXX',
      'XXXXXXX',
      'XXXXXXX',
      '.XXXXX.',
      '..XXX..',
      '...X...',
    ],
    '♦': [
      '...X...',
      '..XXX..',
      '.XXXXX.',
      'XXXXXXX',
      '.XXXXX.',
      '..XXX..',
      '...X...',
    ],
    '♠': [
      '...X...',
      '..XXX..',
      '.XXXXX.',
      'XXXXXXX',
      'XXXXXXX',
      '...X...',
      '..XXX..',
    ],
    '♣': [
      '..XXX..',
      '..XXX..',
      'XX.X.XX',
      'XXXXXXX',
      'XX.X.XX',
      '...X...',
      '..XXX..',
    ],
  };

  // Chip colours: [main, dark edge, light inner ring]
  const CHIP_COLORS = {
    2.5: ['#e8e2d0', '#8a8370', '#ffffff'],
    5: ['#d8323a', '#7a141a', '#ff8a8f'],
    10: ['#3a6fd8', '#1a347a', '#8fb3ff'],
    20: ['#f2b233', '#8a5a0a', '#ffe08a'],
    50: ['#f06a1f', '#86320a', '#ffb07a'],
    100: ['#2b2b33', '#0a0a0e', '#7a7a8a'],
    250: ['#e04fa8', '#7a1a5a', '#ff9ad6'],
    500: ['#7d4fd0', '#3a1a7a', '#c4a6ff'],
  };

  function bitmapSvg(rows, fills, cls) {
    const h = rows.length;
    const w = rows[0].length;
    let rects = '';
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const ch = rows[y][x];
        if (fills[ch]) rects += `<rect x="${x}" y="${y}" width="1" height="1" fill="${fills[ch]}"/>`;
      }
    }
    return `<svg class="${cls}" viewBox="0 0 ${w} ${h}" shape-rendering="crispEdges" aria-hidden="true">${rects}</svg>`;
  }

  const suitCache = {};
  function suit(s) {
    if (!suitCache[s]) suitCache[s] = bitmapSvg(SUITS[s], { X: 'currentColor' }, 'px-suit');
    return suitCache[s];
  }

  // A 14x14 casino chip seen from above: dark outline, striped edge, light inner ring.
  const CHIP_SIZE = 14;
  const chipRows = (() => {
    const rows = [];
    const c = (CHIP_SIZE - 1) / 2;
    for (let y = 0; y < CHIP_SIZE; y++) {
      let row = '';
      for (let x = 0; x < CHIP_SIZE; x++) {
        const dx = x - c;
        const dy = y - c;
        const r = Math.sqrt(dx * dx + dy * dy);
        const angle = (Math.atan2(dy, dx) * 180) / Math.PI + 180;
        if (r > 6.9) row += '.';
        else if (r > 6.0) row += 'o';
        else if (r > 4.6) row += Math.floor(angle / 45) % 2 === 0 ? 'w' : 'm';
        else if (r > 3.6) row += 'i';
        else row += 'm';
      }
      rows.push(row);
    }
    return rows;
  })();

  const chipCache = {};
  function chip(value) {
    const key = String(value);
    if (!chipCache[key]) {
      const [main, dark, light] = CHIP_COLORS[value] || CHIP_COLORS[5];
      chipCache[key] = bitmapSvg(chipRows, { o: dark, w: '#fbf6e6', m: main, i: light }, 'px-chip');
    }
    return chipCache[key];
  }

  /** Splits an amount into casino chips, largest first. */
  function breakdown(amount) {
    const out = [];
    let left = amount;
    for (const v of [500, 250, 100, 50, 20, 10, 5, 2.5]) {
      while (left >= v - 1e-9) { out.push(v); left -= v; }
    }
    return out;
  }

  root.PixelSprites = { suit, chip, breakdown, CHIP_COLORS };
})(window);
