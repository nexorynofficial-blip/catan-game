// Hex board geometry and procedural map generation.
// Axial coordinates (q, r). Flat-top hexes.
// Vertices/edges keyed by rounded world positions so sharing is automatic.

const SIZE = 1; // unit hex radius; actual pixel scale is client-side
const SQRT3 = Math.sqrt(3);

function hexToPixel(q, r) {
  // flat-top
  const x = SIZE * (3 / 2) * q;
  const y = SIZE * SQRT3 * (r + q / 2);
  return { x, y };
}

function hexCornerOffset(i) {
  // flat-top: angles 0,60,...,300
  const a = (Math.PI / 180) * (60 * i);
  return { dx: SIZE * Math.cos(a), dy: SIZE * Math.sin(a) };
}

function key(x, y) {
  return `${Math.round(x * 1000)},${Math.round(y * 1000)}`;
}

function buildTopology(hexCoords) {
  // Returns { hexes, vertices, edges, vAdj, eAdj, hexVertices, hexEdges }
  const hexes = hexCoords.map(([q, r], id) => ({ id, q, r, ...hexToPixel(q, r) }));
  const vertices = new Map();     // key -> { id, x, y, hexes:[hexId], edges:[edgeId] }
  const edges = new Map();        // key -> { id, a, b, hexes:[hexId] }
  const hexVertices = hexes.map(() => []);
  const hexEdges = hexes.map(() => []);

  for (const h of hexes) {
    const corners = [];
    for (let i = 0; i < 6; i++) {
      const o = hexCornerOffset(i);
      const vx = h.x + o.dx, vy = h.y + o.dy;
      const k = key(vx, vy);
      let v = vertices.get(k);
      if (!v) {
        v = { id: vertices.size, x: vx, y: vy, hexes: [], edges: [] };
        vertices.set(k, v);
      }
      if (!v.hexes.includes(h.id)) v.hexes.push(h.id);
      corners.push(v);
      hexVertices[h.id].push(v.id);
    }
    for (let i = 0; i < 6; i++) {
      const a = corners[i], b = corners[(i + 1) % 6];
      const ek = a.id < b.id ? `${a.id}-${b.id}` : `${b.id}-${a.id}`;
      let e = edges.get(ek);
      if (!e) {
        e = { id: edges.size, a: a.id, b: b.id, hexes: [] };
        edges.set(ek, e);
        if (!a.edges.includes(e.id)) a.edges.push(e.id);
        if (!b.edges.includes(e.id)) b.edges.push(e.id);
      }
      if (!e.hexes.includes(h.id)) e.hexes.push(h.id);
      hexEdges[h.id].push(e.id);
    }
  }

  const verts = [...vertices.values()].sort((a, b) => a.id - b.id);
  const es    = [...edges.values()].sort((a, b) => a.id - b.id);

  // Vertex adjacency: vertices connected by an edge
  const vAdj = verts.map(() => []);
  for (const e of es) {
    vAdj[e.a].push(e.b);
    vAdj[e.b].push(e.a);
  }

  return { hexes, vertices: verts, edges: es, vAdj, hexVertices, hexEdges };
}

// --- Hex coord sets for different map sizes ---

function hexagonCoords(radius) {
  // Standard hexagonal arrangement of radius N (center + rings)
  const out = [];
  for (let q = -radius; q <= radius; q++) {
    const r1 = Math.max(-radius, -q - radius);
    const r2 = Math.min(radius, -q + radius);
    for (let r = r1; r <= r2; r++) out.push([q, r]);
  }
  return out;
}

function stretchedCoords() {
  // 30 hexes for 5-6 players: an elongated shape
  // Hand-rolled rows widths: 3,4,5,6,5,4,3 but shifted
  const widths = [3, 4, 5, 6, 5, 4, 3];
  const out = [];
  for (let i = 0; i < widths.length; i++) {
    const r = i - 3;
    const w = widths[i];
    const startQ = -Math.floor(w / 2) - (r < 0 ? Math.ceil(r / 2) : Math.floor(r / 2));
    for (let j = 0; j < w; j++) out.push([startQ + j, r]);
  }
  return out;
}

// --- Resource and number distribution ---

const CLASSIC_TILES = {
  wood: 4, brick: 3, sheep: 4, wheat: 4, ore: 3, desert: 1,
};
const EXTENDED_TILES = {
  wood: 6, brick: 5, sheep: 6, wheat: 6, ore: 5, desert: 2,
};
const CLASSIC_NUMBERS = [2, 3, 3, 4, 4, 5, 5, 6, 6, 8, 8, 9, 9, 10, 10, 11, 11, 12];
const EXTENDED_NUMBERS = [
  2, 2, 3, 3, 4, 4, 4, 5, 5, 5, 6, 6, 6, 6,
  8, 8, 8, 8, 9, 9, 9, 10, 10, 10, 11, 11, 12, 12,
];

function shuffle(arr, rand = Math.random) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function assignTiles(hexes, tilesCount, numbers, rand = Math.random) {
  const pool = [];
  for (const [res, n] of Object.entries(tilesCount)) {
    for (let i = 0; i < n; i++) pool.push(res);
  }
  // If pool length < hex count, pad with random; if more, truncate
  while (pool.length < hexes.length) pool.push('wheat');
  const resources = shuffle(pool, rand).slice(0, hexes.length);
  const nums = shuffle(numbers, rand);

  // Avoid adjacent 6/8 if possible with a few re-shuffles (lazy heuristic)
  // ponytail: naive retry heuristic, replace with proper algo if clashes bug anyone
  let best = null, bestScore = -Infinity;
  for (let attempt = 0; attempt < 20; attempt++) {
    const shuffledRes = shuffle(resources, rand);
    const shuffledNums = shuffle(numbers, rand);
    const tiles = hexes.map((h, i) => ({
      res: shuffledRes[i],
      num: shuffledRes[i] === 'desert' ? null : shuffledNums.shift() ?? null,
    }));
    // Score: count adjacent red-number pairs (6/8)
    let clashes = 0;
    for (let i = 0; i < hexes.length; i++) {
      if (![6, 8].includes(tiles[i].num)) continue;
      for (let j = i + 1; j < hexes.length; j++) {
        if (![6, 8].includes(tiles[j].num)) continue;
        const dq = hexes[i].q - hexes[j].q, dr = hexes[i].r - hexes[j].r;
        const dist = (Math.abs(dq) + Math.abs(dr) + Math.abs(dq + dr)) / 2;
        if (dist === 1) clashes++;
      }
    }
    const score = -clashes;
    if (score > bestScore) { bestScore = score; best = tiles; if (clashes === 0) break; }
  }
  return best;
}

// --- Harbor placement (lazy: place on random coastal edges) ---
const HARBOR_TYPES = ['3:1', '3:1', '3:1', '3:1', 'wood', 'brick', 'sheep', 'wheat', 'ore'];

function placeHarbors(topo, rand = Math.random) {
  // coastal edges = edges with exactly one adjacent hex
  const coastal = topo.edges.filter(e => e.hexes.length === 1);
  if (coastal.length === 0) return [];
  const picks = shuffle(coastal, rand).slice(0, HARBOR_TYPES.length);
  const types = shuffle(HARBOR_TYPES, rand);
  return picks.map((e, i) => ({ edgeId: e.id, type: types[i] }));
}

// --- Map definitions ---

function makeMap(variant, rand = Math.random) {
  let hexCoords, tiles, nums, name;
  switch (variant) {
    case 'classic':
      hexCoords = hexagonCoords(2); // 19 hexes
      tiles = CLASSIC_TILES; nums = CLASSIC_NUMBERS;
      name = 'Classic (3-4p)';
      break;
    case 'extended':
      hexCoords = stretchedCoords(); // 30 hexes
      tiles = EXTENDED_TILES; nums = EXTENDED_NUMBERS;
      name = 'Extended (5-6p)';
      break;
    case 'random_small':
      hexCoords = hexagonCoords(2);
      tiles = CLASSIC_TILES; nums = CLASSIC_NUMBERS;
      name = 'Random Small';
      break;
    case 'random_large':
      hexCoords = stretchedCoords();
      tiles = EXTENDED_TILES; nums = EXTENDED_NUMBERS;
      name = 'Random Large';
      break;
    case 'desert_land': {
      hexCoords = hexagonCoords(2);
      const t = { ...CLASSIC_TILES, desert: 4, wood: 3, sheep: 3, wheat: 3 };
      tiles = t; nums = CLASSIC_NUMBERS.slice(0, 15);
      name = 'Desert Land';
      break;
    }
    case 'resource_rush': {
      hexCoords = hexagonCoords(2);
      tiles = { wood: 4, brick: 4, sheep: 4, wheat: 4, ore: 3, desert: 0 };
      nums = CLASSIC_NUMBERS;
      name = 'Resource Rush';
      break;
    }
    case 'two_islands': {
      // Lazy: two 7-hex clumps offset so they're separated
      const left  = hexagonCoords(1).map(([q, r]) => [q - 3, r]);
      const right = hexagonCoords(1).map(([q, r]) => [q + 3, r]);
      hexCoords = [...left, ...right];
      tiles = { wood: 3, brick: 2, sheep: 3, wheat: 3, ore: 2, desert: 1 };
      nums = CLASSIC_NUMBERS.slice(0, 13);
      name = 'Two Islands';
      break;
    }
    default:
      throw new Error(`unknown map variant ${variant}`);
  }
  const topo = buildTopology(hexCoords);
  const tileData = assignTiles(topo.hexes, tiles, nums, rand);
  topo.hexes.forEach((h, i) => {
    h.res = tileData[i].res;
    h.num = tileData[i].num;
  });
  const harbors = placeHarbors(topo, rand);
  const robberHex = topo.hexes.find(h => h.res === 'desert')?.id ??
                    topo.hexes[Math.floor(rand() * topo.hexes.length)].id;
  return { name, variant, topo, harbors, robberHex };
}

const MAPS = [
  { id: 'classic',       label: 'Classic',       maxPlayers: 4, hint: '19 hexes, 3-4 players' },
  { id: 'extended',      label: 'Extended',      maxPlayers: 6, hint: '30 hexes, 5-6 players' },
  { id: 'random_small',  label: 'Random Small',  maxPlayers: 4, hint: '19 hexes shuffled' },
  { id: 'random_large',  label: 'Random Large',  maxPlayers: 6, hint: '30 hexes shuffled' },
  { id: 'desert_land',   label: 'Desert Land',   maxPlayers: 4, hint: 'four deserts, tight play' },
  { id: 'resource_rush', label: 'Resource Rush', maxPlayers: 4, hint: 'no desert, numbers everywhere' },
  { id: 'two_islands',   label: 'Two Islands',   maxPlayers: 4, hint: 'two small clumps' },
];
const MODES = [
  { id: 'base', label: 'Base game',        hint: '10 VP, no commodities' },
  { id: 'cnk',  label: 'Cities & Knights', hint: 'commodities, barbarians, city improvements' },
];

module.exports = { makeMap, MAPS, MODES, hexToPixel, shuffle };
