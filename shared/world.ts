export type Point = {
    x: number;
    y: number;
};
export type Rect = Point & {
    w: number;
    h: number;
};
export const WORLD = { w: 2640, h: 1160 };
export const VAN = { x: 840, y: 1070 };
export const LOCK = { x: 1440, y: 800 };
export const NOISE = { x: 240, y: 400 };
export const QUOTA = 2400, ROUND_SECONDS = 420;
/**
 * Dark-museum flashlight rules (competitive mode).
 * range/half: the beam's reach and half-angle. ambient: the small glow around every cop.
 * reach: how far an arrest can land. view: how far the server sends cops nearby objects,
 * deliberately wider than the beam so nothing visibly pops in when a cop turns.
 */
export const LIGHT = { range: 300, half: 0.5, ambient: 75, reach: 130, view: 380 };
/** Extra distance/angle the server tolerates on arrests to absorb network latency. */
export const ARREST_SLACK = { distance: 30, angle: 0.35 };
export const HEAD_START = 30, ARREST_COOLDOWN = 2, MISS_COOLDOWN = 5;
export const COLORS = ['#f3bf67', '#83d3bd', '#e48daa', '#a7a0ed', '#80bde0', '#ed956b'];
export const walls: Rect[] = [{ x: 0, y: 0, w: 2640, h: 28 }, { x: 0, y: 0, w: 28, h: 1160 }, { x: 2612, y: 0, w: 28, h: 1160 }, { x: 0, y: 1132, w: 2640, h: 28 },
    { x: 28, y: 920, w: 660, h: 24 }, { x: 990, y: 920, w: 662, h: 24 },
    { x: 550, y: 28, w: 24, h: 260 }, { x: 550, y: 410, w: 24, h: 290 }, { x: 550, y: 820, w: 24, h: 100 },
    { x: 1110, y: 28, w: 24, h: 260 }, { x: 1110, y: 410, w: 24, h: 290 }, { x: 1110, y: 820, w: 24, h: 100 },
    { x: 28, y: 560, w: 200, h: 24 }, { x: 350, y: 560, w: 200, h: 24 }, { x: 574, y: 560, w: 200, h: 24 }, { x: 900, y: 560, w: 210, h: 24 },
    { x: 1134, y: 560, w: 200, h: 24 }, { x: 1460, y: 560, w: 192, h: 24 },
    { x: 1300, y: 800, w: 120, h: 20 }, { x: 1460, y: 800, w: 192, h: 20 }, { x: 1300, y: 820, w: 20, h: 100 }];
// East-wing circulation: two entrances, a cross-corridor and four new rooms.
walls.push({x:1652,y:28,w:28,h:260},{x:1652,y:410,w:28,h:290},{x:1652,y:820,w:28,h:312},
{x:1680,y:920,w:932,h:24},{x:2140,y:28,w:24,h:260},{x:2140,y:410,w:24,h:290},{x:2140,y:820,w:24,h:100},
{x:1680,y:560,w:170,h:24},{x:1970,y:560,w:170,h:24},{x:2164,y:560,w:170,h:24},{x:2454,y:560,w:158,h:24});
export type Prop = Point & {
    id: string;
    kind: 'plant' | 'bench' | 'bin' | 'statue';
    r: number;
};
export const props: Prop[] = [{ id: 'p0', kind: 'plant', x: 140, y: 160, r: 23 }, { id: 'p1', kind: 'bench', x: 360, y: 460, r: 28 }, { id: 'p2', kind: 'bin', x: 480, y: 170, r: 20 }, { id: 'p3', kind: 'statue', x: 840, y: 190, r: 25 }, { id: 'p4', kind: 'plant', x: 1000, y: 470, r: 23 }, { id: 'p5', kind: 'bench', x: 700, y: 460, r: 28 }, { id: 'p6', kind: 'plant', x: 1220, y: 180, r: 23 }, { id: 'p7', kind: 'statue', x: 1510, y: 440, r: 25 }, { id: 'p8', kind: 'bin', x: 1550, y: 660, r: 20 }, { id: 'p9', kind: 'bench', x: 1190, y: 700, r: 28 }, { id: 'p10', kind: 'plant', x: 640, y: 840, r: 23 }, { id: 'p11', kind: 'statue', x: 820, y: 720, r: 25 }, { id: 'p12', kind: 'plant', x: 130, y: 840, r: 23 }, { id: 'p13', kind: 'bin', x: 460, y: 680, r: 20 }, { id: 'p14', kind: 'bench', x: 280, y: 730, r: 28 }];
props.push({id:'east-fern',kind:'plant',x:1770,y:190,r:23},{id:'east-bench',kind:'bench',x:1990,y:460,r:28},{id:'east-statue',kind:'statue',x:2440,y:170,r:25},{id:'east-bin',kind:'bin',x:2530,y:440,r:20},{id:'east-plant2',kind:'plant',x:1750,y:820,r:23},{id:'east-bench2',kind:'bench',x:2040,y:700,r:28},{id:'east-statue2',kind:'statue',x:2340,y:780,r:25},{id:'east-bin2',kind:'bin',x:2540,y:840,r:20});
export const lootSeeds = [{ x: 280, y: 200, large: false }, { x: 390, y: 300, large: false }, { x: 700, y: 220, large: false }, { x: 990, y: 260, large: false }, { x: 1300, y: 280, large: false }, { x: 1510, y: 180, large: false }, { x: 220, y: 650, large: false }, { x: 990, y: 800, large: false }, { x: 1210, y: 850, large: false }, { x: 1470, y: 700, large: false }, { x: 840, y: 350, large: true }, { x: 1370, y: 420, large: true }, { x: 380, y: 820, large: true }];
lootSeeds.push({x:1920,y:220,large:false},{x:2340,y:340,large:true},{x:1900,y:760,large:false},{x:2510,y:690,large:false});
export const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
export function blocked(x: number, y: number, r = 16, geometry = walls) { return geometry.some(w => x + r > w.x && x - r < w.x + w.w && y + r > w.y && y - r < w.y + w.h) || props.some(p => Math.hypot(x - p.x, y - p.y) < r + p.r); }
export function move(p: Point, dx: number, dy: number, r = 16, geometry = walls) { if (!blocked(p.x + dx, p.y, r, geometry))
    p.x += dx; if (!blocked(p.x, p.y + dy, r, geometry))
    p.y += dy; }
export function los(a: Point, b: Point, geometry = walls) { const n = Math.ceil(dist(a, b) / 8); for (let i = 1; i < n; i++) {
    const x = a.x + (b.x - a.x) * i / n, y = a.y + (b.y - a.y) * i / n;
    if (geometry.some(w => x >= w.x && x <= w.x + w.w && y >= w.y && y <= w.y + w.h))
        return false;
} return true; }
export type Loot = Point & {
    id: string;
    large: boolean;
    value: number;
    carriers: string[];
    deposited: boolean;
};
export type Player = Point & {
    id: string;
    name: string;
    color: string;
    sprintFor?: number;
    sprintCooldown?: number;
    protectedFor?: number;
    role?: 'cop' | 'thief';
    /** Flashlight direction in radians (cops only). */
    aim?: number;
    /** Set in a cop's snapshot for thieves the cops cannot currently see; carries no position. */
    hidden?: boolean;
    ready: boolean;
    connected: boolean;
    spectator: boolean;
    captured: boolean;
    escaped: boolean;
    disguise: string | null;
    cooldown: number;
    suspicion: number;
    moving: boolean;
    score: number;
    rescues: number;
    input: Point;
    lastInput: number;
    lastSeen: number;
    rescue: number;
};
export type Guard = Point & {
    id: string;
    angle: number;
    mode: 'patrol' | 'investigate' | 'chase' | 'search';
    target: string | null;
    last: Point;
    timer: number;
    route: number;
    waypoint: number;
};
/** A prop as a cop sees it: real props and disguised thieves look identical, with per-round anonymous ids. */
export type VisibleProp = Point & {
    id: string;
    kind: Prop['kind'];
};
/** A sprinting thief's footsteps: an approximate position, no identity. */
export type Noise = Point & {
    age: number;
};
export type State = {
    /** Only in a cop's snapshot: every prop near the cops, real or not. */
    visibleProps?: VisibleProp[];
    noises?: Noise[];
    selectedMap?: number;
    winner?: 'cops' | 'thieves';
    headStart?: number;
    mode?: 'coop' | 'versus';
    mapName?: string;
    geometry?: Rect[];
    code: string;
    host: string;
    phase: 'lobby' | 'playing' | 'results';
    players: Player[];
    loot: Loot[];
    guards: Guard[];
    seconds: number;
    total: number;
    quota: number;
    noiseCooldown: number;
    noiseUntil: number;
    message: string;
    outcome: string;
    tick: number;
};

export const MAPS = [
 {name:'Museum of Questionable Taste',walls},
 {name:'The Velvet Vault',walls:[...walls,{x:730,y:300,w:22,h:180},{x:1250,y:380,w:24,h:110},{x:380,y:620,w:24,h:110}]},
 {name:'Midnight Archive',walls:[...walls,{x:180,y:280,w:180,h:22},{x:900,y:380,w:150,h:22},{x:1200,y:200,w:210,h:22},{x:900,y:660,w:22,h:120}]}
];

/** Signed smallest difference between two angles, in (-PI, PI]. */
export const angleDelta = (a: number, b: number) => Math.atan2(Math.sin(a - b), Math.cos(a - b));

/** Distance along a ray until it hits a wall, capped at max. Props do not block light. */
export function castRay(o: Point, angle: number, max: number, geometry = walls) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let best = max;
    for (const w of geometry) {
        let near = -Infinity, far = Infinity;
        if (Math.abs(dx) < 1e-9) {
            if (o.x < w.x || o.x > w.x + w.w) continue;
        } else {
            const a = (w.x - o.x) / dx, b = (w.x + w.w - o.x) / dx;
            near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        }
        if (Math.abs(dy) < 1e-9) {
            if (o.y < w.y || o.y > w.y + w.h) continue;
        } else {
            const a = (w.y - o.y) / dy, b = (w.y + w.h - o.y) / dy;
            near = Math.max(near, Math.min(a, b)); far = Math.min(far, Math.max(a, b));
        }
        if (far >= Math.max(near, 0)) best = Math.min(best, Math.max(near, 0));
    }
    return best;
}

/** The lit area around a cop: a wall-clipped beam plus a small ambient glow, as a star-shaped polygon. */
export function lightPolygon(o: Point, aim: number, geometry = walls, range = LIGHT.range): Point[] {
    const out: Point[] = [];
    // Rays run 8 units into a wall so its face catches the light.
    const ray = (a: number, r: number) => { const d = Math.min(r, castRay(o, a, r, geometry) + 8); out.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d }); };
    for (let i = 0; i <= 32; i++) ray(aim - LIGHT.half + LIGHT.half * 2 * i / 32, range);
    const back = Math.PI * 2 - LIGHT.half * 2;
    for (let i = 0; i <= 24; i++) ray(aim + LIGHT.half + back * i / 24, LIGHT.ambient);
    return out;
}

/** Whether a point sits inside a cop's beam within the given reach, with optional latency slack. */
export function inBeam(cop: Point, aim: number, pt: Point, reach: number, slack = false, geometry = walls) {
    const d = dist(cop, pt);
    if (d > reach + (slack ? ARREST_SLACK.distance : 0)) return false;
    const off = d < 1 ? 0 : Math.abs(angleDelta(Math.atan2(pt.y - cop.y, pt.x - cop.x), aim));
    return off <= LIGHT.half + (slack ? ARREST_SLACK.angle : 0) && los(cop, pt, geometry);
}

/** The object a cop's flashlight is pointed at: the closest one to the beam's centre line within arrest reach. */
export function pickTarget<T extends Point>(cop: Point, aim: number, candidates: T[], geometry = walls): T | undefined {
    let best: T | undefined, score = Infinity;
    for (const c of candidates) {
        if (!inBeam(cop, aim, c, LIGHT.reach, false, geometry)) continue;
        const d = dist(cop, c), off = d < 1 ? 0 : Math.abs(Math.sin(angleDelta(Math.atan2(c.y - cop.y, c.x - cop.x), aim))) * d;
        const s = off + d * 0.15;
        if (s < score) { score = s; best = c; }
    }
    return best;
}

/** Short visual prediction only; never used as an authoritative position. */
export function predictPosition(player: Player, input: Point, age: number, state: State): Point {
 const result={x:player.x,y:player.y};
 if(player.captured||player.escaped||player.spectator||!player.connected||state.phase!=='playing'||(player.role==='cop'&&(state.headStart||0)>0)||state.loot.some(l=>l.large&&l.carriers.includes(player.id)))return result;
 const n=Math.max(1,Math.hypot(input.x,input.y));
 const speed=(player.role==='cop'?155:player.disguise?100:180)*(player.sprintFor!>0?1.65:1);
 const seconds=Math.min(.1,Math.max(0,age));
 move(result,input.x/n*speed*seconds,input.y/n*speed*seconds,16,state.geometry||walls);
 return result;
}
