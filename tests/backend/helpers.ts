import { Room } from '../../backend/src/game-room.js';
import { rng } from '../../shared/layout.js';
import type { Phase, Player } from '../../shared/rules.js';

/** A started match. With fillBots the other seats are bots; without, only the named humans play. */
export function match(opts: { humans?: number; fillBots?: boolean; wins?: number; map?: string; seed?: number } = {}) {
    const r = new Room('TEST', opts.fillBots ?? true);
    r.random = rng(opts.seed ?? 7);
    r.state.settings.map = opts.map ?? 'museum';
    if (opts.wins) r.state.settings.wins = opts.wins;
    const humans = Array.from({ length: opts.humans ?? 1 }, (_, i) => r.join('Human ' + i));
    for (const h of humans) h.p.ready = true;
    r.start(humans[0].p.id);
    return { r, humans };
}
export function advance(r: Room, phase: Phase, limit = 600) {
    for (let i = 0; i < limit * 30 && r.state.phase !== phase; i++) r.update(1 / 30);
    if (r.state.phase !== phase) throw Error(`never reached ${phase}, stuck in ${r.state.phase}`);
}
export const thieves = (r: Room) => r.state.players.filter(p => p.role === 'thief' && !p.spectator);
export const police = (r: Room) => r.state.players.filter(p => p.role === 'police' && !p.spectator);
/** Puts a player at a point and stops them. */
export function place(p: Player, x: number, y: number) { p.x = x; p.y = y; p.input = { x: 0, y: 0 }; }
export const tick = (r: Room, seconds: number) => { for (let i = 0; i < seconds * 30; i++) r.update(1 / 30); };
