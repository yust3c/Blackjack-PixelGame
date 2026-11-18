/* Game modes, difficulties, objectives and saved progress. */
(function (root) {
  'use strict';

  const DIFFICULTIES = [
    { id: 'easy',   name: 'Easy',   start: 1000, target: 2000, minBet: 5,  maxBet: 500, maxBots: 4 },
    { id: 'medium', name: 'Medium', start: 500,  target: 2000, minBet: 10, maxBet: 500, maxBots: 2 },
    { id: 'hard',   name: 'Hard',   start: 300,  target: 2500, minBet: 25, maxBet: 500, maxBots: 1 },
    { id: 'expert', name: 'Expert', start: 200,  target: 5000, minBet: 25, maxBet: 500, maxBots: 0 },
  ];

  // Endless mode is per difficulty and unlocked by winning that difficulty's Challenge.
  // It uses that difficulty's table (start, limits, bots) and a ladder of objectives based on its goal.
  // After the last objective you keep playing for a high score.
  const ENDLESS_STEPS = [0.75, 1.25, 2, 3, 5, 7.5, 12.5, 25];
  function endlessObjectives(d) {
    return ENDLESS_STEPS.map((m) => Math.round((d.target * m) / 50) * 50);
  }

  const SAVE_KEY = 'blackjack-save-v1';
  // endless: { [difficultyId]: { objectives: number reached, best: highest bankroll } }
  // runs: { 'endless:easy': snapshot, ... } saved runs a player can continue (see ui.js)
  // daily: { [YYYY-MM-DD]: { best, tries, done } } best Daily challenge result per day
  // streak: { last: 'YYYY-MM-DD', count, best } days in a row with a finished Daily
  // lastSession: { label, at, stats } the numbers of the last table you left (js/sessionstats.js), for Profile > Stats
  const blankSave = () => ({ challengeWins: {}, endless: {}, runs: {}, daily: {}, streak: { last: '', count: 0, best: 0 }, lastSession: null });
  function endlessRecord(save, id) {
    if (!save.endless[id]) save.endless[id] = { objectives: 0, best: 0 };
    return save.endless[id];
  }

  function load() {
    try {
      const raw = root.localStorage.getItem(SAVE_KEY);
      const save = raw ? Object.assign(blankSave(), JSON.parse(raw)) : blankSave();
      if (!save.endless || typeof save.endless !== 'object') save.endless = {};
      if (!save.runs || typeof save.runs !== 'object') save.runs = {};
      if (!save.daily || typeof save.daily !== 'object') save.daily = {};
      if (!save.streak || typeof save.streak !== 'object') save.streak = { last: '', count: 0, best: 0 };
      return save;
    } catch (e) {
      return blankSave();
    }
  }
  function store(save) {
    try { root.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode: progress lasts this visit only */ }
  }

  // Seeded random numbers (mulberry32): the same seed always gives the same sequence,
  // so a Daily challenge shoe comes out in the same order for every player that day.
  function seededRng(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function localDay(d) {
    d = d || new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }
  function daySeed(day) {
    let h = 0x811c9dc5;
    for (const c of `blackjack-daily:${day}`) { h ^= c.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
    return h;
  }

  // ---------------------------------------------------------------- Daily challenge
  // One deal a day, the same for everyone: Easy table limits, 1,000 chips, 25 hands, and a shoe shuffled from the
  // day's seed. The casino rotates with the day. You can replay it; the best result of the day is kept, and
  // finishing it at least once a day builds a streak.
  // Endless tables take bigger bets than Challenge: up to 1000.
  const ENDLESS_MAX_BET = 1000;
  const DAILY = { start: 1000, hands: 25, minBet: 5, maxBet: 500, maxBots: 4 };
  function dailyDifficulty(day) { return DIFFICULTIES[daySeed(day) % DIFFICULTIES.length].id; }   // picks the casino
  function dailyRecord(save, day) {
    if (!save.daily[day]) save.daily[day] = { best: 0, tries: 0, done: false };
    return save.daily[day];
  }
  function prevDay(day) {
    const [y, m, d] = day.split('-').map(Number);
    return localDay(new Date(y, m - 1, d - 1));
  }
  /** The streak as it stands today: it is broken once a whole day passes without a finished Daily. */
  function currentStreak(save, today) {
    const s = save.streak || {};
    if (!s.count) return 0;
    return s.last === today || s.last === prevDay(today) ? s.count : 0;
  }
  /** Records a finished Daily; returns the streak after it. */
  function finishDaily(save, day, bankroll) {
    const rec = dailyRecord(save, day);
    rec.best = Math.max(rec.best, bankroll);
    rec.done = true;
    const s = save.streak;
    if (s.last !== day) {
      s.count = s.last === prevDay(day) ? s.count + 1 : 1;
      s.last = day;
    }
    s.best = Math.max(s.best || 0, s.count);
    // keep the per-day records small: the last 60 days are plenty
    const days = Object.keys(save.daily).sort();
    while (days.length > 60) delete save.daily[days.shift()];
    return s.count;
  }
  // Streak tiers (icons in js/achievements.js, streak_<id>).
  const STREAK_TIERS = [[100, 'legend', 'Legend'], [60, 'diamond', 'Diamond'], [30, 'gold', 'Gold'], [14, 'silver', 'Silver'], [7, 'bronze', 'Bronze'], [3, 'flame', 'Flame'], [1, 'ember', 'Ember']];
  function streakTier(n) {
    const i = STREAK_TIERS.findIndex(([min]) => n >= min);
    if (i < 0) return null;
    const next = i > 0 ? STREAK_TIERS[i - 1] : null;
    return { id: STREAK_TIERS[i][1], name: STREAK_TIERS[i][2], next: next ? { name: next[2], days: next[0] - n } : null };
  }

  root.Modes = { DIFFICULTIES, endlessObjectives, endlessRecord, load, store, blankSave, seededRng, localDay, daySeed,
    DAILY, ENDLESS_MAX_BET, dailyDifficulty, dailyRecord, currentStreak, finishDaily, streakTier, prevDay };
})(window);
