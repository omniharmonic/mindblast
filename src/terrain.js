// Infinite, deterministic terrain. Only edited cells and sampled columns are stored.
export const CELL = 1.5,
  CHUNK = 16,
  BOTTOM = -32;
const hash = (x, z, s) => {
  let h = Math.imul(x ^ s, 374761393) ^ Math.imul(z, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
};
const smooth = (t) => t * t * (3 - 2 * t);
function noise(x, z, s) {
  const ix = Math.floor(x),
    iz = Math.floor(z),
    a = smooth(x - ix),
    b = smooth(z - iz);
  return (
    (hash(ix, iz, s) * (1 - a) + hash(ix + 1, iz, s) * a) * (1 - b) +
    (hash(ix, iz + 1, s) * (1 - a) + hash(ix + 1, iz + 1, s) * a) * b
  );
}
export function terrainLevel(x, z, seed) {
  return (
    Math.round(
      (noise(x / 75, z / 75, seed) - 0.5) * 15 +
        (noise(x / 24, z / 24, seed + 13) - 0.5) * 6 +
        (noise(x / 7, z / 7, seed + 41) - 0.5) * 1.5 +
        Math.max(
          0,
          1 - Math.abs(noise(x / 110, z / 110, seed + 91) - 0.5) * 5,
        ) *
          4 -
        Math.max(
          0,
          1 - Math.abs(noise(x / 48, z / 48, seed + 211) - 0.5) * 12,
        ) *
          3,
    ) - 1
  );
}
export class Terrain {
  constructor(seed) {
    this.seed = seed;
    this.removed = new Set();
    this.pads = [];
    this.columns = new Map();
    this.regions = new Map();
    this.crystals = 0;
  }
  addPads(structures) {
    for (const s of structures) {
      if (s.type === "Crystal grotto") continue;
      this.pads.push({
        minX: s.bounds.minX / 2 - 2,
        maxX: s.bounds.maxX / 2 + 2,
        minZ: s.bounds.minZ / 2 - 2,
        maxZ: s.bounds.maxZ / 2 + 2,
        h: (s.baseY - 2) / 2,
      });
    }
    this.columns.clear();
  }
  caveRegion(rx, rz) {
    const k = rx + "," + rz;
    if (this.regions.has(k)) return this.regions.get(k);
    const nodes = [];
    const cx = rx * 64 + 32,
      cz = rz * 64 + 32;
    for (let i = 0; i < 5; i++) {
      const a = i * 1.25 + hash(rx + i, rz, this.seed) * 0.6;
      nodes.push({
        x: cx + Math.cos(a) * 17,
        z: cz + Math.sin(a) * 17,
        y: -12 - hash(rx, rz + i, this.seed) * 8,
        r: 4 + hash(rx + i, rz + i, this.seed) * 3,
      });
    }
    const tunnel = [];
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i],
        b = nodes[(i + 1) % nodes.length];
      for (let j = 0; j <= 5; j++) {
        const t = j / 5;
        tunnel.push({
          x: a.x + (b.x - a.x) * t,
          y: a.y + (b.y - a.y) * t,
          z: a.z + (b.z - a.z) * t,
          r: 2.5,
        });
      }
    }
    // A sloping entrance connects the surface to the first chamber.
    const end = nodes[0],
      start = {
        x: end.x + 14,
        z: end.z + 12,
        y: terrainLevel(end.x + 14, end.z + 12, this.seed) + 2,
      };
    for (let j = 0; j <= 18; j++) {
      const t = j / 18;
      tunnel.push({
        x: start.x + (end.x - start.x) * t,
        y: start.y + (end.y - start.y) * t,
        z: start.z + (end.z - start.z) * t,
        r: 2.8,
      });
    }
    const result = {
      nodes,
      carves: [...nodes, ...tunnel],
      entrance: {
        x: start.x * CELL,
        y: start.y * CELL + 0.375,
        z: start.z * CELL,
      },
    };
    this.regions.set(k, result);
    return result;
  }
  column(x, z) {
    const k = x + "," + z;
    let c = this.columns.get(k);
    if (c) return c;
    let h = terrainLevel(x, z, this.seed);
    const natural = h;
    for (const p of this.pads) {
      if (x >= p.minX && x <= p.maxX && z >= p.minZ && z <= p.maxZ) {
        h = p.h;
        break;
      }
      const distance = Math.hypot(
        Math.max(p.minX - x, 0, x - p.maxX),
        Math.max(p.minZ - z, 0, z - p.maxZ),
      );
      if (distance < 8) {
        const blended = Math.round(
          p.h + (natural - p.h) * smooth(distance / 8),
        );
        if (Math.abs(blended - p.h) < Math.abs(h - p.h)) h = blended;
      }
    }
    const caves = [];
    const rx = Math.floor(x / 64),
      rz = Math.floor(z / 64);
    for (let a = rx - 1; a <= rx + 1; a++)
      for (let b = rz - 1; b <= rz + 1; b++)
        for (const n of this.caveRegion(a, b).carves) {
          const d = (x - n.x) ** 2 + (z - n.z) ** 2;
          if (d < n.r * n.r)
            caves.push({ y: n.y, span: Math.sqrt(n.r * n.r - d) * 0.8 });
        }
    c = { h, caves };
    this.columns.set(k, c);
    if (this.columns.size > 90000)
      this.columns.delete(this.columns.keys().next().value);
    return c;
  }
  raw(x, y, z) {
    if (y <= BOTTOM) return 4;
    const c = this.column(x, z);
    if (y > c.h) return 0;
    for (const n of c.caves) if (Math.abs(y - n.y) < n.span) return 0;
    if (y === c.h) return 1;
    if (y > c.h - 3) return 2;
    const ore = hash(x + Math.floor(y) * 31, z, this.seed);
    return y < -8 && ore > 0.965 ? 5 : y < -5 ? 4 : 3;
  }
  get(x, y, z) {
    return this.removed.has(`${x},${y},${z}`) ? 0 : this.raw(x, y, z);
  }
  at(x, y, z) {
    return this.get(
      Math.floor((x + 0.75) / CELL),
      Math.floor((y + 0.375) / CELL),
      Math.floor((z + 0.75) / CELL),
    );
  }
  surface(x, z) {
    const cx = Math.floor((x + 0.75) / CELL),
      cz = Math.floor((z + 0.75) / CELL);
    for (let y = this.column(cx, cz).h; y > BOTTOM; y--)
      if (this.get(cx, y, cz)) return y * CELL + 1.125;
    return BOTTOM * CELL + 1.125;
  }
  dig(point, radius, shape = "sphere", direction = { x: 0, y: -1, z: 0 }) {
    const removed = [],
      crystals = [];
    const cx = Math.floor((point.x + 0.75) / CELL),
      cy = Math.floor((point.y + 0.375) / CELL),
      cz = Math.floor((point.z + 0.75) / CELL),
      r = radius / CELL;
    for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++)
      for (
        let y = Math.max(BOTTOM + 1, Math.floor(cy - r));
        y <= Math.ceil(cy + r);
        y++
      )
        for (let z = Math.floor(cz - r); z <= Math.ceil(cz + r); z++) {
          const d =
            (x * CELL - point.x) ** 2 +
            (y * CELL + 0.375 - point.y) ** 2 +
            (z * CELL - point.z) ** 2;
          if (d > radius * radius) continue;
          const type = this.get(x, y, z);
          if (!type) continue;
          const k = `${x},${y},${z}`;
          this.removed.add(k);
          removed.push(k);
          if (type === 5) {
            crystals.push(k);
            this.crystals++;
          }
        }
    return { removed, crystals };
  }
  apply(keys) {
    for (const k of keys) this.removed.add(k);
  }
}
