import test from "node:test";
import assert from "node:assert/strict";
import WebSocket from "ws";
const origin = process.env.TEST_ORIGIN || "ws://localhost:5173/play";
async function client(room, seed = "NETWORK-TEST") {
  const ws = new WebSocket(origin),
    messages = [];
  ws.on("message", (b) => messages.push(JSON.parse(b)));
  await new Promise((resolve, reject) => {
    ws.on("open", resolve);
    ws.on("error", reject);
  });
  const wait = async (type, after = 0) => {
    const deadline = Date.now() + 5000;
    while (Date.now() < deadline) {
      const msg = messages.slice(after).find((m) => m.type === type);
      if (msg) return msg;
      await new Promise((r) => setTimeout(r, 15));
    }
    throw Error("Timed out waiting for " + type);
  };
  ws.send(JSON.stringify({ type: "join", name: "Tester", room, seed }));
  const welcome = await wait("welcome");
  return {
    ws,
    messages,
    wait,
    welcome,
    send: (m) => ws.send(JSON.stringify(m)),
  };
}
test("room synchronization, late join, host reset and host transfer", async () => {
  const room = "TEST-" + Date.now(),
    a = await client(room),
    b = await client(room);
  let c;
  try {
    assert.equal(a.welcome.seed, b.welcome.seed);
    assert.equal(b.welcome.host, a.welcome.id);
    a.send({ type: "blast", weapon: 0, point: { x: 12, y: 3, z: 9.75 } });
    const [ar, br] = await Promise.all([a.wait("blast"), b.wait("blast")]);
    assert.deepEqual(ar, br);
    assert.ok(ar.result.hit.length > 0);
    assert.ok(ar.score > 0);
    c = await client(room);
    assert.equal(c.welcome.score, ar.score);
    assert.equal(
      c.welcome.removed.length,
      ar.result.hit.length + ar.result.fallen.length,
    );
    const before = a.messages.length;
    b.send({ type: "reset", seed: "UNAUTHORIZED" });
    await new Promise((r) => setTimeout(r, 100));
    assert.equal(
      a.messages.slice(before).some((m) => m.type === "reset"),
      false,
    );
    a.send({ type: "move", position: { x: 1, y: 2, z: 3 }, yaw: 0.4 });
    const move = await b.wait("move");
    assert.deepEqual(move.position, { x: 1, y: 2, z: 3 });
    a.send({ type: "reset", seed: "FRESH-WORLD" });
    const reset = await b.wait("reset");
    assert.equal(reset.seed, "FRESH-WORLD");
    a.ws.close();
    const host = await b.wait("host");
    assert.equal(host.id, b.welcome.id);
  } finally {
    a.ws.close();
    b.ws.close();
    c?.ws.close();
  }
});
test("malformed payloads and invalid weapon inputs do not break the server", async () => {
  const a = await client("INVALID-" + Date.now());
  try {
    a.ws.send("not JSON");
    a.send({ type: "blast", weapon: 999, point: { x: 0, y: 0, z: 0 } });
    a.send({ type: "blast", weapon: 0, point: { x: "bad", y: 0, z: 0 } });
    a.send({ type: "blast", weapon: 0, point: { x: 12, y: 3, z: 9.75 } });
    const m = await a.wait("blast");
    assert.ok(m.score > 0);
  } finally {
    a.ws.close();
  }
});
