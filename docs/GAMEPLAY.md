# Gameplay and implementation notes

This describes the current game: a team-based prop hunt with alternating roles, tasks and three maps. Earlier designs (co-op guards, loot and paintings, the flashlight-only dark museum) have been retired; their code is gone and their history is in git.

## Match structure

- **Teams.** At match start every seat (humans and bots) gets a stable team id, `A` (Magpies) or `B` (Raccoons). Humans are split evenly first; bots then balance the numbers (`backend/src/teams.ts`). Teams never reshuffle during a match; scores are kept per team id, never per role.
- **Roles.** `roleFor(team, round)`: Team A are thieves in odd rounds, police in even rounds. With ten seats that's five against five every round.
- **Rounds and pairs.** Rounds 1–2, 3–4, … are pairs played on the same map, public layout seed and secret prop seed. Between pairs the map is voted on (`settings.map = 'vote'`) or rotates from the host's choice.
- **Phases** (all server-timed, `shared/rules.ts → TIMING`): `lobby` → `vote` (12 s, or until every human has voted) → `briefing` (6 s) → `prep` (25 s) → `play` (map's `roundSeconds`, 240) → `roundEnd` (9 s) → next round or `matchEnd`. First to `settings.wins` (default 3, host picks 1–5).
- **Win checks** run once per tick after actions and movement, in a fixed order:
  1. If no thief took part, the police win.
  2. If no thief is still free: the thieves win when at least one escaped, otherwise the police win (everyone caught).
  3. If time is up with a thief still free, the thieves win.

  Shots are processed as they arrive, before the tick, so a capture on the final tick counts.

## Seats, bots, late joins and departures

- **Seats.** 10 seats at most (`MAX_PLAYERS`). With bots on, the match starts with every empty seat filled by a bot (labelled `Bot …`).
- **Late joins.** Someone joining mid-match takes over a bot seat: team, role, position, disguise and round state. Bots still in the round come first, then other bot seats, and last a seat kept warm for someone who dropped. With bots off, a late joiner sits on the smaller team as a spectator until the next round.
- **Disconnects.** With bots on, a bot keeps the seat (`away`) so team numbers never change. The reconnect token restores the human to the same seat and team; scores are untouched.
- **Leaving.** Leaving on purpose hands the seat to a bot for good.
- **Host.** The host is always a connected human.

## Thieves

| | Rule | Constant |
|---|---|---|
| Disguise | Copy a prop within 120 units with line of sight; changing again has a 6 s cooldown. The disguise keeps the source's orientation; `rotate` mirrors it. | `DISGUISE` |
| Movement | 175 u/s, or 115 disguised; ×1.5 for 2.5 s after smoke. | `SPEED` |
| Sound cues | Every 25–35 s (staggered by 3 s per thief at round start). The sound matches the disguise kind, or is a whistle. Its spot is jittered up to 240 units; police within 1100 hear it. The thief sees a countdown from 5 s. | `CUE` |
| Decoy | 2 per round. Two fake sounds at 1.5 s and 4.5 s. Police never receive decoys, only their sounds. | `DECOY` |
| Smoke | 1 per round. A 170-unit cloud for 4.5 s that blocks police sight and shots, plus the speed burst. | `SMOKE` |
| Tasks | Panel 4 s, label 3 s, loading 5.5 s. Start within 72 units with line of sight; this drops your disguise. Moving, stun, capture, leaving range or losing sight resets the progress. | `TASK` |
| Exit | Opens when `requiredTasks(thieves) = max(3, thieves + 1)` tasks are done (6 for five thieves). Thieves inside the exit zone escape. | |

Completing a task changes the object's look, sparkles there for 6 s, and the radio names the **district**, never the thief or their position.

## Police

| | Rule | Constant |
|---|---|---|
| Staging | Locked behind a gate during prep; the gate blocks movement and sight. No shots or stuns until play. | |
| Blaster | Ray from the officer along the aim, up to 560 units. Stopped by sight-blocking walls (low furniture doesn't block) and by smoke. The first thief or prop within the hit radius is hit. | `BLASTER` |
| Hit radius | Per look: a disguised thief and the real prop it copies are exactly as easy to hit. | `hitRadius()` |
| Heat | A real prop adds 0.55, an empty shot 0.12; heat decays at 0.09/s. At 1 the blaster locks for 4 s. 0.7 s between shots. | |
| Stun | 1 per round, 10 s cooldown. Thieves within 190 units with line of sight freeze for 2.2 s and lose task progress; a stunned disguise wobbles in the police view. | `STUN` |
| Vision | The team shares vision: 520 units with line of sight, blocked by smoke. | `VISION` |

## Hidden information (`backend/src/visibility.ts`)

Thieves (and everyone between rounds) get the full state. The police get a filtered snapshot:
- A thief they can't see arrives as a stub with no position (`hidden: true`, x = y = 0).
- A disguised thief they can see arrives only as an entry in `props`, under an anonymous id that is regenerated every round, mixed with the real props they can see and sorted by position.
- Props outside the police team's vision are not sent.
- Where real props sit comes from a **secret seed** the client never gets (the public seed only decides walls, passages and task spots), so the map code can't be diffed against it.
- Decoys are withheld, and sounds arrive without an owner.

Police bots read exactly this snapshot. Thieves' sound countdowns, decoy counts and smoke counts are zeroed for police.

## Maps (`shared/maps.ts`, `shared/layout.ts`)

- **Grid.** 88 × 54 cells of 48 units (4224 × 2592 world units). Crossing a map corner to corner is about 25–35 s of walking (checked by a test).
- **Layout.** Anything not carved as a district or door is wall. Furniture blocks have a "look", and low looks (desks, counters, tables, cabinets, fountains, railings) block movement but not sight.
- **Seeded variation.** The public seed opens 40–70% of the optional passages and picks three task spots per type, away from doorways. The secret seed places props from designer clusters, avoiding doorways, tasks, spawns, staging and the exit, with a small jitter.
- **Validation.** For every variation (tests run 30 seeds per map):
  - Every task, the exit, staging and every prop must be reachable from the thief spawn.
  - Staging must be sealed while the gate is shut, and the exit sealed while it's locked.
  - If a prop placement fails, props are dropped until it passes.
- **The three maps:**
  - **Grand Museum After Hours:** galleries, sculpture hall, modern wing, restoration rooms, grand foyer (spawn), courtyard with fountain, security wing (staging), archives, hall of curiosities, loading bay and dock (exit).
  - **Night Market:** stalls, lantern lane, cold storage and market office (staging), spice alley, food court (spawn), fishmongers, back alley, flower row, warehouse, delivery yard and gate (exit).
  - **Seaside Arcade:** maintenance corridor loop, neon hall, prize counter, retro room, staff room (staging), workshop, souvenir shop, café (spawn), bumper car rink, generator room, boardwalk, beach, pier gate (exit).

## Bots (`backend/src/bot-director.ts`)

- **Thief bots:**
  - Spread out during prep and stand beside a real prop as a copy of it, mirrored the same way.
  - Freeze whenever an officer could see them, and blend in when police are near but not looking.
  - Do tasks only when no officer is within 650 units, and relocate after whistling if nobody is watching.
  - Use smoke when spotted up close, drop decoys while fleeing, and head for the exit once it opens.
- **Police bots:**
  - Read the police snapshot only.
  - Fire at visible thieves after a short reaction delay with human-like spread (wider at range and against moving targets).
  - Flag props they watch move at least 25 units within 3 seconds, or that wobble after a stun.
  - Hear sounds as a fuzzy direction and distance. At most two investigate each sound, each takes one guess, and they sometimes hold fire.
  - Stun clusters of props now and then, guard the exit when it's open, and otherwise patrol districts.
- **OpenAI** (`bot-planner.ts`, optional): every ~30 s it picks a focus per bot from a fixed list, with a 4 s timeout, 8 requests per round, two in flight per server and a 60 s back-off. The request carries no positions or names.
- **Balance**, from simulated bot-only matches: thieves win about 30% of rounds, and rounds average about 170 s.

## Rendering and presentation (`frontend/src`)

- **Map art.** Each layout is baked once into a pixel-art texture at one pixel per 4 world units (`textures.ts`). That covers the floor material per district, 2.5D walls (top plus front face), furniture drawn by look, paintings on gallery walls, and dithered lamp pools.
- **Sprites.** Characters and props come from the 82-frame atlas. Thieves have a shirt layer tinted with the player's colour. Disguised teammates get a team-coloured marker in the thieves' view only.
- **Police fog.** Everything outside the team's vision polygons is dimmed (not blacked out), and props the server didn't send simply aren't there.
- **Effects.** Shot tracers, capture bursts, "just a prop" puffs, stun rings, smoke clouds, sound ripples, task sparkles, and a pulsing exit once it's open.
- **HUD.** Team scores with each team's current role, round and clock, your role and next role, the objective, task pips, exit state, minimap (own team only), ability buttons with uses and cooldowns, the heat bar, sound arrows, the radio, and a spectator camera.
- **Audio.** Everything is synthesised (`audio.ts`): cue sounds per prop kind, panned and attenuated, plus a generative music loop per map. Sound and music have separate volumes.
- **Touch.** A left movement stick, a right aim stick (letting go fires) and large buttons; the safe area is respected and portrait shows a rotate screen. Reduced motion turns off wobble, blinking, typing and stamps.
