import http from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { networkInterfaces } from "node:os";
import { WebSocketServer, WebSocket } from "ws";
import { GameSession } from "./src/session.js";
const production = process.env.NODE_ENV === "production";
const vite = production
  ? null
  : await (
      await import("vite")
    ).createServer({ server: { middlewareMode: true }, appType: "spa" });
const server = http.createServer(async (req, res) => {
  if (req.url === "/api/network") {
    res.setHeader("Content-Type", "application/json");
    res.end(
      JSON.stringify({
        addresses: Object.values(networkInterfaces())
          .flat()
          .filter((i) => i.family === "IPv4" && !i.internal)
          .map((i) => `http://${i.address}:${port}`),
      }),
    );
    return;
  }
  if (vite) return vite.middlewares(req, res);
  try {
    const url = new URL(req.url, "http://localhost");
    let file = path.resolve("dist", "." + decodeURIComponent(url.pathname));
    if (
      !file.startsWith(path.resolve("dist") + path.sep) &&
      file !== path.resolve("dist")
    )
      throw Error();
    if (url.pathname === "/" || !path.extname(file))
      file = path.resolve("dist/index.html");
    const data = await readFile(file);
    res.setHeader(
      "Content-Type",
      {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
        ".wasm": "application/wasm",
        ".woff2": "font/woff2",
        ".woff": "font/woff",
        ".jpg": "image/jpeg",
        ".png": "image/png",
      }[path.extname(file)] || "application/octet-stream",
    );
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
});
const rooms = new Map();
let nextId = 1;
const wss = new WebSocketServer({ server, path: "/play", maxPayload: 8192 });
wss.on("connection", (ws) => {
  let room, id;
  ws.on("message", (raw) => {
    try {
      const m = JSON.parse(raw);
      if (m.type === "join" && !id) {
        const code = String(m.room || "FRIENDS")
          .replace(/[^A-Za-z0-9-]/g, "")
          .toUpperCase()
          .slice(0, 20);
        if (!rooms.has(code)) {
          if (rooms.size >= 16) return ws.close(1008, "Server full");
          rooms.set(code, {
            session: new GameSession(
              String(m.seed || "AFTERGLOW").slice(0, 40),
            ),
            lastActive: Date.now(),
          });
        }
        room = rooms.get(code);
        id = String(nextId++);
        room.session.join(id, m.name, (msg) => {
          if (ws.readyState === WebSocket.OPEN)
            ws.send(
              JSON.stringify(
                msg.type === "welcome" ? { ...msg, room: code } : msg,
              ),
            );
        });
      } else if (id) {
        room.lastActive = Date.now();
        room.session.handle(id, m);
      }
    } catch {}
  });
  ws.on("close", () => {
    if (room && id) {
      room.session.leave(id);
      room.lastActive = Date.now();
    }
  });
  ws.on("error", () => {});
});
setInterval(() => {
  for (const [code, room] of rooms)
    if (!room.session.players.size && Date.now() - room.lastActive > 600000)
      rooms.delete(code);
}, 60000).unref();
const port = Number(process.env.PORT || 5173);
server.listen(port, "0.0.0.0", () => {
  console.log(`Mind Blast ready at http://localhost:${port}`);
  for (const i of Object.values(networkInterfaces()).flat())
    if (i.family === "IPv4" && !i.internal)
      console.log(`LAN: http://${i.address}:${port}`);
});
