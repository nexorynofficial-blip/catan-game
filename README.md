# Nexoryn Catan

Private Catan clone for 3–6 players. Base game + Cities & Knights, 9 maps, dark/light theme, server-authoritative multiplayer over WebSockets.

## Run it

```bash
cd catan
npm install
npm start
```

Open `http://localhost:3000`. Create a room, share the code (or the join link via the ⧉ button) with your friends.

## Play across the internet

Your friends on other networks can't hit `localhost`. Easiest fix is Cloudflare's free quick tunnel. `cloudflared` is already installed on this machine, so you have two ways:

**One-click (Windows):** double-click `start.ps1` — it opens two terminal windows (server + tunnel) for you.

**Manual:**
```bash
# Terminal 1 — the game server (keep running)
npm start
```
```bash
# Terminal 2 — the public tunnel (keep running)
npm run tunnel
```
Cloudflare prints a URL like `https://xxxx-xxxx-xxxx.trycloudflare.com`. **That** URL goes to your friends, along with your room code (or share the ⧉ "copy join link" from inside the game — it already contains the code).

Notes:
- The URL **changes every time** you restart `cloudflared`. For a stable URL, create a named tunnel on your Cloudflare account (free) and bind it to a subdomain you own.
- Close the tunnel window when you're done — Cloudflare's free quick tunnels have no uptime guarantee and shouldn't be left running forever.
- Alternatives: `ngrok http 3005`, Tailscale Funnel, or deploy to Fly / Railway / Render.

## What's in

- **Base game**: setup, dice, resource distribution, robber (incl. discard on 7, steal), build road / settlement / city, bank + harbor trade (4:1 / 3:1 / 2:1), dev cards (knight, VP, road building, year of plenty, monopoly), longest road, largest army, 10 VP win.
- **Cities & Knights**: commodities (paper/cloth/coin), 3 improvement tracks, metropolises, knights (hire / promote 1-3 / activate / defend), city walls, barbarian ship + attack resolution, event die, basic aspect card draws.
- **7 maps × 2 modes**: pick a map (Classic, Extended, Random Small, Random Large, Desert Land, Resource Rush, Two Islands) and a mode (Base game or Cities & Knights) independently — any map × any mode.
- **Zoom + pan**: mouse-wheel or ± / ⤢ buttons on the board; drag to pan; pinch on touch.
- **Trade history** (⟳ button next to the room code): a modal with per-player given/received totals and a chronological list of every p2p and bank trade in the game, each row with time, colored party dots, and resource icons.
- **Visual ports**: little sailboats sit on the water on each coastal edge, with dotted pier lines going to the two vertices they serve.
- **Colonist.io-style visual language** (sky-blue theme with cartoon hex art — trees, sheep, wheat stalks, mountains, bricks, cactus — chunky 3D-ish buttons and house pieces) plus a **night mode** toggle on top.
- **Chat** per room, live log, room code deep-link.

## What's deliberately simplified (upgrade later)

- Player-to-player trade with counter-offers: works. Current player proposes `give / want`; each other player can **Accept**, **Counter** with their own terms, or **Pass**. The proposer sees all accepters AND all counters in one bar and clicks whichever to confirm.
- Progress cards (C&K): drawn as generic "aspect cards" placeholders. The full deck is ~50 cards with distinct effects — add from the official rules when needed.
- Road Building dev card: works but asks you to click "Build road" twice (free) after playing it instead of a chained picker. One extra click per use.
- Longest road: computed by DFS, cap-of-30. Won't choke in practice; replace if someone builds a 40-road meme map.
- Harbors: placed on random coastal edges rather than canonical fixed slots. Looks right; distribution differs from the printed board.

Everything in the ladder: base rules work; corners cut are labeled `ponytail:` in the source.

## Files

```
server.js              Express + ws routing
src/
  constants.js         costs, dev deck, C&K track definitions
  board.js             hex geometry + 9 map variants + harbor placement
  game.js              game state + rule engine
  ck.js                Cities & Knights layer
public/
  index.html
  css/style.css        theme tokens + layout
  js/
    net.js             ws client
    render.js          canvas board renderer
    ui.js              hand, action buttons, modals
    app.js             entry + screen routing
```

## Keyboard / UX notes

- Discard modal: shift-click a resource chip to decrement.
- Copy join link: top-left ⧉ button in-game, shares `?r=CODE`.
- Night mode: ◐ button, choice persists in localStorage.

## Known rough edges

- No reconnect UI yet — if your tab crashes, you'll come back as a new player. Fix: on load, if `localStorage` has `catan.code` + `catan.pid`, offer to rejoin.
- Mobile layout works but a 6-player sidebar on a phone is tight. Tablets and laptops are fine.
