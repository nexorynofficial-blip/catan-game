// Cities & Knights layer.
// Scope kept pragmatic: commodities, improvement tracks, knights (basic/strong/mighty,
// activated/inactive), city walls, barbarian ship advance + attacks, metropolises.
// Progress cards are simplified to an aspect card pool with 3 basic effects per track —
// ponytail: full progress deck is a big dataset; add when players ask for it.

const C = require('./constants');

function initCKState(game) {
  return {
    barbarianDistance: 7,     // ship starts 7 steps away
    barbarianAttacks: 0,
    metropolises: { trade: null, politics: null, science: null },
    aspectDeck: makeAspectDeck(),
  };
}

function initPlayer() {
  return {
    tracks: { trade: 0, politics: 0, science: 0 },
    knights: {},     // vertexId -> { rank: 1-3, active: bool }
    cityWalls: [],   // vertexIds (cities with walls)
    aspectCards: [], // simplified progress cards
    defenders: 0,    // defender tokens earned from past barbarian wins
  };
}

function makeAspectDeck() {
  // Simplified: 15 cards total, 5 per track, basic effects
  const deck = [];
  for (const t of C.CK_TRACKS) {
    for (let i = 0; i < 5; i++) deck.push({ track: t, effect: 'basic' });
  }
  return shuffle(deck);
}

function shuffle(a) {
  const b = a.slice();
  for (let i = b.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [b[i], b[j]] = [b[j], b[i]];
  }
  return b;
}

function handleEventDie(game, event) {
  if (!game.cnk) return;
  if (event === 'barbarian') {
    game.ck.barbarianDistance -= 1;
    game.pushLog(`Barbarians advance (${game.ck.barbarianDistance} steps left)`);
    if (game.ck.barbarianDistance <= 0) {
      runBarbarianAttack(game);
      game.ck.barbarianDistance = 7;
    }
  } else {
    // trade/politics/science: all cities with the matching track get a chance to draw aspect
    // Simplified: current player draws if they have any city and track >= 1
    const p = game.current();
    if (!p || !p.ck) return;
    if (p.ck.tracks[event] >= 1 && p.cities.length > 0) {
      const idx = game.ck.aspectDeck.findIndex(c => c.track === event);
      if (idx !== -1) {
        p.ck.aspectCards.push(game.ck.aspectDeck.splice(idx, 1)[0]);
        game.pushLog(`${p.name} drew a ${event} aspect card`);
      }
    }
  }
}

function runBarbarianAttack(game) {
  game.ck.barbarianAttacks += 1;
  // sum of knight strength per player (active knights only)
  const strengths = game.players.map(p => ({
    p,
    s: p.ck
      ? Object.values(p.ck.knights).filter(k => k.active)
          .reduce((a, k) => a + k.rank, 0)
      : 0,
  }));
  const total = strengths.reduce((a, x) => a + x.s, 0);
  const barbStrength = game.players.reduce((a, p) => a + p.cities.length, 0);

  if (total >= barbStrength) {
    // Catan defends: strongest contributor earns a defender of catan card (hidden VP)
    const max = Math.max(...strengths.map(x => x.s));
    const winners = strengths.filter(x => x.s === max && x.s > 0);
    for (const w of winners) {
      w.p.ck.defenders += 1;
      w.p.hiddenVp += 1;
    }
    game.pushLog(`Barbarians repelled! (${total} vs ${barbStrength})`);
  } else {
    // weakest contributor(s) lose a city back to a settlement
    const min = Math.min(...strengths.map(x => x.s));
    const losers = strengths.filter(x => x.s === min);
    for (const l of losers) {
      if (l.p.cities.length === 0) continue;
      // pick first city (walls save it)
      let lostVertex = l.p.cities[0];
      if (l.p.ck.cityWalls.includes(lostVertex)) {
        l.p.ck.cityWalls = l.p.ck.cityWalls.filter(v => v !== lostVertex);
        game.pushLog(`${l.p.name}'s wall saves their city`);
      } else {
        l.p.cities = l.p.cities.filter(v => v !== lostVertex);
        l.p.settlements.push(lostVertex);
        l.p.vp -= 1;
        game.pushLog(`${l.p.name} loses a city to the barbarians!`);
      }
    }
  }
  // deactivate all knights after an attack
  for (const p of game.players) {
    if (!p.ck) continue;
    for (const k of Object.values(p.ck.knights)) k.active = false;
  }
}

function improveTrack(game, playerId, track) {
  const p = game.getPlayer(playerId);
  if (!p.ck) throw new Error('not a C&K game');
  const current = p.ck.tracks[track];
  if (current >= C.CK_MAX_LEVEL) throw new Error('track maxed');
  const nextLevel = current + 1;
  const commodity = C.CK_COMMODITY_FOR_TRACK[track];
  if (p.hand.c[commodity] < nextLevel) throw new Error(`need ${nextLevel} ${commodity}`);
  p.hand.c[commodity] -= nextLevel;
  p.ck.tracks[track] = nextLevel;
  game.pushLog(`${p.name} improved ${track} to lvl ${nextLevel}`);

  // Metropolis at level 4
  if (nextLevel >= C.CK_METROPOLIS_LEVEL && game.ck.metropolises[track] == null) {
    if (p.cities.length > 0) {
      game.ck.metropolises[track] = { playerId: p.id, vertexId: p.cities[0] };
      p.vp += 2;
      game.pushLog(`${p.name} founds the metropolis of ${track}!`);
    }
  }
  game.checkWin();
}

function buildKnight(game, playerId, vertexId) {
  // Lazy: knight occupies a vertex adjacent to own road; costs sheep+ore; starts inactive, rank 1
  const p = game.getPlayer(playerId);
  if (!p.ck) throw new Error('not a C&K game');
  const vOwner = game.vertexOwner(vertexId);
  if (vOwner) throw new Error('vertex occupied');
  if (!game.vertexConnectedToPlayerRoad(vertexId, p.id)) throw new Error('must connect to your road');
  if (p.hand.r.sheep < 1 || p.hand.r.ore < 1) throw new Error('cannot afford');
  p.hand.r.sheep -= 1; p.hand.r.ore -= 1;
  p.ck.knights[vertexId] = { rank: 1, active: false };
  game.pushLog(`${p.name} hired a knight`);
}

function promoteKnight(game, playerId, vertexId) {
  const p = game.getPlayer(playerId);
  const k = p.ck?.knights?.[vertexId];
  if (!k) throw new Error('no knight');
  if (k.rank >= 3) throw new Error('max rank');
  // Need politics level for mighty (rank 3)
  if (k.rank === 2 && p.ck.tracks.politics < 3) throw new Error('politics 3 required for mighty');
  if (p.hand.r.sheep < 1 || p.hand.r.ore < 1) throw new Error('cannot afford');
  p.hand.r.sheep -= 1; p.hand.r.ore -= 1;
  k.rank += 1;
  game.pushLog(`${p.name} promoted a knight to rank ${k.rank}`);
}

function activateKnight(game, playerId, vertexId) {
  const p = game.getPlayer(playerId);
  const k = p.ck?.knights?.[vertexId];
  if (!k) throw new Error('no knight');
  if (k.active) throw new Error('already active');
  if (p.hand.r.wheat < 1) throw new Error('need 1 wheat');
  p.hand.r.wheat -= 1;
  k.active = true;
  game.pushLog(`${p.name} activated a knight`);
}

function buildWall(game, playerId, vertexId) {
  const p = game.getPlayer(playerId);
  if (!p.cities.includes(vertexId)) throw new Error('wall needs a city');
  if (p.ck.cityWalls.includes(vertexId)) throw new Error('already walled');
  if (p.hand.r.brick < 2) throw new Error('need 2 brick');
  p.hand.r.brick -= 2;
  p.ck.cityWalls.push(vertexId);
  game.pushLog(`${p.name} built a city wall`);
}

module.exports = {
  initCKState, initPlayer, handleEventDie, runBarbarianAttack,
  improveTrack, buildKnight, promoteKnight, activateKnight, buildWall,
};
