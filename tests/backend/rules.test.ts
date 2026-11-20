import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BLASTER, CUE, DECOY, DISGUISE, SMOKE, STUN, TASK, type Player } from '../../shared/rules.js';
import { cellCenter, CELL, blocked } from '../../shared/layout.js';
import { match, advance, place, tick } from './helpers.js';

/** Two humans, no bots, no props: one thief, one officer, on the museum map. */
function duel(phase: 'prep' | 'play' = 'play') {
    const { r, humans } = match({ humans: 2, fillBots: false });
    advance(r, phase);
    const [a, b] = humans.map(h => h.p);
    const thief = a.role === 'thief' ? a : b, cop = thief === a ? b : a;
    r.state.props = [];
    return { r, thief, cop };
}
const at = (cx: number, cy: number) => cellCenter(cx, cy);
/** An open floor spot right beside a point. */
const beside = (r: ReturnType<typeof duel>['r'], t: { x: number; y: number }, d = 30) => {
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const x = t.x + dx * d, y = t.y + dy * d; if (!blocked(r.layout!, r.flags, x, y, 16)) return { x, y }; }
    throw Error('no open floor beside ' + JSON.stringify(t));
};
const aimAt = (from: Player, to: { x: number; y: number }) => Math.atan2(to.y - from.y, to.x - from.x);
/** Snapshots are cached per tick; tick once (dt 0) so moves made by the test are seen. */
const policeView = (r: ReturnType<typeof duel>['r'], cop: Player) => { r.update(0); return r.snapshot(cop.id); };

test('during prep the police stay in staging, cannot shoot or stun, and see no thieves', () => {
    const { r, thief, cop } = duel('prep');
    const start = { x: cop.x, y: cop.y };
    cop.input = { x: 0, y: 1 }; // straight at the gate
    tick(r, 4);
    assert.ok(cop.y < (26) * CELL, 'the closed gate holds them in');
    assert.throws(() => r.act(cop.id, 'shoot:' + aimAt(cop, thief)), /gate/);
    assert.throws(() => r.act(cop.id, 'stun'), /gate/);
    const view = policeView(r, cop), seen = view.players.find(p => p.id === thief.id)!;
    assert.equal(seen.hidden, true);
    assert.equal(seen.x, 0);
    assert.ok(start);
});

test('police snapshots hide unseen thieves and turn seen disguises into anonymous props', () => {
    const { r, thief, cop } = duel();
    place(cop, at(36, 28).x, at(36, 28).y);
    place(thief, at(48, 27).x, at(48, 27).y); // courtyard, behind the foyer wall
    let view = policeView(r, cop), t = view.players.find(p => p.id === thief.id)!;
    assert.equal(t.hidden, true, 'behind a wall');
    assert.equal(t.x, 0);
    place(thief, at(31, 28).x, at(31, 28).y);
    view = policeView(r, cop); t = view.players.find(p => p.id === thief.id)!;
    assert.ok(!t.hidden && t.x > 0, 'in plain sight');
    r.state.props = [{ id: 'p0', kind: 'plant', flip: false, x: at(30, 30).x, y: at(30, 30).y, r: 18 }];
    r.act(thief.id, 'disguise:p0');
    view = policeView(r, cop); t = view.players.find(p => p.id === thief.id)!;
    assert.equal(t.hidden, true, 'a disguised thief is never sent as a player');
    assert.equal(view.props.length, 2);
    assert.ok(view.props.every(q => q.kind === 'plant' && q.id !== 'p0' && q.id !== thief.id));
    const json = JSON.stringify(view);
    assert.ok(!json.includes('"input"'), 'no server-only fields');
    assert.deepEqual(view.decoys, []);
    assert.equal(view.view, 'police');
    const full = r.snapshot(thief.id);
    assert.equal(full.view, 'full');
    assert.equal(full.props[0].id, 'p0', 'thieves see real ids');
});

test('props the police cannot see are not sent at all', () => {
    const { r, cop } = duel();
    place(cop, at(36, 28).x, at(36, 28).y);
    r.state.props = [{ id: 'far', kind: 'statue', flip: false, x: at(5, 5).x, y: at(5, 5).y, r: 22 }];
    assert.equal(policeView(r, cop).props.length, 0);
});

test('a shot captures a visible thief and a disguised one alike, but never through a wall', () => {
    const { r, thief, cop } = duel();
    place(cop, at(36, 28).x, at(36, 28).y);
    place(thief, at(41, 27).x, at(41, 27).y);
    // Through the foyer/courtyard wall: thief is on the far side.
    place(thief, at(44, 27).x, at(44, 27).y);
    r.act(cop.id, 'shoot:' + aimAt(cop, thief));
    assert.equal(thief.captured, false, 'walls stop shots');
    cop.cooldown = 0;
    place(thief, at(31, 28).x, at(31, 28).y);
    r.state.props = [{ id: 'p0', kind: 'bench', flip: false, x: at(30, 30).x, y: at(30, 30).y, r: 24 }];
    r.act(thief.id, 'disguise:p0');
    r.act(cop.id, 'shoot:' + aimAt(cop, thief));
    assert.equal(thief.captured, true);
    assert.equal(cop.stats.captures, 1);
    assert.equal(r.state.shots.at(-1)!.result, 'capture');
});

test('out of range misses, and wrong shots heat the blaster until it locks', () => {
    const { r, thief, cop } = duel();
    place(cop, at(2, 2).x, at(2, 2).y);
    place(thief, at(2 + Math.ceil(BLASTER.range / CELL) + 2, 2).x, at(2, 2).y);
    r.act(cop.id, 'shoot:0');
    assert.equal(thief.captured, false);
    place(cop, at(36, 28).x, at(36, 28).y);
    r.state.props = [{ id: 'p0', kind: 'plant', flip: false, x: at(32, 28).x, y: at(32, 28).y, r: 18 }];
    place(thief, at(24, 20).x, at(24, 20).y);
    let shots = 0;
    while (cop.lockedFor <= 0 && shots < 10) { cop.cooldown = 0; r.act(cop.id, 'shoot:' + aimAt(cop, r.state.props[0])); shots++; }
    assert.equal(shots, Math.ceil(1 / BLASTER.propHeat));
    assert.throws(() => r.act(cop.id, 'shoot:0'), /overheated/);
    assert.ok(cop.stats.misses >= 2);
});

test('a stun pulse freezes nearby thieves, stops their task and makes a disguise wobble for the police', () => {
    const { r, thief, cop } = duel();
    place(cop, at(36, 28).x, at(36, 28).y);
    place(thief, at(33, 28).x, at(33, 28).y);
    r.state.props = [{ id: 'p0', kind: 'plant', flip: false, x: at(33, 30).x, y: at(33, 30).y, r: 18 }];
    r.act(thief.id, 'disguise:p0');
    r.act(cop.id, 'stun');
    assert.ok(thief.stunnedFor > 0);
    assert.equal(cop.stuns, STUN.uses - 1);
    assert.ok(policeView(r, cop).props.some(q => q.wobble));
    thief.input = { x: 1, y: 0 };
    const x = thief.x;
    tick(r, 1);
    assert.equal(thief.x, x, 'cannot move while stunned');
    assert.throws(() => r.act(cop.id, 'stun'), /No stun|ready/);
});

test('tasks need range and sight, stop on movement or stun, and open the exit once enough are done', () => {
    const { r, thief, cop } = duel();
    place(cop, at(84, 22).x, at(84, 22).y);
    const tasks = r.state.tasks;
    const t = tasks[0];
    place(thief, t.x + TASK.range + 30, t.y);
    assert.throws(() => r.act(thief.id, 'task:' + t.id), /right up/);
    const spot = beside(r, t);
    place(thief, spot.x, spot.y);
    r.act(thief.id, 'task:' + t.id);
    tick(r, 1);
    thief.input = { x: 0, y: 1 };
    r.update(1 / 30);
    assert.equal(thief.task, null, 'moving interrupts');
    place(thief, spot.x, spot.y);
    r.act(thief.id, 'task:' + t.id);
    tick(r, TASK.durations[t.type] + 0.2);
    assert.equal(t.done, true);
    assert.equal(thief.stats.tasks, 1);
    assert.ok(r.state.clues.some(c => c.id === t.id), 'leaves a district clue');
    assert.throws(() => r.act(thief.id, 'task:' + t.id), /already/);
    assert.equal(r.state.exitOpen, false);
    for (const other of tasks.filter(q => !q.done).slice(0, r.state.required - 1)) { const b = beside(r, other, 20); place(thief, b.x, b.y); thief.task = { id: other.id, progress: 99 }; r.update(1 / 30); }
    assert.equal(r.state.exitOpen, true);
});

test('a task cannot be started through a wall', () => {
    const { r, thief } = duel();
    const t = r.state.tasks[0];
    // Search for a nearby spot on the far side of a wall.
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const x = t.x + dx * 60, y = t.y + dy * 60, cx = Math.floor(x / CELL), cy = Math.floor(y / CELL);
        if (r.layout!.type[cy * r.layout!.cols + cx] === 0) continue;
        const bx = t.x + dx * 100, by = t.y + dy * 100;
        place(thief, bx, by);
        assert.throws(() => r.act(thief.id, 'task:' + t.id), /right up/);
        return;
    }
});

test('escape: once the exit opens, the remaining thieves getting out wins the round for them', () => {
    const { r, thief } = duel();
    r.flags.exitOpen = r.state.exitOpen = true;
    const e = [82, 41, 5, 7];
    place(thief, (e[0] - 2) * CELL, (e[1] + 3) * CELL);
    thief.input = { x: 1, y: 0 };
    tick(r, 2);
    assert.equal(thief.escaped, true);
    assert.equal(r.state.phase, 'roundEnd');
    assert.equal(r.state.match!.results[0].winnerRole, 'thief');
});

test('timeout with a thief still free wins for the thieves; a capture on the final tick wins for the police', () => {
    let { r, thief, cop } = duel();
    r.state.phaseTime = 0; r.update(1 / 30);
    assert.equal(r.state.match!.results[0].winnerRole, 'thief');
    ({ r, thief, cop } = duel());
    place(cop, at(36, 28).x, at(36, 28).y); place(thief, at(31, 28).x, at(31, 28).y);
    r.state.phaseTime = 1 / 60;
    r.act(cop.id, 'shoot:' + aimAt(cop, thief)); // lands before the tick that runs the clock out
    r.update(1 / 30);
    assert.equal(r.state.match!.results[0].winnerRole, 'police');
    assert.equal(r.state.match!.results[0].reason, 'every thief was caught');
});

test('police can never disguise; thieves copy only nearby props, with a cooldown, and can mirror it', () => {
    const { r, thief, cop } = duel();
    place(cop, at(36, 28).x, at(36, 28).y);
    place(thief, at(26, 28).x, at(26, 28).y);
    r.state.props = [{ id: 'p0', kind: 'statue', flip: true, x: at(27, 28).x, y: at(27, 28).y, r: 22 }, { id: 'p1', kind: 'bin', flip: false, x: at(36, 30).x, y: at(36, 30).y, r: 16 }];
    r.act(cop.id, 'disguise:p1');
    assert.equal(cop.disguise, null);
    assert.throws(() => r.act(thief.id, 'disguise:p1'), /closer/);
    r.act(thief.id, 'disguise:p0');
    assert.equal(thief.disguise, 'statue');
    assert.equal(thief.flip, true, 'copies the orientation');
    assert.equal(thief.cooldown, DISGUISE.cooldown);
    r.act(thief.id, 'rotate');
    assert.equal(thief.flip, false);
    assert.throws(() => r.act(thief.id, 'disguise:p0'), /ready in/);
});

test('every thief gives off a sound cue every 25–35 seconds, staggered; police hear where, not who', () => {
    const { r, thief, cop } = duel();
    assert.ok(thief.cueIn >= CUE.min - 1 && thief.cueIn <= CUE.max + CUE.stagger * 5);
    thief.cueIn = 0.01;
    r.update(1 / 30);
    assert.equal(r.state.sounds.length, 1);
    assert.equal(r.state.sounds[0].owner, thief.id);
    assert.ok(Math.hypot(r.state.sounds[0].x - thief.x, r.state.sounds[0].y - thief.y) <= CUE.jitter + 1);
    assert.equal(policeView(r, cop).sounds[0].owner, undefined);
    assert.ok(thief.cueIn >= CUE.min);
});

test('decoys and smoke have limited uses; smoke speeds the thief and blocks police sight', () => {
    const { r, thief, cop } = duel();
    for (let i = 0; i < DECOY.uses; i++) r.act(thief.id, 'decoy');
    assert.throws(() => r.act(thief.id, 'decoy'), /No decoys/);
    tick(r, DECOY.pings[1] + 0.1);
    assert.ok(r.state.sounds.length >= DECOY.uses, 'decoys ping');
    place(cop, at(36, 28).x, at(36, 28).y); place(thief, at(31, 28).x, at(31, 28).y);
    r.act(thief.id, 'smoke');
    assert.ok(thief.boostFor > 0);
    assert.throws(() => r.act(thief.id, 'smoke'), /already used/);
    assert.equal(policeView(r, cop).players.find(p => p.id === thief.id)!.hidden, true, 'hidden inside the smoke');
    tick(r, SMOKE.duration + 0.1);
    assert.equal(r.state.smokes.length, 0);
});
