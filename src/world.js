import { rememberBearing, collapseStructure } from "./structure.js";
import { Terrain, terrainLevel, CELL } from "./terrain.js";
import { TYPES, buildArchitecture, addInterior } from "./architecture.js";
export const UNIT = 0.75;
export const WEAPONS = [
  {
    name: "Impact rocket",
    short: "Rocket",
    key: "1",
    radius: 4.6,
    force: 23,
    cooldown: 0.6,
    color: 0xffab58,
    detail: "A classic. Aim low. Watch it fall.",
    icon: "rocket",
  },
  {
    name: "Scatter charge",
    short: "Scatter",
    key: "2",
    radius: 3.1,
    force: 18,
    cooldown: 1.1,
    color: 0xffd77a,
    detail: "Five staggered blasts tear a wide opening.",
    icon: "scatter",
  },
  {
    name: "Gravity well",
    short: "Gravity",
    key: "3",
    radius: 7,
    force: -19,
    cooldown: 2.5,
    color: 0x9faaff,
    detail: "Pull masonry inward, then let gravity finish.",
    icon: "gravity",
  },
  {
    name: "Seismic pulse",
    short: "Seismic",
    key: "4",
    radius: 8.2,
    force: 13,
    cooldown: 3,
    color: 0x83e4d8,
    detail: "A ground-level shockwave. Foundations first.",
    icon: "pulse",
  },
  {
    name: "Precision beam",
    short: "Beam",
    key: "5",
    radius: 1.8,
    force: 10,
    cooldown: 0.09,
    color: 0xff7380,
    detail: "Hold fire to slice through load-bearing stone.",
    icon: "beam",
  },
  {
    name: "Meteor strike",
    short: "Meteor",
    key: "6",
    radius: 11,
    force: 32,
    cooldown: 5,
    color: 0xff774f,
    detail: "A little excessive. That’s the point.",
    icon: "meteor",
  },
];
WEAPONS.push(
  {
    name: "Tunnel drill",
    short: "Drill",
    key: "7",
    radius: 2.2,
    force: 7,
    cooldown: 0.15,
    color: 0x9ce8e1,
    detail: "Carve a narrow shaft through earth and foundations.",
    icon: "beam",
    pattern: "drill",
  },
  {
    name: "Demolition charge",
    short: "Charge",
    key: "8",
    radius: 5.5,
    force: 25,
    cooldown: 0.3,
    color: 0xffbb55,
    detail: "Click to place. Press X to detonate every charge together.",
    icon: "pulse",
    pattern: "charge",
  },
  {
    name: "Thermobaric bomb",
    short: "Inferno",
    key: "9",
    radius: 12,
    force: 45,
    cooldown: 4,
    color: 0xff6633,
    detail: "A rolling fireball and a crushing pressure wave.",
    icon: "meteor",
    pattern: "fireball",
  },
  {
    name: "Orbital lance",
    short: "Orbital",
    key: "0",
    radius: 4,
    force: 30,
    cooldown: 2.4,
    color: 0x7cecff,
    detail: "A vertical column of energy cuts through entire towers.",
    icon: "beam",
    pattern: "column",
  },
  {
    name: "Fault-line cutter",
    short: "Fault",
    key: "-",
    radius: 3.8,
    force: 24,
    cooldown: 2,
    color: 0xd6bc7c,
    detail: "A line of underground blasts opens a deep trench.",
    icon: "pulse",
    pattern: "trench",
  },
  {
    name: "Supernova",
    short: "Nova",
    key: "=",
    radius: 17,
    force: 55,
    cooldown: 7,
    color: 0xdca7ff,
    detail: "An expanding sphere, then a ring of secondary explosions.",
    icon: "gravity",
    pattern: "nova",
  },
);
export const DEFAULT_SETTINGS = {
  radius: 1,
  force: 1,
  debris: 240,
  gravity: 18,
};
export function sanitizeSettings(value = {}) {
  return {
    radius: Math.max(0.25, Math.min(2.5, Number(value.radius) || 1)),
    force: Math.max(0.25, Math.min(3, Number(value.force) || 1)),
    debris: Math.max(80, Math.min(500, Number(value.debris) || 240)),
    gravity: Math.max(4, Math.min(30, Number(value.gravity) || 18)),
  };
}
export function blastPattern(point, wi, settings = DEFAULT_SETTINGS) {
  const w = WEAPONS[wi],
    r = Math.min(30, w.radius * settings.radius),
    entry = (x, y, z, scale = 1) => ({
      point: { x: point.x + x, y: point.y + y, z: point.z + z },
      radius: r * scale,
    });
  if (wi === 1)
    return [
      [0, 0, 0],
      [-3, 1, 3],
      [3, 0, 3],
      [-3, 0, -3],
      [3, 1, -3],
    ].map((a) => entry(...a));
  if (w.pattern === "drill") return [entry(0, 0, 0), entry(0, -3, 0)];
  if (w.pattern === "column")
    return Array.from({ length: 8 }, (_, i) => entry(0, i * 5 - 12, 0));
  if (w.pattern === "trench")
    return Array.from({ length: 7 }, (_, i) => entry((i - 3) * 4, -3, 0));
  if (w.pattern === "nova")
    return [
      entry(0, 0, 0),
      ...Array.from({ length: 6 }, (_, i) =>
        entry(
          Math.cos((i * Math.PI) / 3) * r * 0.75,
          0,
          Math.sin((i * Math.PI) / 3) * r * 0.75,
          0.45,
        ),
      ),
    ];
  return [entry(0, 0, 0)];
}
export function resolveShot(world, point, wi, settings = DEFAULT_SETTINGS) {
  const events = [];
  for (const blast of blastPattern(point, wi, sanitizeSettings(settings))) {
    const result = destroy(world, blast.point, blast.radius);
    events.push({
      point: blast.point,
      result,
      score: world.score,
      radius: blast.radius,
      force: WEAPONS[wi].force * sanitizeSettings(settings).force,
    });
  }
  return events;
}
export function random(seed) {
  let a = hash(seed);
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hash(str) {
  let h = 2166136261;
  for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0;
}
export const key = (x, y, z) => `${x},${y},${z}`;
export function generateWorld(seed = "AFTERGLOW") {
  const rng = random(seed),
    blocks = [],
    structures = [],
    grid = new Map();
  let current;
  const add = (x, y, z, material = "stone") => {
    x = Math.round(x);
    y = Math.round(y);
    z = Math.round(z);
    const k = key(x, y, z);
    if (grid.has(k)) return;
    const b = {
      id: blocks.length,
      x,
      y,
      z,
      material,
      structure: current.id,
      shade: rng(),
      alive: true,
    };
    blocks.push(b);
    grid.set(k, b.id);
    current.ids.push(b.id);
  };
  const box = (x, y, z, w, h, d, m) => {
    for (let a = 0; a < w; a++)
      for (let b = 0; b < h; b++)
        for (let c = 0; c < d; c++) add(x + a, y + b, z + c, m);
  };
  const begin = (name, type, x, z) => {
    current = {
      id: structures.length,
      name,
      type,
      x: x * UNIT,
      z: z * UNIT,
      ids: [],
      initial: 0,
    };
    structures.push(current);
  };
  const tower = (cx, cz, r, h) => {
    for (let y = 0; y < h; y++)
      for (let x = -r; x <= r; x++)
        for (let z = -r; z <= r; z++) {
          const d = Math.hypot(x, z);
          if (
            d <= r + 0.3 &&
            (d >= r - 1.2 || y === 0 || y === h - 3) &&
            !(y > 5 && y < 9 && Math.abs(x) < 1 && z < 0) &&
            !(y < 4 && Math.abs(x) < 2 && z > 2)
          )
            add(cx + x, y, cz + z, y % 6 === 0 ? "trim" : "stone");
        }
    for (let x = -r; x <= r; x++)
      for (let z = -r; z <= r; z++)
        if (
          Math.hypot(x, z) > r - 1.3 &&
          Math.hypot(x, z) < r + 0.3 &&
          (x + z) % 3 !== 0
        )
          box(cx + x, h, cz + z, 1, 2, 1, "trim");
  };
  const shift = Math.floor(rng() * 5),
    height = 16 + Math.floor(rng() * 7);
  begin("Briarwatch citadel", "Castle", 0, 0);
  for (const x of [-16, 16])
    for (const z of [-13, 13]) tower(x, z, 5, height + Math.floor(rng() * 5));
  for (let x = -15; x <= 15; x++)
    for (const z of [-13, 13])
      for (let y = 0; y < 12; y++) {
        if (z === 13 && Math.abs(x) < 3 && y < 7) continue;
        add(x, y, z, y % 5 === 0 ? "trim" : "stone");
        if (y === 11 && x % 3 !== 0) add(x, 12, z, "trim");
      }
  for (let z = -12; z <= 12; z++)
    for (const x of [-16, 16])
      for (let y = 0; y < 12; y++) {
        add(x, y, z, y % 5 === 0 ? "trim" : "stone");
        if (y === 11 && z % 3 !== 0) add(x, 12, z, "trim");
      }
  for (let x = -7; x <= 7; x++)
    for (let z = -6; z <= 5; z++)
      for (let y = 0; y < height + 3; y++) {
        if (Math.abs(x) === 7 || z === -6 || z === 5 || y === height + 2) {
          if (z === 5 && Math.abs(x) < 2 && y < 4) continue;
          if (y > 5 && y % 7 < 3 && x % 5 === 0 && z === 5) continue;
          add(x, y, z, y % 6 === 0 ? "trim" : "stone");
        }
      }
  for (let y = 0; y < 7; y++)
    box(-8 + y, height + 3 + y, -7, 17 - y * 2, 1, 14, "roof");
  box(-1, height + 10, 0, 1, 6, 1, "wood");
  box(0, height + 13, 0, 5, 3, 1, "banner");
  begin("Saint Orin’s cathedral", "Cathedral", -67, 3 + shift);
  const cx = -67,
    cz = 3 + shift;
  for (let x = -10; x <= 10; x++)
    for (let z = -21; z <= 21; z++)
      for (let y = 0; y < 22; y++) {
        const side = Math.abs(x) === 10,
          end = Math.abs(z) === 21;
        if (!side && !end && y !== 0) continue;
        if (z === 21 && Math.abs(x) < 4 && y < 10) continue;
        const window = side && Math.abs(z) % 9 < 3 && y > 7 && y < 17;
        if (window) {
          if (y < 15) add(cx + x, y, cz + z, "glass");
          continue;
        }
        if (end && y > 11 && y < 18 && Math.abs(x) < 3)
          add(cx + x, y, cz + z, "glass");
        else add(cx + x, y, cz + z, y % 7 === 0 ? "trim" : "sand");
      }
  for (let y = 0; y < 12; y++)
    for (const x of [-11 + y, 11 - y])
      box(cx + x, 22 + y, cz - 22, 1, 1, 45, "roof");
  for (let z = -18; z <= 18; z += 9)
    for (const s of [-1, 1]) {
      box(cx + s * 13, 0, cz + z, 2, 13, 2, "trim");
      for (let y = 0; y < 7; y++)
        box(cx + s * (13 - Math.floor(y / 2)), 13 + y, cz + z, 1, 1, 2, "trim");
    }
  for (const x of [-8, 8]) {
    box(cx + x - 2, 0, cz + 21, 5, 30, 4, "sand");
    for (let y = 0; y < 9; y++)
      box(
        cx + x - 3 + Math.floor(y / 2),
        30 + y,
        cz + 20 + Math.floor(y / 2),
        7 - Math.floor(y / 2) * 2,
        1,
        6 - Math.floor(y / 2),
        "roof",
      );
  }
  begin("The old aqueduct", "Aqueduct", 63, -32);
  for (let x = 0; x < 64; x++)
    for (let y = 0; y < 17; y++) {
      const arch = x % 16;
      const opening =
        arch > 3 &&
        arch < 13 &&
        y < 8 + Math.sqrt(Math.max(0, 25 - (arch - 8) ** 2));
      if (!opening)
        for (let z = 0; z < 3; z++)
          add(40 + x, y, -39 + z, y > 13 ? "trim" : "sand");
    }
  box(39, 17, -40, 66, 1, 5, "trim");
  for (const z of [-40, -36]) box(39, 18, z, 66, 2, 1, "sand");
  for (let i = 0; i < 5; i++) {
    const x = 38 + (i % 3) * 20,
      z = 21 + Math.floor(i / 3) * 24,
      h = 7 + Math.floor(rng() * 5),
      w = 10 + Math.floor(rng() * 3),
      d = 12;
    begin(
      [
        "Foxglove inn",
        "The potter’s house",
        "Copper workshop",
        "Mill cottage",
        "Riverside hall",
      ][i],
      "Village",
      x,
      z,
    );
    for (let a = 0; a < w; a++)
      for (let c = 0; c < d; c++)
        for (let y = 0; y < h; y++) {
          if (a !== 0 && a !== w - 1 && c !== 0 && c !== d - 1 && y !== h - 1)
            continue;
          if (c === d - 1 && a > 3 && a < 6 && y < 4) continue;
          if (y === h - 1 && a > 0 && a < 3 && c >= 1 && c <= h) continue;
          if (y > 2 && y < 5 && a % 5 === 2 && c === d - 1) {
            add(x + a, y, z + c, "glass");
            continue;
          }
          add(x + a, y, z + c, y % 4 === 0 || a % 5 === 0 ? "wood" : "plaster");
        }
    for (let y = 0; y < Math.ceil(w / 2); y++)
      for (const a of [y, w - 1 - y])
        box(x + a, h + y, z - 1, 1, 1, d + 2, "copper");
    box(x + 2, h, z + 3, 2, 7, 2, "brick");
  }
  const boundsOf = (s) => {
    const bs = s.ids.map((id) => blocks[id]);
    return {
      minX: Math.min(...bs.map((b) => b.x)),
      maxX: Math.max(...bs.map((b) => b.x)),
      minZ: Math.min(...bs.map((b) => b.z)),
      maxZ: Math.max(...bs.map((b) => b.z)),
    };
  };
  for (const s of structures) {
    current = s;
    s.bounds = boundsOf(s);
    addInterior({ add, box }, s);
  }
  const sites = [
    [-115, -76],
    [-66, -90],
    [-12, -85],
    [45, -95],
    [105, -80],
    [-116, -20],
    [125, -20],
    [-113, 38],
    [125, 42],
    [-96, 98],
    [-46, 99],
    [8, 103],
    [64, 103],
    [112, 102],
    [-145, 80],
    [153, 80],
  ];
  for (let i = 0; i < sites.length; i++) {
    const [x, z] = sites[i],
      type = TYPES[i % TYPES.length];
    begin(type + " " + (i + 1), type, x, z);
    buildArchitecture({ add, box }, type, x, z, rng);
  }
  // Keep neighborhoods recognizable, but vary their layout and orientation for every seed.
  if (seed !== "AFTERGLOW") {
    const layout = random(seed + "layout");
    grid.clear();
    for (const s of structures) {
      const spread = s.type === "Village" ? 3 : 6;
      const dx = Math.floor(layout() * (spread * 2 + 1)) - spread,
        dz = Math.floor(layout() * (spread * 2 + 1)) - spread;
      const rotate = false;
      const ox = Math.round(s.x / UNIT),
        oz = Math.round(s.z / UNIT);
      for (const id of s.ids) {
        const b = blocks[id];
        const rx = b.x - ox,
          rz = b.z - oz;
        b.x = ox + (rotate ? -rz : rx) + dx;
        b.z = oz + (rotate ? rx : rz) + dz;
        grid.set(key(b.x, b.y, b.z), id);
      }
      s.x += dx * UNIT;
      s.z += dz * UNIT;
    }
  }
  grid.clear();
  for (const s of structures) {
    s.baseY =
      s.id < 8 ? 0 : 2 * (terrainLevel(s.x / CELL, s.z / CELL, hash(seed)) + 1);
    for (const id of s.ids) {
      const b = blocks[id];
      b.y += s.baseY;
      grid.set(key(b.x, b.y, b.z), id);
    }
    s.initial = s.ids.length;
    s.bounds = boundsOf(s);
  }
  const terrain = new Terrain(hash(seed));
  terrain.addPads(structures);
  const world = {
    seed,
    blocks,
    structures,
    grid,
    terrain,
    removed: 0,
    score: 0,
    regions: ["0,0"],
    crystals: 0,
    crystalRegions: new Set(),
  };
  for (const [rx, rz] of [
    [0, 0],
    [-1, 0],
    [0, -1],
    [-1, -1],
  ])
    addCrystalGrottos(world, rx, rz);
  return world;
}
const directions = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
export function destroy(world, point, radius) {
  const hit = [],
    fallen = [],
    affected = new Set();
  const remove = (b, list) => {
    rememberBearing(world, world.structures[b.structure]);
    b.alive = false;
    world.grid.delete(key(b.x, b.y, b.z));
    list.push(b.id);
    world.removed++;
  };
  const r = radius / UNIT,
    px = point.x / UNIT,
    py = point.y / UNIT,
    pz = point.z / UNIT;
  for (let x = Math.floor(px - r); x <= Math.ceil(px + r); x++)
    for (let y = Math.floor(py - r); y <= Math.ceil(py + r); y++)
      for (let z = Math.floor(pz - r); z <= Math.ceil(pz + r); z++) {
        if ((x - px) ** 2 + (y - py) ** 2 + (z - pz) ** 2 > r * r) continue;
        const id = world.grid.get(key(x, y, z));
        if (id === undefined) continue;
        const b = world.blocks[id];
        affected.add(b.structure);
        remove(b, hit);
      }
  if (world.terrain)
    for (const s of world.structures) {
      if (
        s.bounds &&
        point.x + radius > s.bounds.minX * UNIT &&
        point.x - radius < s.bounds.maxX * UNIT &&
        point.z + radius > s.bounds.minZ * UNIT &&
        point.z - radius < s.bounds.maxZ * UNIT
      )
        rememberBearing(world, s);
    }
  const excavation = world.terrain?.dig(point, radius) || {
    removed: [],
    crystals: [],
  };
  if (excavation.removed.length)
    for (const s of world.structures)
      if (
        point.x + radius > s.bounds.minX * UNIT &&
        point.x - radius < s.bounds.maxX * UNIT &&
        point.z + radius > s.bounds.minZ * UNIT &&
        point.z - radius < s.bounds.maxZ * UNIT
      )
        affected.add(s.id);
  for (const sid of affected) {
    const s = world.structures[sid];
    rememberBearing(world, s);
    collapseStructure(world, s, (b) => remove(b, fallen));
  }
  const crystalBlocks = hit.filter(
    (id) => world.blocks[id].material === "crystal",
  ).length;
  const points =
    hit.length * 10 +
    fallen.length * 20 +
    excavation.removed.length * 2 +
    excavation.crystals.length * 100 +
    crystalBlocks * 90;
  world.crystals =
    (world.crystals || 0) + excavation.crystals.length + crystalBlocks;
  world.score += points;
  return {
    hit,
    fallen,
    points,
    affected: [...affected],
    terrain: excavation.removed,
    crystals: excavation.crystals.length + crystalBlocks,
    crystalsTotal: world.crystals,
  };
}
export function applyRemoved(world, ids) {
  for (const id of ids) {
    const b = world.blocks[id];
    if (b?.alive) {
      b.alive = false;
      world.grid.delete(key(b.x, b.y, b.z));
      world.removed++;
    }
  }
}
function march(origin, dir, size, offset, lookup, max) {
  const p = { x: origin.x, y: origin.y - offset, z: origin.z },
    c = {
      x: Math.floor((p.x + size / 2) / size),
      y: Math.floor((p.y + size / 2) / size),
      z: Math.floor((p.z + size / 2) / size),
    },
    step = {},
    next = {},
    delta = {};
  for (const axis of ["x", "y", "z"]) {
    step[axis] = dir[axis] >= 0 ? 1 : -1;
    delta[axis] = dir[axis] === 0 ? Infinity : Math.abs(size / dir[axis]);
    next[axis] =
      dir[axis] === 0
        ? Infinity
        : ((c[axis] + step[axis] * 0.5) * size - p[axis]) / dir[axis];
  }
  let t = 0,
    normal = { x: 0, y: 0, z: 0 };
  for (let i = 0; i < 2500 && t < max; i++) {
    const id = lookup(c.x, c.y, c.z);
    if (id !== undefined && id !== null && id !== false && id !== 0)
      return {
        x: origin.x + dir.x * t,
        y: origin.y + dir.y * t,
        z: origin.z + dir.z * t,
        distance: t,
        normal,
        id: id === true ? null : id,
      };
    const a =
      next.x < next.y
        ? next.x < next.z
          ? "x"
          : "z"
        : next.y < next.z
          ? "y"
          : "z";
    t = next[a];
    next[a] += delta[a];
    c[a] += step[a];
    normal = { x: 0, y: 0, z: 0 };
    normal[a] = -step[a];
  }
  return null;
}
export function raycast(world, origin, dir, max = 350) {
  const building = march(
    origin,
    dir,
    UNIT,
    0,
    (x, y, z) => {
      const id = world.grid.get(key(x, y, z));
      return id === undefined ? false : id + 1;
    },
    max,
  );
  if (building) building.id--;
  const terrain = world.terrain
    ? march(
        origin,
        dir,
        CELL,
        0.375,
        (x, y, z) => (world.terrain.get(x, y, z) ? true : false),
        max,
      )
    : null;
  if (terrain) terrain.terrain = true;
  return !building
    ? terrain
    : !terrain
      ? building
      : building.distance <= terrain.distance
        ? building
        : terrain;
}
export function ensureRegion(world, rx, rz) {
  const region = rx + "," + rz;
  if (world.regions.includes(region)) return [];
  world.regions.push(region);
  const rng = random(world.seed + region),
    added = [];
  for (let i = 0; i < 12; i++) {
    const x = rx * 320 + ((i % 4) - 1.5) * 66 + Math.floor(rng() * 10),
      z = rz * 320 + (Math.floor(i / 4) - 1) * 85 + Math.floor(rng() * 10),
      type = TYPES[Math.floor(rng() * TYPES.length)];
    const baseY = 2 * (terrainLevel(x / 2, z / 2, hash(world.seed)) + 1);
    const s = {
      id: world.structures.length,
      name: type + " / " + region + " / " + i,
      type,
      x: x * UNIT,
      z: z * UNIT,
      baseY,
      ids: [],
      initial: 0,
    };
    world.structures.push(s);
    const add = (a, b, c, material = "stone") => {
      a = Math.round(a);
      b = Math.round(b + baseY);
      c = Math.round(c);
      const k = key(a, b, c);
      if (world.grid.has(k)) return;
      const block = {
        id: world.blocks.length,
        x: a,
        y: b,
        z: c,
        material,
        structure: s.id,
        shade: rng(),
        alive: true,
      };
      world.blocks.push(block);
      world.grid.set(k, block.id);
      s.ids.push(block.id);
    };
    const box = (x, y, z, w, h, d, m) => {
      for (let a = 0; a < w; a++)
        for (let b = 0; b < h; b++)
          for (let c = 0; c < d; c++) add(x + a, y + b, z + c, m);
    };
    buildArchitecture({ add, box }, type, x, z, rng);
    s.initial = s.ids.length;
    const bs = s.ids.map((id) => world.blocks[id]);
    s.bounds = {
      minX: Math.min(...bs.map((b) => b.x)),
      maxX: Math.max(...bs.map((b) => b.x)),
      minZ: Math.min(...bs.map((b) => b.z)),
      maxZ: Math.max(...bs.map((b) => b.z)),
    };
    added.push(s);
  }
  world.terrain.addPads(added);
  addCrystalGrottos(world, Math.floor(rx * 2.5), Math.floor(rz * 2.5));
  return added;
}

export function addCrystalGrottos(world, rx, rz) {
  const region = rx + "," + rz;
  world.crystalRegions ||= new Set();
  if (world.crystalRegions.has(region)) return;
  world.crystalRegions.add(region);
  const rng = random(world.seed + "crystal" + region),
    nodes = world.terrain.caveRegion(rx, rz).nodes;
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i],
      s = {
        id: world.structures.length,
        name:
          [
            "Azure hollow",
            "Amethyst vault",
            "The crystal choir",
            "Moonstone chamber",
            "Prism gallery",
          ][i] +
          " / " +
          region,
        type: "Crystal grotto",
        x: n.x * CELL,
        z: n.z * CELL,
        ids: [],
        baseY: 0,
      };
    world.structures.push(s);
    for (let a = -2; a <= 2; a += 2)
      for (let b = -2; b <= 2; b += 2) {
        const tx = Math.round(n.x) + a,
          tz = Math.round(n.z) + b;
        let ty = Math.floor(n.y);
        while (ty > -31 && !world.terrain.get(tx, ty, tz)) ty--;
        const base = ty * 2 + 2;
        for (let y = 0; y < 3 + Math.floor(rng() * 5); y++) {
          const x = tx * 2,
            z = tz * 2,
            Y = base + y,
            k = key(x, Y, z);
          if (
            world.grid.has(k) ||
            world.terrain.at(x * UNIT, Y * UNIT, z * UNIT)
          )
            continue;
          const block = {
            id: world.blocks.length,
            x,
            y: Y,
            z,
            material: "crystal",
            structure: s.id,
            shade: rng(),
            alive: true,
            anchor: y === 0,
          };
          world.blocks.push(block);
          world.grid.set(k, block.id);
          s.ids.push(block.id);
        }
      }
    if (!s.ids.length) {
      world.structures.pop();
      continue;
    }
    const bs = s.ids.map((id) => world.blocks[id]);
    s.baseY = Math.min(...bs.map((b) => b.y));
    s.initial = s.ids.length;
    s.bounds = {
      minX: Math.min(...bs.map((b) => b.x)),
      maxX: Math.max(...bs.map((b) => b.x)),
      minZ: Math.min(...bs.map((b) => b.z)),
      maxZ: Math.max(...bs.map((b) => b.z)),
    };
  }
}
