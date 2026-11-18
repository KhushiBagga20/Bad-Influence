## Pixel art and the corkboard lobby

- **Sprites:** one atlas, `frontend/public/assets/pixel-museum.png` (frame rectangles in `frontend/src/pixel-atlas.ts`), built by `scripts/build-pixel-atlas.py` from Kenney's CC0 RPG Urban and Roguelike Indoor packs. Everything is drawn at 4 world units per art pixel (`PX`) with nearest-neighbour sampling; gameplay zoom is 1 (0.75 on narrow screens), so pixels stay square.
- **Characters** face up, down, left or right with a three-frame walk. Cops face their flashlight; everyone else faces where they last moved. Thieves have a separate greyscale striped-shirt layer tinted with the player's colour.
- **Disguises** go through the same `prop()` call as real props, so a disguised thief is pixel-identical to the real thing. The colour ring is drawn only for thieves.
- **Floor:** generated once at startup at one pixel per `PX` units: marble tiles per wing, rugs and inlays, with lamp pools and moonlight shaded by ordered dithering.
- **HUD:** dark pixel panels with notched corners (four hard box-shadows), keycaps for the keyboard hints, a segmented haul bar, and a status line coloured by danger (calm, hidden, careful, in trouble). Server messages and errors appear in a SECURITY RADIO dialogue box that types itself out (instantly with reduced motion). The head start shows a LIGHTS OUT card with the role and a countdown. Short landscape windows get the same compact layout as landscape phones.
- **Help:** a two-column manual (thieves, cops) with keycaps; Escape closes it.
- **Results:** tomorrow's front page of *The Petty Gazette*. The headline depends on how the round ended (robbed, furniture arrested, or lockdown), with a pixel photo drawn from the sprite atlas and printed in newsprint grey, a stamp with your own result, and the persons of interest with their scores.
- **Lobby:** a corkboard. The room code is on a sticky note, players are line-up mugshots with READY stamps, the map choice is a blueprint drawn as SVG from the map's walls, and red SVG string runs from each suspect to the target. On one-column phone layouts the string is skipped.

## Lights out: the dark museum (current competitive mode)

Competitive mode is now prop hunt in the dark. This supersedes the 12-second head start and the "inspect within 65 units" arrests described further down.

- **Head start:** 30 seconds (`HEAD_START`). Cops can't move or act, and their snapshot contains no thieves, props or loot.
- **Flashlights:** each cop has a beam (300 units, ±0.5 rad, `LIGHT` in `shared/world.ts`) clipped by walls, plus a 75-unit ambient glow. Cops aim with the mouse; on keyboard-only or touch the beam follows movement. The client sends `aim` with each input; the server stores it as `player.aim`.
- **What cops receive:** `Room.snapshot(true)`. Anything within 380 units of a cop with line of sight is sent (wider than the beam so nothing pops in when a cop turns). Thieves outside that are stubs with `hidden: true` and no position. Disguised thieves are not sent as players at all; they appear in `visibleProps` alongside the real props, all with anonymous ids regenerated each round, sorted by position. Pocketed loot is never sent, because it moves with its thief. Thieves, spectators and results screens get the full state.
- **Arrests:** the client sends `arrest:<id>` for the object its beam points at (closest to the beam's centre line within 130 units). The server re-checks reach, angle and line of sight with a little latency slack. A real prop costs a 5-second miss cooldown; a disguised thief can only be arrested through their prop id, never by player id. The van apron and rescue shield still protect thieves.
- **Rendering:** a `RenderTexture` filled with darkness each frame, with every beam erased from it. It's fully opaque for cops (plus a faint floor plan drawn above it) and 45% for thieves, who see the beams brightly.
- **Footsteps:** sprinting thieves leave `noises` (position jittered by ±25, no identity) that fade over 1.2 seconds and draw above the darkness.

Known limits: the static prop list ships in the client bundle, so a determined cheater could diff `visibleProps` against it. Fully closing that needs randomised prop layouts per round. Balance (beam size, reach, miss cost, head start) has only been tested with one cop and one thief.

## Round-flow and movement polish

Competitive rounds now give thieves a 12-second head start. Cops cannot move or inspect until it ends. Rescue grants five seconds of arrest protection, shown as a green shield. Role banners, objective guidance, a pulsing extraction zone and a last-30-second warning clarify the round.

The local player uses bounded, collision-aware visual prediction (at most 100 ms), with smoothing and movement-direction camera look-ahead. Shared paintings remain server-positioned. This is not full input replay/rollback; higher-latency and physical-device behavior still require playtesting. No new AI feature or API-key requirement was added.

# Competitive update — cops and thieves

The default room mode is now competitive. Earlier co-op notes below describe the retained simulation mode, not the default match.

- Server randomly assigns 1 cop for 2–5 players, or 2 cops for 6. Remaining players are thieves. Assignments reroll each match.
- Cops move at 155 units/sec; thieves at 180, disguises at 100. E inspects within 65 units with wall-aware line of sight. Arrests recharge in 2 seconds; missed inspections in 4. Disguised opponents have no name or colour ring for cops. Cops cannot steal, rescue or disguise.
- Thieves win by depositing the displayed quota and extracting all free connected thieves. Cops win on timeout or all thieves captured. The van apron is protected from arrests. Rescues still take 3 seconds.
- Three randomly selected museum variants: original museum, Velvet Vault and Midnight Archive. These share the base architecture, with different collision/visibility obstacles; they are not wholly distinct environments.
- Mobile touch controls use landscape. Portrait phones show a rotate prompt. No browser orientation-lock permission is required.

## Vercel frontend + persistent backend

1. Deploy the backend on a persistent Node host. A Render blueprint is included in `render.yaml`; Docker hosting also works. Set `CLIENT_ORIGIN` to your exact Vercel production origin, e.g. `https://petty-theft.vercel.app`. Use one replica, with no sleep during matches.
2. Import this repo into Vercel. `vercel.json` builds the Vite frontend into `dist`.
3. Set Vercel environment variable `VITE_SERVER_URL` to the backend HTTPS origin, e.g. `https://petty-theft-server.onrender.com`, then redeploy. This value is public and baked into the client build.
4. Open the Vercel URL on two different devices, create/join a room and verify movement. The server must support secure WebSocket upgrades. Preview deployment origins require corresponding backend origin configuration.

Vercel Functions do not run this persistent Socket.IO server. No public deployment has been performed. The frontend and backend are two deployments, and both are necessary.

No OpenAI integration is enabled yet. Do not put an API key in a VITE_ variable or browser code. A future AI feature should use a server-only OPENAI_API_KEY. The deterministic game needs no AI service.

## Update verification scope

Build and authoritative simulation checks cover the competitive rules and map collision isolation. The new visuals are incremental vector refinements, not an HD asset overhaul. Real-device landscape play, competitive balancing, latency prediction and public Vercel/backend integration still require verification. Earlier browser screenshots and validation records describe the prior co-op build.

---

# PETTY THEFT

A real, cooperative browser heist for 2–6 players. Thieves become furniture, steal questionable art, rescue each other, and make a shared getaway. One original museum, three AI guards, a seven-minute round, and no accounts.

## Run

Requires Node.js 22 or newer.

```sh
npm install
npm run dev
```

Open http://localhost:3000. Open a **separate new tab** for each local player, enter different aliases, create a room, and join using its four-letter code. Everyone readies up; the host starts. Reloading a tab reconnects its existing identity. Do not duplicate a tab after joining: browsers may copy session storage, which intentionally reconnects the same player.

```sh
npm run build                 # TypeScript check + production browser build
NODE_ENV=production npm start # Serves dist and Socket.IO together
npm test                      # Deterministic authoritative simulation checks
npm run test:production       # Launch, test, and stop a production server
TEST_SERVER_URL=http://localhost:3000 npm test # Also exercise independent WebSocket clients
```

`.env.example` lists all configuration. The default commands read exported environment variables; they do not automatically load `.env`. No secrets are required.

## Friends on other devices

**Same Wi-Fi:** run the server, find the computer's LAN IP in network settings, and share `http://YOUR_LAN_IP:3000`. All players open that address and use the same room code. The server binds to `0.0.0.0`; allow the port through the computer's firewall if prompted. Phones must be on the same network, without access-point isolation. `localhost` on a phone refers to the phone, not your computer.

**Remote friends:** deploy this repository to a continuously running Node/container host with public HTTPS and WebSocket support. Build with `npm ci --include=dev && npm run build`; run with `NODE_ENV=production npm start`. Configure `PORT` as required by the host. Share the resulting HTTPS URL and room code. The included Dockerfile can be used for a container deployment. **This repository has not been publicly deployed or verified from the internet.**

Keep frontend and backend on the same origin when possible. Socket.IO then automatically connects to the HTTPS origin with secure WebSockets (`wss://`), with HTTP long polling fallback. A reverse proxy must forward `/socket.io/`, support the HTTP Upgrade headers, and allow a read timeout over 45 seconds (60+ recommended). See [Socket.IO reverse proxy documentation](https://socket.io/docs/v4/reverse-proxy/).

For separate frontend hosting, set `VITE_SERVER_URL=https://your-game-server.example.com` **at build time**, and `CLIENT_ORIGIN=https://your-client.example.com` on the server. Rebuild after changing the client URL. Never connect an HTTPS client to an insecure HTTP backend.

Use **one server process / one replica**. State lives in process memory; restarts end all rooms. A static-only host or ordinary short-lived serverless function cannot run this server. Horizontal scaling requires room-aware routing and a shared room ownership design; a Socket.IO Redis adapter alone does not share simulation state. `/health` is available for host health checks. Keep the server awake during games.

## The rules

- Steal and deposit at least **$2,400**, then interact at the van with empty hands to escape. Every free, connected active thief must escape. Captured or disconnected thieves may be left behind. At least one thief must escape to win.
- Timeout at **7:00** or the entire connected crew being captured ends the round. The round continues when tabs background or disconnect. An entirely disconnected room is deleted after two minutes.
- WASD/arrows move; **E** interacts; **Q** copies the closest highlighted prop or becomes a thief again; **R** drops all carried loot. Touch devices get a virtual joystick and action buttons. Sound can be muted.
- Small loot is worth $200; carry up to two. It remains with you while disguised. Paintings are worth $700. The first carrier steers at 35 units/sec alone, or 125 with a second carrier. The second provides carrying power and follows one authoritative shared position. Either carrier drops the painting for both. Carrying a painting prevents disguises and small-loot pickups.
- All disguises retain the same 16-unit player collision radius; copying does not teleport or enlarge the player. Static props remain solid. Paintings use a larger shared footprint to keep carriers clear of walls.
- Still disguises avoid ordinary visual detection. Moving disguised thieves build suspicion; transforming in a guard's cone raises suspicion and does not erase it. Break line of sight until suspicion fades. Walls block actual guard sight; the drawn cones are clipped to those walls. The van apron is a guard-free extraction zone.
- Captured thieves wait in the holding room. A free teammate interacts with the lock and stands still for three seconds to rescue everyone. Moving cancels the lockpick. Players are never permanently eliminated before round end.
- The gramophone draws nearby guards to investigate for a distraction; it has a 25-second cooldown. Chasing guards ignore it.
- Late arrivals spectate and join the next round. Disconnects drop all loot immediately. A token in that tab's session storage restores the same identity on reconnect, without duplicating a player. A second connection with the token replaces the first. Host departure transfers host rights to a connected player.

## Architecture

- `shared/world.ts`: map, geometry, collision/LOS helpers, types, and constants.
- `backend/src/game-room.ts`: authoritative 30 Hz simulation; movement intentions, guard state machines, atomic loot actions, captures/rescues, scoring and round transitions.
- `backend/src/guard-navigation.ts`: walkable navigation grid and routing around walls/props.
- `backend/src/server.ts`: Express/Vite integration, Socket.IO room isolation, reconnect tokens, validation, action throttling, cleanup and 15 Hz snapshots.
- `frontend/src/game-client.ts`: Phaser WebGL/canvas procedural museum and characters, interpolated player rendering, follow camera, lobby, HUD, input, audio and results.
- `frontend/src/styles.css`: responsive interface and safe-area-aware touch controls.
- `tests`: deterministic simulation checks plus independent real Socket.IO sessions when `TEST_SERVER_URL` is set.

Clients send normalized movement intentions and named actions, never trusted positions, scores or captures. Server-side range, line-of-sight, capacity and phase checks decide interactions. Single-threaded atomic action handling prevents duplicate pickups and deposits. Reconnect credentials are never included in snapshots.

## Scope and limitations

This is a small playable first version, not a production-scale service. It has original procedural artwork, one map, all-thief co-op, three guards, four disguises, both loot types, rescue, distraction, extraction, rematches and sound feedback. The optional cursed treasure is deliberately omitted.

Rooms and scores are not durable. Reserved disconnected player slots remain until the next lobby or room cleanup. There is no matchmaking, account system, moderation or advanced abuse prevention. Rendering interpolates server state without full client-side prediction/rollback; high-latency connections can feel delayed. NPC navigation and difficulty need broader human playtesting. Touch controls need physical-device validation across browsers. HTTPS deployment, remote internet play and full six-player load remain unverified unless recorded in VALIDATION.md.
