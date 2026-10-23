// Shared constants. Keep in sync with public/js if you edit.
const RESOURCES = ['wood', 'brick', 'sheep', 'wheat', 'ore'];
const COMMODITIES = ['paper', 'cloth', 'coin']; // from wood/sheep/ore cities in C&K
const COMMODITY_FROM = { wood: 'paper', sheep: 'cloth', ore: 'coin' };

const BUILD_COST = {
  road:       { wood: 1, brick: 1 },
  settlement: { wood: 1, brick: 1, sheep: 1, wheat: 1 },
  city:       { wheat: 2, ore: 3 },
  dev:        { sheep: 1, wheat: 1, ore: 1 },
  // C&K
  cityWall:   { brick: 2 },
  knight:     { sheep: 1, ore: 1 },
};

const DEV_CARD_DECK = [
  ...Array(14).fill('knight'),
  ...Array(5).fill('vp'),
  ...Array(2).fill('road_building'),
  ...Array(2).fill('year_of_plenty'),
  ...Array(2).fill('monopoly'),
];

// C&K improvement tracks: trade (paper), politics (coin), science (cloth)
const CK_TRACKS = ['trade', 'politics', 'science'];
const CK_COMMODITY_FOR_TRACK = { trade: 'paper', politics: 'coin', science: 'cloth' };
// Cost to buy a level: level N costs N commodities of that track's type
// Level 4 unlocks metropolis (needs a city). Level 5 is the max.
const CK_MAX_LEVEL = 5;
const CK_METROPOLIS_LEVEL = 4;

const COLORS = ['#E85D04', '#FAA307', '#D00000', '#9D0208', '#F48C06', '#FFBA08'];

module.exports = {
  RESOURCES, COMMODITIES, COMMODITY_FROM,
  BUILD_COST, DEV_CARD_DECK,
  CK_TRACKS, CK_COMMODITY_FOR_TRACK, CK_MAX_LEVEL, CK_METROPOLIS_LEVEL,
  COLORS,
};
