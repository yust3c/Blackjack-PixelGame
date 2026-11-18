/* Lore for the Lore screen: one entry per scene (ids match js/scenarios.js), with a dealer bio and a place description,
   three chapters per dealer, a legend for every secret and Insanity set, and a letter.
   Each space scene is the same dealer and room as its Challenge scene, carried off into space. */
(function (root) {
  'use strict';

  const L = root.Lore = {
    corner: {
      dealer: "Old Tito has dealt at the same green table for thirty years and has never once rushed a hand. He remembers every regular's name, their favourite drink and the night they hit three blackjacks in a row. He calls everyone \"kid\", even people older than him. Rumour says he has never lost track of the count, but he will only smile if you ask.",
      place: "The Corner is the little casino at the end of the block: wood panels, two old slot machines and an OPEN sign that flickers more than it should. The carpet has seen spilled coffee, lucky streaks and at least one marriage proposal. It's the place where everyone learns to play.",
    },
    orbit: {
      dealer: "When the Corner was rebuilt in orbit, Old Tito trained his replacement himself. T1-T0 is a station dealer unit with his patience, his habits and, somehow, his sense of humour. It shuffles in zero gravity without dropping a card. Engineers swear it isn't programmed to blink, yet it does.",
      place: "Orbit Station is the Corner bolted onto a space station, with Earth turning slowly past the window. The slot machines became holo terminals and the carpet became a metal grate, but the OPEN sign still flickers. Every ninety minutes the sun rises over the table.",
    },
    deco: {
      dealer: "Madame Odette has run the high table at the Grand Hotel since the chandeliers were new. She speaks four languages and lets her pearls do the talking when a player gets rowdy. She has seen every trick in the book, and she wrote a few of them. Her one rule: never touch the cards.",
      place: "The Grand Hotel is an art deco palace of navy walls, gold fans and crystal chandeliers. Its checkerboard marble floor has been polished every night for a hundred years. Big money moves quietly here, and so do the staff.",
    },
    liner: {
      dealer: "When the Grand Hotel was relaunched as a star liner, the owners offered Odette the captain's chair, and she took the table with it. Captain Odette now runs both the ship and the game from behind a helmet visor. Her hair turned silver somewhere past Neptune. Her rules didn't change.",
      place: "The Star Liner is the Grand Hotel rebuilt as a luxury liner drifting through a nebula. Through the gold portholes, pink and violet clouds roll past. The chandeliers were swapped for floating ringed lamps, because nothing hangs straight in deep space.",
    },
    neon: {
      dealer: "Vinnie talks faster than he deals, and he deals very fast. He never takes off his sunglasses, not even at night, and especially not at night. Regulars say his smile costs you twenty chips. He has a story for every card, and most of them are true.",
      place: "Neon sits high above the avenue, with a glass wall full of skyscrapers and signs that never switch off. The music is loud, the drinks are bright and nobody checks the time. It's where good players go to find out how good they really are.",
    },
    mars: {
      dealer: "An accident with a slot machine on the voyage out left Vinnie with a new cybernetic eye. He calls it an upgrade. Vinnie X can now read the shoe in infrared, or so he claims. He still talks too much.",
      place: "Mars Neon is the avenue moved under the domes of a Martian colony, with red dunes and two small moons outside the glass. The bar and the 21 sign glow from their own domes across the sand. Out here the air is rationed, but the neon is not.",
    },
    vip: {
      dealer: "Mr. Valdez runs the private room and never raises his voice. He wears white gloves and a gold monocle, and he can tell a counter from a gambler in two hands. The house trusts him with its largest bets, and he has never needed to call security.",
      place: "The VIP Lounge is the penthouse at the top of the tower, with velvet curtains, a black marble floor and the whole city glittering far below. Bets start where other tables end. You only get in by winning your way up.",
    },
    horizon: {
      dealer: "Nobody knows how old Zyx is, including Zyx. It took over the VIP table where time runs slow, and wears a tuxedo out of respect for the house. It deals from the edge of time, so a single hand can feel like a century. It always pays out exactly what you're owed.",
      place: "Event Horizon is the VIP Lounge parked at the edge of a black hole. The window shows a ring of fire bent around a hole of perfect black. Time slows the closer you sit to the glass. It's the last table in the universe, and the stakes are as high as they get.",
    },
  };

  // ---------------------------------------------------------------- dealer chapters
  // Three per dealer. Chapter 1: play 100 hands at that table. Chapter 2: see every scene event there (js/sceneevents.js).
  // Chapter 3: hear that dealer's secret line (js/dealertalk.js). Every chapter 3 is a piece of Lucía Vega's story;
  // all 24 chapters unlock her letter, and after that three blackjacks in a row at The Corner unlock Rainy Night.
  L.CHAPTERS = {
    corner: [
      { title: 'The Green Table', unlock: { type: 'hands', n: 100 }, text: "Tito walked into the Corner at sixteen to sweep the floor and never walked out. The founder taught him to deal on slow Tuesday mornings, one card at a time, until his hands stopped shaking. The table he learned on is the same one he deals on today. He refuses to let anyone re-felt it. \"It knows me,\" he says." },
      { title: 'Pancho', unlock: { type: 'events' }, text: "A mouse has lived behind the slot machines for as long as anyone can remember. Every so often it runs off with a chip. Tito has never once tried to catch it. He leaves crumbs by the skirting board after closing and writes the missing chips down as \"rent\"." },
      { title: "Rainy Night, '98", unlock: { type: 'secret' }, text: "She came in out of the rain at closing time, nineteen years old, dripping in a yellow raincoat. She asked Tito to teach her to count cards. He said no. She sat down anyway and hit three blackjacks in a row. She left one gold chip as a tip and walked back into the rain. Tito still carries that chip in his vest pocket." },
    ],
    orbit: [
      { title: 'Training Data', unlock: { type: 'hands', n: 100 }, text: "T1-T0 learned to deal from 4,000 hours of recordings of Old Tito. It learned the shuffle, the patience and the jokes. It also learned the long pause Tito makes before saying \"kid\", and nobody has managed to remove it." },
      { title: 'The Blink', unlock: { type: 'events' }, text: "Engineers have taken T1-T0 apart three times looking for the blink. There is no code for it. In the recordings, Tito winks at his regulars. T1-T0 has no eyelids for a wink, so it blinks instead." },
      { title: 'Someone Waves', unlock: { type: 'secret' }, text: "Every few months a small ship drifts past the window, and someone in a yellow suit waves at the table. T1-T0 checked the old recordings. On one tape, Tito tells a story about a girl in a yellow raincoat and laughs at the end. That laugh is the file T1-T0 plays when the station is quiet. It plays it for her." },
    ],
    deco: [
      { title: 'Four Languages', unlock: { type: 'hands', n: 100 }, text: "Odette grew up in hotel lobbies across Europe, the daughter of a night concierge. She learned French in Marseille, Italian in Milan, German in Vienna and English from the guests who tipped badly. She still counts chips in Italian when she thinks nobody is listening." },
      { title: 'One Crystal a Year', unlock: { type: 'events' }, text: "Once a year, a single crystal goes missing from the great chandelier. The thief is never seen. The hotel pays for an investigation, and the investigation finds nothing. Odette has never said a word about it. Every year a postcard arrives for her with no name on it." },
      { title: 'Just Once', unlock: { type: 'secret' }, text: "In 2004 a young woman in a yellow raincoat beat the high table for seven nights straight. On the eighth night the owners gave Odette an order. She dealt one card from the bottom of the deck, and the woman lost everything on a single hand. The woman looked at her and said, \"I know.\" Then she left. That night Odette made her one rule: never touch the cards. It was a rule for herself." },
    ],
    liner: [
      { title: "The Captain's Chair", unlock: { type: 'hands', n: 100 }, text: "Odette cannot fly a starship. The ship flies itself. She took the captain's chair because she saw what the owners did with power on the ground, and she decided nobody else would hold it on board." },
      { title: 'Silver', unlock: { type: 'events' }, text: "Her hair turned silver somewhere past Neptune. The crew blame the solar storm. Odette blames the fuel bill. The ship's doctor says it happened the night the Vega first called." },
      { title: 'The Vega', unlock: { type: 'secret' }, text: "Some nights, a dark ship runs beside the Liner with no lights on. The crew call it the ghost galleon. Odette knows its real name. It is the Vega, and it calls every year to ask if the captain's table is open. Odette always says no. She is not afraid of losing. She is afraid that someone will order her to cheat again." },
    ],
    neon: [
      { title: 'The Sunglasses', unlock: { type: 'hands', n: 100 }, text: "Vinnie can bluff with his mouth but not with his eyes. They go wide on an ace and narrow on a ten, and every regular knew it. So he bought sunglasses in 1989 and has not been seen without them since." },
      { title: 'Twenty Chips', unlock: { type: 'events' }, text: "\"My smile costs twenty chips\" started as a joke. Then people started paying it. Vinnie keeps every one of those chips in a jar under the bar and gives the jar to whoever has the worst night of the month." },
      { title: 'The Back Booth', unlock: { type: 'secret' }, text: "After the Grand Hotel, she started over at Neon in the back booth, with a new name and the same yellow raincoat. Vinnie was the only one who knew. When the House sent men up the elevator in 2007, Vinnie told them a long, loud story about the senator and the ace of spades. It bought her four minutes, and she left through the kitchen. The story was made up, but the four minutes were real." },
    ],
    mars: [
      { title: 'The Upgrade', unlock: { type: 'hands', n: 100 }, text: "On the voyage out, the ship's slot machine jammed on a jackpot. Vinnie went at it with a screwdriver. It paid out 10,000 coins straight into his face. The eye he got afterwards sees in infrared, which is mostly useless at a card table. The cards that were dealt last are the warmest." },
      { title: 'The Locals', unlock: { type: 'events' }, text: "Mars has visitors. They come in through the airlock, watch a hand and leave. Vinnie deals them in anyway. They pay in rocks. He has a shelf of them behind the bar, and two have turned out to be worth more than the casino." },
      { title: 'The Reserved Booth', unlock: { type: 'secret' }, text: "Vinnie X still keeps the back booth reserved, with a yellow napkin folded on the table. One night his eye picked up a warm handprint on the seat, still fading. Under the napkin was a single gold chip from the Corner." },
    ],
    vip: [
      { title: 'The Gloves', unlock: { type: 'hands', n: 100 }, text: "Before the VIP Lounge, Valdez was the best card mechanic in the city. He could deal any card he wanted from anywhere in the deck. The House hired him on one condition. He put on white gloves that day and has never dealt bare-handed since." },
      { title: 'Two of Him', unlock: { type: 'events' }, text: "Some nights the staff swear they see two Mr. Valdezes in the room: one dealing, and one standing by the window, looking at the city. When asked, he says one of them is the man he is, and the other is the man who went home. He will not say which is which." },
      { title: 'You Remind Me of Someone', unlock: { type: 'secret' }, text: "In 2011 a woman in a yellow raincoat won her way to the top of the tower. Valdez knew her at once. Twenty years earlier he had left his family to work for the House. She had taken her mother's surname, Vega. They played all night and neither said a word. She won. As she stood up, he said, \"You remind me of someone.\" She said, \"So do you.\"" },
    ],
    horizon: [
      { title: 'Before the Tuxedo', unlock: { type: 'hands', n: 100 }, text: "Nobody hired Zyx. On the day the VIP Lounge reached the black hole, Zyx was already standing behind the table, as if it had been waiting a long time. The tuxedo was a gift from Mr. Valdez, mailed from Earth. It is the only gift Zyx has ever accepted." },
      { title: 'It Blinks', unlock: { type: 'events' }, text: "Now and then the black hole opens like an eye and looks around the room. Zyx stops dealing until it closes. It is the only player at the table that Zyx cannot read." },
      { title: 'Already Seen', unlock: { type: 'secret' }, text: "Zyx sees every hand at once: the ones dealt, the ones being dealt and the ones not dealt yet. It has seen one hand more often than any other. An old woman in a yellow raincoat sits down at the last table in the universe and asks for one more card. Zyx will not say how that hand ends. \"You will be there,\" it says. \"You are always there.\"" },
    ],
  };

  // ---------------------------------------------------------------- the letter (all 24 chapters)
  L.LETTER = {
    title: 'A Letter Left at the Corner',
    lines: [
      'Tito,',
      "You told me no, so I learned anyway. I learned from Odette what the House does when you win too much. I learned from Vinnie how far a good story can get you. And I learned from my father that some people keep every promise except the ones to their own family.",
      "I followed the tables all the way out to the edge of time. Zyx says I'm still there, asking for one more card. Maybe I am.",
      "Here's your gold chip back. I never needed the money. I needed somebody to tell me no.",
      "There's a kid at your table now who plays the way I used to. Be kind to them. Teach them when to walk away.",
      'L. V.',
      'P.S. Three in a row, kid. Your turn.',
    ],
  };

  // ---------------------------------------------------------------- legends: one per secret and Insanity set
  // set name -> [scene of the dealer who tells it, text]; shown once the set is unlocked.
  L.LEGENDS = {
    'Heartbreak': ['deco', "A pianist once played at the Grand Hotel every night for a woman who never came. On the last night he bet his piano on a 20, and the dealer drew six cards to make 21. He smiled and said, \"Of course.\" The deck he lost with is the one this set is cut from."],
    'King of Hearts': ['vip', "A king who had lost his kingdom once bet his last 500 at this table. He drew the ace and the king of hearts. He took his winnings, bought his crown back and never played again. \"The only royal flush that matters,\" Valdez says, \"is knowing when to stand up.\""],
    'Seventh Heaven': ['corner', "In 1961 a nun walked into the Corner to ask for money for the church roof. The owner laughed and said she could have whatever the slot machine paid. She pulled the lever once. Seven, seven, seven. The church got its roof, and the machine never paid triple sevens again. Tito still calls it the holy machine."],
    'Platinum': ['orbit', "For thirty years Tito kept a platinum chip behind the bar, \"for the one who's seen it all\". Nobody ever got it. When the Corner went to orbit, he gave the chip to T1-T0 with one instruction: you'll know them when they sit down. T1-T0 has scanned every player since."],
    'Deadwood': ['neon', "Wild Bill was holding aces and eights when he was shot in 1876, and the hand has been called the dead man's hand ever since. Vinnie claims his great-great-grandfather was the dealer that night. This is one of the stories that isn't true."],
    'Blood Moon': ['mars', "The first colonists had one rule: when both moons turn red, nobody goes outside alone. A miner named Rook broke it. He came back a week later with an empty air tank and a pocket full of red chips from a casino that doesn't exist. He never said where he'd been. He just stood at the window whenever the moons came up."],
    'Silver Wolf': ['horizon', "The Silver Wolf was a one-man mining ship that never took a crew. Its pilot flew it all the way to the last table in the universe and played alone until the hull iced over silver. Zyx still keeps the pilot's chair empty, and nobody else is allowed to sit in it."],
    'Eclipse': ['horizon', "Once, the black hole swallowed a whole star in the middle of a hand. For a moment there was no light at the table at all, and Zyx dealt in total darkness. When the light came back, the cards on the felt were not the ones it had dealt. Zyx has never found out who played that hand."],
    'Unknown Signal': ['liner', "Every radio on the Liner picks up the same signal at 3:12 in the morning: three short beeps, a pause, then static. The crew made a game of guessing what it is. Odette never guesses. She writes the time in the log and turns the volume down."],
    'The House': ['vip', "Every casino has an owner, and every owner answers to someone. At the very top there is a name, and it is never spoken at the table. Valdez has met the one who built the house only once. \"They were younger than I expected,\" he says, \"and they were smiling.\""],
    'Hitman': ['neon', "Some names are only ever whispered. When the House needs a problem to go away quietly, a man in a dark suit takes a seat at the table and loses on purpose for an hour. Then the problem is gone. Vinnie has served him drinks twice. He tipped well both times."],
    'Eyewitness': ['deco', "A night porter named Bruno kept a notebook of everything strange he saw: a mouse with a gold chip, a thief on a rope, a man in two places at once. The hotel fired him for drinking. He never drank. Odette kept the notebook, and she still adds a line to it now and then."],
    'Laurel': ['deco', "In 1938 a schoolteacher won at every table in the city in one season, and the Grand Hotel gave her a laurel crown. She wore it once, to dinner, and gave it back the next morning. \"I only wanted to see if it could be done,\" she said. Odette has kept the wreath polished ever since, waiting for the next one."],
    'Still Water': ['vip', "Valdez learned to deal on his grandfather's dock, over a lake so still you could read the cards in it. His grandfather had one rule: if the water moves, you're nervous, and if you're nervous, you've already lost. Valdez hasn't let the water move since."],
    'Halcyon': ['liner', "A kingfisher got into the Liner's greenhouse on launch day and has lived there ever since. The crew say that on the days it sings, nothing goes wrong on board. Odette says she doesn't believe it. She also feeds it every morning before her shift."],
    'Iron Owl': ['vip', "In 1903 a mathematician built a clockwork owl to check the dealers' arithmetic in the House's library. It has never been switched off and has never been wrong. Once a year Valdez winds it himself. He says it's the only one in the building he trusts."],
    'Dragon’s Hoard': ['vip', "The House keeps one vault that nobody is allowed to open. The night guards say something breathes behind the door, and that the floor outside is always warm. Valdez has the only key. Once a year he goes in with a single chip from the biggest win of the year, and he comes out with his gloves singed."],
    'Golden Ace': ['neon', "Vinnie's grandfather carried a solid-gold ace of spades as a lucky charm. He bet it once, on a single hand, and lost. He spent twenty years buying it back. Vinnie wears it on a chain under his shirt now, and swears it gets warm when someone at his table is about to hit."],
    'Yellow Raincoat': ['corner', "Some nights are worth living twice. Tito never told anyone what he saw the second time: the same rain, the same door, three blackjacks in a row, and a kid in a yellow raincoat who didn't leave. He just took the gold chip out of his vest pocket and put it on the felt. \"Welcome back,\" he said."],
  };


  // ---------------------------------------------------------------- progress
  const HANDS = 100;
  const stat = (k) => { const A = root.Achievements; return (A && A.stats()[k]) || 0; };
  /** How far a chapter is: { open, have, need } (have/need only for the hands chapter). */
  function chapter(scene, i) {
    const ch = L.CHAPTERS[scene] && L.CHAPTERS[scene][i];
    if (!ch) return { open: false };
    if (ch.unlock.type === 'hands') { const have = Math.min(stat('handsAt_' + scene), ch.unlock.n); return { open: have >= ch.unlock.n, have, need: ch.unlock.n }; }
    if (ch.unlock.type === 'events') { const E = root.SceneEvents, p = E && E.progress ? E.progress(scene) : null; return { open: !!(p && p.total && p.seen >= p.total) }; }
    const T = root.DealerTalk;
    return { open: !!(T && T.secretsSeen && T.secretsSeen().includes('secret_' + scene)) };
  }
  const SCENES = () => Object.keys(L.CHAPTERS);
  const chaptersOpen = () => SCENES().reduce((n, s) => n + L.CHAPTERS[s].filter((c, i) => chapter(s, i).open).length, 0);
  const chaptersTotal = () => SCENES().reduce((n, s) => n + L.CHAPTERS[s].length, 0);
  Object.assign(L, {
    HANDS, chapter, chaptersOpen, chaptersTotal,
    /** All 24 chapters read: the letter shows, and Rainy Night can be earned at The Corner. */
    complete: () => chaptersOpen() >= chaptersTotal(),
  });
})(window);
