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
  const blankSave = () => ({ challengeWins: {}, endless: {}, runs: {} });
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
      return save;
    } catch (e) {
      return blankSave();
    }
  }
  function store(save) {
    try { root.localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* private mode: progress lasts this visit only */ }
  }

  root.Modes = { DIFFICULTIES, endlessObjectives, endlessRecord, load, store, blankSave };
})(window);
