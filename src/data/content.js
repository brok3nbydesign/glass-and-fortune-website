/* Website copy. Every claim here is checked against the game itself
   (runtime/fortune-engine.js and fortune-rules.js in the game folder).
   Edit the words freely; keep the facts true to the build you ship. */

export const HERO = {
  kicker: 'A roguelike game of loaded fate',
  tagline: 'Bend the roll. Build the hand. Cheat fate.',
  description:
    'Five glass dice wait on Morrow’s table. Turn a number, tint a colour, spend your Favour wisely — and cast a hand strong enough to survive twelve Readings.',
  invitation: 'Go on. Try your luck.',
};

export const ABOUT = {
  eyebrow: 'The Game',
  title: 'Fortune can be persuaded.',
  paragraphs: [
    'Take a seat in a candlelit Victorian parlour. Morrow presides over the table, Tally keeps the figures, and five glass dice wait for your hand.',
    'Every die carries a number and a colour, and both count. Line up matching numbers, chase a run, stain a whole hand one colour or scatter it across all six. Then, before you cast, bend the roll — one deliberate change at a time.',
    'Each fortune is a run of twelve Readings with rising targets and new Table Rules. Collect strange Charms and clever Curios, find the combinations they make together, and decide when the hand in front of you is good enough to keep.',
  ],
  pillars: [
    {title: 'Your choice, not your luck', text: 'The roll is only the start. What you do with it decides the score.'},
    {title: 'A fortune of your own', text: 'Different Charms, Curios and paths make every run play differently.'},
    {title: 'One more cast', text: 'Short, tense Readings that are easy to start and hard to put down.'},
  ],
};

export const STEPS = [
  {
    n: 'I',
    title: 'Roll the glass',
    text: 'Five dice land on the table. Each shows a number from one to six and one of six glass colours.',
    image: 'step-roll',
    alt: 'Five glass dice on the Glass & Fortune table, four green and one amber',
  },
  {
    n: 'II',
    title: 'Bend the roll',
    text: 'Pick a die and spend Favour: TURN raises its number, TINT shifts its colour, RECAST gambles on both.',
    image: 'step-bend',
    alt: 'The TURN, TINT and RECAST controls under the current hand',
  },
  {
    n: 'III',
    title: 'Cast your hand',
    text: 'Numbers and colours combine into hands. Your Charms and Curios add their bonuses one by one.',
    image: 'step-cast',
    alt: 'A cast scoring a Stained Full House with Charm bonuses added',
  },
  {
    n: 'IV',
    title: 'Beat the Reading',
    text: 'Reach the target within three casts to move on, spend your Shards, and press toward the last Reading.',
    image: 'step-reading',
    alt: 'The Reading score bar filling toward its target',
  },
];

export const FEATURES = [
  {
    id: 'glass',
    eyebrow: 'Glass with two faces',
    title: 'Numbers and colours, read together.',
    text: 'A Pair, a Triad, a Glass Run, a Full House, Five of Fortune. Make it all one colour and the glass is Stained; make it five different colours and it becomes a Spectrum hand. Every die you change can open a better reading of the same roll.',
    image: 'shot-late',
    alt: 'A late Reading with five dice of five different colours forming a Spectrum Fourfold',
  },
  {
    id: 'cabinet',
    eyebrow: 'Charms & Curios',
    title: 'Build a fortune around your choices.',
    text: 'Charms are lasting powers that reward the patterns you chase, and some grow every time they fire. Curios are tools for the right moment: set a number, change a colour, move a pip, rescue a hand. Find the ones that work together.',
    image: 'shot-cabinet',
    alt: 'The Curio Cabinet offering Lucky Cup, with Morrow beside it',
    cards: ['charm_monochrome_moth', 'charm_rainbow_thread', 'curio_velvet_glove', 'curio_lucky_cup', 'charm_hush_bell', 'curio_glass_leech'],
  },
  {
    id: 'scoring',
    eyebrow: 'The payoff',
    title: 'Watch the combination unfold.',
    text: 'Cast, and the hand scores one contribution at a time: the base hand first, then each Charm and Curio that answers it, with its card lighting up and a rising glass note. You always see what helped, and what could be stronger next time.',
    image: 'shot-summary',
    alt: 'The score breakdown for a Stained Full House showing the base hand, Monochrome Moth and Twin Flame',
  },
  {
    id: 'readings',
    eyebrow: 'Twelve Readings',
    title: 'The table grows stranger as you go.',
    text: 'Every Reading raises the target and lays down a new Table Rule. Fortune Threads reshape the road ahead, and later dice can arrive scarred. Survive the full sequence, or return to the table with a different plan.',
    image: 'thread-lantern',
    alt: 'Fortune Thread artwork: the Prism Lantern',
  },
];

export const HOSTS = {
  eyebrow: 'Your hosts',
  title: 'Morrow keeps the table. Tally keeps the figures.',
  text: 'A soft-spoken figure in a beaked mask deals your fortune, comments on your choices and announces your hands. A little clockwork companion keeps count. The parlour is theirs; the gamble is yours.',
};

export const GALLERY = [
  {id: 'shot-title', caption: 'The parlour opens', alt: 'Glass & Fortune title screen in Morrow’s parlour, with the logo, menu and five glowing glass dice on a velvet table'},
  {id: 'shot-table', caption: 'A Stained Full House on the table', alt: 'Gameplay: four green dice and one amber die, Charms on the left, Curios on the right and the current hand reading Stained Full House'},
  {id: 'shot-summary', caption: 'Bonuses add up one by one', alt: 'The scoring breakdown showing base points, Monochrome Moth and Twin Flame adding to a cast score of 1,799'},
  {id: 'shot-starter', caption: 'Choose your first Charm', alt: 'The starter Charm choice with Monochrome Moth in the centre and Morrow speaking'},
  {id: 'shot-cabinet', caption: 'The Curio Cabinet', alt: 'The Curio Cabinet shop with Lucky Cup on offer for five Shards'},
  {id: 'shot-late', caption: 'Final cast of a late Reading', alt: 'Reading eleven, a final cast with five differently coloured dice forming a Spectrum Fourfold'},
];

/* Shown when the die settles. Two per face so a repeat throw reads fresh. */
export const RESULT_LINES = {
  1: ['A one. Even fortune starts somewhere.', 'A one. The night is young.'],
  2: ['A two. Fortune is only warming up.', 'A two. Hardly a prophecy. Again?'],
  3: ['A three. The parlour leans in.', 'A three. A modest omen.'],
  4: ['A four. Morrow nods, almost approving.', 'A four. The glass is listening.'],
  5: ['A five. The candles burn a little brighter.', 'A five. So very nearly perfect.'],
  6: ['A six. Fortune favours the curious.', 'A six. Fortune favours you.'],
};

export const FINAL_CTA = {
  title: 'The table is waiting.',
  text: 'Wishlist Glass & Fortune on Steam to hear the moment the parlour opens its doors.',
};
