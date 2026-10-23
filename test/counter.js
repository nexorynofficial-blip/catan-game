// Counter-offer smoke test.
const assert = require('assert');
const { Game } = require('../src/game');

const g = new Game({ mapVariant: 'classic', seed: 1 });
g.addPlayer('a', 'Ava'); g.addPlayer('b', 'Ben'); g.addPlayer('c', 'Cat');
g.start();
g.phase = 'main';
g.turn = 0;

const A = g.getPlayer('a'), B = g.getPlayer('b');
A.hand.r.wood = 2; A.hand.r.wheat = 1;
B.hand.r.ore  = 2; B.hand.r.sheep = 1;

// A offers 1 wood for 1 ore
g.tradeOffer('a', { wood: 1 }, { ore: 1 });

// B counters: give 2 ore, want 2 wood
g.tradeCounter('b', { ore: 2 }, { wood: 2 });
assert.deepStrictEqual(g.openTrade.counters.b, { give: { ore: 2 }, want: { wood: 2 } });

// Counter without resources fails
assert.throws(() => g.tradeCounter('c', { brick: 1 }, { wheat: 1 }));

// A accepts B's counter → A gives 2 wood, gets 2 ore
g.tradeAccept('a', 'b');
assert.strictEqual(A.hand.r.wood, 0);
assert.strictEqual(A.hand.r.ore, 2);
assert.strictEqual(B.hand.r.ore, 0);
assert.strictEqual(B.hand.r.wood, 2);
assert.strictEqual(g.openTrade, null);

// New round: counter supersedes accept
g.tradeOffer('a', { wheat: 1 }, { sheep: 1 });
g.tradeRespond('b', true);  // b accepts (actually b has no sheep, must fail)
// b has 0 sheep now (gave 1 ore worth of 'sheep'? no, b had 1 sheep originally still has 1 sheep)
// let me re-check: B started with ore:2, sheep:1. Then traded 2 ore for 2 wood, so B now has sheep:1, wood:2, ore:0.
assert.strictEqual(B.hand.r.sheep, 1);
assert.strictEqual(g.openTrade.responses.b, 'accept');

// b changes mind and counters
g.tradeCounter('b', { sheep: 1 }, { wheat: 2 });
assert.strictEqual(g.openTrade.responses.b, undefined); // accept cleared
assert.ok(g.openTrade.counters.b);

// a can't accept because they only have 1 wheat
assert.throws(() => g.tradeAccept('a', 'b'));

console.log('Counter-offer smoke test passed.');
