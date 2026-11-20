/**
 * What each side is sent. Thieves get everything. Police get only what their team can see: thieves out of
 * sight arrive with no position, and disguised thieves in sight arrive as anonymous props mixed in with the
 * real ones (whose placement comes from a seed police never receive). Decoys and who made a sound are withheld.
 */
import { VISION, SMOKE, type Player, type PropState, type State, type Point } from '../../shared/rules.js';
import { los } from '../../shared/layout.js';
import { PROP_KINDS } from '../../shared/maps.js';
import type { Room } from './game-room.js';

/** Snapshot copy without server-only fields. */
export function publicPlayer(p: Player): Player {
    const { input, lastSeen, ...rest } = p;
    return rest as Player;
}
/** A thief as police know them: identity and team status only. */
export function hiddenPlayer(p: Player): Player {
    return { id: p.id, name: p.name, color: p.color, team: p.team, role: p.role, bot: p.bot, away: p.away, ready: p.ready, connected: p.connected, spectator: p.spectator, captured: p.captured, escaped: p.escaped, hidden: true, x: 0, y: 0, disguise: null, flip: false, aim: 0, moving: false, cooldown: 0, heat: 0, lockedFor: 0, stunnedFor: 0, boostFor: 0, decoys: 0, smokes: 0, stuns: 0, stunCooldown: 0, cueIn: 0, task: null, stats: p.stats };
}
const smokeBlocks = (room: Room, a: Point, b: Point) => room.state.smokes.some(k => {
    const dx = b.x - a.x, dy = b.y - a.y, len2 = dx * dx + dy * dy || 1, t = Math.max(0, Math.min(1, ((k.x - a.x) * dx + (k.y - a.y) * dy) / len2));
    return Math.hypot(a.x + dx * t - k.x, a.y + dy * t - k.y) < SMOKE.radius * 0.8;
});
/** Whether any police officer can see a point (range, walls and smoke). */
export function policeSee(room: Room, q: Point) {
    return room.state.players.some(e => e.role === 'police' && !e.spectator && Math.hypot(e.x - q.x, e.y - q.y) <= VISION.police && los(room.layout!, room.flags, e, q) && !smokeBlocks(room, e, q));
}

export function snapshotFor(room: Room, police: boolean): State {
    const s = room.state;
    if (!police || !s.match || !room.layout) return { ...s, players: s.players.map(publicPlayer), view: 'full' };
    const players: Player[] = [], props: PropState[] = [];
    for (const p of s.players) {
        if (p.role !== 'thief' || p.spectator) { players.push(publicPlayer(p)); continue; }
        if (p.captured || p.escaped) { players.push(hiddenPlayer(p)); continue; }
        const seen = policeSee(room, p);
        if (seen && !p.disguise) { players.push({ ...publicPlayer(p), cueIn: 0, decoys: 0, smokes: 0 }); continue; }
        players.push(hiddenPlayer(p));
        if (seen && p.disguise) props.push({ id: room.alias(p.id), kind: p.disguise, flip: p.flip, x: Math.round(p.x), y: Math.round(p.y), r: PROP_KINDS[p.disguise]?.r ?? 18, wobble: p.stunnedFor > 0 || undefined });
    }
    for (const q of s.props) if (policeSee(room, q)) props.push({ id: room.alias(q.id), kind: q.kind, flip: q.flip, x: q.x, y: q.y, r: q.r });
    // Sorted by place, so list order says nothing about which entries are real.
    props.sort((a, b) => a.x - b.x || a.y - b.y);
    return { ...s, players, props, decoys: [], sounds: s.sounds.map(({ owner, ...n }) => n), view: 'police' };
}
