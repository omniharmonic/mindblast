import { test, expect } from "@playwright/test";
test("rubble persists beyond its old lifetime, supports the player, and survives further blasts", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.waitForFunction(() => window.__mindblast?.state.ready);
  await page.locator("#play").click();
  await page.evaluate(() =>
    window.__mindblast.blast({ x: 12, y: 2, z: 9.75 }, 0),
  );
  const before = await page.evaluate(
    () => window.__mindblast.state.rubbleVolume,
  );
  expect(before).toBeGreaterThan(0);
  expect(before).toBeCloseTo(
    (await page.evaluate(() => window.__mindblast.state.removed)) * 0.75 ** 3,
    5,
  );
  await page.waitForTimeout(27000);
  const persisted = await page.evaluate(() => window.__mindblast.state);
  expect(persisted.rubbleVolume).toBeCloseTo(before, 5);
  expect(persisted.rubbleBlocks).toBeGreaterThan(0);
  const landing = await page.evaluate(() => {
    const g = window.__mindblast;
    for (const t of g.rubbleTargets) {
      const hit = g.trace(
        { x: t.x, y: t.y + 20, z: t.z },
        { x: 0, y: -1, z: 0 },
        25,
      );
      if (
        !hit?.rubble ||
        !g.collisionAt(hit.x, hit.y + 0.5, hit.z) ||
        g.collisionAt(hit.x, hit.y + 1.8, hit.z)
      )
        continue;
      g.teleport(hit.x, hit.y + 1.8, hit.z);
      return hit;
    }
  });
  expect(landing).toBeTruthy();
  await page.waitForTimeout(1000);
  const standing = await page.evaluate(() => window.__mindblast.state);
  expect(standing.grounded).toBe(true);
  expect(standing.position[1]).toBeGreaterThan(landing.y + 1.3);
  expect(standing.position[1]).toBeLessThan(landing.y + 1.9);
  await page.evaluate((p) => window.__mindblast.blast(p, 4), landing);
  await expect
    .poll(() => page.evaluate(() => window.__mindblast.state.rubbleDestroyed))
    .toBeGreaterThan(0);
  const after = await page.evaluate(() => window.__mindblast.state);
  expect(after.rubbleVolume).toBeGreaterThanOrEqual(before - 0.00001);
  expect(errors).toEqual([]);
});

test("rooftop charges drop the player onto surviving floors or rubble, not through them", async ({
  page,
}) => {
  await page.goto("/");
  await page.waitForFunction(() => window.__mindblast?.state.ready);
  await page.locator("#play").click();
  const roof = await page.evaluate(() => {
    const g = window.__mindblast,
      hit = g.trace({ x: 0, y: 60, z: 0 }, { x: 0, y: -1, z: 0 }, 80);
    g.teleport(hit.x, hit.y + 1.65, hit.z);
    return hit;
  });
  await page.waitForTimeout(300);
  await page.evaluate((p) => {
    const g = window.__mindblast;
    g.placeCharge({ x: p.x, y: p.y, z: p.z });
    g.detonateCharges();
  }, roof);
  await page.waitForTimeout(5000);
  const result = await page.evaluate(() => {
    const g = window.__mindblast,
      s = g.state,
      [x, y, z] = s.position;
    return {
      s,
      floor: g.trace({ x, y: y - 0.05, z }, { x: 0, y: -1, z: 0 }, 2),
    };
  });
  expect(result.s.position[1]).toBeLessThan(roof.y + 1.65);
  expect(result.s.position[1]).toBeGreaterThan(-40);
  expect(result.s.grounded).toBe(true);
  expect(result.floor).toBeTruthy();
});
