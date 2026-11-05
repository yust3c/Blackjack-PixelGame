/* Game sounds: plays js/audio.js effects for what happens at the table, and owns the Settings screen.
   Like js/dealertalk.js it watches the running game through its onUpdate/onRoundEnd callbacks, so the
   engine knows nothing about sound. ui.js calls GameSounds.start(game) in startMode, GameSounds.stop()
   and GameSounds.closeSettings() in showMenu, and GameSounds.openSettings() from the menu button.
   Settings are saved under SaveData.KEYS.settings (see js/save.js). */
(function (root) {
  'use strict';

  const doc = root.document;
  const A = root.GameAudio;
  if (!A) return;
  const BJ = root.Blackjack;
  const KEY = (root.SaveData && root.SaveData.KEYS.settings) || 'blackjack-settings-v1';

  // ---------------------------------------------------------------- settings
  try { A.loadSettings(JSON.parse(root.localStorage.getItem(KEY) || 'null')); } catch (e) { /* defaults */ }
  A.onChange(() => {
    try { root.localStorage.setItem(KEY, JSON.stringify(A.settings)); } catch (e) { /* storage blocked */ }
    if (section && !section.hidden) renderSettings();
    if (badge) renderBadge();
  });

  // ---------------------------------------------------------------- secret set sounds follow the equipped cosmetics
  function updatePack() {
    const C = root.Cosmetics;
    if (!C) return;
    const eq = C.equipped();
    const item = (t) => (eq[t] ? C.get(eq[t]) : null);
    const p = A.packFromEquipped({ back: item('back'), face: item('face'), felt: item('felt'), chips: item('chips') });
    A.setPack(p && p.set, p && p.full);
  }
  let lastClick = 0;
  doc.addEventListener('cosmetics:change', () => {
    updatePack();
    if (Date.now() - lastClick < 600) A.play('equip');   // only when the player equipped something, not at start-up
  });
  setTimeout(updatePack, 0);

  // ---------------------------------------------------------------- achievements
  doc.addEventListener('achievement:unlocked', (e) => {
    const a = e.detail && e.detail.achievement;
    A.play(a && a.rarity === 'insanity' ? 'insanity_unlock' : a && (a.rarity === 'secret' || a.secret) ? 'secret_unlock' : 'achievement');
  });

  // ---------------------------------------------------------------- menu clicks
  // Table buttons (chips, deal, hit...) get their sound from the game itself, below.
  const TABLE = ['act', 'chip', 'deal', 'ins', 'clear', 'bot', 'leave', 'sit'];
  doc.addEventListener('click', (e) => {
    lastClick = Date.now();
    const b = e.target.closest('button, .diff');
    if (!b || b.disabled) return;
    const d = b.dataset;
    if (TABLE.some((k) => d[k] !== undefined) || d.sfxNone !== undefined) return;
    if (d.loreBack !== undefined || b.id === 'to-menu' || /^(Back|Close|Menu|Stay)$/i.test(b.textContent.trim())) A.play('ui_back');
    else A.play('ui_click');
  }, true);
  doc.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const b = e.target.closest('#menu .btn, #menu .diff, #settings .btn, #settings .snd-switch');
    if (b && !b.contains(e.relatedTarget)) A.play('ui_hover');
  });

  // ---------------------------------------------------------------- the table
  let st = null;
  const pan = (seatIndex) => (seatIndex - 3) * 0.2;      // seats spread left to right
  const total = (cards) => BJ.handValue(cards).total;

  function snap(g) {
    const hands = {};
    g.seats.forEach((s) => s.hands.forEach((h, i) => {
      hands[`${s.index}.${i}`] = { n: h.cards.length, doubled: h.doubled, surrendered: h.surrendered, insurance: h.insurance, done: h.done, over: total(h.cards) > 21 };
    }));
    return {
      phase: g.phase, dealerN: g.dealer.cards.length, hole: g.dealer.holeHidden, rounds: g.shoe.roundsDealt,
      hands, counts: g.seats.map((s) => s.hands.length), bets: g.seats.map((s) => s.bet),
    };
  }

  function observe(g) {
    const prev = st.prev, now = snap(g);
    st.prev = now;
    if (!prev) return;
    if (prev.phase === 'betting' && now.phase !== 'betting') {
      if (now.rounds < prev.rounds) { A.play('shuffle'); setTimeout(() => A.play('deal'), 900); } else A.play('deal');
    }
    if (now.phase === 'betting') {
      g.seats.forEach((s, i) => {
        if (s.type !== 'player') return;
        if (now.bets[i] > prev.bets[i]) A.play('chip_place', { pan: pan(i) });
        else if (now.bets[i] < prev.bets[i]) A.play('ui_back');
      });
      return;
    }
    if (now.dealerN > prev.dealerN) A.play('card_deal', { pan: 0 });
    if (prev.hole && !now.hole && now.dealerN === prev.dealerN) A.play('card_flip', { pan: 0 });
    g.seats.forEach((s) => {
      const mine = s.type === 'player';
      if (mine && now.phase === 'playing' && prev.counts[s.index] >= 1 && now.counts[s.index] > prev.counts[s.index]) A.play('split', { pan: pan(s.index) });
      s.hands.forEach((h, i) => {
        const k = `${s.index}.${i}`, a = prev.hands[k], b = now.hands[k];
        if (!a) return;
        if (b.n > a.n) A.play('card_deal', { pan: pan(s.index) });
        if (!mine) return;
        if (b.doubled && !a.doubled) A.play('double', { pan: pan(s.index) });
        else if (now.phase === 'playing' && b.n > a.n && a.n >= 2 && !b.doubled && now.counts[s.index] === prev.counts[s.index]) A.play('hit');
        if (b.surrendered && !a.surrendered) A.play('surrender');
        if (b.insurance && !a.insurance) A.play('insurance');
        if (b.over && !a.over) setTimeout(() => A.play('bust'), 180);
        else if (b.done && !a.done && !h.natural && !b.over && !b.doubled && !b.surrendered && b.n === a.n) A.play('stand');
      });
    });
  }

  function roundEnd(g) {
    st.prev = snap(g);
    const mine = [];
    g.seats.forEach((s) => { if (s.type === 'player') s.hands.forEach((h) => mine.push(h)); });
    if (!mine.length) return;
    const has = (r) => mine.some((h) => h.result === r);
    const net = mine.reduce((n, h) => n + (h.net || 0), 0);
    const dealerBJ = g.dealer.cards.length === 2 && BJ.isBlackjack(g.dealer.cards);
    let sting = null;
    if (has('blackjack')) sting = 'blackjack';
    else if (has('win')) sting = 'win';
    else if (dealerBJ) sting = 'dealer_blackjack';
    else if (mine.every((h) => h.result === 'push')) sting = 'push';
    else if (!mine.every((h) => h.result === 'bust')) sting = has('lose') || has('surrender') ? 'lose' : 'push';   // busts already played their sound
    later(() => { if (sting) A.play(sting); }, 350);
    if (net > 0) later(() => A.play('chip_collect'), sting === 'blackjack' ? 1300 : 900);
    if (g.broke) later(() => A.play('broke'), 1400);
  }
  const later = (fn, ms) => { const g = st && st.game; setTimeout(() => { if (st && st.game === g) fn(); }, ms); };

  function start(game) {
    stop();
    if (!game || !BJ) return;
    st = { game, prev: null };
    const onUpdate = game.onUpdate, onRoundEnd = game.onRoundEnd;
    game.onUpdate = (g) => { onUpdate(g); try { if (st && st.game === g) observe(g); } catch (e) { console.error(e); } };
    game.onRoundEnd = (g) => { onRoundEnd(g); try { if (st && st.game === g) roundEnd(g); } catch (e) { console.error(e); } };
    st.prev = snap(game);
  }
  function stop() { st = null; }

  // ---------------------------------------------------------------- Settings screen
  let section = null, badge = null;
  const ROWS = [
    ['master', 'Master volume'], ['music', 'Music', 'Music is coming in a later update.'], ['sfx', 'Sound effects'],
  ];
  function openSettings() {
    if (!section) {
      section = doc.getElementById('settings') || doc.body.appendChild(Object.assign(doc.createElement('section'), { id: 'settings', className: 'menu lore' }));
      section.setAttribute('aria-label', 'Settings');
      section.addEventListener('input', (e) => { const s = e.target.closest('input[type=range]'); if (s) { A.setSetting(s.dataset.key, s.value / 100); clearTimeout(section._t); if (s.dataset.key !== 'music') section._t = setTimeout(() => A.play('chip_place'), 60); } });
      section.addEventListener('click', (e) => { const b = e.target.closest('.snd-switch'); if (b) { A.setSetting(b.dataset.key, !A.settings[b.dataset.key]); A.play('ui_toggle'); } });
    }
    ['menu', 'game', 'lore'].forEach((id) => { const el = doc.getElementById(id); if (el) el.hidden = true; });
    section.hidden = false;
    renderSettings(true);
    root.scrollTo(0, 0);
  }
  function closeSettings() { if (section) section.hidden = true; }
  function renderSettings(full) {
    const s = A.settings;
    if (full || !section.querySelector('.snd-panel')) {
      section.innerHTML = `
        <div class="lore-head"><button class="btn btn-ghost" data-lore-back>Back</button><h1>SETTINGS</h1></div>
        <div class="snd-panel">
          <h2>Sound</h2>
          ${ROWS.map(([k, label, note]) => `<div class="snd-row"><label for="snd-${k}">${label}${note ? `<span class="snd-note">${note}</span>` : ''}</label>
            <input id="snd-${k}" type="range" min="0" max="100" step="5" data-key="${k}"><output for="snd-${k}"></output></div>`).join('')}
          <div class="snd-row snd-toggle"><span class="snd-label">Mute everything<span class="snd-note">Shortcut: press M anywhere.</span></span>
            <button class="snd-switch danger" data-key="muted" aria-pressed="false"></button></div>
          <div class="snd-row snd-toggle"><span class="snd-label">Secret set sounds<span class="snd-note">Secret card backs, faces and full sets change the sounds.</span></span>
            <button class="snd-switch" data-key="setSounds" aria-pressed="true"></button></div>
        </div>`;
    }
    section.querySelectorAll('input[type=range]').forEach((r) => {
      const v = Math.round(s[r.dataset.key] * 100);
      if (doc.activeElement !== r) r.value = v;
      r.style.setProperty('--fill', v + '%');
      r.nextElementSibling.textContent = v + '%';
      r.closest('.snd-row').classList.toggle('dim', s.muted);
    });
    section.querySelectorAll('.snd-switch').forEach((b) => { const on = !!s[b.dataset.key]; b.setAttribute('aria-pressed', on); b.textContent = on ? 'On' : 'Off'; });
  }

  // A small speaker in the corner shows when sound is muted (M toggles it).
  function renderBadge() {
    badge.hidden = !A.settings.muted;
  }
  function makeBadge() {
    badge = doc.createElement('button');
    badge.className = 'snd-muted'; badge.title = 'Sound is muted. Click or press M to unmute.'; badge.dataset.sfxNone = '';
    badge.innerHTML = `<svg viewBox="0 0 11 9" shape-rendering="crispEdges" aria-hidden="true"><path fill="currentColor" d="M0 3h2v3H0zM2 2h1v5H2zM3 1h1v7H3zM4 0h1v9H4z"/><path fill="#f05a4f" d="M6 2h1v1H6zM7 3h1v1H7zM8 4h1v1H8zM9 5h1v1H9zM10 6h1v1h-1zM10 2h1v1h-1zM9 3h1v1H9zM7 5h1v1H7zM6 6h1v1H6z"/></svg><span>Muted</span>`;
    badge.addEventListener('click', () => A.setSetting('muted', false));
    doc.body.appendChild(badge);
    renderBadge();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', makeBadge); else makeBadge();

  root.GameSounds = { start, stop, openSettings, closeSettings };
})(window);
