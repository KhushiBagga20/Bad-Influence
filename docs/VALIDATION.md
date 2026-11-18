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

## Lights out: dark museum (18 November 2026)

- `npm run typecheck`, `npm test` (34 passed, 1 network test skipped without a server; 9 new dark-museum tests), `npm run build` and `npm run test:production` (production HTML, guide, health and the real WebSocket test) all passed.
- New tests cover: cops receive no position or disguise for thieves outside their light; disguised thieves reach cops only as anonymous props identical in shape to real ones; cops are blind during the head start; pocketed loot is never sent to cops; arrests land only on the targeted object (real prop = miss and 5s cooldown, player-id arrests of disguised thieves rejected, aiming away rejected); beams stop at walls and pass doorways; aim input validation; no server-only fields in snapshots; sprint noises are anonymous and fade.
- Browser playtest with two tabs (one cop, one thief) on the original map: the cop's screen was dark with a floor plan during the head start, then showed the wall-clipped beam and glow. A disguised thief and the real statue next to it looked identical in the beam, with no name, ring or extra shadow. Arresting the real statue gave the 5-second miss; arresting the fake one captured the thief and the cops won. The thief's view was dimmed with the beam cut out, checked by sampling the darkness texture's pixels.
- Found and fixed during the playtest: Phaser 3.90's `RenderTexture.resize()` does not resize the WebGL texture, so the darkness stayed 16×16 and stretched with no beam cut out. The darkness texture is now recreated when the view size changes.
- Not verified: more than two players, phones/touch aiming, sustained frame rate on low-end devices, and balance (beam size, reach, miss cost, head start).

## Pixel art and corkboard lobby (18 November 2026)

- `npm run typecheck`, `npm test` (34 passed, 1 network test skipped), `npm run build` and `npm run test:production` passed. The pixel atlas and its credits file are copied into the build.
- Browser checks with three tabs: the title scene (pixel floor, sprites, sweeping cop) at 800 × 600; the lobby at 1280 × 860 (three columns, everything on one screen), 800 × 600 and a 375 × 812 phone (one column, no horizontal scroll, string hidden, one WANTED slot). A second player joining showed their mugshot in their own colour, a READY stamp once ready, a second string to the target, and the non-host wording with the map choice disabled.
- In a round on the Velvet Vault: the thief walked with facing sprites and a tinted shirt; pressing Q beside a plant turned them into a plant drawn from the same sprite as the real one (the colour ring is drawn only for thieves); the cop's sprite and pixel-font name showed in the beam after the head start.
- Not verified: the walk cycle at full frame rate (the test pane was hidden, so frames were throttled), more than two players in a round, and a real phone.

## Pixel HUD, help and front-page results (18 November 2026)

- `npm run typecheck`, `npm test` (34 passed, 1 network test skipped), `npm run build` and `npm run test:production` passed.
- Two-tab round: the LIGHTS OUT card in both roles, the HUD panels, keycaps and crew colours at 1000 × 640, the help overlay (focus on Close, Escape closes it), the cop's arrest count, and the radio box typing out a real server message. With touch controls on in an 812 × 375 window, short landscape screens now get the landscape-phone layout (mission line at the top, crew card hidden), which removed an overlap.
- All three front pages (robbed, arrested, lockdown) were rendered from hand-made results states through a temporary page hook, since removed, at 1000 × 640 and a 375 × 812 phone.
- Removed 53 CSS rules for classes from the old home, lobby and results screens that nothing uses.
- Not verified: a real phone, and the stamp animation at full frame rate.
