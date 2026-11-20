/**
 * Local, deterministic bot play for both roles, with optional OpenAI strategy on top (bot-planner.ts).
 * Thief bots read the full state, as any thief can. Police bots read exactly the filtered snapshot a human
 * officer receives: no hidden thief positions, anonymous props, sounds without owners.
 */
import { CUE, DISGUISE, TASK, VISION, type Player, type Point } from '../../shared/rules.js';
import { blocked, cellCenter, findPath, los, walkMask, CELL } from '../../shared/layout.js';
import { MAP_DEFS, mapDef } from '../../shared/maps.js';
import { planBots, type BotFocus } from './bot-planner.js';
import type { Room } from './game-room.js';

type Memory = {
    route: Point[]; goal: Point | null; repath: number;
    spot: Point | null; propId: string | null; prevCue: number; lastDecoy: number;
    seen: Map<string, Point & { t: number }>; suspicious: Set<string>; cleared: Set<string>;
    heard: (Point & { t: number; shots: number })[]; heardIds: Set<string>; stunnedNear: Point | null;
    patrol: number; patrolUntil: number; reactAt: number;
    /** Where the bot was a second ago, to notice when it's stuck. */
    check: Point & { t: number };
    lastThief: (Point & { t: number }) | null;
    relocating: boolean;
};
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);

export class BotDirector {
    private memory = new Map<string, Memory>();
    private focus = new Map<string, BotFocus>();
    private elapsed = 0; private thinking = 0; private nextPlan = 10; private pending = false; private requests = 0; private generation = 0;
    private mask: { key: string; mask: Uint8Array } | null = null;
    constructor(private room: Room) {}
    reset() { this.elapsed = 0; this.thinking = 0; this.nextPlan = 10; this.requests = 0; this.generation++; this.memory.clear(); this.focus.clear(); this.mask = null; }
    /** Bots vote at random for the next map. */
    vote() {
        const m = this.room.state.match!;
        for (const p of this.room.state.players) if (p.bot && !m.votes[p.id]) m.votes[p.id] = MAP_DEFS[Math.floor(this.room.random() * MAP_DEFS.length)].id;
    }
    update(dt: number) {
        const s = this.room.state;
        // With nobody human connected the round pauses its bots (the room closes after two minutes anyway).
        if (!s.players.some(p => !p.bot && p.connected)) return;
        this.elapsed += dt;
        this.plan();
        this.thinking -= dt;
        if (this.thinking > 0) return;
        this.thinking = 0.15;
        s.players.forEach((p, i) => {
            if (!p.bot || p.spectator || p.captured || p.escaped) return;
            try { if (p.role === 'thief') this.thief(p, i); else this.police(p, i); }
            catch { this.room.input(p.id, 0, 0); }
        });
    }
    /** Ask OpenAI for a focus per bot every ~30s, never blocking play; failures back off and stay local. */
    private plan() {
        const s = this.room.state;
        if (s.phase !== 'play' || this.pending || this.elapsed < this.nextPlan || this.requests >= 8 || !process.env.OPENAI_API_KEY || process.env.OPENAI_BOTS_ENABLED === 'false') return;
        const bots = s.players.filter(p => p.bot && !p.spectator && !p.captured && !p.escaped);
        if (!bots.length) return;
        this.pending = true; this.requests++; this.nextPlan = this.elapsed + 30;
        const generation = this.generation, thieves = s.players.filter(p => p.role === 'thief' && !p.spectator), done = s.tasks.filter(t => t.done).length;
        const me = bots[0], lead = s.match ? (s.match.scores[me.team!] - s.match.scores[me.team === 'A' ? 'B' : 'A']) : 0;
        planBots(bots.map(p => ({ id: p.id, role: p.role!, disguised: !!p.disguise, decoys: p.decoys, stuns: p.stuns })),
            { secondsLeft: Math.round(s.phaseTime), tasksDone: done, tasksRequired: s.required, exitOpen: s.exitOpen, thievesFree: thieves.filter(p => !p.captured && !p.escaped).length, scoreLead: lead })
            .then(plans => { if (generation === this.generation) { for (const [id, f] of plans) this.focus.set(id, f); s.botMode = 'openai'; } })
            .catch(() => { if (generation === this.generation) { s.botMode = 'fallback'; this.nextPlan = this.elapsed + 60; } })
            .finally(() => { this.pending = false; });
    }

    private mem(p: Player) {
        let m = this.memory.get(p.id);
        if (!m) { m = { route: [], goal: null, repath: 0, spot: null, propId: null, prevCue: p.cueIn, lastDecoy: -99, seen: new Map(), suspicious: new Set(), cleared: new Set(), heard: [], heardIds: new Set(), stunnedNear: null, patrol: this.memory.size, patrolUntil: 0, reactAt: 0, check: { x: p.x, y: p.y, t: this.elapsed }, lastThief: null, relocating: false }; this.memory.set(p.id, m); }
        return m;
    }
    private walk() {
        const r = this.room, key = `${r.flags.gateOpen}:${r.flags.exitOpen}:${r.state.props.length}`;
        if (this.mask?.key !== key) this.mask = { key, mask: walkMask(r.layout!, r.flags, r.collisionProps()) };
        return this.mask.mask;
    }
    /** Steer along a cached route; returns true on arrival. */
    private go(p: Player, goal: Point, m: Memory, near = 22) {
        if (dist(p, goal) < near) { this.room.input(p.id, 0, 0); return true; }
        if (!m.goal || dist(m.goal, goal) > 40 || this.elapsed > m.repath || !m.route.length) {
            m.goal = { ...goal }; m.repath = this.elapsed + 1.5;
            m.route = findPath(this.room.layout!, this.walk(), p, goal, this.room.flags, this.room.collisionProps());
        }
        // Stuck against something for a second: plan again from here.
        if (this.elapsed - m.check.t > 1) { if (dist(p, m.check) < 12) { m.route = []; m.goal = null; m.spot = m.spot && dist(p, m.spot) < 90 ? { x: p.x, y: p.y } : m.spot; } m.check = { x: p.x, y: p.y, t: this.elapsed }; }
        while (m.route.length > 1 && dist(p, m.route[0]) < 20) m.route.shift();
        const next = m.route[0];
        if (!next) { this.room.input(p.id, 0, 0); return false; }
        const dx = next.x - p.x, dy = next.y - p.y, n = Math.max(1, Math.hypot(dx, dy));
        this.room.input(p.id, dx / n, dy / n);
        return false;
    }
    private act(p: Player, action: string) { try { this.room.act(p.id, action); return true; } catch { return false; } }

    // ---- thieves ---------------------------------------------------------------------------------
    private thief(p: Player, index: number) {
        const r = this.room, s = r.state, m = this.mem(p), l = r.layout!, flags = r.flags;
        const police = s.players.filter(q => q.role === 'police' && !q.spectator);
        // Thieves can see every officer; freeze whenever one could see you.
        const threat = police.filter(q => dist(p, q) < VISION.police + 40 && los(l, flags, p, q)).sort((a, b) => dist(p, a) - dist(p, b))[0];
        const whistled = p.cueIn > m.prevCue + 5; m.prevCue = p.cueIn;
        if (p.stunnedFor > 0) { r.input(p.id, 0, 0); return; }
        const focus = s.exitOpen ? 'escape' : this.focus.get(p.id) ?? (index % 2 ? 'tasks' : 'hide');
        const nearby = police.some(q => dist(p, q) < 650);
        if (threat && s.phase === 'play') {
            const d = dist(p, threat);
            // Disguised and watched: freeze. Moving props get shot.
            if (p.disguise && !p.task) { r.input(p.id, 0, 0); return; }
            if (d < 260 && p.smokes > 0) { this.act(p, 'smoke'); m.spot = null; }
            else if (p.decoys > 0 && this.elapsed - m.lastDecoy > 12) { this.act(p, 'decoy'); m.lastDecoy = this.elapsed; }
            // Spotted out of disguise: run for a hiding place away from the officer.
            if (!m.spot || dist(m.spot, threat) < 500) this.pickSpot(p, m, police);
        } else if (nearby && !p.disguise && !p.task && p.cooldown <= 0 && s.phase === 'play') {
            // Police somewhere close but not looking: blend in with the nearest prop before moving on.
            const near = s.props.filter(q => dist(p, q) < DISGUISE.range - 10 && los(l, flags, p, q)).sort((a, b) => dist(p, a) - dist(p, b))[0];
            if (near) { this.act(p, 'disguise:' + near.id); r.input(p.id, 0, 0); return; }
        }
        // Just whistled and nobody's watching: move on before the police arrive, whatever the plan was.
        if (whistled && !threat && !nearby && !p.task && s.phase === 'play') { this.pickSpot(p, m, police); m.relocating = true; }
        if (m.relocating && m.spot) { if (dist(p, m.spot) > 24) { this.go(p, m.spot, m); return; } m.relocating = false; }
        if (focus === 'escape' && s.exitOpen) {
            if (p.disguise && !threat) this.act(p, 'undisguise');
            const e = mapDef(s.match!.mapId).exitZone;
            this.go(p, cellCenter(e[0] + Math.floor(e[2] / 2), e[1] + Math.floor(e[3] / 2)), m);
            return;
        }
        if (s.phase === 'play' && (focus === 'tasks' || focus === 'decoy') && !threat && !nearby) {
            if (p.task) { r.input(p.id, 0, 0); return; }
            const busy = new Set(s.players.filter(q => q.task).map(q => q.task!.id));
            const task = s.tasks.filter(t => !t.done && !busy.has(t.id) && police.every(q => dist(q, t) > 650)).sort((a, b) => dist(p, a) - dist(p, b))[0];
            if (task) {
                if (dist(p, task) <= TASK.range - 16 && los(l, flags, p, task)) { r.input(p.id, 0, 0); this.act(p, 'task:' + task.id); return; }
                this.go(p, task, m, 20);
                return;
            }
        }
        // Hide: stand beside a real prop and copy it, mirrored the same way.
        if (!m.spot) this.pickSpot(p, m, police);
        if (!m.spot) { r.input(p.id, 0, 0); return; }
        if (dist(p, m.spot) > 24) {
            // Travel disguised once the police are out; only during prep is it worth running in the open.
            if (p.disguise && s.phase === 'prep' && dist(p, m.spot) > 450) this.act(p, 'undisguise');
            this.go(p, m.spot, m);
            return;
        }
        r.input(p.id, 0, 0);
        const prop = s.props.find(q => q.id === m.propId);
        if (prop && p.disguise !== prop.kind && p.cooldown <= 0) this.act(p, 'disguise:' + prop.id);
        if (prop && p.disguise === prop.kind && p.flip !== prop.flip) this.act(p, 'rotate');
    }
    /** A free spot beside a real prop: not too far, away from police and from other hiding thieves. */
    private pickSpot(p: Player, m: Memory, police: Player[]) {
        const r = this.room, s = r.state, l = r.layout!, mask = this.walk();
        const taken = [...this.memory.entries()].filter(([id]) => id !== p.id).map(([, x]) => x.spot).filter(Boolean) as Point[];
        const score = (q: Point) => {
            const d = dist(p, q), cop = Math.min(9999, ...police.map(c => dist(c, q)));
            // During prep, spread out across the building; mid-round, keep moves short.
            const near = s.phase === 'prep' ? (d < 900 ? 900 - d : 0) : (d < 250 ? 400 : d > 1300 ? d - 1300 : 0);
            return near + (cop < 560 ? 3000 - cop : 0) + (taken.some(t => dist(t, q) < 200) ? 800 : 0) + r.random() * 300;
        };
        const ranked = [...s.props].sort((a, b) => score(a) - score(b)).slice(0, 14);
        for (const prop of ranked) for (const [ox, oy] of [[44, 0], [-44, 0], [0, 42], [0, -42], [34, 34], [-34, 34]]) {
            const spot = { x: prop.x + ox, y: prop.y + oy }, cx = Math.floor(spot.x / CELL), cy = Math.floor(spot.y / CELL);
            if (cx < 0 || cy < 0 || cx >= l.cols || cy >= l.rows || !mask[cy * l.cols + cx] || blocked(l, r.flags, spot.x, spot.y, 18, s.props)) continue;
            if (!findPath(l, mask, p, spot, r.flags, s.props).length && dist(p, spot) > 40) continue;
            m.spot = spot; m.propId = prop.id; m.route = []; return;
        }
    }

    // ---- police ----------------------------------------------------------------------------------
    private police(p: Player, index: number) {
        const r = this.room, s = r.state, m = this.mem(p), l = r.layout!, flags = r.flags;
        if (s.phase !== 'play') { r.input(p.id, 0, 0); return; }
        // The same redacted view a human officer gets.
        const view = r.snapshot(p.id);
        const fire = (target: Point, test = false, moving = false) => {
            // Aim like a person: worse at range and against a moving target.
            const d = dist(p, target), spread = 0.05 + d / 6000 + (moving ? 0.07 : 0);
            const angle = Math.atan2(target.y - p.y, target.x - p.x) + (r.random() + r.random() - 1) * spread;
            r.input(p.id, 0, 0, angle);
            if (d < (moving ? 320 : 460) && los(l, flags, p, target) && p.cooldown <= 0 && p.lockedFor <= 0 && (!test || p.heat < 0.3)) return this.act(p, 'shoot:' + angle.toFixed(4));
            this.go(p, target, m, 60);
            return false;
        };
        const thief = view.players.filter(q => q.role === 'thief' && !q.hidden && !q.captured && !q.escaped && !q.spectator).sort((a, b) => dist(p, a) - dist(p, b))[0];
        if (thief) m.lastThief = { x: thief.x, y: thief.y, t: this.elapsed };
        else if (m.lastThief && this.elapsed - m.lastThief.t < 1.5) {
            // A thief who vanished in plain sight probably just became the prop standing where they were.
            const swap = view.props.filter(q => dist(q, m.lastThief!) < 70).sort((a, b) => dist(a, m.lastThief!) - dist(b, m.lastThief!))[0];
            if (swap) m.suspicious.add(swap.id);
            m.lastThief = null;
        }
        if (thief) {
            // A short reaction delay keeps bots beatable.
            if (!m.reactAt) m.reactAt = this.elapsed + 0.5;
            if (this.elapsed >= m.reactAt) fire(thief, false, thief.moving); else this.go(p, thief, m, 80);
            return;
        }
        m.reactAt = 0;
        // Only a prop seen actually moving (or wobbling from a stun) is suspicious: no perfect long-term memory.
        for (const q of view.props) {
            const before = m.seen.get(q.id);
            // A real prop never moves; a sustained slide (not a twitch as you round a corner) gives a thief away.
            if ((before && this.elapsed - before.t < 3 && dist(before, q) > 25) || q.wobble) m.suspicious.add(q.id);
            if (!before || this.elapsed - before.t >= 3) m.seen.set(q.id, { x: q.x, y: q.y, t: this.elapsed });
        }
        const odd = view.props.filter(q => m.suspicious.has(q.id) && !m.cleared.has(q.id)).sort((a, b) => dist(p, a) - dist(p, b))[0];
        if (odd && p.heat < 0.7) { if (fire(odd, true)) { m.cleared.add(odd.id); m.suspicious.delete(odd.id); } return; }
        // Hear like a person: a direction and a rough distance, less sure the farther away it is.
        for (const n of view.sounds) if (!m.heardIds.has(n.id) && dist(p, n) < CUE.range) {
            m.heardIds.add(n.id);
            const d = dist(p, n) * (0.7 + r.random() * 0.6), a = Math.atan2(n.y - p.y, n.x - p.x) + (r.random() - 0.5) * 0.35;
            m.heard.push({ x: p.x + Math.cos(a) * d, y: p.y + Math.sin(a) * d, t: this.elapsed, shots: 0 });
        }
        m.heard = m.heard.filter(h => this.elapsed - h.t < 30);
        const focus = this.focus.get(p.id) ?? (index % 3 === 0 ? 'sweep' : 'patrol');
        if (s.exitOpen && (focus === 'guard' || index % 2 === 0)) {
            const e = mapDef(s.match!.mapId).exitZone;
            this.go(p, cellCenter(e[0] - 3, e[1] + Math.floor(e[3] / 2)), m, 60);
            return;
        }
        // At most two officers chase the same sound; the rest keep the map covered.
        const chasing = (h: Point) => [...this.memory.entries()].filter(([id, x]) => id !== p.id && x.goal && dist(x.goal, h) < 250).length;
        const lead = m.heard.filter(h => chasing(h) < 2).sort((a, b) => dist(p, a) - dist(p, b) - (focus === 'sweep' ? 0 : (b.t - a.t) * 20))[0];
        if (lead) {
            if (dist(p, lead) > 170) { this.go(p, lead, m, 40); return; }
            const around = view.props.filter(q => dist(q, lead) < 170 && !m.cleared.has(q.id)).sort((a, b) => dist(a, lead) - dist(b, lead));
            if (around.length >= 3 && p.stuns > 0 && p.stunCooldown <= 0 && (!m.stunnedNear || dist(m.stunnedNear, lead) > 300) && r.random() < 0.5) { this.act(p, 'stun'); m.stunnedNear = { ...lead }; return; }
            // Test-fire at what's nearest the sound while the blaster is cool; a real prop gets crossed off.
            // One guess per sound, then move on.
            // Like a person, often not sure enough to pull the trigger.
            if (around.length && lead.shots < 1 && lead.t > 0 && r.random() < 0.5) lead.t = -99;
            if (around.length && lead.shots < 1 && lead.t > 0 && p.heat < 0.3) { const q = around[0]; if (fire(q, true)) { m.cleared.add(q.id); lead.shots++; } return; }
            if (around.length && lead.shots < 1) { r.input(p.id, 0, 0); return; }
            m.heard = m.heard.filter(h => h !== lead);
        }
        // Patrol: cycle through districts, each officer starting somewhere different.
        const districts = mapDef(s.match!.mapId).districts.filter(d => !d.quiet);
        if (this.elapsed > m.patrolUntil) { m.patrol = (m.patrol + 1 + index) % districts.length; m.patrolUntil = this.elapsed + 22; }
        const d = districts[m.patrol].rect, goal = cellCenter(d[0] + Math.floor(d[2] / 2), d[1] + Math.floor(d[3] / 2) + 1);
        if (this.go(p, this.open(goal), m, 80)) m.patrolUntil = 0;
    }
    /** The nearest open floor to a point, so patrol goals never sit inside furniture. */
    private open(goal: Point) {
        const l = this.room.layout!, mask = this.walk();
        for (let rad = 0; rad < 8; rad++) for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) {
            const cx = Math.floor(goal.x / CELL) + dx, cy = Math.floor(goal.y / CELL) + dy;
            if (cx >= 0 && cy >= 0 && cx < l.cols && cy < l.rows && mask[cy * l.cols + cx]) return cellCenter(cx, cy);
        }
        return goal;
    }
}
