// Catan server: Express for static + ws for rooms.
// Each room has one Game instance; actions are server-authoritative.

const path = require('path');
const http = require('http');
const express = require('express');
const { WebSocketServer } = require('ws');
const { nanoid } = require('nanoid');

const { Game } = require('./src/game');
const { MAPS, MODES } = require('./src/board');
const ck = require('./src/ck');

const PORT = process.env.PORT || 3005;
const app = express();
app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/maps',  (req, res) => res.json(MAPS));
app.get('/api/modes', (req, res) => res.json(MODES));
app.get('/api/health', (req, res) => res.json({ ok: true, rooms: rooms.size }));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// roomCode -> { game, players: Map<playerId, ws>, hostId }
const rooms = new Map();

function broadcast(room) {
  for (const [pid, ws] of room.players) {
    if (ws.readyState === 1) {
      ws.send(JSON.stringify({ type: 'state', state: room.game.snapshot(pid) }));
    }
  }
}

function send(ws, msg) {
  if (ws.readyState === 1) ws.send(JSON.stringify(msg));
}

function error(ws, message) {
  send(ws, { type: 'error', message });
}

wss.on('connection', (ws) => {
  let currentRoom = null;
  let playerId = null;

  ws.on('message', (data) => {
    let msg;
    try { msg = JSON.parse(data); } catch { return error(ws, 'bad json'); }
    try {
      handle(ws, msg, (room, pid) => { currentRoom = room; playerId = pid; });
    } catch (e) {
      error(ws, e.message || String(e));
    }
  });

  ws.on('close', () => {
    if (currentRoom && playerId) {
      const room = rooms.get(currentRoom);
      if (!room) return;
      room.players.delete(playerId);
      // in lobby: remove from game; mid-game: just mark disconnected (they can rejoin)
      try { room.game.removePlayer(playerId); } catch {}
      if (room.players.size === 0) {
        rooms.delete(currentRoom);
      } else {
        broadcast(room);
      }
    }
  });
});

function handle(ws, msg, setContext) {
  switch (msg.type) {
    case 'create': {
      const code = (msg.code || nanoid(5)).toUpperCase();
      if (rooms.has(code)) throw new Error('room exists');
      const game = new Game({
        mapVariant: msg.mapVariant || 'classic',
        mode: msg.mode || 'base',
        seed: msg.seed || Date.now(),
      });
      const pid = nanoid(8);
      game.addPlayer(pid, msg.name || 'Host');
      const room = { code, game, players: new Map(), hostId: pid };
      room.players.set(pid, ws);
      rooms.set(code, room);
      setContext(code, pid);
      send(ws, { type: 'joined', code, playerId: pid, host: true });
      broadcast(room);
      break;
    }
    case 'join': {
      const code = (msg.code || '').toUpperCase();
      const room = rooms.get(code);
      if (!room) throw new Error('no such room');
      // allow rejoin by name if game started
      let pid = msg.playerId;
      if (pid && room.game.players.find(p => p.id === pid)) {
        // reconnect
        room.players.set(pid, ws);
      } else {
        pid = nanoid(8);
        room.game.addPlayer(pid, msg.name || 'Player');
        room.players.set(pid, ws);
      }
      setContext(code, pid);
      send(ws, { type: 'joined', code, playerId: pid, host: pid === room.hostId });
      broadcast(room);
      break;
    }
    case 'start_game': {
      const room = requireRoom(msg);
      if (room.hostId !== msg.playerId) throw new Error('only host');
      room.game.start();
      broadcast(room);
      break;
    }
    case 'place_settlement': {
      const room = requireRoom(msg);
      room.game.placeSettlement(msg.playerId, msg.vertexId, { setup: !!msg.setup });
      broadcast(room);
      break;
    }
    case 'place_road': {
      const room = requireRoom(msg);
      room.game.placeRoad(msg.playerId, msg.edgeId, { setup: !!msg.setup });
      broadcast(room);
      break;
    }
    case 'end_setup': {
      const room = requireRoom(msg);
      room.game.endSetupStep(msg.playerId);
      broadcast(room);
      break;
    }
    case 'roll': {
      const room = requireRoom(msg);
      room.game.rollDice(msg.playerId);
      broadcast(room);
      break;
    }
    case 'discard': {
      const room = requireRoom(msg);
      room.game.discard(msg.playerId, msg.cards || {});
      broadcast(room);
      break;
    }
    case 'move_robber': {
      const room = requireRoom(msg);
      room.game.moveRobber(msg.playerId, msg.hexId, msg.stealFrom ?? null);
      broadcast(room);
      break;
    }
    case 'steal': {
      const room = requireRoom(msg);
      room.game.chooseStealTarget(msg.playerId, msg.targetId);
      broadcast(room);
      break;
    }
    case 'build_city': {
      const room = requireRoom(msg);
      room.game.buildCity(msg.playerId, msg.vertexId);
      broadcast(room);
      break;
    }
    case 'buy_dev': {
      const room = requireRoom(msg);
      room.game.buyDev(msg.playerId);
      broadcast(room);
      break;
    }
    case 'play_dev': {
      const room = requireRoom(msg);
      room.game.playDev(msg.playerId, msg.card, msg.args || {});
      broadcast(room);
      break;
    }
    case 'bank_trade': {
      const room = requireRoom(msg);
      room.game.trade(msg.playerId, msg.give, msg.take);
      broadcast(room);
      break;
    }
    case 'trade_offer': {
      const room = requireRoom(msg);
      room.game.tradeOffer(msg.playerId, msg.give || {}, msg.want || {});
      broadcast(room);
      break;
    }
    case 'trade_respond': {
      const room = requireRoom(msg);
      room.game.tradeRespond(msg.playerId, !!msg.accept);
      broadcast(room);
      break;
    }
    case 'trade_counter': {
      const room = requireRoom(msg);
      room.game.tradeCounter(msg.playerId, msg.give || {}, msg.want || {});
      broadcast(room);
      break;
    }
    case 'trade_accept': {
      const room = requireRoom(msg);
      room.game.tradeAccept(msg.playerId, msg.otherId);
      broadcast(room);
      break;
    }
    case 'trade_cancel': {
      const room = requireRoom(msg);
      room.game.tradeCancel(msg.playerId);
      broadcast(room);
      break;
    }
    case 'end_turn': {
      const room = requireRoom(msg);
      room.game.endTurn(msg.playerId);
      broadcast(room);
      break;
    }
    // --- C&K actions ---
    case 'ck_improve': {
      const room = requireRoom(msg);
      ck.improveTrack(room.game, msg.playerId, msg.track);
      broadcast(room);
      break;
    }
    case 'ck_knight_build': {
      const room = requireRoom(msg);
      ck.buildKnight(room.game, msg.playerId, msg.vertexId);
      broadcast(room);
      break;
    }
    case 'ck_knight_promote': {
      const room = requireRoom(msg);
      ck.promoteKnight(room.game, msg.playerId, msg.vertexId);
      broadcast(room);
      break;
    }
    case 'ck_knight_activate': {
      const room = requireRoom(msg);
      ck.activateKnight(room.game, msg.playerId, msg.vertexId);
      broadcast(room);
      break;
    }
    case 'ck_wall': {
      const room = requireRoom(msg);
      ck.buildWall(room.game, msg.playerId, msg.vertexId);
      broadcast(room);
      break;
    }
    case 'chat': {
      const room = requireRoom(msg);
      const player = room.game.getPlayer(msg.playerId);
      const text = (msg.text || '').toString().slice(0, 200);
      for (const ws2 of room.players.values()) {
        send(ws2, { type: 'chat', from: player.name, color: player.color, text });
      }
      break;
    }
    default:
      throw new Error('unknown message: ' + msg.type);
  }
}

function requireRoom(msg) {
  const r = rooms.get((msg.code || '').toUpperCase());
  if (!r) throw new Error('no room');
  return r;
}

server.listen(PORT, '0.0.0.0', () => {
  console.log(`Catan server on http://localhost:${PORT}`);
  console.log('Share your room code with friends. To play across networks, use a tunnel:');
  console.log('  cloudflared tunnel --url http://localhost:' + PORT);
  console.log('(Override with PORT=xxxx node server.js)');
});
