/* Lore for the Lore screen: one entry per scene (ids match js/scenarios.js), with a dealer bio and a place description.
   Each space scene is the same dealer and room as its Challenge scene, carried off into space. */
(function (root) {
  'use strict';

  root.Lore = {
    corner: {
      dealer: "Don Tito has dealt at the same green table for thirty years and has never once rushed a hand. He remembers every regular's name, their favourite drink and the night they hit three blackjacks in a row. He calls everyone \"pibe\", even people older than him. Rumour says he has never lost track of the count, but he will only smile if you ask.",
      place: "El Rincón is the corner casino at the end of the block: wood panels, two old slot machines and an OPEN sign that flickers more than it should. The carpet has seen spilled coffee, lucky streaks and at least one marriage proposal. It's the place where everyone learns to play.",
    },
    orbit: {
      dealer: "When El Rincón was rebuilt in orbit, Don Tito trained his replacement himself. T1-T0 is a station dealer unit with his patience, his habits and, somehow, his sense of humour. It shuffles in zero gravity without dropping a card. Engineers swear it isn't programmed to blink, yet it does.",
      place: "Estación Órbita is El Rincón bolted onto a space station, with Earth turning slowly past the window. The slot machines became holo terminals and the carpet became a metal grate, but the OPEN sign still flickers. Every ninety minutes the sun rises over the table.",
    },
    deco: {
      dealer: "Madame Odette has run the high table at the Gran Hotel since the chandeliers were new. She speaks four languages and lets her pearls do the talking when a player gets rowdy. She has seen every trick in the book, and she wrote a few of them. Her one rule: never touch the cards.",
      place: "The Gran Hotel is an art deco palace of navy walls, gold fans and crystal chandeliers. Its checkerboard marble floor has been polished every night for a hundred years. Big money moves quietly here, and so do the staff.",
    },
    liner: {
      dealer: "When the Gran Hotel was relaunched as a star liner, the owners offered Odette the captain's chair, and she took the table with it. Capitana Odette now runs both the ship and the game from behind a helmet visor. Her hair turned silver somewhere past Neptune. Her rules didn't change.",
      place: "Crucero Estelar is the Gran Hotel rebuilt as a luxury liner drifting through a nebula. Through the gold portholes, pink and violet clouds roll past. The chandeliers were swapped for floating ringed lamps, because nothing hangs straight in deep space.",
    },
    neon: {
      dealer: "Vinnie talks faster than he deals, and he deals very fast. He never takes off his sunglasses, not even at night, and especially not at night. Regulars say his smile costs you twenty chips. He has a story for every card, and most of them are true.",
      place: "Neón sits high above the avenue, with a glass wall full of skyscrapers and signs that never switch off. The music is loud, the drinks are bright and nobody checks the time. It's where good players go to find out how good they really are.",
    },
    mars: {
      dealer: "An accident with a slot machine on the voyage out left Vinnie with a new cybernetic eye. He calls it an upgrade. Vinnie X can now read the shoe in infrared, or so he claims. He still talks too much.",
      place: "Neón Marte is the avenue moved under the domes of a Martian colony, with red dunes and two small moons outside the glass. The bar and the 21 sign glow from their own domes across the sand. Out here the air is rationed, but the neon is not.",
    },
    vip: {
      dealer: "Señor Valdés runs the private room and never raises his voice. He wears white gloves and a gold monocle, and he can tell a counter from a gambler in two hands. The house trusts him with its largest bets, and he has never needed to call security.",
      place: "The Sala VIP is the penthouse at the top of the tower, with velvet curtains, a black marble floor and the whole city glittering far below. Bets start where other tables end. You only get in by winning your way up.",
    },
    horizon: {
      dealer: "Nobody knows how old Zyx is, including Zyx. It took over the VIP table where time runs slow, and wears a tuxedo out of respect for the house. It deals from the edge of time, so a single hand can feel like a century. It always pays out exactly what you're owed.",
      place: "Horizonte de Sucesos is the Sala VIP parked at the edge of a black hole. The window shows a ring of fire bent around a hole of perfect black. Time slows the closer you sit to the glass. It's the last table in the universe, and the stakes are as high as they get.",
    },
  };
})(window);
