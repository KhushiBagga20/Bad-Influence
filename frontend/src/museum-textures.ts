import Phaser from 'phaser';
import {WORLD} from '../../shared/world';

/** World units per art pixel. Sprites from the pixel atlas and the floor are both drawn at this scale. */
export const PX = 4;

const ROOMS = [[45, 57, 57], [58, 54, 51], [49, 47, 59], [48, 64, 49], [64, 50, 47]];
const CORRIDOR = [23, 36, 44];
const LAMPS = [[290, 150], [840, 145], [1390, 145], [290, 680], [840, 680], [1390, 680]];
const RUGS = [[655, 275, 370, 150], [1200, 265, 370, 160], [190, 610, 245, 275]];
const INLAYS = [[44, 108, 480, 420], [590, 108, 480, 420], [1150, 108, 480, 420], [1730, 80, 340, 420], [2220, 80, 340, 420]];
const SKYLIGHTS = [1800, 2270];
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(n => (n + .5) / 16);

/**
 * The museum floor as pixel art, generated once at one pixel per PX world units and drawn scaled up
 * with nearest-neighbour sampling: marble tiles per wing, rugs, inlaid borders, and lamp pools and
 * moonlight shafts shaded with ordered dithering instead of soft gradients.
 */
export function createMuseumFloor(scene: Phaser.Scene) {
    if (scene.textures.exists('museum-floor')) return;
    const w = Math.ceil(WORLD.w / PX), h = Math.ceil(WORLD.h / PX);
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const context = canvas.getContext('2d')!, image = context.createImageData(w, h), data = image.data;
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const wx = x * PX + PX / 2, wy = y * PX + PX / 2, corridor = wy > 944;
        const dither = BAYER[(y % 4) * 4 + x % 4];
        let [r, g, b] = corridor ? CORRIDOR : ROOMS[Math.min(4, Math.floor(wx / 550))];
        // Marble tiles: alternating tones, a dark seam, and the odd speckle.
        const size = corridor ? 6 : 8, tx = Math.floor(x / size), ty = Math.floor(y / size);
        let shade = (tx + ty) % 2 ? 3 : -2;
        if (x % size === 0 || y % size === 0) shade -= 8;
        const hash = Math.imul(x * 73856093 ^ y * 19349663, 2654435761) >>> 0;
        if (hash % 29 === 0) shade += 6; else if (hash % 37 === 0) shade -= 5;
        r += shade; g += shade; b += shade;
        if (!corridor) {
            // Warm lamp pools, brighter toward the middle.
            for (const [lx, ly] of LAMPS) {
                const d = Math.hypot((wx - lx) / 150, (wy - ly) / 98);
                if (d < 1 && (1 - d) * 1.2 > dither) { r += 10; g += 7; b += 1; }
            }
            // Moonlight through the east-wing skylights.
            for (const sx of SKYLIGHTS) {
                if (wy < 70 || wy > 500) continue;
                const t = (wy - 70) / 430, left = sx + 150 * t, right = sx + 180 + 150 * t;
                if (wx > left && wx < right && dither < .3) { r += 4; g += 7; b += 10; }
            }
            for (const [ix, iy, iw, ih] of INLAYS) {
                const onX = (wx >= ix && wx < ix + PX) || (wx >= ix + iw - PX && wx < ix + iw);
                const onY = (wy >= iy && wy < iy + PX) || (wy >= iy + ih - PX && wy < iy + ih);
                if ((onX && wy >= iy && wy < iy + ih) || (onY && wx >= ix && wx < ix + iw)) { r += 14; g += 12; b += 8; }
            }
            for (const [rx, ry, rw, rh] of RUGS) {
                if (wx < rx || wx >= rx + rw || wy < ry || wy >= ry + rh) continue;
                const ex = Math.min(wx - rx, rx + rw - wx), ey = Math.min(wy - ry, ry + rh - wy), edge = Math.min(ex, ey);
                const motif = ((Math.floor((wx - rx) / PX) + Math.floor((wy - ry) / PX)) % 6 === 0) && edge > 20;
                [r, g, b] = edge < PX ? [58, 34, 36] : edge >= 2 * PX && edge < 3 * PX ? [161, 124, 96] : motif ? [86, 50, 52] : [106, 66, 67];
            }
        }
        const i = (y * w + x) * 4;
        data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = 255;
    }
    context.putImageData(image, 0, 0);
    scene.textures.addCanvas('museum-floor', canvas)!.setFilter(Phaser.Textures.FilterMode.NEAREST);
}
