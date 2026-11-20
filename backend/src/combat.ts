/** Police tools: a capture blaster checked along a ray against walls, smoke, props and thieves, and a stun pulse. */
import { BLASTER, STUN, SMOKE, type Player, type Point } from '../../shared/rules.js';
import { castRay, los } from '../../shared/layout.js';
import { PROP_KINDS } from '../../shared/maps.js';
import type { Room } from './game-room.js';

let ids = 0;
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
/** Hit radius by look, so a disguised thief and the real prop it copies are exactly as easy to hit. */
export const hitRadius = (kind: string | null) => kind ? (PROP_KINDS[kind]?.r ?? 18) + 6 : BLASTER.hitRadius;

/** Distance along a ray at which it first enters a smoke cloud, or Infinity. */
function smokeDistance(room: Room, o: Point, dx: number, dy: number) {
    let best = Infinity;
    for (const k of room.state.smokes) {
        const ox = k.x - o.x, oy = k.y - o.y, t = ox * dx + oy * dy, d2 = ox * ox + oy * oy - t * t, r = SMOKE.radius * 0.8;
        if (d2 > r * r) continue;
        const enter = t - Math.sqrt(r * r - d2);
        if (enter > 0 && enter < best) best = enter;
        if (ox * ox + oy * oy < r * r) best = 0;
    }
    return best;
}

export function shoot(room: Room, p: Player, angle: number) {
    const s = room.state;
    if (s.phase !== 'play') throw Error('Wait for the staging gate to open.');
    if (!Number.isFinite(angle)) return;
    if (p.lockedFor > 0) throw Error('Blaster overheated — let it cool!');
    if (p.cooldown > 0) return;
    p.cooldown = BLASTER.cooldown; p.aim = angle; p.stats.shots++;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    const limit = Math.min(castRay(room.layout!, room.flags, p, angle, BLASTER.range), smokeDistance(room, p, dx, dy));
    let best: { t: number; thief?: Player; prop?: boolean } | null = null;
    const test = (q: Point, r: number) => { const ox = q.x - p.x, oy = q.y - p.y, t = ox * dx + oy * dy; if (t <= 0 || t > limit + r) return null; return Math.abs(ox * dy - oy * dx) <= r ? t : null; };
    for (const q of s.players) {
        if (q.role !== 'thief' || q.spectator || q.captured || q.escaped) continue;
        const t = test(q, hitRadius(q.disguise));
        if (t !== null && (!best || t < best.t)) best = { t, thief: q };
    }
    for (const q of s.props) { const t = test(q, hitRadius(q.kind)); if (t !== null && (!best || t < best.t)) best = { t, prop: true }; }
    const end = (t: number) => ({ x: Math.round(p.x + dx * t), y: Math.round(p.y + dy * t) });
    const id = 'x' + (++ids).toString(36);
    if (best?.thief) {
        capture(room, p, best.thief);
        s.shots.push({ id, from: { x: p.x, y: p.y }, to: { x: best.thief.x, y: best.thief.y }, result: 'capture', age: 0, by: p.id });
        return;
    }
    // A wrong shot heats the blaster; too many in a row lock it for a moment.
    p.stats.misses++;
    p.heat = Math.min(1, p.heat + (best?.prop ? BLASTER.propHeat : BLASTER.emptyHeat));
    if (p.heat >= 1) { p.lockedFor = BLASTER.lock; s.message = `${p.name}’s blaster overheated.`; }
    s.shots.push({ id, from: { x: p.x, y: p.y }, to: end(best ? best.t : limit), result: best?.prop ? 'prop' : limit < BLASTER.range ? 'wall' : 'miss', age: 0, by: p.id });
}

export function capture(room: Room, police: Player, thief: Player) {
    const s = room.state, look = thief.disguise;
    thief.captured = true; thief.task = null; thief.disguise = null; thief.stats.captured++;
    thief.stats.survived += Math.round(room.elapsed);
    police.stats.captures++; room.bump(police, 'captures');
    s.message = `${police.name} caught ${thief.name}${look ? ` — the ${PROP_KINDS[look]?.label ?? look} was a thief!` : '!'}`;
}

export function stunPulse(room: Room, p: Player) {
    const s = room.state;
    if (s.phase !== 'play') throw Error('Wait for the staging gate to open.');
    if (p.stuns <= 0) throw Error('No stun charges left.');
    if (p.stunCooldown > 0) throw Error(`Stun ready in ${Math.ceil(p.stunCooldown)}s.`);
    p.stuns--; p.stunCooldown = STUN.cooldown;
    s.pulses.push({ id: 'u' + (++ids).toString(36), x: p.x, y: p.y, age: 0 });
    // Stunned thieves freeze and drop their task; a stunned disguise wobbles, which the police can see.
    for (const q of s.players) if (q.role === 'thief' && !q.spectator && !q.captured && !q.escaped && dist(p, q) <= STUN.radius && los(room.layout!, room.flags, p, q)) { q.stunnedFor = STUN.duration; q.task = null; }
}
