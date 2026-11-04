# Blackjack

A pixel-art blackjack game that plays like a real casino table. It runs in the browser with no build step, no server and no install: open `index.html` and play.

**Play online:** https://yust3c.github.io/blackjack/ (after GitHub Pages is turned on; see below)

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

Each difficulty has its own casino and dealer. **Achievements** unlock **cosmetics** (card backs, felts, chip sets and card faces, some animated), and the **Lore** section tells the story of every dealer and room. Progress is saved in your browser (localStorage).

## Table rules

- 6-deck shoe, reshuffled after 10 hands (or when the shoe runs low)
- Dealer stands on all 17s, including soft 17, and peeks for blackjack
- Blackjack pays 3 to 2, insurance pays 2 to 1
- Bets in multiples of 5, up to 500
- Split up to 4 hands, double on any first two cards, double after split, late surrender
- Split aces receive one card each
- 7 seats. The dealer only deals when at least two bets are on the table, so play a second seat or add a bot.

## Controls

Click a seat to sit or to add a bot, click chips to bet, then press **Deal** (or `Enter`). On your turn: `H` hit, `S` stand, `D` double, `P` split, `R` surrender.

## Play locally

Download or clone the repository and open `index.html` in a browser. Everything works offline except the two pixel fonts, which load from Google Fonts and fall back to a monospace font without a connection.

## Publish with GitHub Pages

In the repository on GitHub, open **Settings → Pages**, set **Source** to **Deploy from a branch**, pick `main` and `/ (root)`, and save. After a minute the game is live at `https://<your-user>.github.io/<repo-name>/`.

## Project layout

| Path | What it does |
| --- | --- |
| `index.html` | The page |
| `cosmetics.html` | Preview gallery of every cosmetic and achievement |
| `css/style.css` | Table, cards, chips, menu and Lore screen |
| `css/scenarios.css` | Casino scenes and the scaled stage |
| `css/cosmetics.css` | Cosmetics, achievements screens and toasts |
| `js/engine.js` | Game rules: shoe, dealing, player actions, payouts, Hi-Lo count |
| `js/strategy.js` | Basic strategy (6 decks, S17, DAS, late surrender); bots and hints use it |
| `js/sprites.js` | Pixel-art suit and chip sprites |
| `js/modes.js` | Difficulties, Endless objectives, saved progress |
| `js/dealers.js` | Pixel-art dealers |
| `js/scenarios.js` | The eight casino scenes |
| `js/cosmetics.js` | Cosmetic catalog and the Cosmetics screen |
| `js/achievements.js` | Achievements and their trackers |
| `js/lore.js` | Dealer and scene stories |
| `js/ui.js` | Menu, modes, practice coach, rendering and input |

All art is generated in code as pixel SVG, so there are no image files.

## License

MIT. See [LICENSE](LICENSE).
