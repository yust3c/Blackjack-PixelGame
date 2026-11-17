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
  let activeChip = 5;       // the chip that number keys, the scroll wheel and Rebet-free clicks use
  let undoStack = [];       // bets before each betting change, for Undo (cleared when cards are dealt)

  // ======================================================================
  // Menu
  // ======================================================================
  function showMenu() {
    hideOverlay();
    if (window.Scenarios) Scenarios.clear(); // the menu never shows a scene
    if (window.DealerTalk) DealerTalk.stop();
    if (window.SessionStats) {
      // keep the numbers of the table you just left for Profile > Stats
      const st = mode && SessionStats.state();
      if (st && st.hands) { save.lastSession = { label: mode.label, at: Date.now(), stats: st }; M.store(save); }
      SessionStats.stop();
    }
    if (window.StatsView) window.StatsView.close();
    game = null;
    mode = null;
    if (window.TableFX) window.TableFX.reset();
    if (window.SceneEvents) window.SceneEvents.stop();
    if (window.GameSounds) { GameSounds.stop(); GameSounds.closeSettings(); }
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
        <div class="mode-col">
        <article class="mode-card">
          <h2>Practice</h2>
          <p>Learn to play well. Hints show the basic strategy move, and a coach tracks the Hi-Lo count for you.</p>
          <button class="btn btn-primary" data-start="practice">Play practice</button>
        </article>
        ${dailyCard()}
        </div>
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
        ${window.GameSounds ? `<button class="btn btn-ghost extra-btn" data-settings>Settings</button>` : ''}
      </div>
      <div class="menu-foot">
        ${window.SaveData && window.SaveData.available ? `<button class="link-btn" data-export-save>Export save</button>
        <button class="link-btn" data-import-save>Import save</button>` : ''}
        <button class="link-btn" data-reset-progress>${resetArmed ? 'Click again to erase all progress' : 'Reset progress'}</button>
      </div>`;
  }

  // The Daily card: today's casino, the streak with its tier icon, and today's best.
  const SCENE_OF = { easy: ['The Corner', 'Old Tito'], medium: ['Grand Hotel', 'Madame Odette'], hard: ['Neon', 'Vinnie'], expert: ['VIP Lounge', 'Mr. Valdez'] };
  function dailyPlace(day) {
    const id = M.dailyDifficulty(day);
    const S = window.Scenarios; const D = window.ScenarioDealers;
    const sceneId = S ? S.forMode('challenge', id) : null;
    const scene = sceneId && S.SCENES[sceneId]; const dealer = sceneId && D && D.DEALERS[sceneId];
    return `${scene ? scene.name : SCENE_OF[id][0]} · ${dealer ? dealer.name : SCENE_OF[id][1]}`;
  }
  function dailyCard() {
    const day = M.localDay();
    const rec = (save.daily || {})[day] || { best: 0, tries: 0, done: false };
    const streak = M.currentStreak(save, day);
    const tier = M.streakTier(streak);
    const I = window.AchievementIcons;
    const date = new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    const tierLine = tier ? `${tier.name} · ${tier.next ? `${tier.next.days} more day${tier.next.days === 1 ? '' : 's'} to ${tier.next.name}` : 'Top tier'}` : 'Play today to start one';
    return `<article class="mode-card dl-card">
      <div class="dl-head"><h2>Daily</h2><span class="dl-date">${date}</span></div>
      <p>Today's deal at <b class="dl-place">${dailyPlace(day)}</b>. The same shoe for everyone. ${M.DAILY.hands} hands, start with ${fmt(M.DAILY.start)}.</p>
      <div class="dl-streak"><span class="ic">${tier && I ? I.html('streak_' + tier.id, 48) : ''}</span>
        <b>${streak ? `${streak} day streak` : 'No streak yet'}</b><span>${tierLine}</span></div>
      <div class="dl-facts"><div><b>${rec.best ? fmt(rec.best) : '-'}</b><span>Best today</span></div><div><b>${rec.tries}</b><span>Tries</span></div><div><b>${(save.streak && save.streak.best) || 0}</b><span>Best streak</span></div></div>
      ${rec.done ? '<span class="dl-done">✓ Done for today. Streak safe.</span>' : ''}
      <button class="btn btn-primary" data-start="daily">${rec.done ? 'Play again' : 'Play today\'s deal'}</button>
    </article>`;
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
      stats: window.SessionStats ? window.SessionStats.state() : null,
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
    } else if (type === 'daily') {
      // diffId is the casino of the day (see Modes.dailyDifficulty); the table itself is always the Daily one.
      const D = M.DAILY;
      rules = { startingBankroll: D.start, minBet: D.minBet, maxBet: D.maxBet, maxBots: D.maxBots };
      label = 'Daily';
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
    if (type === 'daily') {
      mode.day = M.localDay();
      M.dailyRecord(save, mode.day).tries++;
      M.store(save);
    }
    seenCards.clear();
    if (window.TableFX) window.TableFX.reset();
    selectedSeat = null;
    undoStack = [];
    seatChips = {};
    const P = window.Prefs;
    game = new BJ.Game({ rules, onUpdate: render, onRoundEnd: roundEnd,
      delay: P ? P.delay() : undefined, botPace: P ? P.botPace() : undefined,
      // the Daily shoe is shuffled from the day's seed, so every player (and every retry) gets the same cards
      shoeRng: type === 'daily' ? M.seededRng(M.daySeed(mode.day)) : undefined });
    activeChip = CHIPS.find((v) => v >= game.rules.minBet) || CHIPS[0];

    if (run) {
      restoreRun(game, run);
      game.lastBets = game.seats.map((s) => (s.type === 'player' ? s.bet : 0));
      const first = game.playerSeats()[0];
      selectedSeat = first ? first.index : null;
      game.say(`Welcome back. ${fmt(game.bankroll)} chips, hand ${game.handNumber + 1}.${run.shoe ? '' : ' The last hand was left unfinished, so its bets are lost.'}`);
    } else {
      if (resumable(type)) clearRun(type, diffId);
      // The table starts empty: the player picks their seats and any bots.
      if (type === 'daily') game.say(`Today's deal: ${M.DAILY.hands} hands. Pick your seats.`);
      else game.say(game.rules.maxBots > 0
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
    const sceneType = type === 'daily' ? 'challenge' : type;   // the Daily is dealt in the day's casino
    if (window.Scenarios) Scenarios.applyForMode(sceneType, diffId);
    // The scene's dealer comments on the game in speech bubbles (js/dealertalk.js).
    if (window.DealerTalk) DealerTalk.start(game, window.Scenarios ? Scenarios.forMode(sceneType, diffId) : null);
    // Hands, results and the bankroll history of this sitting (js/sessionstats.js); Continue keeps them.
    if (window.SessionStats) SessionStats.start(game, run && run.stats);
    // Now and then something happens in the room (js/sceneevents.js).
    if (window.SceneEvents) window.SceneEvents.start(game, window.Scenarios ? Scenarios.forMode(sceneType, diffId) : null);
    // Table sounds follow the game, and the scene's music plays (js/gamesounds.js, js/music.js).
    if (window.GameSounds) GameSounds.start(game, window.Scenarios ? Scenarios.forMode(sceneType, diffId) : null);
  }

  // ======================================================================
  // Round results per mode
  // ======================================================================
  function roundEnd(g) {
    if (g !== game) return; // a game abandoned mid-hand finishing in the background
    if (window.Achievements) window.Achievements.roundEnd(g);
    if (window.SceneEvents && window.SceneEvents.roundEnd) window.SceneEvents.roundEnd(g);
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

    if (mode.type === 'daily') { dailyRoundEnd(g); return; }

    if (mode.type === 'challenge') {
      const d = M.DIFFICULTIES.find((x) => x.id === mode.difficulty);
      if (g.bankroll >= d.target) {
        const firstEver = !save.challengeWins[d.id];
        save.challengeWins[d.id] = true;
        clearRun('challenge', d.id);
        if (window.Achievements) window.Achievements.challengeWon(d.id);
        if (window.GameAudio) setTimeout(() => window.GameAudio.play('goal'), 1200);
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
      if (window.GameAudio) setTimeout(() => window.GameAudio.play('goal'), 1200);
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

  // The Daily ends after its hands (or when the chips run out): the result is the bankroll.
  function dailyRoundEnd(g) {
    const played = g.handNumber;
    if (played < M.DAILY.hands && !g.broke) {
      if (played === M.DAILY.hands - 1) g.say('Last hand of the day. Make it count.');
      render();
      return;
    }
    const day = mode.day;
    const before = M.dailyRecord(save, day).best;
    const firstToday = !M.dailyRecord(save, day).done;
    const streak = M.finishDaily(save, day, g.bankroll);
    M.store(save);
    if (window.Achievements && window.Achievements.dailyDone) window.Achievements.dailyDone(streak);
    if (window.GameAudio) setTimeout(() => window.GameAudio.play('goal'), 900);
    const tier = M.streakTier(streak);
    const I = window.AchievementIcons;
    const best = Math.max(before, g.bankroll);
    const net = g.bankroll - M.DAILY.start;
    showOverlay(g.broke ? 'Out of chips' : 'Daily done!', `
      <p>${g.broke ? `Busted after ${played} hands.` : `${played} hands played.`} You finished with <b>${fmt(g.bankroll)}</b> chips (${net >= 0 ? '+' : ''}${fmt(net)}).</p>
      <p>${g.bankroll > before && before ? 'New best today!' : `Best today: ${fmt(best)}`}</p>
      <div class="dl-result">${tier && I ? I.html('streak_' + tier.id, 48) : ''}<span>${firstToday ? 'Streak' : 'Streak safe'}: <b>${streak} day${streak === 1 ? '' : 's'}</b>${tier ? ` · ${tier.name}` : ''}</span></div>`, [
      { label: 'Menu', primary: true, run: showMenu },
      { label: 'Play again', run: () => startMode('daily', M.dailyDifficulty(M.localDay())) },
    ]);
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
    // With TableFX the card flies in from the shoe instead of the small drop.
    const fresh = !seenCards.has(key) && !(window.TableFX && window.TableFX.active());
    seenCards.add(key);
    if (hidden) return `<div class="card back${fresh ? ' fresh' : ''}" data-cid="${card.id}" aria-label="Face-down card"></div>`;
    const red = card.suit === '♥' || card.suit === '♦';
    const sprite = PX.suit(card.suit);
    return `<div class="card${red ? ' red' : ''}${fresh ? ' fresh' : ''}" data-cid="${card.id}" aria-label="${card.rank}${card.suit}">
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

  // The chips on each seat, in the order they were placed, so the stack shows the chips you actually bet.
  // Any other change (undo, rebet, clear) falls back to the fewest chips for the amount.
  let seatChips = {};
  const sum = (a) => a.reduce((t, v) => t + v, 0);
  function chipsOn(i) {
    const seat = game.seats[i];
    const list = seatChips[i];
    if (!seat || !seat.bet) return [];
    return list && sum(list) === seat.bet ? list : PX.breakdown(seat.bet);
  }
  // Adds one chip to a seat (sitting down first on an open seat when `sit`), keeping the chip list.
  function addChipTo(i, v, sit) {
    return betChange(() => {
      if (sit && !game.seats[i].type && !game.sitPlayer(i)) return false;
      const prev = chipsOn(i);
      if (!game.addChip(i, v)) return false;
      seatChips[i] = prev.concat([v]);
      return true;
    });
  }
  // While the dealer settles a hand (js/tablefx.js), the standing bet waits off the spot until the chips go home.
  // A chip clicked (or keyed) in the rack hops onto the seat's spot.
  function chipFromRack(i, v) {
    if (window.TableFX) window.TableFX.chipIn(i, v);
    if (!addChipTo(i, v) && window.TableFX) window.TableFX.chipIn(null);
  }
  function chipStack(seat, hold) {
    const amount = seat.bet;
    if (!amount) return '<div class="bet-spot empty">BET</div>';
    if (window.ChipStacks) {
      const pile = hold ? ' style="visibility:hidden"' : ` data-pile="s${seat.index}spot" data-from="pile:s${seat.index}h0b|owner" data-dest="owner"`;
      return `<div class="bet-spot"><div class="stack stack-cols"${pile}>${window.ChipStacks.html(chipsOn(seat.index))}</div>
        <span class="bet-amount">${fmt(amount)}</span></div>`;
    }
    const chips = PX.breakdown(amount).slice(0, 8).reverse();
    const stack = chips.map((v, n) => `<span class="stack-chip" style="bottom:${n * 4}px">${PX.chip(v)}</span>`).join('');
    return `<div class="bet-spot"><div class="stack" style="height:${42 + (chips.length - 1) * 4}px">${stack}</div>
      <span class="bet-amount">${fmt(amount)}</span></div>`;
  }

  // Chips for an amount that may not be a whole chip (a 3:2 pay on 5 is 7.5): the nearest amount in 5s.
  const chipsFor = (amount) => PX.breakdown(Math.max(5, Math.round(amount / 5) * 5));
  /** The chips in front of a hand: its bet, the double beside it, and once the dealer pays, the payout.
      `step` is how far the settling has gone (see settleStep): 1 lost bets taken, 2 wins paid, 3 chips home.
      A bust hand's chips leave with its cards; the dealer takes them. */
  function handChips(seat, hand, h, step) {
    if (!window.ChipStacks || !hand.bet) return '';
    const betting = game.phase === 'betting';
    const r = hand.result;
    const lost = r === 'lose' || r === 'bust' || r === 'surrender';
    if (r === 'bust' && (betting || bustTaken(hand))) return '';
    if (betting && r && ((lost && step >= 1) || step >= 3)) return '';
    const key = `s${seat.index}h${h}`;
    const stake = hand.doubled ? hand.bet / 2 : hand.bet;
    const pile = (k, chips, from) => `<div class="pile" data-pile="${key}${k}" data-from="${from}" data-dest="${lost ? 'dealer' : 'owner'}">${window.ChipStacks.html(chips)}</div>`;
    const placed = seat.type === 'player' && h === 0 && seat.bet === stake ? chipsOn(seat.index) : chipsFor(stake);
    let out = pile('b', placed, h === 0 && seat.type === 'player' ? `pile:s${seat.index}spot|owner` : 'owner');
    if (hand.doubled) out += pile('d', chipsFor(stake), 'owner');
    if (betting && step >= 2 && (r === 'win' || r === 'blackjack')) out += pile('p', chipsFor(r === 'win' ? hand.bet : hand.bet * 1.5), 'dealer');
    return `<div class="hand-chips">${out}</div>`;
  }
  // How far the end of the round has gone: the hands that finished first, then the moves of the chips.
  let settle = 3;
  function settleStep() {
    if (game.phase !== 'betting' || !window.TableFX) return 3;
    let token = null;
    game.seats.forEach((s) => s.hands.forEach((h) => { if (!token && h.result) token = h; }));
    return token ? window.TableFX.settleStep(token) : 3;
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
          <div class="cards">${bustTaken(hand) ? '' : hand.cards.map((c) => cardHtml(c, false)).join('')}</div>
          ${handChips(seat, hand, h, settle)}
          <div class="hand-info"><span class="total"${hand.fromSplit && BJ.isBlackjack(hand.cards) ? ' title="21 after a split counts as 21, not blackjack"' : ''}>${totalLabel(hand.cards, hand)}</span>
            <span class="hand-bet">${fmt(hand.bet)}</span>${result}</div>
          ${tags ? `<div class="hand-tags">${tags}</div>` : ''}
        </div>`;
      }).join('');
      const spot = seat.type === 'player' && betting ? chipStack(seat, settle < 3) : '';
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

  // A busted hand's cards leave the table after a short look (js/tablefx.js); its total and BUST stay.
  const bustTaken = (hand) => !!(window.TableFX && window.TableFX.bustTaken(hand));

  function render() {
    if (!game) return;
    if (window.TableFX) window.TableFX.before();
    settle = settleStep();
    if (window.TableFX) window.TableFX.money($('bankroll'), game.bankroll, fmt);
    else $('bankroll').textContent = fmt(game.bankroll);
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
    if (window.StatsView) { window.StatsView.refresh(); $('stats-btn').classList.toggle('on', window.StatsView.isOpen()); }
    if (window.TableFX) window.TableFX.after();
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
    if (mode.type === 'daily') {
      label = 'Hand';
      $('goal-stat').hidden = false;
      $('progress').hidden = false;
      $('goal-label').textContent = label;
      const n = Math.min(M.DAILY.hands, game.handNumber + (game.phase === 'betting' ? 1 : 0));
      $('goal').textContent = `${Math.max(1, n)}/${M.DAILY.hands}`;
      $('progress-fill').style.width = `${Math.round((game.handNumber / M.DAILY.hands) * 20) * 5}%`;
      return;
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
      const chips = CHIPS.map((v, n) => {
        const disabled = v > remaining || seat.bet + v > game.rules.maxBet;
        return `<button class="chip-btn${v === activeChip ? ' active-chip' : ''}" data-chip="${v}" ${disabled ? 'disabled' : ''} aria-label="Add ${v}" title="Add ${v} (key ${n + 1}). Drag it onto a seat, or scroll over a seat.">${PX.chip(v)}<span>${v}</span></button>`;
      }).join('');
      const withBets = players.filter((s) => s.bet > 0).length;
      const can = rebetCheck();
      c.innerHTML = `
        <div class="betting-for">Betting on seat ${seat.index + 1}: <strong>${fmt(seat.bet)}</strong>
          ${players.length > 1 ? '<span class="hint">(click one of your seats to switch)</span>' : ''}</div>
        <div class="chip-rack">${chips}</div>
        <div class="row bet-actions">
          <button class="btn btn-ghost btn-small" data-undo ${undoStack.length ? '' : 'disabled'} title="Undo the last change to your bets">Undo <kbd>U</kbd></button>
          <button class="btn btn-ghost btn-small" data-clear ${seat.bet ? '' : 'disabled'} title="Clear this seat's bet">Clear <kbd>C</kbd></button>
          ${players.length > 1 ? `<button class="btn btn-ghost btn-small" data-clear-all ${withBets ? '' : 'disabled'} title="Clear the bets on all your seats (Shift+C)">Clear all</button>` : ''}
          <button class="btn btn-ghost btn-small" data-rebet="1" ${can.one ? '' : 'disabled'} title="Bet the same as last hand">Rebet <kbd>R</kbd></button>
          <button class="btn btn-ghost btn-small" data-rebet="2" ${can.two ? '' : 'disabled'} title="Bet double what you bet last hand (Shift+R)">Rebet ×2</button>
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
    if (d.start !== undefined) {
      if (resumable(d.start)) chooseRun(d.start, d.diff);
      else startMode(d.start, d.start === 'daily' ? M.dailyDifficulty(M.localDay()) : d.diff);
      return;
    }
    if (d.locker !== undefined) { openSection(d.locker); return; }
    if (d.lore !== undefined) { showLore(); return; }
    if (d.settings !== undefined) { window.GameSounds.openSettings(); return; }
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
    if (d.chip !== undefined) { pickChip(+d.chip); return; }
    if (d.clear !== undefined) { clearSeat(); return; }
    if (d.clearAll !== undefined) { betChange(() => game.clearAllBets()); return; }
    if (d.undo !== undefined) { undoBet(); return; }
    if (d.rebet !== undefined) { betChange(() => game.rebet(+d.rebet)); return; }
    if (d.deal !== undefined) { startDeal(); return; }
    if (d.ins !== undefined) { doInsurance(+d.ins, d.take === '1'); return; }
    if (d.act !== undefined) { doAct(d.act); return; }
    if (t.classList.contains('seat') && game.phase === 'betting' && game.seats[+d.seat].type === 'player') {
      selectedSeat = +d.seat;
      render();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (!game || $('game').hidden || !$('overlay').hidden) return;
    if (e.ctrlKey || e.metaKey || e.altKey || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
    const key = e.key.toLowerCase();
    if (key === 't' && window.StatsView) { window.StatsView.toggle(); render(); return; }
    if (game.phase === 'playing') {
      const map = { h: 'hit', s: 'stand', d: 'double', p: 'split', r: 'surrender' };
      if (map[key]) doAct(map[key]);
    } else if (game.phase === 'insurance' && game.active && (key === 'i' || key === 'n')) {
      doInsurance(game.active.seat, key === 'i');
    } else if (game.phase === 'betting') {
      if (key === 'enter') {
        // Enter deals, even right after clicking a chip (which keeps focus on that chip).
        const btn = e.target.closest('button');
        if (btn && (btn.dataset.deal !== undefined || !btn.closest('#controls, #seats'))) return;   // its own click handles it
        e.preventDefault();
        startDeal();
        return;
      }
      const n = /^Digit([1-7])$/.exec(e.code);   // e.code, so Shift and keyboard layouts don't matter
      if (n) { pickChip(CHIPS[+n[1] - 1]); e.preventDefault(); return; }
      if (key === 'u' || key === 'backspace') { undoBet(); e.preventDefault(); return; }
      if (key === 'c') { if (e.shiftKey) betChange(() => game.clearAllBets()); else clearSeat(); return; }
      if (key === 'r') { betChange(() => game.rebet(e.shiftKey ? 2 : 1)); return; }
      if (key === 'arrowleft' || key === 'arrowright') { switchSeat(key === 'arrowleft' ? 1 : -1); e.preventDefault(); }
    }
  });

  // ---------- betting: chips, undo, rebet, scroll and drag ----------
  const betsNow = () => game.seats.map((s) => (s.type === 'player' ? s.bet : 0));
  const sameBets = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);
  // Every betting change goes through here so Undo can put the bets back.
  function betChange(fn) {
    if (!game || game.phase !== 'betting') return false;
    if (window.TableFX) window.TableFX.finishSettle();
    const before = betsNow();
    const ok = fn();
    if (ok && !sameBets(before, betsNow())) {
      undoStack.push(before);
      if (undoStack.length > 60) undoStack.shift();
      render();
    }
    return ok;
  }
  function undoBet() {
    if (!game || game.phase !== 'betting') return;
    while (undoStack.length) {
      const prev = undoStack.pop();
      if (game.restoreBets(prev)) { render(); return; }
    }
    render();
  }
  function pickChip(v) {
    if (!game || game.phase !== 'betting' || !v) return;
    activeChip = v;
    if (selectedSeat !== null) chipFromRack(selectedSeat, v);
    else render();
  }
  function clearSeat() { if (selectedSeat !== null) betChange(() => game.clearBet(selectedSeat)); }
  // Arrow keys move between your seats in the order they sit on screen (seat 1 is on the right).
  function switchSeat(dir) {
    const mine = game.playerSeats().map((s) => s.index);
    if (mine.length < 2) return;
    const at = Math.max(0, mine.indexOf(selectedSeat));
    selectedSeat = mine[(at + dir + mine.length) % mine.length];
    render();
  }
  function rebetCheck() {
    const last = game.lastBets;
    const out = { one: false, two: false };
    if (!last) return out;
    const now = betsNow();
    for (const mult of [1, 2]) {
      const want = game.seats.map((s, i) => (s.type === 'player' ? Math.min((last[i] || 0) * mult, game.rules.maxBet) : 0));
      const total = want.reduce((a, b) => a + b, 0);
      out[mult === 1 ? 'one' : 'two'] = total > 0 && total <= game.bankroll && !sameBets(want, now);
    }
    return out;
  }

  // Scroll over one of your seats: up adds the active chip, down takes it off.
  let wheelAt = 0;
  document.addEventListener('wheel', (e) => {
    if (!game || game.phase !== 'betting' || !$('overlay').hidden) return;
    const el = e.target.closest && e.target.closest('.seat[data-seat]');
    if (!el) return;
    const i = +el.dataset.seat;
    const seat = game.seats[i];
    if (!seat || seat.type !== 'player') return;
    e.preventDefault();
    const now = Date.now();
    if (now - wheelAt < 90 || !e.deltaY) return;   // trackpads send a stream of small events
    wheelAt = now;
    if (selectedSeat !== i) selectedSeat = i;
    if (e.deltaY < 0) chipFromRack(i, activeChip);
    else {
      const prev = chipsOn(i);
      const at = prev.lastIndexOf(activeChip);
      betChange(() => {
        if (!game.setBet(i, Math.max(0, seat.bet - activeChip))) return false;
        if (at >= 0) seatChips[i] = prev.slice(0, at).concat(prev.slice(at + 1));
        return true;
      });
    }
    render();
  }, { passive: false });

  // Drag a chip from the rack onto a seat (an open seat sits you there), or drag a seat's bet
  // onto another of your seats to move it, or off the table to take it back.
  let drag = null;
  let swallowClick = false;
  document.addEventListener('pointerdown', (e) => {
    if (!game || game.phase !== 'betting' || e.button !== 0) return;
    const chipBtn = e.target.closest('.chip-btn:not([disabled])');
    const stack = !chipBtn && e.target.closest('.seat.player .bet-spot:not(.empty)');
    if (!chipBtn && !stack) return;
    const from = stack ? +stack.closest('.seat').dataset.seat : null;
    const value = chipBtn ? +chipBtn.dataset.chip : null;
    drag = { x: e.clientX, y: e.clientY, from, value, ghost: null, over: null, id: e.pointerId };
  });
  document.addEventListener('pointermove', (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.ghost) {
      if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 8) return;
      drag.ghost = document.createElement('div');
      drag.ghost.className = 'drag-chip';
      const amount = drag.value || game.seats[drag.from].bet;
      drag.ghost.innerHTML = PX.chip(drag.value || PX.breakdown(amount)[0]) + (drag.value ? '' : `<span>${fmt(amount)}</span>`);
      document.body.appendChild(drag.ghost);
      document.body.classList.add('chip-dragging');
    }
    drag.ghost.style.left = `${e.clientX}px`;
    drag.ghost.style.top = `${e.clientY}px`;
    const hit = document.elementFromPoint(e.clientX, e.clientY);
    const seatEl = hit && hit.closest('.seat[data-seat]');
    const over = seatEl ? +seatEl.dataset.seat : null;
    const ok = over !== null && over !== drag.from && (game.seats[over].type === 'player' || (!game.seats[over].type && drag.value));
    document.querySelectorAll('.seat.drop-target').forEach((n) => n.classList.remove('drop-target'));
    if (ok) seatEl.classList.add('drop-target');
    drag.over = ok ? over : null;
    drag.offTable = !seatEl && !(hit && hit.closest('.table'));
  });
  function endDrag(e, cancel) {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag;
    drag = null;
    document.body.classList.remove('chip-dragging');
    document.querySelectorAll('.seat.drop-target').forEach((n) => n.classList.remove('drop-target'));
    if (!d.ghost) return;   // a plain click: the click handler does the rest
    d.ghost.remove();
    swallowClick = true;
    setTimeout(() => { swallowClick = false; }, 0);
    if (cancel || !game || game.phase !== 'betting') return;
    if (d.value && d.over !== null) {
      const i = d.over;
      activeChip = d.value;
      if (window.TableFX) window.TableFX.still();
      addChipTo(i, d.value, true);
      selectedSeat = i;
      render();
    } else if (d.from !== null && d.over !== null) {
      const moved = chipsOn(d.from); const there = chipsOn(d.over);
      if (window.TableFX) window.TableFX.still();
      if (betChange(() => { if (!game.moveBet(d.from, d.over)) return false; seatChips[d.over] = there.concat(moved); seatChips[d.from] = []; return true; })) { selectedSeat = d.over; render(); }
    } else if (d.from !== null && d.offTable) {
      betChange(() => game.clearBet(d.from));
    }
  }
  document.addEventListener('pointerup', (e) => endDrag(e, false));
  document.addEventListener('pointercancel', (e) => endDrag(e, true));
  window.addEventListener('click', (e) => { if (swallowClick) { e.stopImmediatePropagation(); e.preventDefault(); } }, true);

  function startDeal() {
    if (game.dealProblem()) { render(); return; }
    if (coach) coach.feedback = null;
    undoStack = [];
    const g = game;
    storeRun(g, true); // quitting mid-hand loses this hand's bets
    g.deal().catch((err) => { console.error(err); g.say('Something went wrong. Go back to the menu and start again.'); render(); });
  }

  $('stats-btn').addEventListener('click', () => { if (window.StatsView) { window.StatsView.toggle(); render(); } });
  $('to-menu').addEventListener('click', () => {
    if (!game) return;
    if (game.phase === 'betting' && mode.type === 'practice') { showMenu(); return; }
    if (resumable(mode.type) && game.phase === 'betting') { storeRun(game, false); showMenu(); return; }
    const lose = mode.type === 'practice' ? '<p>Your practice chips are not saved.</p>'
      : mode.type === 'daily' ? '<p>This Daily try ends here and does not count. You can play it again from the menu.</p>'
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
  // Cards move on the table (js/tablefx.js); it re-renders when a busted hand is taken away.
  if (window.TableFX) window.TableFX.init({ game: () => game, render: () => render() });
  // Settings > Table changes apply to a game in progress too.
  if (window.Prefs) window.Prefs.onChange(() => { if (game) { game.delay = window.Prefs.delay(); game.botPace = window.Prefs.botPace(); } });

  window.__blackjack = () => game; // handy for debugging in the browser console
  showMenu();
})();
