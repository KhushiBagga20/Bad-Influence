/** Thief abilities (disguise, rotate, decoy, smoke) and the periodic sound cues every thief gives off. */
import { DISGUISE, DECOY, SMOKE, CUE, type Player, type Point } from '../../shared/rules.js';
import { los } from '../../shared/layout.js';
import { PROP_KINDS } from '../../shared/maps.js';
import { startTask } from './tasks.js';
import type { Room } from './game-room.js';

let ids = 0;
const nextId = (prefix: string) => prefix + (++ids).toString(36);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export function thiefAction(room: Room, p: Player, verb: string, arg: string) {
    const s = room.state;
    if (p.role !== 'thief') return;
    if (p.stunnedFor > 0) throw Error('You’re stunned!');
    switch (verb) {
        case 'disguise': {
            const prop = s.props.find(q => q.id === arg);
            if (!prop) return;
            if (p.cooldown > 0) throw Error(`Disguise ready in ${Math.ceil(p.cooldown)}s.`);
            if (dist(p, prop) > DISGUISE.range || !los(room.layout!, room.flags, p, prop)) throw Error('Get closer to copy that.');
            p.disguise = prop.kind; p.flip = prop.flip; p.cooldown = DISGUISE.cooldown; p.task = null;
            return;
        }
        case 'undisguise': p.disguise = null; return;
        case 'rotate': if (p.disguise) p.flip = !p.flip; return;
        case 'decoy':
            if (s.phase !== 'play') throw Error('Decoys unlock when the round starts.');
            if (p.decoys <= 0) throw Error('No decoys left.');
            p.decoys--; p.stats.decoys++;
            s.decoys.push({ id: nextId('d'), owner: p.id, x: p.x, y: p.y, age: 0, pinged: 0 });
            return;
        case 'smoke':
            if (s.phase !== 'play') throw Error('Smoke unlocks when the round starts.');
            if (p.smokes <= 0) throw Error('Smoke already used this round.');
            p.smokes--; p.boostFor = SMOKE.boost;
            s.smokes.push({ id: nextId('s'), x: p.x, y: p.y, age: 0 });
            return;
        case 'task': return startTask(room, p, arg);
        case 'cancel': p.task = null; return;
    }
}

/** A sound in the world. Its spot is nudged randomly so it points the police at an area, never a seat. */
export function emitSound(room: Room, at: Point, kind: string, owner?: string) {
    const a = room.random() * Math.PI * 2, d = room.random() * CUE.jitter;
    room.state.sounds.push({ id: nextId('n'), kind, x: Math.round(at.x + Math.cos(a) * d), y: Math.round(at.y + Math.sin(a) * d), age: 0, owner });
}

const DECOY_KINDS = ['whistle', 'plant', 'statue', 'bench', 'crate', 'bin'];
export function updateThieves(room: Room, dt: number) {
    const s = room.state, playing = s.phase === 'play';
    for (const p of s.players) {
        if (p.role !== 'thief') continue;
        p.cooldown = Math.max(0, p.cooldown - dt);
        p.stunnedFor = Math.max(0, p.stunnedFor - dt);
        p.boostFor = Math.max(0, p.boostFor - dt);
        if (!playing || p.spectator || p.captured || p.escaped) continue;
        p.cueIn -= dt;
        if (p.cueIn <= 0) {
            // The sound matches what you look like: a creaking bench, a rustling plant, or a plain whistle.
            emitSound(room, p, p.disguise && PROP_KINDS[p.disguise] ? p.disguise : 'whistle', p.id);
            p.cueIn = CUE.min + room.random() * (CUE.max - CUE.min);
        }
    }
    for (const d of s.decoys) {
        d.age += dt;
        if (d.pinged < DECOY.pings.length && d.age >= DECOY.pings[d.pinged]) { d.pinged++; emitSound(room, d, DECOY_KINDS[Math.floor(room.random() * DECOY_KINDS.length)], d.owner); }
    }
    s.decoys = s.decoys.filter(d => d.age < DECOY.life);
    for (const k of s.smokes) k.age += dt;
    s.smokes = s.smokes.filter(k => k.age < SMOKE.duration);
}
