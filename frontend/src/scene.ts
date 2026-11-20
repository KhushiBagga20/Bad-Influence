/**
 * The Phaser scene. Draws only what the server sent: for police, props and thieves outside their team's
 * sight simply aren't in the state, and a fog covers everything their team can't see.
 */
import Phaser from 'phaser';
import { CELL, castRay, cellCenter, los, move, visionPolygon, type Layout, type Flags } from '../../shared/layout.js';
import { layoutFor, mapDef, PROP_KINDS } from '../../shared/maps.js';
import { BLASTER, CUE, DISGUISE, SPEED, STUN, SMOKE, TASK, TEAM_COLORS, VISION, thiefTeam, type Player, type Point, type PropState, type State } from '../../shared/rules.js';
import { PIXEL_ATLAS, PIXEL_FRAMES } from './pixel-atlas.js';
import { bakeLayout, PX } from './textures.js';
import { store, me } from './net.js';
import { play } from './audio.js';
import { input } from './input.js';

const hex = (s: string) => parseInt(s.replace('#', ''), 16);
const dist = (a: Point, b: Point) => Math.hypot(a.x - b.x, a.y - b.y);
const facingName = (a: number) => { const c = Math.cos(a), s = Math.sin(a); return Math.abs(c) >= Math.abs(s) * 0.9 ? (c > 0 ? 'right' : 'left') : s > 0 ? 'down' : 'up'; };
export const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Bottom-of-sprite offset so prop art sits on its spot, by kind (tall things stand a little lower). */
const FOOT = 16;

export class GameScene extends Phaser.Scene {
    map?: Phaser.GameObjects.Image; mapKey = '';
    g!: Phaser.GameObjects.Graphics; top!: Phaser.GameObjects.Graphics; brush!: Phaser.GameObjects.Graphics;
    fog!: Phaser.GameObjects.RenderTexture;
    pool: Phaser.GameObjects.Image[] = []; used = 0;
    labels = new Map<string, Phaser.GameObjects.Text>();
    smoothed = new Map<string, Point>(); facing = new Map<string, number>(); last = new Map<string, Point>();
    seen = new Set<string>(); exitWasOpen = false; gateWasOpen = false;
    cam: Point = { x: 2000, y: 1300 };
    title = { layout: null as Layout | null, props: [] as PropState[] };
    preload() { this.load.image('pixel', PIXEL_ATLAS); }
    create() {
        const atlas = this.textures.get('pixel');
        for (const [name, [x, y, w, h]] of Object.entries(PIXEL_FRAMES)) atlas.add(name, 0, x, y, w, h);
        atlas.setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.g = this.add.graphics().setDepth(2);
        this.top = this.add.graphics().setDepth(41);
        this.brush = this.make.graphics({}, false);
        this.fog = this.add.renderTexture(0, 0, 16, 16).setOrigin(0).setDepth(40).setVisible(false);
        this.cameras.main.setBackgroundColor('#07080a');
        document.fonts?.load('12px Silkscreen').then(() => this.labels.forEach(l => l.updateText())).catch(() => {});
        input.attach(this);
    }

    // ---- small drawing helpers -------------------------------------------------------------------
    sprite(frame: string, x: number, y: number, o: { tint?: number; alpha?: number; flip?: boolean; depth?: number; scale?: number; originY?: number } = {}) {
        let s = this.pool[this.used++];
        if (!s) { s = this.add.image(0, 0, 'pixel', frame); this.pool.push(s); }
        return s.setFrame(frame).setOrigin(0.5, o.originY ?? 1).setScale((o.scale ?? 1) * PX).setPosition(Math.round(x), Math.round(y)).setTint(o.tint ?? 0xffffff).setAlpha(o.alpha ?? 1).setFlipX(!!o.flip).setDepth(o.depth ?? 3 + y / 10000).setVisible(true);
    }
    label(id: string, x: number, y: number, text: string, color = '#eadfc4', size = 9, depth = 45) {
        let t = this.labels.get(id);
        if (!t) { t = this.add.text(0, 0, '', { fontFamily: 'Silkscreen, monospace', fontSize: size, color, align: 'center', stroke: '#000000', strokeThickness: 3 }).setOrigin(0.5); this.labels.set(id, t); }
        t.setPosition(Math.round(x), Math.round(y)).setText(text).setColor(color).setFontSize(size).setDepth(depth).setAlpha(1).setVisible(true);
        return t;
    }
    smooth(id: string, target: Point, delta: number, ms: number) {
        let p = this.smoothed.get(id);
        if (!p || dist(p, target) > 220) { p = { x: target.x, y: target.y }; this.smoothed.set(id, p); }
        const k = 1 - Math.exp(-delta / ms);
        p.x += (target.x - p.x) * k; p.y += (target.y - p.y) * k;
        return p;
    }
    heading(id: string, p: Point) {
        const last = this.last.get(id);
        if (last && dist(last, p) > 0.6) this.facing.set(id, Math.atan2(p.y - last.y, p.x - last.x));
        this.last.set(id, { x: p.x, y: p.y });
        return this.facing.get(id) ?? Math.PI / 2;
    }
    character(p: Player, x: number, y: number, time: number, angle: number) {
        const role = p.role === 'police' ? 'cop' : 'thief', dir = facingName(angle), step = p.moving ? [1, 0, 2, 0][Math.floor(time / 130) % 4] : 0;
        this.sprite('shadow', x, y + 19, { depth: 2.5 });
        const body = this.sprite(`${role}-${dir}-${step}`, x, y + FOOT);
        if (role === 'thief') this.sprite(`thief-shirt-${dir}-${step}`, x, y + FOOT, { tint: hex(p.color), depth: body.depth + 1e-6 });
    }
    prop(q: PropState, time: number, x = q.x, y = q.y, alpha = 1) {
        const wob = q.wobble && !reducedMotion ? Math.sin(time / 40) * 3 : 0;
        this.sprite('shadow', x, y + 19, { depth: 2.5, alpha });
        this.sprite(q.kind in PIXEL_FRAMES ? q.kind : 'crate', x + wob, y + FOOT, { flip: q.flip, alpha });
    }

    // ---- frame -------------------------------------------------------------------------------------
    update(time: number, delta: number) {
        this.used = 0; this.g.clear(); this.top.clear();
        this.labels.forEach(l => l.setVisible(false));
        const s = store.state, inGame = !!s?.match && ['briefing', 'prep', 'play', 'roundEnd', 'matchEnd'].includes(s.phase);
        if (inGame) this.drawGame(s!, time, delta); else this.titleScene(time, delta);
        for (let i = this.used; i < this.pool.length; i++) this.pool[i].setVisible(false);
    }
    private useLayout(l: Layout) {
        const key = bakeLayout(this, l);
        if (key === this.mapKey) return;
        this.mapKey = key;
        this.map?.destroy();
        this.map = this.add.image(0, 0, key).setOrigin(0).setScale(PX).setDepth(0);
        this.cameras.main.setBounds(-200, -200, l.w + 400, l.h + 400);
    }
    private follow(target: Point, delta: number, zoom: number) {
        const c = this.cameras.main;
        c.setZoom(zoom);
        this.cam.x += (target.x - this.cam.x) * Math.min(1, delta / 120);
        this.cam.y += (target.y - this.cam.y) * Math.min(1, delta / 120);
        c.centerOn(this.cam.x, this.cam.y);
    }
    private zoom() { const w = window.innerWidth, h = window.innerHeight; return w < 700 || h < 500 ? 0.62 : w < 1100 ? 0.8 : 1; }

    private drawGame(s: State, time: number, delta: number) {
        const m = s.match!, l = layoutFor(m.mapId, m.seed), flags: Flags = { gateOpen: s.gateOpen, exitOpen: s.exitOpen };
        this.useLayout(l);
        const local = me(), police = s.view === 'police', def = mapDef(m.mapId);
        // Who the camera follows: you, or (when out) a teammate you can cycle through.
        let focus: Player | undefined = local;
        if (!local || local.captured || local.escaped || local.spectator) {
            const mates = s.players.filter(p => !p.captured && !p.escaped && !p.spectator && !p.hidden && (p.team === local?.team || !local?.team));
            focus = mates[store.follow % Math.max(1, mates.length)] ?? local;
        }
        // Local prediction: move a few ms ahead with the same collision the server uses.
        const positions = new Map<string, Point>();
        for (const p of s.players) {
            if (p.hidden || p.captured || p.escaped || p.spectator) continue;
            let target: Point = p;
            if (p.id === store.myId && s.phase !== 'roundEnd') {
                const age = Math.min(0.1, (performance.now() - store.snapshotAt) / 1000), pr = { x: p.x, y: p.y }, inp = input.vector();
                const canMove = (s.phase === 'play' || s.phase === 'prep') && p.stunnedFor <= 0;
                if (canMove) move(l, flags, pr, inp.x * (p.role === 'police' ? SPEED.police : p.disguise ? SPEED.disguised : SPEED.thief) * age, inp.y * (p.role === 'police' ? SPEED.police : p.disguise ? SPEED.disguised : SPEED.thief) * age, 16, s.props);
                target = pr;
            }
            positions.set(p.id, this.smooth(p.id, target, delta, p.id === store.myId ? 30 : 90));
        }
        const fpos = (focus && positions.get(focus.id)) ?? (local?.role === 'police' ? cellCenter(def.staging[0] + 4, def.staging[1] + 3) : cellCenter(def.spawn[0] + 4, def.spawn[1] + 2));
        // Police aim: the mouse (or right stick), otherwise the way you're walking.
        if (local?.role === 'police' && positions.get(local.id)) store.aim = input.aim(this, positions.get(local.id)!, store.aim);
        this.follow({ x: fpos.x + (local?.role === 'police' && !input.touch ? Math.cos(store.aim) * 60 : 0), y: fpos.y + (local?.role === 'police' && !input.touch ? Math.sin(store.aim) * 60 : 0) }, delta, this.zoom());
        const view = this.cameras.main.worldView, cull = (q: Point, pad = 120) => q.x > view.x - pad && q.x < view.right + pad && q.y > view.y - pad && q.y < view.bottom + pad;

        this.drawGateAndExit(l, s, time);
        // Tasks: the object, swapped for its 'done' look; thieves get a marker on the ones left to do.
        const thiefSide = !police && local?.team === thiefTeam(m.round);
        for (const t of s.tasks) {
            if (!cull(t)) continue;
            this.sprite(`task-${t.type}${t.done ? '-done' : ''}`, t.x, t.y + 14, { depth: 2.6 + t.y / 10000 });
            const clue = s.clues.find(c => c.id === t.id);
            if (clue && !reducedMotion && Math.floor(time / 90) % 2) this.sprite('sparkle', t.x + 10, t.y - 30, { depth: 31, alpha: 1 - clue.age / 6 });
            if (thiefSide && !t.done) { this.top.lineStyle(2, 0xf1c46a, 0.5 + 0.3 * Math.sin(time / 300)); this.top.strokeCircle(t.x, t.y, 30); }
        }
        // Props. Thieves see real ids and their disguised teammates (marked so they don't shoot... or bump into each other).
        for (const q of s.props) if (cull(q)) this.prop(q, time);
        for (const p of s.players) {
            const pos = positions.get(p.id);
            if (!pos || !cull(pos)) continue;
            if (p.disguise) {
                this.prop({ id: p.id, kind: p.disguise, flip: p.flip, x: pos.x, y: pos.y, r: 18, wobble: p.stunnedFor > 0 }, time, pos.x, pos.y);
                // Only your own team ever sees this marker; police never receive disguised thieves as players.
                this.top.fillStyle(hex(TEAM_COLORS[p.team ?? 'A']), p.id === store.myId ? 1 : 0.75);
                this.top.fillTriangle(pos.x - 5, pos.y - 46, pos.x + 5, pos.y - 46, pos.x, pos.y - 39);
                if (p.id !== store.myId) this.label('n' + p.id, pos.x, pos.y - 56, p.name, p.color, 8);
            } else {
                const angle = p.role === 'police' ? (p.id === store.myId ? store.aim : p.aim) : this.heading(p.id, pos);
                this.character(p, pos.x, pos.y, time, angle);
                this.g.lineStyle(2, hex(TEAM_COLORS[p.team ?? 'A']), 0.9); this.g.strokeEllipse(pos.x, pos.y + 19, 40, 12);
                this.label('n' + p.id, pos.x, pos.y + 34, (p.role === 'police' ? '★ ' : '') + p.name, p.color, 8);
            }
            if (p.id === store.myId) { this.top.fillStyle(0xf1c46a); this.top.fillTriangle(pos.x - 5, pos.y - 62, pos.x + 5, pos.y - 62, pos.x, pos.y - 56); }
            if (p.stunnedFor > 0 && !p.disguise) this.label('z' + p.id, pos.x, pos.y - 66, 'STUNNED', '#93b8e8', 8);
            if (p.task) { const t = s.tasks.find(q => q.id === p.task!.id); if (t) { const f = Math.min(1, p.task.progress / TASK.durations[t.type]); this.top.lineStyle(4, 0x000000, 0.6); this.top.strokeCircle(pos.x, pos.y - 20, 22); this.top.lineStyle(4, 0xf1c46a, 1); this.top.beginPath(); this.top.arc(pos.x, pos.y - 20, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * f); this.top.strokePath(); } }
        }
        this.effects(s, time, positions, local);
        this.targeting(s, l, flags, local, positions, time);
        this.drawFog(s, l, flags, local, positions, police);
    }

    private drawGateAndExit(l: Layout, s: State, time: number) {
        const def = l.def, rect = (r: number[], c: number, a: number) => { this.g.fillStyle(c, a); this.g.fillRect(r[0] * CELL, r[1] * CELL, r[2] * CELL, r[3] * CELL); };
        // Staging gate: bars while shut, an open frame once play starts.
        const [gx, gy, gw, gh] = def.gate;
        if (!s.gateOpen) { rect(def.gate, 0x1d2430, 1); this.g.lineStyle(4, 0x8fa3a8, 1); for (let x = gx * CELL + 8; x < (gx + gw) * CELL; x += 14) this.g.lineBetween(x, gy * CELL, x, (gy + gh) * CELL); }
        else { this.g.lineStyle(3, 0x6f8a8f, 0.6); this.g.strokeRect(gx * CELL, gy * CELL, gw * CELL, gh * CELL); }
        const [ex, ey, ew, eh] = def.exitDoor, zone = def.exitZone;
        if (!s.exitOpen) { rect(def.exitDoor, 0x3a1d1d, 1); this.g.lineStyle(4, 0xd9614a, 0.9); for (let y = ey * CELL + 8; y < (ey + eh) * CELL; y += 14) this.g.lineBetween(ex * CELL, y, (ex + ew) * CELL, y); this.label('exit', (ex + 0.5) * CELL, (ey - 0.6) * CELL, 'EXIT · LOCKED', '#d9614a', 9, 30); }
        else {
            const pulse = reducedMotion ? 0.35 : 0.25 + 0.2 * Math.sin(time / 250);
            rect(zone, 0x7fd67a, pulse); this.g.lineStyle(3, 0x7fd67a, 0.9); this.g.strokeRect(zone[0] * CELL, zone[1] * CELL, zone[2] * CELL, zone[3] * CELL);
            this.label('exit', (zone[0] + zone[2] / 2) * CELL, (zone[1] - 0.6) * CELL, 'EXIT ▶ OPEN', '#7fd67a', 11, 30);
        }
        if (!this.exitWasOpen && s.exitOpen) play('exit');
        if (!this.gateWasOpen && s.gateOpen && s.phase === 'play') play('gate');
        this.exitWasOpen = s.exitOpen; this.gateWasOpen = s.gateOpen;
    }

    private effects(s: State, time: number, positions: Map<string, Point>, local?: Player) {
        const ear = (local && positions.get(local.id)) ?? this.cam;
        const fresh = (id: string) => { if (this.seen.has(id)) return false; this.seen.add(id); if (this.seen.size > 600) this.seen = new Set([...this.seen].slice(-300)); return true; };
        for (const shot of s.shots) {
            const a = 1 - shot.age / 0.6;
            this.g.lineStyle(3, shot.result === 'capture' ? 0x7fd67a : 0xf1c46a, a); this.g.lineBetween(shot.from.x, shot.from.y - 20, shot.to.x, shot.to.y - 20);
            if (shot.result === 'capture') { for (let i = 0; i < 6; i++) { const k = i / 6 * Math.PI * 2 + shot.age * 4; this.sprite('sparkle', shot.to.x + Math.cos(k) * (20 + shot.age * 60), shot.to.y - 20 + Math.sin(k) * (20 + shot.age * 60), { depth: 32, alpha: a }); } this.label('cap' + shot.id, shot.to.x, shot.to.y - 60 - shot.age * 30, 'CAUGHT!', '#7fd67a', 12, 46); }
            else if (shot.result === 'prop') { this.sprite('puff', shot.to.x, shot.to.y - 8, { depth: 32, alpha: a, scale: 1 + shot.age }); this.label('miss' + shot.id, shot.to.x, shot.to.y - 50, 'JUST A PROP', '#f1c46a', 8, 46); }
            if (fresh('s' + shot.id)) { const d = dist(ear, shot.from); play('shot', { pan: (shot.from.x - ear.x) / 700, level: 1 - d / 2000 }); if (shot.result === 'capture') play('capture'); else if (shot.result === 'prop') play('miss', { level: 0.6 }); }
        }
        for (const p of s.pulses) {
            const k = p.age / 0.8;
            this.g.lineStyle(4, 0x93b8e8, 1 - k); this.g.strokeCircle(p.x, p.y, STUN.radius * Math.min(1, k * 1.4));
            if (fresh('u' + p.id)) play('stun', { pan: (p.x - ear.x) / 700, level: 1 - dist(ear, p) / 1600 });
        }
        for (const k of s.smokes) {
            const life = k.age / SMOKE.duration, a = life < 0.15 ? life / 0.15 : life > 0.75 ? (1 - life) / 0.25 : 1;
            for (let i = 0; i < 16; i++) { const ang = i * 2.4 + k.age * 0.3, r = (i % 4 + 1) / 4 * SMOKE.radius * 0.75; this.sprite('puff', k.x + Math.cos(ang) * r, k.y + Math.sin(ang) * r * 0.7, { depth: 35, alpha: 0.85 * a, scale: 3 + (i % 3), originY: 0.5, tint: 0xd9d6cc }); }
            if (fresh('k' + k.id)) play('smoke', { pan: (k.x - ear.x) / 700, level: 1 - dist(ear, k) / 1600 });
        }
        // Decoys are only in thieves' state; police just hear them.
        for (const d of s.decoys) { this.sprite('decoy', d.x, d.y + 6, { depth: 2.7 }); if (fresh('d' + d.id)) play('decoy'); }
        for (const n of s.sounds) {
            if (n.age < 1.6) { const r = 20 + n.age * 90; this.g.lineStyle(2, 0xf1c46a, Math.max(0, 0.7 - n.age / 2)); this.g.strokeCircle(n.x, n.y, r); }
            if (fresh('n' + n.id)) { const d = dist(ear, n); if (d < CUE.range || n.owner === store.myId) play(n.kind, { pan: (n.x - ear.x) / 600, level: n.owner === store.myId ? 0.7 : Math.max(0.12, 1 - d / CUE.range) }); }
        }
        for (const c of s.clues) if (fresh('c' + c.id)) play('task', { level: 0.5 });
    }

    private targeting(s: State, l: Layout, flags: Flags, local: Player | undefined, positions: Map<string, Point>, time: number) {
        const pos = local && positions.get(local.id);
        if (!local || !pos || local.captured || local.escaped || local.spectator || (s.phase !== 'play' && s.phase !== 'prep')) { input.targets = {}; return; }
        if (local.role === 'police') {
            // A visible aim line, stopped by walls, so shots never surprise you.
            const reach = castRay(l, flags, pos, store.aim, BLASTER.range), end = { x: pos.x + Math.cos(store.aim) * reach, y: pos.y + Math.sin(store.aim) * reach };
            const hot = local.lockedFor > 0 ? 0xd9614a : local.heat > 0.6 ? 0xf1a24a : 0xf1c46a;
            this.top.lineStyle(2, hot, s.phase === 'play' ? 0.55 : 0.2);
            for (let i = 0; i < reach; i += 18) { const a = Math.min(reach, i + 9); this.top.lineBetween(pos.x + Math.cos(store.aim) * i, pos.y - 20 + Math.sin(store.aim) * i, pos.x + Math.cos(store.aim) * a, pos.y - 20 + Math.sin(store.aim) * a); }
            this.top.strokeCircle(end.x, end.y - 20, 9);
            input.targets = {};
            return;
        }
        // Thieves: what Q would copy, and the task E would start.
        const prop = s.props.filter(q => dist(pos, q) < DISGUISE.range && los(l, flags, pos, q)).sort((a, b) => dist(pos, a) - dist(pos, b))[0];
        const task = s.tasks.filter(t => !t.done && dist(pos, t) < TASK.range && los(l, flags, pos, t)).sort((a, b) => dist(pos, a) - dist(pos, b))[0];
        input.targets = { prop: prop?.id, task: task?.id };
        if (prop) { this.top.lineStyle(2, 0xf1c46a, 0.85); this.top.strokeEllipse(prop.x, prop.y + 20, 56, 20); this.label('qt', prop.x, prop.y - 60, `Q · COPY ${(PROP_KINDS[prop.kind]?.label ?? prop.kind).toUpperCase()}`, '#f3d9a3', 8); }
        if (task && !local.task) { this.label('et', task.x, task.y - 46, `E · ${TASK_LABEL[task.type].toUpperCase()}`, '#7fd67a', 8); }
        if (local.cueIn > 0 && local.cueIn <= CUE.warn && s.phase === 'play') this.label('cue', pos.x, pos.y - 80, `WHISTLE IN ${Math.ceil(local.cueIn)}`, '#f1a24a', 10);
        void time;
    }

    private drawFog(s: State, l: Layout, flags: Flags, local: Player | undefined, positions: Map<string, Point>, police: boolean) {
        if (!police) { this.fog.setVisible(false); return; }
        const view = this.cameras.main.worldView, pad = 200, even = (n: number) => Math.max(16, Math.ceil(n / 2) * 2);
        const w = even(view.width + pad * 2), h = even(view.height + pad * 2);
        if (this.fog.width !== w || this.fog.height !== h) {
            // Phaser 3.90's RenderTexture.resize leaves the WebGL texture at its old size, so recreate it.
            this.fog.destroy(); this.fog = this.add.renderTexture(0, 0, w, h).setOrigin(0).setDepth(40);
        }
        this.fog.setVisible(true).setPosition(view.x - pad, view.y - pad);
        // Dim, not black: you can still read the building, but anything out of your team's sight isn't there.
        this.fog.clear().fill(0x05070a, 0.62);
        this.brush.clear().fillStyle(0xffffff, 1);
        for (const p of s.players) {
            if (p.role !== 'police' || p.spectator) continue;
            const pos = positions.get(p.id) ?? p;
            this.brush.fillPoints(visionPolygon(l, flags, pos, VISION.police, 96), true);
        }
        this.fog.erase(this.brush, -this.fog.x, -this.fog.y);
        void local;
    }

    /** The title and lobby backdrop: the museum after hours, an officer sweeping a flashlight past the exhibits. */
    private titleScene(time: number, delta: number) {
        if (!this.title.layout) {
            const l = layoutFor('museum', 11);
            this.title.layout = l;
            const r = (n: number) => (Math.sin(n * 91.7) + 1) / 2;
            const spots: [string, number, number][] = [['statue', 33, 3], ['statue', 38, 3], ['bench', 36, 8], ['plant', 30, 9], ['silver', 34, 14], ['statue', 50, 3], ['plant', 47, 12], ['statue', 54, 14], ['gem', 52, 8], ['bench', 40, 13]];
            this.title.props = spots.map(([kind, cx, cy], i) => ({ id: 't' + i, kind, flip: r(i) > 0.5, r: 20, ...cellCenter(cx, cy) }));
            this.useLayout(l);
        }
        const l = this.title.layout!;
        if (this.mapKey !== bakeLayout(this, l)) this.useLayout(l);
        const narrow = window.innerWidth < 760, zoom = Phaser.Math.Clamp(Math.min(window.innerHeight / 720, window.innerWidth / 900), 0.7, 1.6);
        const cop = cellCenter(37, 11), sweep = -0.9 + 0.75 * Math.sin(time / 3400);
        this.follow({ x: cop.x + (narrow ? 0 : -0.07 * window.innerWidth / zoom), y: cop.y - (narrow ? 0.18 * window.innerHeight / zoom : 60) }, delta, zoom);
        this.cameras.main.useBounds = false;
        for (const q of this.title.props) this.prop(q, time);
        const exhibit = cellCenter(45, 5);
        this.prop({ id: 'x', kind: 'plant', flip: false, r: 18, ...exhibit }, time);
        this.g.fillStyle(0x15120d, 1); this.g.fillRect(exhibit.x - 52, exhibit.y + 30, 104, 28);
        this.g.fillStyle(0xd6c79f, 1); this.g.fillRect(exhibit.x - 50, exhibit.y + 28, 100, 26);
        this.label('placard', exhibit.x, exhibit.y + 41, 'EXHIBIT 14\nA COMPLETELY NORMAL PLANT', '#2b241a', 7, 10).setStroke('#000000', 0);
        this.character({ role: 'police', moving: false, color: '#80bde0' } as Player, cop.x, cop.y, time, sweep);
        // Flashlight: a cone cut out of the dark.
        const view = this.cameras.main.worldView, pad = 160, even = (n: number) => Math.max(16, Math.ceil(n / 2) * 2);
        const w = even(view.width + pad * 2), h = even(view.height + pad * 2);
        if (this.fog.width !== w || this.fog.height !== h) { this.fog.destroy(); this.fog = this.add.renderTexture(0, 0, w, h).setOrigin(0).setDepth(40); }
        this.fog.setVisible(true).setPosition(view.x - pad, view.y - pad).clear().fill(0x03050a, 0.9);
        const flags = { gateOpen: false, exitOpen: false }, cone: Point[] = [{ x: cop.x, y: cop.y }];
        for (let i = 0; i <= 30; i++) { const a = sweep - 0.5 + i / 30; const d = castRay(l, flags, cop, a, 520); cone.push({ x: cop.x + Math.cos(a) * d, y: cop.y + Math.sin(a) * d }); }
        this.brush.clear().fillStyle(0xffffff, 1).fillPoints(cone, true).fillCircle(cop.x, cop.y, 70);
        this.fog.erase(this.brush, -this.fog.x, -this.fog.y);
        this.g.fillStyle(0xfff0c8, 0.08 + (reducedMotion ? 0 : 0.02 * Math.sin(time / 85))); this.g.fillPoints(cone, true);
    }
}
const TASK_LABEL = TASK.labels;
