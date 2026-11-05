/* Dealer speech bubbles. Watches the running game and lets the scene's dealer say a line from js/phrases.js
   (window.DealerPhrases) in a pixel comic bubble over their head. Only Challenge and Endless have a dealer on screen,
   so Practice stays quiet. Each event speaks only with its `chance`, so the dealer doesn't comment on every hand.
   ui.js calls DealerTalk.start(game, sceneId) in startMode and DealerTalk.stop() in showMenu; everything else hooks
   into the game's own onUpdate/onRoundEnd callbacks here. */
(function (root) {
  'use strict';

  const doc = root.document;
  const BJ = root.Blackjack;
  // Higher priority may cut in on a bubble that's still fresh; lower or equal waits its turn (i.e. is dropped).
  const PRIO = {
    idle: 0, greet: 1, shuffle: 1, insurance: 2, double: 2, split: 2, surrender: 2, bigBet: 2,
    playerBust: 3, bust22: 3, dealerBust: 3, push: 3, playerWin: 3, dealerWin: 3, lowChips: 3,
    winStreak: 4, lossStreak: 4, playerBJ: 5, dealerBJ: 5,
  };
  const SHOUT = new Set(['playerBJ', 'dealerBJ', 'bigBet', 'winStreak']);
  const FRESH_MS = 2600;   // a bubble younger than this is only replaced by a more important one
  const HOLD_MS = 3200;    // how long a bubble stays after its text has finished typing
  const TYPE_MS = 32;

  let st = null;           // per-game state
  let el = null;
  let shown = { at: 0, prio: -1, visible: false };
  let typeT = null; let hideT = null; let idleT = null; let greetT = null; let secretT = null;

  const reduceMotion = () => root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const phrases = () => root.DealerPhrases;
  // ---------------------------------------------------------------- secrets
  // Rare timed lines (DealerPhrases.SECRETS), not tied to events: between hands, once a minute, each secret of this
  // scene rolls its `chance`; each plays at most once per session. Seen ids are saved, and the first sighting fires
  // document event 'dealertalk:secret' { id, seen, total } (achievements.js unlocks Off the Record at seen = total).
  const SECRET_KEY = 'blackjack-dealertalk-v1';
  const SECRET_TICK_MS = 60000;
  const RANK_NAME = { A: 'ace', J: 'jack', Q: 'queen', K: 'king', 2: 'two', 3: 'three', 4: 'four', 5: 'five', 6: 'six', 7: 'seven', 8: 'eight', 9: 'nine', 10: 'ten' };
  const SUIT_NAME = { '♠': 'spades', '♥': 'hearts', '♦': 'diamonds', '♣': 'clubs' };
  const cardName = (c) => `the ${RANK_NAME[c.rank]} of ${SUIT_NAME[c.suit]}`;
  const secretIds = () => { const S = (phrases() && phrases().SECRETS) || {}; return Object.keys(S).map((k) => S[k].id); };
  function loadSeen() {
    try {
      const v = JSON.parse(root.localStorage.getItem(SECRET_KEY) || 'null');
      return v && Array.isArray(v.seenSecrets) ? v.seenSecrets.filter((x) => typeof x === 'string') : [];
    } catch (e) { return []; }
  }
  function markSeen(id) {
    const seen = loadSeen();
    if (seen.includes(id)) return;
    seen.push(id);
    try { root.localStorage.setItem(SECRET_KEY, JSON.stringify({ seenSecrets: seen })); } catch (e) { /* storage blocked */ }
    const ids = secretIds();
    doc.dispatchEvent(new CustomEvent('dealertalk:secret', { detail: { id, seen: seen.filter((x) => ids.includes(x)), total: ids.length } }));
  }
  // Zyx names the real next card, so only when the next deal won't reshuffle first.
  function shoeStays(g) { return g.shoe.roundsDealt < g.rules.roundsPerShoe && g.shoe.remaining >= g.rules.reshuffleMinCards; }

  function secretTick() {
    if (!st) return;
    const g = st.game;
    const overlay = doc.getElementById('overlay');
    if (g.phase !== 'betting' || doc.hidden || (overlay && !overlay.hidden) || shown.visible || st.seq) return;
    const S = phrases().SECRETS || {};
    const mine = Object.keys(S).filter((k) => k === st.scene || (S[k].scene === st.scene && S[k].glitch)).map((k) => S[k]);
    for (const s of mine) {
      if (st.secretsDone.has(s.id)) continue;
      if ((s.lines || []).some((t) => t.includes('{next}')) && !shoeStays(g)) continue;
      if (Math.random() < (s.chance || 0.02)) { playSecret(s); return; }
    }
  }

  function playSecret(s) {
    const g = st.game;
    st.secretsDone.add(s.id);
    markSeen(s.id);
    const next = g.shoe.cards[g.shoe.cards.length - 1];
    let wrong = next;
    while (!wrong || (next && wrong.rank === next.rank)) wrong = { rank: ['A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K'][Math.floor(Math.random() * 13)], suit: Object.keys(SUIT_NAME)[Math.floor(Math.random() * 4)] };
    const fill = (t) => t.replace('{next}', next ? cardName(next) : 'a card').replace('{wrong}', cardName(wrong));
    let lines = s.lines || [];
    if (s.glitch) {   // a normal line of this dealer that rots as it's said
      const P = phrases();
      const pool = [].concat(...P.EVENTS.map((e) => P[st.scene][e.id] || []));
      lines = [pool[Math.floor(Math.random() * pool.length)]].concat(s.after || []);
    }
    lines = lines.map(fill);
    let i = 0;
    const step = () => {
      if (!st) return;
      if (i >= lines.length) { st.seq = null; return; }
      const t = lines[i];
      const rot = i === 0 && !!s.glitch;
      say(t, 2, rot ? 'glitch' : 'secret', rot);
      i++;
      st.seq = root.setTimeout(step, t.length * TYPE_MS + (rot ? 3200 : 2200));
    };
    shown.visible = false;
    step();
  }

  function garble(text, amount) {
    const junk = '!@#$%&*?<>/\\|~^01x7F';
    return text.split('').map((c) => (c !== ' ' && Math.random() < amount) ? junk[Math.floor(Math.random() * junk.length)] : c).join('');
  }
  function rotText(out, text, done) {
    let chars = text; let n = 0;
    typeT = root.setInterval(() => {
      n++;
      chars = garble(chars, 0.08 + n * 0.03);
      out.textContent = chars;
      if (n >= 20) { root.clearInterval(typeT); done(); }
    }, 70);
  }

  // Sitting down in all 4 pieces (back, felt, chips, faces) of one secret set swaps the greeting.
  function fullSecretSet() {
    const C = root.Cosmetics;
    if (!C || !C.equipped || !C.get) return null;
    const eq = C.equipped();
    let set = null;
    for (const t of ['back', 'felt', 'chips', 'face']) {
      const it = C.get(eq[t]);
      if (!it || !it.set || (it.rarity !== 'secret' && it.rarity !== 'insanity')) return null;
      if (set && it.set !== set) return null;
      set = it.set;
    }
    return set;
  }
  function greet() {
    if (!st) return;
    const set = fullSecretSet();
    const G = phrases().SET_GREETINGS || {};
    const line = set && G[set] && G[set][st.scene];
    if (line) say(line, 1, 'secret'); else trigger('greet');
  }


  const chanceOf = (ev) => { const e = (phrases().EVENTS || []).find((x) => x.id === ev); return e && e.chance != null ? e.chance : 1; };

  // ---------------------------------------------------------------- lifecycle
  function start(game, sceneId) {
    stop();
    const P = phrases();
    if (!game || !sceneId || !P || !P[sceneId]) return;
    st = {
      game, scene: sceneId, hand: -1, seen: new Set(), last: {},
      streak: 0, start: game.bankroll, lowSaid: false, secretsDone: new Set(), seq: null,
    };
    const onUpdate = game.onUpdate; const onRoundEnd = game.onRoundEnd;
    game.onUpdate = (g) => { onUpdate(g); try { observe(g); } catch (e) { console.error(e); } };
    game.onRoundEnd = (g) => { onRoundEnd(g); try { roundEnd(g); } catch (e) { console.error(e); } };
    // wait for the scene's intro to settle before saying hello
    greetT = root.setTimeout(greet, 2400);
    secretT = root.setInterval(secretTick, SECRET_TICK_MS);
    scheduleIdle();
  }

  function stop() {
    [typeT, hideT, idleT, greetT, secretT].forEach((t) => { root.clearTimeout(t); root.clearInterval(t); });
    if (st && st.seq) root.clearTimeout(st.seq);
    st = null;
    hide(true);
  }

  // ---------------------------------------------------------------- watching the game
  const playerHands = (g) => {
    const out = [];
    g.seats.forEach((s) => { if (s.type === 'player') s.hands.forEach((h, i) => out.push({ seat: s, hand: h, key: `${s.index}.${i}` })); });
    return out;
  };
  const once = (key) => { if (st.seen.has(key)) return false; st.seen.add(key); return true; };

  function observe(g) {
    if (!st || g !== st.game) return;
    if (g.handNumber !== st.hand && g.phase !== 'betting') {
      st.hand = g.handNumber;
      st.seen = new Set();
      root.clearTimeout(idleT);
      if (g.seats.some((s) => s.type === 'player' && s.bet >= g.rules.maxBet)) trigger('bigBet');
    }
    if (g.phase === 'betting') return;

    if (g.phase === 'dealing' && g.shoe.roundsDealt === 0 && once('shuffle')) trigger('shuffle');
    if (g.phase === 'insurance' && once('insurance')) trigger('insurance');

    const dealerShown = !g.dealer.holeHidden;
    const dealerBJ = dealerShown && g.dealer.cards.length === 2 && BJ.isBlackjack(g.dealer.cards);
    for (const { seat, hand, key } of playerHands(g)) {
      if (hand.natural && !dealerBJ && (g.phase === 'playing' || g.phase === 'dealer') && once('bj')) trigger('playerBJ');
      if (hand.doubled && once(`d${key}`)) trigger('double');
      if (hand.surrendered && once(`r${key}`)) trigger('surrender');
      const t = BJ.handValue(hand.cards).total;
      if (t > 21 && once(`b${key}`)) trigger(t === 22 ? 'bust22' : 'playerBust');
      if (seat.hands.length > 1 && once(`s${seat.index}.${seat.hands.length}`)) trigger('split');
    }
    if (g.phase === 'dealer' && BJ.handValue(g.dealer.cards).total > 21 && playerHands(g).length && once('dbust')) trigger('dealerBust');
  }

  function roundEnd(g) {
    if (!st || g !== st.game) return;
    const mine = playerHands(g);
    if (mine.length) {
      const net = g.lastRoundNet || 0;
      st.streak = net > 0 ? Math.max(1, st.streak + 1) : net < 0 ? Math.min(-1, st.streak - 1) : 0;
      const dealerBJ = g.dealer.cards.length === 2 && BJ.isBlackjack(g.dealer.cards);
      if (dealerBJ) trigger('dealerBJ');
      else if (st.streak === 3) trigger('winStreak');
      else if (st.streak === -3) trigger('lossStreak');
      else if (net > 0) trigger('playerWin');
      else if (net < 0) trigger('dealerWin');
      else trigger('push');
    }
    if (g.bankroll < st.start * 0.1 && !g.broke) { if (!st.lowSaid) { st.lowSaid = true; trigger('lowChips', true); } }
    else if (g.bankroll > st.start * 0.2) st.lowSaid = false;
    scheduleIdle();
  }

  function scheduleIdle() {
    root.clearTimeout(idleT);
    if (!st) return;
    idleT = root.setTimeout(() => {
      if (!st) return;
      const overlay = doc.getElementById('overlay');
      const busy = st.game.phase !== 'betting' || doc.hidden || (overlay && !overlay.hidden);
      if (!busy) trigger('idle');
      scheduleIdle();
    }, 9000 + Math.random() * 7000);
  }

  // ---------------------------------------------------------------- speaking
  function trigger(ev, sure) {
    if (!st) return;
    const lines = (phrases()[st.scene] || {})[ev];
    if (!lines || !lines.length) return;
    if (!sure && Math.random() >= chanceOf(ev)) return;
    const prio = PRIO[ev] || 0;
    if (shown.visible && Date.now() - shown.at < FRESH_MS && prio <= shown.prio) return;
    let i;
    do { i = Math.floor(Math.random() * lines.length); } while (lines.length > 1 && st.last[ev] === i);
    st.last[ev] = i;
    if (st.seq) { root.clearTimeout(st.seq); st.seq = null; }
    say(lines[i], prio, SHOUT.has(ev) ? 'shout' : ev === 'idle' ? 'soft' : '');
  }

  function bubble() {
    if (el && el.isConnected) return el;
    el = doc.createElement('div');
    el.id = 'dealer-bubble';
    el.setAttribute('role', 'status');
    el.setAttribute('aria-live', 'polite');
    el.hidden = true;
    el.innerHTML = '<span class="db-who"></span><span class="db-say"></span><i class="db-tail" aria-hidden="true"></i>';
    doc.body.appendChild(el);
    return el;
  }

  // The dealer is either painted into the stage picture or standing in its own band (narrow windows).
  function dealerBox() {
    const a = doc.querySelector('#scene-dealer .dealer-sprite');
    const b = doc.querySelector('#scene-backdrop .dl-body');
    for (const n of [a, b]) {
      if (!n) continue;
      const r = n.getBoundingClientRect();
      if (r.width > 4 && r.height > 4) return r;
    }
    return null;
  }

  function place() {
    if (!el || el.hidden) return;
    const r = dealerBox();
    if (!r) { hide(true); return; }
    const mouthY = r.top + r.height * (12 / 28);
    const rightX = r.left + r.width * (15 / 24);   // tail tip when speaking to the right
    const leftX = r.left + r.width * (9 / 24);     // tail tip when speaking to the left
    const roomRight = root.innerWidth - rightX - 12;
    const roomLeft = leftX - 12;
    el.style.bottom = `${Math.round(root.innerHeight - mouthY)}px`;
    el.style.maxWidth = `${Math.round(Math.min(320, Math.max(roomRight, roomLeft)))}px`;
    const flip = roomRight < Math.min(260, roomLeft);   // speak to the side with more room
    el.classList.toggle('db-flip', flip);
    el.style.left = flip ? 'auto' : `${Math.round(rightX)}px`;
    el.style.right = flip ? `${Math.round(root.innerWidth - leftX)}px` : 'auto';
  }

  function say(text, prio, kind, rot) {
    const b = bubble();
    root.clearInterval(typeT); root.clearTimeout(hideT);
    const D = root.ScenarioDealers && root.ScenarioDealers.DEALERS[st.scene];
    b.className = kind ? `db-${kind}` : '';
    b.querySelector('.db-who').textContent = D ? D.name : '';
    const out = b.querySelector('.db-say');
    shown = { at: Date.now(), prio, visible: true };
    if (root.GameAudio) root.GameAudio.voice(st.scene, text);   // the dealer's blip voice (js/audio.js)
    b.hidden = false;
    out.textContent = text;          // full text first, so the bubble is placed at its final size
    place();
    if (!dealerBox()) return;
    void b.offsetWidth; b.classList.add('db-pop');
    const finish = () => { hideT = root.setTimeout(() => hide(), HOLD_MS); };
    if (reduceMotion()) { if (rot) out.textContent = garble(text, 0.5); finish(); return; }
    // type it out; the untyped rest stays in place but invisible, so the bubble never changes size
    const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    let i = 0;
    out.innerHTML = `<span class="db-ghost">${esc(text)}</span>`;
    typeT = root.setInterval(() => {
      i++;
      out.innerHTML = `${esc(text.slice(0, i))}<span class="db-ghost">${esc(text.slice(i))}</span>`;
      if (i >= text.length) { root.clearInterval(typeT); out.textContent = text; if (rot) rotText(out, text, finish); else finish(); }
    }, TYPE_MS);
  }

  function hide(now) {
    root.clearInterval(typeT); root.clearTimeout(hideT);
    shown.visible = false;
    if (!el) return;
    if (now || reduceMotion()) { el.hidden = true; return; }
    el.classList.add('db-out');
    hideT = root.setTimeout(() => { el.hidden = true; el.classList.remove('db-out'); }, 180);
  }

  root.addEventListener('resize', place);
  root.addEventListener('scroll', place, { passive: true });

  root.DealerTalk = {
    start, stop, say: (ev) => trigger(ev, true),
    /** Ids of the secret lines (all of them heard = the Off the Record achievement). */
    get SECRET_IDS() { return secretIds(); },
    /** Secret line ids this player has seen, from the save. */
    secretsSeen: () => { const ids = secretIds(); return loadSeen().filter((x) => ids.includes(x)); },
    /** Testing aid: play a scene's secret now, e.g. DealerTalk.secret('orbit', true) for the glitch. */
    secret: (scene, glitch) => { const S = phrases().SECRETS; const k = Object.keys(S).find((x) => glitch ? S[x].glitch && S[x].scene === scene : x === scene); if (st && k) playSecret(S[k]); },
  };
})(window);
