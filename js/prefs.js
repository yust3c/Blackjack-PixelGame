/* Table settings: dealer speed, bot turns and reduce motion. Saved under SaveData.KEYS.prefs (js/save.js)
   and shown on the Settings screen (js/gamesounds.js). ui.js applies the speeds to the running game. */
(function (root) {
  'use strict';

  const KEY = (root.SaveData && root.SaveData.KEYS.prefs) || 'blackjack-prefs-v1';
  const DEFAULTS = { speed: 'normal', botTurns: 'normal', reduceMotion: false };
  const CHOICES = { speed: ['slow', 'normal', 'fast'], botTurns: ['normal', 'quick'] };
  // Milliseconds per dealing step, and how much of that a bot's turn takes.
  const DELAY = { slow: 750, normal: 450, fast: 220 };
  const BOT_PACE = { normal: 1, quick: 0.25 };

  const prefs = Object.assign({}, DEFAULTS);
  try {
    const saved = JSON.parse(root.localStorage.getItem(KEY) || 'null');
    if (saved && typeof saved === 'object') {
      for (const k of Object.keys(DEFAULTS)) {
        if (!(k in saved)) continue;
        if (CHOICES[k] ? CHOICES[k].includes(saved[k]) : typeof saved[k] === typeof DEFAULTS[k]) prefs[k] = saved[k];
      }
    }
  } catch (e) { /* defaults */ }

  const listeners = [];
  function set(key, value) {
    if (!(key in DEFAULTS)) return;
    if (CHOICES[key] ? !CHOICES[key].includes(value) : typeof value !== typeof DEFAULTS[key]) return;
    prefs[key] = value;
    try { root.localStorage.setItem(KEY, JSON.stringify(prefs)); } catch (e) { /* storage blocked */ }
    applyMotion();
    listeners.forEach((fn) => { try { fn(key, value); } catch (e) { console.error(e); } });
  }

  // Reduce motion: the system setting always counts; the in-game switch adds to it.
  const systemReduce = () => !!(root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches);
  function applyMotion() {
    const html = root.document.documentElement;
    if (prefs.reduceMotion) html.dataset.reduceMotion = '1'; else delete html.dataset.reduceMotion;
  }
  applyMotion();

  root.Prefs = {
    DEFAULTS, CHOICES,
    get: (key) => prefs[key],
    all: () => Object.assign({}, prefs),
    set,
    onChange: (fn) => listeners.push(fn),
    /** True when animations should be cut: the in-game switch or the system setting. */
    reduceMotion: () => prefs.reduceMotion || systemReduce(),
    delay: () => DELAY[prefs.speed] || DELAY.normal,
    botPace: () => BOT_PACE[prefs.botTurns] || 1,
  };
})(window);
