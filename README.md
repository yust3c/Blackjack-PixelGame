# Blackjack

A pixel-art blackjack game that plays like a real casino table.

## How to play

1. Click **Code → Download ZIP** at the top of this page (or clone the repository).
2. Unzip it and open `index.html` in your browser.

No install and no internet needed. With a connection it also loads the two pixel fonts.

## Modes

- **Practice**: learn to play well. The basic strategy move is highlighted, a coach tracks the Hi-Lo running count and true count, tells you when to raise your bet or take insurance, and scores your accuracy. Out of chips? Refill.
- **Challenge**: you against the dealer. Reach the goal before you go broke.

  | Difficulty | Start | Goal | Bets | Bots |
  | --- | --- | --- | --- | --- |
  | Easy | 1000 | 2000 | 5-500 | up to 4 |
  | Medium | 500 | 2000 | 10-500 | up to 2 |
  | Hard | 300 | 2500 | 25-500 | 1 |
  | Expert | 200 | 5000 | 25-500 | none (play two seats) |

- **Endless**: one per difficulty, unlocked by beating that difficulty in Challenge, and set in a space version of its casino. Chase 8 objectives based on the difficulty's goal, then keep going for a high score. Lose when you run out of chips.

Each difficulty has its own casino and dealer. **Achievements** unlock **cosmetics** (card backs, felts, chip sets and card faces, some animated), and the **Lore** section tells the story of every dealer and room. Progress is saved in your browser.

## Your save

Progress lives in the browser you play in, and it carries over when you download a newer version of the game: older saves are upgraded automatically. To be safe, or to move to another browser or computer, use **Export save** at the bottom of the main menu to download your progress as a file, and **Import save** to load it back.

## Table rules

- 6-deck shoe, reshuffled after 10 hands (or when the shoe runs low)
- Dealer stands on all 17s, including soft 17, and peeks for blackjack
- Blackjack pays 3 to 2, insurance pays 2 to 1
- Bets in multiples of 5, up to 500
- Split up to 4 hands, double on any first two cards, double after split, late surrender
- Split aces receive one card each
- 7 seats. The dealer only deals when at least two bets are on the table, so play a second seat or add a bot.

## Controls

Click a seat to sit or to add a bot, click chips to bet, then press **Deal** (or `Enter`). On your turn: `H` hit, `S` stand, `D` double, `P` split, `R` surrender. When the dealer shows an ace, each of your seats is asked about insurance in turn: `I` take it, `N` decline.

## Made with

Plain HTML, CSS and JavaScript, no libraries. Every card, chip, dealer and casino is pixel art drawn in code.

## License

MIT. See [LICENSE](LICENSE).
