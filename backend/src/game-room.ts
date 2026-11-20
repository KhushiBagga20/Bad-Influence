/**
 * One room: seats, the match state machine (lobby → vote → briefing → prep → play → round end → … → match end),
 * movement and win checks. Abilities, tasks, combat and per-role snapshots live in their own modules.
 */
import { randomUUID } from 'node:crypto';
import { MAX_PLAYERS, COLORS, TIMING, DEFAULT_WINS, SPEED, RADIUS, DECOY, SMOKE, STUN, CUE, BLASTER, TEAM_NAMES, requiredTasks, roleFor, thiefTeam, otherTeam, emptyStats, type State, type Player, type TeamId, type PropState, type Point } from '../../shared/rules.js';
import { MAP_DEFS, PROP_KINDS, layoutFor, mapDef } from '../../shared/maps.js';
import { chooseProps, spawnPoints, move, rng, CELL, type Layout, type Flags } from '../../shared/layout.js';
import { assignTeams, smallerTeam } from './teams.js';
import { thiefAction, updateThieves } from './abilities.js';
import { shoot, stunPulse } from './combat.js';
import { updateTasks } from './tasks.js';
import { snapshotFor } from './visibility.js';
import { BotDirector } from './bot-director.js';

export const BOT_NAMES = ['Bot Biscuit', 'Bot Pickle', 'Bot Noodle', 'Bot Waffle', 'Bot Pretzel', 'Bot Crumpet', 'Bot Dumpling', 'Bot Muffin', 'Bot Toffee', 'Bot Bagel'];

export class Room {
    state: State;
    /** Reconnect token → seat id. Bots have no token. */
    tokens = new Map<string, string>();
    layout: Layout | null = null;
    flags: Flags = { gateOpen: false, exitOpen: false };
    /** Secret seed for prop placement; never leaves the server. */
    secret = 0;
    /** Real prop and thief ids → per-round anonymous ids for police. */
    aliases = new Map<string, string>();
    vacantSince = 0;
    elapsed = 0;
    random = rng(Date.now() & 0xffffffff);
    bots = new BotDirector(this);
    private viewCache = new Map<string, State>();
    constructor(public code: string, fillBots = true) {
        this.state = { code, host: '', phase: 'lobby', phaseTime: 0, players: [], settings: { fillBots, wins: DEFAULT_WINS, map: 'vote' }, props: [], tasks: [], required: 0, exitOpen: false, gateOpen: false, decoys: [], smokes: [], sounds: [], shots: [], pulses: [], clues: [], message: '', tick: 0, botMode: 'local' };
    }

    // ---- seats -------------------------------------------------------------------------------
    player(id: string) { return this.state.players.find(p => p.id === id); }
    humans() { return this.state.players.filter(p => !p.bot && p.connected); }
    private newSeat(name: string, color?: string): Player {
        const used = new Set(this.state.players.map(p => p.color));
        return { id: randomUUID(), name: name.trim().slice(0, 16) || 'Sneaky Pete', color: COLORS.find(c => c === color && !used.has(c)) ?? COLORS.find(c => !used.has(c)) ?? COLORS[0], x: 0, y: 0, ready: false, connected: true, spectator: false, captured: false, escaped: false, disguise: null, flip: false, aim: 0, moving: false, cooldown: 0, heat: 0, lockedFor: 0, stunnedFor: 0, boostFor: 0, decoys: 0, smokes: 0, stuns: 0, stunCooldown: 0, cueIn: 0, task: null, input: { x: 0, y: 0 }, lastSeen: Date.now(), stats: emptyStats() };
    }
    /** Join, reconnect with a token, or take over a bot seat mid-match (inheriting its team and round state). */
    join(name: string, token?: string, color?: string) {
        const s = this.state, held = token ? this.tokens.get(token) : undefined, mine = held ? this.player(held) : undefined;
        if (mine) {
            Object.assign(mine, { bot: false, away: false, connected: true, lastSeen: Date.now(), input: { x: 0, y: 0 } });
            if (!this.player(s.host)?.connected || this.player(s.host)?.bot) s.host = mine.id;
            return { p: mine, token: token! };
        }
        let p: Player | undefined;
        if (s.match) {
            // Prefer seats that only ever held a bot; then seats left by someone who has gone.
            // Prefer a bot still in the round (so you get to play now), then any pure bot seat, then one held for someone who left.
            p = s.players.find(q => q.bot && !q.away && !q.captured && !q.escaped && !q.spectator) ?? s.players.find(q => q.bot && !q.away) ?? s.players.find(q => q.bot);
            if (p) {
                for (const [key, id] of this.tokens) if (id === p.id) this.tokens.delete(key);
                Object.assign(p, { bot: false, away: false, connected: true, name: name.trim().slice(0, 16) || 'New recruit', lastSeen: Date.now(), input: { x: 0, y: 0 } });
                if (color && !s.players.some(q => q !== p && q.color === color) && COLORS.includes(color)) p.color = color;
            }
        }
        if (!p) {
            if (s.players.length >= MAX_PLAYERS) throw Error('This room is full (10 players maximum).');
            p = this.newSeat(name, color);
            if (s.match) {
                // A late arrival joins the smaller team and watches until the next round.
                p.team = smallerTeam(s.players);
                p.spectator = true; p.role = roleFor(p.team, s.match.round); p.captured = false;
            }
            s.players.push(p);
        }
        const fresh = randomUUID();
        this.tokens.set(fresh, p.id);
        if (!s.host || !this.player(s.host)?.connected || this.player(s.host)?.bot) s.host = p.id;
        return { p, token: fresh };
    }
    /** A human's socket went away. Mid-match a bot keeps the seat (and the team's numbers) until they return. */
    disconnect(id: string) {
        const s = this.state, p = this.player(id);
        if (!p || p.bot) return;
        p.input = { x: 0, y: 0 }; p.lastSeen = Date.now(); p.task = null;
        if (s.match && s.settings.fillBots) { p.bot = true; p.away = true; }
        else p.connected = false;
        if (s.host === id) s.host = this.humans().find(q => q.id !== id)?.id ?? id;
    }
    /** Leaving on purpose gives the seat up for good. */
    leave(id: string) {
        const s = this.state, p = this.player(id);
        if (!p) return;
        for (const [key, seat] of this.tokens) if (seat === id) this.tokens.delete(key);
        if (s.match && s.settings.fillBots) { Object.assign(p, { bot: true, away: false, name: this.botName(), input: { x: 0, y: 0 }, task: null }); }
        else if (s.match) { p.connected = false; p.input = { x: 0, y: 0 }; }
        else s.players = s.players.filter(q => q.id !== id);
        if (s.host === id) s.host = this.humans()[0]?.id ?? '';
    }
    private botName() { const used = new Set(this.state.players.map(p => p.name)); return BOT_NAMES.find(n => !used.has(n)) ?? 'Bot ' + Math.floor(this.random() * 90 + 10); }

    // ---- input & actions -----------------------------------------------------------------------
    input(id: string, x: number, y: number, aim?: unknown) {
        const p = this.player(id);
        if (!p || !Number.isFinite(x) || !Number.isFinite(y)) return;
        const n = Math.max(1, Math.hypot(x, y));
        p.input = { x: x / n, y: y / n };
        if (typeof aim === 'number' && Number.isFinite(aim)) p.aim = Math.atan2(Math.sin(aim), Math.cos(aim));
        else if (Math.hypot(x, y) > 0.2) p.aim = Math.atan2(y, x);
    }
    act(id: string, action: string) {
        const s = this.state, p = this.player(id);
        if (!p || typeof action !== 'string' || action.length > 80) return;
        const [verb, arg = '', extra = ''] = action.split(':');
        if (s.phase === 'lobby') {
            if (verb === 'ready') { p.ready = !p.ready; return; }
            if (verb === 'start') return this.start(id);
            if (verb === 'settings' && id === s.host) return this.settings(arg, extra);
            return;
        }
        if (verb === 'vote' && s.phase === 'vote') { if (MAP_DEFS.some(m => m.id === arg)) s.match!.votes[id] = arg; return; }
        if (s.phase === 'matchEnd') {
            if (verb === 'rematch' && id === s.host) return this.newMatch();
            if (verb === 'lobby' && id === s.host) return this.toLobby();
            return;
        }
        if (s.phase !== 'prep' && s.phase !== 'play') return;
        if (p.spectator || p.captured || p.escaped) return;
        if (p.role === 'police') {
            if (verb === 'shoot') return shoot(this, p, Number(arg));
            if (verb === 'stun') return stunPulse(this, p);
            return;
        }
        thiefAction(this, p, verb, arg);
    }
    private settings(key: string, value: string) {
        const st = this.state.settings;
        if (key === 'bots') st.fillBots = value === 'on';
        else if (key === 'wins') { const n = Math.round(Number(value)); if (n >= 1 && n <= 5) st.wins = n; }
        else if (key === 'map' && (value === 'vote' || MAP_DEFS.some(m => m.id === value))) st.map = value;
        this.state.players.forEach(p => p.ready = false);
    }

    // ---- match flow --------------------------------------------------------------------------
    start(id: string) {
        const s = this.state, crew = this.humans();
        if (id !== s.host || s.phase !== 'lobby') return;
        if (crew.length < (s.settings.fillBots ? 1 : 2)) throw Error('Add bots or invite a friend: a match needs two players.');
        if (crew.some(p => !p.ready)) throw Error('Everyone must ready up first.');
        s.players = crew;
        this.newMatch();
    }
    private newMatch() {
        const s = this.state;
        s.players = s.players.filter(p => p.connected || p.bot);
        if (s.settings.fillBots) while (s.players.length < MAX_PLAYERS) { const p = this.newSeat(this.botName()); p.bot = true; p.ready = true; s.players.push(p); }
        for (const p of s.players) p.stats = emptyStats();
        assignTeams(s.players, this.random);
        s.match = { round: 1, scores: { A: 0, B: 0 }, mapId: s.settings.map === 'vote' ? MAP_DEFS[0].id : s.settings.map, seed: 0, votes: {}, results: [] };
        this.beginPair(true);
    }
    /** Rounds come in pairs on one map and layout, so both teams get the same board as thieves and as police. */
    private beginPair(first = false) {
        const s = this.state, m = s.match!;
        if (s.settings.map === 'vote') { s.phase = 'vote'; s.phaseTime = TIMING.vote; m.votes = {}; s.message = 'Vote for the next museum… or market, or arcade.'; return; }
        if (!first) { const i = MAP_DEFS.findIndex(d => d.id === m.mapId); m.mapId = MAP_DEFS[(i + 1) % MAP_DEFS.length].id; }
        this.newLayout();
        this.beginRound();
    }
    private finishVote() {
        const m = this.state.match!, tally = new Map<string, number>();
        // Humans decide; bots only break the silence when no human voted.
        const humanVotes = Object.entries(m.votes).filter(([id]) => !this.player(id)?.bot).map(([, v]) => v);
        for (const v of humanVotes.length ? humanVotes : Object.values(m.votes)) tally.set(v, (tally.get(v) ?? 0) + 1);
        const best = Math.max(0, ...tally.values()), top = MAP_DEFS.filter(d => (tally.get(d.id) ?? 0) === best);
        m.mapId = top[Math.floor(this.random() * top.length)].id;
        this.newLayout();
        this.beginRound();
    }
    private newLayout() {
        const m = this.state.match!;
        m.seed = 1 + Math.floor(this.random() * 1e6);
        this.secret = 1 + Math.floor(this.random() * 1e9);
    }
    private beginRound() {
        const s = this.state, m = s.match!, def = mapDef(m.mapId);
        const layout = this.layout = layoutFor(m.mapId, m.seed);
        this.flags = { gateOpen: false, exitOpen: false };
        s.gateOpen = false; s.exitOpen = false;
        s.props = chooseProps(layout, this.secret, PROP_KINDS);
        s.tasks = layout.tasks.map(t => ({ id: t.id, type: t.type, x: t.x, y: t.y, district: t.district, done: false }));
        s.decoys = []; s.smokes = []; s.sounds = []; s.shots = []; s.pulses = []; s.clues = [];
        this.aliases.clear();
        for (const p of s.players) {
            p.role = roleFor(p.team!, m.round);
            // Late arrivals from last round play from now on; seats without anyone in them sit out.
            p.spectator = !p.connected && !p.bot;
            Object.assign(p, { captured: false, escaped: false, disguise: null, flip: false, moving: false, cooldown: 0, heat: 0, lockedFor: 0, stunnedFor: 0, boostFor: 0, task: null, input: { x: 0, y: 0 }, decoys: DECOY.uses, smokes: SMOKE.uses, stuns: STUN.uses, stunCooldown: 0 });
        }
        const thieves = s.players.filter(p => p.role === 'thief' && !p.spectator), police = s.players.filter(p => p.role === 'police' && !p.spectator);
        const tSpawn = spawnPoints(layout, def.spawn, Math.max(1, thieves.length)), pSpawn = spawnPoints(layout, def.staging, Math.max(1, police.length));
        thieves.forEach((p, i) => { Object.assign(p, tSpawn[i]); p.aim = -Math.PI / 2; p.cueIn = CUE.min + this.random() * (CUE.max - CUE.min) + i * CUE.stagger; });
        police.forEach((p, i) => { Object.assign(p, pSpawn[i]); p.aim = Math.PI / 2; p.cueIn = 0; });
        s.required = requiredTasks(thieves.length, s.tasks.length);
        this.elapsed = 0;
        s.phase = 'briefing'; s.phaseTime = TIMING.briefing;
        const tt = thiefTeam(m.round);
        s.message = `Round ${m.round} · ${def.name}. The ${TEAM_NAMES[tt]} are thieves; the ${TEAM_NAMES[otherTeam(tt)]} are police.`;
        this.bots.reset();
    }
    private endRound(winner: TeamId, reason: string) {
        const s = this.state, m = s.match!, def = mapDef(m.mapId);
        if (s.phase !== 'play') return;
        m.scores[winner]++;
        const thieves = s.players.filter(p => p.role === 'thief' && !p.spectator);
        for (const p of thieves) if (!p.captured) p.stats.survived += Math.round(this.elapsed);
        const top = (key: 'captures' | 'tasks' | 'escapes', label: string) => s.players.filter(p => p.roundStats?.[key]).sort((a, b) => b.roundStats![key] - a.roundStats![key]).slice(0, 2).map(p => `${p.name}: ${p.roundStats![key]} ${label}`);
        const highlights = winner === thiefTeam(m.round) ? [...top('tasks', 'tasks'), ...top('escapes', 'escape')] : top('captures', 'captures');
        m.results.push({ round: m.round, winner, winnerRole: roleFor(winner, m.round), reason, map: def.name, highlights });
        s.phase = 'roundEnd'; s.phaseTime = TIMING.roundEnd;
        s.message = `${TEAM_NAMES[winner]} take round ${m.round}: ${reason}`;
        for (const p of s.players) { p.task = null; p.input = { x: 0, y: 0 }; }
    }
    private nextRound() {
        const s = this.state, m = s.match!;
        if (m.scores.A >= s.settings.wins || m.scores.B >= s.settings.wins) {
            m.winner = m.scores.A > m.scores.B ? 'A' : 'B';
            s.phase = 'matchEnd'; s.phaseTime = 0;
            s.message = `The ${TEAM_NAMES[m.winner]} win the match ${m.scores[m.winner]}–${m.scores[otherTeam(m.winner)]}.`;
            return;
        }
        m.round++;
        if (m.round % 2 === 1) this.beginPair(); else this.beginRound();
    }
    private toLobby() {
        const s = this.state;
        s.players = s.players.filter(p => !p.bot && p.connected);
        for (const p of s.players) { p.ready = false; p.spectator = false; delete p.team; delete p.role; }
        delete s.match;
        s.phase = 'lobby'; s.phaseTime = 0; s.props = []; s.tasks = []; this.layout = null;
        s.message = 'Back at the planning board.';
    }

    // ---- simulation ----------------------------------------------------------------------------
    update(dt: number) {
        const s = this.state;
        s.tick++;
        this.viewCache.clear();
        if (s.phase === 'lobby' || s.phase === 'matchEnd') return;
        s.phaseTime = Math.max(0, s.phaseTime - dt);
        if (s.phase === 'vote') { this.bots.vote(); if (s.phaseTime <= 0 || this.humans().every(p => s.match!.votes[p.id])) this.finishVote(); return; }
        if (s.phase === 'briefing') { if (s.phaseTime <= 0) { s.phase = 'prep'; s.phaseTime = TIMING.prep; s.message = 'Thieves, hide! Police are locked in staging.'; } return; }
        if (s.phase === 'roundEnd') { if (s.phaseTime <= 0) this.nextRound(); return; }
        // prep and play
        if (s.phase === 'prep' && s.phaseTime <= 0) {
            s.phase = 'play'; s.phaseTime = mapDef(s.match!.mapId).roundSeconds;
            this.flags.gateOpen = s.gateOpen = true;
            s.message = 'Staging gate open. Police, find them!';
        }
        if (s.phase === 'play') this.elapsed += dt;
        this.bots.update(dt);
        this.moveAll(dt);
        updateThieves(this, dt);
        updateTasks(this, dt);
        for (const p of s.players) if (p.role === 'police') {
            p.cooldown = Math.max(0, p.cooldown - dt); p.stunCooldown = Math.max(0, p.stunCooldown - dt);
            p.lockedFor = Math.max(0, p.lockedFor - dt); if (p.lockedFor <= 0) p.heat = Math.max(0, p.heat - BLASTER.decay * dt);
        }
        for (const list of [s.shots, s.pulses, s.sounds] as { age: number }[][]) for (const e of list) e.age += dt;
        s.shots = s.shots.filter(e => e.age < 0.6); s.pulses = s.pulses.filter(e => e.age < 0.8); s.sounds = s.sounds.filter(e => e.age < 2.5);
        for (const c of s.clues) c.age += dt;
        s.clues = s.clues.filter(c => c.age < 6);
        if (s.phase === 'play') this.checkEnd();
    }
    /** Solid props for collision: real props only; a disguised thief never blocks anyone. */
    collisionProps(): PropState[] { return this.state.props; }
    private moveAll(dt: number) {
        const s = this.state, l = this.layout!, props = this.collisionProps(), exit = mapDef(s.match!.mapId).exitZone;
        for (const p of s.players) {
            p.moving = false;
            if (p.spectator || p.captured || p.escaped || !p.input) continue;
            if (p.role === 'police' && s.phase !== 'play' && s.phase !== 'prep') continue;
            if (p.stunnedFor > 0) continue;
            const mag = Math.hypot(p.input.x, p.input.y);
            if (mag < 0.05) continue;
            const speed = (p.role === 'police' ? SPEED.police : p.disguise ? SPEED.disguised : SPEED.thief) * (p.boostFor > 0 ? SPEED.smokeBoost : 1);
            const before: Point = { x: p.x, y: p.y };
            move(l, this.flags, p, p.input.x * speed * dt, p.input.y * speed * dt, RADIUS.player, props);
            p.moving = Math.hypot(p.x - before.x, p.y - before.y) > 0.5;
            if (p.role === 'thief' && this.flags.exitOpen && p.x > exit[0] * CELL && p.x < (exit[0] + exit[2]) * CELL && p.y > exit[1] * CELL && p.y < (exit[1] + exit[3]) * CELL) {
                p.escaped = true; p.disguise = null; p.task = null; p.stats.escapes++; this.bump(p, 'escapes');
                s.message = `${p.name} slipped out through the exit!`;
            }
        }
    }
    /** Per-round tallies used for highlights; the match totals live in stats. */
    bump(p: Player, key: 'captures' | 'tasks' | 'escapes') { p.roundStats ??= { captures: 0, tasks: 0, escapes: 0, round: this.state.match!.round }; if (p.roundStats.round !== this.state.match!.round) p.roundStats = { captures: 0, tasks: 0, escapes: 0, round: this.state.match!.round }; p.roundStats[key]++; }
    /**
     * Resolved once per tick after actions and movement, in a fixed order: everyone out → caught or got away;
     * otherwise time up → the thieves survived. A capture that lands on the final tick therefore counts.
     */
    checkEnd() {
        const s = this.state, m = s.match!, tt = thiefTeam(m.round), pt = otherTeam(tt);
        const thieves = s.players.filter(p => p.role === 'thief' && !p.spectator);
        if (!thieves.length) return this.endRound(pt, 'no thieves turned up');
        const free = thieves.filter(p => !p.captured && !p.escaped), escaped = thieves.filter(p => p.escaped);
        if (!free.length) return escaped.length ? this.endRound(tt, `${escaped.length} ${escaped.length === 1 ? 'thief' : 'thieves'} escaped`) : this.endRound(pt, 'every thief was caught');
        if (s.phaseTime <= 0) this.endRound(tt, `${free.length} ${free.length === 1 ? 'thief' : 'thieves'} survived until closing`);
    }
    alias(id: string) { let a = this.aliases.get(id); if (!a) { a = 'o' + randomUUID().replace(/-/g, '').slice(0, 10); this.aliases.set(id, a); } return a; }
    /** The state a given seat is allowed to see, cached per tick per view. */
    snapshot(viewerId?: string) {
        const viewer = viewerId ? this.player(viewerId) : undefined;
        const key = snapshotKey(this, viewer);
        let v = this.viewCache.get(key);
        if (!v) { v = snapshotFor(this, key === 'police'); this.viewCache.set(key, v); }
        return v;
    }
}
/** Police (and anyone not on the thieves' side mid-round) get the filtered view. */
export function snapshotKey(room: Room, viewer?: Player): 'full' | 'police' {
    const m = room.state.match;
    if (!m || room.state.phase === 'roundEnd' || room.state.phase === 'matchEnd' || room.state.phase === 'vote') return 'full';
    return viewer?.team === thiefTeam(m.round) ? 'full' : 'police';
}

