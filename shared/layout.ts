/**
 * Maps are drawn on a grid of CELL-sized squares. A layout is a map definition plus a public seed (which
 * optional passages are open and where tasks sit). Props are placed separately from a secret seed the
 * police never receive. Collision, line of sight, ray casts, pathfinding and reachability all run on the grid.
 */
import type { Point, PropState, TaskType } from './rules.js';

export const CELL = 48;
/** [x, y, w, h] in cells. */
export type Cells = [number, number, number, number];
export type Look = 'wall' | 'desk' | 'fountain' | 'hedge' | 'shelf' | 'cabinets' | 'crates' | 'monument' | 'pillar' | 'stall' | 'counter' | 'railing' | 'water' | 'booth' | 'table' | 'awning' | 'machines' | 'sand';
/** Furniture you can see over: blocks movement, not sight. */
const LOW: ReadonlySet<Look> = new Set<Look>(['desk', 'fountain', 'cabinets', 'counter', 'railing', 'water', 'table', 'sand']);
export const LOOKS: Look[] = ['wall', 'desk', 'fountain', 'hedge', 'shelf', 'cabinets', 'crates', 'monument', 'pillar', 'stall', 'counter', 'railing', 'water', 'booth', 'table', 'awning', 'machines', 'sand'];

export type Theme = 'museum' | 'market' | 'arcade';
export type District = { name: string; rect: Cells; floor: string; quiet?: boolean };
export type PropCluster = { kinds: string[]; spots: [number, number][]; pick: number };
export type MapDef = {
    id: string; name: string; blurb: string; theme: Theme;
    cols: number; rows: number; roundSeconds: number;
    districts: District[];
    doors: Cells[];
    /** Passages the layout seed may open or leave walled up. */
    optional: Cells[];
    blocks: { rect: Cells; look: Look }[];
    staging: Cells; gate: Cells; exitZone: Cells; exitDoor: Cells; spawn: Cells;
    props: PropCluster[];
    tasks: Record<TaskType, [number, number][]>;
    lights: [number, number][];
};

export const FLOOR = 0, WALL = 1, BLOCK = 2, GATE = 3, EXIT = 4;
export type Flags = { gateOpen: boolean; exitOpen: boolean };
export type TaskSpot = Point & { id: string; type: TaskType; cx: number; cy: number; district: string };
export type Layout = {
    def: MapDef; seed: number; cols: number; rows: number; w: number; h: number;
    type: Uint8Array; look: Uint8Array; district: Int8Array;
    doors: Set<number>; open: Cells[]; tasks: TaskSpot[];
};

/** Small deterministic PRNG so layouts are identical on server and client. */
export function rng(seed: number) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const shuffle = <T>(list: T[], r: () => number) => { const a = [...list]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

export const cellCenter = (cx: number, cy: number): Point => ({ x: (cx + 0.5) * CELL, y: (cy + 0.5) * CELL });
export const cellOf = (p: Point) => ({ cx: Math.floor(p.x / CELL), cy: Math.floor(p.y / CELL) });
const inside = (l: Layout, cx: number, cy: number) => cx >= 0 && cy >= 0 && cx < l.cols && cy < l.rows;
const fill = (l: Layout, [x, y, w, h]: Cells, f: (i: number) => void) => { for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) if (inside(l, cx, cy)) f(cy * l.cols + cx); };

export function solidAt(l: Layout, flags: Flags, cx: number, cy: number) {
    if (!inside(l, cx, cy)) return true;
    const t = l.type[cy * l.cols + cx];
    return t === FLOOR ? false : t === GATE ? !flags.gateOpen : t === EXIT ? !flags.exitOpen : true;
}
export function sightAt(l: Layout, flags: Flags, cx: number, cy: number) {
    if (!inside(l, cx, cy)) return true;
    const i = cy * l.cols + cx, t = l.type[i];
    if (t === FLOOR) return false;
    if (t === GATE) return !flags.gateOpen;
    if (t === EXIT) return !flags.exitOpen;
    return t === WALL || !LOW.has(LOOKS[l.look[i]]);
}
export function districtAt(l: Layout, p: Point) {
    const { cx, cy } = cellOf(p);
    return inside(l, cx, cy) ? l.def.districts[l.district[cy * l.cols + cx]]?.name ?? '' : '';
}

/** Circle against solid cells and props. */
export function blocked(l: Layout, flags: Flags, x: number, y: number, r: number, props: readonly PropState[] = []) {
    const x0 = Math.floor((x - r) / CELL), x1 = Math.floor((x + r) / CELL), y0 = Math.floor((y - r) / CELL), y1 = Math.floor((y + r) / CELL);
    for (let cy = y0; cy <= y1; cy++) for (let cx = x0; cx <= x1; cx++) {
        if (!solidAt(l, flags, cx, cy)) continue;
        const nx = Math.max(cx * CELL, Math.min(x, (cx + 1) * CELL)), ny = Math.max(cy * CELL, Math.min(y, (cy + 1) * CELL));
        if ((x - nx) ** 2 + (y - ny) ** 2 < r * r) return true;
    }
    for (const p of props) if ((x - p.x) ** 2 + (y - p.y) ** 2 < (r + p.r) ** 2) return true;
    return false;
}
export function move(l: Layout, flags: Flags, p: Point, dx: number, dy: number, r: number, props: readonly PropState[] = []) {
    // Small steps keep fast movers from tunnelling through thin walls.
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 10));
    for (let s = 0; s < steps; s++) {
        if (!blocked(l, flags, p.x + dx / steps, p.y, r, props)) p.x += dx / steps;
        if (!blocked(l, flags, p.x, p.y + dy / steps, r, props)) p.y += dy / steps;
    }
}

/** Distance along a ray to the first cell that blocks sight (grid traversal), capped at max. */
export function castRay(l: Layout, flags: Flags, o: Point, angle: number, max: number) {
    const dx = Math.cos(angle), dy = Math.sin(angle);
    let cx = Math.floor(o.x / CELL), cy = Math.floor(o.y / CELL);
    if (sightAt(l, flags, cx, cy)) return 0;
    const stepX = dx > 0 ? 1 : -1, stepY = dy > 0 ? 1 : -1;
    const tdx = Math.abs(CELL / (dx || 1e-9)), tdy = Math.abs(CELL / (dy || 1e-9));
    let tx = Math.abs(((dx > 0 ? (cx + 1) * CELL : cx * CELL) - o.x) / (dx || 1e-9));
    let ty = Math.abs(((dy > 0 ? (cy + 1) * CELL : cy * CELL) - o.y) / (dy || 1e-9));
    for (let i = 0; i < 400; i++) {
        let t: number;
        if (tx < ty) { t = tx; tx += tdx; cx += stepX; } else { t = ty; ty += tdy; cy += stepY; }
        if (t >= max) return max;
        if (sightAt(l, flags, cx, cy)) return t;
    }
    return max;
}
export function los(l: Layout, flags: Flags, a: Point, b: Point) {
    const d = Math.hypot(b.x - a.x, b.y - a.y);
    return d < 1 || castRay(l, flags, a, Math.atan2(b.y - a.y, b.x - a.x), d) >= d - 0.5;
}
/** Everything visible from a point within range, as a polygon for drawing. */
export function visionPolygon(l: Layout, flags: Flags, o: Point, range: number, rays = 144) {
    const out: Point[] = [];
    for (let i = 0; i < rays; i++) {
        const a = (i / rays) * Math.PI * 2, d = Math.min(range, castRay(l, flags, o, a, range) + 10);
        out.push({ x: o.x + Math.cos(a) * d, y: o.y + Math.sin(a) * d });
    }
    return out;
}

/** Cells bots and the validator treat as walkable: open floor not occupied by a prop. */
export function walkMask(l: Layout, flags: Flags, props: readonly PropState[] = []) {
    const mask = new Uint8Array(l.cols * l.rows);
    for (let cy = 0; cy < l.rows; cy++) for (let cx = 0; cx < l.cols; cx++) mask[cy * l.cols + cx] = solidAt(l, flags, cx, cy) ? 0 : 1;
    for (const p of props) { const { cx, cy } = cellOf(p); mask[cy * l.cols + cx] = 0; }
    return mask;
}
export function flood(l: Layout, mask: Uint8Array, start: Point) {
    const seen = new Uint8Array(mask.length), { cx, cy } = cellOf(start), first = cy * l.cols + cx;
    if (!mask[first]) return seen;
    const queue = [first]; seen[first] = 1;
    for (let k = 0; k < queue.length; k++) {
        const i = queue[k], x = i % l.cols, y = (i - x) / l.cols;
        for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
            if (!inside(l, nx, ny)) continue;
            const n = ny * l.cols + nx;
            if (mask[n] && !seen[n]) { seen[n] = 1; queue.push(n); }
        }
    }
    return seen;
}

/** Shortest walkable route between two points as world waypoints, smoothed where the way is clear. */
export function findPath(l: Layout, mask: Uint8Array, from: Point, to: Point, flags: Flags, props: readonly PropState[] = []): Point[] {
    const start = nearestOpen(l, mask, from), goal = nearestOpen(l, mask, to);
    if (start < 0 || goal < 0) return [];
    const parent = new Int32Array(mask.length).fill(-1), queue = [start];
    parent[start] = start;
    for (let k = 0; k < queue.length && parent[goal] < 0; k++) {
        const i = queue[k], x = i % l.cols, y = (i - x) / l.cols;
        for (const [nx, ny, diag] of [[x + 1, y, 0], [x - 1, y, 0], [x, y + 1, 0], [x, y - 1, 0], [x + 1, y + 1, 1], [x - 1, y - 1, 1], [x + 1, y - 1, 1], [x - 1, y + 1, 1]]) {
            if (!inside(l, nx, ny)) continue;
            const n = ny * l.cols + nx;
            if (!mask[n] || parent[n] >= 0) continue;
            if (diag && (!mask[y * l.cols + nx] || !mask[ny * l.cols + x])) continue;
            parent[n] = i; queue.push(n);
        }
    }
    if (parent[goal] < 0) return [];
    const cells: number[] = [];
    for (let i = goal; i !== start; i = parent[i]) cells.unshift(i);
    const points = cells.map(i => cellCenter(i % l.cols, Math.floor(i / l.cols)));
    if (points.length) points[points.length - 1] = { ...to };
    // String-pull: skip waypoints while the straight line stays clear for a player-sized circle.
    const out: Point[] = [];
    let at = from;
    for (let i = 0; i < points.length; i++) {
        const next = points[i + 1];
        if (next && clearLine(l, flags, at, next, props)) continue;
        out.push(points[i]); at = points[i];
    }
    return out;
}
function clearLine(l: Layout, flags: Flags, a: Point, b: Point, props: readonly PropState[]) {
    const n = Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 14);
    for (let i = 1; i <= n; i++) if (blocked(l, flags, a.x + (b.x - a.x) * i / n, a.y + (b.y - a.y) * i / n, 20, props)) return false;
    return true;
}
function nearestOpen(l: Layout, mask: Uint8Array, p: Point) {
    const { cx, cy } = cellOf(p);
    for (let r = 0; r < 6; r++) for (let y = cy - r; y <= cy + r; y++) for (let x = cx - r; x <= cx + r; x++)
        if (inside(l, x, y) && mask[y * l.cols + x] && (Math.abs(x - cx) === r || Math.abs(y - cy) === r)) return y * l.cols + x;
    return -1;
}

/** Builds the walls, passages and task spots for a map and public seed. */
export function buildLayout(def: MapDef, seed: number): Layout {
    const r = rng(seed);
    const l: Layout = { def, seed, cols: def.cols, rows: def.rows, w: def.cols * CELL, h: def.rows * CELL, type: new Uint8Array(def.cols * def.rows).fill(WALL), look: new Uint8Array(def.cols * def.rows), district: new Int8Array(def.cols * def.rows).fill(-1), doors: new Set(), open: [], tasks: [] };
    def.districts.forEach((d, k) => fill(l, d.rect, i => { l.type[i] = FLOOR; l.district[i] = k; }));
    for (const d of def.doors) fill(l, d, i => { l.type[i] = FLOOR; l.doors.add(i); });
    // Open about half of the optional passages, at least two.
    const order = shuffle(def.optional, r), opened = order.slice(0, Math.max(2, Math.round(order.length * (0.4 + r() * 0.3))));
    for (const d of opened) { fill(l, d, i => { l.type[i] = FLOOR; l.doors.add(i); }); l.open.push(d); }
    for (const b of def.blocks) fill(l, b.rect, i => { l.type[i] = BLOCK; l.look[i] = LOOKS.indexOf(b.look); });
    fill(l, def.gate, i => { l.type[i] = GATE; });
    fill(l, def.exitDoor, i => { l.type[i] = EXIT; });
    // Floor cells that inherit no district (doors) take their neighbour's, so the HUD always names where you are.
    for (const i of l.doors) if (l.district[i] < 0) { const x = i % l.cols, y = (i - x) / l.cols; for (const n of [i - 1, i + 1, i - l.cols, i + l.cols]) if (l.district[n] >= 0 && Math.abs((n % l.cols) - x) <= 1 && Math.abs(Math.floor(n / l.cols) - y) <= 1) { l.district[i] = l.district[n]; break; } }
    let id = 0;
    for (const type of ['panel', 'label', 'loading'] as TaskType[]) {
        const picks = shuffle(def.tasks[type], r).filter(([cx, cy]) => l.type[cy * l.cols + cx] === FLOOR && !nearDoor(l, cx, cy)).slice(0, 3);
        for (const [cx, cy] of picks) l.tasks.push({ id: 't' + id++, type, cx, cy, ...cellCenter(cx, cy), district: def.districts[l.district[cy * l.cols + cx]]?.name ?? '' });
    }
    return l;
}
const nearDoor = (l: Layout, cx: number, cy: number) => { for (let y = cy - 1; y <= cy + 1; y++) for (let x = cx - 1; x <= cx + 1; x++) if (l.doors.has(y * l.cols + x)) return true; return false; };

export const spawnPoints = (l: Layout, [x, y, w, h]: Cells, count: number) => {
    const cells: Point[] = [];
    for (let cy = y; cy < y + h; cy++) for (let cx = x; cx < x + w; cx++) if (l.type[cy * l.cols + cx] === FLOOR) cells.push(cellCenter(cx, cy));
    return Array.from({ length: count }, (_, i) => cells[Math.floor((i + 0.5) * cells.length / count)] ?? cells[0]);
};

/** Places props from a secret seed: clustered, never in doorways, tasks, spawns or the exit, never cutting off a route. */
export function chooseProps(l: Layout, secret: number, kinds: Record<string, { r: number }>): PropState[] {
    const r = rng(secret ^ 0x5bd1e995), out: PropState[] = [];
    const reserved = new Set<number>();
    for (const t of l.tasks) for (let y = t.cy - 1; y <= t.cy + 1; y++) for (let x = t.cx - 1; x <= t.cx + 1; x++) reserved.add(y * l.cols + x);
    for (const zone of [l.def.spawn, l.def.staging, l.def.exitZone]) fill(l, zone, i => reserved.add(i));
    const taken = new Set<number>();
    let n = 0;
    for (const cluster of l.def.props) {
        for (const [cx, cy] of shuffle(cluster.spots, r).slice(0, cluster.pick)) {
            const i = cy * l.cols + cx;
            if (!inside(l, cx, cy) || l.type[i] !== FLOOR || reserved.has(i) || taken.has(i) || nearDoor(l, cx, cy)) continue;
            const kind = cluster.kinds[Math.floor(r() * cluster.kinds.length)];
            const c = cellCenter(cx, cy);
            out.push({ id: 'p' + n++, kind, x: Math.round(c.x + (r() - 0.5) * 16), y: Math.round(c.y + (r() - 0.5) * 12), flip: r() < 0.5, r: kinds[kind]?.r ?? 18 });
            taken.add(i);
        }
    }
    // Drop props (latest first) until every objective is reachable again.
    while (out.length && validate(l, out).length) out.pop();
    return out;
}

/** Problems with a layout: anything a thief or police officer could not reach. Empty means valid. */
export function validate(l: Layout, props: readonly PropState[] = []): string[] {
    const problems: string[] = [];
    const open = { gateOpen: true, exitOpen: true }, shut = { gateOpen: false, exitOpen: false };
    const spawn = spawnPoints(l, l.def.spawn, 1)[0];
    if (!spawn) return ['no spawn floor'];
    const reach = flood(l, walkMask(l, open, props), spawn);
    const at = (p: Point) => { const { cx, cy } = cellOf(p); return reach[cy * l.cols + cx] === 1; };
    const near = (cx: number, cy: number) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => inside(l, cx + dx, cy + dy) && reach[(cy + dy) * l.cols + cx + dx] === 1);
    if (l.tasks.length < 6) problems.push(`only ${l.tasks.length} task spots`);
    for (const t of l.tasks) if (!near(t.cx, t.cy) && !at(t)) problems.push(`task ${t.id} unreachable`);
    if (!at(cellCenter(l.def.exitZone[0] + 1, l.def.exitZone[1] + 1))) problems.push('exit unreachable');
    if (!at(cellCenter(l.def.staging[0] + 1, l.def.staging[1] + 1))) problems.push('staging cut off after the gate opens');
    for (const p of props) { const { cx, cy } = cellOf(p); if (!near(cx, cy)) problems.push(`prop ${p.id} unreachable`); }
    // With the gate shut, police are confined; with the exit locked, nobody leaves.
    const before = flood(l, walkMask(l, shut, props), spawn);
    const s = cellCenter(l.def.staging[0] + 1, l.def.staging[1] + 1), e = cellCenter(l.def.exitZone[0] + 1, l.def.exitZone[1] + 1);
    if (before[cellOf(s).cy * l.cols + cellOf(s).cx]) problems.push('staging reachable before the gate opens');
    if (before[cellOf(e).cy * l.cols + cellOf(e).cx]) problems.push('exit reachable while locked');
    return problems;
}
