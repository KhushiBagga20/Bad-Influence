/**
 * Keyboard, mouse and touch. Thieves: Q copy/drop disguise, R mirror, E task, F decoy, Space smoke.
 * Police: aim with the mouse (or the right stick), click/Space to fire, Q or right-click to stun.
 */
import type Phaser from 'phaser';
import type { Point } from '../../shared/rules.js';
import { act, me, store } from './net.js';
import { unlock } from './audio.js';

const MOVE: Record<string, Point> = { KeyW: { x: 0, y: -1 }, ArrowUp: { x: 0, y: -1 }, KeyS: { x: 0, y: 1 }, ArrowDown: { x: 0, y: 1 }, KeyA: { x: -1, y: 0 }, ArrowLeft: { x: -1, y: 0 }, KeyD: { x: 1, y: 0 }, ArrowRight: { x: 1, y: 0 } };
const typing = () => { const t = document.activeElement?.tagName; return t === 'INPUT' || t === 'SELECT' || t === 'TEXTAREA'; };

export const input = {
    keys: new Set<string>(),
    stick: { x: 0, y: 0 } as Point,
    aimStick: null as Point | null,
    touch: matchMedia('(pointer: coarse)').matches,
    usingMouse: false,
    /** What the thief's Q and E would act on right now (set by the scene each frame). */
    targets: {} as { prop?: string; task?: string },
    onHelp: () => {},
    vector(): Point {
        let x = this.stick.x, y = this.stick.y;
        if (!typing()) for (const k of this.keys) { const v = MOVE[k]; if (v) { x += v.x; y += v.y; } }
        const n = Math.hypot(x, y);
        return n > 1 ? { x: x / n, y: y / n } : n < 0.12 ? { x: 0, y: 0 } : { x, y };
    },
    aim(scene: Phaser.Scene, from: Point, prev: number) {
        if (this.aimStick) return Math.atan2(this.aimStick.y, this.aimStick.x);
        if (this.usingMouse) { const p = scene.input.activePointer, w = scene.cameras.main.getWorldPoint(p.x, p.y); return Math.atan2(w.y - (from.y - 20), w.x - from.x); }
        const v = this.vector();
        return v.x || v.y ? Math.atan2(v.y, v.x) : prev;
    },
    action(name: string) {
        unlock();
        const p = me();
        if (!p) return;
        switch (name) {
            case 'disguise': return this.targets.prop ? act('disguise:' + this.targets.prop) : p.disguise ? act('undisguise') : undefined;
            case 'undisguise': return act('undisguise');
            case 'rotate': return act('rotate');
            case 'task': return p.task ? act('cancel') : this.targets.task ? act('task:' + this.targets.task) : undefined;
            case 'decoy': return act('decoy');
            case 'smoke': return act('smoke');
            case 'fire': return act('shoot:' + store.aim.toFixed(4));
            case 'stun': return act('stun');
            case 'spectate': store.follow++; return;
        }
    },
    attach(scene: Phaser.Scene) {
        scene.input.mouse?.disableContextMenu();
        scene.input.on('pointermove', (ptr: Phaser.Input.Pointer) => { if (!ptr.wasTouch) this.usingMouse = true; });
        scene.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => {
            unlock();
            if (ptr.wasTouch || me()?.role !== 'police' || store.state?.phase !== 'play') return;
            if (ptr.rightButtonDown()) this.action('stun'); else if (ptr.leftButtonDown()) this.action('fire');
        });
    },
};

addEventListener('keydown', e => {
    unlock();
    if (typing()) return;
    if (MOVE[e.code]) { input.keys.add(e.code); e.preventDefault(); return; }
    if (e.repeat) return;
    const police = me()?.role === 'police';
    const map: Record<string, string> = police ? { Space: 'fire', KeyQ: 'stun', Tab: 'spectate' } : { KeyQ: 'disguise', KeyZ: 'undisguise', KeyR: 'rotate', KeyE: 'task', KeyF: 'decoy', Space: 'smoke', Tab: 'spectate' };
    const a = map[e.code];
    if (a && store.state?.match) { e.preventDefault(); input.action(a); }
    if (e.code === 'KeyH' || (e.code === 'Escape' && store.state?.match)) input.onHelp();
});
addEventListener('keyup', e => input.keys.delete(e.code));
addEventListener('blur', () => input.keys.clear());
