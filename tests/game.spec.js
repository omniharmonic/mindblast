import { test, expect } from "@playwright/test";
async function ready(page) {
  await page.goto("/");
  await page.waitForFunction(() => window.__mindblast?.state.ready);
}
async function state(page) {
  return page.evaluate(() => window.__mindblast.state);
}
async function aim(page, x = 12, y = 2, z = 9.75) {
  await page.mouse.move(640, 400);
  await page.waitForTimeout(100);
  await page.evaluate(
    ([x, y, z]) => window.__mindblast.aimAt(x, y, z),
    [x, y, z],
  );
}
async function shoot(page) {
  await page.waitForFunction(() => window.__mindblast.state.cooldown === 0);
  await page.mouse.down();
  await page.mouse.up();
}
test("play, move, shoot, collapse, fly, map, pause, regenerate", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await ready(page);
  await expect(page.locator("#play")).toBeEnabled();
  await page.locator("#play").click();
  await page.keyboard.down("w");
  await expect
    .poll(async () => (await state(page)).position[2])
    .toBeLessThan(33);
  await page.keyboard.up("w");
  await aim(page);
  await shoot(page);
  await expect.poll(async () => (await state(page)).score).toBeGreaterThan(0);
  expect((await state(page)).debris).toBeGreaterThan(0);
  const before = await page.evaluate(() => window.__mindblast.debrisSample);
  await page.waitForTimeout(300);
  expect(
    await page.evaluate(() => window.__mindblast.debrisSample),
  ).not.toEqual(before);
  await page.waitForTimeout(600);
  await page.keyboard.press("6");
  await aim(page);
  await shoot(page);
  await expect
    .poll(async () => (await state(page)).removed)
    .toBeGreaterThan(800);
  const oldY = (await state(page)).position[1];
  await page.keyboard.press("f");
  await page.keyboard.down("Space");
  await page.waitForTimeout(250);
  await page.keyboard.up("Space");
  expect((await state(page)).position[1]).toBeGreaterThan(oldY + 1);
  await page.keyboard.press("q");
  expect((await state(page)).slow).toBe(true);
  await page.keyboard.press("q");
  await page.keyboard.press("m");
  await expect(page.locator("#map")).toBeVisible();
  await page.getByRole("button", { name: "Saint Orin’s cathedral" }).click();
  expect((await state(page)).position[0]).toBeLessThan(-40);
  await page.keyboard.press("Escape");
  await expect(page.locator("#menu")).toBeVisible();
  const seed = (await state(page)).seed;
  await page.locator("#shuffle").click();
  expect((await state(page)).seed).not.toBe(seed);
  expect((await state(page)).removed).toBe(0);
  expect(errors).toEqual([]);
});
for (let i = 0; i < 12; i++)
  test(`tool ${i + 1} hits or places a detonatable charge`, async ({
    page,
  }) => {
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await ready(page);
    await page.locator("#play").click();
    await page.keyboard.press(
      ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="][i],
    );
    await page.keyboard.press("f");
    await page.evaluate(() => window.__mindblast.teleport(12, 8, 30));
    await page.waitForFunction(() => window.__mindblast.state.cooldown === 0);
    await page.evaluate(() => window.__mindblast.aimAt(12, 6, 9.75));
    await page
      .locator("canvas")
      .first()
      .dispatchEvent("pointerdown", { button: 0 });
    await page
      .locator("canvas")
      .first()
      .dispatchEvent("pointerup", { button: 0 });
    if (i === 7) await page.keyboard.press("x");
    await expect
      .poll(async () => (await state(page)).score, { timeout: 20000 })
      .toBeGreaterThan(0)
      .catch(async (e) => {
        console.log("SHOT DIAGNOSTICS", await state(page));
        throw e;
      });
    expect((await state(page)).weapon).toBe(i);
    expect((await state(page)).weaponModel).toBe(i);
    expect(errors).toEqual([]);
  });
test("three-minute mode finishes and can return to sandbox", async ({
  page,
}) => {
  await ready(page);
  await page.locator('[data-mode="challenge"]').click();
  await page.locator("#play").click();
  await page.evaluate(() => window.__mindblast.setRemaining(0.2));
  await expect(page.locator("#results")).toBeVisible();
  await page.locator("#keepPlaying").click();
  expect((await state(page)).mode).toBe("sandbox");
  expect((await state(page)).playing).toBe(true);
});
test("LAN clients share destruction and a late join receives the damaged world", async ({
  browser,
}) => {
  const ctx = await browser.newContext(),
    a = await ctx.newPage(),
    b = await ctx.newPage();
  const room = "BROWSER-" + Date.now();
  async function join(p) {
    await ready(p);
    await p.locator("#friends").click();
    await p.locator("#room").fill(room);
    await p.locator("#join").click();
    await p.waitForFunction(() => window.__mindblast.state.connected);
  }
  try {
    await join(a);
    await join(b);
    await a.evaluate(() =>
      window.__mindblast.blast({ x: 12, y: 2, z: 9.75 }, 0),
    );
    await expect.poll(async () => (await state(b)).score).toBeGreaterThan(0);
    expect((await state(a)).removed).toBe((await state(b)).removed);
    const c = await ctx.newPage();
    await join(c);
    expect((await state(c)).score).toBe((await state(a)).score);
    expect((await state(c)).removed).toBe((await state(a)).removed);
    expect((await state(c)).players).toBe(2);
    const avatars = (await state(c)).avatars;
    expect(new Set(avatars.map((p) => p.avatar)).size).toBe(2);
    expect(avatars.map((p) => p.avatar).sort()).toEqual([0, 1]);
    await b.keyboard.press("6");
    await expect
      .poll(
        async () =>
          (await state(a)).avatars.find((p) => p.avatar === 1)?.weapon,
      )
      .toBe(5);
    await expect
      .poll(
        async () =>
          (await state(c)).avatars.find((p) => p.avatar === 1)?.weapon,
      )
      .toBe(5);
    await a.locator("#shuffle").click();
    await expect
      .poll(async () => (await state(b)).seed, { timeout: 30000 })
      .not.toBe("AFTERGLOW");
    expect((await state(b)).removed).toBe(0);
  } finally {
    await ctx.close();
  }
});
test("collision stops a walking player at a wall", async ({ page }) => {
  await ready(page);
  await page.locator("#play").click();
  await page.evaluate(() => {
    window.__mindblast.teleport(6, 1.65, 14);
    window.__mindblast.aimAt(6, 1.65, 0);
  });
  await page.keyboard.down("w");
  await page.waitForTimeout(900);
  await page.keyboard.up("w");
  expect((await state(page)).position[2]).toBeGreaterThan(10);
  expect((await state(page)).position[2]).toBeLessThan(13);
});

test("charges persist until one simultaneous detonation and blast settings work", async ({
  page,
}) => {
  await ready(page);
  await page.locator(".tuning summary").click();
  await page.locator("#setting-radius").fill("2");
  await page.locator("#setting-radius").dispatchEvent("input");
  expect((await state(page)).settings.radius).toBe(2);
  await page.locator("#play").click();
  await page.keyboard.press("8");
  await aim(page);
  await shoot(page);
  await expect.poll(async () => (await state(page)).charges).toBe(1);
  expect((await state(page)).removed).toBe(0);
  await page.waitForTimeout(350);
  await aim(page, 9, 1, 9.75);
  await shoot(page);
  await expect.poll(async () => (await state(page)).charges).toBe(2);
  await page.keyboard.press("x");
  await expect.poll(async () => (await state(page)).charges).toBe(0);
  expect((await state(page)).removed).toBeGreaterThan(500);
  expect((await state(page)).terrainRemoved).toBeGreaterThan(50);
});
test("walk up real stairs inside the citadel", async ({ page }) => {
  await ready(page);
  await page.locator("#play").click();
  await page.evaluate(() => {
    window.__mindblast.teleport(-3.75, 1.65, 3);
    window.__mindblast.aimAt(-3.75, 1.65, -12);
  });
  await page.keyboard.down("w");
  await expect
    .poll(async () => (await state(page)).position[1], { timeout: 5000 })
    .toBeGreaterThan(5);
  await page.keyboard.up("w");
  expect((await state(page)).fly).toBe(false);
});
test("exploration streams new procedural districts", async ({ page }) => {
  await ready(page);
  await page.locator("#play").click();
  const old = (await state(page)).blocks;
  await page.keyboard.press("f");
  await page.evaluate(() => window.__mindblast.teleport(250, 30, 0));
  await expect
    .poll(async () => (await state(page)).regions, { timeout: 15000 })
    .toBeGreaterThan(1);
  expect((await state(page)).blocks).toBeGreaterThan(old);
  expect((await state(page)).position[0]).toBe(250);
});
test("excavation opens a pit and underground crystals can be mined", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#play").click();
  await page.evaluate(() =>
    window.__mindblast.blast({ x: 0, y: -3, z: 34 }, 3),
  );
  await expect
    .poll(async () => (await state(page)).terrainRemoved)
    .toBeGreaterThan(20);
  await expect
    .poll(async () => (await state(page)).position[1])
    .toBeLessThan(-4);
  await page.keyboard.press("f");
  await page.evaluate(() => {
    const n = window.__mindblast.state.cave.nodes[0];
    window.__mindblast.teleport(n.x * 1.5, n.y * 1.5, n.z * 1.5);
    window.__mindblast.blast(
      { x: n.x * 1.5, y: n.y * 1.5 - 4, z: n.z * 1.5 },
      3,
    );
  });
  await expect
    .poll(async () => (await state(page)).crystals)
    .toBeGreaterThan(0);
});
test("static-host WebRTC invitation and answer synchronize terrain and charges", async ({
  browser,
}) => {
  test.skip(
    process.env.TEST_WEBRTC !== "1",
    "Direct UDP network required; run npm run test:peer explicitly",
  );
  const ctx = await browser.newContext(),
    a = await ctx.newPage(),
    b = await ctx.newPage();
  try {
    for (const p of [a, b]) {
      await ready(p);
      await p.locator("#friends").click();
      await p.locator("#peerPanel summary").click();
    }
    await a.locator("#peerInvite").click();
    await expect
      .poll(() => a.locator("#peerOut").inputValue(), { timeout: 20000 })
      .not.toBe("");
    await b.locator("#peerIn").fill(await a.locator("#peerOut").inputValue());
    await b.locator("#peerAnswer").click();
    await expect
      .poll(() => b.locator("#peerOut").inputValue(), { timeout: 20000 })
      .not.toBe("");
    await a.locator("#peerIn").fill(await b.locator("#peerOut").inputValue());
    await a.locator("#peerAccept").click();
    await expect
      .poll(async () => (await state(b)).connected, { timeout: 20000 })
      .toBe(true);
    await expect.poll(async () => (await state(a)).players).toBe(1);
    await a.evaluate(() =>
      window.__mindblast.blast({ x: 12, y: 2, z: 9.75 }, 0),
    );
    await expect.poll(async () => (await state(b)).score).toBeGreaterThan(0);
    expect((await state(a)).terrainRemoved).toBe(
      (await state(b)).terrainRemoved,
    );
    expect((await state(a)).removed).toBe((await state(b)).removed);
  } finally {
    await ctx.close();
  }
});

test("slow texture downloads do not block the playable world", async ({
  page,
}) => {
  const pending = [];
  await page.route("**/textures/**", (route) => {
    pending.push(route);
  });
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForFunction(() => window.__mindblast?.state.ready);
  expect((await state(page)).ready).toBe(true);
  expect(pending.length).toBeGreaterThan(0);
  for (const route of pending) await route.abort();
});

test("fallen rubble stops shots and can be destroyed again", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#play").click();
  await page.keyboard.press("5");
  await page.evaluate(() =>
    window.__mindblast.blast({ x: 12, y: 2, z: 9.75 }, 0),
  );
  const hit = await page.evaluate(() => {
    const game = window.__mindblast;
    for (const target of game.rubbleTargets)
      for (const direction of [
        { x: 0, y: -1, z: 0 },
        { x: 1, y: 0, z: 0 },
        { x: -1, y: 0, z: 0 },
        { x: 0, y: 0, z: 1 },
      ]) {
        const origin = {
          x: target.x - direction.x * 4,
          y: target.y - direction.y * 4,
          z: target.z - direction.z * 4,
        };
        if (!game.trace(origin, direction, 5)?.rubble) continue;
        game.teleport(origin.x, origin.y, origin.z);
        game.aimAt(target.x, target.y, target.z);
        document
          .querySelector("#game")
          .dispatchEvent(
            new PointerEvent("pointerdown", { button: 0, bubbles: true }),
          );
        document
          .querySelector("#game")
          .dispatchEvent(
            new PointerEvent("pointerup", { button: 0, bubbles: true }),
          );
        return game.state.shotDebug.hit;
      }
    return null;
  });
  expect(hit?.rubble).toBe(true);
  await expect
    .poll(async () => (await state(page)).rubbleDestroyed)
    .toBeGreaterThan(0);
});

test("a shot fired against a nearby wall hits its front face", async ({
  page,
}) => {
  await ready(page);
  await page.locator("#play").click();
  await page.keyboard.press("f");
  await page.keyboard.press("5");
  await page.waitForFunction(() => window.__mindblast.state.cooldown === 0);
  const distance = await page.evaluate(() => {
    const game = window.__mindblast,
      hit = game.trace({ x: 8, y: 3, z: 30 }, { x: 0, y: 0, z: -1 });
    if (!hit) throw Error("Missing test wall");
    game.teleport(hit.x, hit.y, hit.z + 0.2);
    game.aimAt(hit.x, hit.y, hit.z - 0.5);
    document
      .querySelector("#game")
      .dispatchEvent(
        new PointerEvent("pointerdown", { button: 0, bubbles: true }),
      );
    document
      .querySelector("#game")
      .dispatchEvent(
        new PointerEvent("pointerup", { button: 0, bubbles: true }),
      );
    return game.state.shotDebug.hit.distance;
  });
  expect(distance).toBeLessThan(0.3);
  await expect.poll(async () => (await state(page)).removed).toBeGreaterThan(0);
});
