/**
 * Bakes a layout into one pixel-art texture at one pixel per PX world units: a floor material per district,
 * walls with a lit top and a darker front face for depth, furniture drawn by its look, paintings on gallery
 * walls, and lamp pools shaded with ordered dithering. Generated once per layout.
 */
import Phaser from 'phaser';
import { CELL, FLOOR, WALL, BLOCK, GATE, EXIT, LOOKS, type Layout, type Look, type Theme } from '../../shared/layout.js';

export const PX = 4;
const A = CELL / PX; // art pixels per cell (12)
type RGB = [number, number, number];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(n => (n + 0.5) / 16);
const hash = (x: number, y: number) => (Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0) / 4294967296;
const shade = (c: RGB, d: number): RGB => [c[0] + d, c[1] + d, c[2] + d];

const FLOORS: Record<string, (x: number, y: number) => RGB> = {
    parquet: (x, y) => { const col = Math.floor(x / 4), off = (col * 7) % 16, seam = x % 4 === 0 || (y + off) % 16 === 0; return shade([98, 68, 46], (hash(col, Math.floor((y + off) / 16)) * 14) - (seam ? 16 : 0) + hash(x, y) * 4); },
    marble: (x, y) => { const c = (Math.floor(x / 6) + Math.floor(y / 6)) % 2; return shade(c ? [176, 170, 156] : [150, 145, 134], (x % 6 === 0 || y % 6 === 0 ? -10 : 0) + (hash(x, y) < 0.04 ? 10 : 0)); },
    gallery: (x, y) => shade([122, 124, 124], (x % 12 === 0 || y % 12 === 0 ? -8 : 0) + hash(x, y) * 5),
    workshop: (x, y) => shade([110, 88, 64], (y % 4 === 0 ? -14 : 0) + (Math.floor(y / 4) % 2) * 5 + (hash(x, y) < 0.02 ? -20 : 0)),
    grass: (x, y) => { const h = hash(x, y); return h < 0.012 ? [214, 196, 120] : h < 0.02 ? [196, 120, 150] : shade([58, 88, 54], h * 16 - 6); },
    carpet: (x, y) => { const d = (x + y) % 10 === 0 || (x - y + 1000) % 10 === 0; return shade(d ? [118, 58, 60] : [92, 38, 46], hash(x, y) * 5); },
    archive: (x, y) => shade([78, 58, 44], (x % 5 === 0 ? -12 : 0) + (Math.floor(x / 5) % 2) * 5 + hash(x, y) * 4),
    concrete: (x, y) => shade([104, 104, 100], (x % 24 === 0 || y % 24 === 0 ? -10 : 0) + hash(x, y) * 10 - 5),
    asphalt: (x, y) => shade([56, 58, 64], hash(x, y) * 12 - 6),
    cobble: (x, y) => { const row = Math.floor(y / 3), sx = Math.floor((x + (row % 2) * 2) / 4); const mortar = y % 3 === 0 || (x + (row % 2) * 2) % 4 === 0; return mortar ? [60, 56, 54] : shade([104, 96, 88], hash(sx, row) * 22 - 8); },
    tile: (x, y) => (x % 6 === 0 || y % 6 === 0) ? [136, 138, 134] : shade([178, 180, 172], hash(x, y) * 6),
    metal: (x, y) => shade([86, 92, 100], ((x + y) % 4 === 0 && (x - y + 400) % 4 === 0 ? 14 : 0) + hash(x, y) * 4),
    neon: (x, y) => { const h = hash(Math.floor(x / 3), Math.floor(y / 3)); return h < 0.05 ? [200, 70, 160] : h < 0.1 ? [60, 190, 200] : h < 0.12 ? [230, 200, 90] : shade([36, 26, 56], hash(x, y) * 6); },
    wood: (x, y) => shade([128, 90, 60], (y % 4 === 0 ? -14 : 0) + (Math.floor(y / 4) % 3) * 4 + hash(x, y) * 4),
    rink: (x, y) => shade([64, 80, 104], (x % 30 === 0 || y % 30 === 0 ? 30 : 0) + hash(x, y) * 4),
    planks: (x, y) => shade([140, 104, 70], (x % 4 === 0 ? -26 : 0) + (Math.floor(x / 4) % 3) * 5 + (y % 37 === 0 ? -16 : 0) + hash(x, y) * 4),
    sand: (x, y) => shade([206, 182, 134], hash(x, y) * 16 - 8),
};
const WALLS: Record<Theme, { top: RGB; front: RGB; trim: RGB }> = {
    museum: { top: [92, 104, 106], front: [58, 66, 70], trim: [196, 176, 120] },
    market: { top: [110, 74, 58], front: [72, 46, 38], trim: [210, 160, 90] },
    arcade: { top: [66, 52, 96], front: [42, 32, 66], trim: [220, 90, 200] },
};
/** Blocks taller than you: these cast a front face like walls. */
const TALL = new Set<Look>(['wall', 'shelf', 'crates', 'monument', 'pillar', 'hedge', 'stall', 'awning', 'booth', 'machines']);

function blockPixel(look: Look, x: number, y: number, lx: number, ly: number, w: number, h: number, theme: Theme): RGB {
    // lx, ly: position inside the whole block in art pixels; w, h: block size in art pixels.
    const edge = lx < 1 || ly < 1 || lx >= w - 1 || ly >= h - 1;
    switch (look) {
        case 'desk': return edge ? [56, 36, 26] : shade([126, 84, 54], (ly % 5 === 0 ? -8 : 0) + ((lx > w * 0.6 && ly < h * 0.5 && lx < w - 3 && ly > 2) ? 40 : 0));
        case 'counter': return edge ? [70, 66, 60] : shade([186, 178, 160], hash(x, y) * 8);
        case 'table': return edge ? [60, 40, 30] : shade(theme === 'arcade' ? [190, 88, 80] : [150, 108, 70], ((lx + ly) % 6 === 0 ? 10 : 0));
        case 'cabinets': return edge ? [92, 64, 40] : (lx + ly) % 9 === 0 ? [235, 250, 255] : shade([132, 184, 196], hash(x, y) * 8);
        case 'shelf': { if (edge) return [60, 40, 28]; const c: RGB[] = [[170, 60, 50], [60, 110, 150], [200, 170, 80], [90, 140, 90], [140, 90, 150]]; return ly % 4 === 0 ? [96, 66, 44] : c[Math.floor(hash(Math.floor(lx / 2) + x, Math.floor(ly / 4)) * c.length)]; }
        case 'crates': return (lx % 12 === 0 || ly % 12 === 0 || lx === ly % 12) ? [92, 58, 34] : shade([170, 112, 64], hash(x, y) * 10 - 5);
        case 'monument': { const cx = w / 2, cy = h / 2, r = Math.hypot(lx - cx, ly - cy); return r < Math.min(w, h) * 0.22 ? [214, 206, 188] : r < Math.min(w, h) * 0.3 ? [176, 140, 70] : edge ? [70, 70, 66] : shade([128, 126, 118], hash(x, y) * 8); }
        case 'pillar': { const r = Math.hypot(lx - w / 2 + 0.5, ly - h / 2 + 0.5); return r < 4 ? shade([200, 194, 180], -r * 4) : r < 5.5 ? [110, 106, 98] : [0, 0, 0]; }
        case 'fountain': { const r = Math.hypot(lx - w / 2, ly - h / 2), R = Math.min(w, h) / 2; return r > R - 1 ? [0, 0, 0] : r > R - 4 ? [150, 146, 138] : r < 4 ? [196, 196, 186] : ((Math.floor(r) + Math.floor(lx / 3)) % 5 === 0 ? [150, 200, 220] : [60, 110, 150]); }
        case 'hedge': return shade([46, 92, 52], hash(Math.floor(x / 2), Math.floor(y / 2)) * 26 - 10);
        case 'stall': return ly < h * 0.55 ? (Math.floor(lx / 3) % 2 ? [200, 70, 60] : [236, 220, 190]) : edge ? [60, 40, 30] : shade([132, 92, 60], hash(x, y) * 8);
        case 'awning': return Math.floor((lx + ly) / 3) % 2 ? [60, 150, 140] : [236, 220, 190];
        case 'railing': return ly < 2 ? [200, 196, 186] : ly < 3 ? [90, 88, 84] : [0, 0, 0];
        case 'booth': return ly < h * 0.5 ? (Math.floor(lx / 3) % 2 ? [70, 120, 200] : [236, 236, 230]) : edge ? [50, 50, 60] : [180, 170, 150];
        case 'machines': { const slot = lx % 12; return slot < 1 || slot > 10 ? [24, 18, 36] : ly < h * 0.45 ? (ly > 1 && slot > 2 && slot < 9 ? [[60, 210, 200], [230, 90, 170], [240, 200, 80]][Math.floor(lx / 12) % 3] as RGB : [70, 50, 110]) : shade([90, 64, 140], (ly % 4 === 0 ? -12 : 0)); }
        case 'water': return shade([50, 100, 140], hash(x, y) * 12);
        case 'sand': return FLOORS.sand(x, y);
        default: { const t = WALLS[theme]; return edge ? shade(t.top, -16) : shade(t.top, hash(Math.floor(x / 3), Math.floor(y / 2)) * 8 - 4); }
    }
}

export function bakeLayout(scene: Phaser.Scene, l: Layout) {
    const key = `map-${l.def.id}-${l.seed}`;
    if (scene.textures.exists(key)) return key;
    const theme = l.def.theme, W = l.cols * A, H = l.rows * A, walls = WALLS[theme];
    const canvas = document.createElement('canvas');
    canvas.width = W; canvas.height = H;
    const ctx = canvas.getContext('2d')!, img = ctx.createImageData(W, H), data = img.data;
    const typeAt = (cx: number, cy: number) => cx < 0 || cy < 0 || cx >= l.cols || cy >= l.rows ? WALL : l.type[cy * l.cols + cx];
    const lookAt = (cx: number, cy: number) => LOOKS[l.look[cy * l.cols + cx]];
    const floorOf = (cx: number, cy: number) => {
        let d = l.district[cy * l.cols + cx];
        if (d < 0) for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) { const n = l.district[(cy + dy) * l.cols + cx + dx]; if (n >= 0) { d = n; break; } }
        return FLOORS[l.def.districts[d]?.floor ?? 'concrete'] ?? FLOORS.concrete;
    };
    // Each block's bounding box, so furniture is drawn as one piece rather than tile by tile.
    const boxes = new Map<number, [number, number, number, number]>();
    for (const b of l.def.blocks) for (let cy = b.rect[1]; cy < b.rect[1] + b.rect[3]; cy++) for (let cx = b.rect[0]; cx < b.rect[0] + b.rect[2]; cx++) boxes.set(cy * l.cols + cx, b.rect);
    const galleries = new Set(l.def.districts.filter(d => /Gallery|Wing|Curiosities|Sculpture/.test(d.name)).map(d => l.def.districts.indexOf(d)));
    const lights = l.def.lights.map(([cx, cy]) => [(cx + 0.5) * A, (cy + 0.5) * A]);
    const FACE = 6;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const cx = Math.floor(x / A), cy = Math.floor(y / A), lx = x % A, ly = y % A, t = typeAt(cx, cy);
        let c: RGB;
        if (t === WALL || (t === BLOCK && lookAt(cx, cy) === 'wall')) {
            const below = typeAt(cx, cy + 1), open = below !== WALL && !(below === BLOCK && TALL.has(lookAt(cx, cy + 1)));
            c = open && ly >= A - 2 ? shade(walls.top, 18) : shade(walls.top, (lx === 0 || ly === 0 ? -10 : 0) + hash(Math.floor(x / 4), Math.floor(y / 3)) * 6);
            if (t === WALL && l.district[cy * l.cols + cx] < 0 && typeAt(cx, cy - 1) === WALL && typeAt(cx, cy + 1) === WALL && typeAt(cx - 1, cy) === WALL && typeAt(cx + 1, cy) === WALL) c = shade(walls.top, -26);
        } else if (t === BLOCK) {
            const r = boxes.get(cy * l.cols + cx)!;
            c = blockPixel(lookAt(cx, cy), x, y, x - r[0] * A, y - r[1] * A, r[2] * A, r[3] * A, theme);
            if (c[0] === 0 && c[1] === 0 && c[2] === 0) c = floorOf(cx, cy)(x, y);
        } else c = floorOf(cx, cy)(x, y);
        // Front faces: a band at the top of floor cells under walls and tall furniture, for depth.
        if (t === FLOOR || t === GATE || t === EXIT || (t === BLOCK && !TALL.has(lookAt(cx, cy)))) {
            const above = typeAt(cx, cy - 1), tall = above === WALL || (above === BLOCK && TALL.has(lookAt(cx, cy - 1)));
            if (tall && ly < FACE) {
                const wallish = above === WALL || lookAt(cx, cy - 1) === 'wall';
                const face = wallish ? null : blockPixel(lookAt(cx, cy - 1), x, y, lx, A - 1, A, A, theme);
                // Pillars get a stone shaft; anything else that has no pixels on its bottom edge casts no face.
                if (!wallish && lookAt(cx, cy - 1) === 'pillar') c = lx >= 3 && lx <= 8 ? shade([170, 164, 150], -ly * 6 - Math.abs(lx - 5.5) * 6) : c;
                else if (face && face[0] + face[1] + face[2] === 0) { /* nothing above to show */ }
                else c = wallish ? shade(walls.front, ly === FACE - 1 ? -18 : (ly === 1 && theme === 'arcade' ? 0 : 0) + hash(Math.floor(x / 5), ly) * 5) : shade(blockPixel(lookAt(cx, cy - 1), x, y, lx, A - 1, A, A, theme), -40 + ly * 2);
                if (wallish && theme === 'arcade' && ly === 1) c = (Math.floor(x / 24) % 2) ? [220, 90, 200] : [70, 210, 220];
                if (wallish && theme === 'museum' && ly === 4) c = shade(walls.trim, -40);
                // Paintings hang on gallery walls, every few cells.
                if (wallish && theme === 'museum' && galleries.has(l.district[cy * l.cols + cx]) && (cx * 7 + cy) % 3 === 0 && lx >= 3 && lx <= 8 && ly >= 0 && ly <= 4) {
                    c = lx === 3 || lx === 8 || ly === 0 || ly === 4 ? walls.trim : [[90, 120, 90], [150, 90, 70], [80, 100, 140], [170, 140, 80]][(cx + cy) % 4] as RGB;
                }
            } else if (above === BLOCK && !TALL.has(lookAt(cx, cy - 1)) && ly < 2) c = shade(c, -24);
            // Lamp pools: dithered, warm, brighter toward the middle.
            for (const [px, py] of lights) {
                const d = Math.hypot((x - px) / (A * 5.5), (y - py) / (A * 4.5));
                if (d < 1 && (1 - d) * 1.3 > BAYER[(y % 4) * 4 + (x % 4)]) { c = shade(c, 12); c[2] -= 6; }
            }
        }
        const i = (y * W + x) * 4;
        data[i] = Math.max(0, Math.min(255, c[0])); data[i + 1] = Math.max(0, Math.min(255, c[1])); data[i + 2] = Math.max(0, Math.min(255, c[2])); data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    scene.textures.addCanvas(key, canvas)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
    return key;
}
