import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export const SUITS = [
  0xeab554, 0x49c5cf, 0xe77c90, 0x91bf67, 0xa58add, 0xf18e48, 0x71a8e3,
  0xe4e8dc,
];
const mat = (color, metalness = 0.15, roughness = 0.55) =>
  new THREE.MeshStandardMaterial({ color, metalness, roughness });
function box(group, size, at, material) {
  const m = new THREE.Mesh(
    new RoundedBoxGeometry(
      ...size,
      2,
      Math.min(0.018, ...size.map((n) => n * 0.15)),
    ),
    material,
  );
  m.position.set(...at);
  group.add(m);
  return m;
}
function tube(group, radius, length, at, material, segments = 16) {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(radius, radius, length, segments),
    material,
  );
  m.rotation.x = Math.PI / 2;
  m.position.set(...at);
  group.add(m);
  return m;
}
function label(text, color = "#cde5dc", width = 512) {
  const c = document.createElement("canvas");
  c.width = width;
  c.height = 96;
  const x = c.getContext("2d");
  x.fillStyle = "#13282dec";
  x.fillRect(0, 0, width, 96);
  x.fillStyle = color;
  x.fillRect(0, 0, 10, 96);
  x.font = "bold 38px sans-serif";
  x.textAlign = "center";
  x.textBaseline = "middle";
  x.fillText(text, width / 2, 50, width - 32);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export function disposeModel(group) {
  const geometries = new Set(),
    materials = new Set(),
    textures = new Set();
  group.traverse((o) => {
    if (o.geometry) geometries.add(o.geometry);
    if (o.material)
      for (const m of Array.isArray(o.material) ? o.material : [o.material])
        materials.add(m);
  });
  for (const m of materials) {
    if (m.map) textures.add(m.map);
    m.dispose();
  }
  geometries.forEach((g) => g.dispose());
  textures.forEach((t) => t.dispose());
}

export function buildWeapon(index, color = 0xf6ce83) {
  const root = new THREE.Group(),
    steel = mat(0x263c45, 0.8, 0.3),
    edge = mat(0x7f9698, 0.8, 0.28),
    dark = mat(0x122128, 0.25, 0.7),
    paint = mat(color, 0.45, 0.4),
    glow = new THREE.MeshStandardMaterial({
      color,
      emissive: color,
      emissiveIntensity: 1.8,
      roughness: 0.2,
    });
  const energy = [2, 4, 9, 11].includes(index),
    heavy = [0, 5, 8].includes(index);
  box(root, [0.25, 0.23, 0.44], [0, 0, 0.06], steel);
  box(root, [0.27, 0.07, 0.32], [0, 0.12, 0.08], paint);
  box(root, [0.12, 0.23, 0.13], [0, -0.19, 0.19], dark).rotation.x = -0.25;
  box(root, [0.18, 0.11, 0.23], [0, -0.12, -0.16], dark);
  box(root, [0.08, 0.035, 0.19], [0, 0.15, 0.1], dark);
  const sight = new THREE.Mesh(
    new THREE.TorusGeometry(0.034, 0.007, 6, 16),
    edge,
  );
  sight.position.set(0, 0.205, 0.05);
  root.add(sight);
  box(root, [0.02, 0.06, 0.025], [0, heavy ? 0.17 : 0.105, -0.5], edge);
  box(root, [0.025, 0.018, 0.025], [0, heavy ? 0.205 : 0.14, -0.5], glow);
  const barrels = index === 1 ? [-0.075, 0.075] : [0];
  for (const x of barrels) {
    tube(
      root,
      heavy ? 0.13 : 0.065,
      heavy ? 0.48 : 0.65,
      [x, 0.02, -0.38],
      steel,
    );
    tube(root, heavy ? 0.145 : 0.08, 0.075, [x, 0.02, -0.65], edge);
    tube(root, heavy ? 0.105 : 0.045, 0.08, [x, 0.02, -0.698], dark);
  }
  for (let i = 0; i < 5; i++) {
    box(root, [0.012, 0.065, 0.025], [0.131, 0.005, -0.04 + i * 0.05], edge);
    box(root, [0.17, 0.025, 0.018], [0, 0.14, -0.12 + i * 0.065], edge);
  }
  for (const x of [-0.132, 0.132])
    for (const z of [-0.1, 0.22]) {
      const bolt = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), edge);
      bolt.position.set(x, 0.06, z);
      root.add(bolt);
    }
  if (energy) {
    for (let i = 0; i < 4; i++) {
      tube(root, 0.115, 0.035, [0, 0.02, -0.25 - i * 0.09], paint);
      tube(root, 0.091, 0.025, [0, 0.02, -0.29 - i * 0.09], glow);
    }
    box(root, [0.06, 0.12, 0.2], [0.17, 0, 0.04], glow);
  }
  if (index === 6) {
    const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.32, 12), edge);
    cone.rotation.x = -Math.PI / 2;
    cone.position.set(0, 0.02, -0.74);
    root.add(cone);
    for (let i = 0; i < 5; i++)
      tube(root, 0.13 - i * 0.018, 0.025, [0, 0.02, -0.61 - i * 0.05], paint);
  }
  if (index === 3 || index === 10) {
    for (const x of [-0.19, 0.19])
      box(root, [0.075, 0.16, 0.43], [x, 0.02, -0.38], paint);
  }
  if (index === 5 || index === 8)
    tube(root, 0.17, 0.21, [0.2, -0.01, 0.08], paint);
  if (index === 7) {
    root.clear();
    box(root, [0.24, 0.12, 0.34], [0, 0, 0], steel);
    const screen = box(root, [0.18, 0.012, 0.19], [0, 0.067, -0.03], glow);
    screen.material = mat(0x6be8c7);
    tube(root, 0.012, 0.37, [-0.09, 0.04, -0.3], edge);
    box(root, [0.06, 0.035, 0.06], [0.05, 0.08, 0.12], paint);
  }
  const display = new THREE.Mesh(
    new THREE.PlaneGeometry(0.22, 0.043),
    new THREE.MeshBasicMaterial({
      map: label(`MB · ${String(index + 1).padStart(2, "0")}`, "#d8eee7"),
      toneMapped: false,
    }),
  );
  display.position.set(-0.127, 0.01, 0.08);
  display.rotation.y = -Math.PI / 2;
  root.add(display);
  if (index !== 7) {
    const names = [
      "ROCKET",
      "SCATTER",
      "GRAVITY",
      "SEISMIC",
      "BEAM",
      "METEOR",
      "DRILL",
      "CHARGE",
      "INFERNO",
      "ORBITAL",
      "FAULT",
      "NOVA",
    ];
    const badge = new THREE.Mesh(
      new THREE.PlaneGeometry(0.19, 0.055),
      new THREE.MeshBasicMaterial({
        map: label(`${String(index + 1).padStart(2, "0")} / ${names[index]}`),
        toneMapped: false,
      }),
    );
    badge.position.set(0, 0.025, 0.283);
    root.add(badge);
    box(root, [0.15, 0.014, 0.015], [0, -0.045, 0.286], glow);
  }
  root.userData.muzzle = new THREE.Vector3(0, 0.02, index === 6 ? -0.9 : -0.75);
  return root;
}

export class WeaponView {
  constructor(renderer) {
    this.scene = new THREE.Scene();
    const room = new RoomEnvironment(),
      pmrem = new THREE.PMREMGenerator(renderer);
    this.environment = pmrem.fromScene(room, 0.04);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = 0.65;
    room.dispose();
    pmrem.dispose();
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.01, 8);
    this.scene.add(new THREE.HemisphereLight(0xe7f8ff, 0x263c48, 1.3));
    const light = new THREE.DirectionalLight(0xffe5c2, 2.3);
    light.position.set(-2, 4, 2);
    this.scene.add(light);
    this.rig = new THREE.Group();
    this.scene.add(this.rig);
    this.rig.scale.setScalar(0.72);
    this.recoil = 0;
    this.time = 0;
    this.index = -1;
    this.suit = 0;
    this.select(0, 0xf6ce83);
  }
  select(index, color) {
    if (index === this.index) return;
    this.index = index;
    if (this.model) {
      this.rig.remove(this.model);
      disposeModel(this.model);
    }
    this.model = buildWeapon(index, color);
    this.rig.add(this.model);
    this.recoil = 0.13;
    if (!this.arms) {
      this.arms = new THREE.Group();
      this.rig.add(this.arms);
      this.sleeve = mat(SUITS[this.suit]);
      const glove = mat(0x21363d);
      for (const [x, z] of [
        [0.1, 0.35],
        [-0.11, -0.08],
      ]) {
        box(
          this.arms,
          [0.13, 0.14, 0.32],
          [x, -0.23, z + 0.16],
          this.sleeve,
        ).rotation.x = -0.15;
        box(this.arms, [0.14, 0.12, 0.15], [x, -0.16, z], glove);
      }
    }
  }
  setSuit(slot) {
    this.suit = slot;
    this.sleeve.color.setHex(SUITS[slot] ?? SUITS[0]);
  }
  fire() {
    this.recoil = 1;
  }
  render(renderer, dt, visible, moving) {
    if (!visible) return;
    this.time += dt;
    this.recoil = Math.max(0, this.recoil - dt * 7);
    const bob = moving ? 0.012 : 0;
    this.rig.position.set(
      0.34 + Math.sin(this.time * 8) * bob,
      -0.29 + Math.abs(Math.cos(this.time * 8)) * bob - this.recoil * 0.025,
      -0.95 + this.recoil * 0.095,
    );
    this.rig.rotation.set(
      0.16 + this.recoil * 0.08,
      0.25,
      Math.sin(this.time * 4) * 0.008,
    );
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
    const auto = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, this.camera);
    renderer.autoClear = auto;
  }
}

export function buildCharacter(name, slot) {
  const group = new THREE.Group(),
    paint = mat(SUITS[slot] ?? SUITS[0]),
    dark = mat(0x23353c),
    trim = mat(0xcddbd5, 0.55, 0.35),
    visor = mat(0x172e3d, 0.75, 0.13);
  box(group, [0.49, 0.53, 0.3], [0, 0.05, 0], paint);
  box(group, [0.36, 0.27, 0.06], [0, 0.13, -0.18], dark);
  box(group, [0.055, 0.24, 0.02], [-0.12, 0.14, -0.22], trim);
  const head = box(group, [0.37, 0.34, 0.35], [0, 0.51, 0], paint);
  box(group, [0.31, 0.14, 0.05], [0, 0.52, -0.19], visor);
  box(group, [0.38, 0.045, 0.38], [0, 0.65, -0.02], trim);
  box(group, [0.22, 0.37, 0.18], [0, 0.12, 0.23], dark);
  box(group, [0.08, 0.28, 0.19], [0.17, 0.12, 0.24], paint);
  const limbs = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Group();
    leg.position.set(side * 0.14, -0.23, 0);
    box(leg, [0.18, 0.49, 0.2], [0, -0.24, 0], dark);
    box(leg, [0.19, 0.16, 0.22], [0, -0.17, -0.025], paint);
    box(leg, [0.2, 0.13, 0.29], [0, -0.53, -0.04], dark);
    group.add(leg);
    limbs.push(leg);
    const arm = new THREE.Group();
    arm.position.set(side * 0.34, 0.25, 0);
    box(arm, [0.19, 0.18, 0.3], [0, -0.03, 0], paint);
    box(arm, [0.14, 0.37, 0.16], [0, -0.24, 0], dark);
    box(arm, [0.17, 0.12, 0.2], [0, -0.43, -0.04], trim);
    group.add(arm);
    limbs.push(arm);
  }
  // Helmet crests and shoulder tabs distinguish silhouettes as well as colors.
  for (let i = 0; i <= slot % 4; i++)
    box(
      group,
      [0.035, 0.07 + Math.floor(slot / 4) * 0.06, 0.16],
      [-0.09 + i * 0.06, 0.72, 0],
      dark,
    );
  const nameTag = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: label(
        `${slot + 1} · ${name}`,
        "#" + new THREE.Color(SUITS[slot]).getHexString(),
      ),
      depthWrite: false,
    }),
  );
  nameTag.position.set(0, 1.02, 0);
  nameTag.scale.set(2.2, 0.41, 1);
  group.add(nameTag);
  const gun = buildWeapon(0, SUITS[slot]);
  gun.scale.setScalar(0.65);
  gun.position.set(0.27, -0.04, -0.28);
  group.add(gun);
  group.traverse((o) => {
    if (o.isMesh) o.castShadow = true;
  });
  group.userData = { slot, limbs, gun, phase: 0, weapon: 0 };
  return group;
}
export function animateCharacter(group, dt, moving, weapon, color) {
  const data = group.userData;
  data.phase += dt * (moving ? 10 : 1);
  data.limbs.forEach(
    (limb, i) =>
      (limb.rotation.x = moving
        ? Math.sin(data.phase + (i === 0 || i === 3 ? 0 : Math.PI)) *
          (i % 2 ? 0.18 : 0.5)
        : 0),
  );
  if (data.weapon !== weapon) {
    group.remove(data.gun);
    disposeModel(data.gun);
    data.gun = buildWeapon(weapon, color);
    data.gun.scale.setScalar(0.65);
    data.gun.position.set(0.27, -0.04, -0.28);
    group.add(data.gun);
    data.weapon = weapon;
  }
}
