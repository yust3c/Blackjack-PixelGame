/*
 * Achievements: what the player has earned, and the trackers that detect it.
 * Each achievement unlocks one cosmetic (see cosmetics.js). Practice mode never unlocks anything.
 *
 * Load after engine.js, modes.js and cosmetics.js. Defines window.Achievements.
 * Hooks for ui.js:
 *   Achievements.startSession({ mode, difficulty, start })   when a Challenge/Endless/Practice game starts
 *   Achievements.roundEnd(game)                              from the game's onRoundEnd
 *   Achievements.challengeWon(difficultyId)                  when a Challenge goal is reached
 *   Achievements.endlessProgress(difficulty, objectivesReached, bankroll) after each Endless round
 * Every new unlock shows a toast and fires a document event 'achievement:unlocked' { detail: { achievement, reward } }.
 */
(function (root) {
  'use strict';

  const doc = root.document;
  const BJ = root.Blackjack;
  const ENDLESS_FALLBACK = [1500, 2500, 4000, 6000, 10000, 15000, 25000, 50000];

  // ======================================================================
  // The list. Harder (or luckier) means a higher rarity, which means a cooler reward.
  // ======================================================================
  const LIST = [
    // common
    { id: 'first_hand',     rarity: 'common',    group: 'Milestones', name: 'Take a Seat',      desc: 'Play your first hand in Challenge or Endless.' },
    { id: 'natural',        rarity: 'common',    group: 'Luck',       name: 'Natural',          desc: 'Get a blackjack.' },
    { id: 'insured',        rarity: 'common',    group: 'Luck',       name: 'Covered',          desc: 'Take insurance and see the dealer turn over a blackjack.' },
    { id: 'high_roller',    rarity: 'common',    group: 'Skill',      name: 'High Roller',      desc: 'Win a hand with a bet of 500 or more (doubles count).' },
    { id: 'bad_beat',       rarity: 'common',    group: 'Luck',       name: 'Bad Beat',         desc: 'Lose a 20 to the dealer\'s 21.' },
    { id: 'regular',        rarity: 'common',    group: 'Milestones', name: 'Regular',          desc: 'Play 100 hands.', counter: ['hands', 100] },
    // rare
    { id: 'beat_easy',      rarity: 'rare',      group: 'Challenge',  name: 'Warming Up',       desc: 'Beat Challenge on Easy.' },
    { id: 'beat_medium',    rarity: 'rare',      group: 'Challenge',  name: 'Getting Serious',  desc: 'Beat Challenge on Medium.' },
    { id: 'charlie',        rarity: 'rare',      group: 'Luck',       name: 'Five-Card Charlie', desc: 'Win a hand holding 5 or more cards.' },
    { id: 'meltdown',       rarity: 'rare',      group: 'Luck',       name: 'Dealer Meltdown',  desc: 'Watch the dealer bust with 5 or more cards.' },
    { id: 'double_trouble', rarity: 'rare',      group: 'Skill',      name: 'Double Trouble',   desc: 'Win 3 doubled hands in a row.' },
    { id: 'split_sweep',    rarity: 'rare',      group: 'Skill',      name: 'Clean Split',      desc: 'Split, then win every one of the hands.' },
    { id: 'endless_2500',   rarity: 'rare',      group: 'Endless',    name: 'On the Board',     desc: 'Reach 2500 chips in Endless.' },
    { id: 'veteran',        rarity: 'rare',      group: 'Milestones', name: 'Veteran',          desc: 'Play 1000 hands.', counter: ['hands', 1000] },
    // epic
    { id: 'beat_hard',      rarity: 'epic',      group: 'Challenge',  name: 'Hard Boiled',      desc: 'Beat Challenge on Hard.' },
    { id: 'double_natural', rarity: 'epic',      group: 'Luck',       name: 'Double Natural',   desc: 'Get 2 blackjacks in a row.' },
    { id: 'black_jack',     rarity: 'epic',      group: 'Luck',       name: 'The Black Jack',   desc: 'Blackjack with the A♠ and a black Jack.' },
    { id: 'triple_seven',   rarity: 'epic',      group: 'Luck',       name: 'Triple Seven',     desc: 'Make 21 with three 7s.' },
    { id: 'hot_streak',     rarity: 'epic',      group: 'Skill',      name: 'Hot Streak',       desc: 'Come out ahead 7 rounds in a row.' },
    { id: 'comeback',       rarity: 'epic',      group: 'Challenge',  name: 'Comeback Kid',     desc: 'Win a Challenge after dropping to a quarter of your starting chips.' },
    { id: 'endless_10k',    rarity: 'epic',      group: 'Endless',    name: 'Five Figures',     desc: 'Reach 10000 chips in Endless.' },
    // legendary (animated rewards)
    { id: 'beat_expert',    rarity: 'legendary', group: 'Challenge',  name: 'Card Shark',       desc: 'Beat Challenge on Expert.' },
    { id: 'grand_slam',     rarity: 'legendary', group: 'Challenge',  name: 'Grand Slam',       desc: 'Beat every Challenge difficulty.' },
    { id: 'hat_trick',      rarity: 'legendary', group: 'Luck',       name: 'Hat Trick',        desc: 'Get 3 blackjacks in a row.' },
    { id: 'four_of_a_kind', rarity: 'legendary', group: 'Luck',       name: 'Four Ways',        desc: 'Split into 4 hands and win at least 3 of them.' },
    { id: 'flawless',       rarity: 'legendary', group: 'Challenge',  name: 'Flawless',         desc: 'Beat Expert without ever ending a round below your starting chips.' },
    { id: 'endless_all',    rarity: 'legendary', group: 'Endless',    name: 'The Long Game',    desc: 'Complete Endless on every difficulty.' },
    { id: 'whale',          rarity: 'legendary', group: 'Endless',    name: 'Whale',            desc: 'Hold 100000 chips in Endless.' },

    // round 2: running totals and more hand achievements
    { id: 'winner',         rarity: 'common',    group: 'Totals',     name: 'Winner',           desc: 'Win 10 hands.', counter: ['handsWon', 10] },
    { id: 'bj_5',           rarity: 'common',    group: 'Totals',     name: 'Blackjack Fan',    desc: 'Get 5 blackjacks.', counter: ['blackjacks', 5] },
    { id: 'doubled_up',     rarity: 'common',    group: 'Skill',      name: 'Doubled Up',       desc: 'Win a doubled hand.' },
    { id: 'fold',           rarity: 'common',    group: 'Skill',      name: 'Live to Fight',    desc: 'Surrender a hand.' },
    { id: 'pocket_money',   rarity: 'common',    group: 'Totals',     name: 'Pocket Money',     desc: 'Win 1000 chips in total.', counter: ['chipsWon', 1000] },
    { id: 'centurion',      rarity: 'rare',      group: 'Totals',     name: 'Centurion',        desc: 'Win 100 hands.', counter: ['handsWon', 100] },
    { id: 'bj_25',          rarity: 'rare',      group: 'Totals',     name: 'Natural Talent',   desc: 'Get 25 blackjacks.', counter: ['blackjacks', 25] },
    { id: 'bankroll',       rarity: 'rare',      group: 'Totals',     name: 'Bankroll',         desc: 'Win 10000 chips in total.', counter: ['chipsWon', 10000] },
    { id: 'double_agent',   rarity: 'rare',      group: 'Totals',     name: 'Double Agent',     desc: 'Win 25 doubled hands.', counter: ['doublesWon', 25] },
    { id: 'bust_collector', rarity: 'rare',      group: 'Totals',     name: 'Bust Collector',   desc: 'See the dealer bust 50 times.', counter: ['dealerBusts', 50] },
    { id: 'soft_touch',     rarity: 'rare',      group: 'Luck',       name: 'Small Change',     desc: 'Make 21 with 4 or more cards.' },
    { id: 'big_score',      rarity: 'rare',      group: 'Skill',      name: 'Big Score',        desc: 'Win 1000 chips or more in a single round.' },
    { id: 'mirror_match',   rarity: 'rare',      group: 'Luck',       name: 'Mirror Match',     desc: 'Push 3 hands in a row.' },
    { id: 'five_hundred',   rarity: 'epic',      group: 'Totals',     name: 'Five Hundred',     desc: 'Win 500 hands.', counter: ['handsWon', 500] },
    { id: 'bj_100',         rarity: 'epic',      group: 'Totals',     name: 'Natural Born',     desc: 'Get 100 blackjacks.', counter: ['blackjacks', 100] },
    { id: 'fortune',        rarity: 'epic',      group: 'Totals',     name: 'Fortune',          desc: 'Win 100000 chips in total.', counter: ['chipsWon', 100000] },
    { id: 'table_sweep',    rarity: 'epic',      group: 'Skill',      name: 'Table Sweep',      desc: 'Play 3 or more seats in one round and win on every one.' },
    { id: 'lifer',          rarity: 'epic',      group: 'Milestones', name: 'Lifer',            desc: 'Play 5000 hands.', counter: ['hands', 5000] },
    { id: 'legend',         rarity: 'legendary', group: 'Totals',     name: 'Living Legend',    desc: 'Win 2000 hands.', counter: ['handsWon', 2000] },
    { id: 'bj_250',         rarity: 'legendary', group: 'Totals',     name: 'Blackjack Royalty', desc: 'Get 250 blackjacks.', counter: ['blackjacks', 250] },
    { id: 'millionaire',    rarity: 'legendary', group: 'Totals',     name: 'Millionaire',      desc: 'Win 1000000 chips in total.', counter: ['chipsWon', 1000000] },
    { id: 'six_shooter',    rarity: 'legendary', group: 'Luck',       name: 'Six Shooter',      desc: 'Make 21 with 6 or more cards.' },
    { id: 'untouchable',    rarity: 'legendary', group: 'Skill',      name: 'Untouchable',      desc: 'Come out ahead 10 rounds in a row.' },
    { id: 'worst_beat',     rarity: 'secret',    group: 'Secret',     name: 'Worst Beat',       desc: 'Lose a 20 to a dealer 21 made with 6 or more cards.', secret: true,
      hint: 'Secret. Some losses hurt more than others.' },
    // round 3
    { id: 'full_table',     rarity: 'common',    group: 'Table',      name: 'Full House',       desc: 'Play a round with all 7 seats filled.' },
    { id: 'photo_finish',   rarity: 'common',    group: 'Luck',       name: 'Photo Finish',     desc: 'Beat the dealer\'s 20 with a 21.' },
    { id: 'lucky_break',    rarity: 'common',    group: 'Luck',       name: 'Lucky Break',      desc: 'Win while holding 12, because the dealer busts.' },
    { id: 'overinsured',    rarity: 'common',    group: 'Luck',       name: 'Overinsured',      desc: 'Lose 5 insurance bets in a row.' },
    { id: 'dealer_streak',  rarity: 'rare',      group: 'Luck',       name: 'Dealer on Tilt',   desc: 'See the dealer bust 3 rounds in a row.' },
    { id: 'last_standing',  rarity: 'rare',      group: 'Table',      name: 'Last One Standing', desc: 'Win a round where 2 or more bots all bust.' },
    { id: 'all_in',         rarity: 'epic',      group: 'Skill',      name: 'All In',           desc: 'Bet your whole bankroll on one round and come out ahead.' },
    { id: 'counter',        rarity: 'epic',      group: 'Skill',      name: 'Card Counter',     desc: 'Win a 500 bet placed at a true count of +5 or more.' },
    { id: 'endless_easy',   rarity: 'rare',      group: 'Endless',    name: 'Orbit',            desc: 'Complete Endless on Easy.' },
    { id: 'endless_medium', rarity: 'epic',      group: 'Endless',    name: 'Star Cruiser',     desc: 'Complete Endless on Medium.' },
    { id: 'endless_hard',   rarity: 'epic',      group: 'Endless',    name: 'Red Planet',       desc: 'Complete Endless on Hard.' },
    { id: 'endless_expert', rarity: 'legendary', group: 'Endless',    name: 'Event Horizon',    desc: 'Complete Endless on Expert.' },
    // secrets: the hardest of all, each unlocks a full set
    { id: 'suited_royalty', rarity: 'secret',    group: 'Secret',     name: 'Suited Royalty',   desc: 'Blackjack with the A♥ and K♥ on a bet of 500.', secret: true,
      hint: 'Secret. Royalty only plays for high stakes.' },
    { id: 'seventh_heaven', rarity: 'secret',    group: 'Secret',     name: 'Seventh Heaven',   desc: 'Make 21 with three 7s of the same suit.', secret: true,
      hint: 'Secret. Lucky number, lucky suit.' },
    { id: 'completionist',  rarity: 'secret',    group: 'Secret',     name: 'Completionist',    desc: 'Unlock every other achievement.', secret: true,
      hint: 'Secret. Collect everything.' },
  ];
  const RANK = { common: 0, rare: 1, epic: 2, legendary: 3, secret: 4 };
  LIST.sort((a, b) => RANK[a.rarity] - RANK[b.rarity]);
  const byId = Object.fromEntries(LIST.map((a) => [a.id, a]));

  // ======================================================================
  // Saved progress
  // ======================================================================
  const SAVE_KEY = 'blackjack-achievements-v1';
  const blank = () => ({ unlocked: {}, stats: { hands: 0, rounds: 0, blackjacks: 0, handsWon: 0, chipsWon: 0, doublesWon: 0, dealerBusts: 0 } });
  let save = blank();
  try {
    const raw = root.localStorage.getItem(SAVE_KEY);
    if (raw) { const s = JSON.parse(raw); save = { unlocked: s.unlocked || {}, stats: Object.assign(blank().stats, s.stats || {}) }; }
  } catch (e) { /* no storage */ }
  function persist() { try { root.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

  for (const a of LIST) if (a.counter) a.progress = () => [Math.min(save.stats[a.counter[0]] || 0, a.counter[1]), a.counter[1]];

  function unlock(id) {
    if (!byId[id] || save.unlocked[id]) return false;
    save.unlocked[id] = Date.now();
    persist();
    const reward = root.Cosmetics ? root.Cosmetics.rewardFor(id) : null;
    toast(byId[id], reward);
    doc.dispatchEvent(new CustomEvent('achievement:unlocked', { detail: { achievement: byId[id], reward } }));
    if (id !== 'completionist' && LIST.every((a) => a.secret || save.unlocked[a.id])) unlock('completionist');
    if (root.Cosmetics) root.Cosmetics.refresh();
    return true;
  }

  // ======================================================================
  // Session trackers
  // ======================================================================
  let session = null;
  function startSession(opts) {
    const o = opts || {};
    session = {
      mode: o.mode || 'practice', difficulty: o.difficulty || null, start: o.start || 0,
      lowest: Infinity, alwaysAboveStart: true,
      bjStreak: 0, winStreak: 0, doubleStreak: 0, pushStreak: 0, insuranceLost: 0, dealerBustStreak: 0, countBefore: 0,
    };
  }
  const counts = () => session && session.mode !== 'practice';

  const value = (cards) => (BJ ? BJ.handValue(cards).total : 0);
  const isBJ = (cards) => (BJ ? BJ.isBlackjack(cards) : false);
  const won = (h) => h.result === 'win' || h.result === 'blackjack';

  function roundEnd(game) {
    if (!counts()) return [];
    const before = Object.keys(save.unlocked).length;
    const seats = game.seats.filter((s) => s.type === 'player' && s.hands && s.hands.length);
    if (!seats.length) return [];

    const dealer = game.dealer.cards;
    const dealerTotal = value(dealer);
    const dealerBJ = isBJ(dealer);
    let roundNet = 0;
    let seatsWon = 0;

    save.stats.rounds++;
    if (game.shoe && game.shoe.roundsDealt === 1) session.countBefore = 0; // shuffled before this round
    for (const seat of seats) {
      // blackjack streak: count each seat's starting hand, in seat order
      const first = seat.hands[0];
      if (first.natural) {
        session.bjStreak++;
        save.stats.blackjacks++;
        unlock('natural');
        const [a, b] = first.cards;
        const has = (r, suits) => [a, b].some((c) => c.rank === r && suits.includes(c.suit));
        if (has('A', ['♠']) && has('J', ['♠', '♣'])) unlock('black_jack');
        if (has('A', ['♥']) && has('K', ['♥']) && first.bet >= 500) unlock('suited_royalty');
      } else {
        session.bjStreak = 0;
      }
      if (session.bjStreak >= 2) unlock('double_natural');
      if (session.bjStreak >= 3) unlock('hat_trick');

      if (seat.hands.length > 1) { // split
        const wins = seat.hands.filter(won).length;
        if (wins === seat.hands.length) unlock('split_sweep');
        if (seat.hands.length >= 4 && wins >= 3) unlock('four_of_a_kind');
      }

      let seatNet = 0;
      for (const h of seat.hands) {
        save.stats.hands++;
        roundNet += h.net || 0;
        seatNet += h.net || 0;
        const total = value(h.cards);
        if (won(h)) { save.stats.handsWon++; save.stats.chipsWon += Math.max(0, h.net || 0); }
        if (total === 21 && h.cards.length >= 4) unlock('soft_touch');
        if (total === 21 && h.cards.length >= 6) unlock('six_shooter');
        if (h.result === 'surrender') unlock('fold');
        session.pushStreak = h.result === 'push' ? session.pushStreak + 1 : 0;
        if (session.pushStreak >= 3) unlock('mirror_match');
        if (won(h) && h.cards.length >= 5) unlock('charlie');
        if (won(h) && h.bet >= 500) unlock('high_roller');
        if (h.result === 'lose' && total === 20 && dealerTotal === 21) unlock('bad_beat');
        if (h.result === 'lose' && total === 20 && dealerTotal === 21 && dealer.length >= 6) unlock('worst_beat');
        if (total === 21 && h.cards.length === 3 && h.cards.every((c) => c.rank === '7')) unlock('triple_seven');
        if (h.insurance > 0 && dealerBJ) unlock('insured');
        if (h.insurance > 0) { session.insuranceLost = dealerBJ ? 0 : session.insuranceLost + 1; if (session.insuranceLost >= 5) unlock('overinsured'); }
        if (won(h) && total === 21 && dealerTotal === 20) unlock('photo_finish');
        if (won(h) && total === 12 && dealerTotal > 21) unlock('lucky_break');
        if (won(h) && h.bet >= 500 && session.countBefore >= 5) unlock('counter');
        if (total === 21 && h.cards.length === 3 && h.cards.every((c) => c.rank === '7' && c.suit === h.cards[0].suit)) unlock('seventh_heaven');
        if (h.doubled) {
          session.doubleStreak = won(h) ? session.doubleStreak + 1 : 0;
          if (session.doubleStreak >= 3) unlock('double_trouble');
          if (won(h)) { save.stats.doublesWon++; unlock('doubled_up'); }
        }
      }
      if (seatNet > 0) seatsWon++;
    }

    if (dealer.length >= 5 && dealerTotal > 21) unlock('meltdown');
    if (dealerTotal > 21) save.stats.dealerBusts++;
    session.dealerBustStreak = dealerTotal > 21 ? session.dealerBustStreak + 1 : 0;
    if (session.dealerBustStreak >= 3) unlock('dealer_streak');
    if (game.seats.length >= 7 && game.seats.every((st) => st.type)) unlock('full_table');
    const bots = game.seats.filter((st) => st.type === 'bot' && st.hands && st.hands.length);
    if (bots.length >= 2 && bots.every((st) => st.hands.every((h) => h.result === 'bust')) && roundNet > 0) unlock('last_standing');
    const staked = seats.reduce((sum, st) => sum + st.hands.reduce((t, h) => t + (h.bet || 0) + (h.insurance || 0), 0), 0);
    const bankrollBefore = game.bankroll - roundNet;
    if (roundNet > 0 && staked > 0 && bankrollBefore - staked < 5) unlock('all_in');
    // count for the next round's bets (a fresh shoe starts at 0)
    session.countBefore = game.trueCount || 0;
    session.winStreak = roundNet > 0 ? session.winStreak + 1 : 0;
    if (session.winStreak >= 7) unlock('hot_streak');
    if (session.winStreak >= 10) unlock('untouchable');
    if (roundNet >= 1000) unlock('big_score');
    if (seats.length >= 3 && seatsWon === seats.length) unlock('table_sweep');

    session.lowest = Math.min(session.lowest, game.bankroll);
    if (game.bankroll < session.start) session.alwaysAboveStart = false;

    unlock('first_hand');
    for (const a of LIST) if (a.counter && (save.stats[a.counter[0]] || 0) >= a.counter[1]) unlock(a.id);
    persist();
    return Object.keys(save.unlocked).slice(before);
  }

  function challengeWon(difficultyId) {
    if (!session || session.mode === 'practice') return;
    unlock('beat_' + difficultyId);
    if (session.start && session.lowest <= session.start / 4) unlock('comeback');
    if (difficultyId === 'expert' && session.alwaysAboveStart) unlock('flawless');
    if (['easy', 'medium', 'hard', 'expert'].every((d) => save.unlocked['beat_' + d])) unlock('grand_slam');
  }

  /** Endless objectives can be one list, or one list per difficulty. */
  function objectivesFor(difficulty) {
    const o = root.Modes && root.Modes.ENDLESS_OBJECTIVES;
    if (Array.isArray(o)) return o;
    if (o && o[difficulty]) return o[difficulty];
    return ENDLESS_FALLBACK;
  }
  function endlessProgress(difficulty, objectivesReached, bankroll) {
    if (!session || session.mode !== 'endless') return;
    if (bankroll >= 2500) unlock('endless_2500');
    if (bankroll >= 10000) unlock('endless_10k');
    if (difficulty && objectivesReached >= objectivesFor(difficulty).length) unlock('endless_' + difficulty);
    if (['easy', 'medium', 'hard', 'expert'].every((d) => save.unlocked['endless_' + d])) unlock('endless_all');
    if (bankroll >= 100000) unlock('whale');
  }

  /** Grant what the existing save (modes.js) already proves, so earlier wins are not lost. */
  function syncFromModes() {
    if (!root.Modes) return;
    const m = root.Modes.load();
    for (const d of Object.keys(m.challengeWins || {})) if (m.challengeWins[d]) save.unlocked['beat_' + d] = save.unlocked['beat_' + d] || Date.now();
    if (['easy', 'medium', 'hard', 'expert'].every((d) => save.unlocked['beat_' + d])) save.unlocked.grand_slam = save.unlocked.grand_slam || Date.now();
    // Endless records: save.endless[difficulty] = { objectives, best } (older saves: endlessBest / endlessObjectives)
    const records = Object.entries(m.endless || {}).map(([d, r]) => [d, r || {}]);
    if (m.endlessBest || m.endlessObjectives) records.push([null, { best: m.endlessBest || 0, objectives: m.endlessObjectives || 0 }]);
    const grant = (id) => { save.unlocked[id] = save.unlocked[id] || Date.now(); };
    for (const [d, r] of records) {
      const best = r.best || 0;
      if (best >= 2500) grant('endless_2500');
      if (best >= 10000) grant('endless_10k');
      if (best >= 100000) grant('whale');
      if (d && (r.objectives || 0) >= objectivesFor(d).length) grant('endless_' + d);
    }
    if (['easy', 'medium', 'hard', 'expert'].every((d) => save.unlocked['endless_' + d])) grant('endless_all');
    persist();
  }

  // ======================================================================
  // Toast
  // ======================================================================
  const queue = [];
  let showing = false;
  let toastEl = null;
  const KIND = { back: 'card back', felt: 'felt', chips: 'chip set', face: 'card faces' };
  function rewardLine(id, reward) {
    const all = root.Cosmetics ? root.Cosmetics.rewardsFor(id) : [reward];
    if (all.length > 1) return `New set: ${reward.set || reward.name} (${all.map((r) => KIND[r.type]).join(', ')})`;
    return `New ${KIND[reward.type]}: ${reward.name}`;
  }
  function toast(a, reward) {
    queue.push([a, reward]);
    if (!showing) nextToast();
  }
  function nextToast() {
    const item = queue.shift();
    if (!item) { showing = false; return; }
    showing = true;
    const [a, reward] = item;
    const C = root.Cosmetics;
    const r = C ? C.RARITIES[a.rarity] : { name: a.rarity, color: '#ffd75e' };
    if (!toastEl) { toastEl = doc.createElement('div'); toastEl.className = 'cos-toast'; toastEl.setAttribute('role', 'status'); doc.body.appendChild(toastEl); }
    toastEl.style.setProperty('--rar', r.color);
    toastEl.innerHTML = `
      <div class="cos-toast-kicker">Achievement unlocked · ${r.name}</div>
      <div class="cos-toast-row">
        ${root.AchievementIcons ? `<div class="cos-toast-icon">${root.AchievementIcons.html(a.id, 48)}</div>` : ''}
        <div>
          <div class="cos-toast-name">${a.name}</div>
          <div class="cos-toast-desc">${a.desc}</div>
          ${reward ? `<div class="cos-toast-reward">${rewardLine(a.id, reward)}</div>` : ''}
        </div>
        ${reward && C ? `<div class="cos-toast-art">${C.swatch(reward)}</div>` : ''}
      </div>`;
    toastEl.classList.remove('show'); void toastEl.offsetWidth; toastEl.classList.add('show');
    setTimeout(() => { toastEl.classList.remove('show'); setTimeout(nextToast, 300); }, 4200);
  }

  syncFromModes();

  root.Achievements = {
    list: () => LIST.slice(),
    /** Name and description as the player should see them: secrets stay hidden until earned. */
    shown: (id) => { const a = byId[id]; if (!a) return null; return a.secret && !save.unlocked[id] ? { name: '???', desc: a.hint } : { name: a.name, desc: a.desc }; },
    get: (id) => byId[id] || null,
    isUnlocked: (id) => !!save.unlocked[id],
    stats: () => Object.assign({}, save.stats),
    startSession, roundEnd, challengeWon, endlessProgress, syncFromModes,
    unlock, // exposed for testing and the preview page
    showToast: (id) => byId[id] && toast(byId[id], root.Cosmetics ? root.Cosmetics.rewardFor(id) : null),
    reset: () => { save = blank(); persist(); },
  };
})(window);

/* Pixel-art logos for every achievement. 16 x 16, shaded, some animated.
   Each logo is drawn by a small function on a pixel grid, then outlined, then turned into an SVG strip
   (one 16 x 16 frame per animation step). Defines window.AchievementIcons:
     html(id, size)  -> <span class="ach-icon"> showing the logo (animated if it has frames)
     info(id)        -> { url, frames, dur }
*/
(function (root) {
  'use strict';

  const N = 16;
  const OUT = '#14101c';
  const C = {
    white: '#fbf6e6', paper: '#e8e0c8', shade: '#c8bfa4', ink: '#20202a',
    red: ['#ff8a8f', '#d8323a', '#7a141a'], blue: ['#9ad0ff', '#4f9cff', '#1a347a'], green: ['#a8f0a0', '#5fd068', '#1f7a45'],
    yellow: ['#fff6b0', '#ffd75e', '#c08a10'], orange: ['#ffd090', '#ff9a3a', '#a03a0a'], purple: ['#d0b0ff', '#a06aff', '#4a2a8a'],
    pink: ['#ffd0d8', '#ff9aa8', '#c0506a'], brown: ['#d8a070', '#a0683a', '#5a3418'], grey: ['#ffffff', '#c8ccd8', '#6a6e7a'],
    dark: ['#5a5a6a', '#2a2a36', '#101018'], cyan: ['#ffffff', '#9ae8ff', '#3a7ac0'],
  };
  const BLACK = ['#000000', '#000000', '#000000'];
  const METAL = {
    bronze: ['#ffd0a0', '#e09a5a', '#8a4a1a'],
    silver: ['#ffffff', '#c8ccd8', '#6a6e7a'],
    gold: ['#fff6c0', '#ffd75e', '#b8860b'],
    crystal: ['#ffffff', '#9ae8ff', '#3a7ac0'],
  };

  // ---------- tiny font (3 x 5) and suits (5 x 5) ----------
  const FONT = {
    0: ['111', '101', '101', '101', '111'], 1: ['010', '110', '010', '010', '111'], 2: ['111', '001', '111', '100', '111'],
    3: ['111', '001', '111', '001', '111'], 4: ['101', '101', '111', '001', '001'], 5: ['111', '100', '111', '001', '111'],
    6: ['111', '100', '111', '101', '111'], 7: ['111', '001', '010', '010', '010'], 8: ['111', '101', '111', '101', '111'],
    9: ['111', '101', '111', '001', '111'], A: ['010', '101', '111', '101', '101'], J: ['001', '001', '001', '101', '010'],
    K: ['101', '110', '100', '110', '101'], x: ['000', '101', '010', '101', '000'], $: ['011', '110', '010', '011', '110'],
    '+': ['000', '010', '111', '010', '000'], '-': ['000', '000', '111', '000', '000'],
  };
  const SUIT = {
    h: ['.X.X.', 'XXXXX', 'XXXXX', '.XXX.', '..X..'],
    s: ['..X..', '.XXX.', 'XXXXX', '..X..', '.XXX.'],
    d: ['..X..', '.XXX.', 'XXXXX', '.XXX.', '..X..'],
    c: ['.XXX.', '.XXX.', 'XXXXX', '..X..', '.XXX.'],
  };

  // ---------- drawing helpers ----------
  function makeGrid() { return Array.from({ length: N }, () => Array(N).fill(null)); }
  function P(g) {
    const set = (x, y, c) => { x = Math.round(x); y = Math.round(y); if (x >= 0 && y >= 0 && x < N && y < N && c) g[y][x] = c; };
    const api = {
      set(x, y, c) { set(x, y, c); return api; },
      rect(x, y, w, h, c) { for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) set(x + i, y + j, c); return api; },
      // shaded disc / ellipse, lit from the top-left. ramp = [light, mid, dark]
      disc(cx, cy, rx, ry, ramp, flat) {
        ry = ry || rx;
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry;
          if (dx * dx + dy * dy > 1) continue;
          if (flat) { set(x, y, ramp[1]); continue; }
          const l = -dx * 0.7 - dy * 0.7;
          set(x, y, l > 0.45 ? ramp[0] : l < -0.35 ? ramp[2] : ramp[1]);
        }
        return api;
      },
      ring(cx, cy, r1, r2, c) {
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
          if (d >= r1 && d <= r2) set(x, y, typeof c === 'function' ? c(x, y, d) : c);
        }
        return api;
      },
      line(x0, y0, x1, y1, c) {
        const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)) || 1;
        for (let i = 0; i <= n; i++) set(x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n, c);
        return api;
      },
      poly(pts, c) {
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
          const px = x + 0.5, py = y + 0.5; let inside = false;
          for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
            const [xi, yi] = pts[i], [xj, yj] = pts[j];
            if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) inside = !inside;
          }
          if (inside) set(x, y, typeof c === 'function' ? c(x, y) : c);
        }
        return api;
      },
      bitmap(rows, x0, y0, c, scale = 1) {
        rows.forEach((row, y) => [...row].forEach((ch, x) => {
          if (ch === '1' || ch === 'X') for (let sy = 0; sy < scale; sy++) for (let sx = 0; sx < scale; sx++) set(x0 + x * scale + sx, y0 + y * scale + sy, c);
        }));
        return api;
      },
      text(str, x, y, c) { [...String(str)].forEach((ch, i) => FONT[ch] && api.bitmap(FONT[ch], x + i * 4, y, c)); return api; },
      suit(s, x, y, c) { return api.bitmap(SUIT[s], x, y, c); },
      sparkle(x, y, c, big) {
        set(x, y, c); set(x - 1, y, c); set(x + 1, y, c); set(x, y - 1, c); set(x, y + 1, c);
        if (big) { set(x - 2, y, c); set(x + 2, y, c); set(x, y - 2, c); set(x, y + 2, c); }
        return api;
      },
      // playing card with a shaded edge; rank top-left and a suit pip bottom-right
      card(x, y, w, h, rank, suit, color, opts = {}) {
        api.rect(x, y, w, h, opts.face || C.white);
        api.rect(x + w - 1, y + 1, 1, h - 1, C.shade); api.rect(x + 1, y + h - 1, w - 1, 1, C.shade);
        if (opts.border) { api.rect(x, y, w, 1, opts.border); api.rect(x, y + h - 1, w, 1, opts.border); api.rect(x, y, 1, h, opts.border); api.rect(x + w - 1, y, 1, h, opts.border); }
        if (rank) api.text(rank, x + 1, y + 1, color);
        if (suit) api.suit(suit, x + w - 6, y + h - 6, color);
        return api;
      },
    };
    return api;
  }
  // dark outline round every filled shape
  function outline(g, c = OUT) {
    const filled = (x, y) => y >= 0 && y < N && x >= 0 && x < N && g[y][x] && g[y][x] !== c;
    const add = [];
    for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
      if (g[y][x]) continue;
      if (filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1)) add.push([x, y]);
    }
    for (const [x, y] of add) g[y][x] = c;
    return g;
  }

  // ---------- shared shapes ----------
  function trophy(metal) {
    return (p) => {
      const m = METAL[metal];
      p.poly([[3, 2], [13, 2], [12, 7], [9, 10], [7, 10], [4, 7]], (x) => (x < 6 ? m[0] : x > 10 ? m[2] : m[1]));
      p.ring(3, 5, 1.6, 2.6, m[2]).ring(13, 5, 1.6, 2.6, m[2]);
      p.rect(7, 10, 2, 2, m[1]).rect(5, 12, 6, 1, m[1]).rect(4, 13, 8, 2, m[2]).rect(4, 13, 8, 1, m[1]);
      p.rect(5, 3, 1, 3, '#ffffff');
    };
  }
  function medal(metal) {
    return (p) => {
      const m = METAL[metal];
      p.poly([[3, 0], [6, 0], [9, 6], [6, 7]], C.red[1]).poly([[10, 0], [13, 0], [10, 7], [7, 6]], C.blue[1]);
      p.line(4, 0, 7, 6, C.red[0]).line(11, 0, 9, 5, C.blue[0]);
      p.disc(8, 10.5, 5, 5, m);
      p.ring(8, 10.5, 3.2, 3.9, m[2]);
      p.poly([[8, 7.6], [9, 9.6], [11, 9.8], [9.5, 11.2], [10, 13.2], [8, 12], [6, 13.2], [6.5, 11.2], [5, 9.8], [7, 9.6]], m[0]);
    };
  }
  function hourglass(metal) {
    return (p, f) => {
      const m = METAL[metal]; const k = f || 0;
      p.rect(3, 1, 10, 2, C.brown[1]).rect(3, 1, 10, 1, C.brown[0]).rect(3, 13, 10, 2, C.brown[1]).rect(3, 14, 10, 1, C.brown[2]);
      p.poly([[4, 3], [12, 3], [9, 8], [12, 13], [4, 13], [7, 8]], '#e8f4ff');
      p.rect(4, 3, 1, 1, '#ffffff');
      p.poly([[5 + k * 0.5, 4 + k], [11 - k * 0.5, 4 + k], [8.6, 7.5], [7.4, 7.5]], m[1]);
      p.poly([[4.5, 13], [11.5, 13], [8, 10 - k * 0.6]], m[1]);
      p.rect(7, 12, 1, 1, m[0]);
      if (f !== undefined) for (let y = 8; y < 12; y++) if ((y + f) % 2 === 0) p.set(8, y, m[0]);
    };
  }
  function ace(metal) {
    return (p) => {
      const m = METAL[metal];
      p.rect(3, 1, 10, 14, m[1]).rect(3, 1, 10, 1, m[0]).rect(3, 1, 1, 14, m[0]).rect(12, 2, 1, 13, m[2]).rect(4, 14, 9, 1, m[2]);
      p.rect(4, 2, 8, 12, C.white).rect(11, 3, 1, 11, C.shade);
      p.bitmap(FONT.A, 5, 3, C.ink, 1);
      p.suit('s', 6, 8, C.ink);
    };
  }
  function coins(metal) {
    return (p) => {
      const m = METAL[metal];
      const coin = (x, y) => { p.disc(x + 3.5, y + 1.5, 3.5, 1.6, m, true); p.rect(x, y + 2, 7, 1, m[2]); p.rect(x + 1, y + 1, 3, 1, m[0]); };
      for (let i = 0; i < 4; i++) coin(1, 12 - i * 2);
      for (let i = 0; i < 6; i++) coin(8, 12 - i * 2);
      p.text('$', 2, 1, m[2]);
    };
  }
  function infinity(metal) {
    return (p) => {
      const m = METAL[metal];
      const col = (x, y) => (y < 7 ? m[0] : y > 9 ? m[2] : m[1]);
      p.ring(4.8, 8, 2, 3.8, col).ring(11.2, 8, 2, 3.8, col);
      p.line(6, 6, 10, 10, m[1]).line(6, 10, 10, 6, m[1]).line(7, 6, 9, 8, m[0]);
    };
  }
  function moneyBag(ramp, coin) {
    return (p) => {
      p.disc(8, 10.5, 6, 5, ramp);
      p.poly([[6, 3], [10, 3], [9, 6], [7, 6]], ramp[1]);
      p.rect(6, 5, 4, 1, ramp[2]).rect(5, 2, 2, 1, ramp[1]).rect(9, 2, 2, 1, ramp[1]);
      p.text('$', 7, 8, coin);
    };
  }
  function boom(ramp) {
    return (p) => {
      const pts = []; const spikes = 9;
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2;
        const r = i % 2 ? 3.2 : 7.4;
        pts.push([8 + Math.cos(a) * r, 8 + Math.sin(a) * r]);
      }
      p.poly(pts, ramp[1]);
      p.disc(8, 8, 3.6, 3.6, [ramp[0], ramp[0], ramp[1]], true);
      p.disc(8, 8, 1.8, 1.8, ['#ffffff', '#ffffff', '#ffffff'], true);
    };
  }
  function chipX2(ramp) {
    return (p) => {
      p.disc(8, 8, 7, 7, ramp);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.set(8 + Math.cos(a) * 6, 8 + Math.sin(a) * 6, C.white); }
      p.disc(8, 8, 4.6, 4.6, [ramp[1], ramp[1], ramp[1]], true);
      p.text('x2', 3, 6, '#ffffff');
    };
  }
  const RAIN = ['#ff4f6a', '#ff9a3a', '#ffe066', '#5fd068', '#4fb0ff', '#a06aff'];

  // ======================================================================
  // The logos. draw(p, f) paints frame f; `frames` and `dur` make it animated.
  // `post` paints after the outline (sparkles and glows that should not get an outline).
  // ======================================================================
  const ICONS = {
    // ----- common -----
    first_hand: { draw(p) {
      p.disc(8, 3.5, 6, 2.5, C.red); p.rect(3, 5, 10, 1, C.red[2]);
      p.rect(7, 6, 2, 6, C.grey[1]).rect(7, 6, 1, 6, C.grey[0]);
      p.rect(4, 10, 8, 1, C.grey[2]);
      p.line(6, 11, 3, 15, C.grey[1]).line(9, 11, 12, 15, C.grey[1]).line(7, 12, 7, 15, C.grey[2]);
    } },
    natural: { draw(p) {
      p.card(1, 1, 8, 13, 'A', 's', C.ink);
      p.card(7, 3, 8, 13, 'J', 'h', C.red[1]);
    } },
    insured: { draw(p) {
      p.poly([[2, 2], [14, 2], [14, 8], [8, 15], [2, 8]], (x) => (x < 6 ? C.blue[0] : x > 10 ? C.blue[2] : C.blue[1]));
      p.rect(3, 3, 10, 1, C.blue[0]);
      p.line(5, 8, 7, 10, '#ffffff').line(7, 10, 11, 5, '#ffffff').line(5, 9, 7, 11, C.white).line(7, 11, 11, 6, C.white);
    } },
    high_roller: { draw(p) {
      const cols = [C.purple, C.red, C.purple, C.blue, C.purple, C.green];
      cols.forEach((c, i) => { const y = 13 - i * 2; p.disc(8, y, 5.5, 2, c, true); p.rect(3, y + 1, 11, 1, c[2]); p.set(5, y, '#ffffff'); p.set(8, y, '#ffffff'); p.set(11, y, '#ffffff'); });
      p.disc(8, 2.6, 5.5, 2, C.purple, true); p.rect(6, 2, 4, 1, C.purple[0]);
    } },
    bad_beat: { draw(p) {
      p.card(2, 1, 12, 14, '20', null, C.ink);
      p.line(9, 1, 7, 6, C.red[2]).line(7, 6, 10, 10, C.red[2]).line(10, 10, 8, 14, C.red[2]);
      p.suit('h', 3, 8, C.red[1]);
    } },
    regular: { draw: hourglass('bronze') },
    winner: { draw: trophy('bronze') },
    bj_5: { draw: ace('bronze') },
    doubled_up: { draw: chipX2(C.green) },
    fold: { draw(p) {
      p.rect(2, 1, 1, 15, C.brown[1]);
      p.poly([[3, 2], [9, 1], [14, 3], [14, 9], [9, 8], [3, 9]], (x, y) => ((x + Math.floor(y / 3)) % 5 === 0 ? C.shade : C.white));
    } },
    pocket_money: { draw: coins('bronze') },
    full_table: { draw(p) {
      p.disc(8, 8, 7, 5, C.brown, true); p.disc(8, 8, 5.6, 3.8, C.green);
      p.text('7', 7, 6, C.yellow[1]);
      [[2, 3], [8, 1], [14, 3], [1, 11], [15, 11], [5, 14], [11, 14]].forEach(([x, y]) => p.set(x, y, C.red[1]));
    } },
    photo_finish: { draw(p) {
      p.rect(1, 4, 14, 10, C.dark[1]).rect(1, 4, 14, 1, C.dark[0]).rect(3, 2, 4, 2, C.dark[1]).rect(11, 5, 2, 1, C.yellow[1]);
      p.disc(8, 9, 4, 4, C.grey, true); p.disc(8, 9, 3, 3, C.blue); p.set(7, 8, '#ffffff');
    } },
    lucky_break: { draw(p) {
      for (const [cx, cy] of [[5, 5], [11, 5], [5, 10], [11, 10]]) p.disc(cx, cy, 3.3, 3.3, C.green);
      p.line(8, 9, 10, 15, C.green[2]);
      p.set(8, 7, C.green[2]); p.set(6, 4, C.green[0]); p.set(10, 4, C.green[0]);
    } },
    overinsured: { draw(p) {
      p.poly([[1, 8], [3, 4], [8, 2], [13, 4], [15, 8]], (x) => (Math.floor(x / 3) % 2 ? C.red[1] : C.white));
      p.rect(1, 8, 15, 1, C.red[2]);
      p.rect(8, 8, 1, 6, C.brown[2]).rect(6, 14, 2, 1, C.brown[2]).set(6, 13, C.brown[2]);
      [[2, 11], [4, 14], [12, 11], [14, 14], [11, 15]].forEach(([x, y]) => p.set(x, y, C.blue[1]));
    } },

    // ----- rare -----
    beat_easy: { draw: medal('bronze') },
    beat_medium: { draw: medal('silver') },
    charlie: { draw(p) {
      for (let i = 0; i < 4; i++) { const x = 1 + i * 2, y = 5 - i; p.card(x, y, 6, 10, null, null, C.ink); p.rect(x, y, 1, 10, C.shade); }
      p.card(9, 1, 6, 10, '5', null, C.red[1]);
      p.suit('h', 10, 6, C.red[1]);
    } },
    meltdown: { draw: boom(C.orange) },
    double_trouble: { draw(p) { chipX2(C.red)(p); p.rect(12, 0, 3, 3, C.yellow[1]).set(13, 1, '#ffffff'); } },
    split_sweep: { draw(p) {
      p.card(1, 5, 6, 9, '8', null, C.ink); p.card(9, 5, 6, 9, '8', null, C.ink);
      p.line(8, 1, 4, 4, C.green[1]).line(8, 1, 12, 4, C.green[1]).rect(7, 0, 2, 2, C.green[1]);
      p.line(2, 11, 3, 12, C.green[2]).line(3, 12, 5, 9, C.green[2]); p.line(10, 11, 11, 12, C.green[2]).line(11, 12, 13, 9, C.green[2]);
    } },
    endless_2500: { draw: infinity('bronze') },
    veteran: { draw: hourglass('silver') },
    centurion: { draw: trophy('silver') },
    bj_25: { draw: ace('silver') },
    bankroll: { draw: coins('silver') },
    double_agent: { draw(p) {
      p.poly([[2, 5], [14, 5], [12, 2], [4, 2]], C.dark[1]); p.rect(0, 5, 16, 2, C.dark[2]); p.rect(4, 4, 8, 1, C.red[1]);
      p.disc(5, 10, 3, 2.4, C.dark); p.disc(11, 10, 3, 2.4, C.dark); p.rect(7, 9, 2, 1, C.dark[1]);
      p.set(4, 9, '#ffffff'); p.set(10, 9, '#ffffff');
    } },
    bust_collector: { draw: boom(C.blue) },
    soft_touch: { draw(p) {
      p.poly([[13, 1], [15, 2], [10, 9], [4, 14], [3, 13], [7, 7]], (x, y) => (x + y < 15 ? C.white : C.shade));
      p.line(14, 2, 3, 14, C.grey[2]);
      p.text('21', 1, 1, C.red[1]);
    } },
    big_score: { draw: moneyBag(C.brown, C.yellow[1]) },
    mirror_match: { draw(p) {
      p.disc(8, 6, 5.5, 5.5, C.grey, true); p.disc(8, 6, 4.3, 4.3, C.cyan);
      p.line(6, 3, 5, 5, '#ffffff');
      p.rect(7, 11, 2, 4, C.brown[1]).rect(6, 15, 4, 1, C.brown[2]);
      p.rect(6, 6, 4, 1, C.blue[2]).rect(6, 8, 4, 1, C.blue[2]);
    } },
    dealer_streak: { draw(p) {
      p.poly([[1, 4], [7, 7], [1, 11]], C.red[1]).poly([[15, 4], [9, 7], [15, 11]], C.red[1]);
      p.line(2, 5, 2, 9, C.red[0]).line(14, 9, 14, 6, C.red[2]);
      p.rect(6, 6, 4, 3, C.red[2]).rect(7, 6, 2, 1, C.red[0]);
      p.sparkle(3, 1, C.yellow[1]); p.sparkle(13, 13, C.yellow[1]);
    } },
    last_standing: { draw(p) {
      p.disc(8, 3, 2.5, 2.5, C.grey); p.rect(6, 5, 4, 1, C.grey[1]); p.poly([[6, 6], [10, 6], [11, 12], [5, 12]], (x) => (x < 8 ? C.grey[0] : C.grey[1]));
      p.rect(4, 12, 8, 3, C.grey[2]).rect(4, 12, 8, 1, C.grey[1]);
      p.rect(0, 13, 3, 2, C.dark[0]).rect(13, 13, 3, 2, C.dark[0]);
    } },
    endless_easy: { draw(p) {
      p.disc(8, 8, 5, 5, C.orange);
      p.rect(4, 7, 8, 1, C.orange[2]);
      p.line(0, 11, 15, 5, C.paper).line(1, 11, 15, 6, C.shade);
      p.disc(8, 6.5, 4, 3.5, C.orange); // planet covers the back of the ring
      p.set(5, 5, C.orange[0]);
    } },

    // ----- epic -----
    beat_hard: { draw: medal('gold') },
    double_natural: { draw(p) {
      p.card(1, 1, 8, 13, 'A', 's', C.ink); p.card(7, 3, 8, 13, 'A', 'h', C.red[1]);
      p.sparkle(14, 1, C.yellow[1]);
    } },
    black_jack: { draw(p) {
      p.card(3, 1, 10, 14, 'J', null, C.ink, { border: C.yellow[1] });
      p.suit('s', 6, 7, C.ink);
      p.rect(4, 13, 8, 1, C.yellow[2]);
    } },
    triple_seven: { frames: 6, dur: 1.4, draw(p, f) {
      p.rect(0, 2, 16, 12, C.red[1]).rect(0, 2, 16, 1, C.red[0]).rect(0, 13, 16, 1, C.red[2]);
      p.rect(1, 4, 14, 8, C.white);
      const spin = ['3', '5', '9', '1', '6', '2'];
      for (let i = 0; i < 3; i++) {
        const settled = f >= 2 + i;
        p.text(settled ? '7' : spin[(f * 2 + i) % 6], 2 + i * 5, 5, settled ? C.red[1] : C.grey[2]);
      }
      if (f >= 4) p.rect(1, 10, 14, 1, C.yellow[1]);
    } },
    hot_streak: { frames: 4, dur: 0.5, draw(p, f) {
      const sway = [0, 1, 0, -1][f];
      p.poly([[8 + sway, 0], [13, 7], [13, 12], [10, 15], [6, 15], [3, 12], [3, 7], [6 + sway, 4]], C.red[1]);
      p.poly([[8 - sway, 4], [11, 9], [11, 13], [8, 15], [5, 13], [5, 9]], C.orange[1]);
      p.poly([[8 + sway, 8], [10, 11], [9, 15], [7, 15], [6, 11]], C.yellow[1]);
      p.rect(7, 12, 2, 2, '#ffffff');
    } },
    comeback: { draw(p) {
      p.rect(1, 14, 14, 1, C.grey[2]).rect(1, 2, 1, 13, C.grey[2]);
      p.line(2, 4, 6, 11, C.red[1]).line(6, 11, 9, 9, C.green[1]).line(9, 9, 14, 3, C.green[1]);
      p.poly([[11, 2], [15, 1], [14, 5]], C.green[1]);
    } },
    endless_10k: { draw: infinity('silver') },
    five_hundred: { draw: trophy('gold') },
    bj_100: { draw: ace('gold') },
    fortune: { draw: coins('gold') },
    table_sweep: { draw(p) {
      p.line(14, 0, 7, 8, C.brown[1]).line(15, 1, 8, 9, C.brown[2]);
      p.poly([[5, 7], [9, 10], [6, 15], [1, 13]], (x, y) => ((x + y) % 2 ? C.yellow[1] : C.yellow[2]));
      p.rect(5, 8, 3, 1, C.red[1]);
      p.set(10, 14, C.shade); p.set(12, 13, C.shade); p.set(13, 15, C.shade);
    } },
    lifer: { frames: 4, dur: 1.2, draw: hourglass('gold') },
    all_in: { draw(p) {
      for (let i = 0; i < 5; i++) { const y = 13 - i * 2; p.disc(5.5, y, 4.5, 1.8, C.red, true); p.rect(1, y + 1, 9, 1, C.red[2]); p.set(3, y, '#ffffff'); p.set(7, y, '#ffffff'); }
      p.disc(5.5, 3, 4.5, 1.8, C.red, true);
      p.poly([[11, 6], [15, 9], [11, 12]], C.green[1]).rect(9, 8, 3, 2, C.green[1]);
    } },
    counter: { frames: 8, dur: 2.4, draw(p, f) {
      if (f === 5) p.rect(1, 8, 14, 1, C.ink);
      else {
        p.poly([[0, 8], [4, 4], [12, 4], [16, 8], [12, 12], [4, 12]], C.white);
        p.disc(8, 8, 3.5, 3.5, C.blue); p.disc(8, 8, 1.6, 1.6, BLACK, true); p.set(7, 6, '#ffffff');
      }
      p.text('+', 0, 0, C.green[1]); p.text('-', 12, 11, C.red[1]);
    } },
    endless_medium: { draw(p) {
      p.poly([[8, 0], [11, 5], [11, 11], [5, 11], [5, 5]], (x) => (x < 8 ? C.white : C.shade));
      p.disc(8, 6, 1.6, 1.6, C.blue, true);
      p.poly([[5, 7], [1, 12], [5, 11]], C.red[1]).poly([[11, 7], [15, 12], [11, 11]], C.red[2]);
      p.rect(6, 11, 4, 1, C.grey[2]);
      p.rect(7, 12, 2, 2, C.yellow[1]).set(7, 14, C.orange[1]).set(8, 15, C.orange[1]);
    } },
    endless_hard: { draw(p) {
      p.disc(8, 8, 7, 7, C.orange);
      [[5, 6], [10, 4], [9, 10], [4, 11], [12, 9]].forEach(([x, y]) => { p.set(x, y, C.orange[2]); p.set(x + 1, y, C.orange[2]); });
      p.rect(4, 2, 3, 1, '#ffffff');
    } },

    // ----- legendary (animated) -----
    beat_expert: { frames: 8, dur: 1.6, draw: medal('crystal'), post(p, f) { if (f < 4) p.sparkle(4 + f * 2, 8 + (f % 2) * 2, '#ffffff', f === 1); } },
    grand_slam: { frames: 4, dur: 1.2, draw(p) { trophy('gold')(p); }, post(p, f) {
      [[1, 1], [14, 1], [1, 13], [14, 13]].forEach(([x, y], i) => p.sparkle(x, y, i === f ? '#ffffff' : C.yellow[2], i === f));
    } },
    hat_trick: { frames: 6, dur: 1.5, draw(p, f) {
      const rise = [0, 1, 2, 3, 3, 3][f];
      if (rise) for (let i = 0; i < 3; i++) { const x = 3 + i * 4, y = 7 - rise - (i === 1 ? 1 : 0); p.card(x, y, 4, 5, null, null, C.ink); p.set(x + 1, y + 1, i === 1 ? C.red[1] : C.ink); }
      p.rect(3, 7, 10, 6, C.dark[1]).rect(3, 7, 2, 6, C.dark[0]).rect(3, 10, 10, 1, C.red[1]);
      p.rect(0, 13, 16, 2, C.dark[2]).rect(0, 13, 16, 1, C.dark[1]);
    }, post(p, f) { if (f >= 4) { p.sparkle(1, 2, C.yellow[1]); p.sparkle(14, 1, C.yellow[1], f === 4); } } },
    four_of_a_kind: { frames: 6, dur: 1.5, draw(p, f) {
      const spread = [0, 1, 2, 3, 3, 3][f];
      const suits = ['s', 'h', 'c', 'd'];
      for (let i = 0; i < 4; i++) {
        const x = 5 + Math.round((i - 1.5) * spread * 1.4), y = 3 + (i === 0 || i === 3 ? Math.round(spread / 2) : 0);
        const col = i % 2 ? C.red[1] : C.ink;
        p.card(x, y, 6, 10, null, null, col);
        p.suit(suits[i], x, y + 3, col);
      }
    }, post(p, f) { if (f === 4) p.sparkle(14, 1, C.yellow[0], true); if (f === 5) p.sparkle(1, 1, C.yellow[1]); } },
    flawless: { frames: 8, dur: 1.6, draw(p) {
      p.poly([[3, 3], [13, 3], [16, 7], [8, 15], [0, 7]], (x, y) => (y < 7 ? (x < 8 ? C.cyan[0] : C.cyan[1]) : x < 8 ? C.cyan[1] : C.cyan[2]));
      p.line(0, 7, 15, 7, C.cyan[2]).line(5, 3, 4, 7, C.cyan[0]).line(11, 3, 12, 7, C.cyan[2]).line(4, 7, 8, 14, C.cyan[0]);
    }, post(p, f) { const s = [[3, 4], [12, 5], [8, 10], [5, 6]][f % 4]; if (f < 4) p.sparkle(s[0], s[1], '#ffffff', f === 2); } },
    whale: { frames: 4, dur: 0.9, draw(p, f) {
      p.disc(7, 10, 7, 4.5, C.blue);
      p.rect(2, 12, 10, 2, C.cyan[1]);
      p.poly([[13, 9], [16, 6], [16, 12]], C.blue[2]);
      p.set(4, 9, C.ink); p.set(4, 8, '#ffffff');
    }, post(p, f) {
      const h = [2, 4, 5, 3][f];
      for (let i = 0; i < h; i++) p.set(7, 5 - i, C.cyan[i % 2]);
      if (h >= 4) { p.set(6, 5 - h + 1, C.cyan[1]); p.set(8, 5 - h + 1, C.cyan[1]); p.set(5, 5 - h + 2, C.cyan[0]); p.set(9, 5 - h + 2, C.cyan[0]); }
    } },
    endless_all: { frames: 8, dur: 1.6, draw: infinity('crystal'), post(p, f) {
      const path = [[3, 5], [2, 8], [3, 11], [6, 10], [9, 6], [12, 5], [14, 8], [12, 11]];
      const [x, y] = path[f]; p.sparkle(x, y, '#ffffff');
    } },
    legend: { frames: 8, dur: 1.6, draw: trophy('crystal'), post(p, f) { if (f < 4) p.sparkle(4 + f * 2, 3 + f, '#ffffff', f === 1); } },
    bj_250: { frames: 8, dur: 1.6, draw: ace('crystal'), post(p, f) {
      if (f < 5) { const k = f * 3; for (let y = 2; y < 14; y++) { const x = 3 + k - Math.floor(y / 2); if (x > 3 && x < 12) p.set(x, y, '#ffffff'); } }
    } },
    millionaire: { frames: 6, dur: 1.2, draw: moneyBag(C.cyan, C.blue[2]), post(p, f) {
      const ys = [1, 0, 1, 2, 3, 2];
      p.disc(14, ys[f] + 2, 1.8, 1.8, METAL.gold, true); p.disc(2, ys[(f + 3) % 6] + 3, 1.8, 1.8, METAL.gold, true);
    } },
    six_shooter: { frames: 6, dur: 1.2, draw(p, f) {
      const kick = f === 1 ? -1 : 0;
      p.rect(1, 4 + kick, 11, 3, C.grey[1]).rect(1, 4 + kick, 11, 1, C.grey[0]).rect(1, 6 + kick, 11, 1, C.grey[2]);
      p.disc(10, 7.5 + kick, 2.5, 2.5, C.grey); p.set(10, 7 + kick, C.grey[2]);
      p.poly([[9, 9], [13, 8], [14, 15], [10, 15]], C.brown[1]); p.rect(10, 9, 1, 6, C.brown[0]);
      p.line(7, 9, 8, 11, C.grey[2]);
      p.text('21', 1, 10, C.yellow[1]);
    }, post(p, f) { if (f === 1 || f === 2) p.sparkle(0, 5, f === 1 ? '#ffffff' : C.yellow[1], f === 1); } },
    untouchable: { frames: 6, dur: 1.2, draw(p) {
      p.poly([[2, 1], [14, 1], [14, 8], [8, 15], [2, 8]], (x) => (x < 6 ? METAL.gold[0] : x > 10 ? METAL.gold[2] : METAL.gold[1]));
      p.bitmap(['...X...', '..XXX..', 'XXXXXXX', '.XXXXX.', '..XXX..', '.XX.XX.', '.X...X.'], 4, 3, '#ffffff');
      p.set(7, 4, METAL.gold[0]).set(6, 5, METAL.gold[0]);
    }, post(p, f) { const s = [[0, 1], [15, 3], [1, 10], [14, 11], [8, 0], [8, 0]][f]; if (f < 4) p.sparkle(s[0], s[1], C.yellow[0]); } },
    endless_expert: { frames: 8, dur: 1.2, draw(p, f) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const dx = x + 0.5 - 8, dy = y + 0.5 - 8, d = Math.hypot(dx, dy * 2.6);
        if (d > 3.5 && d < 8) p.set(x, y, Math.sin(Math.atan2(dy, dx) * 3 - (f * Math.PI) / 4 + d * 0.5) > 0 ? C.orange[1] : C.orange[2]);
      }
      p.ring(8, 8, 3.4, 4.4, (x, y) => (y < 8 ? C.yellow[0] : null));
      p.disc(8, 8, 3.4, 3.4, BLACK, true);
    } },

    // ----- secret (animated) -----
    worst_beat: { frames: 8, dur: 2.4, draw(p, f) {
      const split = [0, 0, 0, 1, 1, 1, 1, 0][f];
      const crackX = [8, 9, 7, 8, 9, 8, 7, 8, 9, 8, 8, 8, 8, 8, 8, 8];
      const shape = [[2, 5], [4, 2], [6.5, 2], [8, 4], [9.5, 2], [12, 2], [14, 5], [14, 7], [8, 13.5], [2, 7]];
      const half = (dx, dy, left) => p.poly(shape.map(([x, y]) => [x + dx, y + dy]), (x, y) => {
        const ox = x - dx, oy = y - dy;
        if (left ? ox >= crackX[oy] : ox <= crackX[oy]) return null;
        return ox < 5 && oy < 6 ? C.red[0] : oy > 9 ? C.red[2] : C.red[1];
      });
      half(-split, 0, true); half(split, split ? 1 : 0, false);
      if (!split) for (let y = 3; y < 13; y++) p.set(crackX[y], y, f === 2 ? C.red[2] : C.red[1]);
    }, post(p, f) { if (f >= 4 && f <= 6) { p.set(8, 12 + (f - 4), C.blue[0]); p.set(8, 11 + (f - 4), C.blue[1]); } } },
    suited_royalty: { frames: 6, dur: 1.2, draw(p) {
      p.poly([[1, 3], [4, 7], [8, 1], [12, 7], [15, 3], [14, 10], [2, 10]], (x, y) => (y < 6 ? METAL.gold[0] : METAL.gold[1]));
      p.rect(2, 10, 12, 2, METAL.gold[2]);
      p.suit('h', 6, 5, C.red[1]);
      p.suit('h', 3, 11, C.red[1]); p.suit('h', 8, 11, C.red[1]);
    }, post(p, f) { const s = [[1, 2], [8, 0], [15, 2]][f % 3]; if (f < 3) p.sparkle(s[0], s[1] + 1, '#ffffff', f === 1); } },
    seventh_heaven: { frames: 8, dur: 1.6, draw(p, f) {
      const drift = [0, 0, 1, 1, 0, 0, -1, -1][f];
      p.bitmap(['111111', '000011', '000110', '001100', '001100', '011000', '011000'], 5, 3, C.yellow[1]);
      p.bitmap(['111111'], 5, 3, C.yellow[0]); p.bitmap(['000001', '000010', '000100', '000100', '001000', '001000'], 5, 4, C.yellow[2]);
      p.disc(4 + drift, 13, 4, 2.6, C.grey); p.disc(9 + drift, 12, 4.4, 3.2, C.grey); p.disc(13 + drift, 13.5, 3, 2.2, C.grey);
    }, post(p, f) {
      const c = f % 4 < 2 ? C.yellow[0] : '#ffffff';
      p.rect(6, 0, 5, 1, c).set(5, 1, c).set(11, 1, c).rect(6, 2, 5, 1, C.yellow[1]);
      if (f === 3) p.sparkle(14, 4, '#ffffff'); if (f === 7) p.sparkle(2, 5, '#ffffff');
    } },
    completionist: { frames: 6, dur: 1.2, draw(p, f) {
      trophy('silver')(p);
      p.rect(6, 4, 5, 1, RAIN[f]); p.rect(6, 5, 5, 1, RAIN[(f + 1) % 6]); p.rect(7, 6, 3, 1, RAIN[(f + 2) % 6]);
    }, post(p, f) { p.sparkle(f % 2 ? 1 : 14, f % 3 === 0 ? 1 : 12, RAIN[f % 6], f % 2 === 0); } },
  };

  // ======================================================================
  // Rendering
  // ======================================================================
  const cache = {};
  function info(id) {
    if (cache[id]) return cache[id];
    const icon = ICONS[id] || { draw: (p) => p.text('?', 6, 5, C.white) };
    const frames = icon.frames || 1;
    let rects = '';
    for (let f = 0; f < frames; f++) {
      const g = makeGrid(); const p = P(g);
      icon.draw(p, icon.frames ? f : undefined);
      outline(g);
      if (icon.post) icon.post(p, f);
      for (let y = 0; y < N; y++) {
        let x = 0;
        while (x < N) {
          const c = g[y][x]; let w = 1;
          while (x + w < N && g[y][x + w] === c) w++;
          if (c) rects += `<rect x="${f * N + x}" y="${y}" width="${w}" height="1" fill="${c}"/>`;
          x += w;
        }
      }
    }
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${N * frames} ${N}" width="${N * frames * 4}" height="${N * 4}" shape-rendering="crispEdges">${rects}</svg>`;
    return (cache[id] = { url: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, frames, dur: icon.dur || 1 });
  }
  function html(id, size) {
    const i = info(id);
    const s = size || 48;
    return `<span class="ach-icon${i.frames > 1 ? ' anim' : ''}" style="--s:${s}px;--frames:${i.frames};--dur:${i.dur}s;background-image:${i.url.replace(/"/g, '&quot;')}" aria-hidden="true"></span>`;
  }

  root.AchievementIcons = { info, html, ids: () => Object.keys(ICONS) };
})(window);
