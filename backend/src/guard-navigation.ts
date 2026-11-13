import { WORLD, blocked, dist, type Point } from '../../shared/world.js';
const step = 40, cols = Math.ceil(WORLD.w / step), rows = Math.ceil(WORLD.h / step);
function clear(a: Point, b: Point) { const count = Math.ceil(dist(a, b) / 12); for (let i = 1; i <= count; i++)
    if (blocked(a.x + (b.x - a.x) * i / count, a.y + (b.y - a.y) * i / count, 16))
        return false; return true; }
const nodes = Array.from({ length: cols * rows }, (_, i) => ({ x: (i % cols) * step + 20, y: Math.floor(i / cols) * step + 20 }));
const allowed = nodes.map(p => !blocked(p.x, p.y, 18));
export function path(from: Point, to: Point): Point[] {
    if (clear(from, to))
        return [{ ...to }];
    const closest = (p: Point) => nodes.reduce((best, n, i) => allowed[i] && dist(n, p) < dist(nodes[best], p) ? i : best, allowed.findIndex(Boolean));
    const start = closest(from), end = closest(to), queue = [start], parent = new Map<number, number>([[start, -1]]);
    for (let k = 0; k < queue.length; k++) {
        const n = queue[k];
        if (n === end)
            break;
        for (const next of [n - cols, n + cols, n - 1, n + 1])
            if (next >= 0 && next < nodes.length && allowed[next] && !parent.has(next) && dist(nodes[n], nodes[next]) <= step + 1 && clear(nodes[n], nodes[next])) {
                parent.set(next, n);
                queue.push(next);
            }
    }
    if (!parent.has(end))
        return [];
    const out: Point[] = [];
    let n = end;
    while (n !== start) {
        out.unshift(nodes[n]);
        n = parent.get(n)!;
    }
    if (clear(from, nodes[start]))
        out.unshift(nodes[start]);
    if (clear(nodes[end], to))
        out.push({ ...to });
    return out;
}
