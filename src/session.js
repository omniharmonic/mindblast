import {
  generateWorld,
  ensureRegion,
  resolveShot,
  sanitizeSettings,
  DEFAULT_SETTINGS,
  WEAPONS,
} from "./world.js";
const validPoint = (p) =>
  p &&
  ["x", "y", "z"].every(
    (k) => Number.isFinite(p[k]) && Math.abs(p[k]) < 1000000,
  );
export class GameSession {
  constructor(seed = "AFTERGLOW") {
    this.world = generateWorld(seed);
    this.players = new Map();
    this.host = null;
    this.settings = { ...DEFAULT_SETTINGS };
    this.charges = [];
    this.serial = 0;
  }
  broadcast(msg, except) {
    for (const p of this.players.values()) if (p.id !== except) p.send(msg);
  }
  join(id, name, send) {
    if (this.players.size >= 8) throw Error("Room full");
    const p = {
      id,
      name: String(name || "Explorer").slice(0, 18),
      send,
      avatar: Array.from({ length: 8 }, (_, i) => i).find(
        (i) => ![...this.players.values()].some((p) => p.avatar === i),
      ),
      weapon: 0,
      position: { x: 0, y: 2, z: 34 },
      yaw: 0,
      lastShot: 0,
      lastExpand: 0,
    };
    this.players.set(id, p);
    this.host ||= id;
    send({
      type: "welcome",
      id,
      host: this.host,
      room: "LAN",
      seed: this.world.seed,
      removed: this.world.blocks.filter((b) => !b.alive).map((b) => b.id),
      terrainRemoved: [...this.world.terrain.removed],
      regions: this.world.regions,
      score: this.world.score,
      crystals: this.world.crystals,
      settings: this.settings,
      charges: this.charges,
      players: [...this.players.values()].map(({ send, ...p }) => p),
    });
    this.broadcast(
      {
        type: "player",
        id,
        name: p.name,
        position: p.position,
        avatar: p.avatar,
        weapon: p.weapon,
      },
      id,
    );
  }
  leave(id) {
    this.players.delete(id);
    this.broadcast({ type: "leave", id });
    if (this.host === id) {
      this.host = this.players.keys().next().value || null;
      this.broadcast({ type: "host", id: this.host });
    }
  }
  shot(point, weapon, player) {
    const events = resolveShot(this.world, point, weapon, this.settings);
    for (const event of events)
      this.broadcast({ type: "blast", weapon, player, ...event });
  }
  handle(id, m) {
    const p = this.players.get(id);
    if (!p || !m) return;
    if (m.type === "move" && validPoint(m.position) && Number.isFinite(m.yaw)) {
      p.position = m.position;
      p.yaw = m.yaw;
      if (Number.isInteger(m.weapon) && WEAPONS[m.weapon]) p.weapon = m.weapon;
      this.broadcast(
        {
          type: "move",
          id,
          position: p.position,
          yaw: p.yaw,
          weapon: p.weapon,
        },
        id,
      );
    }
    if (m.type === "settings" && this.host === id) {
      this.settings = sanitizeSettings(m.settings);
      this.broadcast({ type: "settings", settings: this.settings });
    }
    if (
      m.type === "blast" &&
      Number.isInteger(m.weapon) &&
      WEAPONS[m.weapon] &&
      m.weapon !== 7 &&
      validPoint(m.point)
    ) {
      const w = WEAPONS[m.weapon];
      if (Date.now() - p.lastShot < w.cooldown * 850) return;
      p.lastShot = Date.now();
      this.shot(m.point, m.weapon, id);
    }
    if (
      m.type === "charge" &&
      validPoint(m.point) &&
      this.charges.filter((c) => c.owner === id).length < 40
    ) {
      const charge = { id: String(++this.serial), owner: id, point: m.point };
      this.charges.push(charge);
      this.broadcast({ type: "charge", ...charge });
    }
    if (m.type === "detonate") {
      const chosen = this.charges.filter((c) => c.owner === id);
      this.charges = this.charges.filter((c) => c.owner !== id);
      this.broadcast({ type: "charges-cleared", ids: chosen.map((c) => c.id) });
      for (const c of chosen) this.shot(c.point, 7, id);
    }
    if (
      m.type === "expand" &&
      Number.isInteger(m.rx) &&
      Number.isInteger(m.rz) &&
      Math.abs(m.rx - Math.round(p.position.x / 240)) <= 1 &&
      Math.abs(m.rz - Math.round(p.position.z / 240)) <= 1 &&
      Date.now() - p.lastExpand > 500
    ) {
      p.lastExpand = Date.now();
      if (ensureRegion(this.world, m.rx, m.rz).length)
        this.broadcast({ type: "expand", rx: m.rx, rz: m.rz });
    }
    if (m.type === "reset" && this.host === id) {
      this.world = generateWorld(String(m.seed || "AFTERGLOW").slice(0, 40));
      this.charges = [];
      this.broadcast({ type: "reset", seed: this.world.seed });
    }
  }
}
