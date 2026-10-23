// Headless bot players for UI demos. Joins the given room and plays setup + rolls.
// Usage: node test/bots.js DEMO1 Bob Cass
const WebSocket = require('ws');
const [,, code, ...names] = process.argv;
if (!code || names.length < 1) {
  console.log('usage: node test/bots.js ROOMCODE Bob Cass');
  process.exit(1);
}

const bots = names.map(name => createBot(name));

function createBot(name) {
  const ws = new WebSocket('ws://localhost:3005');
  let state = null, pid = null;
  const bot = { name, ws, pid: null, autoPlay: true };
  ws.on('open', () => {
    ws.send(JSON.stringify({ type: 'join', code, name }));
  });
  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    if (msg.type === 'joined') {
      bot.pid = msg.playerId;
      console.log(`[${name}] joined, pid=${msg.playerId}`);
    }
    if (msg.type === 'state') {
      state = msg.state;
      bot.state = state;
      maybeAct(bot);
    }
    if (msg.type === 'error') console.error(`[${name}] error:`, msg.message);
  });
  return bot;
}

function send(bot, type, extra) {
  bot.ws.send(JSON.stringify({ type, code, playerId: bot.pid, ...extra }));
}

function openSettlementVertex(state) {
  const topo = state.map.topo;
  const taken = new Set();
  for (const p of state.players) { p.settlements.forEach(v => taken.add(v)); p.cities.forEach(v => taken.add(v)); }
  for (const v of topo.vertices) {
    if (taken.has(v.id)) continue;
    let bad = false;
    for (const nb of topo.vAdj[v.id]) if (taken.has(nb)) { bad = true; break; }
    if (!bad) return v;
  }
  return null;
}

async function maybeAct(bot) {
  const s = bot.state; if (!s) return;
  const me = s.players.find(p => p.id === bot.pid); if (!me) return;
  if (bot.acting) return;
  bot.acting = true;
  try {
    // Setup phases
    if ((s.phase === 'setup_1' || s.phase === 'setup_2') && s.currentPlayerId === bot.pid) {
      const expected = s.phase === 'setup_1' ? 1 : 2;
      if (me.settlements.length < expected) {
        const v = openSettlementVertex(s);
        send(bot, 'place_settlement', { vertexId: v.id, setup: true });
        return;
      }
      if (me.roads.length < expected) {
        const v = me.settlements[me.settlements.length - 1];
        const vObj = s.map.topo.vertices[v];
        const edge = vObj.edges.find(eid => !s.players.some(p => p.roads.includes(eid)));
        send(bot, 'place_road', { edgeId: edge, setup: true });
        return;
      }
      send(bot, 'end_setup');
      return;
    }
    // Discard half if needed
    if (s.phase === 'discard' && s.pendingDiscards.includes(bot.pid)) {
      const total = Object.values(me.hand.r).reduce((a, b) => a + b, 0);
      const need = Math.floor(total / 2);
      const cards = {};
      let left = need;
      for (const [k, v] of Object.entries(me.hand.r)) {
        if (left <= 0) break;
        const give = Math.min(v, left);
        if (give) { cards[k] = give; left -= give; }
      }
      send(bot, 'discard', { cards });
      return;
    }
  } finally {
    setTimeout(() => { bot.acting = false; }, 200);
  }
}

// Poll loop so bots keep acting on their own turns
setInterval(() => {
  for (const b of bots) if (b.state) maybeAct(b);
}, 400);

console.log(`bots joining ${code} as:`, names.join(', '));
