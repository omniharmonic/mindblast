# Mind Blast

A browser demolition playground with seeded architecture, excavatable terrain, crystal caves, twelve tools, and cooperative multiplayer. Walk through buildings, cut their foundations, place charges, or fly above an expanding landscape.

## Play locally

Requires Node.js 22.12+ and a desktop browser with WebGL 2. Chrome is used for verification.

```sh
npm ci
npm run dev
```

Open http://localhost:5173. For production, run `npm run build` then `npm start`. Set `PORT=5174` to choose another port. Initial terrain creation takes a few seconds. Laptop saver disables shadows; the fragment-detail setting controls the size of initial debris groups.

## GitHub Pages and friends

The included Pages workflow builds and publishes on pushes to `main`. In repository Settings → Pages, select **GitHub Actions**. All assets are bundled and use relative paths.

On the hosted game, open **Play with friends → Direct peer connection**:

1. The host creates an invitation and sends the code to a friend.
2. The friend pastes it, creates an answer, and sends the answer back.
3. The host pastes and accepts the answer. Both enter the playground.
4. For another friend, create a new invitation. Up to seven guests can join.

Keep the host tab open. This uses WebRTC data channels; GitHub Pages does not run a game server. STUN helps address discovery, but no relay/TURN service is provided. Same-LAN connections require a network without client isolation. If automatic discovery fails, each player can enter their own local IPv4 address in the optional LAN IP field before generating a fresh invitation/answer. Public internet connections across arbitrary routers are not guaranteed. The browser host owns world state; closing it ends the peer room.

Alternatively, run the Node server on one computer. Everyone opens its printed `http://<LAN-IP>:5173` address and joins the same room code. The Node server must remain running. Node rooms support host transfer, late join, shared settings, charges, terrain damage, and world expansion. They are intended for trusted friends, not an authenticated public service.

## Controls

| Control | Action |
| --- | --- |
| WASD / mouse | Move / look |
| Left click | Fire or place a charge |
| 1–9, 0, -, = | Select twelve tools |
| X | Detonate your placed charges together |
| Space / Shift | Jump / sprint |
| F | Toggle flight |
| Space / C while flying | Ascend / descend |
| Q | Slow motion |
| R | Return to the surface |
| M | Landmark map and travel |
| Esc | Menu |

Tools include rockets, scatter blasts, gravity wells, seismic pulses, precision beams, meteors, tunnel drills, demolition charges, thermobaric bombs, orbital lances, fault-line cutters, and supernovas. The host can tune radius, impulse, gravity, and the physical debris budget. Free roam has no timer; Demolition run scores a three-minute session.

## Characters and equipment

Every tool has a 3D first-person model with metallic surfaces, gloved hands, sights, and recoil. Multiplayer rooms assign up to eight distinct suit colors and helmet crests, numbered nameplates, walking animations, and visible equipped weapons. Appearances are consistent across clients and late joins.

## World and destruction

- Seeded castles, cathedrals, aqueducts, houses, manors, pagodas, observatories, windmills, amphitheatres, foundries, lighthouses, temples, clock towers, greenhouses, markets, fortresses, libraries, ziggurats, viaducts, and bathhouses. Dimensions, heights, arrangements, interiors, and furnishings vary. Buildings have front/back doorways, framed windows, sills and corner stonework, ceiling joists, interior partitions with doorways, furnished rooms, and stairs with landings.
- 0.75 m structural voxels and 1.5 m excavatable terrain. Procedural underground chambers, tunnels, entrances, and crystal formations continue into new regions.
- Exact grid traversal resolves shots against terrain and building faces; rotated-box tests also target fallen rubble at its current position. Projectiles check their full movement segment each frame, including close-range impacts. Terrain excavation can undermine foundations.
- Material-dependent finite support propagation starts at grounded foundations. Vertical compression carries farther than lateral bonds, so unsupported spans shed sections instead of hanging indefinitely. Gravity loads are shared across stronger neighboring connections. After supports are removed, overloaded piers crush and loads redistribute repeatedly until the remaining structure stabilizes. Pristine load paths have a safety margin so generated buildings begin stable. This is a gameplay approximation, not engineering-grade stress analysis.
- Detached connected sections become Rapier rigid bodies with exact merged cuboid colliders. Heavy sections receive less acceleration from blast impulses, fall under gravity, collide, and fracture further on hard impacts. Solver iterations are increased for stability. Rubble persists for the entire current world session, remains solid to the player, and can be shot again. Repeat blasts split blocks into smaller fragments while conserving their volume. Fragments retain orientation, angular motion, and material density. Sleeping bodies save simulation work; distant fragments pause when terrain collision is unloaded and resume when it returns. Fragment detail controls grouping, never deletion. Memory usage grows with demolition; resetting the world clears the rubble.
- Districts are requested ahead of the viewing direction. Terrain streams farther than the 105 m fog cutoff, keeping generation beyond normal visibility. Nearby terrain meshes are refreshed when new foundations flatten the ground. Mountain backdrops that intersected new districts have been removed; hills are part of the excavatable terrain, with broad ridges, shallow gullies, fine elevation variation, and blended foundation shoulders. Fast teleportation can still require a brief load; world data grows as exploration continues.
- World damage, charges, settings, and score are synchronized. Rubble motion and resting positions are simulated locally and may differ between players; late joiners receive structural damage but not existing rubble piles.
- Photo-derived diffuse, normal, and roughness textures are bundled; see [texture credits](public/textures/CREDITS.md). Crystals use a separate faceted mineral texture; rocks have fissure/moss detail and trees have needle textures and bark trunks. The visual style remains voxel-based rather than fully photorealistic.

Worlds live in memory. Reloading a solo game or closing the multiplayer host loses progress. The game is designed for mouse and keyboard, not touch controls.

## Verification

```sh
npm test
npm run build
npm start
# In another terminal:
npm run test:network
npm run test:browser
```

Use `TEST_BASE_URL` for another HTTP origin and `TEST_ORIGIN` for another WebSocket endpoint. Browser checks cover weapons, movement, stairs, charges, terrain mining, expansion, timed mode, and multiplayer. The WebRTC test is opt-in: run `npm run test:peer` on a network permitting direct UDP. It could not complete on this VPN-connected development host, even when Wi-Fi candidates were exposed in an isolated browser test. Node/WebSocket multiplayer is verified. Static peer pairing remains subject to a real-device LAN check; VPN routing and client isolation can prevent it. The game never requests microphone access.

The diagnostics surface `window.__mindblast` exists for repeatable local checks. Performance depends on the laptop, resolution, browser, and debris setting; use Laptop saver and fewer debris bodies on slower machines.

## Source layout

- `src/world.js`, `architecture.js`, `terrain.js`: deterministic geometry, damage, support, and caves.
- `src/main.js`, `structure.js`, `fragments.js`, `rubble.js`, `terrain-renderer.js`, `materials.js`: rendering, physics, controls, and streaming.
- `src/session.js`, `peer.js`, `server.mjs`: shared room authority, WebRTC, and Node/WebSocket transport.
- `tests/`: engine, network, and browser checks.

Inspired by [Matt Shumer’s Voxel Engine](https://www.spawn.co/@mattshumer/voxel-engine). Implementation is original, using Three.js, Rapier, Vite, and ws.

If using the separately installed Vercel CLI later, upgrade its outdated 61.0.0 version with `npm i -g vercel@latest` or `pnpm add -g vercel@latest`. Vercel is not required for this GitHub Pages deployment.
