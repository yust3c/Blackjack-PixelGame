/* Effects layer: pixel effects drawn with PixiJS (vendor/pixi.min.js) on two transparent canvases laid over the scene
   picture in the stage layout. The back canvas sits in the room, under the table: the scene's own life (rain, dust,
   glints, stars...) and its events, where things outside show only through the window glass and things in the room
   pass behind the dealer. The front canvas is over the table: blackjacks, chip showers, win messages, achievement
   unlocks and the flashes of some events. Everything moves in steps at 18 frames a second, like the cards and chips.
   Effect units: the canvases are 1536x864 and drawn at 4 canvas px per effect px (384x216); one scene pixel is 2
   effect px. Window glass and dealer bitmaps come from js/fxdata.js.
   ui.js calls FXLayer.start(game, sceneId) / stop() / roundEnd(game); js/sceneevents.js hands its events over with
   FXLayer.playEvent(sceneId, eventId); the achievement toast fires 'achievement:toast'. In the stacked layout (phones,
   narrow windows) the layer stays off and the scene events keep their SVG drawings. */
(function (root) {
  'use strict';

  const doc = root.document;
  const W = 384, H = 216, S = 2;          // effect px (each is 4 canvas px); one scene pixel = 2 effect px
  const SW = 1536, SH = 864;              // the stage size
  const STEP = 1 / 18;                    // stepped motion, like the cards and chips
  let scene = null, reduce = false, frame = 0;
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (a) => a[Math.floor(Math.random() * a.length)];
  const reduceNow = () => (root.Prefs ? root.Prefs.reduceMotion() : !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches));
  const stageOn = () => doc.body.hasAttribute('data-stage');

  // ------------------------------------------------------------- bitmaps from js/fxdata.js
  const D = root.FXData || { glass: {}, dealer: {}, orbitFrame: '', valdezEyes: [] };
  const bits = {};
  function bitmap(b64) {
    if (!b64) return null;
    if (bits[b64]) return bits[b64];
    const s = root.atob(b64), u = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) u[i] = s.charCodeAt(i);
    return (bits[b64] = u);
  }
  const bit = (u, x, y) => !!u && x >= 0 && y >= 0 && x < 192 && y < 108 && (u[(y * 192 + x) >> 3] >> ((y * 192 + x) & 7)) & 1;
  const isGlass = (id, x, y) => bit(bitmap(D.glass[id]), x, y);
  const isFrame = (x, y) => bit(bitmap(D.orbitFrame), x, y);
  /** A 192x108 canvas, opaque where keep(x, y), for a sprite mask. */
  function maskCanvas(keep) {
    const c = doc.createElement('canvas'); c.width = 192; c.height = 108;
    const x = c.getContext('2d'), img = x.createImageData(192, 108);
    for (let y = 0; y < 108; y++) for (let i = 0; i < 192; i++) if (keep(i, y)) { const o = (y * 192 + i) * 4; img.data[o] = img.data[o + 1] = img.data[o + 2] = img.data[o + 3] = 255; }
    x.putImageData(img, 0, 0);
    return c;
  }

  // ------------------------------------------------------------- pixi set-up (once, on the first table in the stage layout)
  let backApp = null, frontApp = null, booting = null;
  let gBack, gMid, gRoom, gFront, chipLayer, backMask, midMask, valdez, valdezBody, valdezEyes;
  const CHIP = {};
  const texOf = (src) => new Promise((res) => { const img = new Image(); img.onload = () => { const t = root.PIXI.Texture.from(img); t.source.scaleMode = 'nearest'; res(t); }; img.onerror = () => res(null); img.src = src; });
  const svgUrl = (svg, w, h) => 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg.replace('<svg ', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" `));
  async function newApp(cls) {
    const app = new root.PIXI.Application();
    await app.init({ width: SW, height: SH, backgroundAlpha: 0, antialias: false, resolution: 1, roundPixels: true, autoStart: false, sharedTicker: false });
    app.ticker.stop();
    app.canvas.className = `fx-layer ${cls}`;
    app.canvas.setAttribute('aria-hidden', 'true');
    return app;
  }
  function boot() {
    if (booting) return booting;
    booting = (async () => {
      if (!root.PIXI) throw new Error('PixiJS missing');
      backApp = await newApp('fx-back'); frontApp = await newApp('fx-front');
      // back: things outside (seen through the glass only) and a picture through the glass; things in the room that
      // pass behind the dealer; things in the room in front of the dealer
      gBack = new root.PIXI.Graphics(); gBack.scale.set(4);
      valdez = new root.PIXI.Container(); valdez.scale.set(8 * 0.8); valdez.visible = false;
      valdezBody = new root.PIXI.Sprite(D.valdez ? await texOf(D.valdez) : root.PIXI.Texture.EMPTY); valdez.addChild(valdezBody);
      valdezEyes = new root.PIXI.Graphics(); valdez.addChild(valdezEyes);
      const outside = new root.PIXI.Container(); outside.addChild(gBack, valdez);
      backMask = new root.PIXI.Sprite(root.PIXI.Texture.EMPTY); backMask.scale.set(8); outside.mask = backMask;
      gMid = new root.PIXI.Graphics(); gMid.scale.set(4);
      midMask = new root.PIXI.Sprite(root.PIXI.Texture.EMPTY); midMask.scale.set(8); gMid.mask = midMask;
      gRoom = new root.PIXI.Graphics(); gRoom.scale.set(4);
      backApp.stage.addChild(outside, backMask, gMid, midMask, gRoom);
      // front: over the table
      chipLayer = new root.PIXI.Container(); chipLayer.scale.set(4);
      gFront = new root.PIXI.Graphics(); gFront.scale.set(4);
      frontApp.stage.addChild(chipLayer, gFront);
    })().catch((e) => { console.warn('Effects layer off:', e); backApp = frontApp = null; });
    return booting;
  }
  // chip sprites in the equipped chip set, for the chip showers
  async function loadChips() {
    const PX = root.PixelSprites; if (!PX || !PX.chip) return;
    for (const v of [5, 10, 20, 50, 100, 250, 500]) { const t = await texOf(svgUrl(PX.chip(v), 14, 14)); if (t) CHIP[v] = t; }
  }
  const textures = {};
  function sceneMasks(id) {
    if (textures[id]) return textures[id];
    const glass = bitmap(D.glass[id]), dealer = bitmap(D.dealer[id]);
    const t = (c) => { const tx = root.PIXI.Texture.from(c); tx.source.scaleMode = 'nearest'; return tx; };
    return (textures[id] = { glass: t(maskCanvas((x, y) => bit(glass, x, y))), room: t(maskCanvas((x, y) => !bit(dealer, x, y))) });
  }

  // ------------------------------------------------------------- shaking the room (the scene picture, the table and this layer)
  function shake(x, y) {   // in canvas px
    const k = parseFloat(doc.body.style.getPropertyValue('--stage-s')) || 1;
    const v = x || y ? `${Math.round(x * k)}px ${Math.round(y * k)}px` : '';
    const art = doc.querySelector('#scene-backdrop .scene-art svg'), game = doc.getElementById('game');
    [art, game, backApp && backApp.canvas].forEach((el) => { if (el) el.style.translate = v; });
    if (frontApp) frontApp.stage.position.set(x, y);
  }
  const app = { stage: { position: { set: shake } } };   // shaking the stage shakes the room

// ------------------------------------------------------------- pixel font (3x5)
const FONT = {
  A: ['.#.', '#.#', '###', '#.#', '#.#'], B: ['##.', '#.#', '##.', '#.#', '##.'], C: ['.##', '#..', '#..', '#..', '.##'],
  D: ['##.', '#.#', '#.#', '#.#', '##.'], E: ['###', '#..', '##.', '#..', '###'], G: ['.##', '#..', '#.#', '#.#', '.##'],
  I: ['###', '.#.', '.#.', '.#.', '###'], J: ['..#', '..#', '..#', '#.#', '.#.'], K: ['#.#', '#.#', '##.', '#.#', '#.#'],
  L: ['#..', '#..', '#..', '#..', '###'], N: ['#..#', '##.#', '#.##', '#..#', '#..#'], O: ['.#.', '#.#', '#.#', '#.#', '.#.'],
  P: ['##.', '#.#', '##.', '#..', '#..'], R: ['##.', '#.#', '##.', '#.#', '#.#'], U: ['#.#', '#.#', '#.#', '#.#', '###'],
  W: ['#...#', '#...#', '#.#.#', '#.#.#', '.#.#.'], Y: ['#.#', '#.#', '.#.', '.#.', '.#.'], Q: ['.#.', '#.#', '#.#', '##.', '.##'],
  S: ['.##', '#..', '.#.', '..#', '##.'], T: ['###', '.#.', '.#.', '.#.', '.#.'], H: ['#.#', '#.#', '###', '#.#', '#.#'],
  M: ['#...#', '##.##', '#.#.#', '#...#', '#...#'], F: ['###', '#..', '##.', '#..', '#..'], V: ['#.#', '#.#', '#.#', '#.#', '.#.'],
  X: ['#.#', '#.#', '.#.', '#.#', '#.#'], Z: ['###', '..#', '.#.', '#..', '###'], '?': ['##.', '..#', '.#.', '...', '.#.'],
  '!': ['.#.', '.#.', '.#.', '...', '.#.'], '+': ['...', '.#.', '###', '.#.', '...'], ' ': ['...', '...', '...', '...', '...'],
  0: ['###', '#.#', '#.#', '#.#', '###'], 1: ['.#.', '##.', '.#.', '.#.', '###'], 2: ['##.', '..#', '.#.', '#..', '###'],
  3: ['##.', '..#', '.#.', '..#', '##.'], 4: ['#.#', '#.#', '###', '..#', '..#'], 5: ['###', '#..', '##.', '..#', '##.'],
  6: ['.##', '#..', '###', '#.#', '###'], 7: ['###', '..#', '.#.', '.#.', '.#.'], 8: ['###', '#.#', '###', '#.#', '###'], 9: ['###', '#.#', '###', '..#', '##.'],
};
// letters can be wider than 3 (W, M, N): each advances by its own width + 1
const glyph = (ch) => FONT[ch] || FONT[' '];
const textWidth = (str, k) => [...str.toUpperCase()].reduce((w, ch) => w + (glyph(ch)[0].length + 1) * k, 0) - k;
function text(g, str, x, y, k, color, outline) {
  const pts = [];
  let cx = 0;
  [...str.toUpperCase()].forEach((ch) => { const gl = glyph(ch); gl.forEach((row, r) => [...row].forEach((c, col) => { if (c === '#') pts.push([x + (cx + col) * k, y + r * k]); })); cx += gl[0].length + 1; });
  if (outline) pts.forEach(([px, py]) => g.rect(px - k, py - k, k * 3, k * 3).fill(outline));
  pts.forEach(([px, py]) => g.rect(px, py, k, k).fill(color));
}

// ------------------------------------------------------------- particles
// A particle is a pixel (or small block) that moves, falls, bounces and blinks out; `trail` leaves its last spots.
let parts = [];
function spawn(o) { parts.push(Object.assign({ vx: 0, vy: 0, g: 0, life: 1, age: 0, size: 1, color: 0xffffff, alpha: 1, layer: 'front', trail: 0, hist: [] }, o)); }
const fx = [];                           // timed drawers: { t, dur, layer, draw(g, t) }
function later(sec, fn) { fx.push({ t: 0, dur: sec, layer: 'none', end: fn, draw() {} }); }

function stepParticles(dt) {
  parts = parts.filter((p) => {
    p.age += dt;
    if (p.age > p.life) return false;
    if (p.age < 0) return true;
    if (p.trail) { p.hist.unshift([p.x, p.y]); p.hist.length = Math.min(p.hist.length, p.trail); }
    if (p.spin) p.spinAt = (p.spinAt || 0) + 1;
    if (p.wobble) p.vx = Math.sin(p.age * p.wobble + p.seed) * p.sway;
    p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
    if (p.floor != null && p.y > p.floor && p.vy > 0) { p.y = p.floor; p.vy *= -p.bounce; p.vx *= 0.7; if (Math.abs(p.vy) < 12) { p.vy = 0; p.g = 0; p.vx = 0; } }
    if (p.clip && (p.x < p.clip[0] || p.x > p.clip[2] || p.y < p.clip[1] || p.y > p.clip[3])) return p.age < p.life && !p.dieOut;
    return true;
  });
}
function drawParticles(g, layer) {
  parts.forEach((p) => {
    if (p.layer !== layer || p.sprite || p.age < 0) return;
    if (p.clip && (p.x < p.clip[0] || p.x > p.clip[2] || p.y < p.clip[1] || p.y > p.clip[3])) return;
    const left = p.life - p.age;
    if (left < 0.35 && Math.floor(p.age * 18) % 2) return;   // blink out
    const color = typeof p.color === 'function' ? p.color(p) : p.color;
    p.hist.forEach(([hx, hy], i) => g.rect(Math.round(hx), Math.round(hy), p.size, p.size).fill({ color: p.trailColor || color, alpha: p.alpha * (0.6 - i * (0.5 / p.trail)) }));
    g.rect(Math.round(p.x), Math.round(p.y), p.w || p.size, p.h || p.size).fill({ color, alpha: p.alpha });
  });
}

// Chips in the shower are real chip sprites (the equipped set), flipping as they fly.
const chipSprites = [];
function chipBurst(x, y, n, floorY) {
  const vals = [5, 10, 20, 50, 100, 250, 500];
  for (let i = 0; i < n; i++) {
    const tex = CHIP[pick(vals)]; if (!tex) return;
    const s = new root.PIXI.Sprite(tex); s.anchor.set(0.5); chipLayer.addChild(s);
    chipSprites.push({ s, x: x + rand(-6, 6), y, vx: rand(-110, 110), vy: rand(-210, -120), g: 420, floor: floorY + rand(-10, 14), bounce: 0.35, age: -i * 0.025, life: 2.2 + rand(0, 0.5), flip: Math.floor(rand(0, 4)) });
  }
}
function stepChips(dt) {
  for (let i = chipSprites.length - 1; i >= 0; i--) {
    const c = chipSprites[i]; c.age += dt;
    if (c.age < 0) { c.s.visible = false; continue; }
    c.s.visible = true;
    if (c.age > c.life) { c.s.destroy(); chipSprites.splice(i, 1); continue; }
    c.vy += c.g * dt; c.x += c.vx * dt; c.y += c.vy * dt;
    if (c.y > c.floor && c.vy > 0) { c.y = c.floor; c.vy *= -c.bounce; c.vx *= 0.6; if (Math.abs(c.vy) < 20) { c.vy = 0; c.g = 0; c.vx = 0; c.landed = true; } }
    if (!c.landed) c.flip++;
    const f = [1, 0.5, 0.15, 0.5][c.flip % 4];
    c.s.scale.set(0.5, 0.5 * (c.landed ? 0.55 : f));         // lands flat, seen at the table's angle
    c.s.position.set(Math.round(c.x), Math.round(c.y));
    c.s.alpha = c.life - c.age < 0.4 && Math.floor(c.age * 18) % 2 ? 0 : 1;
  }
}

// ------------------------------------------------------------- table effects
const GOLD = [0xffffff, 0xfff6c0, 0xffd75e, 0xffb02a];
function label(str, x, y, color, dur) {
  fx.push({ t: 0, dur, layer: 'front', draw(g, t) {
    const k = 1.5, w = textWidth(str, k);
    const pop = t < 0.12 ? -4 : t < 0.2 ? 2 : 0;               // jumps up, settles (stepped)
    if (dur - t < 0.3 && Math.floor(t * 18) % 2) return;
    text(g, str, Math.round(x - w / 2), Math.round(y + pop), k, color, 0x1a0f08);
  } });
}
// Both only ever fire for the player's own hands (never a bot's), and always play in the middle of the table.
const MID = { x: 192, y: 122 };
function blackjack() {
  const cx = MID.x, cy = MID.y;
  label('BLACKJACK!', cx, cy - 8, 0xffd75e, 1.6);
  if (reduce) return;
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2, sp = i % 2 ? 95 : 150;
    spawn({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.75, g: 60, life: 0.55 + (i % 3) * 0.08, size: 2, color: pick(GOLD), trail: 3 });
  }
  // stars blink on the cards and around them
  for (let i = 0; i < 7; i++) {
    const sx = Math.round(cx + rand(-24, 22)), sy = Math.round(cy + rand(-20, 14)), at = 0.15 + i * 0.12;
    fx.push({ t: -at, dur: 0.6, layer: 'front', draw(g, t) {
      if (t < 0) return;
      const f = Math.floor(t * 18) % 6, r = [0, 1, 2, 2, 1, 0][f];
      g.rect(sx, sy, 1, 1).fill(0xffffff);
      for (let k = 1; k <= r; k++) { g.rect(sx - k, sy, 1, 1).fill(0xfff6c0); g.rect(sx + k, sy, 1, 1).fill(0xfff6c0); g.rect(sx, sy - k, 1, 1).fill(0xfff6c0); g.rect(sx, sy + k, 1, 1).fill(0xfff6c0); }
    } });
  }
}
// A good round under the win messages' 1,000: the amount pops up and chips shower onto the felt.
function bigWin(amount) {
  label(`+${fmtN(amount)}`, MID.x, MID.y - 8, 0x8affa0, 1.8);
  if (reduce) return;
  const n = Math.max(6, Math.min(48, Math.round(Math.sqrt(amount) * 0.9)));
  chipBurst(MID.x, MID.y, n, MID.y + 16);
}
const RARITY = { rare: [0x4aa8ff, 0xbfe4ff, 0xffffff], epic: [0xb06aff, 0xe0c0ff, 0xffffff], legendary: [0xffb02a, 0xffd75e, 0xfff6c0], secret: [0xff5a6a, 0xffb0b8, 0xffffff] };
const RAINBOW = [0xff5a6a, 0xffb020, 0xfff06a, 0x6aff9a, 0x5af2ff, 0x6a8aff, 0xc069f0];
const rainbow = (i) => RAINBOW[((i % 7) + 7) % 7];
// Unlocks play behind the real achievement toast (which shows the name and rarity), centred on it: (cx, cy) in effect px.
function unlock(rarity, cx, cy) {
  if (rarity === 'secret') return unlockSecret(cx, cy);
  if (rarity === 'insanity') return unlockInsanity(cx, cy);
  const cols = RARITY[rarity]; if (!cols) return;   // common unlocks keep just the toast
  fx.push({ t: 0, dur: 2.6, layer: 'front', draw(g, t) {
    if (!reduce) {
      // rays: 12 dotted spokes turning in steps behind the toast
      const turn = Math.floor(t * 6) * (Math.PI / 24), len = Math.min(1, t / 0.3) * 70;
      for (let i = 0; i < 12; i++) {
        const a = turn + (i / 12) * Math.PI * 2;
        for (let d = 22; d < len; d += 3) g.rect(Math.round(cx + Math.cos(a) * d * 1.6), Math.round(cy + Math.sin(a) * d * 0.7), 2, 2).fill({ color: cols[(i + Math.floor(d / 9)) % 2], alpha: 1 - d / 80 });
      }
    }
  } });
  if (reduce) return;
  for (let i = 0; i < 60; i++) spawn({ x: rand(60, 324), y: rand(-30, 0), vy: rand(30, 60), g: 0, wobble: rand(4, 8), sway: rand(10, 25), seed: rand(0, 6), life: 2.4, size: 2, color: (p) => (Math.floor(p.age * 9 + p.seed) % 2 ? cols[0] : cols[2]) });
}
// Secret: the room goes dark, red embers rise and red rays beat like a heart.
function unlockSecret(cx, cy) {
  const cols = RARITY.secret;
  fx.push({ t: 0, dur: 3.4, layer: 'front', draw(g, t) {
    const dark = Math.min(1, t / 0.25, (3.4 - t) / 0.4);
    if (!reduce) g.rect(0, 0, W, H).fill({ color: 0x05030a, alpha: 0.55 * dark });
    if (!reduce && t > 0.4) {
      // two beats, like a heart: the rays punch out, then fade
      const beat = ((t - 0.4) % 0.9), r = beat < 0.12 ? 1 : beat < 0.25 ? 0.6 : beat < 0.35 ? 0.85 : Math.max(0, 0.85 - (beat - 0.35) * 1.6);
      for (let i = 0; i < 16; i++) {
        const a = (i / 16) * Math.PI * 2 + 0.1;
        for (let d = 22; d < 22 + 50 * r; d += 3) if ((i + Math.floor(d / 3)) % 3) g.rect(Math.round(cx + Math.cos(a) * d * 1.6), Math.round(cy + Math.sin(a) * d * 0.7), 2, 2).fill({ color: d % 2 ? cols[0] : 0x8a1a2a, alpha: 0.9 - (d - 22) / 60 });
      }
    }
  } });
  if (reduce) return;
  for (let i = 0; i < 46; i++) spawn({ x: rand(40, 344), y: rand(150, 216), vy: -rand(18, 40), wobble: rand(3, 6), sway: rand(6, 14), seed: rand(0, 6), life: 2.6, age: -rand(0.3, 1.2), size: pick([1, 2]), color: (p) => (Math.floor(p.age * 6 + p.seed) % 3 ? cols[0] : cols[1]) });
}
// Insanity: the game's animated rainbow. The screen jolts, a double spiral of rainbow rays turns, and rainbow confetti
// bursts out from the toast.
function unlockInsanity(cx, cy) {
  fx.push({ t: 0, dur: 3.6, layer: 'front', draw(g, t) {
    const f = Math.floor(t * 18);
    if (!reduce) {
      if (t < 0.3 && f % 2) g.rect(0, 0, W, H).fill({ color: 0xffffff, alpha: 0.25 });
      const len = Math.min(1, t / 0.35) * 90;
      for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 14; i++) {
        const turn = (arm ? -1 : 1) * Math.floor(t * 8) * (Math.PI / 28), a = turn + (i / 14) * Math.PI * 2 + arm * 0.22;
        for (let d = 22; d < len; d += 3) { const tw = a + (arm ? -1 : 1) * d * 0.012; g.rect(Math.round(cx + Math.cos(tw) * d * 1.6), Math.round(cy + Math.sin(tw) * d * 0.7), 2, 2).fill({ color: rainbow(i + Math.floor(d / 6) + f), alpha: Math.min(1, (3.6 - t) * 2) * (1 - d / 100) }); }
      }
    }
  }, tick(t) { if (reduce || t > 0.5) { app.stage.position.set(0, 0); return; } const f = Math.floor(t * 18), k = 1 - t / 0.5; app.stage.position.set((f % 2 ? 1 : -1) * Math.round(k * 6), ((f % 3) - 1) * Math.round(k * 3)); }, end() { app.stage.position.set(0, 0); } });
  if (reduce) return;
  for (let i = 0; i < 90; i++) { const a = rand(0, Math.PI * 2), sp = rand(60, 170), c0 = Math.floor(rand(0, 7)); spawn({ x: cx + Math.cos(a) * 40, y: cy + Math.sin(a) * 12, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * 0.6 - 30, g: 90, life: 2.2 + rand(0, 0.8), age: -0.2 - rand(0, 0.3), size: 2, seed: c0, color: (p) => rainbow(p.seed + Math.floor(p.age * 10)) }); }
}

// ------------------------------------------------------------- win messages by tier
// Tiers from 1000 up (a round's total win over all the player's seats; 7 seats x 500 can pay well over 5000). Each tier: its name, colours, word size and extras; `style` picks how the name comes in.
const TIERS = [
  { min: 10000, name: 'INSANE WIN', cols: null, k: 2.5, level: 4 },
  { min: 5000, name: 'LEGENDARY WIN', cols: [0xffb020, 0xfff6c0, 0x8a4a00], k: 2, level: 3 },
  { min: 3500, name: 'EPIC WIN', cols: [0xc069f0, 0xf0d8ff, 0x3a1060], k: 2, level: 2 },
  { min: 2000, name: 'HUGE WIN', cols: [0x4f9cff, 0xbfe0ff, 0x0a2a5a], k: 1.5, level: 1 },
  { min: 1000, name: 'BIG WIN', cols: [0xc8c2ae, 0xf4f0e0, 0x3a362a], k: 1.5, level: 0 },
];
const RB6 = [0xff5a6a, 0xffb020, 0xfff06a, 0x6aff9a, 0x5af2ff, 0x6a8aff, 0xc069f0];
var fmtN = (n) => String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

// Casino styles: the name is drawn pixel by pixel, each pixel placed, coloured or hidden by the style.
let PLATE = null;
const SCENE_STYLE_LIST = ['reel', 'goldin', 'neonin', 'strike', 'radarin', 'glow', 'goo', 'glitch'];
const SCENE_STYLE = { corner: 'reel', deco: 'goldin', neon: 'neonin', vip: 'strike', orbit: 'radarin', liner: 'glow', mars: 'goo', horizon: 'glitch' };
function wordPixels(word, x, y) {   // pixels of a word at size 1: { x, y, i (letter), col, row }
  const out = []; let cx = 0;
  [...word].forEach((ch, i) => { const gl = glyph(ch); gl.forEach((row, r) => [...row].forEach((c, col) => { if (c === '#') out.push({ x: x + cx + col, y: y + r, i, col, row: r }); })); cx += gl[0].length + 1; });
  return out;
}
const hrnd = (a, b) => { const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453; return v - Math.floor(v); };
function sceneWord(g, style, word, T, cx, wy, t, f) {
  const k = T.k, w = textWidth(word, 1), x0 = cx / k - w / 2, px = wordPixels(word, 0, 0), n = word.length;
  const rainbow = !T.cols, RBc = (i) => RB6[(i + f) % 7];
  const put = (p, c, dx = 0, dy = 0, a = 1) => g.rect(Math.round((x0 + p.x + dx) * k), Math.round(wy + (p.y + dy) * k), Math.ceil(k), Math.ceil(k)).fill({ color: c, alpha: a });
  const shadow = (c) => px.forEach((p) => g.rect(Math.round((x0 + p.x) * k) - 1, Math.round(wy + p.y * k) - 1, Math.ceil(k) + 2, Math.ceil(k) + 2).fill({ color: c, alpha: 0.85 }));
  const W2 = w * k;
  if (style === 'reel') {
    // each letter spins through the alphabet like a slot reel, then locks from left to right with a gold flash
    const ALPH = 'ABCDEGIJKLNOPRSTUWY7';
    [...word].forEach((ch, i) => { if (ch === ' ') return; const lockAt = 0.25 + i * 0.09, locked = t >= lockAt;
      const shown = locked ? ch : ALPH[(f + i * 3) % ALPH.length], gl = glyph(shown), off = locked ? 0 : (f % 3) - 1;
      let cxl = 0; for (let j = 0; j < i; j++) cxl += glyph(word[j])[0].length + 1;
      gl.forEach((row, r) => [...row].forEach((c, col) => { if (c === '#') g.rect(Math.round((x0 + cxl + col) * k), Math.round(wy + (r + off) * k), Math.ceil(k), Math.ceil(k)).fill(locked ? (t - lockAt < 0.1 ? 0xffffff : rainbow ? RBc(i) : T.cols[0]) : 0xd8323a); }));
    });
    for (let x = PLATE.x0 + 3, i = 0; x < PLATE.x1 - 4; x += 4, i++) { const on = (i + f) % 3 === 0; g.rect(x, PLATE.top, 2, 2).fill(on ? 0xfff6c0 : 0xc89a3a).rect(x, PLATE.bot - 2, 2, 2).fill(on ? 0xfff6c0 : 0xc89a3a); }
  } else if (style === 'goldin') {
    // gold pixels stream in from the left and settle into the letters
    px.forEach((p, j) => { const at = 0.05 + (p.x / w) * 0.45 + hrnd(j, 1) * 0.1, u = (t - at) / 0.25; if (u < 0) return;
      if (u < 1) { const dx = -(1 - u) * (40 + hrnd(j, 2) * 30); put(p, 0xffe9a0, dx); put(p, 0xc9a24a, dx - 2, 0, 0.5); }
      else put(p, rainbow ? RBc(p.i) : (f + p.x) % 24 === 0 ? T.cols[1] : T.cols[0]); });
  } else if (style === 'neonin') {
    // each letter buzzes on like a neon tube: flickers, then holds with a soft glow; drops of rain run over it
    const C = rainbow ? null : T.cols[0];
    px.forEach((p) => { const on0 = 0.1 + p.i * 0.07, u = t - on0; if (u < 0) return; const flick = u < 0.3 && [1, 0, 1, 1, 0, 1][Math.floor(u * 18) % 6] === 0; if (flick) return;
      const c = rainbow ? RBc(p.i) : C; put(p, c, -0.5, 0, 0.25); put(p, c, 0.5, 0, 0.25); put(p, c, 0, -0.5, 0.25); put(p, c, 0, 0.5, 0.25); put(p, (p.x + p.y + f) % 9 === 0 ? 0xffffff : c); });
    for (let i = 0; i < 6; i++) { const rx = cx - W2 / 2 + hrnd(i, 7) * W2, ry = wy - 10 + ((f * 4 + i * 23) % 60); g.rect(Math.round(rx), Math.round(ry), 1, 3).fill({ color: 0xdff4ff, alpha: 0.6 }); }
  } else if (style === 'strike') {
    // a gold bolt strikes the middle, the flash reveals the name, sparks crawl over it
    if (t < 0.18) { let x = cx, y = 0; while (y < wy + 3 * k) { const nx = x + rand(-6, 6), ny = y + rand(4, 9); for (let s2 = 0; s2 <= 8; s2++) g.rect(Math.round(x + (nx - x) * s2 / 8), Math.round(y + (ny - y) * s2 / 8), 2, 2).fill(0xfff6d8); x = nx; y = ny; } }
    if (t >= 0.12) { const flash = t < 0.24; px.forEach((p) => put(p, flash ? 0xffffff : rainbow ? RBc(p.i) : (hrnd(p.x, f) > 0.96 ? 0xffffff : T.cols[0])));
      for (let s2 = 0; s2 < 3; s2++) { const p = px[Math.floor(hrnd(s2, f) * px.length)]; put(p, 0xfff6d8, 0, -1); put(p, 0xffd75e, 1, -2); } }
  } else if (style === 'radarin') {
    // a green sweep passes over the name; each pixel lights as a blip when the line reaches it
    const sw = Math.min(1.2, t / 0.6) * (w + 6) - 3; g.rect(Math.round((x0 + sw) * k), Math.round(wy - k * 2), 2, Math.round(k * 9)).fill({ color: 0xc8ffd0, alpha: t < 0.75 ? 1 : 0 });
    px.forEach((p) => { if (p.x > sw) return; const age = (sw - p.x) / (w + 6); put(p, rainbow ? RBc(p.i) : age < 0.08 ? 0xffffff : T.cols[0]); });
  } else if (style === 'glow') {
    // plankton: the pixels light up in a wave, from dim teal to bright
    px.forEach((p, j) => { const at = 0.05 + (p.x / w) * 0.5 + hrnd(j, 3) * 0.2, u = t - at; if (u < 0) return;
      const wave = Math.sin(p.x * 0.3 - t * 6) * 0.5 + 0.5; put(p, rainbow ? RBc(p.i) : u < 0.15 ? 0x3ae8d8 : wave > 0.7 ? T.cols[1] : T.cols[0]); });
  } else if (style === 'goo') {
    // goo drops fall into place column by column, splat, and a few drips hang under the letters
    px.forEach((p, j) => { const at = 0.05 + (p.x / w) * 0.4 + (4 - p.y) * 0.03, u = (t - at) / 0.2; if (u < 0) return;
      const dy = u < 1 ? -(1 - u) * (1 - u) * 30 : 0; put(p, rainbow ? RBc(p.i) : u < 1 ? 0xd8ffb0 : p.y === 0 ? T.cols[1] : T.cols[0], 0, dy); });
    if (t > 0.6) px.filter((p) => p.y === 4 && hrnd(p.x, 5) > 0.75).forEach((p) => { const len = Math.min(3, Math.floor((t - 0.6) * 4 + hrnd(p.x, 6) * 2)); for (let d = 1; d <= len; d++) put(p, rainbow ? RBc(p.i) : T.cols[0], 0, d, 0.8); });
  } else {
    // glitch: rows of the name slide in from random offsets in violet static, settling as the static clears
    const settle = Math.max(0, 1 - t / 0.7);
    px.forEach((p) => { const off = settle > 0 && hrnd(p.y, Math.floor(t * 18)) > 0.4 ? Math.round((hrnd(p.y + 9, Math.floor(t * 12)) - 0.5) * 30 * settle) : 0;
      put(p, rainbow ? RBc(p.i) : hrnd(p.x + off, f) > 0.9 ? T.cols[1] : T.cols[0], off); });
    if (settle > 0) for (let i = 0; i < 8; i++) g.rect(Math.round(cx - W2 / 2 + hrnd(i, f) * W2), Math.round(wy + hrnd(i + 3, f) * 5 * k), Math.round(rand(6, 30)), Math.ceil(k)).fill({ color: 0x4a1a7a, alpha: 0.8 });
  }
}

function winTier(amount, style) {
  if (style === 'scene') style = SCENE_STYLE[scene];
  const T = TIERS.find((t) => amount >= t.min); if (!T) return;
  const L = T.level, dur = 2.6 + L * 0.5, cx = MID.x, wy = MID.y - 34, ny = MID.y - 8;
  const colAt = (i, f) => (T.cols ? (i % 2 ? T.cols[1] : T.cols[0]) : RB6[(i + f) % 7]);
  const main = (f) => (T.cols ? T.cols[0] : RB6[f % 7]);
  const count = 0.6 + L * 0.25;
  if (root.WinSounds) root.WinSounds.play(L, style, T.name, count);
  fx.push({ t: 0, dur, layer: 'front', draw(g, t) {
    const f = Math.floor(t * 18), out = dur - t < 0.35 && f % 2;
    if (out) return;
    // rays behind from Epic up; a second ring of rays for Legendary; rainbow for Insane
    if (L === 4 && !reduce) {
      // Insane: the same double rainbow spiral as the Insanity unlock, turning both ways behind the name
      const len = Math.min(1, t / 0.35) * 110;
      for (let arm = 0; arm < 2; arm++) for (let i = 0; i < 14; i++) {
        const turn = (arm ? -1 : 1) * Math.floor(t * 8) * (Math.PI / 28), a = turn + (i / 14) * Math.PI * 2 + arm * 0.22;
        for (let d = 24; d < len; d += 3) { const tw = a + (arm ? -1 : 1) * d * 0.012; g.rect(Math.round(cx + Math.cos(tw) * d * 1.6), Math.round(wy + 8 + Math.sin(tw) * d * 0.7), 2, 2).fill({ color: RB6[(i + Math.floor(d / 6) + f) % 7], alpha: Math.min(1, (dur - t) * 2) * (1 - d / 120) }); }
      }
    } else if (L >= 2 && !reduce) {
      const n = 10 + L * 4, turn = Math.floor(t * 6) * (Math.PI / 30), len = Math.min(1, t / 0.3) * (60 + L * 15);
      for (let i = 0; i < n; i++) { const a = turn + (i / n) * Math.PI * 2; for (let d = 26; d < len; d += 3) g.rect(Math.round(cx + Math.cos(a) * d * 1.7), Math.round(wy + 4 + Math.sin(a) * d * 0.6), 2, 2).fill({ color: colAt(i + Math.floor(d / 9), f), alpha: 0.85 - d / (len + 20) }); }
    }
    const word = T.name, k = T.k, w = textWidth(word, k);
    const x0 = Math.round(cx - w / 2);
    if (SCENE_STYLE_LIST.includes(style)) {
      // a dark pixel plate behind the name and the amount, so every style reads on any scene; it opens from the middle
      const pw = textWidth(word, k) + 6 * k, top = Math.round(wy - 2 * k), bot = Math.round(wy + 5 * k + 4 + 5 * (L >= 3 ? 1.5 : 1) + 4);
      const ow = Math.round(pw * Math.min(1, t / 0.12)), px0 = Math.round(cx - ow / 2), edge = T.cols ? T.cols[0] : RB6[f % 7];
      PLATE = { x0: px0, x1: px0 + ow, top, bot };
      g.rect(px0 + 2, top, ow - 4, bot - top).fill({ color: 0x0a0712, alpha: 0.85 }).rect(px0, top + 2, ow, bot - top - 4).fill({ color: 0x0a0712, alpha: 0.85 });
      g.rect(px0 + 2, top, ow - 4, 1).fill(edge).rect(px0 + 2, bot - 1, ow - 4, 1).fill(edge).rect(px0, top + 2, 1, bot - top - 4).fill(edge).rect(px0 + ow - 1, top + 2, 1, bot - top - 4).fill(edge)
        .rect(px0 + 1, top + 1, 1, 1).fill(edge).rect(px0 + ow - 2, top + 1, 1, 1).fill(edge).rect(px0 + 1, bot - 2, 1, 1).fill(edge).rect(px0 + ow - 2, bot - 2, 1, 1).fill(edge);
      sceneWord(g, style, word, T, cx, wy, t, f);
    }
    else if (style === 'slam') {
      // slams in from huge, lands with a jolt and dust
      const s3 = t < 0.06 ? 3 : t < 0.12 ? 2 : t < 0.16 ? 1.2 : 1, kk = k * s3, ww = textWidth(word, kk);
      text(g, word, Math.round(cx - ww / 2), Math.round(wy - (kk - k) * 2.5), kk, main(f), T.cols ? T.cols[2] : 0x14101e);
      if (t > 0.16 && t < 0.2 + L * 0.06) for (let i = 0; i < 6; i++) g.rect(x0 - 6 - i * 3, wy + 5 * k - i, 2, 2).fill({ color: 0xc8b89a, alpha: 0.6 }).rect(x0 + w + 4 + i * 3, wy + 5 * k - i, 2, 2).fill({ color: 0xc8b89a, alpha: 0.6 });
    } else if (style === 'arcade') {
      // inside a box of chasing bulbs, the name blinks between its two colours
      const bw = w + 16, bh = 5 * k + 12, bx = Math.round(cx - bw / 2), by = Math.round(wy - 6);
      g.rect(bx, by, bw, bh).fill({ color: 0x0a0610, alpha: 0.85 });
      for (let i = 0, per = 2 * (bw + bh); i < per; i += 4) { const on = ((i / 4) + f) % 3 === 0; const [px, py] = i < bw ? [bx + i, by] : i < bw + bh ? [bx + bw - 2, by + i - bw] : i < 2 * bw + bh ? [bx + bw - (i - bw - bh), by + bh - 2] : [bx, by + bh - (i - 2 * bw - bh)]; g.rect(px, py, 2, 2).fill(on ? 0xffffff : main(f + i)); }
      text(g, word, x0, wy, k, f % 6 < 3 ? main(f) : (T.cols ? T.cols[1] : RB6[(f + 3) % 7]));
    } else if (style === 'banner') {
      // a ribbon unrolls from the middle, with folded tails, and the name sits on it
      const open = Math.min(1, t / 0.3), bw = Math.round((w + 20) * open), bh = 5 * k + 8, by = Math.round(wy - 4);
      const rib = T.cols ? T.cols[2] : 0x14101e, edge = main(f);
      if (open >= 1) { g.rect(cx - bw / 2 - 10, by + 4, 12, bh).fill(rib); g.rect(cx + bw / 2 - 2, by + 4, 12, bh).fill(rib); g.rect(cx - bw / 2 - 10, by + 4 + bh / 2 - 2, 3, 4).fill(0x0a0610); g.rect(cx + bw / 2 + 7, by + 4 + bh / 2 - 2, 3, 4).fill(0x0a0610); }
      g.rect(cx - bw / 2, by, bw, bh).fill(rib); g.rect(cx - bw / 2, by, bw, 2).fill(edge); g.rect(cx - bw / 2, by + bh - 2, bw, 2).fill(edge);
      if (open >= 1) { text(g, word, x0, wy, k, main(f), null); if (f % 4 === 0) { const sx = Math.round(cx - bw / 2 + rand(0, bw)), sy = Math.round(by + rand(0, bh)); g.rect(sx, sy, 1, 1).fill(0xffffff).rect(sx - 1, sy, 3, 1).fill({ color: 0xffffff, alpha: 0.6 }).rect(sx, sy - 1, 1, 3).fill({ color: 0xffffff, alpha: 0.6 }); } }
    } else {
      // letters pop in one by one with a little bounce, in a colour wave
      let px = x0; [...word].forEach((ch, i) => { const at = i * 0.06, u = t - at, cw = (glyph(ch)[0].length + 1) * k; if (u >= 0) { const bounce = u < 0.05 ? -6 : u < 0.1 ? -2 : u < 0.14 ? 1 : 0;
        text(g, ch, px, wy + bounce, k, colAt(i, f), T.cols ? T.cols[2] : 0x14101e); } px += cw; });
    }
    // the amount counts up under the name
    const shown = Math.round(amount * Math.min(1, t / count)), str = '+' + fmtN(shown), nk = L >= 3 ? 1.5 : 1;
    text(g, str, Math.round(cx - textWidth(str, nk) / 2), wy + 5 * k + 4, nk, t < count ? 0xffffff : 0x8affa0, 0x1a0f08);
  }, tick(t) {
    // Legendary and Insane shake the screen as the name lands; Insane also flashes
    if (reduce || L < 3) return; const k2 = Math.max(0, 1 - t / (0.4 + (L - 3) * 0.3)), f = Math.floor(t * 18);
    app.stage.position.set((f % 2 ? 1 : -1) * Math.round(k2 * (L === 4 ? 10 : 6)), ((f % 3) - 1) * Math.round(k2 * 4));
  }, end() { app.stage.position.set(0, 0); } });
  if (reduce) return;
  if (L === 4) fx.push({ t: 0, dur: 0.5, layer: 'front', draw(g, t) { if (Math.floor(t * 18) % 2 === 0) g.rect(0, 0, W, H).fill({ color: 0xffffff, alpha: 0.35 * (1 - t / 0.5) }); } });
  chipBurst(MID.x, MID.y, 10 + L * 10, MID.y + 16);
  if (L >= 3) for (let r = 0; r < (L === 4 ? 6 : 3); r++) later(0.3 + r * 0.35, () => { const x = rand(70, 314), y = rand(30, 70); for (let i = 0; i < 28; i++) { const a = (i / 28) * Math.PI * 2, sp = rand(40, 80); spawn({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 50, life: 0.9, size: 2, color: T.cols ? (i % 2 ? T.cols[0] : T.cols[1]) : RB6[i % 7], trail: 3 }); } });
  if (L === 4) for (let i = 0; i < 80; i++) { const c0 = Math.floor(rand(0, 7)); spawn({ x: rand(0, W), y: rand(-40, 0), vy: rand(40, 80), wobble: rand(3, 7), sway: rand(10, 25), seed: c0, life: 3, size: 2, color: (p) => RB6[(p.seed + Math.floor(p.age * 10)) % 7] }); }
}


// ------------------------------------------------------------- the room: life and events
// Each scene: life(g, f) draws one step of the room's own motion (f = step count); event() plays its upgraded event.
// Coordinates in scene pixels (P) unless noted; P(x, y) draws one scene pixel.
const P = (g, x, y, color, alpha = 1, w = 1, h = 1) => g.rect(Math.round(x * S), Math.round(y * S), w * S, h * S).fill({ color, alpha });
const p1 = (g, x, y, color, alpha = 1, w = 1, h = 1) => g.rect(Math.round(x), Math.round(y), w, h).fill({ color, alpha });   // canvas px
function field(n, make) { return Array.from({ length: n }, make); }
let state = {};
function signFlicker(g, f, signs) {
  signs.forEach((s, i) => {
    if (!s.until && Math.random() < 0.006) s.until = f + 2 + Math.floor(rand(0, 5));
    if (s.until && f < s.until) { if ((f + i) % 2) P(g, s.x, s.y, 0x05030a, 0.6, s.w, s.h); } else s.until = 0;
  });
}
const SCENES = {
  corner: {
    name: 'Jackpot on the slots',
    life: 'Lamp flames flicker, dust floats in the lamp light, the slot machines chase their bulbs.',
    event: 'Jackpot on the slots: the machine flashes, then coins pour out of its tray, drop onto the carpet and pile up there before blinking out.',
    init() { state.dust = field(16, () => ({ x: rand(14, 178), y: rand(16, 42), v: rand(0.6, 1.4), s: rand(0, 6) })); },
    draw(L, f) { const g = L.room;
      [[28, 12], [41, 15], [150, 15], [164, 13]].forEach(([x, y], i) => { if ((f + i * 3) % 5 < 3) P(g, x, y - 1, pick([0xfff6c0, 0xffd75e, 0xff9a3a]), 0.9); });
      state.dust.forEach((d) => { d.y -= d.v / 18; d.x += Math.sin(f / 9 + d.s) * 0.12; if (d.y < 14) { d.y = 42; d.x = rand(14, 178); } if ((f + d.s * 3) % 8 < 6) p1(g, d.x * S, d.y * S, 0xffe9b0, 0.55); });
      [[5, 21], [172, 188]].forEach(([a, b]) => { for (let x = a, k = 0; x <= b; x += 3, k++) if ((k + Math.floor(f / 3)) % 3 === 0) P(g, x, 8, 0xffffff, 0.95); });
    },
    play() {
      fx.push({ t: 0, dur: 3, layer: 'room', draw(g, t) { if (Math.floor(t * 9) % 2) P(g, 3, 21, 0xfff6b0, 0.75, 20, 14); } });
      // coins pour out of the tray at the bottom of the machine, a few at a time, drop to the carpet and pile up there
      for (let i = 0; i < 44; i++) spawn({ layer: 'room', x: rand(8, 18) * S, y: 47 * S, vx: rand(-10, 22), vy: rand(0, 25), g: 420, floor: rand(118, 132), bounce: 0.3, life: 3.4 + rand(0, 0.6) - i * 0.03, age: -0.6 - i * 0.04, w: 3, h: 2, size: 3, color: (p) => (p.vy === 0 && p.g === 0 ? 0xffd75e : Math.floor(p.age * 18) % 3 === 0 ? 0xfff6c0 : 0xffd75e) });
    },
  },
  deco: {
    name: 'Fireworks over the city',
    life: 'Crystals glint on the chandeliers and specks of gold drift down from them.',
    event: 'Fireworks over the city: rockets climb behind the grille, burst into falling sparks with trails.',
    init() { state.gold = field(10, () => ({ x: rand(56, 136), y: rand(18, 40), s: rand(0, 6) })); state.glints = []; },
    draw(L, f) { const g = L.room;
      if (f % 4 === 0) state.glints.push({ x: pick([64, 128]) + Math.round(rand(-7, 7)), y: Math.round(rand(15, 21)), t: 0 });
      state.glints = state.glints.filter((c) => { c.t++; const r = [0, 1, 2, 1, 0][c.t] ?? -1; if (r < 0) return false; P(g, c.x, c.y, 0xffffff); for (let k = 1; k <= r; k++) { p1(g, c.x * S - k * 2, c.y * S, 0xffffff, 0.8, 2, 2); p1(g, c.x * S + k * 2, c.y * S, 0xffffff, 0.8, 2, 2); p1(g, c.x * S, c.y * S - k * 2, 0xffffff, 0.8, 2, 2); p1(g, c.x * S, c.y * S + k * 2, 0xffffff, 0.8, 2, 2); } return true; });
      state.gold.forEach((d) => { d.y += 0.1; d.x += Math.sin(f / 7 + d.s) * 0.1; if (d.y > 44) { d.y = 20; d.x = pick([64, 128]) + rand(-8, 8); } if ((f + d.s * 2) % 6 < 4) p1(g, d.x * S, d.y * S, 0xffd75e, 0.7); });
    },
    play() {
      const clip = [54 * S, 11 * S, 138 * S, 31 * S];
      const colors = [[0xff6a8a, 0xffd0e0], [0x7ad8ff, 0xe0f6ff], [0xffd75e, 0xfff6c0], [0x9aff8a, 0xe8ffd0]];
      for (let r = 0; r < 5; r++) {
        const x = rand(64, 128) * S, top = rand(13, 20) * S, cs = colors[r % 4], at = r * 0.55;
        later(at, () => spawn({ layer: 'back', clip, x, y: 31 * S, vy: -(31 * S - top) / 0.5, life: 0.5, size: 2, color: 0xfff6c0, trail: 4 }));
        later(at + 0.5, () => { for (let i = 0; i < 36; i++) { const a = (i / 36) * Math.PI * 2, sp = rand(35, 75); spawn({ layer: 'back', clip, x, y: top, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, g: 40, life: 1.1 + rand(0, 0.4), size: 2, color: i % 3 ? cs[0] : cs[1], trail: 3 }); } });
      }
    },
  },
  neon: {
    name: 'Lightning',
    life: 'Rain falls outside, behind the buildings and the window frame.',
    event: 'Lightning: a bolt forks down over the city, the room flashes twice and the rain gets heavier.',
    init() { state.heavy = 0; state.rain = field(70, () => ({ x: rand(48, 144) * S, y: rand(10, 44) * S, v: rand(150, 210) })); state.signs = [{ x: 7, y: 14, w: 14, h: 8 }, { x: 35, y: 11, w: 6, h: 19 }, { x: 119, y: 10, w: 21, h: 6 }, { x: 173, y: 13, w: 11, h: 8 }]; },
    draw(L, f) { const g = L.back;
      const n = state.heavy > f ? 70 : 34;
      state.rain.slice(0, n).forEach((d) => { d.y += d.v / 18; d.x -= d.v / 18 * 0.2; if (d.y > 44 * S) { d.y = 10 * S; d.x = rand(52, 146) * S; } if (d.x > 48 * S) p1(g, d.x, d.y, 0x9ad0ff, 0.45, 1, 4); });
      
    },
    play() {
      state.heavy = frame + 18 * 4;
      const bolt = []; let x = rand(80, 112), y = 10; while (y < 44) { const nx = x + rand(-4, 4), ny = y + rand(2, 5); bolt.push([x, y, nx, ny]); if (Math.random() < 0.25) bolt.push([nx, ny, nx + rand(-6, 6), ny + rand(3, 7)]); x = nx; y = ny; }
      const line = (g, [ax, ay, bx, by], c) => { const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)); for (let i = 0; i <= n; i++) P(g, ax + ((bx - ax) * i) / n, ay + ((by - ay) * i) / n, c); };
      fx.push({ t: 0, dur: 1.4, layer: 'back', draw(g, t) { const on = [1, 1, 0, 0, 1, 1, 1, 0, 0, 0, 1][Math.floor(t * 18)] ; if (on) bolt.forEach((s) => line(g, s, 0xffffff)); } });
      fx.push({ t: 0, dur: 1.2, layer: 'front', draw(g, t) { const a = [0.3, 0.15, 0, 0, 0.22, 0.1, 0, 0.05][Math.floor(t * 18)] || 0; if (a) g.rect(0, 0, W, H).fill({ color: 0xe8f0ff, alpha: a }); } });
    },
  },
  vip: {
    name: 'A big winner',
    life: 'City windows switch on and off and a plane blinks across the night sky.',
    event: 'A big winner: confetti flutters down across the whole room, flipping between its two colours.',
    init() { state.lights = field(14, () => ({ x: Math.round(rand(60, 132)), y: Math.round(rand(24, 33)), on: Math.random() < 0.5 })); state.plane = 0; },
    draw(L, f) { let g = L.room;
      state.lights.forEach((l) => { if (Math.random() < 0.01) l.on = !l.on; if (l.on) P(g, l.x, l.y, 0xffd27a, 0.85); });
      g = L.back; const pt = f % 600, px = 135 - (pt / 240) * 80;
      if (pt < 240) { P(g, px, 13, 0x8a8494, 0.8, 2, 1); if (f % 12 < 2) P(g, px, 12, 0xff2a3a); if (f % 12 === 6) P(g, px + 1, 12, 0xffffff); }
    },
    play() {
      const cols = [[0xff6a8a, 0xffd75e], [0x7ad8ff, 0xffffff], [0x9aff8a, 0xb06aff]];
      for (let i = 0; i < 140; i++) { const c = pick(cols); spawn({ layer: 'front', x: rand(0, W), y: rand(-80, -4), vy: rand(28, 55), wobble: rand(3, 7), sway: rand(10, 30), seed: rand(0, 6), life: 4.2, w: 2, h: 2, size: 2, color: (p) => (Math.floor(p.age * 8 + p.seed) % 2 ? c[0] : c[1]) }); }
    },
  },
  orbit: {
    name: 'Meteor shower',
    life: 'Stars drift past the window at two depths and a satellite crosses now and then.',
    event: 'Meteor shower: meteors cross the window with burning trails, some split in two.',
    init() { state.stars = field(36, () => ({ x: rand(57, 135), y: rand(10, 33), v: Math.random() < 0.5 ? 0.6 : 1.3 })); },
    draw(L, f) { const g = L.back;
      const inEarth = (x, y) => ((x - 75) / 19) ** 2 + ((y - 34) / 14) ** 2 < 1 || ((x - 122) / 4) ** 2 + ((y - 17) / 4) ** 2 < 1;
      state.stars.forEach((s) => { s.x -= s.v / 18; if (s.x < 57) { s.x = 135; s.y = rand(10, 33); } if (!inEarth(s.x, s.y)) p1(g, s.x * S, s.y * S, 0xffffff, s.v > 1 ? 0.95 : 0.5); });
      const t = f % 400; if (t < 160) { const x = 136 - t * 0.5, y = 14 + t * 0.03; P(g, x, y, 0xb8c0d0); p1(g, x * S - 2, y * S, 0x6a90c0, 1, 2, 1); p1(g, x * S + 2, y * S, 0x6a90c0, 1, 2, 1); if (t % 9 < 2) p1(g, x * S, y * S - 1, 0xff4a4a); }
    },
    play() {
      const clip = [57 * S, 10 * S, 135 * S, 33 * S];
      for (let i = 0; i < 14; i++) later(i * 0.22, () => {
        const x = rand(90, 150) * S, y = rand(4, 16) * S, split = Math.random() < 0.35;
        const m = { layer: 'back', clip, x, y, vx: -rand(110, 160), vy: rand(50, 80), life: 1.2, size: 3, color: 0xfff6c0, trailColor: 0xff8a3a, trail: 9 };
        spawn(m);
        if (split) later(0.4, () => [-20, 20].forEach((d) => spawn(Object.assign({}, m, { x: m.x - 0.4 * 135, y: m.y + 0.4 * 65, vy: m.vy + d, life: 0.7, size: 1, hist: [] }))));
      });
    },
  },
  liner: {
    name: 'Solar flare',
    life: 'Stars stream past the portholes and the big lamps sparkle.',
    event: 'Solar flare: the portholes flood with light and sparks pour into the room in steps.',
    init() { state.warp = field(30, () => ({ x: rand(-8, 8), y: rand(-8, 8), v: rand(40, 90), c: pick([0xffffff, 0xff9ae0, 0xbfe4ff]) })); },
    draw(L, f) { let g = L.back;
      [64, 128].forEach((cx) => state.warp.forEach((s, i) => { const x = s.x - ((f * s.v) / 18 / S + i * 3) % 16 + 8; if (x * x + s.y * s.y < 42 && (x + 2) ** 2 + s.y * s.y < 42) { p1(g, (cx + x) * S, (22 + s.y) * S, s.c, 0.85, s.v > 70 ? 4 : 2, 1); } }));
      g = L.room; [[11, 17], [181, 17]].forEach(([x, y], i) => { const r = [0, 1, 2, 3, 2, 1][Math.floor(f / 3 + i * 2) % 6]; for (let k = 1; k <= r; k++) { P(g, x - k - 3, y, 0xfff6c0, 0.7); P(g, x + k + 3, y, 0xfff6c0, 0.7); } });
    },
    play() {
      fx.push({ t: 0, dur: 2.4, layer: 'back', draw(g, t) { const a = [0.9, 0.9, 0.7, 0.5, 0.9, 0.6, 0.4, 0.3, 0.2, 0.1][Math.floor(t * 6)] || 0; [64, 128].forEach((cx) => { for (let y = -7; y <= 7; y++) { const w = Math.floor(Math.sqrt(49 - y * y)); P(g, cx - w, 22 + y, 0xffe9a0, a, w * 2 + 1, 1); } }); } });
      for (let i = 0; i < 70; i++) { const cx = pick([64, 128]); spawn({ layer: 'front', x: cx * S + rand(-6, 6), y: 22 * S + rand(-6, 6), vx: rand(-60, 60), vy: rand(10, 90), g: 30, life: 1.4 + rand(0, 0.6), age: -rand(0, 0.8), size: 2, color: pick([0xfff6c0, 0xffd75e, 0xffffff]), trail: 2 }); }
    },
  },
  mars: {
    name: 'Dust storm',
    life: 'Red dust blows past outside and the domes blink.',
    event: 'Dust storm: thick sheets of dust race across the window and the room goes hazy in stripes.',
    init() { state.dust = field(40, () => ({ x: rand(49, 144), y: rand(10, 42), v: rand(4, 10), s: rand(0, 6) })); state.signs = [{ x: 7, y: 14, w: 20, h: 8 }, { x: 173, y: 13, w: 11, h: 8 }]; state.storm = 0; },
    draw(L, f) { let g = L.back;
      const n = state.storm > f ? 40 : 18, k = state.storm > f ? 4 : 1;
      state.dust.slice(0, n).forEach((d) => { d.x += (d.v * k) / 18; d.y += Math.sin(f / 6 + d.s) * 0.05; if (d.x > 144) { d.x = 49; d.y = rand(10, 42); } p1(g, d.x * S, d.y * S, pick([0xd8884a, 0xf0b070]), 0.7, state.storm > f ? 3 : 1, 1); });
      g = L.room; [[56, 36], [64, 35], [126, 36], [136, 35]].forEach(([x, y], i) => { if ((f + i * 5) % 24 < 12) P(g, x, y, 0x7af0ff, 0.9); });
      
    },
    play() {
      state.storm = frame + 18 * 5;
      fx.push({ t: 0, dur: 5, layer: 'front', draw(g, t) { const a = Math.min(1, t / 0.6, (5 - t) / 0.8); const off = Math.floor(t * 18) * 4; for (let y = 0; y < H; y += 8) g.rect(0, y + ((off + y) % 8 < 4 ? 0 : 2), W, 2).fill({ color: 0xc8703a, alpha: 0.18 * a }); } });
    },
  },
  horizon: {
    name: 'Falling in',
    life: 'Matter circles the black hole in the disc and now and then a star falls in.',
    event: 'Falling in: rocks spiral into the hole, flash white at the edge and send a ring out.',
    init() { state.disc = field(48, (_, i) => ({ a: (i / 48) * Math.PI * 2, r: rand(26, 33), v: rand(0.06, 0.12) })); },
    draw(L, f) { let g = L.room;
      state.disc.forEach((d) => { d.a += d.v; const x = 96 + Math.cos(d.a) * d.r, y = 20.5 + Math.sin(d.a) * 2.6, near = Math.cos(d.a) > 0; P(g, x, y, near ? pick([0xffffff, 0xfff6c0]) : pick([0xff8a3a, 0xc83a10]), 0.8); });
      g = L.back; if (f % 90 === 0) { const a = rand(0, Math.PI * 2); state.fall = { a, r: 34, t: 0 }; }
      if (state.fall) { const s = state.fall; s.t++; s.r -= 0.5; s.a += 0.08; const x = 96 + Math.cos(s.a) * s.r, y = 20 + Math.sin(s.a) * s.r * 0.35; if (s.r < 4) state.fall = null; else { P(g, x, y, 0xffffff); P(g, x - Math.cos(s.a + 0.6), y - Math.sin(s.a + 0.6) * 0.35, 0xbfe4ff, 0.5); } }
    },
    play() {
      for (let i = 0; i < 8; i++) later(i * 0.35, () => {
        const a0 = rand(0, Math.PI * 2);
        fx.push({ t: 0, dur: 1.5, layer: 'back', draw(g, t) {
          const k = t / 1.2; if (k >= 1) { const rr = (t - 1.2) * 60; for (let j = 0; j < 24; j++) { const b = (j / 24) * Math.PI * 2; P(g, 96 + Math.cos(b) * rr, 20 + Math.sin(b) * rr * 0.35, 0xfff6c0, 0.8); } return; }
          const r = 36 * (1 - k), a = a0 + k * 5;
          for (let h = 0; h < 5; h++) { const rh = r + h * 1.4, ah = a - h * 0.12; P(g, 96 + Math.cos(ah) * rh, 20 + Math.sin(ah) * rh * 0.35, h ? 0xff8a3a : 0xd8c8d8, 1 - h * 0.18, h ? 1 : 2, h ? 1 : 2); }
          if (r < 5) P(g, 95, 19, 0xffffff, 1, 3, 3);
        } });
      });
    },
  },
};

// ------------------------------------------------------------- the other scene events (same sprites as the game)
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
  const EYE_OPEN = ['.....ooooooo.....', '...oowwwwwwwoo...', '..owwwwwwwwwwvo..', '.owvwwwwwwwwwwso.', 'owwwwwwwwwwwwwwso', '.oswwwwwwwwwwvso.', '..osswwwwwwwsso..', '...oosssssssoo...', '.....ooooooo.....'];
  const EYE_HALF = ['.................', '.................', '...ooooooooooo...', '.oowwwwwwwwwwsoo.', 'owwwwwwwwwwwwwwso', '.oosswwwwwwwssoo.', '...ooooooooooo...', '.................', '.................'];
  const EYE_SHUT = ['.................', '.................', '.................', '.................', 'ooooooooooooooooo', '.................', '.................', '.................', '.................'];
  const EYE_PAL = { o: '#5a0a12', w: '#fff0d0', s: '#e0b890', v: '#d04040' };
  const IRIS = ['..rrr..', '.rRkRr.', 'rRRkRRr', 'rRRkRRr', 'rRRkRRr', '.rRkRr.', '..rrr..'];
  const IRIS_PAL = { r: '#ff8a2a', R: '#c83a10', k: '#08080c' };
const HEX = {}; const hx = (c) => (HEX[c] != null ? HEX[c] : (HEX[c] = parseInt(c.slice(1), 16)));
const FLIPS = new Map();
const flip = (rows) => { if (!FLIPS.has(rows)) FLIPS.set(rows, rows.map((r) => r.split('').reverse().join(''))); return FLIPS.get(rows); };
/** Draws a bitmap (rows of palette letters, '.' clear) at scene pixel (x, y); k = pixel size; clip(x, y) keeps a pixel. */
function spr(g, rows, pal, x, y, alpha = 1, clip, k = 1) {
  rows.forEach((row, j) => { for (let i = 0; i < row.length; i++) { const c = pal[row[i]]; if (!c) continue; const px = x + i * k, py = y + j * k; if (clip && !clip(px, py)) continue; P(g, px, py, hx(c), alpha, k, k); } });
}
const ease = (k) => k * k * (3 - 2 * k);
/** Position along keyframes [[0..1, x, y], ...] at k (0..1); `smooth` eases each leg. */
function along(pts, k, smooth) {
  k = Math.max(0, Math.min(1, k));
  for (let i = 1; i < pts.length; i++) {
    if (k <= pts[i][0]) { const a = pts[i - 1], b = pts[i]; let u = (k - a[0]) / (b[0] - a[0] || 1); if (smooth) u = ease(u); return { x: a[1] + (b[1] - a[1]) * u, y: a[2] + (b[2] - a[2]) * u }; }
  }
  const l = pts[pts.length - 1]; return { x: l[1], y: l[2] };
}
const cyc = (frames, t, each) => frames[Math.floor((t * 1000) / each) % frames.length];
function ev(dur, layer, draw, extra) { fx.push(Object.assign({ t: 0, dur, layer, draw }, extra || {})); }
const inRect = (r) => (x, y) => x >= r[0] && x < r[0] + r[2] && y >= r[1] && y < r[1] + r[3];
const WIN = { neon: [48, 9, 96, 33], mars: [48, 9, 96, 33] };

const THIEF_UP = ["......kkkk......", ".....Hkkkkk.....", ".....geggeg.....", ".....mmmmmm.....", ".....mwmmwm.....", ".....mmmmmm.....", "......mmmm......", ".......kk.......", "....hkkkkkkh....", "...hkbkkkkbkh...", "...Hkkbkkbkkh...", "...Hkkkbbkkkh...", "...Hkkkkkkkkh...", "...Hkkkkkkkkh...", "...nbbbybbbbn...", "...nkkkkkkkkn...", "....kkkkkkkk....", "....Hkk..kkh....", "....Hkk..kkh....", "....Hkk..kkh....", "....Hkk..kkh....", "....kkk..kkk....", "...nnnn..nnnn..."];
const THIEF_UP_GRAB = ["......kkkk......", ".....Hkkkkk.nn..", ".....geggeg.nn..", ".....mmmmmm.hH..", ".....mwmmwm.hH..", ".....mmmmmm.hH..", "......mmmm..hH..", ".......kk...hH..", "....hkkkkkkhhH..", "...hkbkkkkbk....", "...Hkkbkkbkk....", "...Hkkkbbkkk....", "...Hkkkkkkkk....", "...Hkkkkkkkk....", "...nbbbybbbb....", "...nkkkkkkkk....", "....kkkkkkkk....", "....Hkk..kkh....", "....Hkk..kkh....", "....Hkk..kkh....", "....Hkk..kkh....", "....kkk..kkk....", "...nnnn..nnnn..."];
const THIEF_UP_WINK = ["......kkkk......", ".....Hkkkkk.nn..", ".....geggeg.nn..", ".....mmmmmm.hH..", ".....mwmmmm.....", ".....mmmmmm.hH..", "......mmmm..hH..", ".......kk...hH..", "....hkkkkkkhhH..", "...hkbkkkkbk....", "...Hkkbkkbkk....", "...Hkkkbbkkk....", "...Hkkkkkkkk....", "...Hkkkkkkkk....", "...nbbbybbbb....", "...nkkkkkkkk....", "....kkkkkkkk....", "....Hkk..kkh....", "....Hkk..kkh....", "....Hkk..kkh....", "....Hkk..kkh....", "....kkk..kkk....", "...nnnn..nnnn..."];
const THIEF_UP_L = ["......kkkk......", ".....Hkkkkk.....", ".....geggeg.....", ".....mmmmmm.....", ".....wmmwmm.....", ".....mmmmmm.....", "......mmmm......", ".......kk.......", "....hkkkkkkh....", "...hkbkkkkbkh...", "...Hkkbkkbkkh...", "...Hkkkbbkkkh...", "...Hkkkkkkkkh...", "...Hkkkkkkkkh...", "...nbbbybbbbn...", "...nkkkkkkkkn...", "....kkkkkkkk....", "....Hkk..kkh....", "....Hkk..kkh....", "....Hkk..kkh....", "....Hkk..kkh....", "....kkk..kkk....", "...nnnn..nnnn..."];
const THIEF_UP_R = ["......kkkk......", ".....Hkkkkk.....", ".....geggeg.....", ".....mmmmmm.....", ".....mmwmmw.....", ".....mmmmmm.....", "......mmmm......", ".......kk.......", "....hkkkkkkh....", "...hkbkkkkbkh...", "...Hkkbkkbkkh...", "...Hkkkbbkkkh...", "...Hkkkkkkkkh...", "...Hkkkkkkkkh...", "...nbbbybbbbn...", "...nkkkkkkkkn...", "....kkkkkkkk....", "....Hkk..kkh....", "....Hkk..kkh....", "....Hkk..kkh....", "....Hkk..kkh....", "....kkk..kkk....", "...nnnn..nnnn..."];
const THIEF_UP_PAL = { k: '#2a2040', h: '#4a3a6a', H: '#a890d8', g: '#3a3a44', e: '#9fe0ff', m: '#120c1c', w: '#fbf6e6', b: '#8a7038', y: '#ffd75e', n: '#16101e' };
const CRYSTAL = ['..c..', '.cwc.', 'cwcCc', '.cCC.', '..C..'];
const CRYSTAL_PAL = { c: '#bfe4ff', w: '#ffffff', C: '#6aa8e0' };

function shakeRoom() {
  ev(2.2, 'front', (g, t) => { if (t < 1.8 && Math.floor(t * 6) % 2 === 0) g.rect(0, 0, W, H).fill({ color: 0xff2a2a, alpha: 0.16 }); }, {
    tick(t) { const k = Math.max(0, 1 - t / 2.2), f = Math.floor(t * 18); app.stage.position.set((f % 2 ? 1 : -1) * Math.round(k * 8), ((f % 3) - 1) * Math.round(k * 4)); },
    end() { app.stage.position.set(0, 0); },
  });
  [30, 70, 122, 160].forEach((x, i) => spawn({ layer: 'room', x: x * S, y: 8 * S, vx: i % 2 ? 8 : -8, vy: 20, g: 320, life: 0.9, age: -(0.15 + i * 0.12), size: 2, color: 0xffd75e, trail: 2 }));
  for (let i = 0; i < 26; i++) spawn({ layer: 'room', x: rand(20, 172) * S, y: rand(6, 9) * S, vy: rand(10, 30), g: 60, life: 1.6, age: -rand(0.1, 0.6), size: 1, color: 0x8a8094, alpha: 0.8 });
}
function signGlitch(signs, sparks) {
  ev(2.4, 'room', (g, t) => {
    const f = Math.floor(t * 18);
    signs.forEach(([x, y, w, h], i) => { if ((f * 7 + i * 3) % 5 < 2 || f % 9 === i) P(g, x, y, 0x05030a, 0.8, w, h); else if ((f + i) % 11 === 0) P(g, x, y, 0xffffff, 0.25, w, h); });
  });
  sparks.forEach(([x, y], k) => { for (let i = 0; i < 4; i++) spawn({ layer: 'room', x: x * S, y: y * S, vx: rand(-20, 20), vy: rand(-15, 5), g: 220, life: 0.5, age: -(0.2 + k * 0.33 + i * 0.09 + (i > 1 ? 0.9 : 0)), size: 1, color: i % 2 ? 0xffffff : 0x7ff0ff, trail: 2 }); });
}
function meteorRain(clipR, x0, x1) {
  const clip = [clipR[0] * S, clipR[1] * S, (clipR[0] + clipR[2]) * S, (clipR[1] + clipR[3]) * S];
  for (let i = 0; i < 14; i++) later(i * 0.22, () => {
    const m = { layer: 'back', clip, x: rand(x0, x1) * S, y: rand(4, 14) * S, vx: -rand(110, 160), vy: rand(50, 80), life: 1.2, size: 3, color: 0xfff6c0, trailColor: 0xff8a3a, trail: 9 };
    spawn(m);
    if (Math.random() < 0.35) later(0.4, () => [-20, 20].forEach((d) => spawn(Object.assign({}, m, { x: m.x - 0.4 * 135, y: m.y + 0.4 * 65, vy: m.vy + d, life: 0.7, size: 1, hist: [] }))));
  });
}
// Pixel smoke: a puff is a ring of scattered pixels that grows, thins out and drifts.
function puff(g, x, y, r, a) { for (let i = 0; i < 10 + r * 4; i++) { const ang = (i * 2.399) % (Math.PI * 2), d = r * (0.3 + ((i * 7) % 10) / 14); P(g, x + Math.cos(ang) * d, y + Math.sin(ang) * d * 0.8, 0xc8c8d4, a); } }

const MORE = {
  corner: [
    { name: 'Power flicker', play() {
      const A = [0.6, 0.1, 0.65, 0.05, 0.7, 0.7, 0.2, 0.5, 0], K = [0, 0.08, 0.14, 0.22, 0.3, 0.7, 0.76, 0.82, 0.9];
      ev(2.8, 'front', (g, t) => { let a = 0; K.forEach((kk, i) => { if (t / 2.8 >= kk) a = A[i]; }); if (a) g.rect(0, 0, W, H).fill({ color: 0x05030a, alpha: a }); });
      [[28, 12], [41, 15], [150, 15], [164, 13]].forEach(([x, y], k) => { for (let i = 0; i < 3; i++) spawn({ layer: 'room', x: x * S, y: (y + 1) * S, vx: rand(-12, 12), vy: rand(-10, 5), g: 260, life: 0.7, age: -(0.25 + i * 0.16 + k * 0.25), size: 1, color: i % 2 ? 0xffd75e : 0xff9a3a, trail: 2 }); });
    } },
    { name: 'The bar cat', play() {
      const c = (x, y) => y < 30;
      ev(10.4, 'mid', (g, t) => {
        const ms = t * 1000; let p, rows;
        if (ms < 700) { p = along([[0, 138, 31], [0.55, 135, 19], [1, 132, 24]], ms / 700); rows = CAT.leap; }
        else if (ms < 3700) { p = along([[0, 132, 24], [1, 110, 24]], (ms - 700) / 3000); rows = cyc(CAT.walk, t, 130); }
        else if (ms < 7300) { p = { x: 110, y: 23 }; rows = [CAT.sit, CAT.sit, CAT.sitTail][Math.floor(ms / 450) % 3]; }
        else if (ms < 9700) { p = along([[0, 109, 24], [1, 130, 24]], (ms - 7300) / 2400); rows = flip(cyc(CAT.walk, t, 130)); }
        else { p = along([[0, 130, 24], [0.4, 134, 21], [1, 139, 33]], (ms - 9700) / 700); rows = flip(CAT.leap); }
        spr(g, rows, CAT_PAL, Math.round(p.x), Math.round(p.y), 1, c);
        if (ms > 3700 && ms < 7300 && Math.floor(ms / 300) % 8 === 5) P(g, 111, 25, 0x121016);   // blinks
      });
    } },
    { name: 'The chip thief', secret: true, play() {
      const c = (x, y) => y < 30;
      ev(6, 'mid', (g, t) => {
        const ms = t * 1000, p = along([[0, 50, 31], [0.06, 52, 26], [0.25, 74, 26], [0.6, 74, 26], [0.95, 136, 26], [1, 140, 33]], ms / 6000);
        const x = Math.round(p.x), y = Math.round(p.y);
        spr(g, ms < 1500 ? cyc(MOUSE, t, 90) : ms < 3600 ? MOUSE[0] : cyc(MOUSE, t, 70), MOUSE_PAL, x, y, 1, c);
        spr(g, CHIP_GOLD, CHIP_PAL, x + 9, y - 2, 1, c);
        if (ms > 1500 && ms < 3600 && Math.floor(ms / 140) % 2) P(g, x + 10, y + 2, 0xffa0b8);
        if (ms > 1800 && Math.floor((ms - 1800) / 300) % 3 === 1 && c(x, y - 2)) P(g, x + 10, y - 2, 0xffffff);
      });
    } },
  ],
  deco: [
    { name: 'The chandeliers sway', play() {
      // the chandeliers in the scene picture swing (css: body.fx-chandelier); crystals glint as they move
      ev(4.4, 'room', (g, t) => { if (Math.floor(t * 18) % 3) return; const x = pick([64, 128]) + Math.round(rand(-7, 7)), y = Math.round(rand(14, 21)); P(g, x, y, 0xffffff); P(g, x - 1, y, 0xffffff, 0.6); P(g, x + 1, y, 0xffffff, 0.6); P(g, x, y - 1, 0xffffff, 0.6); P(g, x, y + 1, 0xffffff, 0.6); });
    } },
    { name: 'The jewel thief', secret: true, play() {
      // Close to the camera, so in front of everything (the table and its buttons too), and drawn with bigger pixels.
      const K = 1.5, X = 116, hand = (y) => [X + 12.5 * K, y + 1.5 * K];
      ev(7.6, 'front', (g, t) => {
        const ms = t * 1000;
        const p = along([[0, X, -40], [0.2, X, 8], [0.76, X, 8], [0.8, X, 10], [1, X, -44]], ms / 7600, true);
        const y = Math.round(p.y);
        // the rope, from the ceiling to the harness, with a little sway
        P(g, X + 7.5 * K, -2, 0xd8c49a, 1, 1, y + 8 * K + 2);
        P(g, X + 7 * K, y + 9 * K, 0x8a7038, 1, 2, 1);
        let rows = THIEF_UP;
        if (ms > 1700 && ms < 2300) rows = THIEF_UP_L;
        else if (ms > 2300 && ms < 2900) rows = THIEF_UP_R;
        else if (ms > 3200 && ms < 4900) rows = THIEF_UP_GRAB;
        else if (ms > 4900 && ms < 5500) rows = THIEF_UP_WINK;
        else if (ms > 5500 && ms < 5900) rows = THIEF_UP_GRAB;
        spr(g, rows, THIEF_UP_PAL, X, y, 1, null, K);
        // the crystal: twinkles on the chandelier, then he holds it up and it glitters
        const [hx2, hy2] = hand(y);
        if (ms < 3200) { if (Math.floor(ms / 200) % 2) { P(g, 127, 18, 0xffffff); P(g, 126, 19, 0xffffff, 0.6); P(g, 128, 19, 0xffffff, 0.6); P(g, 127, 20, 0xffffff, 0.6); } }
        else if (rows === THIEF_UP_GRAB || ms > 5900) {
          const cx = Math.round(hx2 - 2), cy = Math.round(hy2 - 6);
          spr(g, CRYSTAL, CRYSTAL_PAL, cx, cy);
          const f = Math.floor(ms / 110) % 6, r = [0, 1, 2, 2, 1, 0][f];
          for (let k = 1; k <= r; k++) { P(g, cx - k, cy + 2, 0xffffff, 0.8); P(g, cx + 4 + k, cy + 2, 0xffffff, 0.8); P(g, cx + 2, cy - k, 0xffffff, 0.8); }
        }
      });
    } },
  ],
  neon: [
    { name: 'Sign glitch', play() { signGlitch([[6, 14, 22, 9], [172, 12, 12, 9], [118, 8, 23, 9], [35, 11, 7, 19]], [[17, 23], [178, 21], [129, 17], [37, 30]]); } },
    { name: 'Police lights', play() {
      // Only what is seen through the glass: the car, its light bar and the light it throws.
      const c = inRect(WIN.neon);
      ev(4.2, 'mid', (g, t) => {
        const p = along([[0, 150, 35], [1, 30, 35]], t / 4.2), x = Math.round(p.x), y = 35, red = Math.floor(t * 5) % 2 === 0;
        spr(g, flip(POLICE), POLICE_PAL, x, y, 1, c);
        const lx = red ? x + 4 : x + 6, col = red ? 0xff2a3a : 0x2a6aff;
        [[0, 0], [1, 0]].forEach(([dx, dy]) => { if (c(lx + dx, y + dy)) P(g, lx + dx, y + dy, col); });
        [[-1, 0], [2, 0], [0, -1], [1, -1], [-2, 0], [3, 0], [0, -2], [1, -2]].forEach(([dx, dy], i) => { if (c(lx + dx, y + dy)) P(g, lx + dx, y + dy, col, i < 4 ? 0.45 : 0.2); });
      });
    } },
    { name: 'Abduction', secret: true, play() {
      ev(7.6, 'back', (g, t) => {
        const ms = t * 1000, p = along([[0, 150, 2], [0.25, 112, 12], [0.7, 112, 12], [1, 40, -4]], ms / 7600);
        if (ms > 2000 && ms < 5300 && Math.floor(ms / 160) % 2) for (let yy = 19; yy < 42; yy++) { const k = (yy - 19) / 23, l = Math.round(115 - 6 * k), r = Math.round(122 + 6 * k); for (let xx = l; xx < r; xx++) if ((xx + yy) % 2) P(g, xx, yy, 0x9af0b0, 0.35); }
        if (ms > 2200 && ms < 5300) { const q = along([[0, 115, 39], [1, 115, 19]], (ms - 2200) / 3000, true); spr(g, CAR, CAR_PAL, Math.round(q.x), Math.round(q.y)); }
        const x = Math.round(p.x), y = Math.round(p.y);
        spr(g, UFO2, UFO2_PAL, x, y);
        P(g, x + 1 + 4 * (Math.floor(ms / 160) % 3), y + 4, 0xffffff);
      });
    } },
  ],
  vip: [
    { name: 'Cigar smoke', play() {
      ev(7, 'room', (g, t) => {
        const ms = t * 1000, a = ms < 700 ? Math.floor(ms / 175) / 4 : ms > 6300 ? Math.floor((7000 - ms) / 175) / 4 : 1;
        if (a > 0) spr(g, PATRON, PATRON_PAL, 148, 33, a);
        if (a > 0 && (ms % 1400) > 350 && (ms % 1400) < 1050) P(g, 155, 37, 0xff6a1a);
        for (let i = 0; i < 8; i++) { const t0 = 500 + i * 650, k = (ms - t0) / 3200; if (k < 0 || k > 1) continue; const p = along([[0, 156, 36], [0.5, 152 - (i % 3) * 2, 25], [1, 144 + (i % 2) * 6, 8]], k); puff(g, p.x, p.y, 1 + Math.floor(k * 4), 0.55 * (1 - k)); }
      });
    } },
    { name: 'Mr. Valdez, twice', secret: true, play() {
      valdez.visible = true;
      ev(8.4, 'none', () => {}, {
        tick(t) {
          const k = t / 8.4, dx = 38 - 84 * k, a = Math.round(Math.min(1, t / 0.7, (8.4 - t) / 0.7) * 4) / 4;
          valdezBody.alpha = a * 0.5;
          // glowing red eyes, brighter than the ghost, pulsing
          const glow = [0.35, 0.5, 0.65, 0.5][Math.floor(t * 6) % 4];
          valdezEyes.clear();
          D.valdezEyes.forEach(([x, y, w, h]) => { valdezEyes.rect(x - 1, y - 1, w + 2, h + 2).fill({ color: 0xff2a1a, alpha: glow * a }); });
          D.valdezEyes.forEach(([x, y, w, h]) => { valdezEyes.rect(x, y, w, h).fill({ color: 0xff3a2a, alpha: a }); });
          D.valdezEyes.filter((e, i) => i < 2).forEach(([x, y]) => { valdezEyes.rect(x, y, 1, 1).fill({ color: 0xffd0a0, alpha: a }); });
          valdez.position.set(Math.round((96 * 0.2 + dx) * 8), Math.round((36 * 0.2 - 10) * 8));
        },
        end() { valdez.visible = false; },
      });
    } },
  ],
  orbit: [
    { name: 'Asteroid bump', play: shakeRoom },
    { name: 'Someone waves', secret: true, play() {
      // Outside the glass but in front of the moon and the planet: drawn over them, kept off the window frame.
      const FRAME = [0x5a6880, 0x9aa8c0];
      const c = (x, y) => isGlass('orbit', x, y) || (x >= 57 && x < 135 && y >= 11 && y < 33 && !isFrame(x, y));
      ev(9.6, 'mid', (g, t) => {
        const ms = t * 1000, p = along([[0, 136, 9], [0.35, 110, 10], [0.65, 108, 10], [0.78, 104, 5], [1, 58, -4]], ms / 9600), x = Math.round(p.x), y = Math.round(p.y);
        spr(g, ms > 3300 && ms < 6300 && Math.floor(ms / 300) % 2 ? ASTRO2_WAVE : ASTRO2, ASTRO2_PAL, x, y, 1, c);
        if (Math.floor((ms - 600) / 733) % 3 === 1) P(g, x + 5, y + 3, 0xffffff);
        const j = Math.floor(ms / 160) % 3; if (j < 2) { P(g, x - 1, y + 4 + j, 0xbfe4ff, 0.8); if (!j) P(g, x - 2, y + 5, 0xbfe4ff, 0.4); }
      });
    } },
  ],
  liner: [
    { name: 'Asteroid bump', play: shakeRoom },
    { name: 'The ghost galleon', secret: true, play() {
      ev(11, 'back', (g, t) => { const p = along([[0, 196, 4], [0.25, 140, 6], [0.5, 90, 4], [0.75, 40, 6], [1, -60, 4]], t / 11); spr(g, GALLEON, GALLEON_PAL, Math.round(p.x), Math.round(p.y), [0.85, 0.55, 0.8, 0.5][Math.floor(t * 2.5) % 4], null, 2); });
      ev(11, 'front', (g, t) => { const a = Math.min(1, t / 1, (11 - t) / 1); g.rect(0, 0, W, H).fill({ color: 0x7fd8b0, alpha: (Math.floor(t * 2.5) % 2 ? 0.07 : 0.045) * a }); });
    } },
  ],
  mars: [
    { name: 'Meteor shower', play() { meteorRain(WIN.mars, 70, 150); } },
    { name: 'Sign glitch', play() { signGlitch([[6, 14, 22, 9], [172, 12, 12, 9]], [[17, 23], [178, 21]]); } },
    { name: 'A local', secret: true, play() {
      const c = inRect(WIN.mars);
      ev(7, 'mid', (g, t) => {
        const ms = t * 1000, p = along([[0, 62, 44], [0.15, 62, 29], [0.85, 62, 29], [1, 62, 44]], ms / 7000, true), x = 62, y = Math.round(p.y);
        spr(g, Math.floor(ms / 300) % 4 === 3 ? MARTIAN2_BLINK : MARTIAN2, MARTIAN2_PAL, x, y, 1, c);
        const s = Math.floor(ms / 220) % 2; if (c(x + 1, y)) { P(g, x + 1, y, s ? 0xd8ff7a : 0xffffff); P(g, x + 14, y, s ? 0xffffff : 0xd8ff7a); }
        if (ms > 2200 && ms < 4800) spr(g, HAND, MARTIAN2_PAL, x + 16 + (Math.floor(ms / 250) % 2), y + (Math.floor(ms / 250) % 2 ? 4 : 6), 1, c);
      });
    } },
  ],
  horizon: [
    { name: 'Light bends', play() {
      // The whole scene wobbles like a lens and its colours shift (css: body.fx-warp), while two smooth rings spread out.
      [0, 0.9].forEach((t0) => ev(2 + t0, 'room', (g, t) => { const k = (t - t0) / 2; if (k < 0) return; g.circle(96 * S, 20 * S, (2 + 68 * k) * S).stroke({ width: (1.2 + 2.8 * k) * S, color: 0xfff6c0, alpha: 0.9 * (1 - k) }); }));
    } },
    { name: 'It blinks', secret: true, play() {
      const x0 = 88, y0 = 16;   // drawn behind the dealer
      const show = [[600, 800, EYE_SHUT], [800, 1000, EYE_HALF], [1000, 3700, EYE_OPEN], [3700, 3820, EYE_HALF], [3820, 3960, EYE_SHUT], [3960, 4080, EYE_HALF], [4080, 6100, EYE_OPEN], [6100, 6300, EYE_HALF], [6300, 6600, EYE_SHUT]];
      ev(7, 'mid', (g, t) => {
        const ms = t * 1000;
        if (ms > 1000 && ms < 6100 && Math.floor(ms / 450) % 2 === 0) [[-9, 0], [9, 0], [-7, -4], [7, -4], [-7, 4], [7, 4], [0, -6], [0, 6], [-4, -6], [4, -6], [-4, 6], [4, 6]].forEach(([dx, dy]) => P(g, 96 + dx, 20 + dy, 0xff3a2a, 0.9));
        const s = show.find(([a, b]) => ms >= a && ms < b); if (!s) return;
        const rows = s[2];
        spr(g, rows, EYE_PAL, x0, y0);
        const ip = along([[0, 93, 17], [0.3, 93, 17], [0.36, 89, 17], [0.48, 89, 17], [0.56, 98, 17], [0.7, 98, 17], [0.76, 93, 18], [1, 93, 18]], ms / 7000);
        const inEye = (px, py) => { const r = rows[py - y0]; const ch = r && r[px - x0]; return ch === 'w' || ch === 's' || ch === 'v'; };
        spr(g, IRIS, IRIS_PAL, Math.round(ip.x), Math.round(ip.y), 1, inEye);
        if (inEye(Math.round(ip.x) + 4, Math.round(ip.y) + 1)) P(g, Math.round(ip.x) + 4, Math.round(ip.y) + 1, 0xffffff);
      });
    } },
  ],
};

// ------------------------------------------------------------- loop (stepped), only while a table is on screen
let running = false, acc = 0, last = 0, life = false, masksFor = null;
function drawAll() {
  gBack.clear(); gMid.clear(); gRoom.clear(); gFront.clear();
  const L = { back: gBack, mid: gMid, room: gRoom, front: gFront };
  if (life && scene && SCENES[scene] && !reduce) SCENES[scene].draw(L, frame);
  drawParticles(gBack, 'back'); drawParticles(gMid, 'mid'); drawParticles(gRoom, 'room'); drawParticles(gFront, 'front');
  fx.forEach((e) => { if (L[e.layer] && e.t >= 0) e.draw(L[e.layer], e.t); });
}
function step() {
  frame++;
  reduce = reduceNow();
  fx.forEach((e) => { if (e.tick && e.t >= 0) e.tick(e.t); });
  for (let i = fx.length - 1; i >= 0; i--) { const e = fx[i]; e.t += STEP; if (e.t >= e.dur) { fx.splice(i, 1); if (e.end) e.end(); } }
  stepParticles(STEP); stepChips(STEP);
  drawAll();
  backApp.render(); frontApp.render();
}
function loop(now) {
  if (!running) return;
  acc += (now - last) / 1000; last = now;
  if (acc >= STEP) { acc = Math.min(acc - STEP, STEP); if (!doc.hidden) step(); }
  root.requestAnimationFrame(loop);
}
function show(on) {
  [backApp, frontApp].forEach((a) => a && a.canvas.classList.toggle('on', on));
}
function clearFx() {
  fx.forEach((e) => { if (e.end) try { e.end(); } catch (err) { /* already gone */ } });
  fx.length = 0; parts = []; chipSprites.forEach((c) => c.s.destroy()); chipSprites.length = 0;
  if (valdez) valdez.visible = false;
  shake(0, 0);
}
function place() {   // the back canvas goes into the room picture, the front one over the table
  const host = doc.getElementById('scene-backdrop');
  if (host && backApp.canvas.parentNode !== host) host.appendChild(backApp.canvas);
  if (frontApp.canvas.parentNode !== doc.body) doc.body.appendChild(frontApp.canvas);
}

let cur = null;   // { game, scene }
/** A table opened (ui.js startMode): the layer takes over this scene. */
async function start(game, sceneId) {
  stop();
  cur = { game, scene: sceneId };
  if (!sceneId || !SCENES[sceneId] || !stageOn()) return;
  await boot();
  if (!backApp || !cur || cur.game !== game) return;
  await loadChips();
  if (!cur || cur.game !== game) return;
  scene = sceneId; state = {}; SCENES[scene].init(); life = true;
  const m = sceneMasks(scene); backMask.texture = m.glass; midMask.texture = m.room;
  place(); show(true);
  running = true; last = root.performance.now(); acc = 0;
  root.requestAnimationFrame(loop);
}
/** Back to the menu: everything stops and the canvases hide. */
function stop() {
  cur = null; scene = null; life = false; running = false;
  if (backApp) { clearFx(); drawAllEmpty(); show(false); }
}
function drawAllEmpty() { [gBack, gMid, gRoom, gFront].forEach((g) => g && g.clear()); if (backApp) { backApp.render(); frontApp.render(); } }
const on = () => running && scene;

/** js/sceneevents.js hands an event over; false when this layer can't draw it (then the event keeps its SVG drawing). */
function playEvent(sceneId, id) {
  if (!on() || sceneId !== scene || !stageOn()) return false;
  const SE = root.SceneEvents, ge = SE && SE.EVENTS[sceneId] && SE.EVENTS[sceneId].find((e) => e.id === id);
  if (!ge) return false;
  const mine = [Object.assign({ name: SCENES[sceneId].name }, { play: SCENES[sceneId].play }), ...(MORE[sceneId] || [])].find((e) => e.name === ge.name);
  if (!mine) return false;
  mine.play();
  return true;
}

// The round is over (ui.js): effects for the player's own hands only, never a bot's, all in the middle of the table.
// A blackjack sparkles; a round's total win of 1,000 or more gets its win message (Settings > Table can turn those off),
// a smaller good win showers some chips.
function roundEnd(game) {
  if (!on() || !cur || game !== cur.game) return;
  let net = 0, natural = false;
  game.seats.filter((x) => x.type === 'player' && x.hands && x.hands.length).forEach((x) => x.hands.forEach((h) => { net += h.net || 0; if (h.natural && (h.net || 0) > 0) natural = true; }));
  if (natural) blackjack();
  const wins = !root.Prefs || root.Prefs.get('winMessages') !== false;
  const go = () => { if (!on()) return; if (net >= 1000 && wins) winTier(net, 'scene'); else if (net >= 200) bigWin(net); };
  if (natural && net >= 200) later(0.9, go); else go();
}

// Achievement unlocks: the effect plays behind the toast, centred on it.
doc.addEventListener('achievement:toast', (e) => {
  if (!on()) return;
  const a = e.detail && e.detail.achievement, el = doc.querySelector('.cos-toast'), c = frontApp.canvas.getBoundingClientRect();
  if (!a || !el || !c.width) return;
  const r = el.getBoundingClientRect(), k = W / c.width;
  unlock(a.rarity, Math.round((r.left + r.width / 2 - c.left) * k), Math.round((r.top + r.height / 2 - c.top) * k));
});
// The stage can switch to the stacked layout when the window gets narrow: the layer hides there.
root.addEventListener('resize', () => { if (backApp && cur) { const want = stageOn() && !!scene; show(want); if (!want) clearFx(); } });

root.FXLayer = {
  start, stop, roundEnd, playEvent,
  /** For testing: FXLayer.test('blackjack' | 'win', amount | 'unlock', rarity). */
  test: (what, v) => { if (!on()) return false; if (what === 'blackjack') blackjack(); else if (what === 'win') (v >= 1000 ? winTier(v, 'scene') : bigWin(v)); else if (what === 'unlock') unlock(v, 192, 40); return true; },
};
})(window);
