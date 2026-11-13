/* Session stats: what happened since you sat down at this table (hands, results, biggest swings and the
   bankroll after every round). Like js/dealertalk.js it watches the game through its onRoundEnd callback.
   ui.js calls SessionStats.start(game, saved) in startMode and stores SessionStats.state() with a saved run,
   so Continue keeps the numbers. SessionStats.get() is what a stats panel reads. */
(function (root) {
  'use strict';

  const MAX_POINTS = 600;   // bankroll history kept for the graph (older points are thinned out)
  let st = null;

  function blank(bankroll) {
    return {
      start: bankroll, net: 0, rounds: 0, hands: 0, won: 0, lost: 0, pushed: 0, blackjacks: 0,
      biggestWin: 0, biggestLoss: 0, peak: bankroll, low: bankroll, series: [bankroll],
    };
  }

  function start(game, saved) {
    stop();
    if (!game) return;
    const data = blank(game.bankroll);
    if (saved && typeof saved === 'object' && Array.isArray(saved.series)) {
      for (const k of Object.keys(data)) if (k in saved && typeof saved[k] === typeof data[k]) data[k] = saved[k];
      data.series = saved.series.filter((n) => typeof n === 'number').slice(-MAX_POINTS);
      if (!data.series.length) data.series = [game.bankroll];
    }
    st = { game, data };
    const onRoundEnd = game.onRoundEnd;
    game.onRoundEnd = (g) => { try { if (st && st.game === g) roundEnd(g); } catch (e) { console.error(e); } onRoundEnd(g); };
  }
  function stop() { st = null; }

  function roundEnd(g) {
    const d = st.data;
    const hands = [];
    g.seats.forEach((s) => { if (s.type === 'player') s.hands.forEach((h) => hands.push(h)); });
    if (!hands.length) return;
    d.rounds++;
    for (const h of hands) {
      d.hands++;
      if (h.result === 'win' || h.result === 'blackjack') d.won++;
      else if (h.result === 'push') d.pushed++;
      else d.lost++;   // lose, bust, surrender
      if (h.result === 'blackjack') d.blackjacks++;
    }
    const net = g.lastRoundNet || 0;
    d.net += net;   // summed per round, so a Practice refill isn't counted as a win
    if (net > d.biggestWin) d.biggestWin = net;
    if (-net > d.biggestLoss) d.biggestLoss = -net;
    d.peak = Math.max(d.peak, g.bankroll);
    d.low = Math.min(d.low, g.bankroll);
    d.series.push(g.bankroll);
    if (d.series.length > MAX_POINTS) d.series = d.series.filter((_, i) => i === 0 || i % 2 === 1);   // halve, keep the start
  }

  root.SessionStats = {
    start, stop,
    /** A copy for saving with a run. */
    state: () => (st ? JSON.parse(JSON.stringify(st.data)) : null),
    /** The numbers for a stats panel, with the derived ones filled in. */
    get: () => {
      if (!st) return null;
      const d = st.data;
      const bankroll = st.game.bankroll;
      return Object.assign({}, d, {
        series: d.series.slice(), bankroll,
        winRate: d.hands ? d.won / d.hands : 0,
      });
    },
  };
})(window);
