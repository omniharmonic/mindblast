// A directed load path approximation: finite spans, shared gravity loads and
// compression failure. It is deliberately deterministic for multiplayer replay.
const adjacent = [
  [1, 0, 0],
  [-1, 0, 0],
  [0, 1, 0],
  [0, -1, 0],
  [0, 0, 1],
  [0, 0, -1],
];
const key = (x, y, z) => `${x},${y},${z}`;
const weight = (m) =>
  m === "wood" ? 0.35 : m === "glass" ? 0.5 : m === "metal" ? 2 : 1;
const capacity = (m) =>
  m === "metal"
    ? 180
    : m === "wood"
      ? 32
      : m === "glass" || m === "banner"
        ? 6
        : 65;
export function structureLoads(world, s) {
  const strength = new Map(),
    roots = new Set(),
    queue = [];
  for (const id of s.ids) {
    const b = world.blocks[id];
    if (
      b.alive &&
      (b.anchor || b.y === (s.baseY || 0)) &&
      (!world.terrain ||
        world.terrain.at(b.x * 0.75, b.y * 0.75 - 0.8, b.z * 0.75))
    ) {
      strength.set(id, 1);
      roots.add(id);
      queue.push(id);
    }
  }
  for (let i = 0; i < queue.length; i++) {
    const b = world.blocks[queue[i]],
      bearing = strength.get(b.id);
    for (const [dx, dy, dz] of adjacent) {
      const id = world.grid.get(key(b.x + dx, b.y + dy, b.z + dz)),
        n = world.blocks[id];
      if (!n || n.structure !== s.id) continue;
      const lateral =
        n.material === "metal" ? 0.055 : n.material === "wood" ? 0.085 : 0.13;
      const available =
        bearing - (dy > 0 ? 0.012 : dy < 0 ? lateral * 1.5 : lateral);
      if (available > 0 && available > (strength.get(id) || 0) + 0.0001) {
        strength.set(id, available);
        queue.push(id);
      }
    }
  }
  const loads = new Map(
    [...strength.keys()].map((id) => [id, weight(world.blocks[id].material)]),
  );
  const ordered = [...strength.keys()].sort(
    (a, b) => strength.get(a) - strength.get(b) || a - b,
  );
  for (const id of ordered) {
    if (roots.has(id)) continue;
    const b = world.blocks[id],
      supports = [];
    for (const [dx, dy, dz] of adjacent) {
      const next = world.grid.get(key(b.x + dx, b.y + dy, b.z + dz));
      if ((strength.get(next) || 0) > strength.get(id) + 0.0001)
        supports.push([next, dy < 0 ? 4 : dy === 0 ? 1 : 0.25]);
    }
    const total = supports.reduce((sum, [, share]) => sum + share, 0);
    for (const [next, share] of supports)
      loads.set(next, loads.get(next) + (loads.get(id) * share) / total);
  }
  return { strength, loads };
}
export function rememberBearing(world, s) {
  if (s.bearingCapacity) return;
  const { loads } = structureLoads(world, s);
  s.bearingCapacity = new Map(
    s.ids.map((id) => [
      id,
      Math.max(
        capacity(world.blocks[id].material),
        (loads.get(id) || 0) * 1.65,
      ),
    ]),
  );
}
export function collapseStructure(world, s, remove) {
  // Recompute after each weak support fails, allowing loads to find alternate
  // columns before a roof or tower detaches. Terminate only at equilibrium.
  for (let pass = 0; pass <= s.ids.length; pass++) {
    const { strength, loads } = structureLoads(world, s);
    const failed = s.ids.filter(
      (id) =>
        world.blocks[id].alive &&
        (!strength.has(id) ||
          loads.get(id) >
            (s.bearingCapacity?.get(id) ??
              capacity(world.blocks[id].material))),
    );
    if (!failed.length) break;
    for (const id of failed) remove(world.blocks[id]);
  }
}
