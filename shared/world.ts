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
export type State = {
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
