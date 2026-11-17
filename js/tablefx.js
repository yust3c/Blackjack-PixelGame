/* Table FX: cards travel on the table like a real deal. A new card flies from the shoe and turns face up where it
   lands, the dealer's hole card turns over, split cards slide to their new hand, busted hands are taken away at
   once, and at the next deal every card goes to the discard tray. Chips move too: a bet slides from its spot to the
   hand at the deal, a double comes from the bankroll, the dealer takes lost bets and pays wins from the rack, then
   everything goes home and the bankroll counts up. Moves are stepped ("pixel" style), like the rest
   of the game. Uses GSAP (vendor/gsap.min.js); without it, or with Reduce motion on, the table works as before.

   How it works: ui.js re-renders the table with innerHTML on every update, so the cards that animate are copies in
   a layer over the table (.tfx-fly) while the real card waits hidden in its place. ui.js calls TableFX.before() and
   TableFX.after() around each render; every card carries data-cid (its card id), which is how a card is followed
   from one render to the next. */
(function (root) {
  'use strict';

  const doc = root.document;
  const gsap = root.gsap;
  const STEP_FPS = 18;          // how many "frames" a stepped move gets per second

  let getGame = () => null;
  let rerender = () => {};
  let snap = null;              // cid -> { rect, back, html, dealer } from before()
  let pileSnap = null;          // pile key -> { rect, html, dest } from before()
  const waiting = new Set();    // cids whose real card stays hidden until its copy lands
  const flyers = new Set();
  let discarded = 0;            // cards in the discard tray since the last shuffle
  let lastShoe = null;
  const bustSeen = new WeakMap(); // hand -> time its bust was first rendered
  const shownTotal = new Map();   // hand key -> the total on screen, kept while a card is still flying in
  let refresh = 0;

  const $ = (id) => doc.getElementById(id);
  const reduce = () => (root.Prefs ? root.Prefs.reduceMotion() : !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches));

  // ---------------------------------------------------------------- set-up
  function layer() { return $('tfx-fly'); }
  function build() {
    const game = $('game');
    const table = game && game.querySelector('.table');
    if (!game || !table || $('tfx-fly')) return;
    const fly = doc.createElement('div');
    fly.id = 'tfx-fly'; fly.className = 'tfx-fly'; fly.setAttribute('aria-hidden', 'true');
    game.appendChild(fly);
    table.insertAdjacentHTML('afterbegin',
      '<div class="tfx-tray tfx-shoe" aria-hidden="true"><div class="card back tfx-anchor"></div></div>'
      + '<div class="tfx-tray tfx-discard" aria-hidden="true"><div class="tfx-pile"></div><div class="tfx-anchor"></div></div>'
      + '<div class="tfx-rack" aria-hidden="true"></div>');
  }

  /** True when card moves are animated right now. */
  function active() {
    if (!gsap || reduce()) return false;
    const g = $('game');
    return !!(g && !g.hidden && layer());
  }

  // Seconds per move, from the dealer speed in Settings (game.delay: 750 / 450 / 220 ms) and quick bot turns.
  function pace() {
    const g = getGame();
    const step = g ? g.delay * (g._botTurn ? g.botPace : 1) : 450;
    const fly = Math.max(0.14, Math.min(0.5, (step / 1000) * 0.85));
    return { fly, turn: Math.max(0.1, fly * 0.45), hole: Math.max(0.16, fly * 0.9), slide: Math.max(0.12, fly * 0.7), sweep: Math.max(0.18, fly * 0.8), stagger: 0.035 };
  }
  const ease = (dur) => `steps(${Math.max(3, Math.round(dur * STEP_FPS))})`;

  // ---------------------------------------------------------------- geometry
  /** Rect of el in the fly layer's own pixels (the stage layout scales #game, so screen px are converted). */
  function local(el) {
    const L = layer().getBoundingClientRect();
    const k = L.width / (layer().offsetWidth || 1) || 1;
    const r = el.getBoundingClientRect();
    return { x: (r.left - L.left) / k, y: (r.top - L.top) / k, w: r.width / k, h: r.height / k };
  }
  const anchor = (which) => doc.querySelector(`#game .tfx-${which} .tfx-anchor`);

  // A flyer is placed by its top-left corner and scaled about its centre, so x/y are corrected for the scale.
  function placeAt(f, rect, base) {
    const s = rect.w / base.w;
    return { x: rect.x - (base.w * (1 - s)) / 2, y: rect.y - (base.h * (1 - s)) / 2, scale: s };
  }
  const round2 = (v) => Math.round(parseFloat(v)) + 'px';   // whole pixels (a modifier returns a CSS value)

  function makeFlyer(html, back) {
    const t = doc.createElement('div');
    t.innerHTML = html.trim();
    const f = t.firstElementChild;
    f.classList.remove('fresh', 'tfx-wait');
    f.removeAttribute('data-cid');
    if (back) f.classList.add('back');
    layer().appendChild(f);
    flyers.add(f);
    return f;
  }
  function drop(f) { flyers.delete(f); f.remove(); }
  function release(cid) {
    waiting.delete(cid);
    doc.querySelectorAll(`#game .card[data-cid="${cid}"]`).forEach((el) => el.classList.remove('tfx-wait'));
    // re-render once so the hand's total catches up with the card that just landed
    if (!refresh) refresh = root.setTimeout(() => { refresh = 0; rerender(); }, 0);
  }

  /** A hand's total counts a card only once it has landed: until then the total shown before stays. */
  function holdTotals() {
    const boxes = [['d', $('dealer-cards'), $('dealer-total')]];
    doc.querySelectorAll('#seats .seat').forEach((seat) => seat.querySelectorAll('.hand').forEach((h, i) => {
      boxes.push([`${seat.dataset.seat}.${i}`, h.querySelector('.cards'), h.querySelector('.total')]);
    }));
    boxes.forEach(([key, cards, total]) => {
      if (!cards || !total) return;
      if (cards.querySelector('.tfx-wait')) total.textContent = shownTotal.get(key) || '';
      else shownTotal.set(key, total.textContent);
    });
  }

  /** Turns a flyer face up: squeezed to nothing and back, the face swapped in the middle. */
  function turnTimeline(f, dur, scale, lift) {
    const tl = gsap.timeline();
    tl.to(f, { scaleX: 0, y: `-=${lift}`, duration: dur / 2, ease: 'steps(2)' })
      .call(() => f.classList.remove('back'))
      .to(f, { scaleX: scale, y: `+=${lift}`, duration: dur / 2, ease: 'steps(2)' });
    return tl;
  }

  // ---------------------------------------------------------------- the moves
  function deal(el, cid) {
    const p = pace();
    const to = local(el);
    const src = anchor('shoe');
    const from = src ? local(src) : { x: to.x, y: to.y - 32, w: to.w, h: to.h };
    const faceUp = !el.classList.contains('back');
    const f = makeFlyer(el.outerHTML, true);
    const base = { w: f.offsetWidth || to.w, h: f.offsetHeight || to.h };
    const a = placeAt(f, from, base), b = placeAt(f, to, base);
    waiting.add(cid); el.classList.add('tfx-wait');
    const tl = gsap.timeline({ onComplete: () => { drop(f); release(cid); } });
    tl.fromTo(f, { x: a.x, y: a.y, scale: a.scale }, { x: b.x, y: b.y, scale: b.scale, duration: p.fly, ease: ease(p.fly), modifiers: { x: round2, y: round2 } });
    if (faceUp) tl.add(turnTimeline(f, p.turn, b.scale, 0));
  }

  function turnOver(el, cid) {
    const p = pace();
    const at = local(el);
    const f = makeFlyer(el.outerHTML, true);
    const base = { w: f.offsetWidth || at.w, h: f.offsetHeight || at.h };
    const a = placeAt(f, at, base);
    gsap.set(f, { x: round2(a.x), y: round2(a.y), scale: a.scale });
    waiting.add(cid); el.classList.add('tfx-wait');
    const tl = turnTimeline(f, p.hole, a.scale, Math.round(6 * a.scale));
    tl.eventCallback('onComplete', () => { drop(f); release(cid); });
  }

  function slide(el, from) {
    const r = el.getBoundingClientRect();
    const dx = from.sx - r.left, dy = from.sy - r.top;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    const k = r.width / (el.offsetWidth || 1) || 1;   // the seat's own scale (3D view) and the stage scale
    const p = pace();
    gsap.fromTo(el, { x: dx / k, y: dy / k }, { x: 0, y: 0, duration: p.slide, ease: ease(p.slide), modifiers: { x: round2, y: round2 }, clearProps: 'transform' });
  }

  function sweep(list) {
    if (!list.length) return;
    const p = pace();
    const src = anchor('discard');
    list.forEach((c, i) => {
      const f = makeFlyer(c.html, true);
      const base = { w: f.offsetWidth || c.rect.w, h: f.offsetHeight || c.rect.h };
      const a = placeAt(f, c.rect, base);
      const b = src ? placeAt(f, local(src), base) : a;
      gsap.fromTo(f, { x: a.x, y: a.y, scale: a.scale }, {
        x: b.x, y: b.y, scale: b.scale, duration: p.sweep, delay: i * p.stagger, ease: ease(p.sweep),
        modifiers: { x: round2, y: round2 },
        onComplete: () => { drop(f); discarded++; paintPile(); },
      });
    });
  }

  function paintPile() {
    const pile = doc.querySelector('#game .tfx-pile');
    if (!pile) return;
    const n = Math.min(6, Math.ceil(discarded / 6));
    if (pile.childElementCount === n) return;
    pile.innerHTML = Array.from({ length: n }, (_, i) => `<div class="card back" style="top:${-i * 2}px"></div>`).join('');
  }

  // ---------------------------------------------------------------- chips
  // Piles of chips carry data-pile (a key that follows them from one render to the next), data-from (where a new
  // pile comes from: "pile:<key>" when it is that pile moving, "owner" for the player's bankroll or a bot's seat,
  // "dealer"; several separated by |) and data-dest (where a pile that leaves the table goes: "owner" or "dealer").
  const waitingPiles = new Set();
  let chipPending = [];          // chips clicked in the rack, to hop onto a spot at the next render
  let quiet = false;             // the next render's piles just appear (a drag already put them there)
  let settleTok = null, settleAt = 0;
  let shownMoney = null, moneyTween = null;

  function settleTimes() {
    const g = getGame(); const d = g ? g.delay : 450;
    const t1 = 120, t2 = t1 + Math.max(350, d * 0.9);
    return { t1, t2, t3: t2 + Math.max(500, d * 1.2) };
  }
  /** Steps of the dealer settling a round, from the time it is first shown: 0 the results are up, 1 the lost bets
      are taken, 2 the wins are paid, 3 every pile goes home and the standing bets come back to their spots. */
  function settleStep(token) {
    if (!active()) return 3;
    const { t1, t2, t3 } = settleTimes();
    if (token !== settleTok) {
      settleTok = token; settleAt = Date.now();
      [t1, t2, t3].forEach((t) => root.setTimeout(() => rerender(), t + 10));
    }
    const t = Date.now() - settleAt;
    return t >= t3 ? 3 : t >= t2 ? 2 : t >= t1 ? 1 : 0;
  }
  /** Ends the settling at once (the player starts betting). */
  function finishSettle() { settleAt = 0; }
  const settling = () => settleTok && active() && Date.now() - settleAt < settleTimes().t3;

  function chipIn(seat, value) {
    if (seat === null) { chipPending = []; return; }
    if (active()) chipPending.push({ seat, value });
  }
  function still() { quiet = true; }

  const seatOf = (key) => { const m = /^s(\d+)/.exec(key); return m ? +m[1] : -1; };
  function ownerRect(key) {
    const g = getGame(); const s = g && g.seats[seatOf(key)];
    const el = s && s.type === 'player' ? $('bankroll') : doc.querySelector(`#seats .seat[data-seat="${seatOf(key)}"] .seat-head`);
    return el ? local(el) : null;
  }
  // The dealer's chip rack painted in the scene, or on the plain table the dealer's cards.
  function dealerRect() {
    const rack = doc.querySelector('#game .tfx-rack');
    const el = rack && rack.offsetWidth ? rack : $('dealer-cards');
    return el ? local(el) : null;
  }
  // A spot of size w x h centred on a rect.
  const centred = (r, w, h) => ({ x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h });

  function makePileFlyer(html) {
    const t = doc.createElement('div');
    t.innerHTML = html.trim();
    const f = t.firstElementChild;
    f.removeAttribute('data-pile'); f.removeAttribute('style'); f.classList.remove('tfx-wait');
    f.classList.add('tfx-pile-fly');
    layer().appendChild(f);
    flyers.add(f);
    return f;
  }
  /** Moves a copy of a pile from one rect to another; `small` shrinks it on the way to a bankroll or rack. */
  function flyPile(html, from, to, opts) {
    const p = pace();
    const f = makePileFlyer(html);
    const base = { w: f.offsetWidth || from.w, h: f.offsetHeight || from.h };
    const a = placeAt(f, from, base), b = placeAt(f, to, base);
    const dur = Math.max(0.2, p.fly * 1.1);
    gsap.fromTo(f, { x: a.x, y: a.y, scale: a.scale }, {
      x: b.x, y: b.y, scale: b.scale, duration: dur, delay: opts.delay || 0, ease: ease(dur),
      modifiers: { x: round2, y: round2 },
      onComplete: () => { drop(f); if (opts.done) opts.done(); },
    });
  }

  function pilesOnTable() { return [...doc.querySelectorAll('#seats [data-pile]')]; }
  function snapPiles() {
    const m = new Map();
    pilesOnTable().forEach((el) => m.set(el.dataset.pile, { rect: local(el), html: el.outerHTML, dest: el.dataset.dest }));
    return m;
  }

  function movePiles(prev) {
    const now = pilesOnTable();
    const here = new Map(now.map((el) => [el.dataset.pile, el]));
    const used = new Set();
    const hush = quiet; quiet = false;
    const clicked = new Set(chipPending.map((c) => `s${c.seat}spot`));
    let n = 0;
    now.forEach((el) => {
      const key = el.dataset.pile;
      if (waitingPiles.has(key)) { el.classList.add('tfx-wait'); return; }
      if (prev.has(key) || hush || clicked.has(key)) return;
      const to = local(el);
      let from = null;
      for (const src of (el.dataset.from || '').split('|')) {
        if (src.startsWith('pile:')) {
          const k = src.slice(5);
          if (prev.has(k) && !here.has(k)) { from = prev.get(k).rect; used.add(k); break; }
        } else if (src === 'owner') {
          const r = ownerRect(key); if (r) { from = centred(r, to.w * 0.6, to.h * 0.6); break; }
        } else if (src === 'dealer') {
          const r = dealerRect(); if (r) { from = centred(r, to.w * 0.7, to.h * 0.7); break; }
        }
      }
      if (!from) return;
      waitingPiles.add(key); el.classList.add('tfx-wait');
      flyPile(el.outerHTML, from, to, { tag: 'in:' + key, delay: (n++) * 0.06, done: () => {
        waitingPiles.delete(key);
        doc.querySelectorAll(`#seats [data-pile="${key}"]`).forEach((e) => e.classList.remove('tfx-wait'));
      } });
    });
    // Piles that left the table go to the dealer (lost) or home (won, pushed, taken back).
    let m = 0;
    prev.forEach((c, key) => {
      if (here.has(key) || used.has(key) || hush) return;
      const r = c.dest === 'dealer' ? dealerRect() : ownerRect(key);
      if (!r) return;
      const k = c.dest === 'dealer' ? 0.7 : 0.6;
      flyPile(c.html, c.rect, centred(r, c.rect.w * k, c.rect.h * k), { tag: 'out:' + key + ':' + c.dest, delay: (m++) * 0.06 });
    });
    // Chips clicked in the rack hop onto their spot.
    const px = root.PixelSprites;
    chipPending.forEach(({ seat, value }) => {
      const btn = doc.querySelector(`.chip-btn[data-chip="${value}"] svg`) || doc.querySelector(`.chip-btn[data-chip="${value}"]`);
      const spot = here.get(`s${seat}spot`);
      if (!btn || !spot || !px) return;
      const from = local(btn); const s = local(spot);
      const w = Math.min(from.w, s.w * 0.8);
      flyPile(`<div class="tfx-chip">${px.chip(value)}</div>`, from, { x: s.x + s.w / 2 - w / 2, y: s.y - w * 0.3, w, h: w }, {});
    });
    chipPending = [];
  }

  /** The bankroll counts up or down to its new value; while the dealer settles it waits for the chips to get home. */
  function money(el, value, fmt) {
    if (!el) return;
    if (!active() || shownMoney === null) {
      if (moneyTween) { moneyTween.kill(); moneyTween = null; }
      shownMoney = value; el.textContent = fmt(value); return;
    }
    if (settling()) { el.textContent = fmt(shownMoney); return; }
    if (moneyTween && moneyTween.vars.data === value) return;
    if (!moneyTween && shownMoney === value) { el.textContent = fmt(value); return; }
    if (moneyTween) moneyTween.kill();
    const o = { v: shownMoney };
    const since = Date.now() - settleAt - settleTimes().t3;
    const wait = since >= 0 && since < 600 ? Math.max(0, pace().fly * 1.1 - since / 1000) : 0;
    moneyTween = gsap.to(o, {
      v: value, duration: 0.45, delay: wait, ease: 'steps(9)', data: value,
      onUpdate: () => { shownMoney = Math.round(o.v * 2) / 2; el.textContent = fmt(shownMoney); },
      onComplete: () => { shownMoney = value; el.textContent = fmt(value); moneyTween = null; },
    });
  }

  // ---------------------------------------------------------------- render hooks
  function cardsOnTable() { return [...doc.querySelectorAll('#dealer-cards .card[data-cid], #seats .card[data-cid]')]; }

  function before() {
    snap = null;
    if (!active()) return;
    snap = new Map();
    cardsOnTable().forEach((el) => {
      const r = el.getBoundingClientRect();
      snap.set(el.dataset.cid, { sx: r.left, sy: r.top, rect: local(el), back: el.classList.contains('back'), html: el.outerHTML, dealer: !!el.closest('#dealer-cards') });
    });
    pileSnap = snapPiles();
  }

  function after() {
    const g = getGame();
    if (g && g.shoe) {   // a fresh shoe empties the discard tray
      if (lastShoe !== null && g.shoe.remaining > lastShoe) { discarded = 0; paintPile(); }
      lastShoe = g.shoe.remaining;
    }
    const prev = snap; snap = null;
    const piles = pileSnap; pileSnap = null;
    if (!prev || !active()) { shownTotal.clear(); chipPending = []; quiet = false; return; }
    const now = cardsOnTable();
    const here = new Set();
    now.forEach((el) => {
      const cid = el.dataset.cid; here.add(cid);
      if (waiting.has(cid)) { el.classList.add('tfx-wait'); return; }
      const was = prev.get(cid);
      if (!was) deal(el, cid);
      else if (was.back && !el.classList.contains('back')) turnOver(el, cid);
      else slide(el, was);
    });
    // Cards that left the table go to the discard tray: players' hands from first base on, then the dealer's.
    const gone = [];
    prev.forEach((c, cid) => { if (!here.has(cid) && !waiting.has(cid)) gone.push(c); });
    sweep(gone.filter((c) => !c.dealer).concat(gone.filter((c) => c.dealer)));
    holdTotals();
    movePiles(piles || new Map());
  }

  /** Busted hands are taken away after a short look, like at a casino. ui.js shows no cards for them once this is true. */
  function bustTaken(hand) {
    if (!hand || hand.result !== 'bust') return false;
    const now = Date.now();
    const g = getGame();
    const wait = Math.max(700, (g ? g.delay : 450) * 2);
    if (!bustSeen.has(hand)) {
      bustSeen.set(hand, now);
      root.setTimeout(() => rerender(), wait + 20);
      return false;
    }
    return now - bustSeen.get(hand) >= wait;
  }

  /** Clears everything in flight (leaving the table, starting a mode). */
  function reset() {
    flyers.forEach((f) => { if (gsap) gsap.killTweensOf(f); f.remove(); });
    flyers.clear(); waiting.clear(); shownTotal.clear(); snap = null;
    waitingPiles.clear(); chipPending = []; quiet = false; pileSnap = null; settleTok = null;
    if (moneyTween) moneyTween.kill();
    moneyTween = null; shownMoney = null;
    discarded = 0; lastShoe = null; paintPile();
  }

  function init(opts) {
    getGame = opts.game || getGame;
    rerender = opts.render || rerender;
    build();
  }

  root.TableFX = { init, active, before, after, bustTaken, reset, settleStep, finishSettle, chipIn, still, money };
})(window);
