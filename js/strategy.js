/*
 * Basic strategy for 6 decks, dealer stands on soft 17, double after split, late surrender.
 * Bots play by it now; practice mode will use it for hints later.
 */
(function (root) {
  'use strict';
  const NS = (typeof module !== 'undefined' && module.exports) ? require('./engine.js') : root.Blackjack;
  const { cardValue, handValue } = NS;

  /**
   * @param cards   the hand's cards
   * @param upCard  dealer's face-up card
   * @param can     { double, split, surrender } from Game.availableActions
   * @returns 'hit' | 'stand' | 'double' | 'split' | 'surrender'
   */
  function basicStrategy(cards, upCard, can = {}) {
    const d = cardValue(upCard); // 2..11 (ace = 11)
    const { total, soft } = handValue(cards);
    const doubleOr = (fallback) => (can.double ? 'double' : fallback);

    if (can.split && cards.length === 2 && cardValue(cards[0]) === cardValue(cards[1])) {
      const p = cardValue(cards[0]);
      const split = {
        11: true,
        10: false,
        9: d !== 7 && d < 10,
        8: true,
        7: d <= 7,
        6: d <= 6,
        5: false,
        4: d === 5 || d === 6,
        3: d <= 7,
        2: d <= 7,
      }[p];
      if (split) return 'split';
    }

    if (can.surrender && !soft) {
      if (total === 16 && d >= 9) return 'surrender';
      if (total === 15 && d === 10) return 'surrender';
    }

    if (soft) {
      if (total >= 19) return 'stand';
      if (total === 18) {
        if (d >= 3 && d <= 6) return doubleOr('stand');
        return d <= 8 ? 'stand' : 'hit';
      }
      if (total === 17) return d >= 3 && d <= 6 ? doubleOr('hit') : 'hit';
      if (total === 15 || total === 16) return d >= 4 && d <= 6 ? doubleOr('hit') : 'hit';
      if (total === 13 || total === 14) return d >= 5 && d <= 6 ? doubleOr('hit') : 'hit';
      return 'hit';
    }

    if (total >= 17) return 'stand';
    if (total >= 13) return d <= 6 ? 'stand' : 'hit';
    if (total === 12) return d >= 4 && d <= 6 ? 'stand' : 'hit';
    if (total === 11) return d <= 10 ? doubleOr('hit') : 'hit';
    if (total === 10) return d <= 9 ? doubleOr('hit') : 'hit';
    if (total === 9) return d >= 3 && d <= 6 ? doubleOr('hit') : 'hit';
    return 'hit';
  }

  NS.basicStrategy = basicStrategy;
})(typeof window !== 'undefined' ? window : globalThis);
