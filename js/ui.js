/* Menu, modes and table UI: renders the Game state and forwards clicks and keys to it. */
(function () {
  'use strict';
  const BJ = window.Blackjack;
  const PX = window.PixelSprites;
  const M = window.Modes;
  const fmt = BJ.formatChips;
  const CHIPS = [5, 10, 20, 50, 100, 250, 500];
  const RESULT_LABEL = { win: 'WIN', lose: 'LOSE', bust: 'BUST', push: 'PUSH', blackjack: 'BJ!', surrender: 'SURR' };
  const ACTION_LABEL = { hit: 'Hit', stand: 'Stand', double: 'Double', split: 'Split', surrender: 'Surrender' };

  const $ = (id) => document.getElementById(id);
  const seenCards = new Set();
  let save = M.load();
  let game = null;
  let mode = null;          // { type: 'practice' | 'challenge' | 'endless', difficulty? }
  let selectedSeat = null;
  let coach = null;         // practice mode: hint settings and stats
  let endlessIndex = 0;     // next endless objective
  let resetArmed = false;

  // ======================================================================
  // Menu
  // ======================================================================
  function showMenu() {
    game = null;
    mode = null;
    hideOverlay();
    if (window.Scenarios) Scenarios.clear(); // the menu never shows a scene
    if (window.DealerTalk) DealerTalk.stop();
    $('game').hidden = true;
    $('lore').hidden = true;
    $('menu').hidden = false;
    renderMenu();
  }

  // ======================================================================
  // Cosmetics, Achievements and Lore sections
  // ======================================================================
  function openSection(which) {
    const C = window.Cosmetics;
    if (!C) return;
    if (which === 'profile') C.openLocker('profile', { only: 'profile' });
    else if (which === 'achievements') C.openLocker('achievements', { only: 'achievements' });
    else C.openLocker('back', { only: 'cosmetics' });
  }

  // One entry per scene: the four casinos, then their space versions, which unlock with that difficulty's Endless.
  function showLore() {
    $('menu').hidden = true;
    $('game').hidden = true;
    $('lore').hidden = false;
    renderLore();
    window.scrollTo(0, 0);
  }

  function renderLore() {
    const S = window.Scenarios;
    const D = window.ScenarioDealers;
    const L = window.Lore || {};
    const entry = (id, diff, space) => {
      const scene = S && S.SCENES[id];
      const dealer = D && D.DEALERS[id];
      if (!scene) return '';
      const locked = space && !save.challengeWins[diff.id];
      if (locked) {
        return `<article class="lore-card locked">
          <div class="lore-portrait">${lockIcon()}</div>
          <div class="lore-text">
            <h3>???</h3>
            <p class="lore-sub">Endless · ${diff.name}</p>
            <p>Beat ${diff.name} in Challenge to discover this place and its dealer.</p>
          </div></article>`;
      }
      const lore = L[id] || {};
      return `<article class="lore-card${space ? ' space' : ''}">
        <div class="lore-portrait">${D ? D.sprite(id) : ''}</div>
        <div class="lore-text">
          <h3>${scene.name}</h3>
          <p class="lore-sub">${scene.subtitle} · ${space ? 'Endless' : 'Challenge'} ${diff.name}</p>
          <h4>${dealer ? dealer.name : 'The dealer'}</h4>
          <p>${lore.dealer || (dealer ? dealer.line : '')}</p>
          ${lore.place ? `<h4>The place</h4><p>${lore.place}</p>` : ''}
        </div></article>`;
    };
    const rows = M.DIFFICULTIES.map((d) => {
      const ids = S ? S.BY_DIFFICULTY[d.id] : null;
      if (!ids) return '';
      return `<section class="lore-row">
        <h2>${d.name}</h2>
        <div class="lore-pair">${entry(ids.challenge, d, false)}${entry(ids.endless, d, true)}</div>
      </section>`;
    }).join('');
    $('lore').innerHTML = `
      <div class="lore-head">
        <button class="btn btn-ghost" data-lore-back>Back</button>
        <h1>LORE</h1>
      </div>
      <p class="tagline">The dealers and the rooms where they deal.</p>
      ${rows || '<p class="tagline">No scenes installed.</p>'}`;
  }

  function runLine(type, diffId) {
    const run = savedRun(type, diffId);
    return run ? `<span class="diff-line run-line">▶ Continue: ${fmt(run.bankroll)} chips</span>` : '';
  }

  function renderMenu() {
    const wins = save.challengeWins;
    const diffs = M.DIFFICULTIES.map((d) => `
      <button class="diff${wins[d.id] ? ' won' : ''}" data-start="challenge" data-diff="${d.id}">
        <span class="diff-name">${d.name}${wins[d.id] ? ' <span class="star">★</span>' : ''}</span>
        <span class="diff-line">Start ${d.start} → Goal ${d.target}</span>
        <span class="diff-line">Bets ${d.minBet}-${d.maxBet} · ${d.maxBots === 0 ? 'No bots' : `${d.maxBots} bot${d.maxBots === 1 ? '' : 's'} max`}</span>
        ${runLine('challenge', d.id)}
      </button>`).join('');

    const anyUnlocked = M.DIFFICULTIES.some((d) => wins[d.id]);
    const endlessBtns = M.DIFFICULTIES.map((d) => {
      if (!wins[d.id]) {
        return `<div class="diff locked-diff"><span class="diff-name">${d.name}</span>
          <span class="diff-line">${lockIcon()} Win ${d.name} to unlock</span></div>`;
      }
      const rec = M.endlessRecord(save, d.id);
      const total = M.endlessObjectives(d).length;
      return `<button class="diff" data-start="endless" data-diff="${d.id}">
        <span class="diff-name">${d.name}</span>
        <span class="diff-line">Objectives ${rec.objectives}/${total}</span>
        <span class="diff-line">Best ${fmt(rec.best)}</span>
        ${runLine('endless', d.id)}
      </button>`;
    }).join('');
    const endless = `<p>Keep playing a difficulty you've beaten. Chase 8 objectives, then go for a high score. Run out of chips and it's over.</p>
      <div class="diffs">${endlessBtns}</div>`;

    $('menu').innerHTML = `
      <div class="menu-title">
        <div class="menu-suits">${['♠', '♥', '♣', '♦'].map((s) => `<span class="${s === '♥' || s === '♦' ? 'red' : ''}">${PX.suit(s)}</span>`).join('')}</div>
        <h1>BLACKJACK</h1>
        <p class="tagline">6 decks · Blackjack pays 3 to 2 · Dealer stands on all 17s</p>
      </div>
      <div class="modes">
        <article class="mode-card">
          <h2>Practice</h2>
          <p>Learn to play well. Hints show the basic strategy move, and a coach tracks the Hi-Lo count for you.</p>
          <button class="btn btn-primary" data-start="practice">Play practice</button>
        </article>
        <article class="mode-card">
          <h2>Challenge</h2>
          <p>You against the dealer. Reach the goal before you run out of chips.</p>
          <div class="diffs">${diffs}</div>
        </article>
        <article class="mode-card${anyUnlocked ? '' : ' locked'}">
          <h2>Endless</h2>
          ${endless}
        </article>
      </div>
      <div class="menu-extras">
        ${window.Cosmetics && window.Cosmetics.playerName ? `<button class="btn btn-ghost extra-btn" data-locker="profile">Profile</button>` : ''}
        ${window.Cosmetics ? `<button class="btn btn-ghost extra-btn" data-locker="cosmetics">Cosmetics</button>` : ''}
        ${window.Achievements ? `<button class="btn btn-ghost extra-btn" data-locker="achievements">Achievements${collectionCount()}</button>` : ''}
        <button class="btn btn-ghost extra-btn" data-lore>Lore</button>
      </div>
      <div class="menu-foot">
        ${window.SaveData && window.SaveData.available ? `<button class="link-btn" data-export-save>Export save</button>
        <button class="link-btn" data-import-save>Import save</button>` : ''}
        <button class="link-btn" data-reset-progress>${resetArmed ? 'Click again to erase all progress' : 'Reset progress'}</button>
      </div>`;
  }

  function collectionCount() {
    const A = window.Achievements;
    if (!A) return '';
    const all = A.list();
    return ` <span class="btn-count">${all.filter((a) => A.isUnlocked(a.id)).length}/${all.length}</span>`;
  }

  function lockIcon() {
    return `<svg class="px-lock" viewBox="0 0 9 10" shape-rendering="crispEdges" aria-hidden="true">
      <path fill="currentColor" d="M2 0h5v1H2zM1 1h1v3H1zM7 1h1v3H7zM0 4h9v6H0z"/><path fill="#20202a" d="M4 6h1v2H4z"/></svg>`;
  }

  // ======================================================================
  // Starting a mode
  // ======================================================================
  // ======================================================================
  // Continue: Challenge and Endless runs are saved after every hand
  // ======================================================================
  // A run is saved when a hand ends (with the shoe, so the count carries on) and again when
  // cards are dealt, with that hand's bets already taken and no shoe. Closing the game mid-hand
  // therefore loses those bets and reshuffles, so quitting can't undo a bad hand or peek at cards.
  const runKey = (type, diffId) => `${type}:${diffId}`;
  const resumable = (type) => type === 'challenge' || type === 'endless';
  function savedRun(type, diffId) { return (save.runs || {})[runKey(type, diffId)] || null; }
  function snapshot(g, midHand) {
    return {
      type: mode.type, difficulty: mode.difficulty, savedAt: Date.now(),
      bankroll: midHand ? g.bankroll - g.totalPlayerBets() : g.bankroll,
      seats: g.seats.map((s) => ({ type: s.type, name: s.name, bet: s.bet })),
      botNameIndex: g._botNameIndex, handNumber: g.handNumber, endlessIndex,
      shoe: midHand ? null : { cards: g.shoe.cards, roundsDealt: g.shoe.roundsDealt, runningCount: g.runningCount },
      achievements: window.Achievements && window.Achievements.sessionState ? window.Achievements.sessionState() : null,
    };
  }
  function storeRun(g, midHand) {
    if (!mode || !resumable(mode.type) || g !== game) return;
    if (!save.runs) save.runs = {};
    save.runs[runKey(mode.type, mode.difficulty)] = snapshot(g, midHand);
    M.store(save);
  }
  function clearRun(type, diffId) {
    if (save.runs && save.runs[runKey(type, diffId)]) { delete save.runs[runKey(type, diffId)]; M.store(save); }
  }
  function restoreRun(g, run) {
    g.bankroll = run.bankroll;
    g.handNumber = run.handNumber || 0;
    g._botNameIndex = run.botNameIndex || 0;
    run.seats.forEach((s, i) => {
      if (!g.seats[i] || !s.type) return;
      Object.assign(g.seats[i], { type: s.type, name: s.name, bet: s.type === 'player' ? s.bet : 0, hands: [] });
    });
    if (run.shoe && Array.isArray(run.shoe.cards) && run.shoe.cards.length > g.rules.reshuffleMinCards) {
      g.shoe.cards = run.shoe.cards;
      g.shoe.roundsDealt = run.shoe.roundsDealt || 0;
      g.runningCount = run.shoe.runningCount || 0;
    }
    // Drop bets the bankroll can't cover any more.
    for (const s of g.playerSeats()) if (g.totalPlayerBets() > g.bankroll) s.bet = 0;
  }
  // Clicking a difficulty with a saved run asks whether to continue it or start over.
  function chooseRun(type, diffId) {
    const run = savedRun(type, diffId);
    if (!run) { startMode(type, diffId); return; }
    const d = M.DIFFICULTIES.find((x) => x.id === diffId);
    showOverlay(`${type === 'endless' ? 'Endless' : 'Challenge'} · ${d.name}`,
      `<p>You have a saved run here: ${fmt(run.bankroll)} chips after ${run.handNumber} hands.</p>`, [
        { label: 'Continue', primary: true, run: () => startMode(type, diffId, run) },
        { label: 'Start over', run: () => { clearRun(type, diffId); startMode(type, diffId); } },
        { label: 'Back', run: hideOverlay },
      ]);
  }

  function startMode(type, diffId, run) {
    let rules;
    let label;
    if (type === 'practice') {
      rules = { startingBankroll: 1000, maxBots: 6 };
      label = 'Practice';
      coach = { hints: true, count: true, correct: 0, total: 0, feedback: null };
    } else if (type === 'challenge') {
      const d = M.DIFFICULTIES.find((x) => x.id === diffId);
      rules = { startingBankroll: d.start, minBet: d.minBet, maxBet: d.maxBet, maxBots: d.maxBots };
      label = `Challenge · ${d.name}`;
      coach = null;
    } else {
      const d = M.DIFFICULTIES.find((x) => x.id === diffId);
      rules = { startingBankroll: d.start, minBet: d.minBet, maxBet: d.maxBet, maxBots: d.maxBots };
      label = `Endless · ${d.name}`;
      coach = null;
      endlessIndex = run ? run.endlessIndex || 0 : 0;
      const rec = M.endlessRecord(save, d.id);
      rec.best = Math.max(rec.best, d.start);
      M.store(save);
    }
    mode = { type, difficulty: diffId, label };
    seenCards.clear();
    selectedSeat = null;
    game = new BJ.Game({ rules, onUpdate: render, onRoundEnd: roundEnd });

    if (run) {
      restoreRun(game, run);
      const first = game.playerSeats()[0];
      selectedSeat = first ? first.index : null;
      game.say(`Welcome back. ${fmt(game.bankroll)} chips, hand ${game.handNumber + 1}.${run.shoe ? '' : ' The last hand was left unfinished, so its bets are lost.'}`);
    } else {
      if (resumable(type)) clearRun(type, diffId);
      // The table starts empty: the player picks their seats and any bots.
      game.say(game.rules.maxBots > 0
        ? 'Pick a seat. Two bets are needed: play two seats or add a bot.'
        : 'Pick two seats. No bots here, you play both hands.');
    }

    $('menu').hidden = true;
    $('game').hidden = false;
    $('mode-label').textContent = label;
    $('table-limits').textContent = `DEALER STANDS ON ALL 17s · INSURANCE PAYS 2 TO 1 · BETS ${game.rules.minBet}-${game.rules.maxBet}`;
    hideOverlay();
    render();
    // Challenge and Endless play in their difficulty's room (js/scenarios.js); Practice keeps the plain table.
    if (window.Achievements) {
      const opts = { mode: type, difficulty: diffId || null, start: rules.startingBankroll };
      if (run && run.achievements && window.Achievements.resumeSession) window.Achievements.resumeSession(run.achievements, opts);
      else window.Achievements.startSession(opts);
    }
    if (window.Scenarios) Scenarios.applyForMode(type, diffId);
    // The scene's dealer comments on the game in speech bubbles (js/dealertalk.js).
    if (window.DealerTalk) DealerTalk.start(game, window.Scenarios ? Scenarios.forMode(type, diffId) : null);
  }

  // ======================================================================
  // Round results per mode
  // ======================================================================
  function roundEnd(g) {
    if (g !== game) return; // a game abandoned mid-hand finishing in the background
    if (window.Achievements) window.Achievements.roundEnd(g);
    storeRun(g, false);

    if (mode.type === 'practice') {
      if (g.broke) {
        showOverlay('Out of chips', '<p>Practice is free: take another 1000 and keep learning.</p>', [
          { label: 'Refill 1000', primary: true, run: () => { g.bankroll += 1000; hideOverlay(); g.say('Chips refilled.'); render(); } },
          { label: 'Menu', run: showMenu },
        ]);
      }
      return;
    }

    if (mode.type === 'challenge') {
      const d = M.DIFFICULTIES.find((x) => x.id === mode.difficulty);
      if (g.bankroll >= d.target) {
        const firstEver = !save.challengeWins[d.id];
        save.challengeWins[d.id] = true;
        clearRun('challenge', d.id);
        if (window.Achievements) window.Achievements.challengeWon(d.id);
        M.store(save);
        showOverlay(`${d.name} beaten!`, `
          <p>You reached ${fmt(g.bankroll)} chips. The goal was ${d.target}.</p>
          ${firstEver ? `<p class="unlock">Endless ${d.name} unlocked!</p>` : ''}`, [
          { label: 'Menu', primary: true, run: showMenu },
          { label: 'Play again', run: () => startMode('challenge', d.id) },
        ]);
      } else if (g.broke) {
        clearRun('challenge', d.id);
        showOverlay('Busted out', `<p>You're out of chips. The goal was ${d.target}.</p>`, [
          { label: 'Try again', primary: true, run: () => startMode('challenge', d.id) },
          { label: 'Menu', run: showMenu },
        ]);
      }
      return;
    }

    // Endless
    const d = M.DIFFICULTIES.find((x) => x.id === mode.difficulty);
    const objectives = M.endlessObjectives(d);
    const rec = M.endlessRecord(save, d.id);
    const reached = [];
    while (endlessIndex < objectives.length && g.bankroll >= objectives[endlessIndex]) {
      reached.push(objectives[endlessIndex]);
      endlessIndex++;
    }
    rec.objectives = Math.max(rec.objectives, endlessIndex);
    rec.best = Math.max(rec.best, g.bankroll);
    M.store(save);
    if (window.Achievements) window.Achievements.endlessProgress(d.id, endlessIndex, g.bankroll);
    if (reached.length) {
      const last = endlessIndex >= objectives.length;
      g.say(last
        ? `All ${objectives.length} objectives done! Keep going for a high score.`
        : `Objective reached: ${fmt(reached[reached.length - 1])}! Next: ${fmt(objectives[endlessIndex])}.`);
      render();
    }
    if (g.broke) {
      clearRun('endless', d.id);
      showOverlay('Game over', `
        <p>You're out of chips.</p>
        <p>Objectives this run: ${endlessIndex}/${objectives.length}</p>
        <p>Best on ${d.name}: ${fmt(rec.best)}</p>`, [
        { label: 'Play again', primary: true, run: () => startMode('endless', d.id) },
        { label: 'Menu', run: showMenu },
      ]);
    }
  }

  // ======================================================================
  // Overlay dialogs (the page builds its own; browser confirm() is not used)
  // ======================================================================
  let overlayButtons = [];
  function showOverlay(title, html, buttons) {
    overlayButtons = buttons;
    $('dialog').innerHTML = `<h2>${title}</h2>${html}
      <div class="row">${buttons.map((b, i) => `<button class="btn${b.primary ? ' btn-primary' : ' btn-ghost'}" data-overlay="${i}">${b.label}</button>`).join('')}</div>`;
    $('overlay').hidden = false;
    const first = $('dialog').querySelector('button');
    if (first) first.focus();
  }
  function hideOverlay() { $('overlay').hidden = true; overlayButtons = []; }

  // ======================================================================
  // Rendering the table
  // ======================================================================
  function cardHtml(card, hidden) {
    const key = card.id + (hidden ? 'h' : '');
    const fresh = !seenCards.has(key);
    seenCards.add(key);
    if (hidden) return `<div class="card back${fresh ? ' fresh' : ''}" aria-label="Face-down card"></div>`;
    const red = card.suit === '♥' || card.suit === '♦';
    const sprite = PX.suit(card.suit);
    return `<div class="card${red ? ' red' : ''}${fresh ? ' fresh' : ''}" aria-label="${card.rank}${card.suit}">
      <span class="corner"><span class="rank">${card.rank}</span>${sprite}</span><span class="pip">${sprite}</span></div>`;
  }

  // "BJ" only for a real blackjack: the first two cards of an unsplit hand. A split hand
  // with ace + ten is just 21 (casino rule), so it shows 21 and a tooltip says why.
  function totalLabel(cards, hand) {
    if (!cards.length) return '';
    const { total, soft } = BJ.handValue(cards);
    if (BJ.isBlackjack(cards) && (!hand || hand.natural)) return 'BJ';
    if (total > 21) return String(total);
    return soft && total < 21 ? `${total - 10}/${total}` : String(total);
  }

  function chipStack(amount) {
    if (!amount) return '<div class="bet-spot empty">BET</div>';
    const chips = PX.breakdown(amount).slice(0, 8).reverse();
    const stack = chips.map((v, n) => `<span class="stack-chip" style="bottom:${n * 4}px">${PX.chip(v)}</span>`).join('');
    return `<div class="bet-spot"><div class="stack" style="height:${42 + (chips.length - 1) * 4}px">${stack}</div>
      <span class="bet-amount">${fmt(amount)}</span></div>`;
  }

  function renderSeat(seat) {
    const betting = game.phase === 'betting';
    const isActive = game.active && game.active.seat === seat.index;
    const classes = ['seat'];
    if (!seat.type) classes.push('empty');
    if (seat.type) classes.push(seat.type);
    if (isActive) classes.push('active');
    if (seat.hands.length > 1) classes.push(`split-${seat.hands.length}`);
    if (selectedSeat === seat.index && betting && seat.type === 'player') classes.push('selected');

    let body = '';
    if (!seat.type) {
      const botBtn = game.rules.maxBots > 0
        ? `<button class="btn btn-small btn-ghost" data-bot="${seat.index}" ${game.botCount() >= game.rules.maxBots ? 'disabled' : ''}>Add bot</button>` : '';
      body = betting
        ? `<button class="btn btn-small" data-sit="${seat.index}">Sit</button>${botBtn}`
        : '<div class="seat-hint">Open seat</div>';
    } else {
      const hands = seat.hands.map((hand, h) => {
        const activeHand = isActive && game.active.hand === h && seat.hands.length > 1 ? ' active-hand' : '';
        const result = hand.result
          ? `<span class="result r-${hand.result}">${RESULT_LABEL[hand.result]}${seat.type === 'player' && hand.net ? ` ${hand.net > 0 ? '+' : '−'}${fmt(Math.abs(hand.net))}` : ''}</span>`
          : '';
        const tags = [hand.doubled ? 'Doubled' : '', hand.insurance ? `Ins. ${fmt(hand.insurance)}` : ''].filter(Boolean).join(' · ');
        return `<div class="hand${activeHand}${hand.result && betting ? ' finished' : ''}">
          <div class="cards">${hand.cards.map((c) => cardHtml(c, false)).join('')}</div>
          <div class="hand-info"><span class="total"${hand.fromSplit && BJ.isBlackjack(hand.cards) ? ' title="21 after a split counts as 21, not blackjack"' : ''}>${totalLabel(hand.cards, hand)}</span>
            <span class="hand-bet">${fmt(hand.bet)}</span>${result}</div>
          ${tags ? `<div class="hand-tags">${tags}</div>` : ''}
        </div>`;
      }).join('');
      const spot = seat.type === 'player' && betting ? chipStack(seat.bet) : '';
      body = `${hands ? `<div class="hands">${hands}</div>` : ''}${spot}`;
    }

    const leave = seat.type && betting
      ? `<button class="leave" data-leave="${seat.index}" aria-label="Leave seat ${seat.index + 1}">×</button>` : '';
    const name = seat.type ? `${seat.name}${seat.type === 'bot' ? ' <span class="bot-tag">bot</span>' : ''}` : '';
    return `<div class="${classes.join(' ')}" data-seat="${seat.index}">
      <div class="seat-head"><span class="seat-num">${seat.index + 1}</span><span class="seat-name">${name}</span>${leave}</div>
      <div class="seat-body">${body}</div>
    </div>`;
  }

  function render() {
    if (!game) return;
    $('bankroll').textContent = fmt(game.bankroll);
    const left = game.rules.roundsPerShoe - game.shoe.roundsDealt;
    $('shoe').textContent = `${game.shoe.remaining} cards · ${left > 0 ? `${left} hand${left === 1 ? '' : 's'} to shuffle` : 'shuffle next hand'}`;
    renderGoal();

    $('dealer-cards').innerHTML = game.dealer.cards
      .map((c, i) => cardHtml(c, i === 1 && game.dealer.holeHidden)).join('');
    const dv = game.dealer.cards.length ? totalLabel(game.dealer.holeHidden ? game.dealer.cards.slice(0, 1) : game.dealer.cards) : '';
    $('dealer-total').textContent = dv;

    $('message').textContent = game.message;
    // Seat 1 is "first base", on the dealer's left, so it renders on the right.
    $('seats').innerHTML = game.seats.map(renderSeat).join('');
    renderControls();
    renderCoach();
  }

  function renderGoal() {
    let goal = null;
    let start = 0;
    let label = 'Goal';
    if (mode.type === 'challenge') {
      const d = M.DIFFICULTIES.find((x) => x.id === mode.difficulty);
      goal = d.target;
      start = 0;
    } else if (mode.type === 'endless') {
      const d = M.DIFFICULTIES.find((x) => x.id === mode.difficulty);
      const objectives = M.endlessObjectives(d);
      const done = endlessIndex >= objectives.length;
      label = done ? 'Best' : `Objective ${endlessIndex + 1}/${objectives.length}`;
      goal = done ? null : objectives[endlessIndex];
      start = endlessIndex > 0 ? objectives[endlessIndex - 1] : 0;
    }
    const show = mode.type !== 'practice';
    $('goal-stat').hidden = !show;
    $('progress').hidden = !show || goal === null;
    if (!show) return;
    $('goal-label').textContent = label;
    $('goal').textContent = goal === null ? fmt(M.endlessRecord(save, mode.difficulty).best) : fmt(goal);
    if (goal !== null) {
      const pct = Math.max(0, Math.min(1, (game.bankroll - start) / (goal - start)));
      // Snap to 5% steps so the bar moves in chunky pixel increments.
      $('progress-fill').style.width = `${Math.round(pct * 20) * 5}%`;
    }
  }

  function myTurn() {
    return game.phase === 'playing' && game.active && game.seats[game.active.seat].type === 'player' &&
      game.waitingFor === 'action';
  }

  function recommendedAction() {
    if (!myTurn()) return null;
    const { seat, hand } = game.active;
    return BJ.basicStrategy(game.seats[seat].hands[hand].cards, game.dealerUpCard(), game.availableActions(seat, hand));
  }

  function renderControls() {
    const c = $('controls');
    const hints = coach && coach.hints;
    if (game.phase === 'betting') {
      const players = game.playerSeats();
      if (selectedSeat === null || !game.seats[selectedSeat] || game.seats[selectedSeat].type !== 'player') {
        selectedSeat = players.length ? players[0].index : null;
      }
      const problem = game.dealProblem();
      if (selectedSeat === null) {
        c.innerHTML = `<p class="hint">Click <strong>Sit</strong> on a seat to join the table.</p>`;
        return;
      }
      const seat = game.seats[selectedSeat];
      const remaining = game.bankroll - game.totalPlayerBets();
      const chips = CHIPS.map((v) => {
        const disabled = v > remaining || seat.bet + v > game.rules.maxBet;
        return `<button class="chip-btn" data-chip="${v}" ${disabled ? 'disabled' : ''} aria-label="Add ${v}">${PX.chip(v)}<span>${v}</span></button>`;
      }).join('');
      c.innerHTML = `
        <div class="betting-for">Betting on seat ${seat.index + 1}: <strong>${fmt(seat.bet)}</strong>
          ${players.length > 1 ? '<span class="hint">(click one of your seats to switch)</span>' : ''}</div>
        <div class="chip-rack">${chips}</div>
        <div class="row">
          <button class="btn btn-ghost" data-clear>Clear bet</button>
          <button class="btn btn-primary" data-deal ${problem ? 'disabled' : ''}>Deal <kbd>Enter</kbd></button>
        </div>
        ${problem ? `<p class="hint">${problem}</p>` : ''}`;
      return;
    }
    if (game.phase === 'insurance' && game.active) {
      // Same spot and format as the action bar: one question for the highlighted seat.
      const i = game.active.seat;
      const hand = game.seats[i].hands[0];
      const take = game.trueCount >= 3;
      const rec = (yes) => (hints && take === yes ? ' recommended' : '');
      const yes = hand.natural ? 'Even money' : `Insurance ${fmt(hand.bet / 2)}`;
      const no = hand.natural ? 'No, play it' : 'No insurance';
      c.innerHTML = `<div class="row actions">
        <button class="btn act${rec(true)}" data-ins="${i}" data-take="1">${yes} <kbd>I</kbd></button>
        <button class="btn act btn-ghost${rec(false)}" data-ins="${i}" data-take="0">${no} <kbd>N</kbd></button></div>`;
      return;
    }
    if (myTurn()) {
      const a = game.availableActions(game.active.seat, game.active.hand);
      const rec = hints ? recommendedAction() : null;
      const btn = (key, k) => `<button class="btn act${rec === key ? ' recommended' : ''}" data-act="${key}" ${a[key] ? '' : 'disabled'}>${ACTION_LABEL[key]} <kbd>${k}</kbd></button>`;
      c.innerHTML = `<div class="row actions">
        ${btn('hit', 'H')}${btn('stand', 'S')}${btn('double', 'D')}${btn('split', 'P')}${btn('surrender', 'R')}</div>`;
      return;
    }
    c.innerHTML = '<p class="hint dots">· · ·</p>';
  }

  // ---------- practice coach ----------
  function signed(n, digits = 0) {
    const v = digits ? n.toFixed(digits) : String(Math.round(n));
    return n > 0 ? `+${v}` : v.replace('-', '−');
  }

  function betAdvice() {
    const tc = Math.floor(game.trueCount);
    if (tc < 1) return `True count ${signed(tc)}: the house has the edge. Bet the table minimum (${game.rules.minBet}).`;
    return `True count ${signed(tc)}: the count favours you. Raise your bet to about ${tc + 1}× your base bet.`;
  }

  function renderCoach() {
    const el = $('coach');
    el.parentElement.classList.toggle('with-coach', !!coach); // Practice: the coach sits beside the table
    if (!coach) { el.hidden = true; return; }
    el.hidden = false;
    let advice = '';
    if (coach.hints) {
      if (game.phase === 'betting') advice = betAdvice();
      else if (game.phase === 'insurance') {
        advice = game.trueCount >= 3
          ? `Take insurance: the true count is ${signed(game.trueCount, 1)} (+3 or more).`
          : 'Decline insurance. It only pays off when the true count is +3 or higher.';
      } else if (myTurn()) {
        const rec = recommendedAction();
        advice = `Basic strategy: <strong>${ACTION_LABEL[rec]}</strong>.`;
      }
    }
    const fb = coach.feedback
      ? `<p class="feedback ${coach.feedback.ok ? 'ok' : 'bad'}">${coach.feedback.text}</p>` : '';
    const acc = coach.total ? `${coach.correct}/${coach.total} correct (${Math.round((coach.correct / coach.total) * 100)}%)` : 'No decisions yet';
    const count = coach.count ? `
      <div class="count">
        <div><span class="stat-label">Running</span><strong>${signed(game.runningCount)}</strong></div>
        <div><span class="stat-label">Decks left</span><strong>${game.decksRemaining.toFixed(1)}</strong></div>
        <div><span class="stat-label">True count</span><strong>${signed(game.trueCount, 1)}</strong></div>
      </div>` : '';
    el.innerHTML = `
      <div class="coach-head">
        <h2>Coach</h2>
        <div class="toggles">
          <button class="toggle${coach.hints ? ' on' : ''}" data-toggle="hints" aria-pressed="${coach.hints}">Hints</button>
          <button class="toggle${coach.count ? ' on' : ''}" data-toggle="count" aria-pressed="${coach.count}">Count</button>
        </div>
      </div>
      ${count}
      ${advice ? `<p class="advice">${advice}</p>` : ''}
      ${fb}
      <p class="accuracy">${acc}</p>
      ${coach.count ? '<p class="legend">Hi-Lo: 2-6 = +1 · 7-9 = 0 · 10-A = −1. True count = running ÷ decks left.</p>' : ''}`;
  }

  // ======================================================================
  // Input
  // ======================================================================
  function doAct(action) {
    if (!game) return;
    const rec = coach ? recommendedAction() : null;
    if (!game.act(action)) return;
    if (coach && rec) {
      coach.total++;
      if (rec === action) {
        coach.correct++;
        coach.feedback = { ok: true, text: `Correct: ${ACTION_LABEL[action]}.` };
      } else {
        coach.feedback = { ok: false, text: `Basic strategy says ${ACTION_LABEL[rec]}. You chose ${ACTION_LABEL[action]}.` };
      }
      renderCoach();
    }
  }

  function doInsurance(seatIndex, take) {
    const right = game.trueCount >= 3;
    if (!game.decideInsurance(seatIndex, take)) return;
    if (coach) {
      coach.total++;
      if (take === right) { coach.correct++; coach.feedback = { ok: true, text: `Correct: ${take ? 'take' : 'decline'} insurance.` }; }
      else coach.feedback = { ok: false, text: right ? 'At true count +3 or more, insurance is worth taking.' : 'Insurance is a losing bet unless the true count is +3 or more.' };
      renderCoach();
    }
  }

  // Import a save file: validate it, store it, then reload so every part of the game reads it fresh.
  function pickSaveFile() {
    const input = document.createElement('input');
    input.type = 'file'; input.accept = '.bjsave,.json,.txt';
    input.addEventListener('change', () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const res = window.SaveData.importSave(String(reader.result));
        if (res.ok) showOverlay('Save imported', '<p>Your progress was loaded.</p>', [{ label: 'OK', run: () => location.reload() }]);
        else showOverlay('Could not import', `<p>${res.error}</p>`, [{ label: 'OK', run: hideOverlay }]);
      };
      reader.readAsText(file);
    });
    input.click();
  }

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button, .seat');
    if (!t) return;
    const d = t.dataset;

    if (d.overlay !== undefined) { const b = overlayButtons[+d.overlay]; if (b) b.run(); return; }
    if (d.start !== undefined) { if (resumable(d.start)) chooseRun(d.start, d.diff); else startMode(d.start, d.diff); return; }
    if (d.locker !== undefined) { openSection(d.locker); return; }
    if (d.lore !== undefined) { showLore(); return; }
    if (d.loreBack !== undefined) { showMenu(); return; }
    if (d.exportSave !== undefined) { window.SaveData.exportSave(); return; }
    if (d.importSave !== undefined) { pickSaveFile(); return; }
    if (d.resetProgress !== undefined) {
      if (resetArmed) {
        save = M.blankSave();
        M.store(save);
        if (window.Achievements) window.Achievements.reset();
        if (window.Cosmetics) window.Cosmetics.apply();
        resetArmed = false;
      }
      else { resetArmed = true; setTimeout(() => { resetArmed = false; if (!$('menu').hidden) renderMenu(); }, 4000); }
      renderMenu();
      return;
    }
    if (!game) return;
    if (d.toggle !== undefined) { coach[d.toggle] = !coach[d.toggle]; render(); return; }
    if (d.sit !== undefined) { game.sitPlayer(+d.sit); selectedSeat = +d.sit; render(); return; }
    if (d.bot !== undefined) { game.addBot(+d.bot); return; }
    if (d.leave !== undefined) { game.leaveSeat(+d.leave); return; }
    if (d.chip !== undefined) { if (selectedSeat !== null) game.addChip(selectedSeat, +d.chip); return; }
    if (d.clear !== undefined) { if (selectedSeat !== null) game.clearBet(selectedSeat); return; }
    if (d.deal !== undefined) { startDeal(); return; }
    if (d.ins !== undefined) { doInsurance(+d.ins, d.take === '1'); return; }
    if (d.act !== undefined) { doAct(d.act); return; }
    if (t.classList.contains('seat') && game.phase === 'betting' && game.seats[+d.seat].type === 'player') {
      selectedSeat = +d.seat;
      render();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!game || !$('overlay').hidden) return;
    const key = e.key.toLowerCase();
    if (game.phase === 'playing') {
      const map = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' };
      if (map[key]) doAct(map[key]);
    } else if (game.phase === 'insurance' && game.active && (key === 'i' || key === 'n')) {
      doInsurance(game.active.seat, key === 'i');
    } else if (game.phase === 'betting' && key === 'enter' && !e.target.closest('button')) {
      startDeal();
    }
  });

  function startDeal() {
    if (game.dealProblem()) { render(); return; }
    if (coach) coach.feedback = null;
    const g = game;
    storeRun(g, true); // quitting mid-hand loses this hand's bets
    g.deal().catch((err) => { console.error(err); g.say('Something went wrong. Go back to the menu and start again.'); render(); });
  }

  $('to-menu').addEventListener('click', () => {
    if (!game) return;
    if (game.phase === 'betting' && mode.type === 'practice') { showMenu(); return; }
    if (mode.type !== 'practice' && game.phase === 'betting') { storeRun(game, false); showMenu(); return; }
    const lose = mode.type === 'practice' ? '<p>Your practice chips are not saved.</p>'
      : '<p>Your run is saved, but this hand is unfinished: its bets are lost.</p>';
    showOverlay('Leave the table?', lose, [
      { label: 'Leave', primary: true, run: showMenu },
      { label: 'Stay', run: hideOverlay },
    ]);
  });

  // Closing the tab between hands keeps seat and bet changes made since the last hand.
  window.addEventListener('pagehide', () => { if (game && mode && game.phase === 'betting') storeRun(game, false); });

  // Cosmetics and achievements live in their own scripts; keep the screen in sync with them.
  document.addEventListener('cosmetics:change', () => { if (game) render(); });
  document.addEventListener('cosmetics:close', () => { if (!game) renderMenu(); });
  document.addEventListener('achievement:unlocked', () => { if (!game) renderMenu(); });
  if (window.Cosmetics) window.Cosmetics.apply();

  window.__blackjack = () => game; // handy for debugging in the browser console
  showMenu();
})();
