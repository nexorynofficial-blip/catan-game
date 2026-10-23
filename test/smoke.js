// Smoke test: load the engine, set up 4 players, run setup phase, do a turn.
// Fails loudly on any thrown error. Run with: node test/smoke.js
const assert = require('assert');
const { Game } = require('../src/game');
const { MAPS } = require('../src/board');

function pickOpenSettlementVertex(game, playerId) {
  const topo = game.map.topo;
  const taken = new Set();
  for (const p of game.players) {
    p.settlements.forEach(v => taken.add(v));
    p.cities.forEach(v => taken.add(v));
  }
  for (const v of topo.vertices) {
    if (taken.has(v.id)) continue;
    let adjTaken = false;
    for (const nb of topo.vAdj[v.id]) if (taken.has(nb)) { adjTaken = true; break; }
    if (!adjTaken) return v.id;
  }
  return null;
}

function pickRoadForNewSettlement(game, playerId) {
  const p = game.getPlayer(playerId);
  const vid = p.settlements[p.settlements.length - 1];
  const v = game.map.topo.vertices[vid];
  for (const eId of v.edges) {
    if (!game.edgeOwner(eId)) return eId;
  }
  return null;
}

for (const map of MAPS) {
  console.log(`-- map: ${map.id} --`);
  const g = new Game({ mapVariant: map.id, mode: 'base', seed: 42 });
  const names = ['Ava', 'Ben', 'Cat', 'Dev'];
  for (let i = 0; i < Math.min(4, map.maxPlayers); i++) {
    g.addPlayer('p' + i, names[i]);
  }
  g.start();
  // setup 1
  while (g.phase === 'setup_1') {
    const pid = g.players[g.turn].id;
    const v = pickOpenSettlementVertex(g, pid);
    g.placeSettlement(pid, v, { setup: true });
    const e = pickRoadForNewSettlement(g, pid);
    g.placeRoad(pid, e, { setup: true });
    g.endSetupStep(pid);
  }
  // setup 2
  while (g.phase === 'setup_2') {
    const pid = g.players[g.turn].id;
    const v = pickOpenSettlementVertex(g, pid);
    g.placeSettlement(pid, v, { setup: true });
    const e = pickRoadForNewSettlement(g, pid);
    g.placeRoad(pid, e, { setup: true });
    g.endSetupStep(pid);
  }
  assert.strictEqual(g.phase, 'roll', `${map.id}: expected roll phase after setup`);
  // Roll once
  const pid = g.players[g.turn].id;
  g.rollDice(pid);
  // Could be 7 (robber) or normal; just verify phase is sensible
  assert.ok(['main', 'discard', 'move_robber'].includes(g.phase), `${map.id}: unexpected ${g.phase}`);
  // snapshot sanity
  const snap = g.snapshot(pid);
  assert.ok(snap.players.length >= 3, 'at least 3 players');
  assert.ok(snap.map.topo.hexes.length > 0, 'has hexes');
  console.log(`   ${map.id} OK — ${g.map.topo.hexes.length} hexes, ${g.players.length} players, phase=${g.phase}`);
}

console.log('\nAll smoke tests passed.');
