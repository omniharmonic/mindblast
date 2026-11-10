import test from "node:test";
import assert from "node:assert/strict";
import {
  generateWorld,
  destroy,
  key,
  raycast,
  applyRemoved,
  WEAPONS,
  ensureRegion,
  resolveShot,
  sanitizeSettings,
} from "../src/world.js";
test("seeds reproduce exactly, and different seeds vary geometry", () => {
  const a = generateWorld("one"),
    b = generateWorld("one"),
    c = generateWorld("two");
  assert.deepEqual(a.blocks, b.blocks);
  assert.notDeepEqual(a.blocks, c.blocks);
  assert.equal(a.grid.size, a.blocks.length);
  assert.ok(
    a.structures.filter((s) => s.type !== "Crystal grotto").length >= 24,
  );
  assert.ok(new Set(a.structures.map((s) => s.type)).size >= 15);
});
test("removing a foundation collapses disconnected upper blocks", () => {
  const blocks = Array.from({ length: 6 }, (_, y) => ({
    id: y,
    x: 0,
    y,
    z: 0,
    structure: 0,
    alive: true,
  }));
  const w = {
    blocks,
    grid: new Map(blocks.map((b) => [key(b.x, b.y, b.z), b.id])),
    structures: [{ id: 0, ids: blocks.map((b) => b.id) }],
    removed: 0,
    score: 0,
  };
  const r = destroy(w, { x: 0, y: 0.75, z: 0 }, 0.2);
  assert.deepEqual(r.hit, [1]);
  assert.deepEqual(r.fallen, [2, 3, 4, 5]);
  assert.equal(w.grid.size, 1);
  assert.equal(w.score, 90);
});
test("a surviving alternate load path supports an overhang", () => {
  const blocks = [];
  for (let x = 0; x < 3; x++)
    for (let y = 0; y < 3; y++)
      if (x === 0 || x === 2 || y === 2)
        blocks.push({
          id: blocks.length,
          x,
          y,
          z: 0,
          structure: 0,
          alive: true,
        });
  const w = {
    blocks,
    grid: new Map(blocks.map((b) => [key(b.x, b.y, b.z), b.id])),
    structures: [{ id: 0, ids: blocks.map((b) => b.id) }],
    removed: 0,
    score: 0,
  };
  const r = destroy(w, { x: 0, y: 0.75, z: 0 }, 0.2);
  assert.equal(r.fallen.length, 0);
});
test("all weapons remove blocks and repeated destruction never counts twice", () => {
  for (const weapon of WEAPONS) {
    const w = generateWorld();
    const result = destroy(w, { x: 12, y: 3, z: 9.75 }, weapon.radius);
    assert.ok(result.hit.length > 0, weapon.name);
    const count = w.removed,
      score = w.score;
    const again = destroy(w, { x: 12, y: 3, z: 9.75 }, weapon.radius);
    assert.equal(again.points, 0);
    assert.equal(w.removed, count);
    assert.equal(w.score, score);
    assert.equal(w.grid.size, w.blocks.length - w.removed);
  }
});
test("snapshot deletion matches authoritative world and is idempotent", () => {
  const a = generateWorld(),
    b = generateWorld();
  const r = destroy(a, { x: 12, y: 3, z: 9.75 }, 8);
  const ids = [...r.hit, ...r.fallen];
  applyRemoved(b, ids);
  applyRemoved(b, ids);
  assert.equal(b.removed, a.removed);
  assert.deepEqual(b.grid, a.grid);
});
test("raycast hits masonry and ground, not removed voxels", () => {
  const w = generateWorld();
  const hit = raycast(w, { x: 8, y: 3, z: 30 }, { x: 0, y: 0, z: -1 });
  assert.notEqual(hit?.id, undefined);
  assert.equal(w.blocks[hit.id].alive, true);
  const ground = raycast(w, { x: 0, y: 10, z: 50 }, { x: 0, y: -1, z: 0 });
  assert.equal(ground.id, null);
  assert.ok(Math.abs(ground.y - w.terrain.surface(0, 50)) < 1e-6);
});
test("large demolition preserves grid integrity and finite scores", () => {
  const w = generateWorld();
  for (let x = -15; x <= 15; x += 5) destroy(w, { x, y: 2, z: 8 }, 10);
  assert.ok(w.removed > 1000);
  assert.equal(w.grid.size, w.blocks.length - w.removed);
  assert.ok(Number.isFinite(w.score));
  for (const b of w.blocks)
    assert.equal(w.grid.has(key(b.x, b.y, b.z)), b.alive);
});

test("terrain is excavatable below ground and damage survives replay", () => {
  const a = generateWorld("DIG"),
    b = generateWorld("DIG");
  const p = { x: 0, y: a.terrain.surface(0, 34) - 2, z: 34 };
  const hit = destroy(a, p, 4);
  assert.ok(hit.terrain.length > 0);
  b.terrain.apply(hit.terrain);
  for (const k of hit.terrain) {
    const xyz = k.split(",").map(Number);
    assert.equal(a.terrain.get(...xyz), 0);
    assert.equal(b.terrain.get(...xyz), 0);
  }
  assert.equal(destroy(a, p, 4).terrain.length, 0);
});
test("undermining terrain collapses a structure without a direct masonry hit", () => {
  const w = generateWorld();
  const b = { id: 0, x: 0, y: 0, z: 80, structure: 0, alive: true };
  w.blocks = [b];
  w.grid = new Map([[key(0, 0, 80), 0]]);
  w.structures = [
    {
      id: 0,
      ids: [0],
      baseY: 0,
      bounds: { minX: 0, maxX: 0, minZ: 80, maxZ: 80 },
    },
  ];
  w.terrain.pads = [{ minX: -1, maxX: 1, minZ: 39, maxZ: 41, h: -1 }];
  w.terrain.columns.clear();
  const r = destroy(w, { x: 0, y: -2, z: 60 }, 1.8);
  assert.equal(r.hit.length, 0);
  assert.deepEqual(r.fallen, [0]);
});
test("new districts are deterministic and preserve existing block ids and damage", () => {
  const a = generateWorld("EXPAND"),
    b = generateWorld("EXPAND");
  destroy(a, { x: 12, y: 2, z: 9 }, 5);
  const count = a.blocks.length,
    old = a.blocks[100];
  ensureRegion(a, 1, 0);
  ensureRegion(b, 1, 0);
  assert.ok(a.blocks.length > count);
  assert.equal(a.blocks[100], old);
  assert.deepEqual(a.blocks.slice(count), b.blocks.slice(count));
  const expanded = a.blocks.length;
  ensureRegion(a, 1, 0);
  assert.equal(a.blocks.length, expanded);
  assert.ok(a.structures.some((s) => s.x > 200));
});
test("cave chambers are open and contain mineable crystal formations", () => {
  const w = generateWorld(),
    n = w.terrain.caveRegion(0, 0).nodes[0];
  assert.equal(
    w.terrain.get(Math.round(n.x), Math.round(n.y), Math.round(n.z)),
    0,
  );
  const crystals = w.blocks.filter((b) => b.material === "crystal" && b.y < 0);
  assert.ok(crystals.length > 100);
  const b = crystals[0],
    r = destroy(w, { x: b.x * 0.75, y: b.y * 0.75, z: b.z * 0.75 }, 2);
  assert.ok(r.crystals > 0);
  assert.ok(w.crystals > 0);
});
test("tuning changes blast size and novel weapons have distinct blast patterns", () => {
  const a = generateWorld(),
    b = generateWorld();
  resolveShot(a, { x: 12, y: 2, z: 9 }, 0, { radius: 0.5, force: 1 });
  resolveShot(b, { x: 12, y: 2, z: 9 }, 0, { radius: 2, force: 1 });
  assert.ok(b.removed > a.removed);
  assert.ok(b.terrain.removed.size > a.terrain.removed.size);
  assert.equal(WEAPONS.length, 12);
  const events = resolveShot(generateWorld(), { x: 0, y: 0, z: 30 }, 9);
  assert.equal(events.length, 8);
  assert.equal(sanitizeSettings({ radius: 100 }).radius, 2.5);
});
test("precise rays hit voxel zero and oblique faces reliably", () => {
  const w = { grid: new Map([[key(0, 0, 0), 0]]) };
  const d = { x: -1 / Math.sqrt(2), y: 0, z: -1 / Math.sqrt(2) },
    r = raycast(w, { x: 2, y: 0, z: 2 }, d);
  assert.equal(r.id, 0);
  assert.ok(Math.abs(r.x - 0.375) < 1e-6);
  assert.ok(Math.abs(r.z - 0.375) < 1e-6);
});

test("finite masonry spans shed an unsupported cantilever", () => {
  const blocks = [];
  const add = (x, y) =>
    blocks.push({
      id: blocks.length,
      x,
      y,
      z: 0,
      structure: 0,
      alive: true,
      material: "stone",
    });
  for (let y = 0; y < 4; y++) add(0, y);
  for (let x = 1; x < 20; x++) add(x, 3);
  add(0, 4);
  const w = {
    blocks,
    grid: new Map(blocks.map((b) => [key(b.x, b.y, b.z), b.id])),
    structures: [{ id: 0, ids: blocks.map((b) => b.id) }],
    removed: 0,
    score: 0,
  };
  const r = destroy(w, { x: 0, y: 3, z: 0 }, 0.1);
  assert.ok(r.fallen.length > 10);
  assert.ok(blocks.find((b) => b.x === 2 && b.y === 3).alive);
  assert.equal(blocks.find((b) => b.x === 19).alive, false);
});

test("fragment collider merging preserves exact occupied cells and materials", async () => {
  const { colliderBoxes } = await import("../src/fragments.js");
  const blocks = [];
  for (let x = 0; x < 5; x++)
    for (let y = 0; y < 4; y++)
      for (let z = 0; z < 2; z++)
        if (x !== 2 || y > 1)
          blocks.push({ x, y, z, material: x === 4 ? "wood" : "stone" });
  const boxes = colliderBoxes(blocks),
    cells = [];
  for (const b of boxes)
    for (let x = 0; x < b.nx; x++)
      for (let y = 0; y < b.ny; y++)
        for (let z = 0; z < b.nz; z++)
          cells.push(
            `${b.x - (b.nx - 1) / 2 + x},${b.y - (b.ny - 1) / 2 + y},${b.z - (b.nz - 1) / 2 + z},${b.material}`,
          );
  assert.deepEqual(
    cells.sort(),
    blocks.map((b) => `${b.x},${b.y},${b.z},${b.material}`).sort(),
  );
  assert.ok(boxes.length < blocks.length / 3);
});

test("room assigns eight unique avatars and preserves identity in snapshots and moves", async () => {
  const { GameSession } = await import("../src/session.js");
  const session = new GameSession("AVATARS"),
    messages = new Map();
  for (let i = 0; i < 8; i++) {
    const list = [];
    messages.set(String(i), list);
    session.join(String(i), "Player " + i, (m) => list.push(m));
  }
  assert.equal(
    new Set([...session.players.values()].map((p) => p.avatar)).size,
    8,
  );
  const snapshot = messages.get("7").find((m) => m.type === "welcome");
  assert.deepEqual(
    snapshot.players.map((p) => p.avatar),
    [0, 1, 2, 3, 4, 5, 6, 7],
  );
  assert.equal(
    messages.get("0").find((m) => m.type === "player" && m.id === "7").avatar,
    7,
  );
  session.handle("3", {
    type: "move",
    position: { x: 1, y: 2, z: 3 },
    yaw: 0.4,
    weapon: 6,
  });
  assert.equal(messages.get("0").at(-1).weapon, 6);
  session.handle("3", {
    type: "move",
    position: { x: 1, y: 2, z: 3 },
    yaw: 0.4,
    weapon: 99,
  });
  assert.equal(session.players.get("3").weapon, 6);
  session.leave("2");
  const late = [];
  session.join("replacement", "New player", (m) => late.push(m));
  assert.equal(session.players.get("replacement").avatar, 2);
  assert.equal(session.players.get("3").avatar, 3);
  assert.equal(late[0].players.find((p) => p.id === "3").weapon, 6);
  session.handle("0", { type: "reset", seed: "NEXT" });
  assert.equal(session.players.get("3").avatar, 3);
});

test("rotated rubble is targetable at its physical position and blocks shots behind it", async () => {
  const { Vector3, Quaternion } = await import("three");
  const { raycastRubble, nearestHit, rubbleSurvivors } =
    await import("../src/rubble.js");
  const rotation = new Quaternion().setFromAxisAngle(
    new Vector3(0, 1, 0),
    Math.PI / 2,
  );
  const d = {
    body: {
      translation: () => ({ x: 0, y: 4, z: 5 }),
      rotation: () => rotation,
    },
    age: 0,
    blocks: [
      { offset: new Vector3(2, 0, 0) },
      { offset: new Vector3(-2, 0, 0) },
    ],
  };
  const hit = raycastRubble([d], { x: 0, y: 4, z: 0 }, { x: 0, y: 0, z: 1 });
  assert.ok(hit && hit.distance > 2.6 && hit.distance < 2.7);
  assert.equal(hit.blockIndex, 0);
  assert.equal(nearestHit({ distance: 8, id: 1 }, hit), hit);
  assert.equal(
    raycastRubble([d], { x: 1, y: 4, z: 0 }, { x: 0, y: 0, z: 1 }),
    null,
  );
  assert.equal(rubbleSurvivors(d, hit, 0.05).length, 1);
  assert.equal(rubbleSurvivors(d, { x: 0, y: 4, z: 5 }, 10).length, 0);
});

test("new districts and temple steps are above their excavatable terrain", () => {
  for (const seed of ["AFTERGLOW", "HILLS", "TEST"]) {
    const w = generateWorld(seed);
    ensureRegion(w, 1, 0);
    ensureRegion(w, 0, -1);
    const buried = w.blocks.filter(
      (b) =>
        w.structures[b.structure].type !== "Crystal grotto" &&
        w.terrain.at(b.x * 0.75, b.y * 0.75, b.z * 0.75),
    );
    assert.equal(
      buried.length,
      0,
      seed + " has masonry embedded in the terrain",
    );
  }
});

test("short projectile segments cannot skip a one-voxel wall", () => {
  const b = { id: 0, x: 0, y: 0, z: 0, alive: true };
  const w = { blocks: [b], grid: new Map([[key(0, 0, 0), 0]]) };
  for (const start of [-0.4, -0.8, -1.2]) {
    const hit = raycast(w, { x: start, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, 3);
    assert.equal(hit.id, 0);
    assert.ok(Math.abs(hit.x + 0.375) < 1e-8);
  }
});

test("repeat rubble blasts conserve volume and preserve smaller physical fragments", async () => {
  const { Vector3, Quaternion } = await import("three");
  const { shatterRubble, raycastRubble } = await import("../src/rubble.js");
  const d = {
    age: 100,
    body: {
      translation: () => ({ x: 0, y: 3, z: 0 }),
      rotation: () => new Quaternion(),
    },
    blocks: [{ offset: new Vector3(), material: "stone", size: 0.75 }],
  };
  const broken = shatterRubble(d, { x: 0, y: 3, z: 0 }, 2);
  assert.equal(broken.changed, 1);
  assert.equal(broken.blocks.length, 8);
  assert.equal(
    broken.blocks.reduce((n, b) => n + b.size ** 3, 0),
    0.75 ** 3,
  );
  d.blocks = broken.blocks;
  assert.equal(shatterRubble(d, { x: 0, y: 3, z: 0 }, 2).blocks.length, 8);
  assert.ok(
    raycastRubble([d], { x: 0.1875, y: 5, z: 0.1875 }, { x: 0, y: -1, z: 0 }),
  );
});

test("remaining pier crushes under redistributed weight after its partner is cut", () => {
  const blocks = [];
  const add = (x, y, z) =>
    blocks.push({
      id: blocks.length,
      x,
      y,
      z,
      material: "stone",
      structure: 0,
      alive: true,
    });
  for (const x of [-1, 1]) for (let y = 0; y < 10; y++) add(x, y, 0);
  for (let x = -3; x <= 3; x++)
    for (let z = -2; z <= 2; z++) for (let y = 10; y <= 20; y++) add(x, y, z);
  const w = {
    blocks,
    grid: new Map(blocks.map((b) => [key(b.x, b.y, b.z), b.id])),
    structures: [{ id: 0, ids: blocks.map((b) => b.id) }],
    removed: 0,
    score: 0,
  };
  const survivor = blocks.find((b) => b.x === 1 && b.y === 1 && b.z === 0);
  const r = destroy(w, { x: -1 * 0.75, y: 4 * 0.75, z: 0 }, 0.2);
  assert.ok(
    r.fallen.includes(survivor.id),
    "the connected but overloaded remaining pier must fail",
  );
});

test("procedural manor doorways and stairs connect furnished upper floors", async () => {
  const { buildArchitecture } = await import("../src/architecture.js");
  for (const value of [0.05, 0.5, 0.95]) {
    const grid = new Map();
    const add = (x, y, z, material) => {
      const k = key(x, y, z);
      if (!grid.has(k)) grid.set(k, { x, y, z, material });
    };
    const box = (x, y, z, w, h, d, m) => {
      for (let a = 0; a < w; a++)
        for (let b = 0; b < h; b++)
          for (let c = 0; c < d; c++) add(x + a, y + b, z + c, m);
    };
    buildArchitecture({ add, box }, "Manor", 0, 0, () => value);
    const cells = [...grid.values()],
      minX = Math.min(...cells.map((b) => b.x)) - 2,
      maxX = Math.max(...cells.map((b) => b.x)) + 2,
      minZ = Math.min(...cells.map((b) => b.z)) - 2,
      maxZ = Math.max(...cells.map((b) => b.z)) + 2;
    const solid = (x, y, z) => y === -1 || grid.has(key(x, y, z));
    const canStand = (x, y, z) =>
      solid(x, y, z) && [1, 2, 3].every((d) => !solid(x, y + d, z));
    const queue = [[0, -1, maxZ]],
      seen = new Set();
    for (let i = 0; i < queue.length; i++) {
      const [x, y, z] = queue[i];
      for (const [dx, dz] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ])
        for (const dy of [-1, 0, 1]) {
          const xx = x + dx,
            yy = y + dy,
            zz = z + dz,
            k = key(xx, yy, zz);
          if (
            xx < minX ||
            xx > maxX ||
            zz < minZ ||
            zz > maxZ ||
            yy < -1 ||
            seen.has(k) ||
            !canStand(xx, yy, zz)
          )
            continue;
          seen.add(k);
          queue.push([xx, yy, zz]);
        }
    }
    const highestFloor = Math.floor(2 + Math.floor(value * 3) - 1) * 6;
    assert.ok(
      queue.some(([x, y]) => y === highestFloor && x >= 0),
      `upper furnished room unreachable for variant ${value}`,
    );
  }
});
