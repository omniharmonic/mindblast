import {
  WeaponView,
  buildCharacter,
  animateCharacter,
  disposeModel,
} from "./characters.js";
import { colliderBoxes } from "./fragments.js";
import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import {
  UNIT,
  WEAPONS,
  generateWorld,
  destroy,
  applyRemoved,
  raycast,
  random,
  key,
  ensureRegion,
  resolveShot,
  DEFAULT_SETTINGS,
  sanitizeSettings,
} from "./world.js";
import "@fontsource/dm-sans/400.css";
import "@fontsource/dm-sans/500.css";
import "@fontsource/dm-sans/600.css";
import "@fontsource/dm-sans/700.css";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/800.css";
import "./style.css";
import { CELL, BOTTOM } from "./terrain.js";
import { PeerRoom } from "./peer.js";
import { TerrainRenderer } from "./terrain-renderer.js";
import { createMaterials, palette, BlockField } from "./materials.js";

const $ = (id) => document.getElementById(id);
const canvas = $("game");
let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    powerPreference: "high-performance",
  });
} catch (error) {
  $("loadingText").textContent =
    "WebGL 2 is unavailable. Enable hardware acceleration in a current desktop browser, then reload.";
  throw error;
}
renderer.setSize(innerWidth, innerHeight);
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.2;
const scene = new THREE.Scene();
scene.background = new THREE.Color("#b6c9c4");
scene.fog = new THREE.Fog("#b6c9c4", 45, 105);
const weaponView = new WeaponView(renderer);
const camera = new THREE.PerspectiveCamera(
  65,
  innerWidth / innerHeight,
  0.08,
  650,
);
camera.rotation.order = "YXZ";
const ambient = new THREE.HemisphereLight("#e1f1ff", "#635e38", 1.8);
scene.add(ambient);
const sun = new THREE.DirectionalLight("#ffe0ac", 3.2);
sun.position.set(-65, 100, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, {
  left: -105,
  right: 105,
  top: 105,
  bottom: -105,
  near: 1,
  far: 260,
});
sun.shadow.bias = -0.0004;
sun.shadow.normalBias = 0.08;
scene.add(sun);
const dummy = new THREE.Object3D(),
  matrix = new THREE.Matrix4(),
  zero = new THREE.Matrix4().makeScale(0, 0, 0),
  v3 = new THREE.Vector3(),
  dir = new THREE.Vector3(),
  color = new THREE.Color();
const cube = new THREE.BoxGeometry(UNIT * 0.975, UNIT * 0.975, UNIT * 0.975);
const materials = createMaterials(),
  material = materials.stone;
let terrainRenderer,
  settings = { ...DEFAULT_SETTINGS },
  charges = [],
  streamCenter = new THREE.Vector3(),
  lastRegionCheck = 0;
const lantern = new THREE.PointLight("#b9dcff", 0, 25, 1.5);
scene.add(lantern);
let world,
  staticMesh,
  physics,
  environment = new THREE.Group(),
  columns = new Map(),
  columnIds = new Map(),
  debris = [],
  effects = [],
  projectiles = [],
  worldVersion = 0;
scene.add(environment);
const debrisMesh = new THREE.InstancedMesh(cube, material, 12000);
debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
debrisMesh.count = 0;
debrisMesh.castShadow = true;
debrisMesh.receiveShadow = true;
debrisMesh.frustumCulled = false;
scene.add(debrisMesh);
let gravityWells = [];
let ready = false,
  playing = false,
  started = false,
  mode = "sandbox",
  weapon = 0,
  fly = false,
  slow = false,
  remaining = 180,
  finished = false,
  score = 0,
  cool = 0,
  elapsed = 0,
  shake = 0,
  toastTime = 0,
  comboTime = 0,
  mouseDown = false,
  quality = "balanced";
let yaw = 0,
  pitch = 0,
  vy = 0,
  grounded = false,
  position = new THREE.Vector3(0, 2, 34),
  keys = new Set(),
  audio;
let socket = null,
  netId = null,
  hostId = null,
  roomCode = null,
  remote = new Map(),
  rebuilding = false;
let fps = 60,
  frameCount = 0,
  fpsTime = 0,
  lastNetwork = 0,
  nearest;

function setBlockColor(b) {
  return color.set(palette[b.material]).multiplyScalar(0.82 + b.shade * 0.3);
}
function clearEnvironment() {
  environment.traverse((o) => {
    o.geometry?.dispose();
    if (o.material) {
      if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
      else o.material.dispose();
    }
  });
  scene.remove(environment);
  environment = new THREE.Group();
  scene.add(environment);
}
function terrainHeight(x, z) {
  return world?.terrain?.surface(x, z) ?? -0.375;
}
function buildEnvironment(seed) {
  clearEnvironment();
  const rng = random(seed + "nature");
  // Terrain is a streamed voxel surface; no invisible plane seals excavations.
  // Instanced forest and rocks keep the landscape inexpensive to draw.
  const treeGeo = new THREE.ConeGeometry(1, 1, 7),
    treeMat = new THREE.MeshStandardMaterial({
      color: "#3e6154",
      roughness: 1,
    });
  const trees = new THREE.InstancedMesh(treeGeo, treeMat, 900);
  let n = 0;
  for (let i = 0; i < 300; i++) {
    const x = position.x + (rng() - 0.5) * 430,
      z = position.z + (rng() - 0.5) * 400;
    if (
      world.structures.some(
        (s) =>
          x > s.bounds.minX * UNIT - 3 &&
          x < s.bounds.maxX * UNIT + 3 &&
          z > s.bounds.minZ * UNIT - 3 &&
          z < s.bounds.maxZ * UNIT + 3,
      )
    )
      continue;
    if (Math.abs(z + 65) < 22) continue;
    const h = 5 + rng() * 9,
      s = 1.4 + rng() * 2;
    for (let j = 0; j < 3; j++) {
      dummy.position.set(x, terrainHeight(x, z) + h * (0.32 + j * 0.23), z);
      dummy.scale.set(s * (1 - j * 0.2), h * 0.6, s * (1 - j * 0.2));
      dummy.rotation.set(0, rng() * 6, 0);
      dummy.updateMatrix();
      trees.setMatrixAt(n, dummy.matrix);
      trees.setColorAt(
        n,
        new THREE.Color().setHSL(0.38 + rng() * 0.04, 0.17, 0.19 + rng() * 0.1),
      );
      n++;
    }
  }
  trees.count = n;
  trees.castShadow = true;
  trees.receiveShadow = true;
  environment.add(trees);
  const rockGeo = new THREE.IcosahedronGeometry(1, 0),
    rocks = new THREE.InstancedMesh(
      rockGeo,
      new THREE.MeshStandardMaterial({ color: "#8b9285", roughness: 1 }),
      90,
    );
  for (let i = 0; i < 90; i++) {
    let x = (rng() - 0.5) * 300,
      z = (rng() - 0.5) * 280;
    if (Math.abs(x) < 90 && Math.abs(z) < 70) z += 100;
    dummy.position.set(x, terrainHeight(x, z), z);
    dummy.scale.set(1 + rng() * 4, 0.5 + rng() * 2, 1 + rng() * 3);
    dummy.rotation.set(rng(), rng() * 6, rng());
    dummy.updateMatrix();
    rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.castShadow = true;
  rocks.receiveShadow = true;
  environment.add(rocks);
  const mountainMat = new THREE.MeshStandardMaterial({
    color: "#9baa9e",
    flatShading: true,
    roughness: 1,
  });
  for (let i = 0; i < 20; i++) {
    const angle = (i / 20) * Math.PI * 2,
      dist = 270 + rng() * 80,
      h = 25 + rng() * 75;
    const mountain = new THREE.Mesh(
      new THREE.ConeGeometry(45 + rng() * 55, h, 5 + rng() * 3),
      mountainMat,
    );
    mountain.position.set(
      Math.cos(angle) * dist,
      h / 2 - 6,
      Math.sin(angle) * dist,
    );
    mountain.rotation.y = rng() * 6;
    environment.add(mountain);
  }
  // A few sunlit clouds above the distant ridge.
  const clouds = new THREE.Group();
  for (let i = 0; i < 14; i++) {
    const cloud = new THREE.Mesh(
      new THREE.SphereGeometry(1, 8, 5),
      new THREE.MeshBasicMaterial({
        color: "#e2e5d5",
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
      }),
    );
    cloud.position.set(
      (rng() - 0.5) * 500,
      90 + rng() * 45,
      -200 + rng() * 180,
    );
    cloud.scale.set(18 + rng() * 30, 2 + rng() * 4, 8 + rng() * 12);
    clouds.add(cloud);
  }
  environment.add(clouds);
}
function addDistrictNature(rx, rz) {
  const rng = random(world.seed + ":forest:" + rx + "," + rz);
  const trees = new THREE.InstancedMesh(
    new THREE.ConeGeometry(1, 1, 7),
    new THREE.MeshStandardMaterial({ color: "#476653", roughness: 1 }),
    240,
  );
  let count = 0;
  for (let i = 0; i < 120; i++) {
    const x = rx * 240 + (rng() - 0.5) * 240,
      z = rz * 240 + (rng() - 0.5) * 240;
    if (Math.abs(x) < 215 && Math.abs(z) < 200) continue;
    if (
      world.structures.some(
        (s) =>
          x > s.bounds.minX * UNIT - 4 &&
          x < s.bounds.maxX * UNIT + 4 &&
          z > s.bounds.minZ * UNIT - 4 &&
          z < s.bounds.maxZ * UNIT + 4,
      )
    )
      continue;
    const h = 4 + rng() * 8;
    for (let layer = 0; layer < 2; layer++) {
      dummy.position.set(x, terrainHeight(x, z) + h * (0.35 + layer * 0.3), z);
      dummy.rotation.set(0, rng() * 6, 0);
      dummy.scale.set(2 - layer * 0.6, h * 0.7, 2 - layer * 0.6);
      dummy.updateMatrix();
      trees.setMatrixAt(count++, dummy.matrix);
    }
  }
  trees.count = count;
  trees.castShadow = true;
  trees.receiveShadow = true;
  environment.add(trees);
}
function rebuildColumn(k) {
  const old = columns.get(k);
  if (old) for (const c of old) physics.removeCollider(c, true);
  const ids = columnIds.get(k) || [];
  const live = ids
      .map((id) => world.blocks[id])
      .filter((b) => b.alive)
      .sort((a, b) => a.y - b.y),
    colliders = [];
  let i = 0;
  while (i < live.length) {
    const first = live[i];
    let end = first.y;
    while (i + 1 < live.length && live[i + 1].y === end + 1) {
      i++;
      end = live[i].y;
    }
    const h = (end - first.y + 1) * UNIT;
    colliders.push(
      physics.createCollider(
        RAPIER.ColliderDesc.cuboid(UNIT / 2, h / 2, UNIT / 2)
          .setTranslation(
            first.x * UNIT,
            ((first.y + end) * UNIT) / 2,
            first.z * UNIT,
          )
          .setFriction(0.7),
      ),
    );
    i++;
  }
  columns.set(k, colliders);
}
function rebuildField() {
  staticMesh?.dispose();
  staticMesh = new BlockField(scene, world.blocks, materials, position);
  for (const list of columns.values())
    for (const c of list) physics.removeCollider(c, true);
  columns = new Map();
  columnIds = new Map();
  for (const b of world.blocks) {
    if (
      Math.abs(b.x * UNIT - position.x) > 140 ||
      Math.abs(b.z * UNIT - position.z) > 140
    )
      continue;
    const k = `${b.x},${b.z}`;
    if (!columnIds.has(k)) columnIds.set(k, []);
    columnIds.get(k).push(b.id);
  }
  for (const k of columnIds.keys()) rebuildColumn(k);
  streamCenter.copy(position);
}
function buildWorld(
  seed,
  removed = [],
  initialScore = 0,
  terrainRemoved = [],
  regions = ["0,0"],
) {
  worldVersion++;
  terrainRenderer?.dispose();
  staticMesh?.dispose();
  staticMesh = null;
  if (physics) physics.free();
  physics = new RAPIER.World({ x: 0, y: -settings.gravity, z: 0 });
  physics.numSolverIterations = 8;
  world = generateWorld(seed);
  for (const r of regions)
    if (r !== "0,0") ensureRegion(world, ...r.split(",").map(Number));
  applyRemoved(world, removed);
  world.terrain.apply(terrainRemoved);
  world.score = initialScore;
  score = initialScore;
  debris = [];
  gravityWells = [];
  debrisMesh.count = 0;
  for (const c of charges) scene.remove(c.mesh);
  charges = [];
  for (const e of [...effects, ...projectiles]) {
    scene.remove(e.mesh);
    e.mesh.geometry.dispose();
    e.mesh.material.dispose();
  }
  effects = [];
  projectiles = [];
  columns = new Map();
  columnIds = new Map();
  position.set(0, world.terrain.surface(0, 34) + 1.7, 34);
  yaw = 0;
  pitch = 0.02;
  vy = 0;
  cool = 0;
  remaining = 180;
  finished = false;
  nearest = world.structures[0];
  rebuildField();
  terrainRenderer = new TerrainRenderer(
    scene,
    world.terrain,
    physics,
    materials,
  );
  terrainRenderer.stream(position, true);
  buildEnvironment(seed);
  for (const region of world.regions)
    if (region !== "0,0") addDistrictNature(...region.split(",").map(Number));
  $("seed").value = seed;
  $("seedLabel").textContent = seed;
  $("score").textContent = score.toLocaleString();
  refreshMap();
  updateHUD();
}
function refreshMap() {
  $("worldSummary").textContent =
    `${world.structures.filter((s) => s.type !== "Crystal grotto").length} landmarks · ${(world.blocks.length / 1000).toFixed(0)}k masonry voxels · expanding world`;
  $("mapLocations").innerHTML = "";
  for (const st of world.structures.filter(
    (s) => s.type !== "Crystal grotto",
  )) {
    const b = document.createElement("button");
    b.innerHTML = `${st.name}<span>${st.type} / ${st.initial.toLocaleString()} blocks</span>`;
    b.onclick = () => {
      position.set(
        st.x,
        Math.max(
          st.baseY * UNIT + 2,
          world.terrain.surface(st.x, st.z + 24) + 1.7,
        ),
        st.z + 24,
      );
      fly = true;
      vy = 0;
      yaw = 0;
      pitch = 0;
      terrainRenderer.stream(position, true);
      rebuildField();
      $("map").hidden = true;
      resume();
      toast(`Arrived at ${st.name} · F to land`);
    };
    $("mapLocations").append(b);
  }
  const r = world.terrain.caveRegion(
    Math.floor(position.x / 96),
    Math.floor(position.z / 96),
  );
  const b = document.createElement("button");
  b.innerHTML =
    "Crystal caverns<span>Explore the entrance / mine luminous ore</span>";
  b.onclick = () => {
    position.set(r.entrance.x, r.entrance.y + 2, r.entrance.z);
    fly = true;
    vy = 0;
    terrainRenderer.stream(position, true);
    $("map").hidden = true;
    resume();
    toast("Follow the descending tunnel · F toggles flight");
  };
  $("mapLocations").append(b);
}
function expandRegion(rx, rz) {
  const added = ensureRegion(world, rx, rz);
  if (!added.length) return;
  // Existing chunks remain intact; new foundations are beyond the fog.
  terrainRenderer.center = "";
  terrainRenderer.stream(position);
  rebuildField();
  refreshMap();

  addDistrictNature(rx, rz);
  toast("New district discovered · " + added.length + " landmarks");
}
function fracture(ids, point, force, collapse = false) {
  const buckets = new Map();
  if (collapse) {
    const remaining = new Set(ids),
      lookup = new Map(
        ids.map((id) => {
          const b = world.blocks[id];
          return [key(b.x, b.y, b.z), id];
        }),
      );
    let group = 0;
    while (remaining.size) {
      const first = remaining.values().next().value,
        queue = [first],
        blocks = [];
      remaining.delete(first);
      for (let i = 0; i < queue.length; i++) {
        const b = world.blocks[queue[i]];
        blocks.push(b);
        if (queue.length >= 360) continue;
        for (const [dX, dY, dZ] of [
          [1, 0, 0],
          [-1, 0, 0],
          [0, 1, 0],
          [0, -1, 0],
          [0, 0, 1],
          [0, 0, -1],
        ]) {
          const id = lookup.get(key(b.x + dX, b.y + dY, b.z + dZ));
          if (remaining.has(id)) {
            remaining.delete(id);
            queue.push(id);
            if (queue.length >= 360) break;
          }
        }
      }
      buckets.set(group++, blocks);
    }
  } else
    for (const id of ids) {
      const b = world.blocks[id],
        k = `${Math.floor(b.x / 2)},${Math.floor(b.y / 2)},${Math.floor(b.z / 2)}`;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(b);
    }
  const limit =
    quality === "low" ? Math.min(100, settings.debris) : settings.debris;
  let added = 0;
  for (const blocks of buckets.values()) {
    if (added++ >= limit) break;
    while (debris.length >= limit) {
      const old = debris.shift();
      physics.removeRigidBody(old.body);
    }
    const center = new THREE.Vector3();
    for (const b of blocks)
      center.add(new THREE.Vector3(b.x * UNIT, b.y * UNIT, b.z * UNIT));
    center.divideScalar(blocks.length);
    const delta = center.clone().sub(point),
      distance = Math.max(0.7, delta.length());
    delta.normalize();
    const power = collapse
      ? 0.12
      : Math.abs(force) * (0.5 + Math.random() * 0.5);
    if (force < 0) delta.negate();
    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setLinvel(
          delta.x * power,
          collapse ? 0 : delta.y * power + Math.abs(force) * 0.28,
          delta.z * power,
        )
        .setAngvel({
          x: (Math.random() - 0.5) * (collapse ? 0.16 : 5),
          y: (Math.random() - 0.5) * (collapse ? 0.16 : 5),
          z: (Math.random() - 0.5) * (collapse ? 0.16 : 5),
        })
        .setLinearDamping(0.14)
        .setAngularDamping(0.25)
        .setCcdEnabled(true),
    );
    // Compound boxes preserve holes and ledges instead of one oversized bounding box.
    for (const b of colliderBoxes(blocks))
      physics.createCollider(
        RAPIER.ColliderDesc.cuboid(
          UNIT * b.nx * 0.495,
          UNIT * b.ny * 0.495,
          UNIT * b.nz * 0.495,
        )
          .setTranslation(
            b.x * UNIT - center.x,
            b.y * UNIT - center.y,
            b.z * UNIT - center.z,
          )
          .setDensity(
            b.material === "wood" ? 0.4 : b.material === "metal" ? 2.5 : 1.3,
          )
          .setRestitution(0.13)
          .setFriction(0.75),
        body,
      );
    debris.push({
      body,
      age: 0,
      lastVY: 0,
      fractured: !collapse,
      blocks: blocks.map((b) => ({
        offset: new THREE.Vector3(
          b.x * UNIT - center.x,
          b.y * UNIT - center.y,
          b.z * UNIT - center.z,
        ),
        color: setBlockColor(b).clone(),
        material: b.material,
      })),
    });
  }
}
let impactFractures = 0;
function splitImpact(d) {
  const i = debris.indexOf(d);
  if (i < 0) return;
  const p = d.body.translation(),
    q = d.body.rotation(),
    v = d.body.linvel(),
    rotation = new THREE.Quaternion(q.x, q.y, q.z, q.w);
  const pieces = d.blocks.map((b) => ({
    ...b,
    pos: b.offset
      .clone()
      .applyQuaternion(rotation)
      .add(new THREE.Vector3(p.x, p.y, p.z)),
  }));
  physics.removeRigidBody(d.body);
  debris.splice(i, 1);
  impactFractures++;
  for (let i = 0; i < pieces.length; i += 8) {
    while (debris.length >= settings.debris) {
      const old = debris.shift();
      physics.removeRigidBody(old.body);
    }
    const blocks = pieces.slice(i, i + 8),
      center = new THREE.Vector3();
    blocks.forEach((b) => center.add(b.pos));
    center.divideScalar(blocks.length);
    const body = physics.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(center.x, center.y, center.z)
        .setLinvel(
          v.x + (Math.random() - 0.5) * 2,
          Math.max(1, v.y),
          v.z + (Math.random() - 0.5) * 2,
        )
        .setAngularDamping(0.3)
        .setCcdEnabled(true),
    );
    for (const b of blocks)
      physics.createCollider(
        RAPIER.ColliderDesc.cuboid(0.35, 0.35, 0.35)
          .setTranslation(
            b.pos.x - center.x,
            b.pos.y - center.y,
            b.pos.z - center.z,
          )
          .setFriction(0.85)
          .setRestitution(0.1),
        body,
      );
    debris.push({
      body,
      age: 0,
      lastVY: 0,
      fractured: true,
      blocks: blocks.map((b) => ({
        offset: b.pos.clone().sub(center),
        color: b.color,
        material: b.material,
      })),
    });
  }
}
function burst(point, wi, radius = WEAPONS[wi].radius * settings.radius) {
  const w = WEAPONS[wi],
    gravity = wi === 2;
  if (gravity)
    gravityWells.push({
      point: point.clone().add(new THREE.Vector3(0, 3, 0)),
      age: 0,
    });
  if (wi === 8 || wi === 11) {
    for (let i = 0; i < 4; i++) {
      const fire = new THREE.Mesh(
        new THREE.IcosahedronGeometry(1, 2),
        new THREE.MeshBasicMaterial({
          color:
            wi === 8
              ? [0xffedb0, 0xffad45, 0xf36327, 0x85453b][i]
              : [0xffffff, 0xdca7ff, 0x999aff, 0x6d65ad][i],
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
        }),
      );
      fire.position.copy(point).add(new THREE.Vector3(0, i * 2, 0));
      scene.add(fire);
      effects.push({
        mesh: fire,
        age: 0,
        life: 1.6 + i * 0.35,
        kind: "core",
        radius: radius * (1 - i * 0.15),
      });
    }
  }
  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(0.7, 1),
    new THREE.MeshBasicMaterial({
      color: w.color,
      transparent: true,
      opacity: 1,
      depthWrite: false,
    }),
  );
  core.position.copy(point);
  scene.add(core);
  effects.push({
    mesh: core,
    age: 0,
    life: gravity ? 1.5 : 0.5,
    kind: "core",
    radius,
  });
  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(1, 0.025, 6, 64),
    new THREE.MeshBasicMaterial({
      color: w.color,
      transparent: true,
      opacity: 0.8,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.position.copy(point);
  scene.add(ring);
  effects.push({
    mesh: ring,
    age: 0,
    life: 0.75,
    kind: "ring",
    radius: radius * 2,
  });
  for (let i = 0; i < 12; i++) {
    const dust = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.5 + Math.random(), 0),
      new THREE.MeshBasicMaterial({
        color: gravity ? "#838ca5" : "#c3b69c",
        transparent: true,
        opacity: 0.32,
        depthWrite: false,
      }),
    );
    dust.position.copy(point);
    scene.add(dust);
    effects.push({
      mesh: dust,
      age: 0,
      life: 2 + Math.random(),
      kind: "dust",
      velocity: new THREE.Vector3(
        (Math.random() - 0.5) * 8,
        2 + Math.random() * 5,
        (Math.random() - 0.5) * 8,
      ),
    });
  }
  const dist = position.distanceTo(point);
  shake = Math.min(0.6, 20 / (dist + 10));
  sound(wi, Math.max(0.08, 1 - dist / 140));
}
function showDestruction(
  point,
  wi,
  result,
  newScore,
  blastRadius = WEAPONS[wi].radius * settings.radius,
  blastForce = WEAPONS[wi].force * settings.force,
) {
  world.crystals = result.crystalsTotal ?? world.crystals;
  world.terrain.apply(result.terrain || []);
  terrainRenderer.update(result.terrain || []);
  if (result.crystals) toast(`Mined ${result.crystals} crystal deposits`);
  const all = [...result.hit, ...result.fallen];
  applyRemoved(world, all);
  const changed = new Set();
  for (const id of all) {
    staticMesh.setMatrixAt(id, zero);
    const b = world.blocks[id];
    changed.add(`${b.x},${b.z}`);
  }
  staticMesh.instanceMatrix.needsUpdate = true;
  for (const k of changed) rebuildColumn(k);
  // Remote blasts also need terrain contacts until their debris settles.
  terrainRenderer.addPhysicsFocus(point);
  fracture(result.hit, point, blastForce);
  fracture(result.fallen, point, blastForce, true);
  burst(point, wi, blastRadius);
  for (const d of debris) {
    const p = d.body.translation(),
      delta = new THREE.Vector3(p.x - point.x, p.y - point.y, p.z - point.z),
      dist = delta.length();
    if (dist < blastRadius * 2 && dist > 0.1) {
      delta
        .normalize()
        .multiplyScalar(
          Math.pow(d.blocks.length, 2 / 3) *
            blastForce *
            0.16 *
            (1 - dist / (blastRadius * 2)),
        );
      d.body.applyImpulse(delta, true);
    }
  }
  score = newScore;
  world.score = score;
  if (result.points) {
    $("combo").textContent =
      result.fallen.length > 30
        ? `STRUCTURAL COLLAPSE  +${result.points.toLocaleString()}`
        : `+${result.points.toLocaleString()}`;
    comboTime = 2.2;
  }
  updateHUD();
}
function detonate(point, wi) {
  if (socket?.readyState === 1) {
    socket.send(JSON.stringify({ type: "blast", point, weapon: wi, settings }));
    return;
  }
  executeShot(point, wi);
}
function executeShot(point, wi) {
  for (const event of resolveShot(world, point, wi, settings))
    showDestruction(
      new THREE.Vector3(event.point.x, event.point.y, event.point.z),
      wi,
      event.result,
      event.score,
      event.radius,
      event.force,
    );
}
function addCharge(point, id = crypto.randomUUID(), owner = netId) {
  const mesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.6, 0.35, 0.4),
    new THREE.MeshStandardMaterial({
      color: "#393c35",
      emissive: "#c94e18",
      emissiveIntensity: 0.7,
    }),
  );
  mesh.position.set(point.x, point.y + 0.16, point.z);
  scene.add(mesh);
  charges.push({
    id,
    owner,
    point: { x: point.x, y: point.y, z: point.z },
    mesh,
  });
  toast(`${charges.length} charges armed · X detonates all`);
}
function detonateCharges() {
  if (socket?.readyState === 1) {
    socket.send(JSON.stringify({ type: "detonate", settings }));
    return;
  }
  const pending = [...charges];
  for (const c of pending) {
    scene.remove(c.mesh);
    c.mesh.geometry.dispose();
    c.mesh.material.dispose();
  }
  charges = [];
  for (const c of pending) executeShot(c.point, 7);
  if (!pending.length)
    toast("Select charge tool [8], aim at a surface, and click to place");
}
let shotDebug = null;
function fire() {
  shotDebug = { playing, cool, finished, weapon };
  if (!playing || cool > 0 || finished) return;
  const wi = weapon,
    w = WEAPONS[wi];
  camera.position.copy(position);
  camera.rotation.set(pitch, yaw, 0);
  camera.updateMatrixWorld();
  camera.getWorldDirection(dir);
  const hit = raycast(world, camera.position, dir, 350);
  shotDebug.hit = hit;
  if (!hit) {
    toast("Aim at a structure or the ground");
    return;
  }
  cool = w.cooldown;
  weaponView.fire();
  const target = new THREE.Vector3(hit.x, hit.y, hit.z);
  if (wi === 7) {
    if (charges.length >= 40) {
      toast("Forty charges armed. Detonate them before placing more.");
      return;
    }
    if (socket?.readyState === 1)
      socket.send(JSON.stringify({ type: "charge", point: target }));
    else addCharge(target);
    return;
  }
  if (wi === 3) target.y -= 3;
  if (wi === 9) {
    const beam = new THREE.Mesh(
      new THREE.CylinderGeometry(0.5, 0.5, 100, 12),
      new THREE.MeshBasicMaterial({
        color: 0x9eefff,
        transparent: true,
        opacity: 0.8,
      }),
    );
    beam.position.copy(target).add(new THREE.Vector3(0, 35, 0));
    scene.add(beam);
    effects.push({ mesh: beam, age: 0, life: 1.2, kind: "beam" });
  }

  const mesh = new THREE.Mesh(
    wi === 5
      ? new THREE.IcosahedronGeometry(1.2, 1)
      : new THREE.SphereGeometry(0.14, 6, 6),
    new THREE.MeshBasicMaterial({ color: w.color }),
  );
  const start =
    wi === 5
      ? target.clone().add(new THREE.Vector3(-20, 65, -10))
      : camera.position.clone().addScaledVector(dir, 1.2);
  mesh.position.copy(start);
  scene.add(mesh);
  projectiles.push({
    mesh,
    start,
    target,
    weapon: wi,
    age: 0,
    life:
      wi === 4 || wi === 6 || wi === 9
        ? 0.025
        : wi === 5
          ? 1.25
          : Math.max(0.08, start.distanceTo(target) / 75),
  });
  if (wi === 4 || wi === 6) {
    const line = new THREE.Mesh(
      new THREE.CylinderGeometry(0.035, 0.035, start.distanceTo(target), 6),
      new THREE.MeshBasicMaterial({
        color: w.color,
        transparent: true,
        opacity: 0.8,
      }),
    );
    line.position.copy(start).add(target).multiplyScalar(0.5);
    line.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      target.clone().sub(start).normalize(),
    );
    scene.add(line);
    effects.push({ mesh: line, age: 0, life: 0.13, kind: "beam" });
  }
}
function sound(wi, volume = 1) {
  if (!$("sound").checked || !audio) return;
  const time = audio.currentTime,
    buffer = audio.createBuffer(1, audio.sampleRate * 0.6, audio.sampleRate),
    data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++)
    data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = audio.createBufferSource();
  noise.buffer = buffer;
  const low = audio.createBiquadFilter();
  low.type = "lowpass";
  low.frequency.setValueAtTime(wi === 4 ? 2200 : 700, time);
  low.frequency.exponentialRampToValueAtTime(80, time + 0.5);
  const gain = audio.createGain();
  gain.gain.setValueAtTime(0.3 * volume, time);
  gain.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
  noise.connect(low).connect(gain).connect(audio.destination);
  noise.start();
  const osc = audio.createOscillator(),
    g = audio.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(wi === 2 ? 180 : 90, time);
  osc.frequency.exponentialRampToValueAtTime(22, time + 0.6);
  g.gain.setValueAtTime(0.35 * volume, time);
  g.gain.exponentialRampToValueAtTime(0.001, time + 0.6);
  osc.connect(g).connect(audio.destination);
  osc.start();
  osc.stop(time + 0.6);
}
function toast(text) {
  $("toast").textContent = text;
  $("toast").style.opacity = 1;
  toastTime = 3;
}
const icons = {
  rocket: "M6 18 17 7m-7 1 7-3 2 2-3 7M5 13l-2 5 5-2m3 1 4 2 2-5M3 21l4-4",
  scatter: "M12 3v5m-7 2 4 3m10-3-4 3M7 21l3-6m7 6-3-6",
  gravity: "M20 12a8 8 0 1 1-8-8m0 0 4 2-4 2m0 1a3 3 0 1 0 3 3",
  pulse: "M2 12h4l3-8 5 16 3-8h5",
  beam: "M3 21 16 8m-6 0h6v6M18 2v3m4 3h-3",
  meteor: "M3 4l7 7M8 2l6 7M2 9l6 6m12-3a6 6 0 1 1-8 8 6 6 0 0 1 8-8Z",
};
for (const [i, w] of WEAPONS.entries()) {
  const b = document.createElement("button");
  b.title = `${w.key} — ${w.name}`;
  b.setAttribute("aria-label", w.name);
  b.innerHTML = `<small>${w.key}</small><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="${icons[w.icon]}"/></svg><span>${w.short}</span>`;
  b.onclick = () => selectWeapon(i);
  $("arsenal").append(b);
}
function selectWeapon(i) {
  weapon = i;
  weaponView.select(i, WEAPONS[i].color);
  [...$("arsenal").children].forEach((b, j) =>
    b.classList.toggle("active", i === j),
  );
  $("toolName").textContent = WEAPONS[i].name;
  $("toolDetail").textContent = WEAPONS[i].detail;
  document.documentElement.style.setProperty(
    "--tool-color",
    "#" + WEAPONS[i].color.toString(16),
  );
}
function updateHUD() {
  if (!world) return;
  $("armedCount").textContent = `${charges.length} charges · X detonate`;
  $("crystalCount").textContent = `${world.crystals || 0} crystals`;
  $("score").textContent = score.toLocaleString();
  if (!nearest) nearest = world.structures[0];
  const dead = nearest.ids.reduce((n, id) => n + !world.blocks[id].alive, 0),
    percent = Math.floor((dead / nearest.initial) * 100);
  $("locationName").textContent = nearest.name;
  $("locationType").textContent = nearest.type + " / The highlands";
  $("objectiveName").textContent = nearest.name;
  $("objectiveLabel").textContent =
    percent >= 75 ? "Landmark dismantled" : "Dismantle this landmark";
  $("objectiveProgress").textContent = `${percent}% dismantled`;
  $("progress").style.width = percent + "%";
  $("movement").textContent =
    (fly ? "Flight mode" : "On foot") + (slow ? " / Slow motion" : "");
}
function pause() {
  if (!started) return;
  playing = false;
  mouseDown = false;
  keys.clear();
  document.exitPointerLock?.();
  $("menu").hidden = false;
  $("hud").hidden = true;
  document.body.classList.remove("playing");
  $("playLabel").textContent = "Back to the beautiful chaos";
}
function resume() {
  if (!ready) return;
  playing = true;
  started = true;
  mouseDown = false;
  $("menu").hidden = true;
  $("hud").hidden = false;
  $("results").hidden = true;
  document.body.classList.add("playing");
  if (!audio) {
    try {
      audio = new AudioContext();
    } catch {}
  }
  audio?.resume();
  try {
    const p = canvas.requestPointerLock?.();
    p?.catch(() =>
      toast("Drag to look; click to fire. Press Esc for the menu."),
    );
  } catch {
    toast("Drag to look; click to fire.");
  }
}
function finish() {
  finished = true;
  playing = false;
  mouseDown = false;
  document.exitPointerLock?.();
  $("results").hidden = false;
  $("finalScore").textContent = score.toLocaleString();
  $("finalDetail").textContent =
    `${world.removed.toLocaleString()} blocks dismantled in 3 minutes.`;
}
function openMap() {
  if (!started) return;
  playing = false;
  mouseDown = false;
  keys.clear();
  document.exitPointerLock?.();
  $("map").hidden = false;
}
function disconnect() {
  if (socket) {
    socket.onclose = null;
    socket.close();
    socket = null;
  }
  netId = null;
  hostId = null;
  clearRemote();
}
function bindSocket(transport) {
  socket = transport;
  transport.onmessage = ({ data }) => {
    const m = JSON.parse(data);
    if (m.type === "welcome") {
      netId = m.id;
      hostId = m.host;
      weaponView.setSuit(m.players.find((p) => p.id === netId)?.avatar ?? 0);
      roomCode = m.room;
      settings = sanitizeSettings(m.settings);
      syncSettingsUI();
      mode = "sandbox";
      document.querySelector("[data-mode=challenge]").disabled = true;
      document.querySelector("[data-mode=sandbox]").click();
      clearRemote();
      buildWorld(m.seed, m.removed, m.score, m.terrainRemoved, m.regions);
      world.crystals = m.crystals || 0;
      for (const p of m.players) if (p.id !== netId) addRemote(p);
      for (const c of m.charges || []) addCharge(c.point, c.id, c.owner);
      $("connection").innerHTML =
        "<i></i> " +
        (transport instanceof PeerRoom ? "Direct peer / " : "LAN / ") +
        roomCode;
      $("join").textContent = "Connected";
      $("leave").hidden = false;
      toast("Connected · shared terrain, structures, and charges");
    }
    if (m.type === "player") addRemote(m);
    if (m.type === "move") {
      const p = remote.get(m.id);
      if (p) {
        p.target.set(m.position.x, m.position.y - 1, m.position.z);
        p.mesh.rotation.y = m.yaw;
        if (Number.isInteger(m.weapon) && WEAPONS[m.weapon])
          p.weapon = m.weapon;
      }
    }
    if (m.type === "leave") {
      const p = remote.get(m.id);
      if (p) {
        scene.remove(p.mesh);
        disposeModel(p.mesh);
        remote.delete(m.id);
      }
    }
    if (m.type === "host") {
      hostId = m.id;
      syncSettingsUI();
    }
    if (m.type === "blast")
      showDestruction(
        new THREE.Vector3(m.point.x, m.point.y, m.point.z),
        m.weapon,
        m.result,
        m.score,
        m.radius,
        m.force,
      );
    if (m.type === "charge") addCharge(m.point, m.id, m.owner);
    if (m.type === "charges-cleared") {
      for (const c of charges.filter((c) => m.ids.includes(c.id))) {
        scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        c.mesh.material.dispose();
      }
      charges = charges.filter((c) => !m.ids.includes(c.id));
    }
    if (m.type === "expand") expandRegion(m.rx, m.rz);
    if (m.type === "settings") {
      settings = sanitizeSettings(m.settings);
      physics.gravity.y = -settings.gravity;
      syncSettingsUI();
    }
    if (m.type === "reset") {
      buildWorld(m.seed);
      toast("The host generated a new world");
    }
  };
  transport.onclose = (e) => {
    socket = null;
    netId = null;
    hostId = null;
    clearRemote();
    document.querySelector("[data-mode=challenge]").disabled = false;
    $("connection").innerHTML = "<i></i> Solo expedition";
    $("join").textContent = "Join LAN room";
    $("join").disabled = false;
    $("leave").hidden = true;
    $("lanInfo").textContent =
      e.reason || "Disconnected. Continue solo or reconnect.";
    syncSettingsUI();
  };
}
function connect() {
  disconnect();
  const url = new URL(location.href);
  url.protocol = location.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/play";
  url.search = "";
  const ws = new WebSocket(url);
  bindSocket(ws);
  $("join").disabled = true;
  $("join").textContent = "Connecting…";
  ws.onopen = () =>
    ws.send(
      JSON.stringify({
        type: "join",
        name: $("name").value,
        room: $("room").value,
        seed: $("seed").value,
      }),
    );
  ws.onerror = () => {
    $("lanInfo").textContent =
      "No Node LAN server here. Use Direct peer connection below on GitHub Pages.";
  };
}
function syncSettingsUI() {
  for (const name of ["radius", "force", "debris", "gravity"]) {
    const input = $("setting-" + name);
    if (!input) continue;
    input.value = settings[name];
    input.disabled = !!netId && netId !== hostId;
    $("value-" + name).textContent =
      settings[name] + (["radius", "force"].includes(name) ? "×" : "");
  }
}
for (const name of ["radius", "force", "debris", "gravity"])
  $("setting-" + name).oninput = () => {
    settings = sanitizeSettings({
      ...settings,
      [name]: Number($("setting-" + name).value),
    });
    physics.gravity.y = -settings.gravity;
    syncSettingsUI();
    if (socket?.readyState === 1)
      socket.send(JSON.stringify({ type: "settings", settings }));
  };
$("flight").onchange = () => {
  fly = $("flight").checked;
  vy = 0;
};
async function peerAction(action) {
  $("peerStatus").textContent = "Preparing local connection…";
  try {
    if (action === "invite") {
      if (!(socket instanceof PeerRoom) || !socket.session) {
        disconnect();
        const peer = new PeerRoom(
          world.seed,
          $("name").value,
          (t) => ($("peerStatus").textContent = t),
        );
        bindSocket(peer);
      }
      const code = await socket.invite($("peerAddress").value.trim());
      $("peerOut").value = code;
      $("peerStatus").textContent =
        "Send this invitation to your friend. Then paste their answer below and accept it.";
    }
    if (action === "answer") {
      const invite = $("peerIn").value;
      disconnect();
      const peer = new PeerRoom(
        world.seed,
        $("name").value,
        (t) => ($("peerStatus").textContent = t),
      );
      bindSocket(peer);
      $("peerOut").value = await peer.answer(
        invite,
        $("peerAddress").value.trim(),
      );
      $("peerStatus").textContent =
        "Send this answer back to the host. Keep this page open.";
    }
    if (action === "accept") {
      if (!(socket instanceof PeerRoom))
        throw Error("Create an invitation first");
      await socket.accept($("peerIn").value);
    }
  } catch (e) {
    $("peerStatus").textContent =
      e.message + " — check the code and try again.";
  }
}
$("peerInvite").onclick = () => peerAction("invite");
$("peerAnswer").onclick = () => peerAction("answer");
$("peerAccept").onclick = () => peerAction("accept");
$("peerCopy").onclick = async () => {
  try {
    await navigator.clipboard.writeText($("peerOut").value);
    $("peerStatus").textContent = "Code copied.";
  } catch {
    $("peerOut").select();
    $("peerStatus").textContent = "Select and copy the highlighted code.";
  }
};
function addRemote(p) {
  if (remote.has(p.id)) return;
  const slot =
    Number.isInteger(p.avatar) && p.avatar >= 0 && p.avatar < 8 ? p.avatar : 0;
  const group = buildCharacter(p.name, slot);
  group.position.set(p.position.x, p.position.y - 1, p.position.z);
  group.rotation.y = p.yaw || 0;
  scene.add(group);
  remote.set(p.id, {
    mesh: group,
    target: group.position.clone(),
    name: p.name,
    avatar: slot,
    weapon: p.weapon || 0,
  });
}
function clearRemote() {
  for (const p of remote.values()) {
    scene.remove(p.mesh);
    disposeModel(p.mesh);
  }
  remote.clear();
}

async function showNetwork() {
  if (location.hostname.endsWith("github.io")) {
    $("room").hidden = true;
    $("join").hidden = true;
    document.querySelector('label[for="room"]').hidden = true;
    $("peerPanel").open = true;
    $("lanInfo").textContent =
      "Use browser-to-browser invitations below to play together on the same network.";
    return;
  }
  try {
    const r = await fetch("/api/network");
    const { addresses } = await r.json();
    $("lanInfo").textContent =
      `Same Wi-Fi → open ${addresses.join(" or ") || location.origin} → room ${roomCode || $("room").value}. Up to 8 players. The host keeps this server running.`;
  } catch {}
}
function changeSeed(seed) {
  if (socket?.readyState === WebSocket.OPEN) {
    if (netId !== hostId) {
      toast("Only the room host can generate a new world");
      $("seed").value = world.seed;
      return;
    }
    socket.send(JSON.stringify({ type: "reset", seed }));
  } else buildWorld(seed);
}
$("play").onclick = () => {
  if ($("seed").value.trim() !== world.seed)
    changeSeed($("seed").value.trim() || "AFTERGLOW");
  resume();
};
$("menuButton").onclick = () => (playing ? pause() : resume());
$("shuffle").onclick = () => {
  const names = [
    "WILDFLOWER",
    "GOLDEN-HOUR",
    "STONE-SONG",
    "MOSS-AND-FIRE",
    "AFTERGLOW",
    "WINDWARD",
  ];
  changeSeed(
    names[Math.floor(Math.random() * names.length)] +
      "-" +
      Math.floor(Math.random() * 9999),
  );
};
$("friends").onclick = () => {
  $("lan").hidden = !$("lan").hidden;
  if (!$("lan").hidden) showNetwork();
};
$("join").onclick = connect;
$("leave").onclick = () => socket?.close();
$("quality").onchange = () => {
  quality = $("quality").value;
  renderer.setPixelRatio(
    quality === "low"
      ? 1
      : quality === "high"
        ? Math.min(devicePixelRatio, 2)
        : Math.min(devicePixelRatio, 1.5),
  );
  renderer.shadowMap.enabled = quality !== "low";
};
for (const b of document.querySelectorAll("[data-mode]"))
  b.onclick = () => {
    mode = b.dataset.mode;
    document
      .querySelectorAll("[data-mode]")
      .forEach((x) => x.classList.toggle("active", x === b));
    $("modeDescription").textContent =
      mode === "sandbox"
        ? "No timer. No limits. Just you and the aftermath."
        : "Three minutes. Chain collapses. Chase a high score.";
    remaining = 180;
    finished = false;
    if (mode === "challenge" && !socket) {
      buildWorld(world.seed);
      $("playLabel").textContent = "Start demolition run";
    }
  };
$("mapButton").onclick = openMap;
$("closeMap").onclick = () => {
  $("map").hidden = true;
  resume();
};
$("again").onclick = () => {
  changeSeed("AFTERGLOW-" + Math.floor(Math.random() * 99999));
  resume();
};
$("keepPlaying").onclick = () => {
  finished = false;
  mode = "sandbox";
  resume();
};
window.addEventListener("keydown", (e) => {
  if (e.target.matches("input,select,textarea")) return;
  if (["Space", "ArrowUp", "ArrowDown", "Tab"].includes(e.code))
    e.preventDefault();
  if (e.code === "Escape") {
    if (!$("map").hidden) {
      $("map").hidden = true;
      resume();
    } else if (playing) pause();
    return;
  }
  keys.add(e.code);
  if (e.repeat) return;
  const wi = WEAPONS.findIndex((w) => w.key === e.key);
  if (wi >= 0) selectWeapon(wi);
  if (e.code === "KeyX" && playing) detonateCharges();
  if (e.code === "KeyR" && playing) {
    position.y = world.terrain.surface(position.x, position.z) + 3;
    vy = 0;
    toast("Returned to the surface");
  }
  if (e.code === "KeyF" && playing) {
    fly = !fly;
    $("flight").checked = fly;
    vy = 0;
    toast(fly ? "Flight on · Space up / C down" : "Back on foot");
  }
  if (e.code === "KeyQ" && playing) {
    slow = !slow;
    toast(slow ? "Slow motion on" : "Normal time");
  }
  if (e.code === "KeyM") openMap();
});
window.addEventListener("keyup", (e) => keys.delete(e.code));
window.addEventListener("blur", () => {
  keys.clear();
  mouseDown = false;
  if (playing) pause();
});
let hadPointerLock = false;
document.addEventListener("pointerlockchange", () => {
  const locked = document.pointerLockElement === canvas;
  if (hadPointerLock && !locked && playing) pause();
  hadPointerLock = locked;
});
let drag = false,
  lastX = 0,
  lastY = 0;
canvas.addEventListener("pointerdown", (e) => {
  if (!playing) return;
  mouseDown = e.button === 0;
  if (mouseDown) fire();
  drag = true;
  lastX = e.clientX;
  lastY = e.clientY;
});
window.addEventListener("pointerup", () => {
  mouseDown = false;
  drag = false;
});
window.addEventListener("mousemove", (e) => {
  if (!playing) return;
  if (document.pointerLockElement === canvas || drag) {
    const dx = document.pointerLockElement ? e.movementX : e.clientX - lastX,
      dy = document.pointerLockElement ? e.movementY : e.clientY - lastY;
    yaw -= dx * 0.0022;
    pitch = Math.max(-1.5, Math.min(1.5, pitch - dy * 0.0022));
    lastX = e.clientX;
    lastY = e.clientY;
  }
});
canvas.addEventListener("contextmenu", (e) => e.preventDefault());
canvas.addEventListener(
  "wheel",
  (e) => {
    if (playing)
      selectWeapon(
        (weapon + (e.deltaY > 0 ? 1 : WEAPONS.length - 1)) % WEAPONS.length,
      );
  },
  { passive: true },
);
window.addEventListener("resize", () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
function blocked(x, y, z) {
  for (const dx of [-0.23, 0.23])
    for (const dz of [-0.23, 0.23])
      for (const dy of [-1.55, -0.85, -0.1]) {
        if (
          world.terrain.at(x + dx, y + dy, z + dz) ||
          world.grid.has(
            key(
              Math.round((x + dx) / UNIT),
              Math.round((y + dy) / UNIT),
              Math.round((z + dz) / UNIT),
            ),
          )
        )
          return true;
      }
  return false;
}
function move(dt) {
  const f = Number(keys.has("KeyW")) - Number(keys.has("KeyS")),
    side = Number(keys.has("KeyD")) - Number(keys.has("KeyA")),
    speed =
      (keys.has("ShiftLeft") || keys.has("ShiftRight") ? 14 : 7) *
      (fly ? 2.2 : 1),
    norm = Math.max(1, Math.hypot(f, side));
  const dx = ((-Math.sin(yaw) * f + Math.cos(yaw) * side) * speed * dt) / norm,
    dz = ((-Math.cos(yaw) * f - Math.sin(yaw) * side) * speed * dt) / norm;
  if (fly) {
    position.x += dx;
    position.z += dz;
    position.y +=
      ((keys.has("Space") ? 1 : 0) -
        (keys.has("KeyC") || keys.has("ControlLeft") ? 1 : 0)) *
      speed *
      dt;
    position.y = Math.max(-45, Math.min(160, position.y));
  } else {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.2));
    for (let i = 0; i < steps; i++) {
      for (const [axis, d] of [
        ["x", dx / steps],
        ["z", dz / steps],
      ]) {
        const p = position.clone();
        p[axis] += d;
        if (!blocked(p.x, p.y, p.z)) position[axis] = p[axis];
        else if (grounded) {
          const terrainStep = [-0.23, 0.23].some((x) =>
            [-0.23, 0.23].some((z) =>
              world.terrain.at(p.x + x, p.y - 1.55, p.z + z),
            ),
          );
          const step = terrainStep ? 1.54 : 0.79;
          if (!blocked(p.x, p.y + step, p.z)) {
            position[axis] = p[axis];
            position.y += step;
          }
        }
      }
    }
    if (keys.has("Space") && grounded) {
      vy = 8;
      grounded = false;
    }
    vy -= settings.gravity * dt;
    const dy = vy * dt,
      n = Math.max(1, Math.ceil(Math.abs(dy) / 0.15));
    grounded = false;
    for (let i = 0; i < n; i++) {
      if (!blocked(position.x, position.y + dy / n, position.z))
        position.y += dy / n;
      else {
        if (vy < 0) grounded = true;
        vy = 0;
        break;
      }
    }
    if (position.y < -46) {
      position.y = -46;
      vy = 0;
      grounded = true;
    }
  }
  camera.position.copy(position);
  camera.rotation.set(pitch, yaw, 0);
  if (shake > 0 && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
    camera.position.x += (Math.random() - 0.5) * shake;
    camera.position.y += (Math.random() - 0.5) * shake;
  }
}
let previous = performance.now(),
  accumulator = 0;
function tick(now) {
  requestAnimationFrame(tick);
  const wallDt = (now - previous) / 1000,
    rawDt = Math.min(wallDt, 0.05);
  previous = now;
  elapsed += rawDt;
  fpsTime += rawDt;
  frameCount++;
  if (fpsTime > 1) {
    fps = Math.round(frameCount / fpsTime);
    $("fps").textContent = fps + " fps";
    fpsTime = 0;
    frameCount = 0;
  }
  if (!ready) return;
  terrainRenderer.stream(position);
  terrainRenderer.tick();
  if (playing && elapsed - lastRegionCheck > 1) {
    lastRegionCheck = elapsed;
    const ahead = new THREE.Vector3(0, 0, -1)
      .applyQuaternion(camera.quaternion)
      .multiplyScalar(150);
    const currentX = Math.round(position.x / 240),
      currentZ = Math.round(position.z / 240);
    const missingCurrent = !world.regions.includes(currentX + "," + currentZ);
    const rx = missingCurrent
        ? currentX
        : Math.round((position.x + ahead.x) / 240),
      rz = missingCurrent ? currentZ : Math.round((position.z + ahead.z) / 240);
    if (!world.regions.includes(rx + "," + rz)) {
      if (socket?.readyState === 1)
        socket.send(JSON.stringify({ type: "expand", rx, rz }));
      else expandRegion(rx, rz);
    }
    if (position.distanceTo(streamCenter) > 70) rebuildField();
  }
  const underground =
    position.y < world.terrain.surface(position.x, position.z) - 2;
  lantern.position.copy(position);
  lantern.intensity = underground ? 18 : 0;
  ambient.intensity += ((underground ? 0.18 : 1.8) - ambient.intensity) * 0.08;
  scene.fog.color.lerp(
    new THREE.Color(underground ? "#202b3a" : "#b6c9c4"),
    0.05,
  );
  scene.fog.near = underground ? 12 : 45;
  scene.fog.far = underground ? 65 : 105;
  const dt = rawDt * (slow ? 0.22 : 1);
  cool = Math.max(0, cool - rawDt);
  shake = Math.max(0, shake - rawDt * 1.8);
  toastTime -= rawDt;
  if (toastTime <= 0) $("toast").style.opacity = 0;
  comboTime -= rawDt;
  if (comboTime <= 0) $("combo").textContent = "";
  if (playing) {
    move(rawDt);
    if (mouseDown) fire();
    if (mode === "challenge" && !finished) {
      remaining -= wallDt;
      if (remaining <= 0) finish();
    }
    $("timer").textContent =
      mode === "challenge"
        ? `${Math.floor(Math.max(0, remaining) / 60)}:${String(Math.floor(Math.max(0, remaining) % 60)).padStart(2, "0")} remaining`
        : "Take your time.";
    $("cooldown").style.transform =
      `scaleX(${1 - cool / WEAPONS[weapon].cooldown})`;
  } else if (!started) {
    const a = Math.sin(elapsed * 0.025) * 0.1;
    camera.position.set(40 + Math.sin(a) * 10, 24, 51);
    camera.lookAt(-9, 7, 0);
  }
  // Physics continues in connected rooms; local menus pause the action.
  if (playing || socket) {
    for (let i = gravityWells.length - 1; i >= 0; i--) {
      const well = gravityWells[i];
      well.age += dt;
      for (const d of debris) {
        const p = d.body.translation(),
          delta = new THREE.Vector3(
            well.point.x - p.x,
            well.point.y - p.y,
            well.point.z - p.z,
          ),
          distance = delta.length();
        if (distance < 15 && distance > 0.4) {
          delta
            .normalize()
            .multiplyScalar(d.body.mass() * dt * (well.age < 1.7 ? 32 : -45));
          d.body.applyImpulse(delta, true);
        }
      }
      if (well.age > 2) gravityWells.splice(i, 1);
    }
    accumulator += dt;
    let steps = 0;
    while (accumulator >= 1 / 60 && steps < 3) {
      physics.timestep = 1 / 60;
      physics.step();
      accumulator -= 1 / 60;
      steps++;
    }
    if (steps === 3) accumulator = 0;
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.age += dt;
      p.mesh.position.lerpVectors(
        p.start,
        p.target,
        Math.min(1, p.age / p.life),
      );
      if (p.age >= p.life) {
        detonate(p.target, p.weapon);
        scene.remove(p.mesh);
        p.mesh.geometry.dispose();
        p.mesh.material.dispose();
        projectiles.splice(i, 1);
      }
    }
  }
  let count = 0;
  const impacts = [];
  for (let i = debris.length - 1; i >= 0; i--) {
    const d = debris[i];
    d.age += playing || socket ? dt : 0;
    if (d.age > 24) {
      physics.removeRigidBody(d.body);
      debris.splice(i, 1);
      continue;
    }
    const velocity = d.body.linvel();
    if (
      !d.fractured &&
      d.age > 0.4 &&
      d.blocks.length > 12 &&
      d.lastVY < -5 &&
      velocity.y > d.lastVY + 4
    )
      impacts.push(d);
    d.lastVY = velocity.y;
    const p = d.body.translation(),
      q = d.body.rotation();
    const quat = new THREE.Quaternion(q.x, q.y, q.z, q.w);
    const scale = d.age > 21 ? Math.max(0, (24 - d.age) / 3) : 1;
    for (const b of d.blocks) {
      if (count >= 12000) break;
      dummy.position
        .copy(b.offset)
        .applyQuaternion(quat)
        .add(v3.set(p.x, p.y, p.z));
      dummy.quaternion.copy(quat);
      dummy.scale.setScalar(scale);
      dummy.updateMatrix();
      debrisMesh.setMatrixAt(count, dummy.matrix);
      debrisMesh.setColorAt(count, b.color);
      count++;
    }
  }
  for (const d of impacts.slice(0, 2)) splitImpact(d);
  debrisMesh.count = count;
  if (count) {
    debrisMesh.instanceMatrix.needsUpdate = true;
    debrisMesh.instanceColor.needsUpdate = true;
  }
  for (let i = effects.length - 1; i >= 0; i--) {
    const e = effects[i];
    e.age += dt;
    const t = e.age / e.life;
    if (t >= 1) {
      scene.remove(e.mesh);
      e.mesh.geometry.dispose();
      e.mesh.material.dispose();
      effects.splice(i, 1);
      continue;
    }
    e.mesh.material.opacity = (1 - t) * (e.kind === "dust" ? 0.28 : 0.85);
    if (e.kind === "ring") e.mesh.scale.setScalar(1 + t * e.radius);
    if (e.kind === "core")
      e.mesh.scale.setScalar(1 + Math.sin(t * Math.PI) * e.radius * 0.4);
    if (e.kind === "dust") {
      e.mesh.position.addScaledVector(e.velocity, dt);
      e.mesh.scale.setScalar(1 + t * 4);
    }
  }
  for (const p of remote.values()) {
    const moving = p.mesh.position.distanceToSquared(p.target) > 0.0004;
    p.mesh.position.lerp(p.target, Math.min(1, rawDt * 12));
    animateCharacter(p.mesh, rawDt, moving, p.weapon, WEAPONS[p.weapon].color);
  }
  if (elapsed - lastNetwork > 0.1) {
    lastNetwork = elapsed;
    if (playing) {
      nearest = world.structures
        .filter(
          (s) =>
            s.type !== "Crystal grotto" ||
            position.y < terrainHeight(position.x, position.z) - 3,
        )
        .reduce(
          (best, s) =>
            Math.hypot(s.x - position.x, s.z - position.z) <
            Math.hypot(best.x - position.x, best.z - position.z)
              ? s
              : best,
          world.structures[0],
        );
      camera.getWorldDirection(dir);
      const hit = raycast(world, camera.position, dir);
      if (hit?.id != null)
        nearest = world.structures[world.blocks[hit.id].structure];
      updateHUD();
      $("hitInfo").textContent =
        hit?.id != null
          ? `${world.blocks[hit.id].material} / ${Math.round(hit.distance)} m`
          : "";
    }
    if (socket?.readyState === WebSocket.OPEN && netId)
      socket.send(
        JSON.stringify({
          type: "move",
          position: { x: position.x, y: position.y, z: position.z },
          yaw,
          weapon,
        }),
      );
  }
  renderer.render(scene, camera);
  weaponView.render(
    renderer,
    rawDt,
    playing,
    ["KeyW", "KeyA", "KeyS", "KeyD"].some((k) => keys.has(k)),
  );
}
async function init() {
  try {
    await Promise.all([
      RAPIER.init(),
      Promise.race([
        materials.ready,
        new Promise((resolve) => setTimeout(resolve, 1800)),
      ]),
    ]);
    buildWorld(new URLSearchParams(location.search).get("seed") || "AFTERGLOW");
    materials.ready.then(() => terrainRenderer?.refreshMaterials());
    camera.position.set(40, 24, 51);
    camera.lookAt(-9, 7, 0);
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    previous = performance.now();
    ready = true;
    $("loading").hidden = true;
    $("play").disabled = false;
    $("playLabel").textContent = "Enter the playground";
    selectWeapon(0);
    requestAnimationFrame(tick);
  } catch (e) {
    console.error(e);
    $("loadingText").textContent =
      "The 3D engine could not start. Try a current Chrome or Firefox with hardware acceleration enabled.";
  }
}
// Deliberately small diagnostics surface for repeatable engine and integration verification.
window.__mindblast = {
  get state() {
    return {
      ready,
      playing,
      seed: world?.seed,
      blocks: world?.blocks.length,
      remainingBlocks: world?.grid.size,
      removed: world?.removed,
      score,
      debris: debris.length,
      renderedDebris: debrisMesh.count,
      fps,
      weapon,
      fly,
      slow,
      position: position.toArray(),
      connected: !!netId,
      players: remote.size,
      avatars: [...remote.entries()].map(([id, p]) => ({
        id,
        name: p.name,
        avatar: p.avatar,
        weapon: p.weapon,
      })),
      weaponModel: weaponView.index,
      host: !!netId && hostId === netId,
      remaining,
      mode,
      drawCalls: renderer.info.render.calls,
      terrainRemoved: world?.terrain.removed.size,
      charges: charges.length,
      settings,
      regions: world?.regions.length,
      structures: world?.structures.length,
      crystals: world?.crystals,
      cave: {
        nodes: world?.terrain.caveRegion(0, 0).nodes,
        entrance: world?.terrain.caveRegion(0, 0).entrance,
      },
      cooldown: cool,
      shotDebug,
      projectiles: projectiles.map((p) => ({
        age: p.age,
        life: p.life,
        weapon: p.weapon,
      })),
      impactFractures,
      largeFragments: debris.filter((d) => d.blocks.length > 30).length,
    };
  },
  blast(point, wi = 0) {
    detonate(new THREE.Vector3(point.x, point.y, point.z), wi);
  },
  aimAt(x, y, z) {
    const d = new THREE.Vector3(x, y, z).sub(position).normalize();
    yaw = Math.atan2(-d.x, -d.z);
    pitch = Math.asin(d.y);
  },
  teleport(x, y, z) {
    position.set(x, y, z);
    vy = 0;
  },
  placeCharge(point) {
    addCharge(point);
  },
  detonateCharges,
  get peerState() {
    return socket instanceof PeerRoom
      ? socket.connections.map((pc) => ({
          state: pc.connectionState,
          ice: pc.iceConnectionState,
          signal: pc.signalingState,
        }))
      : null;
  },
  structure(type) {
    const s = world.structures.find((s) => s.type === type);
    return s ? { x: s.x, z: s.z, baseY: s.baseY, bounds: s.bounds } : null;
  },
  setRemaining(seconds) {
    remaining = seconds;
  },
  get debrisSample() {
    return debris.slice(0, 3).map((d) => ({ ...d.body.translation() }));
  },
};
init();
