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
        ${reward && C ? `<div class="cos-toast-art">${C.swatch(reward)}</div>` : ''}
        <div>
          <div class="cos-toast-name">${a.name}</div>
          <div class="cos-toast-desc">${a.desc}</div>
          ${reward ? `<div class="cos-toast-reward">${rewardLine(a.id, reward)}</div>` : ''}
        </div>
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
