# 🎨 Bad Influence — *Petty Theft*

> A multiplayer prop hunt for 1–10 players. Two teams take turns as **thieves** hiding as the furniture and **police** hunting them down, across three big maps. No accounts, no downloads.

Built with **TypeScript**, **Phaser 3**, **Express** and **Socket.IO**. The server is authoritative for everything; clients send inputs and draw what they're allowed to see.

---

## How a match works

- **Two persistent teams**, the Magpies and the Raccoons, split at random when the match starts (5 v 5 with bots filling empty seats).
- **Roles swap every round**: Team A are thieves in round 1 and police in round 2, and so on. First team to **3 round wins** (host can pick 1–5) takes the match.
- **Rounds come in pairs** on the same map and layout, so both teams play the same board from both sides; maps rotate (or the crew votes) between pairs.
- Each round: **briefing** (6 s) → **preparation** (25 s, police locked in staging) → **play** (4 min) → **round result** → swap.
- **Police win** by catching every thief before time runs out. **Thieves win** if any thief is still free at the end, or if they finish the team tasks to open the exit and every remaining thief escapes.

| Thieves | Police |
|---|---|
| Copy a nearby prop (Q), mirror it to match (R) | Aim (mouse / right stick) and fire a capture blaster |
| Whistle every 25–35 s (with a countdown) — police hear roughly where | Wrong shots heat the blaster; too hot and it locks |
| Tasks (E): disable a security panel, forge an exhibit label, unlock the loading bay | Stun pulse (Q): freezes nearby thieves; disguises wobble |
| Decoy (F) ×2 makes fake sounds; smoke (Space) ×1 blocks sight and shots | Edge-of-screen arrows point toward sounds |

The full guide is at [`frontend/public/how-to-play.html`](frontend/public/how-to-play.html) (served at `/how-to-play.html`), and the rules and tuning live in [`shared/rules.ts`](shared/rules.ts).

---

## Run it locally

Requires **Node.js 22+**.

```sh
npm install
npm run dev
```

Open <http://localhost:3000>. Pick an alias, **Plan a heist**, then either:
- **Solo:** ready up and start; nine bots fill the room.
- **With friends:** share the four-letter code. For several players on one computer, open each in a **separate new tab** (not a duplicated tab, which copies the reconnect token).

Other commands:

```sh
npm run typecheck          # TypeScript
npm test                   # Rules, maps, bots, seats, and 10 real network clients against a spawned server
npm run build              # Typecheck + production client bundle (frontend/dist)
npm run test:production    # After a build: starts the production server, checks the page and guide, runs the network tests
NODE_ENV=production npm start   # Serve frontend/dist and the game server together
```

### Optional: OpenAI bot strategy

Bots play entirely on local logic. If you want, they can also ask OpenAI for an occasional strategic focus (thieves: hide, tasks, escape, decoy; police: patrol, sweep, guard):

```sh
cp .env.example .env    # then add OPENAI_API_KEY to .env (never commit it, never put it in a VITE_ variable)
npm run dev
```

- Only the server ever sees the key; `.env` is git-ignored and loaded with `--env-file-if-exists`.
- At most one request every 30 s per room, 8 per round, two in flight per server, a 4 s timeout and a 60 s back-off after errors. The game never waits for it.
- Requests carry no names, positions or hidden information, just counts and each bot's role. Responses are validated against the bot ids and allowed focus list.
- Set `OPENAI_BOTS_ENABLED=false` to switch it off. `OPENAI_BOT_MODEL` defaults to `gpt-4.1-mini`. These limits are not a spending cap; set a budget on your OpenAI account.

---

## Hosting (Vercel frontend + Render backend)

The game server is a long-running Socket.IO process. **Vercel can serve the web page but cannot run it**, so you need both:

1. **Backend on Render** (or any always-on Node / Docker host). Create a *Blueprint* from this repo; `render.yaml` sets it up (`npm ci --include=dev && npm run build`, `npm start`, health check `/health`).
   - `NODE_ENV=production`
   - `CLIENT_ORIGIN=https://your-app.vercel.app` (comma-separate several origins, e.g. a preview URL)
   - optional `OPENAI_API_KEY`, `OPENAI_BOTS_ENABLED`, `OPENAI_BOT_MODEL`
   - Run **one** instance. Matches live in memory: **a restart or redeploy ends every match**. Free instances that sleep take about a minute to wake on the first visit.
2. **Frontend on Vercel.** `vercel.json` builds `frontend/dist`. Set `VITE_SERVER_URL=https://your-backend.onrender.com` in the project's environment variables *before* building, then redeploy (it's baked into the bundle).
3. Open the Vercel URL. If the page can't reach the server it says so on the title screen.

Simpler alternative: skip Vercel and share the Render URL itself. With `NODE_ENV=production` the server serves the game page too, and no `VITE_SERVER_URL` or `CLIENT_ORIGIN` is needed.

The Dockerfile builds the same single-process server for other hosts. The proxy in front must allow WebSocket upgrades and keep connections open for at least 60 s.

---

## Project structure

```
shared/
  rules.ts          Phases, roles, teams, tuning numbers and the State type
  layout.ts         Grid maps: collision, line of sight, ray casts, pathfinding, seeded layouts, reachability checks
  maps.ts           The three maps (districts, doors, furniture, prop clusters, task spots) and prop kinds
backend/src/
  server.ts         Express + Socket.IO: rooms, sessions, reconnect, per-role broadcasts, 30 Hz tick
  game-room.ts      Seats, takeover, the match state machine, movement, win checks
  teams.ts          Balanced persistent teams, late joiners
  abilities.ts      Disguise, mirror, decoy, smoke, sound cues
  combat.ts         Capture blaster (ray vs walls, smoke, props, thieves), heat, stun pulse
  tasks.ts          Task progress, interruptions, clues, exit unlock
  visibility.ts     What police are sent (team vision, anonymous props, no hidden positions)
  bot-director.ts   Local bot play for both roles, using police-filtered views for police bots
  bot-planner.ts    Optional OpenAI strategy with validation and fallbacks
frontend/src/
  game-client.ts    Entry point
  scene.ts          Phaser rendering: map, props, characters, effects, police fog of war, aiming
  textures.ts       Bakes each layout into a pixel-art map texture (floors, 2.5D walls, furniture, lights)
  ui.ts             Title, lobby, map vote, HUD, briefing, round and match results, help, settings
  input.ts          Keyboard, mouse, thumbsticks and action buttons
  audio.ts          Synthesised effects, directional cues and generative music (separate volumes)
  net.ts            Socket connection, reconnect token, state store
scripts/build-pixel-atlas.py   Rebuilds the sprite atlas from the Kenney packs
tests/backend/                  Rules, match flow, seats, maps, bots
tests/integration/              Real Socket.IO clients (10 at once) against a spawned server
```

---

## Art and audio credits

Characters and most props come from two CC0 (public domain) packs by [Kenney](https://www.kenney.nl): the [RPG Urban Pack](https://opengameart.org/content/rpg-urban-pack) and the [Roguelike Indoor pack](https://opengameart.org/content/roguelike-indoor-pack). `scripts/build-pixel-atlas.py` turns them into a 4 KB atlas: it recolours the police uniform, gives thieves a mask and a shirt tinted per player, and turns a character into the stone statue. It also adds original pixel art in the same style for the arcade cabinets, claw machine, beach umbrella, life ring, stool, the three task objects, the decoy and the smoke. Floors, walls and furniture are generated in code. All sound and music is synthesised at runtime. See [`frontend/public/assets/CREDITS.txt`](frontend/public/assets/CREDITS.txt).

To rebuild the atlas, download both packs, unzip them, then run `python3 scripts/build-pixel-atlas.py <urban dir> <indoor dir>`.

---

## Limits

- One server process; no persistence, accounts, matchmaking or moderation. Restarts end matches.
- Police clients never receive hidden thieves' positions or where real props are outside their vision. Even so, a modified client can still see the jittered position of every sound (±240 units).
- Bot balance comes from simulated bot-vs-bot matches (thieves win about 30% of rounds). Human play will shift it; the numbers in `shared/rules.ts` are the knobs.
- Tested in a desktop browser at desktop and phone sizes, plus 10 headless network clients. Not yet tested on physical phones or over the public internet.

## License

Private project — all rights reserved (third-party art is CC0, see credits).
