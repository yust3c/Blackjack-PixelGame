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
    // ---------- round 4 ----------
    { id: 'split_first', rarity: 'common', group: 'Skill', name: 'Splitter', desc: 'Split a pair for the first time.' },
    { id: 'push_first', rarity: 'common', group: 'Luck', name: 'Even Steven', desc: 'Push a hand with the dealer.' },
    { id: 'overeager', rarity: 'common', group: 'Luck', name: 'Overeager', desc: 'Bust 5 hands in a row.' },
    { id: 'company', rarity: 'common', group: 'Table', name: 'Good Company', desc: 'Play a round with 3 or more bots at the table.' },
    { id: 'doubler', rarity: 'common', group: 'Totals', name: 'Double Down', desc: 'Double down 25 times.', counter: ['doubles',  25] },
    { id: 'penny_pincher', rarity: 'common', group: 'Totals', name: 'Penny Pincher', desc: 'Win 25 hands at the table minimum bet.', counter: ['minWins',  25] },
    { id: 'soft_21', rarity: 'common', group: 'Luck', name: 'Soft Landing', desc: 'Make a soft 21 with 3 or more cards.' },
    { id: 'tourist', rarity: 'common', group: 'Table', name: 'Tourist', desc: 'Play a hand against all four dealers.' },
    { id: 'corner_regular', rarity: 'rare', group: 'Table', name: 'Corner Regular', desc: 'Play 250 hands at The Corner with Old Tito.', counter: ['hands_easy',  250] },
    { id: 'hotel_guest', rarity: 'rare', group: 'Table', name: 'Long Stay', desc: 'Play 250 hands at the Grand Hotel with Madame Odette.', counter: ['hands_medium',  250] },
    { id: 'tactical_retreat', rarity: 'rare', group: 'Totals', name: 'Tactical Retreat', desc: 'Surrender 15 hands.', counter: ['surrenders',  15] },
    { id: 'twin_aces', rarity: 'rare', group: 'Luck', name: 'Twin Aces', desc: 'Split Aces and make 21 on both hands.' },
    { id: 'daredevil', rarity: 'rare', group: 'Skill', name: 'Daredevil', desc: 'Hit on 20 and still win the hand.' },
    { id: 'standoff', rarity: 'rare', group: 'Luck', name: 'Standoff', desc: 'Push your blackjack against the dealer’s blackjack.' },
    { id: 'last_chip', rarity: 'rare', group: 'Skill', name: 'Last Chip', desc: 'Win a round when you had 25 chips or fewer left.' },
    { id: 'night_shift', rarity: 'rare', group: 'Milestones', name: 'Night Shift', desc: 'Play 150 hands in one session.' },
    { id: 'neon_owl', rarity: 'epic', group: 'Table', name: 'Neon Regular', desc: 'Play 250 hands at Neon with Vinnie.', counter: ['hands_hard',  250] },
    { id: 'vip_member', rarity: 'epic', group: 'Table', name: 'Members Only', desc: 'Play 250 hands in the VIP Lounge with Mr. Valdez.', counter: ['hands_expert',  250] },
    { id: 'seven_charlie', rarity: 'epic', group: 'Luck', name: 'Seven-Card Charlie', desc: 'Win a hand holding 7 cards.' },
    { id: 'steady_hands', rarity: 'epic', group: 'Skill', name: 'Steady Hands', desc: 'Play 50 hands in a row without busting.', counter: ['noBustStreak',  50] },
    { id: 'dealer_collapse', rarity: 'epic', group: 'Luck', name: 'Domino Effect', desc: 'See the dealer bust 5 rounds in a row.' },
    { id: 'split_double', rarity: 'epic', group: 'Skill', name: 'Split Decision', desc: 'Split, double on both hands and win both.' },
    { id: 'by_the_book', rarity: 'epic', group: 'Skill', name: 'By the Book', desc: 'Play 100 hands in a row following basic strategy.', counter: ['bookStreak',  100] },
    { id: 'speedrun', rarity: 'epic', group: 'Challenge', name: 'Speedrun', desc: 'Beat a Challenge in 30 rounds or fewer.' },
    { id: 'rigged', rarity: 'legendary', group: 'Luck', name: 'Rigged?', desc: 'The dealer gets blackjack 3 rounds in a row.' },
    { id: 'professor', rarity: 'legendary', group: 'Skill', name: 'The Professor', desc: 'Play 500 hands in a row following basic strategy.', counter: ['bookStreak',  500] },
    { id: 'lifetime', rarity: 'legendary', group: 'Milestones', name: 'Lifetime Member', desc: 'Play 10000 hands.', counter: ['hands',  10000] },
    { id: 'lone_wolf', rarity: 'legendary', group: 'Challenge', name: 'Lone Wolf', desc: 'Beat Hard with no bots at the table.' },
    { id: 'wolf_expert', rarity: 'legendary', group: 'Challenge', name: 'Apex Predator', desc: 'Beat Expert using only 2 seats every round.' },
    { id: 'high_society', rarity: 'legendary', group: 'Skill', name: 'High Society', desc: 'Win 5 hands in a row with a 500 bet.' },
    { id: 'bankrupt', rarity: 'common', group: 'Challenge', name: 'Busted Flat', desc: 'Lose a Challenge by running out of chips.' },
    { id: 'shuffler', rarity: 'common', group: 'Totals', name: 'New Shoe', desc: 'Sit through 50 reshuffles.', counter: ['shuffles',  50] },
    { id: 'perfect_pair', rarity: 'common', group: 'Luck', name: 'Perfect Pair', desc: 'Get dealt two identical cards (same rank and suit).' },
    { id: 'insomniac', rarity: 'common', group: 'Milestones', name: 'Insomniac', desc: 'Play a hand between 3 and 5 in the morning.' },
    { id: 'halfway', rarity: 'common', group: 'Endless', name: 'Halfway There', desc: 'Reach the 4th objective in any Endless run.' },
    { id: 'bot_whisperer', rarity: 'rare', group: 'Table', name: 'Bot Whisperer', desc: 'Win a round where every bot at the table loses.' },
    { id: 'disciplined', rarity: 'rare', group: 'Skill', name: 'Disciplined', desc: 'Bet the table minimum 20 times while the true count is -2 or lower.', counter: ['disciplined',  20] },
    { id: 'nerves_of_steel', rarity: 'rare', group: 'Skill', name: 'Nerves of Steel', desc: 'Stand on 12 against a dealer 10 and win.' },
    { id: 'weekend_warrior', rarity: 'rare', group: 'Milestones', name: 'Seven Days', desc: 'Play on 7 different days.', counter: ['daysPlayed',  7] },
    { id: 'phoenix', rarity: 'rare', group: 'Challenge', name: 'Phoenix', desc: 'Beat a Challenge difficulty after losing it 3 times.' },
    { id: 'split_blackjack', rarity: 'rare', group: 'Luck', name: 'Split Natural', desc: 'Split Aces and draw a 10-value card on one of them.' },
    { id: 'full_recovery', rarity: 'epic', group: 'Skill', name: 'Full Recovery', desc: 'Lose 5 rounds in a row, then win the next 5.' },
    { id: 'pro_counter', rarity: 'epic', group: 'Skill', name: 'Pro Counter', desc: 'Win 10 hands bet at 250+ while the true count is +3 or higher.', counter: ['proCount',  10] },
    { id: 'double_or_nothing', rarity: 'epic', group: 'Totals', name: 'Double or Nothing', desc: 'Win 100 doubled hands.', counter: ['doublesWon',  100] },
    { id: 'seven_up', rarity: 'legendary', group: 'Table', name: 'Seven Up', desc: 'Play all 7 seats yourself and win on every one in one round.' },
    { id: 'dead_mans_hand', rarity: 'secret', group: 'Secret', name: 'Dead Man’s Hand', desc: 'Split black Aces and draw a black 8 on each.', secret: true,
      hint: "Secret. Aces and eights." },
    { id: 'wolf_endless', rarity: 'secret', group: 'Secret', name: 'Blood Moon', desc: 'Complete Endless on Hard with no bots at the table.', secret: true,
      hint: "Secret. The pack stays home, forever." },
    { id: 'off_the_record', rarity: 'secret', group: 'Secret', name: 'Off the Record', desc: 'Hear every dealer’s secret line.', secret: true,
      hint: 'Secret. Some dealers only talk when they think nobody is listening.' },
    { id: 'house_name', rarity: 'secret', group: 'Secret', name: 'The House', desc: 'Go by the name of the one who built the house.', secret: true,
      hint: 'Secret. The house always knows its own name.' },
    { id: 'whisper_name', rarity: 'secret', group: 'Secret', name: 'Hitman', desc: 'Go by a name that is only ever whispered.', secret: true,
      hint: 'Secret. Some names are whispered, not spoken.' },
    { id: 'wolf_endless_expert', rarity: 'secret', group: 'Secret', name: 'Silver Moon', desc: 'Complete Endless on Expert using only 2 seats every round.', secret: true,
      hint: 'Secret. Alone at the very top, for as long as it takes.' },
    { id: 'darkest_run', rarity: 'insanity', group: 'Secret', name: 'The Darkest Run', desc: 'Complete Endless on Expert using only 2 seats, without ever splitting, doubling or surrendering.', secret: true,
      hint: 'Secret. The darkest run there is.' },
  ];
  const RANK = { common: 0, rare: 1, epic: 2, legendary: 3, secret: 4, insanity: 5 };
  LIST.sort((a, b) => RANK[a.rarity] - RANK[b.rarity]);
  const byId = Object.fromEntries(LIST.map((a) => [a.id, a]));

  // ======================================================================
  // Saved progress
  // ======================================================================
  const SAVE_KEY = 'blackjack-achievements-v1';
  const blank = () => ({
    unlocked: {},
    stats: { hands: 0, rounds: 0, blackjacks: 0, handsWon: 0, chipsWon: 0, doublesWon: 0, dealerBusts: 0,
      doubles: 0, surrenders: 0, minWins: 0, shuffles: 0, daysPlayed: 0, disciplined: 0, proCount: 0,
      hands_easy: 0, hands_medium: 0, hands_hard: 0, hands_expert: 0, noBustStreak: 0, bookStreak: 0, bustStreak: 0, highStreak: 0, dealerBJStreak: 0 },
    days: {},   // 'YYYY-MM-DD' -> true, for Seven Days
    losses: {}, // difficulty -> Challenges lost, for Phoenix
  });
  let save = blank();
  try {
    const raw = root.localStorage.getItem(SAVE_KEY);
    if (raw) { const s = JSON.parse(raw); save = { unlocked: s.unlocked || {}, stats: Object.assign(blank().stats, s.stats || {}), days: s.days || {}, losses: s.losses || {} }; }
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
      rounds: 0, hands: 0, maxSeats: 0, hadBots: false, usedTricks: false, lossStreak: 0, winsAfter: 0, recovering: false, lostCounted: false,
    };
  }
  // Continue (ui.js): a saved run carries its session trackers, so streaks and
  // "never dropped below the start" keep counting across a break.
  function sessionState() {
    return session ? Object.assign({}, session, { lowest: session.lowest === Infinity ? null : session.lowest }) : null;
  }
  function resumeSession(saved, opts) {
    startSession(opts);
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(session)) if (k in saved && k !== 'mode' && k !== 'difficulty') session[k] = saved[k];
      if (typeof session.lowest !== 'number') session.lowest = Infinity;
    }
  }
  const counts = () => session && session.mode !== 'practice';

  const value = (cards) => (BJ ? BJ.handValue(cards).total : 0);
  const isBJ = (cards) => (BJ ? BJ.isBlackjack(cards) : false);
  const won = (h) => h.result === 'win' || h.result === 'blackjack';

  // Watch the player's own decisions (basic strategy, splits, doubles, hitting on 20) without touching ui.js.
  if (BJ && BJ.Game && !BJ.Game.prototype.__achWrapped) {
    const applyAction = BJ.Game.prototype.applyAction;
    BJ.Game.prototype.applyAction = function (seat, h, action) {
      try {
        const hand = seat && seat.hands && seat.hands[h];
        if (hand && seat.type === 'player' && counts()) {
          const { total } = BJ.handValue(hand.cards);
          if (BJ.basicStrategy) {
            const rec = BJ.basicStrategy(hand.cards, this.dealerUpCard(), this.availableActions(seat.index, h));
            hand.achDecisions = (hand.achDecisions || 0) + 1;
            if (rec !== action) hand.achOffBook = true;
          }
          if ((action === 'hit' || action === 'double') && total === 20) hand.achHitOn20 = true;
          if (action === 'split' || action === 'double' || action === 'surrender') session.usedTricks = true;
          if (action === 'split') { // the new hand inherits the book so far
            hand.achSplitFrom = hand.cards.slice(0, 2);
          }
        }
      } catch (e) { /* tracking must never break the game */ }
      return applyAction.call(this, seat, h, action);
    };
    BJ.Game.prototype.__achWrapped = true;
  }

  const isBlack = (c) => c.suit === '♠' || c.suit === '♣';
  function today() { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }

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

      const first2 = seat.hands[0].cards;
      if (first2.length >= 2 && first2[0].rank === first2[1].rank && first2[0].suit === first2[1].suit && seat.hands.length === 1) unlock('perfect_pair');
      if (seat.hands.length > 1) { // split
        unlock('split_first');
        const aces = seat.hands.every((x) => x.splitAces);
        if (aces && seat.hands.every((x) => value(x.cards) === 21)) unlock('twin_aces');
        if (aces && seat.hands.some((x) => x.cards.length === 2 && value(x.cards) === 21)) unlock('split_blackjack');
        if (aces && seat.hands.length === 2 && seat.hands.every((x) => x.cards.length >= 2 && isBlack(x.cards[0]) && x.cards[1].rank === '8' && isBlack(x.cards[1]))
          && seat.hands[0].cards[0].suit !== seat.hands[1].cards[0].suit) unlock('dead_mans_hand');
        if (seat.hands.length === 2 && seat.hands.every((x) => x.doubled && won(x))) unlock('split_double');
        const wins = seat.hands.filter(won).length;
        if (wins === seat.hands.length) unlock('split_sweep');
        if (seat.hands.length >= 4 && wins >= 3) unlock('four_of_a_kind');
      }

      let seatNet = 0;
      for (const h of seat.hands) {
        save.stats.hands++;
        session.hands++;
        if (session.difficulty) save.stats['hands_' + session.difficulty] = (save.stats['hands_' + session.difficulty] || 0) + 1;
        {
          const tot = value(h.cards);
          const busted = h.result === 'bust' || tot > 21;
          if (h.result === 'push') unlock('push_first');
          save.stats.bustStreak = busted ? save.stats.bustStreak + 1 : 0;
          if (save.stats.bustStreak >= 5) unlock('overeager');
          save.stats.noBustStreak = busted ? 0 : save.stats.noBustStreak + 1;
          if (h.doubled) save.stats.doubles++;
          if (h.result === 'surrender') save.stats.surrenders++;
          const base = h.doubled ? h.bet / 2 : h.bet;
          if (won(h) && base === game.rules.minBet) save.stats.minWins++;
          if (!h.fromSplit && base === game.rules.minBet && session.countBefore <= -2) save.stats.disciplined++;
          if (won(h) && base >= 250 && session.countBefore >= 3) save.stats.proCount++;
          if (tot === 21 && h.cards.length >= 3 && BJ && BJ.handValue(h.cards).soft) unlock('soft_21');
          if (won(h) && h.achHitOn20) unlock('daredevil');
          if (h.natural && dealerBJ && h.result === 'push') unlock('standoff');
          if (won(h) && h.cards.length >= 7) unlock('seven_charlie');
          if (won(h) && !h.doubled && h.cards.length >= 2 && tot === 12 && !(BJ && BJ.handValue(h.cards).soft) && dealer[0] && BJ && BJ.cardValue(dealer[0]) === 10) unlock('nerves_of_steel');
          save.stats.highStreak = won(h) && base >= 500 ? save.stats.highStreak + 1 : 0;
          if (save.stats.highStreak >= 5) unlock('high_society');
          if (h.achDecisions) save.stats.bookStreak = h.achOffBook ? 0 : save.stats.bookStreak + 1;
        }
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

    session.rounds++;
    session.maxSeats = Math.max(session.maxSeats, seats.length);
    if (game.shoe && game.shoe.roundsDealt === 1) save.stats.shuffles++;
    const day = today();
    if (!save.days[day]) { save.days[day] = true; save.stats.daysPlayed = Object.keys(save.days).length; }
    const hour = new Date().getHours();
    if (hour >= 3 && hour < 5) unlock('insomniac');
    if (session.hands >= 150) unlock('night_shift');
    if (['easy', 'medium', 'hard', 'expert'].every((d) => save.stats['hands_' + d] > 0)) unlock('tourist');
    save.stats.dealerBJStreak = dealerBJ ? save.stats.dealerBJStreak + 1 : 0;
    if (save.stats.dealerBJStreak >= 3) unlock('rigged');
    const seatedBots = game.seats.filter((st) => st.type === 'bot');
    if (seatedBots.length) session.hadBots = true;
    if (dealer.length >= 5 && dealerTotal > 21) unlock('meltdown');
    if (dealerTotal > 21) save.stats.dealerBusts++;
    session.dealerBustStreak = dealerTotal > 21 ? session.dealerBustStreak + 1 : 0;
    if (session.dealerBustStreak >= 3) unlock('dealer_streak');
    if (session.dealerBustStreak >= 5) unlock('dealer_collapse');
    if (game.seats.length >= 7 && game.seats.every((st) => st.type)) unlock('full_table');
    const bots = game.seats.filter((st) => st.type === 'bot' && st.hands && st.hands.length);
    if (bots.length >= 2 && bots.every((st) => st.hands.every((h) => h.result === 'bust')) && roundNet > 0) unlock('last_standing');
    if (bots.length >= 3) unlock('company');
    if (bots.length >= 1 && roundNet > 0 && bots.every((st) => st.hands.every((h) => h.result === 'bust' || h.result === 'lose'))) unlock('bot_whisperer');
    if (seats.length >= 7 && seatsWon === seats.length) unlock('seven_up');
    const staked = seats.reduce((sum, st) => sum + st.hands.reduce((t, h) => t + (h.bet || 0) + (h.insurance || 0), 0), 0);
    const bankrollBefore = game.bankroll - roundNet;
    if (roundNet > 0 && staked > 0 && bankrollBefore - staked < 5) unlock('all_in');
    if (roundNet > 0 && bankrollBefore <= 25) unlock('last_chip');
    if (roundNet < 0) {
      session.lossStreak++; session.winsAfter = 0; session.recovering = session.lossStreak >= 5;
    } else if (roundNet > 0) {
      session.lossStreak = 0;
      if (session.recovering) { session.winsAfter++; if (session.winsAfter >= 5) unlock('full_recovery'); }
    } else { session.lossStreak = 0; session.winsAfter = 0; session.recovering = false; }
    if (session.mode === 'challenge' && game.broke && !session.lostCounted) {
      session.lostCounted = true;
      unlock('bankrupt');
      if (session.difficulty) save.losses[session.difficulty] = (save.losses[session.difficulty] || 0) + 1;
    }
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
    if (session.rounds <= 30) unlock('speedrun');
    if ((save.losses[difficultyId] || 0) >= 3) unlock('phoenix');
    if (difficultyId === 'hard' && !session.hadBots) unlock('lone_wolf');
    if (difficultyId === 'expert' && session.maxSeats <= 2) unlock('wolf_expert');
    persist();
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
    if (objectivesReached >= 4) unlock('halfway');
    if (difficulty && objectivesReached >= objectivesFor(difficulty).length) {
      unlock('endless_' + difficulty);
      if (difficulty === 'hard' && !session.hadBots) unlock('wolf_endless');
      if (difficulty === 'expert' && session.maxSeats <= 2) unlock('wolf_endless_expert');
      if (difficulty === 'expert' && session.maxSeats <= 2 && !session.usedTricks) unlock('darkest_run');
    }
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
  const KIND = { back: 'card back', felt: 'felt', chips: 'chip set', face: 'card faces', title: 'title' };
  function rewardLine(id, reward) {
    const all = root.Cosmetics ? root.Cosmetics.rewardsFor(id) : [reward];
    const pieces = all.filter((r) => r.type !== 'title');
    const title = all.find((r) => r.type === 'title');
    const parts = [];
    if (pieces.length > 1) parts.push(`New set: ${pieces[0].set || pieces[0].name} (${pieces.map((r) => KIND[r.type]).join(', ')})`);
    else if (pieces.length) parts.push(`New ${KIND[pieces[0].type]}: ${pieces[0].name}`);
    if (title) parts.push(`${parts.length ? 'title' : 'New title'}: ${title.name}`);
    return parts.join(' + ');
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

  // Off the Record: the speech bubbles report each secret line the first time it shows.
  function checkSecretLines() {
    const T = root.DealerTalk;
    if (T && T.SECRET_IDS && T.secretsSeen && T.SECRET_IDS.every((id) => T.secretsSeen().includes(id))) unlock('off_the_record');
  }
  if (root.document) {
    root.document.addEventListener('dealertalk:secret', (e) => { const d = e.detail || {}; if (d.seen && d.total && d.seen.length >= d.total) unlock('off_the_record'); });
    root.addEventListener && root.addEventListener('load', checkSecretLines);
  }

  // Name achievements: the player's name is compared by hash only, so the names never appear in the code.
  const NAME_KEYS = { l4241obop9: 'house_name', '24os373tvu0': 'whisper_name' };
  function nameKey(str, seed = 0x5eed) {
    let h1 = 0xdeadbeef ^ seed, h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) { const c = str.charCodeAt(i); h1 = Math.imul(h1 ^ c, 2654435761); h2 = Math.imul(h2 ^ c, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  function checkName(name) {
    const clean = String(name || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
    const id = NAME_KEYS[nameKey(clean)];
    if (id) unlock(id);
  }
  if (root.document) {
    root.document.addEventListener('cosmetics:name', (e) => checkName(e.detail && e.detail.name));
    root.addEventListener && root.addEventListener('load', () => { if (root.Cosmetics && root.Cosmetics.playerName) checkName(root.Cosmetics.playerName()); });
  }

  root.Achievements = {
    list: () => LIST.slice(),
    /** Name and description as the player should see them: secrets stay hidden until earned. */
    shown: (id) => { const a = byId[id]; if (!a) return null; return a.secret && !save.unlocked[id] ? { name: '???', desc: a.hint } : { name: a.name, desc: a.desc }; },
    get: (id) => byId[id] || null,
    isUnlocked: (id) => !!save.unlocked[id],
    stats: () => Object.assign({}, save.stats),
    stats: () => Object.assign({}, save.stats),
    startSession, resumeSession, sessionState, roundEnd, challengeWon, endlessProgress, syncFromModes,
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
    // ===== batch 4 drafts =====
    split_first: { draw(p) {
      p.card(0, 5, 7, 10, '8', null, C.ink); p.card(9, 5, 7, 10, '8', null, C.ink);
      p.poly([[3, 3], [6, 0], [6, 2], [10, 2], [10, 0], [13, 3], [10, 6], [10, 4], [6, 4], [6, 6]], C.yellow[1]);
      p.rect(6, 2, 4, 1, C.yellow[0]);
    } },
    push_first: { draw(p) {
      p.rect(7, 2, 2, 11, C.brown[1]).rect(7, 2, 1, 11, C.brown[0]).rect(4, 13, 8, 2, C.brown[2]);
      p.rect(1, 3, 14, 1, C.yellow[1]).rect(7, 1, 2, 2, C.yellow[0]);
      p.line(2, 4, 0, 8, C.grey[2]).line(2, 4, 4, 8, C.grey[2]).line(13, 4, 11, 8, C.grey[2]).line(13, 4, 15, 8, C.grey[2]);
      p.rect(0, 8, 5, 2, C.yellow[2]).rect(11, 8, 5, 2, C.yellow[2]).rect(0, 8, 5, 1, C.yellow[1]).rect(11, 8, 5, 1, C.yellow[1]);
    } },
    overeager: { draw(p) {
      p.card(2, 2, 11, 13, '22', null, C.red[1]);
      p.suit('d', 6, 9, C.red[1]);
      p.disc(13.5, 3, 1.6, 2.4, C.cyan); p.set(13, 1, C.cyan[1]);
    } },
    company: { draw(p) {
      p.rect(7, 0, 2, 2, C.red[1]).rect(7, 2, 2, 2, C.grey[2]);
      p.rect(2, 4, 12, 9, C.grey[1]).rect(2, 4, 12, 1, C.grey[0]).rect(2, 4, 1, 9, C.grey[0]).rect(13, 5, 1, 8, C.grey[2]);
      p.rect(4, 6, 3, 3, C.cyan[1]).rect(9, 6, 3, 3, C.cyan[1]).set(4, 6, '#ffffff').set(9, 6, '#ffffff');
      p.rect(5, 10, 6, 1, C.dark[1]); p.set(6, 10, C.yellow[1]); p.set(9, 10, C.yellow[1]);
      p.rect(0, 7, 2, 3, C.grey[2]).rect(14, 7, 2, 3, C.grey[2]); p.rect(4, 13, 8, 2, C.grey[2]);
    } },
    doubler: { draw(p) {
      const chip = (cx, cy, r) => { p.disc(cx, cy, 5, 5, r); for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; p.set(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, C.white); } p.disc(cx, cy, 2.6, 2.6, [r[1], r[1], r[1]], true); };
      chip(5.5, 5.5, C.blue); chip(10.5, 10.5, C.green); p.text('2', 9, 8, '#ffffff');
    } },
    rigged: { frames: 8, dur: 1.6, draw(p, f) {
      p.card(1, 3, 9, 12, null, null, C.ink, { face: C.red[1] });
      for (let y = 4; y < 14; y += 2) for (let x = 2; x < 9; x += 2) p.set(x + (y % 4 ? 1 : 0), y, C.red[2]);
      const sx = [10, 9, 8, 7, 6, 7, 8, 9][f], sy = [6, 7, 8, 9, 9, 8, 7, 6][f];
      p.ring(sx, sy, 2.6, 4, C.grey[1]); p.disc(sx, sy, 2.6, 2.6, [C.cyan[0], C.cyan[1], C.cyan[1]], true);
      p.line(sx + 2, sy + 3, sx + 5, sy + 7, C.brown[1]);
      p.text('A', sx - 1, sy - 2, C.ink);
    }, post(p, f) { if (f === 0 || f === 4) p.sparkle(f ? 14 : 2, f ? 2 : 1, C.yellow[0], true); } },
    penny_pincher: { draw(p) {
      p.disc(8, 9.5, 6.5, 5, C.pink);
      p.disc(14, 9, 1.6, 2.2, C.pink, true); p.set(14, 8, C.pink[2]); p.set(14, 10, C.pink[2]);
      p.rect(4, 13, 2, 3, C.pink[2]).rect(9, 13, 2, 3, C.pink[2]);
      p.poly([[4, 5], [6, 3], [7, 6]], C.pink[1]); p.set(11, 7, C.ink);
      p.rect(6, 4, 4, 1, C.pink[2]);
      p.disc(8, 2, 2.2, 2.2, METAL.gold, true); p.rect(7, 1, 1, 2, METAL.gold[2]);
    } },
    soft_21: { draw(p) {
      p.disc(8, 10, 7.5, 4.5, C.pink); p.rect(1, 13, 14, 1, C.pink[2]);
      p.set(1, 7, C.pink[1]); p.set(14, 7, C.pink[1]);
      p.card(4, 1, 8, 10, 'A', null, C.ink); p.suit('h', 6, 6, C.red[1]);
      p.disc(8, 12.5, 6.5, 2.4, C.pink);
    } },
    tourist: { draw(p) {
      p.rect(5, 2, 6, 2, C.brown[2]).rect(6, 3, 4, 1, null);
      p.rect(1, 4, 14, 11, C.brown[1]).rect(1, 4, 14, 1, C.brown[0]).rect(1, 14, 14, 1, C.brown[2]);
      p.rect(1, 9, 14, 1, C.brown[2]);
      p.disc(4.5, 7, 2, 1.6, C.red, true); p.rect(9, 11, 4, 3, C.blue[1]); p.set(10, 12, C.white);
      p.disc(11, 6.5, 1.8, 1.8, C.yellow, true); p.rect(3, 11, 3, 2, C.green[1]);
    } },
    corner_regular: { draw(p) {
      p.rect(2, 6, 10, 9, C.white).rect(2, 6, 10, 1, C.paper).rect(10, 7, 2, 8, C.shade);
      p.ring(12.5, 10, 1.4, 2.6, C.shade);
      p.rect(3, 6, 8, 2, C.brown[2]); p.rect(3, 10, 8, 2, C.red[1]);
      p.line(5, 1, 4, 4, C.grey[1]).line(8, 0, 9, 4, C.grey[1]);
    } },
    hotel_guest: { draw(p) {
      p.ring(4, 5, 1.6, 3.4, METAL.gold[1]); p.ring(4, 5, 1.6, 2.2, METAL.gold[0]);
      p.rect(7, 4, 7, 2, METAL.gold[1]).rect(7, 4, 7, 1, METAL.gold[0]).rect(11, 6, 1, 2, METAL.gold[2]).rect(13, 6, 1, 3, METAL.gold[2]);
      p.line(4, 8, 6, 10, C.brown[2]);
      p.poly([[4, 10], [11, 10], [13, 12], [11, 15], [4, 15]], C.red[1]); p.rect(4, 10, 7, 1, C.red[0]);
      p.text('7', 6, 11, C.white);
    } },
    tactical_retreat: { draw(p) {
      p.ring(8, 8, 3, 6, (x, y) => (y > 8 && x > 3 ? null : y < 5 ? C.green[0] : C.green[1]));
      p.poly([[11, 9], [16, 9], [13.5, 14]], C.green[1]);
      p.rect(2, 9, 3, 5, C.green[2]);
    } },
    twin_aces: { draw(p) {
      p.card(0, 2, 8, 13, 'A', 's', C.ink); p.card(8, 2, 8, 13, 'A', 'c', C.ink);
    }, post(p) { p.sparkle(8, 1, C.yellow[0]); } },
    daredevil: { draw(p) {
      p.card(1, 4, 9, 11, '20', null, C.ink);
      p.poly([[12, 0], [15, 0], [12, 6], [15, 6], [8, 15], [10, 8], [7, 8]], C.yellow[1]);
      p.line(12, 1, 10, 7, C.yellow[0]);
    } },
    standoff: { draw(p) {
      p.card(0, 1, 6, 9, 'A', null, C.ink); p.card(10, 1, 6, 9, 'A', null, C.red[1]);
      p.card(1, 6, 5, 9, 'K', null, C.ink); p.card(10, 6, 5, 9, 'K', null, C.red[1]);
      p.rect(7, 6, 2, 1, C.yellow[1]).rect(7, 9, 2, 1, C.yellow[1]);
    } },
    last_chip: { draw(p) {
      p.disc(8, 9, 6, 6, C.red);
      for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.set(8 + Math.cos(a) * 5, 9 + Math.sin(a) * 5, C.white); }
      p.disc(8, 9, 3.4, 3.4, [C.red[1], C.red[1], C.red[1]], true);
      p.text('1', 7, 7, '#ffffff');
      p.line(3, 1, 5, 3, C.yellow[1]).line(13, 1, 11, 3, C.yellow[1]).line(8, 0, 8, 1, C.yellow[1]);
    } },
    night_shift: { draw(p) {
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
        const d1 = Math.hypot(x + 0.5 - 7, y + 0.5 - 8), d2 = Math.hypot(x + 0.5 - 10.5, y + 0.5 - 5.5);
        if (d1 < 6.5 && d2 > 5.2) p.set(x, y, d2 < 6.4 ? C.yellow[0] : x < 4 ? C.yellow[1] : C.yellow[2]);
      }
    }, post(p) { p.sparkle(13, 3, C.white); p.set(14, 11, C.white); p.set(11, 14, C.yellow[0]); } },
    neon_owl: { frames: 6, dur: 1.8, draw(p, f) {
      const n = f === 4 ? [C.pink[2], C.pink[2], C.pink[2]] : C.pink;
      p.poly([[2, 1], [5, 4], [11, 4], [14, 1], [14, 10], [8, 15], [2, 10]], n[1]);
      p.poly([[5, 9], [11, 9], [8, 14]], n[0]);
      const eye = f === 2 ? (x) => p.rect(x - 1, 7, 3, 1, C.cyan[2]) : (x) => { p.disc(x + 0.5, 7.5, 2.4, 2.4, C.cyan, true); p.set(x, 7, OUT); };
      eye(5); eye(10);
      p.poly([[7, 9], [9, 9], [8, 11]], C.yellow[1]);
    } },
    vip_member: { draw(p) {
      p.rect(0, 4, 16, 10, METAL.gold[1]).rect(0, 4, 16, 1, METAL.gold[0]).rect(0, 13, 16, 1, METAL.gold[2]);
      p.rect(0, 7, 16, 2, C.dark[1]);
      p.poly([[2, 11], [2, 9.5], [3.5, 10.5], [4.5, 9], [5.5, 10.5], [7, 9.5], [7, 11]], C.red[1]);
      p.rect(9, 10, 5, 1, METAL.gold[2]).rect(9, 12, 3, 1, METAL.gold[2]);
      p.rect(2, 5, 3, 1, '#ffffff');
    } },
    seven_charlie: { frames: 7, dur: 1.8, draw(p, f) {
      const shown = f + 1;
      for (let i = 0; i < shown; i++) {
        const x = 1 + i * 1.4, y = Math.round(5 - i * 0.8);
        p.card(Math.round(x), y, 7, 11, null, null, C.ink);
        p.rect(Math.round(x), y, 1, 11, C.shade);
        if (i === shown - 1) { p.text(String(shown), Math.round(x) + 2, y + 1, i % 2 ? C.red[1] : C.ink); p.suit(i % 2 ? 'h' : 's', Math.round(x) + 1, y + 6, i % 2 ? C.red[1] : C.ink); }
      }
    }, post(p, f) { if (f === 6) p.sparkle(14, 1, C.yellow[0], true); } },
    steady_hands: { draw(p) {
      p.rect(0, 6, 16, 5, C.green[1]).rect(0, 6, 16, 1, C.green[0]).rect(0, 10, 16, 1, C.green[2]);
      p.rect(5, 7, 6, 3, C.cyan[0]); p.rect(7, 7, 2, 3, C.cyan[1]); p.set(7, 7, '#ffffff');
      p.rect(4, 7, 1, 3, C.ink).rect(11, 7, 1, 3, C.ink);
      p.rect(1, 8, 2, 1, C.green[2]).rect(13, 8, 2, 1, C.green[2]);
    } },
    dealer_collapse: { frames: 6, dur: 1.4, draw(p, f) {
      for (let i = 0; i < 4; i++) {
        const fall = Math.max(0, Math.min(3, f - i));
        const x = 2 + i * 3, lean = [0, 1, 2, 4][fall];
        p.poly([[x, 15], [x + 2, 15], [x + 2 + lean, 4 + lean * 0.4], [x + lean, 4 + lean * 0.4]], i % 2 ? C.white : C.shade);
        p.set(x + 1 + Math.round(lean * 0.6), 7 + Math.round(lean * 0.2), C.ink);
        p.set(x + 1 + Math.round(lean * 0.3), 12, C.ink);
      }
    } },
    split_double: { draw(p) {
      p.card(0, 6, 7, 10, '9', null, C.ink); p.card(9, 6, 7, 10, '9', null, C.red[1]);
      const chip = (cx) => { p.disc(cx, 3, 3.4, 2.6, C.green); p.rect(cx - 2, 3, 5, 1, C.green[2]); };
      chip(3.5); chip(12.5);
      p.text('2', 6, 0, C.yellow[1]);
    } },
    by_the_book: { frames: 6, dur: 1.5, draw(p, f) {
      p.rect(0, 4, 16, 10, C.brown[1]).rect(0, 13, 16, 1, C.brown[2]);
      p.rect(1, 3, 7, 10, C.white).rect(8, 3, 7, 10, C.paper).rect(7, 3, 2, 10, C.shade);
      for (let y = 5; y < 12; y += 2) { p.rect(2, y, 4, 1, C.grey[2]); p.rect(10, y, 4, 1, C.grey[2]); }
      const flip = [null, 11, 9, 7, 5, null][f];
      if (flip !== null) p.poly([[8, 3], [flip, 1 + Math.abs(8 - flip) / 2], [flip, 11 + Math.abs(8 - flip) / 3], [8, 13]], C.white);
      if (f === 5) p.line(10, 8, 11, 10, C.green[1]).line(11, 10, 14, 5, C.green[1]);
    } },
    speedrun: { frames: 8, dur: 1.6, draw(p, f) {
      p.rect(6, 0, 4, 2, C.grey[1]); p.rect(12, 2, 2, 2, C.grey[2]);
      p.disc(8, 9, 6.5, 6.5, C.grey); p.disc(8, 9, 5, 5, [C.white, C.white, C.paper]);
      [[8, 5], [12, 9], [8, 13], [4, 9]].forEach(([x, y]) => p.set(x, y, C.ink));
      const a = (f / 8) * Math.PI * 2 - Math.PI / 2;
      p.line(8, 9, 8 + Math.cos(a) * 4, 9 + Math.sin(a) * 4, C.red[1]);
      p.set(8, 9, C.ink);
    } },
    professor: { frames: 6, dur: 1.4, draw(p, f) {
      p.poly([[0, 6], [8, 2], [16, 6], [8, 10]], C.dark[1]); p.line(1, 6, 8, 3, C.dark[0]);
      p.poly([[4, 8], [12, 8], [12, 12], [8, 13], [4, 12]], C.dark[2]);
      const sw = [0, 1, 2, 1, 0, -1][f];
      p.line(8, 6, 13, 7, C.yellow[1]); p.line(13, 7, 13 + sw, 12, C.yellow[1]); p.rect(12 + sw, 12, 3, 2, C.yellow[2]);
      p.rect(7, 5, 2, 2, C.yellow[0]);
    } },
    lifetime: { frames: 8, dur: 2.4, draw(p, f) {
      p.rect(1, 2, 14, 13, C.white).rect(1, 2, 14, 4, C.red[1]).rect(1, 2, 14, 1, C.red[0]).rect(14, 3, 1, 12, C.shade);
      p.rect(4, 0, 2, 4, C.grey[1]).rect(10, 0, 2, 4, C.grey[1]);
      const d = String((f * 7 + 1) % 31 + 1).padStart(2, '0');
      p.text(d, 4, 8, C.ink);
      if (f % 2) p.poly([[11, 15], [15, 11], [15, 15]], C.shade);
    } },
    lone_wolf: { frames: 6, dur: 1.8, draw(p) {
      p.disc(11.5, 4.5, 4, 4, C.yellow);
      p.poly([[1, 15], [2, 8], [3, 5], [5, 7], [7, 4], [8, 7], [11, 9], [12, 11], [9, 11], [8, 15]], C.dark[0]);
      p.line(3, 6, 2, 12, C.dark[1]); p.set(6, 8, C.yellow[1]);
    }, post(p, f) { const s = [[1, 1], [6, 2], [14, 12], [3, 3], [12, 14], [7, 0]][f]; p.set(s[0], s[1], C.white); if (f % 3 === 0) p.sparkle(1, 2, C.white); } },
    high_society: { frames: 6, dur: 1.5, draw(p) {
      p.rect(4, 0, 8, 8, C.dark[1]).rect(4, 0, 2, 8, C.dark[0]).rect(4, 6, 8, 2, C.red[1]);
      p.rect(1, 8, 14, 2, C.dark[1]).rect(1, 8, 14, 1, C.dark[0]);
      p.ring(10, 12.5, 1.6, 2.8, METAL.gold[1]); p.disc(10, 12.5, 1.6, 1.6, [C.cyan[0], C.cyan[0], C.cyan[1]], true);
      p.line(8, 13, 4, 15, METAL.gold[2]);
    }, post(p, f) { if (f === 2) p.sparkle(11, 11, '#ffffff', true); if (f === 3) p.set(11, 11, '#ffffff'); } },
    dead_mans_hand: { frames: 8, dur: 2, draw(p) {
      p.card(0, 3, 7, 11, 'A', null, C.ink); p.card(8, 3, 7, 11, '8', null, C.ink);
      p.card(1, 5, 7, 11, 'A', 's', C.ink); p.card(9, 5, 7, 11, '8', 'c', C.ink);
    }, post(p, f) {
      for (let i = 0; i < 3; i++) {
        const k = (f + i * 3) % 8; if (k > 5) continue;
        const x = 2 + i * 5 + (k % 2), y = 2 - Math.floor(k / 2);
        p.set(x, y, k < 3 ? C.grey[0] : C.grey[2]); p.set(x + 1, y, k < 2 ? C.grey[1] : null);
      }
    } },
    // ===== batch 4b drafts =====
    bot_whisperer: { draw(p) {
      p.rect(7, 0, 2, 2, C.green[1]).rect(7, 2, 2, 2, C.grey[2]);
      p.rect(2, 4, 12, 9, C.grey[1]).rect(2, 4, 12, 1, C.grey[0]).rect(2, 4, 1, 9, C.grey[0]).rect(13, 5, 1, 8, C.grey[2]);
      p.line(4, 6, 6, 8, C.red[1]).line(6, 6, 4, 8, C.red[1]).line(9, 6, 11, 8, C.red[1]).line(11, 6, 9, 8, C.red[1]);
      p.rect(5, 10, 6, 1, C.dark[1]); p.rect(0, 7, 2, 3, C.grey[2]).rect(14, 7, 2, 3, C.grey[2]); p.rect(4, 13, 8, 2, C.grey[2]);
    } },
    full_recovery: { frames: 5, dur: 1.5, draw(p, f) {
      p.rect(2, 3, 11, 11, C.grey[1]).rect(2, 3, 11, 1, C.grey[0]).rect(13, 6, 2, 5, C.grey[2]);
      p.rect(3, 4, 9, 9, C.dark[2]);
      const ramp = [C.red, C.orange, C.yellow, C.green, C.green][f];
      for (let i = 0; i <= f; i++) p.rect(4 + i * 2 - (i === 4 ? 0 : 0), 5, 1, 7, ramp[1]).rect(4 + i * 2, 5, 1, 1, ramp[0]);
    }, post(p, f) { if (f === 4) p.sparkle(14, 1, C.yellow[0], true); } },
    shuffler: { draw(p) {
      for (let i = 0; i < 4; i++) { p.rect(0, 12 - i * 1, 6, 1, i % 2 ? C.blue[1] : C.blue[2]); p.rect(10, 12 - i * 1, 6, 1, i % 2 ? C.blue[1] : C.blue[2]); }
      p.rect(0, 13, 6, 2, C.blue[2]).rect(10, 13, 6, 2, C.blue[2]);
      for (let i = 0; i < 7; i++) {
        const t = i / 6, x = 2 + t * 12, y = 9 - Math.sin(t * Math.PI) * 7;
        p.rect(Math.round(x), Math.round(y), 1, 3, i % 2 ? C.blue[0] : C.white);
      }
    } },
    pro_counter: { draw(p) {
      p.rect(0, 1, 16, 14, C.brown[1]).rect(1, 2, 14, 12, C.dark[2]).rect(0, 1, 16, 1, C.brown[0]);
      for (let r = 0; r < 4; r++) {
        p.rect(1, 3 + r * 3, 14, 1, C.grey[2]);
        const n = [3, 1, 4, 2][r];
        for (let i = 0; i < 5; i++) { const x = i < n ? 2 + i * 2 : 6 + i * 2; p.rect(x, 2 + r * 3, 2, 3, [C.red, C.yellow, C.green, C.blue][r][1]); p.set(x, 2 + r * 3, '#ffffff'); }
      }
    } },
    disciplined: { draw(p) {
      p.disc(8, 10, 6, 5.4, C.blue); for (let i = 0; i < 8; i++) { const a = (i / 8) * Math.PI * 2; p.set(8 + Math.cos(a) * 5, 10 + Math.sin(a) * 4.4, C.white); }
      p.ring(8, 4.5, 2, 3.4, (x, y) => (y < 5 ? C.grey[1] : null));
      p.rect(5, 6, 6, 6, METAL.gold[1]).rect(5, 6, 6, 1, METAL.gold[0]).rect(10, 7, 1, 5, METAL.gold[2]);
      p.rect(7, 8, 2, 2, C.ink).set(8, 10, C.ink);
    } },
    seven_up: { frames: 8, dur: 1.6, draw(p, f) {
      p.disc(8, 12.5, 7.5, 3.5, C.brown, true); p.disc(8, 12.5, 6, 2.4, C.green, true);
      const seats = [[1.5, 7], [3.2, 4], [5.6, 2], [8, 1.5], [10.4, 2], [12.8, 4], [14.5, 7]];
      seats.forEach(([x, y], i) => p.disc(x, y + 0.5, 1.5, 1.5, i < f ? METAL.gold : C.dark, i >= f));
      if (f === 7) p.text('7', 7, 6, C.yellow[0]);
    } },
    nerves_of_steel: { draw(p) {
      p.poly([[1, 5], [3, 2], [6, 2], [8, 4], [10, 2], [13, 2], [15, 5], [15, 7], [8, 14], [1, 7]], (x, y) => (x + y < 9 ? METAL.silver[0] : y > 9 || x > 12 ? METAL.silver[2] : METAL.silver[1]));
      [[4, 6], [11, 6], [8, 10]].forEach(([x, y]) => p.set(x, y, METAL.silver[2]));
      p.text('12', 4, 5, C.ink);
    } },
    weekend_warrior: { draw(p) {
      p.rect(0, 2, 16, 13, C.white).rect(0, 2, 16, 4, C.blue[1]).rect(0, 2, 16, 1, C.blue[0]).rect(15, 3, 1, 12, C.shade);
      p.rect(3, 0, 2, 4, C.grey[1]).rect(11, 0, 2, 4, C.grey[1]);
      for (let i = 0; i < 7; i++) { const x = 1 + (i % 4) * 4, y = 7 + Math.floor(i / 4) * 4; p.line(x, y + 1, x + 1, y + 2, C.green[1]).line(x + 1, y + 2, x + 3, y, C.green[1]); }
    } },
    insomniac: { draw(p) {
      p.disc(8, 9, 6.5, 6.5, C.red); p.disc(8, 9, 5, 5, [C.white, C.white, C.paper]);
      p.disc(3, 3, 2.2, 2.2, C.yellow, true); p.disc(13, 3, 2.2, 2.2, C.yellow, true);
      p.line(8, 9, 8, 5, C.ink).line(8, 9, 11, 9, C.ink);
      p.rect(3, 15, 2, 1, C.red[2]).rect(11, 15, 2, 1, C.red[2]);
    }, post(p) { p.text('3', 12, 10, C.yellow[0]); } },
    bankrupt: { draw(p) {
      p.rect(1, 5, 14, 10, C.brown[1]).rect(1, 5, 14, 1, C.brown[0]).rect(1, 14, 14, 1, C.brown[2]);
      p.poly([[1, 5], [15, 5], [13, 2], [3, 2]], C.dark[2]);
      p.rect(10, 8, 6, 4, C.brown[2]).rect(12, 9, 2, 2, METAL.gold[1]);
    }, post(p) { p.set(5, 0, C.grey[0]); p.set(4, 1, C.grey[1]); p.set(6, 1, C.grey[1]); p.set(7, 3, C.grey[2]); } },
    phoenix: { draw(p) {
      p.poly([[8, 4], [15, 0], [12, 7], [9, 9]], C.orange[1]); p.poly([[8, 4], [1, 0], [4, 7], [7, 9]], C.orange[1]);
      p.line(14, 1, 10, 7, C.yellow[1]).line(2, 1, 6, 7, C.yellow[1]);
      p.disc(8, 8, 2.4, 3.2, C.red); p.disc(8, 3.5, 1.6, 1.6, C.red, true); p.set(9, 3, C.yellow[0]);
      p.poly([[6, 10], [10, 10], [11, 15], [8, 13], [5, 15]], (x, y) => (y > 12 ? C.yellow[1] : C.orange[1]));
    } },
    perfect_pair: { draw(p) {
      p.card(0, 2, 8, 13, 'K', 'h', C.red[1]); p.card(8, 2, 8, 13, 'K', 'h', C.red[1]);
    }, post(p) { p.sparkle(8, 0, C.yellow[0]); p.set(1, 15, C.yellow[1]); } },
    split_blackjack: { draw(p) {
      p.card(0, 5, 8, 11, 'A', null, C.ink); p.card(8, 5, 8, 11, 'J', null, C.ink);
      p.suit('s', 1, 10, C.ink); p.suit('c', 9, 10, C.ink);
      p.poly([[3, 3], [6, 0], [6, 2], [10, 2], [10, 0], [13, 3], [10, 6], [10, 4], [6, 4], [6, 6]], C.yellow[1]);
    } },
    double_or_nothing: { frames: 6, dur: 1.2, draw(p, f) {
      const w = [6, 4.5, 1.2, 4.5, 6, 6][f], y = [9, 6, 4, 6, 9, 9][f];
      p.disc(8, y, w, 6, METAL.gold, f !== 0 && f < 4);
      if (w > 4) p.text(f < 3 || f > 3 ? '2' : '0', 7, y - 2, METAL.gold[2]);
      p.rect(4, 15, 8, 1, C.dark[1]);
    } },
    halfway: { draw(p) {
      p.poly([[0, 15], [7, 3], [10, 8], [12, 6], [16, 15]], (x, y) => (y < 7 ? C.white : x < 7 ? C.grey[1] : C.grey[2]));
      p.rect(7, 0, 1, 9, C.brown[2]); p.poly([[8, 0], [13, 2], [8, 4]], C.red[1]);
    } },
    wolf_expert: { frames: 6, dur: 1.8, draw(p) {
      p.disc(10.5, 5.5, 5, 5, METAL.gold);
      p.poly([[1, 15], [2, 8], [3, 5], [5, 7], [7, 4], [8, 7], [11, 9], [12, 11], [9, 11], [8, 15]], C.dark[0]);
      p.line(3, 6, 2, 12, C.dark[1]); p.set(6, 8, C.cyan[1]);
    }, post(p, f) { const s = [[1, 1], [14, 13], [4, 2], [15, 9], [12, 0], [2, 3]][f]; p.sparkle(s[0], s[1], '#ffffff', f % 2 === 0); } },
    wolf_endless: { frames: 8, dur: 2.4, draw(p, f) {
      const pulse = f < 4 ? f : 8 - f;
      p.disc(8, 7, 6 + pulse * 0.25, 6 + pulse * 0.25, C.red);
      [[5, 5], [10, 8], [7, 10]].forEach(([x, y]) => { p.set(x, y, C.red[2]); p.set(x + 1, y, C.red[2]); });
      p.poly([[1, 16], [2, 10], [3, 7], [5, 9], [7, 6], [8, 9], [11, 11], [12, 13], [9, 13], [8, 16]], C.dark[0]);
    }, post(p, f) { if (f === 3) p.sparkle(14, 1, C.red[0]); } },
    wolf_endless_expert: { frames: 6, dur: 1.8, draw(p) {
      p.disc(8.5, 7, 6.5, 6.5, METAL.silver);
      p.poly([[2, 16], [3, 10], [4, 7], [6, 9], [8, 5], [9, 8], [12, 10], [13, 12], [10, 12], [9, 16]], C.dark[1]);
      p.line(4, 8, 3, 13, C.dark[0]); p.set(7, 9, C.cyan[1]);
    }, post(p, f) { [[1, 2], [14, 1], [15, 12], [12, 15], [0, 8], [6, 0]].forEach(([x, y], i) => { if ((i + f) % 3 === 0) p.set(x, (y + f) % 16, '#ffffff'); }); } },
    off_the_record: { frames: 8, dur: 1.6, draw(p, f) {
      const bob = [0, 0, 1, 1, 1, 0, 0, -1][f], glitch = f === 3 || f === 6;
      const Q = ['.XXXXX.', 'XXXXXXX', 'XX...XX', '.....XX', '....XXX', '...XXX.', '..XXX..', '..XX...', '.......', '..XX...', '..XX...'];
      const body = (dx, c, shade) => Q.forEach((r, y) => [...r].forEach((ch, x) => { if (ch === 'X') p.set(4 + x + dx + (glitch && y === 5 ? 1 : 0), 2 + y + bob, y > 6 && shade ? shade : c); }));
      if (glitch) { body(-1, '#ff3ad0'); body(1, '#3ad8ff'); }
      body(0, '#e8fff8', '#9ae8d8');
    }, post(p, f) {
      for (let x = 0; x < 16; x++) if ((x + f * 3) % 6 < 2) p.set(x, 15, '#3ad8ff');
      if (f === 6) for (let x = 2; x < 14; x++) p.set(x, 9, x % 2 ? '#ff3ad0' : '#ffffff');
    } },
    house_name: { frames: 4, dur: 1.2, draw(p, f) {
      p.rect(1, 2, 14, 12, '#0a1030');
      [[3, 4, 5, '#ff6ad0'], [3, 6, 8, '#9ad0ff'], [5, 8, 6, '#ffd75e'], [3, 10, 4, '#6aff9a']].forEach(([x, y, w, c]) => p.rect(x, y, w, 1, c));
      if (f < 2) p.rect(10, 9, 2, 3, '#ffffff');
    }, post(p) { p.line(0, 1, 15, 1, '#5a8aff'); p.line(0, 14, 15, 14, '#5a8aff'); } },
    whisper_name: { frames: 8, dur: 2.4, draw(p, f) {
      const cx = [6, 7, 8, 9, 10, 9, 8, 7][f];
      p.ring(cx, 8, 5.2, 6.3, '#d8b040');
      for (let i = -7; i <= 7; i++) if (Math.abs(i) > 1) { p.set(cx + i, 8, '#d8b040'); p.set(cx, 8 + i, '#d8b040'); }
      if (f % 2 === 0) p.set(cx, 8, '#ff2a2a');
    } },
    darkest_run: { frames: 8, dur: 1.6, draw(p, f) {
      p.ring(8, 8, 4.5, 7.9, (x, y, d) => {
        const a = Math.atan2(y + 0.5 - 8, x + 0.5 - 8);
        const ray = Math.sin(a * 6 + (f * Math.PI) / 4) > 0.2;
        return d < 5.5 ? C.yellow[0] : ray ? (d < 7 ? C.orange[1] : C.red[1]) : null;
      });
      p.disc(8, 8, 4.5, 4.5, BLACK, true);
    }, post(p) { p.ring(8, 8, 4.5, 5.1, '#ffffff'); p.set(6, 4, C.dark[0]); } },
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
