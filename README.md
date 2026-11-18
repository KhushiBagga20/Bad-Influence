# 🎨 Bad Influence — *Petty Theft*

> A real-time, multiplayer cops-and-thieves museum heist for 2–6 players. No accounts. No downloads. Just vibes and very questionable art.

Built with **TypeScript**, **Phaser 3**, **Express**, and **Socket.IO**.

---

## Screenshots

<p align="center">
  <img src="docs/screenshots/textured-gameplay.jpg" alt="Textured Gameplay" width="48%" />
  <img src="docs/screenshots/gameplay.jpg" alt="Gameplay" width="48%" />
</p>
<p align="center">
  <img src="docs/screenshots/mobile.jpg" alt="Mobile View" width="40%" />
</p>

---

## 🕹️ How to Play

### Competitive Mode (Default): Lights Out
Prop hunt in a dark museum. Players are randomly assigned roles each match:
- **Thieves** see the whole museum, turn into nearby props, steal art, rescue teammates, and escape in the van
- **Cops** see only what their flashlight lights up, and arrest by pointing at the exact object they suspect

Thieves get a **30-second head start** while the cops' screens stay dark. After that:
- A cop's beam reaches 300 units and is blocked by walls; a small glow around each cop shows their surroundings. A faint floor plan helps them navigate.
- **E** (or a left click) arrests whatever the beam is pointed at, within reach. The target gets a blue ring. Arresting a real prop is a miss and locks arrests for 5 seconds.
- Thieves see the cops' beams. Moving in the dark is safe; a prop that moves inside a beam is a giveaway.
- Sprinting is loud: cops see gold footstep ripples near where a thief is sprinting, but not who it is.

**Thieves win** by depositing the displayed loot quota and extracting all free teammates.  
**Cops win** by capturing all thieves or waiting out the timer.

### Co-op Mode
All players are thieves working together against AI guards. Steal at least **\$2,400** in loot, then interact with the van to escape. All free, connected thieves must escape.

### Controls

| Action | Keyboard | Mobile |
|--------|----------|--------|
| Move | WASD / Arrow Keys | Virtual joystick |
| Aim flashlight (cops) | Mouse (or movement direction) | Joystick direction |
| Interact / Arrest (cops) | E, or left click for cops | Action button |
| Sprint | Space | Action button |
| Disguise / Transform | Q | Action button |
| Drop loot | R | Action button |
| Mute sound | — | Toggle in HUD |

### Tips
- 🔦 **Freeze in the beam**: cops can't see you in the dark, but they can see a statue walk
- 👟 **Don't sprint near cops**: footsteps carry through the dark
- 🚔 **Cops: guess carefully**: a wrong arrest costs 5 seconds, and everyone sees the message
- 🪑 **Stay still** while disguised — moving builds suspicion
- 🖼️ **Paintings** (\$700) need two carriers but block disguises
- 🎷 Use the **gramophone** to distract guards (25-second cooldown)
- 🔒 Rescue captured teammates by holding still at the holding room lock for 3 seconds

---

## 🚀 Getting Started

Requires **Node.js 22+**

```sh
git clone https://github.com/KhushiBagga20/Bad-Influence.git
cd Bad-Influence
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Open **separate tabs** for each local player, pick a nickname, create a room, and share the 4-letter code.

---

## 🧪 Development Commands

```sh
npm run dev            # Start backend + Vite dev middleware together
npm run dev:frontend   # Standalone Vite (requires backend running on :3000)
npm run typecheck      # TypeScript validation
npm run build          # Type-check + production frontend bundle
npm test               # Authoritative simulation unit tests
npm run test:production  # Launch, test, and stop a production server
NODE_ENV=production npm start  # Serve dist + Socket.IO in production mode
```

---

## 🗂️ Project Structure

```
Bad-Influence/
├── frontend/                   Browser app (Phaser, Vite)
│   ├── src/
│   │   ├── game-client.ts      Renderer, screens, controls, socket client
│   │   ├── museum-textures.ts  Pixel floor, generated at startup
│   │   ├── pixel-atlas.ts      Sprite frame rectangles (generated)
│   │   └── styles.css          Responsive lobby, HUD & touch styles
│   ├── public/
│   │   ├── assets/             pixel-museum.png sprite atlas + CREDITS.txt
│   │   └── how-to-play.html
│   └── vite.config.ts
├── backend/                    Authoritative multiplayer server
│   └── src/
│       ├── server.ts           HTTP, Socket.IO, rooms & simulation clock
│       ├── game-room.ts        Roles, movement, loot, arrests & outcomes
│       └── guard-navigation.ts NPC pathfinding for co-op mode
├── shared/
│   └── world.ts                Maps, collision, line-of-sight, types & constants
├── scripts/
│   └── build-pixel-atlas.py    Rebuilds the sprite atlas from the Kenney packs
├── tests/
│   ├── backend/                Simulation regression tests
│   └── integration/            Real Socket.IO client integration tests
├── docs/
│   ├── GAMEPLAY.md             Full rules & implementation notes
│   ├── VALIDATION.md           Verification records
│   └── screenshots/
├── Dockerfile                  Combined production container
├── render.yaml                 Render.com backend blueprint
├── vercel.json                 Vercel frontend config
└── .env.example                Environment variable reference
```

---

## 🌐 Deployment

### Frontend → Vercel
1. Import this repo into [Vercel](https://vercel.com)
2. Set root as the project root; `vercel.json` configures the build
3. Add env variable: `VITE_SERVER_URL=https://YOUR_BACKEND_HOST`
4. Deploy

### Backend → Render / Docker
- Use `render.yaml` for a one-click Render deploy
- Or build and run the `Dockerfile` on any persistent Node host
- Set `CLIENT_ORIGIN=https://your-vercel-app.vercel.app`
- Requires a **single, always-on replica** (Vercel Functions cannot host this)

> ⚠️ The backend holds all room state in memory. Restarts end all active games. Horizontal scaling requires shared state design — a Redis adapter alone is not sufficient.

### Environment Variables

See [`.env.example`](.env.example) for all configuration options.

| Variable | Where | Description |
|----------|-------|-------------|
| `PORT` | Backend | Server port (default: 3000) |
| `CLIENT_ORIGIN` | Backend | Allowed CORS origin for frontend |
| `VITE_SERVER_URL` | Frontend build | Backend WebSocket URL |
| `NODE_ENV` | Backend | Set to `production` for static serving |

---

## 🏗️ Architecture

- **Authoritative server** runs a 30 Hz simulation loop; clients send intents, never trusted positions
- **15 Hz snapshots**, filtered per role: thieves get the full state; cops get only what their team's flashlights could reveal. Hidden thieves arrive with no position, and disguised thieves come mixed in with the real props under anonymous per-round ids (see `Room.snapshot` in `backend/src/game-room.ts`)
- **Phaser 3** renders the client with interpolation and visual prediction (≤100 ms)
- **Reconnect tokens** in session storage restore player identity after page reload
- **Socket.IO rooms** isolate multiplayer sessions; up to 500 concurrent rooms

---

## 📋 Scope & Known Limitations

This is a small, playable first version — not a production-scale service.

- ✅ Competitive (cops vs thieves) and co-op modes
- ✅ 3 museum map variants, pixel art, touch controls
- ✅ Rescue, disguise, loot, extraction, rematches
- ⚠️ No matchmaking, accounts, or moderation
- ⚠️ High-latency connections may feel delayed (no full rollback prediction)
- ⚠️ Touch controls need broader physical-device testing
- ⚠️ No persistent room/score storage

---

## 🎨 Art credits

Characters, props and paintings come from two packs by [Kenney](https://www.kenney.nl), both CC0 (public domain): the [RPG Urban Pack](https://opengameart.org/content/rpg-urban-pack) and the [Roguelike Indoor pack](https://opengameart.org/content/roguelike-indoor-pack). `scripts/build-pixel-atlas.py` turns them into the game's 4 KB atlas. It recolours the cop's uniform, adds the thief's mask and a shirt layer tinted with each player's colour, turns a character into the stone statue, and puts the loot on plinths. To rebuild it, download both packs, unzip them, then run `python3 scripts/build-pixel-atlas.py <urban dir> <indoor dir>`.

---

## 📄 License

Private project — all rights reserved.
