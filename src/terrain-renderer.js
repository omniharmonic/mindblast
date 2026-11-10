import * as THREE from "three";
import RAPIER from "@dimforge/rapier3d-compat";
import { CELL, CHUNK, BOTTOM } from "./terrain.js";
const faces = [
  {
    d: [1, 0, 0],
    v: [
      [1, -1, -1],
      [1, 1, -1],
      [1, 1, 1],
      [1, -1, 1],
    ],
  },
  {
    d: [-1, 0, 0],
    v: [
      [-1, -1, 1],
      [-1, 1, 1],
      [-1, 1, -1],
      [-1, -1, -1],
    ],
  },
  {
    d: [0, 1, 0],
    v: [
      [-1, 1, 1],
      [1, 1, 1],
      [1, 1, -1],
      [-1, 1, -1],
    ],
  },
  {
    d: [0, -1, 0],
    v: [
      [-1, -1, -1],
      [1, -1, -1],
      [1, -1, 1],
      [-1, -1, 1],
    ],
  },
  {
    d: [0, 0, 1],
    v: [
      [-1, -1, 1],
      [1, -1, 1],
      [1, 1, 1],
      [-1, 1, 1],
    ],
  },
  {
    d: [0, 0, -1],
    v: [
      [1, -1, -1],
      [-1, -1, -1],
      [-1, 1, -1],
      [1, 1, -1],
    ],
  },
];
export class TerrainRenderer {
  constructor(scene, terrain, physics, materials) {
    this.scene = scene;
    this.terrain = terrain;
    this.physics = physics;
    this.materials = [
      materials.moss,
      materials.wood,
      materials.stone,
      materials.stone,
      materials.crystal,
    ];
    this.chunks = new Map();
    this.center = "";
    this.queue = [];
    this.physicsFoci = new Map();
    this.colors = ["#8ca16b", "#a48b6d", "#a7a39c", "#777f85", "#81b8e9"].map(
      (c) => new THREE.Color(c),
    );
  }
  refreshMaterials() {
    this.renderMaterials?.forEach((material, i) => {
      material.copy(this.materials[i]);
      material.vertexColors = true;
      material.needsUpdate = true;
    });
  }
  build(cx, cy, cz) {
    const k = `${cx},${cy},${cz}`,
      old = this.chunks.get(k);
    if (old) {
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      if (old.collider) this.physics.removeCollider(old.collider, true);
    }
    const parts = Array.from({ length: 5 }, () => ({
      p: [],
      n: [],
      uv: [],
      c: [],
    }));
    const t = this.terrain;
    for (let x = cx * CHUNK; x < (cx + 1) * CHUNK; x++)
      for (let z = cz * CHUNK; z < (cz + 1) * CHUNK; z++) {
        const col = t.column(x, z);
        for (
          let y = Math.max(cy * CHUNK, BOTTOM + 1);
          y < Math.min((cy + 1) * CHUNK, col.h + 1);
          y++
        ) {
          const type = t.get(x, y, z);
          if (!type) continue;
          for (const face of faces) {
            const [dx, dy, dz] = face.d;
            if (t.get(x + dx, y + dy, z + dz)) continue;
            const b = parts[type - 1],
              c = this.colors[type - 1];
            for (const i of [0, 1, 2, 0, 2, 3]) {
              const v = face.v[i];
              b.p.push(
                x * CELL + (v[0] * CELL) / 2,
                y * CELL + 0.375 + (v[1] * CELL) / 2,
                z * CELL + (v[2] * CELL) / 2,
              );
              b.n.push(dx, dy, dz);
              b.uv.push(i === 0 || i === 3 ? 0 : 1, i < 2 ? 0 : 1);
              const shade =
                (dy === 1 ? 1 : dy === -1 ? 0.5 : 0.8) *
                (1 + Math.sin(x * 12 + y * 7 + z * 5) * 0.045);
              b.c.push(c.r * shade, c.g * shade, c.b * shade);
            }
          }
        }
      }
    const p = [],
      n = [],
      uv = [],
      colors = [],
      g = new THREE.BufferGeometry();
    let count = 0;
    parts.forEach((b, i) => {
      if (b.p.length) g.addGroup(count, b.p.length / 3, i);
      count += b.p.length / 3;
      p.push(...b.p);
      n.push(...b.n);
      uv.push(...b.uv);
      colors.push(...b.c);
    });
    if (!p.length) {
      this.chunks.set(k, {
        mesh: new THREE.Mesh(new THREE.BufferGeometry()),
        empty: true,
      });
      return;
    }
    g.setAttribute("position", new THREE.Float32BufferAttribute(p, 3));
    g.setAttribute("normal", new THREE.Float32BufferAttribute(n, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    g.computeBoundingSphere();
    const mats =
      this.renderMaterials ||
      (this.renderMaterials = this.materials.map((m) => {
        const clone = m.clone();
        clone.vertexColors = true;
        return clone;
      }));
    const mesh = new THREE.Mesh(g, mats);
    mesh.receiveShadow = true;
    mesh.castShadow = false;
    this.scene.add(mesh);
    const chunk = { mesh, collider: null };
    this.chunks.set(k, chunk);
    this.syncCollider(chunk, cx, cz);
  }
  addPhysicsFocus(point) {
    const x = Math.floor(point.x / (CELL * CHUNK)),
      z = Math.floor(point.z / (CELL * CHUNK));
    this.physicsFoci.set(x + "," + z, {
      x,
      z,
      until: performance.now() + 26000,
    });
    for (const [key, chunk] of this.chunks) {
      const [cx, , cz] = key.split(",").map(Number);
      this.syncCollider(chunk, cx, cz);
    }
  }
  syncCollider(chunk, x, z) {
    if (chunk.empty) return;
    const near =
      (Math.abs(x - this.streamX) <= 2 && Math.abs(z - this.streamZ) <= 2) ||
      [...this.physicsFoci.values()].some(
        (p) => Math.abs(x - p.x) <= 2 && Math.abs(z - p.z) <= 2,
      );
    if (!near && chunk.collider) {
      this.physics.removeCollider(chunk.collider, true);
      chunk.collider = null;
    } else if (near && !chunk.collider) {
      const positions = chunk.mesh.geometry.attributes.position.array;
      const indices = Uint32Array.from(
        { length: positions.length / 3 },
        (_, i) => i,
      );
      chunk.collider = this.physics.createCollider(
        RAPIER.ColliderDesc.trimesh(positions, indices).setFriction(0.9),
      );
    }
  }

  farMesh(cx, cz) {
    if (this.far) {
      this.scene.remove(this.far);
      this.far.geometry.dispose();
    }
    const geo = new THREE.PlaneGeometry(600, 600, 100, 100);
    geo.rotateX(-Math.PI / 2);
    geo.translate(cx * 24, 0, cz * 24);
    const p = geo.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const x = p.getX(i),
        z = p.getZ(i);
      p.setY(
        i,
        this.terrain.column(
          Math.floor((x + 0.75) / CELL),
          Math.floor((z + 0.75) / CELL),
        ).h *
          CELL +
          1.125,
      );
    }
    const indices = [];
    for (let z = 0; z < 100; z++)
      for (let x = 0; x < 100; x++) {
        const a = z * 101 + x,
          mx = (p.getX(a) + p.getX(a + 1)) * 0.5,
          mz = (p.getZ(a) + p.getZ(a + 101)) * 0.5;
        if (
          mx >= (cx - 5) * 24 - 0.75 &&
          mx < (cx + 6) * 24 - 0.75 &&
          mz >= (cz - 5) * 24 - 0.75 &&
          mz < (cz + 6) * 24 - 0.75
        )
          continue;
        indices.push(a, a + 101, a + 1, a + 1, a + 101, a + 102);
      }
    geo.setIndex(indices);
    geo.computeVertexNormals();
    this.farMaterial ||= new THREE.MeshStandardMaterial({
      color: "#7b8b60",
      roughness: 1,
    });
    this.far = new THREE.Mesh(geo, this.farMaterial);
    this.far.receiveShadow = true;
    this.scene.add(this.far);
  }
  stream(position, immediate = false) {
    const cx = Math.floor(position.x / (CELL * CHUNK)),
      cz = Math.floor(position.z / (CELL * CHUNK)),
      k = cx + "," + cz;
    if (k === this.center) return;
    this.center = k;
    for (const [id, p] of this.physicsFoci)
      if (p.until < performance.now()) this.physicsFoci.delete(id);
    this.streamX = cx;
    this.streamZ = cz;
    for (const [key, c] of this.chunks) {
      const [x, , z] = key.split(",").map(Number);
      this.syncCollider(c, x, z);
    }
    this.farMesh(cx, cz);
    const wanted = new Set();
    for (let x = cx - 5; x <= cx + 5; x++)
      for (let z = cz - 5; z <= cz + 5; z++)
        for (let y = -2; y <= 1; y++) {
          const key = `${x},${y},${z}`;
          wanted.add(key);
          if (!this.chunks.has(key)) this.queue.push([x, y, z]);
        }
    this.queue = this.queue.filter((a) => wanted.has(a.join(",")));
    this.queue.sort(
      (a, b) =>
        (a[0] - cx) ** 2 +
        (a[2] - cz) ** 2 -
        (b[0] - cx) ** 2 -
        (b[2] - cz) ** 2,
    );
    for (const [key, c] of this.chunks)
      if (!wanted.has(key)) {
        this.scene.remove(c.mesh);
        c.mesh.geometry.dispose();
        if (c.collider) this.physics.removeCollider(c.collider, true);
        this.chunks.delete(key);
      }
    if (immediate) while (this.queue.length) this.build(...this.queue.shift());
  }
  tick() {
    for (let i = 0; i < 3 && this.queue.length; i++)
      this.build(...this.queue.shift());
  }
  update(keys) {
    const dirty = new Set();
    for (const k of keys) {
      const [x, y, z] = k.split(",").map(Number);
      for (const [dx, dy, dz] of [
        [0, 0, 0],
        [1, 0, 0],
        [-1, 0, 0],
        [0, 1, 0],
        [0, -1, 0],
        [0, 0, 1],
        [0, 0, -1],
      ]) {
        const c = [
          Math.floor((x + dx) / CHUNK),
          Math.floor((y + dy) / CHUNK),
          Math.floor((z + dz) / CHUNK),
        ];
        if (this.chunks.has(c.join(","))) dirty.add(c.join(","));
      }
    }
    for (const k of dirty) this.build(...k.split(",").map(Number));
  }
  dispose() {
    if (this.far) {
      this.scene.remove(this.far);
      this.far.geometry.dispose();
      this.farMaterial?.dispose();
    }
    for (const c of this.chunks.values()) {
      this.scene.remove(c.mesh);
      c.mesh.geometry.dispose();
      if (c.collider) this.physics.removeCollider(c.collider, true);
    }
    this.renderMaterials?.forEach((m) => m.dispose());
    this.chunks.clear();
  }
}
