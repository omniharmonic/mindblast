// Architectural grammars: dimensions, floor counts, tower arrangements and ornament vary by seed.
export const TYPES = [
  "Manor",
  "Pagoda",
  "Observatory",
  "Windmill",
  "Amphitheatre",
  "Foundry",
  "Lighthouse",
  "Temple",
  "Clock tower",
  "Greenhouse",
  "Market hall",
  "Fortress",
  "Library",
  "Ziggurat",
  "Viaduct",
  "Bathhouse",
];
export function buildArchitecture(ctx, type, cx, cz, rng) {
  const { add, box } = ctx;
  const n = (a, b) => a + Math.floor(rng() * (b - a + 1));
  const w = n(12, 18),
    d = n(13, 21),
    floors = n(2, 4),
    floorH = 6,
    h = floors * floorH;
  const shell = (x, z, W, D, H, mat = "stone") => {
    for (let y = 0; y < H; y++)
      for (let a = 0; a < W; a++)
        for (let b = 0; b < D; b++) {
          if (
            a !== 0 &&
            a !== W - 1 &&
            b !== 0 &&
            b !== D - 1 &&
            y % floorH !== 0
          )
            continue;
          const door =
            (b === D - 1 || b === 0) &&
            a >= Math.floor(W / 2) - 1 &&
            a <= Math.floor(W / 2) + 1 &&
            y < 4;
          const window =
            y % floorH >= 2 &&
            y % floorH <= 4 &&
            (((b === 0 || b === D - 1) && a % 4 >= 1 && a % 4 <= 2) ||
              ((a === 0 || a === W - 1) && b % 4 >= 1 && b % 4 <= 2));
          const stairwell =
            y > 0 && y % floorH === 0 && a < 4 && b < D - 2 && b > D - 10;
          if (door || stairwell) continue;
          add(
            x + a,
            y,
            z + b,
            window
              ? y % floorH === 4
                ? "trim"
                : "glass"
              : y % floorH === 0
                ? "trim"
                : mat,
          );
        }
    // Projecting sills, corner quoins and cornices give each facade depth.
    for (let level = 0; level < H; level += floorH) {
      for (let a = 1; a < W - 2; a += 4)
        for (const b of [-1, D]) box(x + a, level + 1, z + b, 2, 1, 1, "trim");
      for (let b = 1; b < D - 2; b += 4)
        for (const a of [-1, W]) box(x + a, level + 1, z + b, 1, 1, 2, "trim");
      for (const a of [0, W - 1])
        for (const b of [-1, D]) box(x + a, level, z + b, 1, 5, 1, "trim");
      // A cross wall with a generous central doorway; stairs retain a clear aisle.
      if (W >= 12 && D >= 13)
        for (let a = 4; a < W - 1; a++)
          for (let y = 1; y < floorH; y++) {
            if (Math.abs(a - Math.floor(W / 2)) <= 1 && y < 4) continue;
            add(
              x + a,
              level + y,
              z + Math.floor(D / 2),
              y === 5 ? "wood" : "plaster",
            );
          }
      // Exposed ceiling joists transfer load to the outside walls.
      for (let b = 3; b < D - 2; b += 4)
        box(x + 4, level + 5, z + b, W - 5, 1, 1, "wood");
    }
  };
  const stairs = (x, z, levels, H = 6) => {
    for (let f = 0; f < levels; f++) {
      for (let i = 0; i < H; i++) box(x, f * H + i, z + i, 3, 1, 1, "wood");
      box(x, (f + 1) * H, z + H, 3, 1, 2, "wood");
    }
  };
  const roof = (x, z, W, D, y, mat = "roof") => {
    for (let k = 0; k < Math.ceil(W / 2); k++)
      for (const a of [k, W - 1 - k])
        box(x + a, y + k, z - 1, 1, 1, D + 2, mat);
    // Close the gables around attic windows instead of leaving triangular voids.
    for (let k = 0; k < Math.floor(W / 2); k++)
      for (let a = k + 1; a < W - k - 1; a++)
        for (const b of [0, D - 1])
          add(
            x + a,
            y + k,
            z + b,
            mat === "glass" || (Math.abs(a - W / 2) < 2 && k >= 1 && k <= 3)
              ? "glass"
              : "plaster",
          );
  };
  const ring = (x, z, r, y, mat = "trim", thick = 1) => {
    for (let a = -r; a <= r; a++)
      for (let b = -r; b <= r; b++)
        if (Math.hypot(a, b) <= r + 0.4 && Math.hypot(a, b) >= r - thick)
          add(x + a, y, z + b, mat);
  };
  const roundTower = (x, z, r, H, mat = "stone") => {
    for (let y = 0; y < H; y++)
      for (let a = -r; a <= r; a++)
        for (let b = -r; b <= r; b++)
          if (
            Math.hypot(a, b) <= r + 0.4 &&
            Math.hypot(a, b) >= r - 1 &&
            !(y < 4 && Math.abs(a) < 2 && b > 0)
          )
            add(
              x + a,
              y,
              z + b,
              y % 6 === 0
                ? "trim"
                : y % 6 >= 2 &&
                    y % 6 <= 4 &&
                    (Math.abs(a) <= 1 || Math.abs(b) <= 1)
                  ? "glass"
                  : mat,
            );
    for (let y = 6; y < H; y += 6) {
      for (let a = -r + 1; a < r; a++)
        for (let b = -r + 1; b < r; b++)
          if (Math.hypot(a, b) < r - 3) add(x + a, y, z + b, "wood");
    }
    for (let i = 0; i < H; i++) {
      const angle = (i * 1.2) / Math.max(1, r - 2);
      box(
        x + Math.round(Math.cos(angle) * (r - 2)),
        i,
        z + Math.round(Math.sin(angle) * (r - 2)),
        2,
        1,
        2,
        "trim",
      );
    }
  };
  const furnish = (x, z, W, D, levels) => {
    for (let f = 0; f < levels; f++) {
      const y = f * 6 + 1;
      box(x + W - 5, y, z + 3, 3, 1, 2, "wood");
      box(x + W - 6, y, z + 3, 1, 1, 2, "wood");
      box(x + W - 2, y, z + D - 5, 1, 3, 3, "brick");
      box(x + W - 3, y + 3, z + D - 5, 2, 1, 3, "trim");
      box(x + 5, y, z + D - 4, 3, 1, 2, "wood");
      box(x + 5, y + 1, z + D - 4, 1, 1, 2, "plaster");
      for (let shelf = 0; shelf < 3; shelf++) {
        box(x + 5, y + shelf, z + 1, 3, 1, 1, "wood");
        add(x + 6, y + shelf, z + 2, shelf % 2 ? "banner" : "copper");
      }
      for (const a of [W - 5, W - 3]) box(x + a, y - 1, z + 3, 1, 1, 2, "wood");
      box(x + W - 3, y, z + D - 4, 1, 3, 2, "wood");
      for (let j = 0; j < 3; j++)
        box(x + W - 3, y + j, z + D - 4, 1, 1, 1, j % 2 ? "banner" : "copper");
      for (let a = 5; a < W - 4; a += 4)
        box(x + a, y, z + 2, 2, 1, 2, "plaster");
    }
  };
  const x = cx - Math.floor(w / 2),
    z = cz - Math.floor(d / 2);
  if (type === "Ziggurat") {
    const tiers = n(3, 5),
      radius = n(12, 16);
    for (let level = 0; level < tiers; level++) {
      const r = radius - level * 2;
      for (let y = level * 4; y < level * 4 + 4; y++)
        for (let a = -r; a <= r; a++)
          for (let b = -r; b <= r; b++) {
            if (Math.abs(a) < r && Math.abs(b) < r && y % 4 !== 0) continue;
            if (Math.abs(a) < 2 && b === r && y < 4) continue;
            add(cx + a, y, cz + b, y % 4 === 3 ? "trim" : "sand");
          }
    }
    for (let i = 0; i < tiers * 4; i++)
      box(cx - 1, i, cz + radius + 5 - i, 3, 1, 1, "stone");
    box(cx - 2, tiers * 4, cz - 2, 5, 1, 5, "trim");
  } else if (type === "Viaduct") {
    const bays = n(3, 5),
      H = n(10, 17),
      span = 10;
    for (let i = 0; i <= bays; i++)
      box(cx - bays * 5 + i * span, 0, cz - 2, 2, H, 5, "brick");
    for (let a = 0; a < bays * span + 2; a++) {
      const xx = cx - bays * 5 + a,
        phase = a % span;
      box(xx, H, cz - 3, 1, 2, 7, "trim");
      for (const zz of [-3, 3]) box(xx, H + 2, cz + zz, 1, 2, 1, "stone");
      const arch = Math.floor(3 - Math.sin((phase / span) * Math.PI) * 3);
      if (arch > 0) box(xx, H - arch, cz - 2, 1, arch, 5, "brick");
    }
    for (let i = 0; i < H + 2; i++)
      box(cx - bays * 5 - 2 - i, i, cz - 1, 1, 1, 3, "stone");
  } else if (type === "Bathhouse") {
    shell(x, z, w, d, 12, "sand");
    stairs(x + 1, z + d - 9, 1);
    for (let a = 3; a < w - 3; a++)
      for (let b = 3; b < d - 3; b++) add(x + a, 1, z + b, "glass");
    for (const a of [2, w - 3])
      for (let b = 2; b < d - 2; b += 5) box(x + a, 1, z + b, 1, 10, 1, "trim");
    roof(x - 1, z, w + 2, d, 12, "copper");
  } else if (
    type === "Manor" ||
    type === "Market hall" ||
    type === "Foundry" ||
    type === "Library"
  ) {
    shell(
      x,
      z,
      w,
      d,
      h,
      type === "Foundry" ? "brick" : type === "Manor" ? "plaster" : "sand",
    );
    stairs(x + 1, z + d - 9, floors - 1);
    roof(x - 1, z, w + 2, d, h, type === "Foundry" ? "copper" : "roof");
    furnish(x, z, w, d, floors);
    for (let f = 1; f < floors; f++) {
      box(x - 1, f * 6, z + d, w + 2, 1, 3, "wood");
      for (let a = 0; a < w; a += 2)
        box(x + a, f * 6 + 1, z + d + 2, 1, 2, 1, "wood");
    }
    if (type === "Library") {
      for (let f = 0; f < floors; f++)
        for (let a = 5; a < w - 2; a += 4) {
          box(x + a, f * 6 + 1, z + 3, 1, 4, Math.max(2, d - 7), "wood");
          for (let b = 3; b < d - 4; b += 2)
            box(x + a + 1, f * 6 + 2, z + b, 1, 2, 1, "banner");
        }
    }
    if (type === "Foundry") {
      for (let i = 0; i < 3; i++)
        roundTower(x + w + 3 + i * 4, z + 3, 1, h + 5 + i * 2, "brick");
      box(x + 5, 1, z + 4, 4, 3, 4, "metal");
    } else if (type === "Market hall") {
      for (let a = 0; a < w; a += 5) {
        box(x + a, 0, z + d + 5, 1, 4, 1, "wood");
        box(x + a, 4, z + d + 2, 5, 1, 5, a % 2 ? "banner" : "plaster");
      }
    }
  } else if (type === "Pagoda") {
    const levels = n(3, 5);
    for (let f = 0; f < levels; f++) {
      const r = 10 - f;
      const base = f * 7;
      for (let y = base; y < base + 6; y++)
        for (let a = -r; a <= r; a++)
          for (let b = -r; b <= r; b++)
            if (Math.abs(a) === r || Math.abs(b) === r || y === base) {
              if (Math.abs(a) < 2 && b === r && y < base + 4) continue;
              if (y === base && a < -r + 4 && b > -r + 1 && b < -r + 8)
                continue;
              add(
                cx + a,
                y,
                cz + b,
                y % 7 === 0 ? "wood" : (a + b) % 4 === 0 ? "wood" : "plaster",
              );
            }
      for (let k = 0; k < 3; k++) {
        const R = r + 3 - k;
        for (let a = -R; a <= R; a++)
          for (let b = -R; b <= R; b++)
            if (Math.max(Math.abs(a), Math.abs(b)) > R - 2)
              add(cx + a, base + 5 + k, cz + b, "roof");
      }
      stairs(cx - r + 1, cz - r + 1, 1, 7);
      for (let i = 0; i < 7; i++)
        box(cx - r + 1, base + i, cz - r + 1 + i, 3, 1, 1, "wood");
    }
    box(cx, levels * 7, cz, 1, 6, 1, "copper");
  } else if (
    type === "Observatory" ||
    type === "Lighthouse" ||
    type === "Clock tower"
  ) {
    const r = type === "Observatory" ? n(8, 11) : n(4, 6),
      H = type === "Observatory" ? n(12, 18) : n(25, 38);
    roundTower(cx, cz, r, H, type === "Clock tower" ? "brick" : "sand");
    if (type === "Observatory") {
      for (let y = 0; y <= r; y++) {
        const R = Math.sqrt(Math.max(0, r * r - y * y));
        for (let a = -r; a <= r; a++)
          for (let b = -r; b <= r; b++)
            if (Math.abs(Math.hypot(a, b) - R) < 0.7 && !(a === 0 && b > 0))
              add(cx + a, H + y, cz + b, "copper");
      }
      box(cx - 1, H + 2, cz, 3, 2, r + 5, "metal");
    } else {
      for (let y = H; y < H + 5; y++)
        ring(cx, cz, r + 1, y, y === H ? "trim" : "glass");
      for (let y = 0; y < r + 2; y++)
        ring(cx, cz, r + 2 - y, H + 5 + y, "roof", 2);
      if (type === "Clock tower")
        for (const s of [-1, 1]) {
          box(cx - 2, H - 6, cz + s * r, 5, 5, 1, "trim");
          box(cx, H - 5, cz + s * (r + 1), 1, 3, 1, "metal");
          box(cx, H - 3, cz + s * (r + 1), 2, 1, 1, "metal");
        }
    }
    // Door opening at ground level.
    ctx.erase?.(cx - 1, 0, cz + r, 3, 4, 1);
  } else if (type === "Windmill") {
    roundTower(cx, cz, 6, n(18, 23), "plaster");
    roof(cx - 7, cz - 6, 15, 13, 23, "roof");
    for (let arm = 0; arm < 4; arm++) {
      const a = (arm * Math.PI) / 2 + 0.3;
      for (let t = 0; t < 15; t++) {
        const bx = cx + Math.round(Math.cos(a) * t),
          by = 17 + Math.round(Math.sin(a) * t);
        box(bx, by, cz + 8, 2, 2, 1, t % 3 ? "wood" : "plaster");
      }
    }
    box(cx - 2, 1, cz - 2, 5, 3, 5, "metal");
  } else if (type === "Amphitheatre") {
    const R = n(16, 20);
    for (let tier = 0; tier < 7; tier++) {
      for (let a = -R; a <= R; a++)
        for (let b = -R; b <= R; b++) {
          const r = Math.hypot(a, b);
          if (
            r > R - tier - 1 &&
            r <= R - tier + 0.6 &&
            !(Math.abs(a) < 2 && b > 0)
          )
            box(cx + a, 0, cz + b, 1, 8 - tier, 1, tier % 2 ? "sand" : "trim");
        }
    }
    box(cx - 7, 0, cz - 5, 15, 2, 10, "trim");
    for (let a = -R; a <= R; a += 6) box(cx + a, 0, cz - R, 2, 12, 2, "sand");
    box(cx - R, 12, cz - R, R * 2 + 2, 2, 2, "trim");
  } else if (type === "Temple") {
    const W = n(18, 25),
      D = n(20, 28);
    box(cx - W / 2, 0, cz - D / 2, W, 2, D, "trim");
    for (let a = 0; a < W; a += 5)
      for (const b of [0, D - 2]) {
        box(cx - W / 2 + a, 2, cz - D / 2 + b, 2, 13, 2, "sand");
        box(cx - W / 2 + a - 1, 14, cz - D / 2 + b - 1, 4, 2, 4, "trim");
      }
    for (let b = 5; b < D - 3; b += 5)
      for (const a of [0, W - 2])
        box(cx - W / 2 + a, 2, cz - D / 2 + b, 2, 13, 2, "sand");
    box(cx - W / 2 - 1, 16, cz - D / 2 - 1, W + 2, 2, D + 2, "trim");
    roof(
      cx - Math.floor(W / 2) - 1,
      cz - Math.floor(D / 2) - 1,
      W + 2,
      D + 2,
      18,
      "sand",
    );
    for (let i = 0; i < 4; i++)
      box(
        cx - 4 - i,
        Math.max(0, 1 - i),
        cz + D / 2 + i,
        9 + i * 2,
        1,
        1,
        "trim",
      );
    box(cx - 2, 2, cz - 2, 5, 5, 5, "crystal");
  } else if (type === "Greenhouse") {
    const W = n(14, 22),
      D = n(20, 28);
    for (let y = 0; y < 10; y++)
      for (let a = 0; a < W; a++)
        for (let b = 0; b < D; b++)
          if (a === 0 || a === W - 1 || b === 0 || b === D - 1 || y === 0) {
            if (b === D - 1 && Math.abs(a - W / 2) < 2 && y < 4) continue;
            add(
              cx + a - W / 2,
              y,
              cz + b - D / 2,
              y % 5 === 0 || a % 5 === 0 || b % 5 === 0 ? "metal" : "glass",
            );
          }
    roof(cx - Math.floor(W / 2), cz - Math.floor(D / 2), W, D, 10, "glass");
    for (let a = 3; a < W - 2; a += 5) {
      box(cx + a - W / 2, 1, cz - D / 2 + 3, 2, 1, D - 6, "brick");
      for (let b = 3; b < D - 3; b += 3)
        box(cx + a - W / 2, 2, cz + b - D / 2, 1, n(1, 3), 1, "moss");
    }
  } else {
    const R = n(12, 16);
    for (const a of [-R, R])
      for (const b of [-R, R])
        roundTower(cx + a, cz + b, 4, n(16, 24), "stone");
    for (let a = -R; a <= R; a++)
      for (const b of [-R, R])
        for (let y = 0; y < 10; y++) {
          if (b === R && Math.abs(a) < 3 && y < 5) continue;
          add(cx + a, y, cz + b, y % 5 === 0 ? "trim" : "stone");
        }
    for (let b = -R; b <= R; b++)
      for (const a of [-R, R]) box(cx + a, 0, cz + b, 1, 10, 1, "stone");
    shell(cx - 5, cz - 5, 11, 11, 18, "brick");
    stairs(cx - 4, cz - 3, 2);
    roof(cx - 6, cz - 5, 13, 11, 18);
  }
}
export function addInterior(ctx, s) {
  const { box, add } = ctx;
  const { minX, maxX, minZ, maxZ } = s.bounds;
  const W = maxX - minX,
    D = maxZ - minZ;
  if (W < 6 || D < 6) return;
  if (s.type === "Castle") {
    for (let y = 5; y < 20; y += 6) {
      for (let x = -6; x <= 6; x++)
        for (let z = -5; z <= 2; z++)
          if (!(x < -3 && z > -3)) add(x, y, z, "wood");
      for (let step = 0; step < 6; step++)
        box(-6, y - 5 + step, 3 - step, 3, 1, 1, "wood");
      box(3, y + 1, -4, 2, 2, 3, "wood");
    }
    for (let i = 0; i < 12; i++) box(-14, i, 11 - i, 3, 1, 1, "stone");
  }
  if (s.type === "Cathedral") {
    const cx = Math.round(s.x / 0.75),
      cz = Math.round(s.z / 0.75);
    for (let z = -14; z < 14; z += 5)
      for (const side of [-1, 1]) {
        box(cx + side * 5 - 1, 1, cz + z, 4, 1, 1, "wood");
        box(cx + side * 5 - 1, 2, cz + z - 1, 4, 2, 1, "wood");
      }
    for (const side of [-1, 1])
      for (let z = -15; z < 17; z += 8) {
        box(cx + side * 7, 0, cz + z, 1, 19, 1, "trim");
        for (let k = 0; k < 7; k++)
          add(
            cx + side * (7 - k),
            19 + Math.round(Math.sqrt(49 - (7 - k) ** 2)),
            cz + z,
            "trim",
          );
      }
    box(cx - 3, 1, cz - 17, 7, 2, 4, "trim");
    for (let i = 0; i < 18; i++) box(cx - 9, i, cz + 18 - i, 3, 1, 1, "trim");
    for (let a = -9; a <= 9; a++)
      for (let b = 0; b < 8; b++)
        if (!(a < -6 && b > 0)) add(cx + a, 17, cz + b, "wood");
  }
  if (s.type === "Village") {
    for (let i = 0; i < 10; i++)
      box(minX + 1, i, minZ + 2 + i, 2, 1, 1, "wood");
    box(maxX - 4, 1, minZ + 3, 3, 2, 2, "wood");
    box(maxX - 2, 1, maxZ - 3, 1, 3, 2, "wood");
  }
}
