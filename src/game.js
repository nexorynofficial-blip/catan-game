// Core game state + rule engine. Server-authoritative.
// Base Catan + Cities & Knights toggle.

const { makeMap, shuffle } = require('./board');
const C = require('./constants');
const ck = require('./ck');

const PHASE = {
  LOBBY: 'lobby',
  SETUP_1: 'setup_1',          // first settlement + road, players in order
  SETUP_2: 'setup_2',          // second settlement + road, reverse order
  ROLL: 'roll',                // start of turn: dice + distribute
  DISCARD: 'discard',          // players with >7 cards after a 7
  MOVE_ROBBER: 'move_robber',
  STEAL: 'steal',
  MAIN: 'main',                // build / trade / dev
  END: 'end',
};

function emptyHand() {
  const r = {}, c = {};
  for (const x of C.RESOURCES) r[x] = 0;
  for (const x of C.COMMODITIES) c[x] = 0;
  return { r, c };
}

function cardCount(hand) {
  return Object.values(hand.r).reduce((a, b) => a + b, 0) +
         Object.values(hand.c).reduce((a, b) => a + b, 0);
}

function canAfford(hand, cost) {
  for (const [k, v] of Object.entries(cost)) {
    if ((hand.r[k] ?? 0) < v) return false;
  }
  return true;
}

function pay(hand, cost) {
  for (const [k, v] of Object.entries(cost)) hand.r[k] -= v;
}

function refund(hand, cost) {
  for (const [k, v] of Object.entries(cost)) hand.r[k] += v;
}

class Game {
  constructor({ mapVariant = 'classic', mode = 'base', seed = Date.now() }) {
    const rand = mulberry32(seed);
    this.map = makeMap(mapVariant, rand);
    this.mode = mode;                       // 'base' | 'cnk'
    this.cnk = mode === 'cnk';
    this.players = [];           // { id, name, color, hand, pieces, roads, settlements, cities, devCards, playedKnights, vp, cnk:{...} }
    this.turn = 0;               // index into players
    this.phase = PHASE.LOBBY;
    this.lastRoll = null;
    this.dice = { red: 0, yellow: 0, event: null };
    this.robberHex = this.map.robberHex;
    this.devDeck = shuffle(C.DEV_CARD_DECK.slice(), rand);
    this.log = [];
    this.winner = null;
    this.pendingDiscards = new Set();  // playerIds that must discard
    this.longestRoad = { playerId: null, length: 4 }; // need 5+ to claim
    this.largestArmy = { playerId: null, size: 2 };    // need 3+ to claim
    this._rand = rand;
    this.ck = this.cnk ? ck.initCKState(this) : null;
    this.lastSettlementVertex = null; // for setup-2 resource grant
    this.robberMustMove = false;
    this.pendingSteal = null;         // { fromCandidates: [playerIds] }
    this.openTrade = null;            // { fromId, give:{res:n}, want:{res:n}, responses:{pid:'accept'} }
    this.tradeHistory = [];           // { turn, kind: 'p2p'|'bank', fromId, toId?, give, take, t }
  }

  addPlayer(id, name) {
    if (this.phase !== PHASE.LOBBY) throw new Error('game started');
    if (this.players.length >= 6) throw new Error('full');
    const color = C.COLORS[this.players.length];
    this.players.push({
      id, name, color,
      hand: emptyHand(),
      roads: [], settlements: [], cities: [],
      devCards: [], newDevCards: [], playedKnights: 0,
      vp: 0, hiddenVp: 0,
      ck: this.cnk ? ck.initPlayer() : null,
    });
    this.pushLog(`${name} joined`);
  }

  removePlayer(id) {
    if (this.phase !== PHASE.LOBBY) return; // can't leave mid-game cleanly
    this.players = this.players.filter(p => p.id !== id);
  }

  start() {
    if (this.players.length < 3) throw new Error('need at least 3 players');
    this.phase = PHASE.SETUP_1;
    this.turn = 0;
    this.pushLog('game starts — place first settlement and road');
  }

  current() { return this.players[this.turn]; }

  // -------- Setup phase --------

  placeSettlement(playerId, vertexId, { setup = false } = {}) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    const v = this.map.topo.vertices[vertexId];
    if (!v) throw new Error('bad vertex');

    // distance rule: no adjacent occupied vertex
    for (const nb of this.map.topo.vAdj[vertexId]) {
      if (this.vertexOwner(nb)) throw new Error('too close to another settlement');
    }
    if (this.vertexOwner(vertexId)) throw new Error('vertex occupied');

    if (setup) {
      if (this.phase !== PHASE.SETUP_1 && this.phase !== PHASE.SETUP_2) {
        throw new Error('not setup phase');
      }
      // must not have placed yet in this round
      const expected = this.phase === PHASE.SETUP_1 ? 1 : 2;
      if (p.settlements.length >= expected) throw new Error('already placed');
    } else {
      if (this.phase !== PHASE.MAIN) throw new Error('not main phase');
      if (!canAfford(p.hand, C.BUILD_COST.settlement)) throw new Error('cannot afford');
      // must connect to own road
      if (!this.vertexConnectedToPlayerRoad(vertexId, p.id)) {
        throw new Error('must connect to your road');
      }
      pay(p.hand, C.BUILD_COST.settlement);
    }

    p.settlements.push(vertexId);
    p.vp += 1;
    this.lastSettlementVertex = vertexId;
    this.pushLog(`${p.name} built a settlement`);
    this.checkWin();
  }

  placeRoad(playerId, edgeId, { setup = false, free = false } = {}) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    const e = this.map.topo.edges[edgeId];
    if (!e) throw new Error('bad edge');
    if (this.edgeOwner(edgeId)) throw new Error('edge taken');

    if (setup) {
      // must be adjacent to the settlement just placed
      const vs = [e.a, e.b];
      if (!vs.includes(this.lastSettlementVertex)) {
        throw new Error('road must touch your new settlement');
      }
    } else {
      if (this.phase !== PHASE.MAIN) throw new Error('not main phase');
      // must connect to own road/settlement/city
      if (!this.edgeConnectsToPlayer(edgeId, p.id)) {
        throw new Error('road must connect to your network');
      }
      if (!free) {
        if (!canAfford(p.hand, C.BUILD_COST.road)) throw new Error('cannot afford');
        pay(p.hand, C.BUILD_COST.road);
      }
    }
    p.roads.push(edgeId);
    this.pushLog(`${p.name} built a road`);
    this.updateLongestRoad();
  }

  endSetupStep(playerId) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase === PHASE.SETUP_1) {
      if (p.settlements.length !== 1 || p.roads.length !== 1) {
        throw new Error('place settlement and road first');
      }
      if (this.turn < this.players.length - 1) {
        this.turn++;
      } else {
        this.phase = PHASE.SETUP_2;
        this.pushLog('setup round 2 — reverse order');
      }
    } else if (this.phase === PHASE.SETUP_2) {
      if (p.settlements.length !== 2 || p.roads.length !== 2) {
        throw new Error('place second settlement and road first');
      }
      // grant resources from second settlement
      const v = this.lastSettlementVertex;
      for (const hid of this.map.topo.vertices[v].hexes) {
        const h = this.map.topo.hexes[hid];
        if (h.res !== 'desert' && h.num !== null) {
          p.hand.r[h.res] = (p.hand.r[h.res] ?? 0) + 1;
        }
      }
      if (this.turn > 0) {
        this.turn--;
      } else {
        this.phase = PHASE.ROLL;
        this.pushLog(`${this.current().name} to roll`);
      }
    } else {
      throw new Error('not setup');
    }
  }

  // -------- Main turn --------

  rollDice(playerId) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase !== PHASE.ROLL) throw new Error('not roll phase');

    const red = 1 + Math.floor(this._rand() * 6);
    const yellow = 1 + Math.floor(this._rand() * 6);
    const sum = red + yellow;
    this.dice = { red, yellow, event: null };
    this.lastRoll = sum;

    // C&K event die (3 barbarian / 3 others)
    if (this.cnk) {
      const e = Math.floor(this._rand() * 6);
      // 0,1,2 = barbarian; 3=trade; 4=politics; 5=science
      this.dice.event = ['barbarian', 'barbarian', 'barbarian',
                         'trade', 'politics', 'science'][e];
    }

    if (sum === 7) {
      // discards
      this.pendingDiscards = new Set(
        this.players.filter(pl => cardCount(pl.hand) > 7).map(pl => pl.id),
      );
      if (this.pendingDiscards.size > 0) {
        this.phase = PHASE.DISCARD;
      } else {
        this.phase = PHASE.MOVE_ROBBER;
        this.robberMustMove = true;
      }
      this.pushLog(`${p.name} rolled 7 — robber!`);
    } else {
      this.distribute(sum);
      if (this.cnk) ck.handleEventDie(this, this.dice.event);
      this.phase = PHASE.MAIN;
      this.pushLog(`${p.name} rolled ${sum}`);
    }
  }

  distribute(sum) {
    for (const h of this.map.topo.hexes) {
      if (h.num !== sum || h.id === this.robberHex || h.res === 'desert') continue;
      for (const vId of this.map.topo.hexVertices[h.id]) {
        const owner = this.vertexOwner(vId);
        if (!owner) continue;
        const isCity = owner.cities.includes(vId);
        const amount = isCity ? 2 : 1;
        if (this.cnk && isCity && C.COMMODITY_FROM[h.res]) {
          // city on wood/sheep/ore → 1 resource + 1 commodity
          owner.hand.r[h.res] += 1;
          owner.hand.c[C.COMMODITY_FROM[h.res]] += 1;
        } else {
          owner.hand.r[h.res] += amount;
        }
      }
    }
  }

  discard(playerId, cards) {
    if (this.phase !== PHASE.DISCARD) throw new Error('not discard phase');
    if (!this.pendingDiscards.has(playerId)) throw new Error('nothing to discard');
    const p = this.getPlayer(playerId);
    const total = cardCount(p.hand);
    const need = Math.floor(total / 2);
    const given = Object.values(cards).reduce((a, b) => a + b, 0);
    if (given !== need) throw new Error(`must discard exactly ${need}`);
    for (const [k, v] of Object.entries(cards)) {
      if (C.RESOURCES.includes(k)) {
        if (p.hand.r[k] < v) throw new Error('not enough');
        p.hand.r[k] -= v;
      } else if (C.COMMODITIES.includes(k)) {
        if (p.hand.c[k] < v) throw new Error('not enough');
        p.hand.c[k] -= v;
      }
    }
    this.pendingDiscards.delete(playerId);
    this.pushLog(`${p.name} discarded ${need}`);
    if (this.pendingDiscards.size === 0) {
      this.phase = PHASE.MOVE_ROBBER;
      this.robberMustMove = true;
    }
  }

  moveRobber(playerId, hexId, stealFrom = null) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase !== PHASE.MOVE_ROBBER) throw new Error('not robber phase');
    if (hexId === this.robberHex) throw new Error('must move to a new hex');
    this.robberHex = hexId;
    const candidates = this.robberStealCandidates(hexId, p.id);
    if (candidates.length === 0) {
      this.phase = PHASE.MAIN;
      this.pushLog(`${p.name} moved the robber`);
    } else if (candidates.length === 1 || stealFrom) {
      const target = this.players.find(x => x.id === (stealFrom ?? candidates[0]));
      if (!target || !candidates.includes(target.id)) throw new Error('invalid steal target');
      this.stealOne(p, target);
      this.phase = PHASE.MAIN;
    } else {
      this.pendingSteal = { candidates };
      this.phase = PHASE.STEAL;
      this.pushLog(`${p.name} must choose a victim`);
    }
  }

  stealOne(thief, victim) {
    const bag = [];
    for (const [res, n] of Object.entries(victim.hand.r)) {
      for (let i = 0; i < n; i++) bag.push({ kind: 'r', key: res });
    }
    for (const [c, n] of Object.entries(victim.hand.c)) {
      for (let i = 0; i < n; i++) bag.push({ kind: 'c', key: c });
    }
    if (bag.length === 0) {
      this.pushLog(`${thief.name} robbed ${victim.name} (nothing to take)`);
      return;
    }
    const pick = bag[Math.floor(this._rand() * bag.length)];
    victim.hand[pick.kind][pick.key] -= 1;
    thief.hand[pick.kind][pick.key] += 1;
    this.pushLog(`${thief.name} robbed ${victim.name}`);
  }

  chooseStealTarget(playerId, targetId) {
    if (this.phase !== PHASE.STEAL) throw new Error('not steal phase');
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (!this.pendingSteal.candidates.includes(targetId)) throw new Error('bad target');
    const victim = this.getPlayer(targetId);
    this.stealOne(p, victim);
    this.pendingSteal = null;
    this.phase = PHASE.MAIN;
  }

  robberStealCandidates(hexId, thiefId) {
    const ids = new Set();
    for (const vId of this.map.topo.hexVertices[hexId]) {
      const owner = this.vertexOwner(vId);
      if (owner && owner.id !== thiefId && cardCount(owner.hand) > 0) ids.add(owner.id);
    }
    return [...ids];
  }

  // -------- Build --------

  buildCity(playerId, vertexId) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase !== PHASE.MAIN) throw new Error('not main phase');
    if (!p.settlements.includes(vertexId)) throw new Error('must upgrade own settlement');
    if (!canAfford(p.hand, C.BUILD_COST.city)) throw new Error('cannot afford');
    pay(p.hand, C.BUILD_COST.city);
    p.settlements = p.settlements.filter(v => v !== vertexId);
    p.cities.push(vertexId);
    p.vp += 1; // city = 2 VP but settlement was already 1, so +1
    this.pushLog(`${p.name} built a city`);
    this.checkWin();
  }

  buyDev(playerId) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase !== PHASE.MAIN) throw new Error('not main phase');
    if (this.devDeck.length === 0) throw new Error('deck empty');
    if (!canAfford(p.hand, C.BUILD_COST.dev)) throw new Error('cannot afford');
    pay(p.hand, C.BUILD_COST.dev);
    const card = this.devDeck.pop();
    p.newDevCards.push(card);
    if (card === 'vp') { p.hiddenVp += 1; this.checkWin(); }
    this.pushLog(`${p.name} bought a development card`);
  }

  playDev(playerId, card, args = {}) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase !== PHASE.MAIN) throw new Error('not main phase');
    const idx = p.devCards.indexOf(card);
    if (idx === -1) throw new Error('no such card (can\'t play on same turn bought)');
    p.devCards.splice(idx, 1);
    switch (card) {
      case 'knight':
        p.playedKnights += 1;
        this.phase = PHASE.MOVE_ROBBER;
        this.updateLargestArmy();
        this.pushLog(`${p.name} played a knight`);
        break;
      case 'road_building': {
        // play 2 roads free
        const [e1, e2] = args.edges ?? [];
        if (e1 != null) this.placeRoad(playerId, e1, { free: true });
        if (e2 != null) this.placeRoad(playerId, e2, { free: true });
        this.pushLog(`${p.name} played road building`);
        break;
      }
      case 'year_of_plenty': {
        const [a, b] = args.resources ?? [];
        if (!C.RESOURCES.includes(a) || !C.RESOURCES.includes(b)) throw new Error('bad resources');
        p.hand.r[a] += 1; p.hand.r[b] += 1;
        this.pushLog(`${p.name} played year of plenty`);
        break;
      }
      case 'monopoly': {
        const res = args.resource;
        if (!C.RESOURCES.includes(res)) throw new Error('bad resource');
        let total = 0;
        for (const pl of this.players) {
          if (pl.id === p.id) continue;
          total += pl.hand.r[res];
          pl.hand.r[res] = 0;
        }
        p.hand.r[res] += total;
        this.pushLog(`${p.name} monopolized ${res} (+${total})`);
        break;
      }
      default: throw new Error('cannot play that card');
    }
  }

  trade(playerId, give, take) {
    // Bank trade: 4:1, or 3:1/2:1 via harbor
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase !== PHASE.MAIN) throw new Error('not main phase');
    const giveKeys = Object.keys(give);
    const takeKeys = Object.keys(take);
    if (giveKeys.length !== 1 || takeKeys.length !== 1) throw new Error('one for one trade');
    const gRes = giveKeys[0], tRes = takeKeys[0];
    const gN = give[gRes], tN = take[tRes];
    if (tN !== 1) throw new Error('take exactly 1');
    const rate = this.harborRate(p, gRes);
    if (gN !== rate) throw new Error(`need ${rate}:1`);
    if ((p.hand.r[gRes] ?? 0) < gN) throw new Error('insufficient');
    p.hand.r[gRes] -= gN;
    p.hand.r[tRes] += 1;
    this.pushLog(`${p.name} traded ${gN} ${gRes} for 1 ${tRes}`);
    this.tradeHistory.push({
      t: Date.now(), kind: 'bank', fromId: p.id,
      give: { [gRes]: gN }, take: { [tRes]: 1 },
    });
    if (this.tradeHistory.length > 100) this.tradeHistory.shift();
  }

  harborRate(player, res) {
    const myVerts = new Set([...player.settlements, ...player.cities]);
    let rate = 4;
    for (const harbor of this.map.harbors) {
      const edge = this.map.topo.edges[harbor.edgeId];
      if (!myVerts.has(edge.a) && !myVerts.has(edge.b)) continue;
      if (harbor.type === '3:1') rate = Math.min(rate, 3);
      else if (harbor.type === res) rate = Math.min(rate, 2);
    }
    return rate;
  }

  endTurn(playerId) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase !== PHASE.MAIN) throw new Error('finish actions first');
    // move newDevCards into devCards for next turn
    p.devCards.push(...p.newDevCards);
    p.newDevCards = [];
    this.openTrade = null;
    this.turn = (this.turn + 1) % this.players.length;
    this.phase = PHASE.ROLL;
    this.pushLog(`${this.current().name} to roll`);
  }

  // -------- Player-to-player trade --------

  tradeOffer(playerId, give, want) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (this.phase !== PHASE.MAIN) throw new Error('not main phase');
    give = cleanOffer(give); want = cleanOffer(want);
    if (!countOffer(give) && !countOffer(want)) throw new Error('offer must have cards');
    // seller must own what they're offering
    for (const [k, v] of Object.entries(give)) {
      if ((p.hand.r[k] ?? 0) < v) throw new Error(`you only have ${p.hand.r[k] ?? 0} ${k}`);
    }
    this.openTrade = { fromId: p.id, give, want, responses: {}, counters: {} };
    this.pushLog(`${p.name} offers trade`);
  }

  tradeRespond(playerId, accept) {
    if (!this.openTrade) throw new Error('no open trade');
    if (playerId === this.openTrade.fromId) throw new Error("can't respond to own offer");
    const p = this.getPlayer(playerId);
    if (accept) {
      for (const [k, v] of Object.entries(this.openTrade.want)) {
        if ((p.hand.r[k] ?? 0) < v) throw new Error(`you don't have ${v} ${k}`);
      }
      this.openTrade.responses[p.id] = 'accept';
      delete this.openTrade.counters[p.id];
      this.pushLog(`${p.name} accepts the offer`);
    } else {
      delete this.openTrade.responses[p.id];
      delete this.openTrade.counters[p.id];
      this.pushLog(`${p.name} rejects the offer`);
    }
  }

  tradeCounter(playerId, give, want) {
    // Counterer proposes their own give/want (from their POV)
    if (!this.openTrade) throw new Error('no open trade');
    if (playerId === this.openTrade.fromId) throw new Error("can't counter your own offer");
    const p = this.getPlayer(playerId);
    give = cleanOffer(give); want = cleanOffer(want);
    if (!countOffer(give) || !countOffer(want)) throw new Error('counter needs give and want');
    for (const [k, v] of Object.entries(give)) {
      if ((p.hand.r[k] ?? 0) < v) throw new Error(`you only have ${p.hand.r[k] ?? 0} ${k}`);
    }
    this.openTrade.counters[p.id] = { give, want };
    delete this.openTrade.responses[p.id];
    this.pushLog(`${p.name} counters the offer`);
  }

  tradeAccept(playerId, otherId) {
    const p = this.getPlayer(playerId);
    this.assertTurn(p);
    if (!this.openTrade || this.openTrade.fromId !== p.id) throw new Error('not your offer');
    const other = this.getPlayer(otherId);
    // Terms: either direct accept of original, or a counter from otherId
    let fromMeToThem, fromThemToMe;
    if (this.openTrade.responses[otherId] === 'accept') {
      fromMeToThem = this.openTrade.give;    // original give
      fromThemToMe = this.openTrade.want;    // original want
    } else if (this.openTrade.counters[otherId]) {
      // Counterer's give goes to me; their want comes from me
      fromThemToMe = this.openTrade.counters[otherId].give;
      fromMeToThem = this.openTrade.counters[otherId].want;
    } else {
      throw new Error('that player neither accepted nor countered');
    }
    for (const [k, v] of Object.entries(fromMeToThem))
      if ((p.hand.r[k] ?? 0) < v) throw new Error('you lost cards since offering');
    for (const [k, v] of Object.entries(fromThemToMe))
      if ((other.hand.r[k] ?? 0) < v) throw new Error(`${other.name} lost cards since`);
    for (const [k, v] of Object.entries(fromMeToThem)) { p.hand.r[k] -= v; other.hand.r[k] += v; }
    for (const [k, v] of Object.entries(fromThemToMe)) { other.hand.r[k] -= v; p.hand.r[k] += v; }
    this.pushLog(`${p.name} trades with ${other.name}`);
    this.tradeHistory.push({
      t: Date.now(), kind: 'p2p',
      fromId: p.id, toId: other.id,
      give: fromMeToThem, take: fromThemToMe,
    });
    if (this.tradeHistory.length > 100) this.tradeHistory.shift();
    this.openTrade = null;
  }

  tradeCancel(playerId) {
    const p = this.getPlayer(playerId);
    if (!this.openTrade) return;
    if (this.openTrade.fromId !== p.id) throw new Error('not your offer');
    this.openTrade = null;
    this.pushLog(`${p.name} cancelled the trade`);
  }

  // -------- Helpers --------

  getPlayer(id) {
    const p = this.players.find(x => x.id === id);
    if (!p) throw new Error('no such player');
    return p;
  }
  assertTurn(p) {
    if (this.players[this.turn].id !== p.id) throw new Error('not your turn');
  }
  pushLog(msg) {
    this.log.push({ t: Date.now(), msg });
    if (this.log.length > 200) this.log.shift();
  }

  vertexOwner(vId) {
    for (const p of this.players) {
      if (p.settlements.includes(vId) || p.cities.includes(vId)) return p;
    }
    return null;
  }
  edgeOwner(eId) {
    for (const p of this.players) if (p.roads.includes(eId)) return p;
    return null;
  }

  vertexConnectedToPlayerRoad(vId, pid) {
    const v = this.map.topo.vertices[vId];
    const p = this.getPlayer(pid);
    return v.edges.some(e => p.roads.includes(e));
  }
  edgeConnectsToPlayer(eId, pid) {
    const e = this.map.topo.edges[eId];
    const p = this.getPlayer(pid);
    // connects if either endpoint is own settlement/city OR touches own road at an endpoint not blocked
    if (p.settlements.includes(e.a) || p.cities.includes(e.a)) return true;
    if (p.settlements.includes(e.b) || p.cities.includes(e.b)) return true;
    // road adjacency: any edge sharing endpoint a or b
    for (const otherEId of p.roads) {
      const o = this.map.topo.edges[otherEId];
      if (o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b) {
        // block: an opponent's settlement at the shared vertex breaks continuity
        const shared = (o.a === e.a || o.b === e.a) ? e.a : e.b;
        const owner = this.vertexOwner(shared);
        if (!owner || owner.id === pid) return true;
      }
    }
    return false;
  }

  updateLongestRoad() {
    // Lazy: longest *simple* path per player; cap search depth at 30 to stay fast.
    let bestP = null, bestLen = this.longestRoad.length;
    for (const p of this.players) {
      const len = longestRoadForPlayer(this, p);
      if (len > bestLen) { bestLen = len; bestP = p; }
    }
    if (bestP && bestP.id !== this.longestRoad.playerId) {
      if (this.longestRoad.playerId) {
        const prev = this.getPlayer(this.longestRoad.playerId);
        prev.vp -= 2;
      }
      this.longestRoad = { playerId: bestP.id, length: bestLen };
      bestP.vp += 2;
      this.pushLog(`${bestP.name} takes longest road (${bestLen})`);
    } else if (bestP && bestP.id === this.longestRoad.playerId) {
      this.longestRoad.length = bestLen;
    }
    this.checkWin();
  }

  updateLargestArmy() {
    const p = this.current();
    if (p.playedKnights >= 3 && p.playedKnights > this.largestArmy.size) {
      if (this.largestArmy.playerId && this.largestArmy.playerId !== p.id) {
        const prev = this.getPlayer(this.largestArmy.playerId);
        prev.vp -= 2;
      }
      if (this.largestArmy.playerId !== p.id) {
        p.vp += 2;
        this.pushLog(`${p.name} takes largest army (${p.playedKnights})`);
      }
      this.largestArmy = { playerId: p.id, size: p.playedKnights };
    }
    this.checkWin();
  }

  checkWin() {
    for (const p of this.players) {
      const total = p.vp + p.hiddenVp;
      if (total >= 10 && this.players[this.turn].id === p.id) {
        this.winner = p.id;
        this.phase = PHASE.END;
        this.pushLog(`${p.name} wins with ${total} VP!`);
      }
    }
  }

  // Serialize state for a given viewer (hides opponents' hands)
  snapshot(viewerId) {
    return {
      map: this.map,
      cnk: this.cnk,
      phase: this.phase,
      turn: this.turn,
      currentPlayerId: this.players[this.turn]?.id ?? null,
      dice: this.dice,
      lastRoll: this.lastRoll,
      robberHex: this.robberHex,
      winner: this.winner,
      log: this.log.slice(-50),
      longestRoad: this.longestRoad,
      largestArmy: this.largestArmy,
      pendingDiscards: [...this.pendingDiscards],
      pendingSteal: this.pendingSteal,
      openTrade: this.openTrade,
      tradeHistory: this.tradeHistory,
      ck: this.ck,
      players: this.players.map(p => ({
        id: p.id, name: p.name, color: p.color,
        roads: p.roads, settlements: p.settlements, cities: p.cities,
        vp: p.vp,
        handCount: cardCount(p.hand),
        hand: p.id === viewerId ? p.hand : null,
        devCardCount: p.devCards.length + p.newDevCards.length,
        devCards: p.id === viewerId ? [...p.devCards, ...p.newDevCards] : null,
        playedKnights: p.playedKnights,
        ck: p.ck,
      })),
    };
  }
}

function longestRoadForPlayer(game, p) {
  if (p.roads.length === 0) return 0;
  const edges = p.roads.map(id => game.map.topo.edges[id]);
  const edgeIds = new Set(p.roads);
  let best = 0;
  const visit = (vertex, usedEdges) => {
    let localBest = usedEdges.size;
    for (const eId of game.map.topo.vertices[vertex].edges) {
      if (!edgeIds.has(eId) || usedEdges.has(eId)) continue;
      const e = game.map.topo.edges[eId];
      const other = e.a === vertex ? e.b : e.a;
      // broken by opponent at `vertex`
      const owner = game.vertexOwner(vertex);
      if (owner && owner.id !== p.id) continue;
      usedEdges.add(eId);
      localBest = Math.max(localBest, visit(other, usedEdges));
      usedEdges.delete(eId);
    }
    return localBest;
  };
  for (const e of edges) {
    for (const v of [e.a, e.b]) {
      best = Math.max(best, visit(v, new Set([e.id])));
    }
  }
  return best;
}

function cleanOffer(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) {
    const n = Math.max(0, Math.floor(Number(v) || 0));
    if (n > 0 && ['wood','brick','sheep','wheat','ore'].includes(k)) out[k] = n;
  }
  return out;
}
function countOffer(o) { return Object.values(o).reduce((a, b) => a + b, 0); }

function mulberry32(a) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

module.exports = { Game, PHASE, emptyHand, cardCount };
