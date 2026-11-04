/*
 * Blackjack table engine.
 * Plain script (no modules) so index.html also works when opened from disk.
 * In the browser it defines window.Blackjack; in Node it is a CommonJS module.
 */
(function (root) {
  'use strict';

  const SUITS = ['♠', '♥', '♦', '♣'];
  const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

  const DEFAULT_RULES = {
    decks: 6,
    roundsPerShoe: 10,      // reshuffle after this many hands
    reshuffleMinCards: 75,  // safety: also reshuffle if the shoe runs low
    seats: 7,
    minBet: 5,
    maxBet: 500,
    betStep: 5,             // bets must be multiples of 5
    blackjackPays: 1.5,     // 3 to 2
    dealerHitsSoft17: false, // dealer stands on all 17s
    maxHandsPerSeat: 4,     // split up to 3 times
    minHandsToDeal: 2,      // dealer needs at least two bets on the table
    startingBankroll: 1000,
    maxBots: 6,             // how many bot seats the mode allows
  };

  const BOT_NAMES = ['Lucy', 'Mark', 'Sophie', 'Dan', 'Ellen', 'Bruno', 'Carla', 'Ivan', 'Nora', 'Tom'];
  const BOT_BETS = [10, 15, 20, 25, 25, 50];

  let nextCardId = 1;

  function cardValue(card) {
    if (card.rank === 'A') return 11;
    if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K' || card.rank === '10') return 10;
    return Number(card.rank);
  }

  function handValue(cards) {
    let total = 0;
    let aces = 0;
    for (const c of cards) {
      if (c.rank === 'A') { aces++; total += 1; } else total += cardValue(c);
    }
    let soft = false;
    if (aces > 0 && total + 10 <= 21) { total += 10; soft = true; }
    return { total, soft };
  }

  function isBlackjack(cards) {
    return cards.length === 2 && handValue(cards).total === 21;
  }

  /** Hi-Lo count value: 2-6 = +1, 7-9 = 0, tens and aces = -1. */
  function hiLo(card) {
    const v = cardValue(card);
    if (v >= 2 && v <= 6) return 1;
    if (v >= 10) return -1;
    return 0;
  }

  function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

  class Shoe {
    constructor(decks, rng) {
      this.decks = decks;
      this.rng = rng || Math.random;
      this.shuffle();
    }
    shuffle() {
      const cards = [];
      for (let d = 0; d < this.decks; d++) {
        for (const suit of SUITS) for (const rank of RANKS) cards.push({ rank, suit, id: nextCardId++ });
      }
      for (let i = cards.length - 1; i > 0; i--) {
        const j = Math.floor(this.rng() * (i + 1));
        [cards[i], cards[j]] = [cards[j], cards[i]];
      }
      this.cards = cards;
      this.roundsDealt = 0;
    }
    draw() {
      if (this.cards.length === 0) this.shuffle(); // should never happen with the safety reshuffle
      return this.cards.pop();
    }
    get remaining() { return this.cards.length; }
    get total() { return this.decks * 52; }
  }

  function newHand(bet) {
    return {
      cards: [], bet, doubled: false, surrendered: false, done: false,
      natural: false, fromSplit: false, splitAces: false,
      insurance: 0, insuranceDecided: false, result: null, net: 0,
    };
  }

  function emptySeat(index) {
    return { index, type: null, name: '', bet: 0, hands: [] };
  }

  class Game {
    constructor(options = {}) {
      this.rules = Object.assign({}, DEFAULT_RULES, options.rules || {});
      this.rng = options.rng || Math.random;
      this.delay = options.delay === undefined ? 450 : options.delay;
      this.onUpdate = options.onUpdate || (() => {});
      this.onRoundEnd = options.onRoundEnd || (() => {});
      this.runningCount = 0;   // Hi-Lo count of every card shown since the last shuffle
      this.bankroll = this.rules.startingBankroll;
      this.shoe = new Shoe(this.rules.decks, this.rng);
      this.seats = Array.from({ length: this.rules.seats }, (_, i) => emptySeat(i));
      this.dealer = { cards: [], holeHidden: true };
      this.phase = 'betting'; // betting | dealing | insurance | playing | dealer
      this.active = null;     // { seat, hand } whose turn it is
      this.log = [];
      this.message = 'Take a seat and place your bet.';
      this.handNumber = 0;
      this._waiter = null;
      this._botNameIndex = 0;
    }

    // ---------- helpers ----------
    _see(card) { this.runningCount += hiLo(card); }
    get decksRemaining() { return Math.max(this.shoe.remaining / 52, 0.5); }
    get trueCount() { return this.runningCount / this.decksRemaining; }
    botCount() { return this.seats.filter((s) => s.type === 'bot').length; }
    update() { this.onUpdate(this); }
    say(msg) {
      this.message = msg;
      this.log.push(msg);
      if (this.log.length > 50) this.log.shift();
    }
    async pause(mult = 1) { if (this.delay > 0) await sleep(this.delay * mult); }
    waitFor(kind) {
      const p = new Promise((resolve) => { this._waiter = { kind, resolve }; });
      this.update(); // re-render now that the game is waiting for input
      return p;
    }
    get waitingFor() { return this._waiter ? this._waiter.kind : null; }
    _resolve(kind, value) {
      if (this._waiter && this._waiter.kind === kind) {
        const w = this._waiter;
        this._waiter = null;
        w.resolve(value);
        return true;
      }
      return false;
    }
    playerSeats() { return this.seats.filter((s) => s.type === 'player'); }
    seatsInRound() { return this.seats.filter((s) => s.hands.length > 0); }
    totalPlayerBets() { return this.playerSeats().reduce((sum, s) => sum + s.bet, 0); }
    betsOnTable() {
      return this.seats.filter((s) => s.type === 'bot' || (s.type === 'player' && s.bet > 0)).length;
    }
    dealerUpCard() { return this.dealer.cards[0] || null; }
    dealerValue() {
      const visible = this.dealer.holeHidden ? this.dealer.cards.slice(0, 1) : this.dealer.cards;
      return handValue(visible);
    }

    // ---------- seating and bets (betting phase only) ----------
    sitPlayer(i) {
      const seat = this.seats[i];
      if (this.phase !== 'betting' || !seat || seat.type) return false;
      const count = this.playerSeats().length;
      Object.assign(seat, { type: 'player', name: count === 0 ? 'You' : `You (${count + 1})`, bet: 0, hands: [] });
      this.update();
      return true;
    }
    addBot(i) {
      const seat = this.seats[i];
      if (this.phase !== 'betting' || !seat || seat.type) return false;
      if (this.botCount() >= this.rules.maxBots) {
        this.say(this.rules.maxBots === 0 ? 'No bots allowed at this table.' : `This table allows ${this.rules.maxBots} bot${this.rules.maxBots === 1 ? '' : 's'} at most.`);
        this.update();
        return false;
      }
      const name = BOT_NAMES[this._botNameIndex++ % BOT_NAMES.length];
      Object.assign(seat, { type: 'bot', name, bet: 0, hands: [] });
      this.update();
      return true;
    }
    leaveSeat(i) {
      if (this.phase !== 'betting' || !this.seats[i]) return false;
      this.seats[i] = emptySeat(i);
      // Keep player names tidy: first player seat is always "You".
      this.playerSeats().forEach((s, n) => { s.name = n === 0 ? 'You' : `You (${n + 1})`; });
      this.update();
      return true;
    }
    addChip(i, amount) {
      const seat = this.seats[i];
      if (this.phase !== 'betting' || !seat || seat.type !== 'player') return false;
      const next = seat.bet + amount;
      if (next > this.rules.maxBet) { this.say(`Table maximum is ${this.rules.maxBet} per hand.`); this.update(); return false; }
      if (this.totalPlayerBets() + amount > this.bankroll) { this.say('Not enough chips for that bet.'); this.update(); return false; }
      seat.bet = next;
      this.update();
      return true;
    }
    clearBet(i) {
      const seat = this.seats[i];
      if (this.phase !== 'betting' || !seat || seat.type !== 'player') return false;
      seat.bet = 0;
      this.update();
      return true;
    }

    /** Returns why the dealer cannot deal yet, or null when ready. */
    dealProblem() {
      if (this.phase !== 'betting') return 'A hand is in progress.';
      const players = this.playerSeats();
      if (players.length === 0) return 'Sit at a seat to play.';
      const betting = players.filter((s) => s.bet > 0);
      if (betting.length === 0) return 'Place a bet on your seat.';
      for (const s of betting) {
        if (s.bet < this.rules.minBet) return `Minimum bet is ${this.rules.minBet}.`;
        if (s.bet % this.rules.betStep !== 0) return `Bets must be multiples of ${this.rules.betStep}.`;
      }
      if (this.totalPlayerBets() > this.bankroll) return 'Not enough chips for those bets.';
      if (this.betsOnTable() < this.rules.minHandsToDeal) {
        return 'The dealer needs at least two bets on the table. Bet on a second seat or add a bot.';
      }
      return null;
    }

    // ---------- the round ----------
    async deal() {
      const problem = this.dealProblem();
      if (problem) { this.say(problem); this.update(); return false; }

      this.phase = 'dealing';
      this.handNumber++;
      if (this.shoe.roundsDealt >= this.rules.roundsPerShoe || this.shoe.remaining < this.rules.reshuffleMinCards) {
        this.shoe.shuffle();
        this.runningCount = 0;
        this.say(`The dealer shuffles a fresh ${this.rules.decks}-deck shoe.`);
        this.update();
        await this.pause(2);
      }
      this.shoe.roundsDealt++;
      this.dealer = { cards: [], holeHidden: true };

      for (const seat of this.seats) {
        seat.hands = [];
        if (seat.type === 'bot') seat.bet = BOT_BETS[Math.floor(this.rng() * BOT_BETS.length)];
        if (seat.type && seat.bet > 0) {
          if (seat.type === 'player') this.bankroll -= seat.bet;
          seat.hands = [newHand(seat.bet)];
        }
      }
      this.say('Cards are out.');
      this.update();

      const order = this.seatsInRound();
      for (let round = 0; round < 2; round++) {
        for (const seat of order) await this.giveCard(seat.hands[0]);
        await this.giveDealerCard();
      }
      for (const seat of order) seat.hands[0].natural = isBlackjack(seat.hands[0].cards);

      const up = this.dealerUpCard();
      if (up.rank === 'A') await this.offerInsurance(order);

      // Dealer peeks for blackjack with an ace or ten-value card showing.
      if (cardValue(up) >= 10) {
        if (isBlackjack(this.dealer.cards)) {
          this.revealHole();
          this.say('Dealer has blackjack.');
          this.update();
          await this.pause(2);
          this.settle(true);
          return true;
        }
        if (up.rank === 'A') {
          this.say('Dealer checks: no blackjack. Insurance bets lose.');
          this.update();
          await this.pause(1.5);
        }
      }

      this.phase = 'playing';
      for (const seat of order) {
        for (let h = 0; h < seat.hands.length; h++) await this.playHand(seat, h);
      }
      this.active = null;

      await this.playDealer();
      this.settle(false);
      return true;
    }

    async giveCard(hand) {
      const card = this.shoe.draw();
      this._see(card);
      hand.cards.push(card);
      this.update();
      await this.pause();
    }
    async giveDealerCard() {
      const card = this.shoe.draw();
      this.dealer.cards.push(card);
      if (this.dealer.cards.length !== 2) this._see(card); // the hole card is counted when revealed
      this.update();
      await this.pause();
    }

    async offerInsurance(order) {
      const pending = [];
      for (const seat of order) {
        const hand = seat.hands[0];
        if (seat.type === 'player' && this.bankroll >= hand.bet / 2) pending.push(seat.index);
        else hand.insuranceDecided = true; // bots never take insurance
      }
      if (pending.length === 0) return;
      this.phase = 'insurance';
      this.insurancePending = pending;
      this.say('Dealer shows an ace. Insurance? It costs half your bet and pays 2 to 1.');
      this.update();
      await this.waitFor('insurance');
      this.insurancePending = [];
      this.phase = 'playing';
    }

    /** UI: answer the insurance question for one seat. */
    decideInsurance(seatIndex, take) {
      if (this.phase !== 'insurance') return false;
      const seat = this.seats[seatIndex];
      const hand = seat && seat.hands[0];
      if (!hand || hand.insuranceDecided) return false;
      const cost = hand.bet / 2;
      if (take && this.bankroll >= cost) {
        this.bankroll -= cost;
        hand.insurance = cost;
      }
      hand.insuranceDecided = true;
      this.insurancePending = this.insurancePending.filter((i) => i !== seatIndex);
      this.update();
      if (this.insurancePending.length === 0) this._resolve('insurance');
      return true;
    }

    availableActions(seatIndex, handIndex) {
      const seat = this.seats[seatIndex];
      const hand = seat && seat.hands[handIndex];
      const none = { hit: false, stand: false, double: false, split: false, surrender: false };
      if (!hand || hand.done) return none;
      const firstTwo = hand.cards.length === 2;
      const canAfford = seat.type === 'bot' || this.bankroll >= hand.bet;
      return {
        hit: true,
        stand: true,
        double: firstTwo && canAfford,
        split: firstTwo && cardValue(hand.cards[0]) === cardValue(hand.cards[1]) &&
          seat.hands.length < this.rules.maxHandsPerSeat && !hand.splitAces && canAfford,
        surrender: firstTwo && seat.hands.length === 1 && !hand.fromSplit,
      };
    }

    async playHand(seat, h) {
      const hand = seat.hands[h];
      if (hand.natural) {
        hand.done = true;
        if (seat.type === 'player') { this.say(`Blackjack for ${seat.name}!`); this.update(); await this.pause(); }
        return;
      }
      while (true) {
        if (hand.cards.length === 1) { // second card for a split hand
          this.active = { seat: seat.index, hand: h };
          await this.giveCard(hand);
          if (hand.splitAces) hand.done = true; // split aces get one card each
        }
        if (hand.done) break;
        if (handValue(hand.cards).total >= 21) { hand.done = true; break; }

        this.active = { seat: seat.index, hand: h };
        let action;
        if (seat.type === 'bot') {
          this.say(`${seat.name} is thinking…`);
          this.update();
          await this.pause(1.2);
          action = NS.basicStrategy(hand.cards, this.dealerUpCard(), this.availableActions(seat.index, h));
        } else {
          this.say(seat.hands.length > 1 ? `${seat.name}: hand ${h + 1} of ${seat.hands.length}. Your move.` : `${seat.name}: your move.`);
          this.update();
          action = await this.waitFor('action');
        }
        await this.applyAction(seat, h, action);
      }
      const v = handValue(hand.cards).total;
      if (v > 21) { this.say(`${seat.name} busts with ${v}.`); this.update(); await this.pause(); }
    }

    /** UI: the human chooses hit / stand / double / split / surrender. */
    act(action) {
      if (this.phase !== 'playing' || !this.active) return false;
      const seat = this.seats[this.active.seat];
      if (seat.type !== 'player') return false;
      if (!this.availableActions(this.active.seat, this.active.hand)[action]) return false;
      return this._resolve('action', action);
    }

    async applyAction(seat, h, action) {
      const hand = seat.hands[h];
      const isPlayer = seat.type === 'player';
      const verb = { hit: 'hits', stand: 'stands', double: 'doubles down', split: 'splits', surrender: 'surrenders' }[action];
      if (seat.type === 'bot' && verb) { this.say(`${seat.name} ${verb}.`); this.update(); }
      switch (action) {
        case 'hit':
          await this.giveCard(hand);
          break;
        case 'stand':
          hand.done = true;
          break;
        case 'double':
          if (isPlayer) this.bankroll -= hand.bet;
          hand.bet *= 2;
          hand.doubled = true;
          await this.giveCard(hand);
          hand.done = true;
          break;
        case 'split': {
          if (isPlayer) this.bankroll -= hand.bet;
          const moved = hand.cards.pop();
          const other = newHand(hand.bet);
          other.cards.push(moved);
          other.fromSplit = hand.fromSplit = true;
          other.splitAces = hand.splitAces = moved.rank === 'A';
          other.insuranceDecided = true;
          seat.hands.splice(h + 1, 0, other);
          this.update();
          await this.pause();
          break;
        }
        case 'surrender':
          hand.surrendered = true;
          hand.done = true;
          break;
        default:
          hand.done = true;
      }
      this.update();
    }

    revealHole() {
      if (this.dealer.holeHidden && this.dealer.cards[1]) this._see(this.dealer.cards[1]);
      this.dealer.holeHidden = false;
    }

    async playDealer() {
      this.phase = 'dealer';
      this.revealHole();
      this.say('Dealer reveals the hole card.');
      this.update();
      await this.pause(1.5);

      const live = this.seatsInRound().some((s) => s.hands.some((h) =>
        !h.surrendered && !h.natural && handValue(h.cards).total <= 21));
      if (!live) return;

      while (true) {
        const { total, soft } = handValue(this.dealer.cards);
        const hits = total < 17 || (total === 17 && soft && this.rules.dealerHitsSoft17);
        if (!hits) break;
        await this.giveDealerCard();
        await this.pause(0.5);
      }
      const dv = handValue(this.dealer.cards).total;
      this.say(dv > 21 ? `Dealer busts with ${dv}!` : `Dealer stands on ${dv}.`);
      this.update();
    }

    settle(dealerBlackjack) {
      const dv = handValue(this.dealer.cards).total;
      let playerNet = 0;
      for (const seat of this.seatsInRound()) {
        for (const hand of seat.hands) {
          const pv = handValue(hand.cards).total;
          let returned = 0; // stake plus winnings handed back
          if (dealerBlackjack) {
            if (hand.natural) { returned = hand.bet; hand.result = 'push'; } else hand.result = 'lose';
            if (hand.insurance) returned += hand.insurance * 3;
          } else if (hand.surrendered) {
            returned = hand.bet / 2; hand.result = 'surrender';
          } else if (pv > 21) {
            hand.result = 'bust';
          } else if (hand.natural) {
            returned = hand.bet + hand.bet * this.rules.blackjackPays; hand.result = 'blackjack';
          } else if (dv > 21 || pv > dv) {
            returned = hand.bet * 2; hand.result = 'win';
          } else if (pv === dv) {
            returned = hand.bet; hand.result = 'push';
          } else {
            hand.result = 'lose';
          }
          hand.net = returned - hand.bet - hand.insurance;
          if (seat.type === 'player') { this.bankroll += returned; playerNet += hand.net; }
        }
      }
      this.phase = 'betting';
      this.active = null;
      this.lastRoundNet = playerNet;
      const hadPlayer = this.seatsInRound().some((s) => s.type === 'player');
      if (hadPlayer) {
        const fmt = NS.formatChips;
        this.say(playerNet > 0 ? `You win ${fmt(playerNet)}.` : playerNet < 0 ? `You lose ${fmt(-playerNet)}.` : 'You break even.');
      }
      // Drop bets the bankroll can no longer cover.
      for (const s of this.playerSeats()) if (this.totalPlayerBets() > this.bankroll) s.bet = 0;
      this.update();
      this.onRoundEnd(this);
    }

    /** True when the player can't cover the minimum bets needed to get a hand dealt. */
    get broke() { return this.bankroll < this.rules.minBet * (this.rules.maxBots === 0 ? this.rules.minHandsToDeal : 1); }
  }

  function formatChips(n) {
    return Number.isInteger(n) ? String(n) : n.toFixed(1);
  }

  const NS = { SUITS, RANKS, DEFAULT_RULES, cardValue, handValue, hiLo, isBlackjack, Shoe, Game, formatChips };

  if (typeof module !== 'undefined' && module.exports) module.exports = NS;
  else root.Blackjack = NS;
})(typeof window !== 'undefined' ? window : globalThis);
