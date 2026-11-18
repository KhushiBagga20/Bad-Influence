import { path } from './guard-navigation.js';
import { randomUUID } from 'node:crypto';
import { MAPS, walls, COLORS, dist, los, move, props, lootSeeds, VAN, LOCK, NOISE, QUOTA, ROUND_SECONDS, LIGHT, HEAD_START, ARREST_COOLDOWN, MISS_COOLDOWN, inBeam, type State, type Player, type Point, type Prop, type VisibleProp } from '../../shared/world.js';
/** Opaque per-round id handed to cops, so real props and disguised thieves can't be told apart by id. */
const alias = () => 'o' + randomUUID().replace(/-/g, '').slice(0, 10);
/** Snapshot copy without fields only the server needs. */
function publicPlayer(p: Player): Player {
    const { input, lastInput, lastSeen, ...rest } = p;
    return rest as Player;
}
/** What a cop learns about a thief they can't see: identity and team status only, never position or disguise. */
function hiddenPlayer(p: Player): Player {
    return { id: p.id, name: p.name, color: p.color, role: p.role, ready: p.ready, connected: p.connected, spectator: p.spectator, captured: false, escaped: false, score: p.score, rescues: p.rescues, hidden: true, x: 0, y: 0, disguise: null, cooldown: 0, suspicion: 0, moving: false, rescue: 0 } as Player;
}
const routes: Point[][] = [[{ x: 120, y: 320 }, { x: 480, y: 320 }, { x: 480, y: 520 }, { x: 290, y: 520 }, { x: 290, y: 870 }, { x: 480, y: 870 }, { x: 480, y: 760 }, { x: 290, y: 760 }, { x: 290, y: 320 }], [{ x: 650, y: 330 }, { x: 1030, y: 330 }, { x: 1030, y: 760 }, { x: 940, y: 760 }, { x: 840, y: 620 }, { x: 650, y: 620 }, { x: 650, y: 330 }], [{ x: 1200, y: 330 }, { x: 1580, y: 330 }, { x: 1580, y: 520 }, { x: 1390, y: 520 }, { x: 1390, y: 740 }, { x: 1200, y: 740 }, { x: 1200, y: 330 }]];
export class Room {
    paths = new Map<string, {
        points: Point[];
        until: number;
        goal: Point;
    }>();
    state: State;
    tokens = new Map<string, string>();
    /** Player id → the anonymous prop id cops see while that thief is disguised. Never sent to clients. */
    decoys = new Map<string, string>();
    /** Real prop id → its anonymous id for this round. */
    aliases = new Map<string, string>();
    vacantSince = 0;
    constructor(public code: string, mode: 'coop' | 'versus' = 'coop') { this.state = { mode, code, host: '', phase: 'lobby', players: [], loot: [], guards: [], seconds: ROUND_SECONDS, total: 0, quota: QUOTA, noiseCooldown: 0, noiseUntil: 0, message: '', outcome: '', tick: 0 }; }
    join(name: string, token?: string, color?: string) {
        const old = token && this.tokens.get(token);
        let p = this.state.players.find(p => p.id === old);
        if (p) {
            p.connected = true;
            p.lastSeen = Date.now();
            return { p, token: token! };
        }
        if (this.state.players.length >= 6)
            throw Error('This crew is full (6 thieves maximum).');
        const id = randomUUID(), newToken = randomUUID();
        p = { id, name: name.trim().slice(0, 16) || 'Sneaky Pete', color: COLORS.find(c => c === color && !this.state.players.some(p => p.color === c)) || COLORS.find(c => !this.state.players.some(p => p.color === c)) || COLORS[0], x: 780 + this.state.players.length * 25, y: 1030, ready: false, connected: true, spectator: this.state.phase !== 'lobby', captured: false, escaped: false, disguise: null, cooldown: 0, suspicion: 0, moving: false, score: 0, rescues: 0, input: { x: 0, y: 0 }, lastInput: 0, lastSeen: Date.now(), rescue: 0 };
        this.state.players.push(p);
        this.tokens.set(newToken, id);
        if (!this.state.host || !this.player(this.state.host)?.connected)
            this.state.host = id;
        return { p, token: newToken };
    }
    disconnect(id: string) { const p = this.player(id); if (!p)
        return; p.connected = false; p.input = { x: 0, y: 0 }; p.lastSeen = Date.now(); this.drop(p); if (this.state.host === id)
        this.state.host = this.state.players.find(p => p.connected)?.id || id; this.checkEnd(); }
    player(id: string) { return this.state.players.find(p => p.id === id); }
    input(id: string, x: number, y: number, aim?: unknown) { const p = this.player(id); if (!p || !Number.isFinite(x) || !Number.isFinite(y))
        return; const n = Math.max(1, Math.hypot(x, y)); p.input = { x: x / n, y: y / n }; p.lastInput = Date.now();
        // Cops aim with the mouse; without an explicit aim the flashlight follows movement.
        if (typeof aim === 'number' && Number.isFinite(aim)) p.aim = Math.atan2(Math.sin(aim), Math.cos(aim));
        else if (Math.hypot(x, y) > 0.2) p.aim = Math.atan2(y, x); }
    start(id: string) {
        const s = this.state, crew = s.players.filter(p => p.connected);
        if (id !== s.host || s.phase === 'playing')
            return;
        if (crew.length < 2)
            throw Error('A heist needs at least two connected thieves.');
        if (crew.some(p => !p.ready))
            throw Error('Everyone must ready up first.');
        s.phase = 'playing';
        s.headStart=s.mode==='versus'?HEAD_START:0;
        s.noises=[];
        this.decoys.clear();
        this.aliases=new Map(props.map(q=>[q.id,alias()]));
        s.seconds = ROUND_SECONDS;
        s.total = 0;
        s.outcome = '';
        s.winner=undefined;
        s.noiseCooldown = 0;
        s.noiseUntil = 0;
        s.message = 'The museum is closed. Your options are open.';
        s.players.forEach((p, i) => Object.assign(p, { x: 780 + i * 27, y: 1030, captured: false, escaped: false, spectator: !p.connected, disguise: null, suspicion: 0, score: 0, rescues: 0, rescue: 0, protectedFor:0, sprintFor:0, sprintCooldown:0, cooldown:0, input: { x: 0, y: 0 } }));
        s.players.forEach(p=>p.role='thief');
        if(s.mode==='versus'){
            const candidates=[...crew];
            for(let i=candidates.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[candidates[i],candidates[j]]=[candidates[j],candidates[i]];}
            candidates.slice(0,Math.max(1,Math.floor(crew.length/3))).forEach((p,i)=>{p.role='cop';p.x=700+i*100;p.y=150;p.aim=Math.PI/2;});
            const map=MAPS[s.selectedMap!==undefined&&s.selectedMap>=0?s.selectedMap:Math.floor(Math.random()*MAPS.length)];s.mapName=map.name;s.geometry=map.walls;
            s.quota=crew.length===2?800:Math.min(2400,(crew.length-Math.floor(crew.length/3))*600);
            s.message=`${map.name}: lights out! Thieves, hide and steal $${s.quota}. Cops, your flashlights come on in ${HEAD_START} seconds.`;
        }
        s.loot = lootSeeds.map((l, i) => ({ ...l, id: 'l' + i, value: l.large ? 700 : 200, carriers: [], deposited: false }));
        s.guards = (s.mode==='versus'?[]:routes).map((r, i) => ({ id: 'g' + i, ...r[0], angle: 0, mode: 'patrol', target: null, last: { ...r[0] }, timer: 0, route: i, waypoint: 1 }));
    }
    move(p:Point,dx:number,dy:number,r=16){move(p,dx,dy,r,this.state.geometry||walls);}
    los(a:Point,b:Point){return los(a,b,this.state.geometry||walls);}
    drop(p: Player) { for (const l of this.state.loot)
        if (l.carriers.includes(p.id)) {
            if (!l.large) {
                l.x = p.x;
                l.y = p.y;
            }
            l.carriers = [];
        } }
    act(id: string, action: string) {
        const p = this.player(id), s = this.state;
        if (!p || !p.connected)
            return;
        if(action.startsWith('map:')){
            if(id!==s.host||s.phase!=='lobby')return;
            const choice=Number(action.slice(4));
            if(!Number.isInteger(choice)||choice < -1||choice>=MAPS.length)return;
            s.selectedMap=choice;
            s.players.forEach(p=>p.ready=false);
            s.message=`Map changed to ${choice===-1?'Random museum':MAPS[choice].name}. Ready up again.`;
            return;
        }
        if (action === 'ready' && s.phase !== 'playing') {
            p.ready = !p.ready;
            return;
        }
        if (action === 'start') {
            this.start(id);
            return;
        }
        if (action === 'again' && id === s.host && s.phase === 'results') {
            s.phase = 'lobby';
            s.players = s.players.filter(p => p.connected);
            s.players.forEach(p => { p.ready = false; p.spectator = false; });
            return;
        }
        if (s.phase !== 'playing' || p.captured || p.escaped || p.spectator)
            return;
        if(action==='sprint'){
            if((p.sprintCooldown||0)>0||p.disguise||(p.role==='cop'&&(s.headStart||0)>0)||s.loot.some(l=>l.large&&l.carriers.includes(id)))return;
            p.sprintFor=1.4;p.sprintCooldown=8;return;
        }
        if(p.role==='cop'){
            if((s.headStart||0)>0)return;
            if(action.startsWith('arrest:')&&p.cooldown<=0)this.arrest(p,action.slice(7));
            return;
        }
        if (action === 'drop') {
            this.drop(p);
            return;
        }
        const carried = s.loot.filter(l => l.carriers.includes(id));
        if (action === 'transform') {
            if (p.cooldown > 0 || carried.some(l => l.large))
                return;
            if (p.disguise) {
                p.disguise = null;
                this.decoys.delete(p.id);
                p.cooldown = 1.5;
                return;
            }
            const prop = props.filter(q => dist(q, p) < 100 && this.los(q, p)).sort((a, b) => dist(a, p) - dist(b, p))[0];
            if (prop) {
                p.disguise = prop.kind;
                this.decoys.set(p.id, alias());
                p.sprintFor=0;
                p.cooldown = 1.5;
                for (const g of s.guards) {
                    const a = Math.atan2(p.y - g.y, p.x - g.x) - g.angle;
                    if (dist(g, p) < 260 && Math.abs(Math.atan2(Math.sin(a), Math.cos(a))) < .62 && this.los(g, p))
                        p.suspicion = Math.max(p.suspicion, .55);
                }
            }
            return;
        }
        if (action !== 'interact')
            return;
        if (dist(p, VAN) < 125) {
            if (carried.length) {
                for (const l of carried) {
                    l.deposited = true;
                    const ids = [...l.carriers];
                    for (const cid of ids) {
                        const c = this.player(cid);
                        if (c)
                            c.score += l.value / ids.length;
                    }
                    s.total += l.value;
                    l.carriers = [];
                }
                s.message = `${p.name} delivered the goods. Very tasteful.`;
            }
            else if (s.total >= s.quota) {
                p.escaped = true;
                p.disguise = null;
                s.message = `${p.name} is in the van. Get the rest of the crew out!`;
                this.checkEnd();
            }
            return;
        }
        if (dist(p, LOCK) < 95 && this.los(p, LOCK) && s.players.some(q => q.captured)) {
            p.rescue = 0.001;
            return;
        }
        if (dist(p, NOISE) < 90 && this.los(p, NOISE) && s.noiseCooldown <= 0) {
            s.noiseCooldown = 25;
            s.noiseUntil = 5;
            s.message = 'The gramophone is having a moment.';
            for (const g of s.guards)
                if (dist(g, NOISE) < 700 && g.mode !== 'chase') {
                    g.mode = 'investigate';
                    g.last = { ...NOISE };
                    g.timer = 8;
                }
            return;
        }
        const l = s.loot.filter(l => !l.deposited && !l.carriers.includes(id) && dist(l, p) < 80 && this.los(l, p) && (!l.carriers.length || (l.large && l.carriers.length === 1))).sort((a, b) => dist(a, p) - dist(b, p))[0];
        if (!l)
            return;
        if (l.large) {
            if (carried.length)
                return;
            l.carriers.push(id);
            p.disguise = null;
            p.x = l.x + (l.carriers.length === 1 ? -24 : 24);
            p.y = l.y + 35;
        }
        else if (!carried.some(l => l.large) && carried.length < 2)
            l.carriers = [id];
    }
    update(dt: number) {
        const s = this.state;
        s.tick++;
        if (s.phase !== 'playing')
            return;
        s.headStart=Math.max(0,(s.headStart||0)-dt);
        s.seconds = Math.max(0, s.seconds - dt);
        s.noiseCooldown = Math.max(0, s.noiseCooldown - dt);
        s.noiseUntil = Math.max(0, s.noiseUntil - dt);
        // Sprinting thieves are loud: cops hear roughly where, never who.
        const noises = (s.noises ||= []);
        for (const n of noises) n.age += dt;
        s.noises = noises.filter(n => n.age < 1.2);
        if (s.mode === 'versus' && s.tick % 9 === 0)
            for (const p of s.players)
                if (p.role !== 'cop' && (p.sprintFor || 0) > 0 && p.connected && !p.spectator && !p.captured && !p.escaped)
                    s.noises.push({ x: Math.round(p.x + (Math.random() - 0.5) * 50), y: Math.round(p.y + (Math.random() - 0.5) * 50), age: 0 });
        for (const p of s.players) {
            p.sprintFor=Math.max(0,(p.sprintFor||0)-dt);
            p.sprintCooldown=Math.max(0,(p.sprintCooldown||0)-dt);
            p.protectedFor=Math.max(0,(p.protectedFor||0)-dt);
            p.cooldown = Math.max(0, p.cooldown - dt);
            p.moving = false;
            if (!p.connected || p.captured || p.escaped || p.spectator)
                continue;
            if (Date.now() - p.lastInput > 350)
                p.input = { x: 0, y: 0 };
            if(p.role==='cop'&&(s.headStart||0)>0)continue;
            const large = s.loot.find(l => l.large && l.carriers.includes(p.id));
            if (!large) {
                const speed = (p.role==='cop'?155:p.disguise ? 100 : 180)*(p.sprintFor!>0?1.65:1);
                this.move(p, p.input.x * speed * dt, p.input.y * speed * dt);
                p.moving = Math.hypot(p.input.x, p.input.y) > 0.05;
            }
            if (p.rescue > 0) {
                if (dist(p, LOCK) > 95 || p.moving)
                    p.rescue = 0;
                else {
                    p.rescue += dt;
                    if (p.rescue >= 3) {
                        s.players.filter(q => q.captured).forEach((q, i) => { q.captured = false; q.x = 1390 + i * 25; q.y = 750; q.suspicion = 0; q.protectedFor=5; });
                        p.rescues++;
                        p.rescue = 0;
                        s.message = `${p.name} picked the lock. Nobody saw a thing. Probably.`;
                    }
                }
            }
        }
        for (const l of s.loot) {
            if (l.deposited || !l.carriers.length)
                continue;
            if (l.large) {
                const lead = this.player(l.carriers[0])!;
                const speed = l.carriers.length === 2 ? 125 : 35;
                this.move(l, lead.input.x * speed * dt, lead.input.y * speed * dt, 48);
                for (const [i, id] of l.carriers.entries()) {
                    const p = this.player(id)!;
                    p.x = l.x + (i === 0 ? -24 : 24);
                    p.y = l.y + 30;
                    p.moving = Math.hypot(lead.input.x, lead.input.y) > 0.05;
                }
            }
            else {
                const p = this.player(l.carriers[0])!;
                l.x = p.x;
                l.y = p.y;
            }
        }
        const seen = new Set<string>();
        for (const g of s.guards) {
            let target: Player | undefined;
            for (const p of s.players) {
                if (!p.connected || p.captured || p.escaped || p.spectator || p.y > 960)
                    continue;
                const angle = Math.atan2(p.y - g.y, p.x - g.x), delta = Math.atan2(Math.sin(angle - g.angle), Math.cos(angle - g.angle));
                const visible = dist(g, p) < 260 && Math.abs(delta) < 0.62 && this.los(g, p);
                if (visible && (!p.disguise || p.moving || p.suspicion > 0)) {
                    seen.add(p.id);
                    p.suspicion = Math.min(1, p.suspicion + dt * (p.disguise ? 0.65 : 1.5));
                    g.last = { x: p.x, y: p.y };
                    if (p.suspicion >= 1) {
                        target = p;
                        break;
                    }
                    if (g.mode !== 'chase') {
                        g.mode = 'investigate';
                        g.timer = 4;
                    }
                }
            }
            if (target) {
                g.mode = 'chase';
                g.target = target.id;
                g.timer = 4;
            }
            else if (g.mode === 'chase') {
                g.timer -= dt;
                if (g.timer <= 0) {
                    g.mode = 'search';
                    g.target = null;
                    g.timer = 3;
                }
            }
            let goal: Point;
            if (g.mode === 'patrol')
                goal = routes[g.route][g.waypoint];
            else
                goal = g.last;
            const d = dist(g, goal);
            if (d > 8) {
                let nav = this.paths.get(g.id);
                if (!nav || nav.until < s.tick || dist(nav.goal, goal) > 60) {
                    nav = { points: path(g, goal), until: s.tick + 30, goal: { ...goal } };
                    this.paths.set(g.id, nav);
                }
                while (nav.points.length && dist(g, nav.points[0]) < 10)
                    nav.points.shift();
                const next = nav.points[0] || goal;
                g.angle = Math.atan2(next.y - g.y, next.x - g.x);
                this.move(g, Math.cos(g.angle) * (g.mode === 'chase' ? 150 : 80) * dt, Math.sin(g.angle) * (g.mode === 'chase' ? 150 : 80) * dt);
            }
            else if (g.mode === 'patrol') {
                g.waypoint = (g.waypoint + 1) % routes[g.route].length;
            }
            else {
                g.mode = 'search';
                g.timer -= dt;
                g.angle += dt * 1.5;
                if (g.timer <= 0) {
                    g.mode = 'patrol';
                    g.target = null;
                    g.waypoint = routes[g.route].reduce((best, p, i) => dist(g, p) < dist(g, routes[g.route][best]) ? i : best, 0);
                }
            }
            if (g.mode === 'investigate') {
                g.timer -= dt;
                if (g.timer <= 0) {
                    g.mode = 'patrol';
                }
            }
            for (const p of s.players)
                if (p.connected && !p.captured && !p.escaped && !p.spectator && p.suspicion >= 0.99 && dist(g, p) < 30 && this.los(g, p)) {
                    this.drop(p);
                    p.captured = true;
                    p.disguise = null;
                    p.suspicion = 0;
                    p.rescue = 0;
                    p.x = 1370 + (s.players.indexOf(p) % 4) * 60;
                    p.y = 870;
                    s.message = `${p.name} is in custody. Pick the holding-room lock to rescue them.`;
                }
        }
        for (const p of s.players)
            if (!seen.has(p.id))
                p.suspicion = Math.max(0, p.suspicion - dt * 0.16);
        this.checkEnd();
    }
    /**
     * A cop arrests one specific object they are pointing at: an anonymous prop id (real prop or
     * disguised thief) or an undisguised thief's player id. Real props are a miss and cost time.
     */
    arrest(cop: Player, targetId: string) {
        const s = this.state, geometry = s.geometry || walls, aim = cop.aim ?? Math.PI / 2;
        const reachable = (pt: Point) => inBeam(cop, aim, pt, LIGHT.reach, true, geometry);
        const propId = [...this.aliases].find(([, a]) => a === targetId)?.[0];
        const prop = propId ? props.find(q => q.id === propId) : undefined;
        if (prop) {
            if (!reachable(prop))
                throw Error('Get closer and point your flashlight at it.');
            cop.cooldown = MISS_COOLDOWN;
            s.message = `${cop.name} tried to arrest a ${prop.kind}. It had no comment.`;
            return;
        }
        const owner = [...this.decoys].find(([, a]) => a === targetId)?.[0];
        const suspect = this.player(owner || targetId);
        if (!suspect || suspect.role === 'cop' || !suspect.connected || suspect.spectator || suspect.captured || suspect.escaped)
            return;
        // A disguised thief can only be caught through the prop they look like, never by player id.
        if (owner ? !suspect.disguise : suspect.disguise)
            return;
        if (!reachable(suspect))
            throw Error('Get closer and point your flashlight at them.');
        if (suspect.y >= 960)
            throw Error('The van apron is a safe zone.');
        if ((suspect.protectedFor || 0) > 0)
            throw Error(`${suspect.name} has a fresh rescue shield.`);
        this.drop(suspect);
        this.decoys.delete(suspect.id);
        const held = s.players.filter(q => q.captured).length;
        Object.assign(suspect, { captured: true, disguise: null, suspicion: 0, rescue: 0, x: 1370 + (held % 4) * 60, y: 870 });
        cop.score += 1;
        cop.cooldown = ARREST_COOLDOWN;
        s.message = `${cop.name} arrested ${suspect.name}. Thieves can rescue them at the lock.`;
        this.checkEnd();
    }
    /** Whether this viewer gets the dark-museum view instead of the full state. */
    copView(viewer?: Player) {
        return viewer?.role === 'cop' && !viewer.spectator && this.state.phase === 'playing' && this.state.mode === 'versus';
    }
    /**
     * The state a client receives. Thieves and spectators see everything. Cops only receive what
     * their team's flashlights could reveal: hidden thieves carry no position, and disguised thieves
     * arrive mixed in with the real props under anonymous ids.
     */
    snapshot(forCop = false): State {
        const s = this.state;
        if (!forCop)
            return { ...s, players: s.players.map(publicPlayer) };
        const geometry = s.geometry || walls;
        const cops = s.players.filter(p => p.role === 'cop' && p.connected && !p.spectator);
        const blind = (s.headStart || 0) > 0;
        const seen = (pt: Point) => !blind && cops.some(c => dist(c, pt) < LIGHT.view && los(c, pt, geometry));
        const visibleProps: VisibleProp[] = [];
        for (const q of props)
            if (seen(q))
                visibleProps.push({ id: this.aliases.get(q.id)!, kind: q.kind, x: q.x, y: q.y });
        const players = s.players.map(p => {
            if (p.role === 'cop' || p.captured || p.escaped)
                return publicPlayer(p);
            if (p.connected && !p.spectator && seen(p)) {
                if (!p.disguise)
                    return publicPlayer(p);
                const id = this.decoys.get(p.id);
                if (id)
                    visibleProps.push({ id, kind: p.disguise as Prop['kind'], x: Math.round(p.x), y: Math.round(p.y) });
            }
            return hiddenPlayer(p);
        });
        // Sorted by position so list order can't single out the newcomers.
        visibleProps.sort((a, b) => a.x - b.x || a.y - b.y);
        // Pocketed loot moves with its thief, so it is never sent; floor loot and paintings only when seen.
        const loot = s.loot.filter(l => !l.deposited && (l.large || !l.carriers.length) && seen(l));
        return { ...s, players, loot, visibleProps, guards: [] };
    }
    checkEnd() { const s = this.state; if (s.phase !== 'playing')
        return; const crew = s.players.filter(p => !p.spectator&&p.role!=='cop'), connected = crew.filter(p => p.connected), free = connected.filter(p => !p.captured && !p.escaped); let outcome = ''; if (s.total >= s.quota && connected.some(p => p.escaped) && free.length === 0)
        outcome = 'A very successful bad idea';
    else if (connected.length && connected.every(p => p.captured))
        outcome = 'The furniture has been arrested';
    else if (s.seconds <= 0)
        outcome = 'Lockdown. The cops win this one.'; if (outcome) {
        s.winner=s.total>=s.quota&&connected.some(p=>p.escaped)&&free.length===0?'thieves':'cops';
        s.outcome = outcome;
        s.phase = 'results';
    } }
}
