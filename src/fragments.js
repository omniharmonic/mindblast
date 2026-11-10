// Exact greedy cuboids reduce contact constraints without filling doors or holes.
export function colliderBoxes(blocks) {
  const key = (x, y, z) => `${x},${y},${z}`;
  const remaining = new Map(blocks.map((b) => [key(b.x, b.y, b.z), b]));
  const boxes = [];
  for (const b of blocks) {
    if (!remaining.has(key(b.x, b.y, b.z))) continue;
    const same = (x, y, z) =>
      remaining.get(key(x, y, z))?.material === b.material &&
      remaining.has(key(x, y, z));
    let nx = 1,
      ny = 1,
      nz = 1;
    while (same(b.x + nx, b.y, b.z)) nx++;
    while (
      Array.from({ length: nx }, (_, x) => same(b.x + x, b.y, b.z + nz)).every(
        Boolean,
      )
    )
      nz++;
    while (
      Array.from({ length: nx * nz }, (_, i) =>
        same(b.x + (i % nx), b.y + ny, b.z + Math.floor(i / nx)),
      ).every(Boolean)
    )
      ny++;
    for (let x = 0; x < nx; x++)
      for (let y = 0; y < ny; y++)
        for (let z = 0; z < nz; z++)
          remaining.delete(key(b.x + x, b.y + y, b.z + z));
    boxes.push({
      x: b.x + (nx - 1) / 2,
      y: b.y + (ny - 1) / 2,
      z: b.z + (nz - 1) / 2,
      nx,
      ny,
      nz,
      material: b.material,
    });
  }
  return boxes;
}
