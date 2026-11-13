# Verification record

Tested locally on 13 November 2026 with Node 24.18.0. No public deployment was performed.

## Passed

- `npm run build`: TypeScript checking and Vite production compilation. Vite reports a large Phaser bundle (about 1.55 MB uncompressed / 363 KB gzip); this is a size advisory, not a failed build.
- `npm test`: 14 deterministic authoritative simulation tests passed. The optional network test is skipped without `TEST_SERVER_URL`.
- Real independent WebSocket clients against the development server: create/join, ready/start, movement, transformation visible to another client, separate-room isolation, identity-preserving reconnect, and mid-round spectator join passed.
- `npm run test:production`: production HTML, bundled JavaScript and health endpoint served successfully; independent WebSocket clients passed against the production server, including matching player and guard snapshots for the same server tick. The smoke test stops its own server.
- Browser QA in two independent sessions: created and joined one room, readied both players, started the round, moved with keyboard input, transformed into a plant, and observed the same disguised player in the second session.
- Sustained pointer input on the virtual joystick moved the player through the museum; action buttons and contextual prop prompts worked. A 390 × 844 browser viewport was inspected with touch controls enabled. Fixed narrow-width HUD/control overlap found during QA.
- Live client reload recovered the existing identity and in-progress round. Server continued ticking while the other tab was backgrounded.
- Source type check after final test additions passed. npm reported zero known dependency vulnerabilities during installation.

The deterministic tests cover normalized movement and wall collisions; wall-occluded sight; stationary disguise safety and moving disguise suspicion; transformations witnessed by guards; cooldowns; capture; rescue completion and cancellation; inventory limits; invalid-distance interactions; duplicate pickups and deposits; two-player steering; shared painting deposit credit; carrier disconnect; host transfer; reconnect identity; late join spectators; quota/extraction success; all-captured defeat; timeout; distraction cooldown; and room isolation.

## Remaining verification limits

- No physical phone/tablet test, no real touch multitouch/browser-background lifecycle test on iOS or Android. Responsive inspection used a desktop browser viewport and pointer input.
- No complete human-played seven-minute successful extraction or six-person playtest. Capture, rescue, shared carrying, deposits and end conditions were exercised in deterministic simulation; the browser playtest covered lobby, movement, disguise and controls.
- No internet deployment, HTTPS/WSS proxy verification, latency/loss simulation, container build execution or sustained concurrency/load test.
- No cross-browser matrix, screen-reader gameplay audit or balancing study.
- Optional cursed treasure is not implemented.

## Screenshots

- `screenshots/gameplay.jpg`: actual desktop gameplay after a networked transformation.
- `screenshots/mobile.jpg`: actual 390 × 844 client with touch controls enabled.

Development preview was stopped after verification. Run `npm run dev` to play again.

## Textured museum expansion

- Production build and typecheck passed after adding the sprite atlas and seeded floor texture.
- 25 simulation tests passed, including server-owned sprint timing/restrictions and walkable paths from the main museum to all new east-wing loot locations.
- Production smoke test passed: guide, HTML, bundled client, health, and independent multiplayer sessions.
- Two browser clients joined a new competitive match. Verified transparent prop/player rendering, textured floors, keyboard movement, nearby-copy prompts, sprint movement and cooldown feedback.
- Screenshot: `screenshots/textured-gameplay.jpg`.
- No physical-phone performance, complete-map human balance test or directional-animation verification was performed. Character sprites remain single-pose with movement bob.
