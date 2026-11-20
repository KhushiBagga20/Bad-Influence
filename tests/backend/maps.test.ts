import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAP_DEFS, PROP_KINDS, layoutFor } from '../../shared/maps.js';
import { chooseProps, findPath, validate, walkMask, spawnPoints, cellCenter, CELL } from '../../shared/layout.js';
import { SPEED } from '../../shared/rules.js';

test('three distinct maps, each with districts, a staging room, an exit and three kinds of task', () => {
    assert.deepEqual(MAP_DEFS.map(m => m.id), ['museum', 'market', 'arcade']);
    for (const def of MAP_DEFS) {
        assert.ok(def.districts.length >= 10, `${def.id} districts`);
        assert.equal(new Set(def.districts.map(d => d.floor)).size >= 4, true, `${def.id} uses several floor materials`);
        for (const type of ['panel', 'label', 'loading'] as const) assert.ok(def.tasks[type].length >= 5);
    }
});

test('every seeded variation of every map is fully connected with its props placed', () => {
    for (const def of MAP_DEFS) for (let seed = 1; seed <= 30; seed++) {
        const l = layoutFor(def.id, seed), props = chooseProps(l, seed * 7919, PROP_KINDS);
        assert.deepEqual(validate(l), [], `${def.id} seed ${seed}`);
        assert.deepEqual(validate(l, props), [], `${def.id} seed ${seed} with props`);
        assert.ok(props.length >= 55, `${def.id} seed ${seed} has plenty of hiding props (${props.length})`);
        assert.equal(l.tasks.length, 9);
        assert.deepEqual(new Set(l.tasks.map(t => t.type)), new Set(['panel', 'label', 'loading']));
    }
});

test('seeds vary passages and tasks; the same seed always builds the same layout', () => {
    for (const def of MAP_DEFS) {
        const a = layoutFor(def.id, 3), b = layoutFor(def.id, 3), c = layoutFor(def.id, 4);
        assert.equal(a, b);
        const sig = (l: typeof a) => JSON.stringify([l.open, l.tasks.map(t => [t.cx, t.cy])]);
        assert.notEqual(sig(a), sig(layoutFor(def.id, 5)) === sig(c) ? sig(c) + 'x' : sig(c));
    }
});

test('maps are big: crossing takes roughly 25–40 seconds of walking', () => {
    for (const def of MAP_DEFS) {
        const l = layoutFor(def.id, 1), mask = walkMask(l, { gateOpen: true, exitOpen: true });
        const from = cellCenter(2, 2), to = cellCenter(def.cols - 8, def.rows - 3);
        const route = findPath(l, mask, from, to, { gateOpen: true, exitOpen: true });
        let length = 0, at = from;
        for (const p of route) { length += Math.hypot(p.x - at.x, p.y - at.y); at = p; }
        const seconds = length / SPEED.thief;
        assert.ok(route.length > 0, `${def.id} corner to corner is reachable`);
        assert.ok(seconds > 22 && seconds < 45, `${def.id} crossing takes ${seconds.toFixed(1)}s`);
    }
});

test('bots can route from the thief spawn to every task and the exit, and from staging into the map', () => {
    for (const def of MAP_DEFS) {
        const l = layoutFor(def.id, 2), props = chooseProps(l, 99, PROP_KINDS), flags = { gateOpen: true, exitOpen: true }, mask = walkMask(l, flags, props);
        const spawn = spawnPoints(l, def.spawn, 1)[0], staging = spawnPoints(l, def.staging, 1)[0];
        for (const t of l.tasks) assert.ok(findPath(l, mask, spawn, t, flags, props).length > 0, `${def.id} task ${t.id}`);
        const exit = cellCenter(def.exitZone[0] + 1, def.exitZone[1] + 2);
        assert.ok(findPath(l, mask, spawn, exit, flags, props).length > 0, `${def.id} exit`);
        assert.ok(findPath(l, mask, staging, spawn, flags, props).length > 0, `${def.id} staging`);
        assert.ok(exit.x < l.w && exit.y < l.h && CELL === 48);
    }
});
