# Museum art pass

New asset: `frontend/public/assets/museum-atlas.png` (1536 × 1024, transparent RGBA, six 512 × 512 cells). Generated using the built-in image-generation tool, then refined with a background-removal edit. The runtime uses atlas frames for plants, benches, statues, bins, thieves and officers. Collision stays in shared code. `frontend/src/museum-textures.ts` creates a seeded marble floor material once at scene startup. Sprites are pooled, not allocated each frame.

Generation prompt: production-ready top-down stealth game atlas, three columns/two rows, isolated broad-leaf plant in terracotta, walnut/burgundy bench, bronze bust on marble pedestal, teal/brass bin, masked adult thief, navy-uniformed officer; elevated orthographic view, detailed hand-painted 3D materials, warm museum lighting, no text, actual transparent background. Refinement: remove background/glow/shadows, preserve all six positions and 1536 × 1024 canvas with true alpha.

Map expanded from 1680 × 1160 to 2640 × 1160 with two east-wing entrances, four rooms, additional props and loot. All three layout variants inherit the new wing. This is an expansion of the museum, not a set of completely new environments.

Sprint: Space or touch button; 1.4 seconds at 1.65× speed, 8-second cooldown. Available to either team, but not while disguised, carrying paintings, captured, spectating, escaped or during a cop briefing. Transforming cancels a burst. Server validates and owns timers; client prediction uses the same multiplier.

Limitations: the character art currently uses a single pose with movement bob, not directional walk animation. Loot displays and the van still use procedural artwork. Physical-phone performance, competitive balance and extended human playtesting remain unverified.
