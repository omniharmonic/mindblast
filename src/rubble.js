import { Vector3, Quaternion, Ray, Box3 } from "three";
const HALF = 0.75 * 0.4875;
// Test the actual rotated block boxes, not the obsolete voxel-grid positions.
export function raycastRubble(debris, origin, direction, max = 350) {
  let best = null,
    distance = max;
  for (const d of debris) {
    const p = d.body.translation(),
      r = d.body.rotation();
    const q = new Quaternion(r.x, r.y, r.z, r.w).invert();
    const o = new Vector3(
      origin.x - p.x,
      origin.y - p.y,
      origin.z - p.z,
    ).applyQuaternion(q);
    const dir = new Vector3(
      direction.x,
      direction.y,
      direction.z,
    ).applyQuaternion(q);
    const ray = new Ray(o, dir),
      hit = new Vector3(),
      box = new Box3();
    if (!d.bounds) {
      d.bounds = new Box3();
      for (const b of d.blocks) d.bounds.expandByPoint(b.offset);
      d.bounds.expandByScalar(HALF);
    }
    if (
      !d.bounds.containsPoint(o) &&
      (!ray.intersectBox(d.bounds, hit) || hit.distanceTo(o) > distance)
    )
      continue;

    for (let i = 0; i < d.blocks.length; i++) {
      const b = d.blocks[i],
        half = (b.size || 0.75) * 0.4875;
      box.min.copy(b.offset).addScalar(-half);
      box.max.copy(b.offset).addScalar(half);
      const inside = box.containsPoint(o);
      if (!inside && !ray.intersectBox(box, hit)) continue;
      const t = inside ? 0 : hit.distanceTo(o);
      if (t > distance) continue;
      distance = t;
      best = {
        x: origin.x + direction.x * t,
        y: origin.y + direction.y * t,
        z: origin.z + direction.z * t,
        distance: t,
        debris: d,
        blockIndex: i,
        id: null,
      };
    }
  }
  return best;
}
export function rubbleSurvivors(d, point, radius) {
  const p = d.body.translation(),
    r = d.body.rotation(),
    q = new Quaternion(r.x, r.y, r.z, r.w);
  const blast = new Vector3(point.x, point.y, point.z)
    .sub(new Vector3(p.x, p.y, p.z))
    .applyQuaternion(q.invert());
  // Sphere/box intersection also catches the face of a fragment at an impact point.
  return d.blocks.filter((b) => {
    const half = (b.size || 0.75) * 0.4875;
    const x = Math.max(0, Math.abs(blast.x - b.offset.x) - half),
      y = Math.max(0, Math.abs(blast.y - b.offset.y) - half),
      z = Math.max(0, Math.abs(blast.z - b.offset.z) - half);
    return x * x + y * y + z * z > radius * radius;
  });
}
export function nearestHit(a, b) {
  return !a ? b : !b ? a : a.distance <= b.distance ? a : b;
}

// Conserve volume: repeat blasts subdivide masonry instead of erasing debris.
export function shatterRubble(d, point, radius) {
  const untouched = new Set(rubbleSurvivors(d, point, radius));
  let changed = 0;
  const blocks = d.blocks.flatMap((b) => {
    const size = b.size || 0.75;
    if (untouched.has(b) || size <= 0.375) return [b];
    changed++;
    const children = [];
    for (const x of [-1, 1])
      for (const y of [-1, 1])
        for (const z of [-1, 1])
          children.push({
            ...b,
            size: size / 2,
            offset: b.offset
              .clone()
              .add(new Vector3(x, y, z).multiplyScalar(size / 4)),
          });
    return children;
  });
  return { blocks, changed };
}
