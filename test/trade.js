// Trade smoke test. Verifies offer/respond/accept flow.
const assert = require('assert');
const { Game } = require('../src/game');

const g = new Game({ mapVariant: 'classic', seed: 1 });
g.addPlayer('a', 'Ava'); g.addPlayer('b', 'Ben'); g.addPlayer('c', 'Cat');
g.start();
// skip proper setup; force into main for player 'a'
g.phase = 'main';
g.turn = 0;

const A = g.getPlayer('a'), B = g.getPlayer('b');
A.hand.r.wood = 2;
B.hand.r.ore  = 2;

// A offers 1 wood for 1 ore
g.tradeOffer('a', { wood: 1 }, { ore: 1 });
assert.ok(g.openTrade, 'offer stored');

// C tries to accept but has no ore → should throw
assert.throws(() => g.tradeRespond('c', true));

// B accepts
g.tradeRespond('b', true);
assert.strictEqual(g.openTrade.responses.b, 'accept');

// A confirms with B
g.tradeAccept('a', 'b');
assert.strictEqual(g.openTrade, null, 'trade closed');
assert.strictEqual(A.hand.r.wood, 1);
assert.strictEqual(A.hand.r.ore, 1);
assert.strictEqual(B.hand.r.wood, 1);
assert.strictEqual(B.hand.r.ore, 1);

// Non-current player can't offer
assert.throws(() => g.tradeOffer('b', { wood: 1 }, { ore: 1 }));

// Current player can't accept their own offer
g.tradeOffer('a', { wood: 1 }, { ore: 1 });
assert.throws(() => g.tradeRespond('a', true));

// Cancel
g.tradeCancel('a');
assert.strictEqual(g.openTrade, null);

// End turn clears any open trade
g.tradeOffer('a', { wood: 1 }, { ore: 1 });
g.endTurn('a');
assert.strictEqual(g.openTrade, null);

// History records both p2p and bank trades
assert.ok(Array.isArray(g.tradeHistory));
assert.ok(g.tradeHistory.some(h => h.kind === 'p2p'), 'p2p recorded');
g.phase = 'main'; g.turn = 0;  // force back to Alice's main turn
A.hand.r.wood = 4;
g.trade('a', { wood: 4 }, { ore: 1 });
assert.ok(g.tradeHistory.some(h => h.kind === 'bank'), 'bank recorded');

console.log('Trade smoke test passed.');
