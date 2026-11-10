import * as THREE from "three";
const loader = new THREE.TextureLoader();
const url = (name) => `${import.meta.env.BASE_URL}textures/${name}`;
export function procedural(kind) {
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const ctx = c.getContext("2d");
  ctx.fillStyle = "#bfbab0";
  ctx.fillRect(0, 0, 256, 256);
  let seed = 1234;
  const rand = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) | 0;
    return (seed >>> 0) / 4294967296;
  };
  for (let i = 0; i < 16000; i++) {
    const n = 70 + Math.floor(rand() * 150);
    ctx.fillStyle = `rgba(${n},${n},${n},.2)`;
    ctx.fillRect(rand() * 256, rand() * 256, 1 + rand() * 4, 1 + rand() * 4);
  }
  if (kind === "crystal") {
    ctx.fillStyle = "#a4c3cf";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 60; i++) {
      const x = rand() * 256,
        y = rand() * 256;
      ctx.fillStyle = `rgba(${160 + rand() * 95},235,255,${0.1 + rand() * 0.35})`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 15 + rand() * 40, y - 50);
      ctx.lineTo(x + rand() * 30, y + 90);
      ctx.fill();
    }
    for (let i = 0; i < 90; i++) {
      ctx.strokeStyle = `rgba(255,255,255,${rand() * 0.45})`;
      ctx.lineWidth = 0.5;
      const x = rand() * 256,
        y = rand() * 256;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rand() * 18, y + 20 + rand() * 75);
      ctx.stroke();
    }
  } else if (kind === "rock") {
    for (let i = 0; i < 150; i++) {
      const x = rand() * 256,
        y = rand() * 256;
      ctx.strokeStyle = `rgba(45,48,42,${0.1 + rand() * 0.35})`;
      ctx.lineWidth = 0.5 + rand() * 2;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + rand() * 35, y + rand() * 10);
      ctx.lineTo(x + rand() * 55, y + rand() * 35);
      ctx.stroke();
    }
    for (let i = 0; i < 90; i++) {
      ctx.fillStyle = `rgba(66,86,36,${rand() * 0.24})`;
      ctx.beginPath();
      ctx.ellipse(
        rand() * 256,
        rand() * 256,
        rand() * 15,
        rand() * 9,
        rand() * 6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  } else if (kind === "foliage") {
    ctx.fillStyle = "#607d55";
    ctx.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 1900; i++) {
      const x = rand() * 256,
        y = rand() * 256;
      ctx.strokeStyle = rand() > 0.5 ? "#799368" : "#4a654c";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 4 + rand() * 9, y - 3 - rand() * 8);
      ctx.stroke();
    }
  } else if (kind === "wood") {
    for (let i = 0; i < 130; i++) {
      ctx.strokeStyle = `rgba(40,30,20,${rand() * 0.3})`;
      ctx.beginPath();
      ctx.moveTo(i * 2, 0);
      for (let y = 0; y < 256; y += 8)
        ctx.lineTo(i * 2 + Math.sin(y * 0.04 + i) * 2, y);
      ctx.stroke();
    }
  } else {
    ctx.strokeStyle = "#49463e";
    ctx.lineWidth = 3;
    for (let row = 0; row < 4; row++) {
      ctx.beginPath();
      ctx.moveTo(0, row * 64);
      ctx.lineTo(256, row * 64);
      ctx.stroke();
      for (let x = (row % 2) * 64; x < 256; x += 128) {
        ctx.strokeRect(x, row * 64, 128, 64);
      }
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
export const palette = {
  stone: "#d2d2c4",
  trim: "#eee2c6",
  sand: "#d7c29e",
  roof: "#49757b",
  wood: "#a28b6b",
  plaster: "#dfd6bf",
  copper: "#b08062",
  brick: "#bd8f78",
  glass: "#8acbd0",
  banner: "#b65c3a",
  metal: "#798b8c",
  moss: "#678354",
  crystal: "#8cdaed",
};
export function createMaterials() {
  const stone = procedural("stone"),
    wood = procedural("wood"),
    crystal = procedural("crystal"),
    materials = {};
  for (const [name, c] of Object.entries(palette)) {
    const m = new THREE.MeshStandardMaterial({
      map: name === "wood" ? wood : stone,
      roughness: name === "glass" ? 0.22 : 0.88,
      metalness: ["copper", "metal"].includes(name) ? 0.65 : 0,
      bumpMap: name === "wood" ? wood : stone,
      bumpScale: 0.08,
    });
    if (name === "glass") {
      m.transparent = true;
      m.opacity = 0.48;
      m.depthWrite = false;
      m.emissive = new THREE.Color("#24484b");
      m.emissiveIntensity = 0.22;
    }
    if (name === "crystal") {
      m.emissive = new THREE.Color("#77d6ea");
      m.map = crystal;
      m.bumpMap = crystal;
      m.bumpScale = 0.015;
      m.emissiveMap = crystal;
      m.emissiveIntensity = 0.45;
      m.roughness = 0.15;
      m.metalness = 0.35;
    }
    materials[name] = m;
  }
  // Bundled CC0 maps replace the procedural fallback when loaded.
  const pending = [];
  const sets = {
    stone: ["stone", "trim", "sand", "plaster"],
    brick: ["brick"],
    wood: ["wood"],
    ground: ["moss"],
  };
  for (const [asset, names] of Object.entries(sets)) {
    for (const [suffix, slot] of [
      ["diff", "map"],
      ["nor_gl", "normalMap"],
      ["rough", "roughnessMap"],
    ])
      pending.push(
        new Promise((resolve) =>
          loader.load(
            url(`${asset}_${suffix}.jpg`),
            (tex) => {
              tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
              tex.anisotropy = 4;
              if (slot === "map") tex.colorSpace = THREE.SRGBColorSpace;
              tex.repeat.set(0.5, 0.5);
              for (const name of names) {
                materials[name][slot] = tex;
                if (slot === "normalMap") {
                  materials[name].bumpMap = null;
                  materials[name].normalScale.set(0.55, 0.55);
                }
                materials[name].needsUpdate = true;
              }
              resolve();
            },
            undefined,
            () => resolve(),
          ),
        ),
      );
  }
  materials.ready = Promise.all(pending);
  return materials;
}
export class BlockField {
  constructor(scene, blocks, materials, center) {
    this.scene = scene;
    this.meshes = [];
    this.refs = new Map();
    this.instanceMatrix = {};
    const groups = new Map();
    for (const b of blocks) {
      if (
        Math.abs(b.x * 0.75 - center.x) > 230 ||
        Math.abs(b.z * 0.75 - center.z) > 230
      )
        continue;
      if (!groups.has(b.material)) groups.set(b.material, []);
      groups.get(b.material).push(b);
    }
    const cube = new THREE.BoxGeometry(0.745, 0.745, 0.745),
      o = new THREE.Object3D(),
      c = new THREE.Color();
    this.geometry = cube;
    for (const [mat, list] of groups) {
      const mesh = new THREE.InstancedMesh(
        mat === "crystal" ? new THREE.OctahedronGeometry(0.5) : cube,
        materials[mat] || materials.stone,
        list.length,
      );
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < list.length; i++) {
        const b = list[i];
        o.position.set(b.x * 0.75, b.y * 0.75, b.z * 0.75);
        o.scale.setScalar(b.alive ? 1 : 0);
        if (mat === "crystal") {
          o.scale.set(0.72, b.alive ? 1.15 + b.shade * 0.25 : 0, 0.72);
          o.rotation.set(0, b.shade * Math.PI, 0);
        } else o.rotation.set(0, 0, 0);
        o.updateMatrix();
        mesh.setMatrixAt(i, o.matrix);
        mesh.setColorAt(
          i,
          c
            .set(palette[b.material] || "#ffffff")
            .multiplyScalar(0.88 + b.shade * 0.18),
        );
        this.refs.set(b.id, { mesh, i });
      }
      mesh.computeBoundingSphere();
      scene.add(mesh);
      this.meshes.push(mesh);
    }
  }
  setMatrixAt(id, m) {
    const ref = this.refs.get(id);
    if (ref) {
      ref.mesh.setMatrixAt(ref.i, m);
      ref.mesh.instanceMatrix.needsUpdate = true;
    }
  }
  dispose() {
    for (const m of this.meshes) {
      this.scene.remove(m);
      m.dispose();
      if (m.geometry !== this.geometry) m.geometry.dispose();
    }
    this.geometry.dispose();
  }
}

export function natureMaterial(kind) {
  const map = procedural(kind);
  if (kind === "foliage") map.repeat.set(3, 4);
  return new THREE.MeshStandardMaterial({
    map,
    bumpMap: map,
    bumpScale: kind === "foliage" ? 0.035 : 0.2,
    roughness: kind === "rock" ? 0.92 : 1,
    color: kind === "wood" ? 0x8f7561 : kind === "rock" ? 0x858978 : 0xffffff,
  });
}
