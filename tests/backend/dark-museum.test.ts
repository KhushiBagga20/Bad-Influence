import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../backend/src/game-room.js';
import { props, castRay, lightPolygon, MISS_COOLDOWN, ARREST_COOLDOWN, type Player, type State } from '../../shared/world.js';

/** A competitive round on the original map with the head start already over. */
function round(n = 4) {
    const r = new Room('DARK', 'versus');
    for (let i = 0; i < n; i++) r.join('Player ' + i).p.ready = true;
    r.state.selectedMap = 0;
    r.start(r.state.host);
    r.state.headStart = 0;
    const cops = r.state.players.filter(p => p.role === 'cop'), thieves = r.state.players.filter(p => p.role === 'thief');
    return { r, cop: cops[0], thieves, cops };
}
const statue = props.find(p => p.id === 'p3')!; // (840, 190) in the central gallery
/** A thief disguised as the gallery statue, with a cop standing below it facing up. */
function disguisedNearStatue() {
    const game = round(), [thief] = game.thieves;
    Object.assign(thief, { x: 900, y: 190 });
    game.r.act(thief.id, 'transform');
    assert.equal(thief.disguise, 'statue');
    Object.assign(game.cop, { x: 900, y: 300, aim: -Math.PI / 2 });
    // Park the other cops far away in the east wing so only one flashlight is relevant.
    for (const c of game.cops.slice(1)) Object.assign(c, { x: 2400, y: 1000 });
    return { ...game, thief };
}
const entry = (view: State, p: Player) => view.players.find(q => q.id === p.id)!;
const at = (view: State, x: number, y: number) => view.visibleProps!.find(q => q.x === Math.round(x) && q.y === Math.round(y));

test('cops get no position or disguise for thieves outside their light', () => {
    const { r, cop, thieves: [thief] } = round();
    Object.assign(cop, { x: 700, y: 150 });
    Object.assign(thief, { x: 2400, y: 700 });
    const view = r.snapshot(true), seen = entry(view, thief);
    assert.equal(seen.hidden, true);
    assert.equal(seen.x, 0);
    assert.equal(seen.y, 0);
    assert.equal(seen.disguise, null);
    assert.equal(seen.name, thief.name, 'the roster still lists every thief');
    assert.equal(entry(r.snapshot(), thief).x, 2400, 'thieves and spectators still see everything');
});

test('a disguised thief reaches cops only as an anonymous prop, mixed with the real ones', () => {
    const { r, thief } = disguisedNearStatue();
    const view = r.snapshot(true);
    assert.equal(entry(view, thief).hidden, true);
    const fake = at(view, thief.x, thief.y)!;
    assert.equal(fake.kind, 'statue');
    assert.ok(!JSON.stringify(fake).includes(thief.id));
    assert.ok(at(view, statue.x, statue.y), 'the real statue is listed too');
    for (const q of view.visibleProps!) {
        assert.deepEqual(Object.keys(q).sort(), ['id', 'kind', 'x', 'y'], 'real and fake props have the same shape');
        assert.match(q.id, /^o[0-9a-f]{10}$/, 'ids reveal nothing about what is behind them');
    }
    assert.ok(view.visibleProps!.length < props.length + 1, 'props far from every cop are not sent');
});

test('cops are blind during the head start', () => {
    const { r, cop, thieves: [thief] } = round();
    r.state.headStart = 10;
    Object.assign(cop, { x: 300, y: 350 });
    Object.assign(thief, { x: 330, y: 350 });
    const view = r.snapshot(true);
    assert.equal(entry(view, thief).hidden, true);
    assert.equal(view.visibleProps!.length, 0);
    assert.equal(view.loot.length, 0);
});

test('pocketed loot is never sent to cops because it would trace its thief', () => {
    const { r, cop, thieves: [thief] } = round();
    const pocketed = r.state.loot.find(l => l.x === 390 && l.y === 300)!, floor = r.state.loot.find(l => l.x === 280 && l.y === 200)!;
    Object.assign(thief, { x: pocketed.x, y: pocketed.y });
    r.act(thief.id, 'interact');
    assert.deepEqual(pocketed.carriers, [thief.id]);
    Object.assign(cop, { x: 330, y: 260 });
    const loot = r.snapshot(true).loot.map(l => l.id);
    assert.ok(!loot.includes(pocketed.id));
    assert.ok(loot.includes(floor.id), 'loot lying in view is still shown');
});

test('arrests land only on the object the flashlight is pointed at', () => {
    const { r, cop, thief } = disguisedNearStatue();
    const view = r.snapshot(true), fake = at(view, thief.x, thief.y)!, real = at(view, statue.x, statue.y)!;
    // Arresting the real statue is a miss and costs time.
    cop.aim = Math.atan2(statue.y - cop.y, statue.x - cop.x);
    r.act(cop.id, 'arrest:' + real.id);
    assert.equal(cop.cooldown, MISS_COOLDOWN);
    assert.match(r.state.message, /no comment/);
    cop.cooldown = 0;
    // A disguised thief can't be caught by player id, which a cheater could learn from the roster.
    cop.aim = -Math.PI / 2;
    r.act(cop.id, 'arrest:' + thief.id);
    assert.equal(thief.captured, false);
    // Pointing the other way doesn't count, and costs nothing.
    cop.aim = Math.PI / 2;
    assert.throws(() => r.act(cop.id, 'arrest:' + fake.id), /Get closer/);
    assert.equal(cop.cooldown, 0);
    cop.aim = -Math.PI / 2;
    r.act(cop.id, 'arrest:' + fake.id);
    assert.equal(thief.captured, true);
    assert.equal(cop.cooldown, ARREST_COOLDOWN);
    assert.equal(at(r.snapshot(true), 900, 190), undefined, 'the fake statue is gone once its thief is caught');
});

test('flashlights stop at walls and pass through doorways', () => {
    assert.equal(castRay({ x: 500, y: 200 }, 0, 300), 50, 'wall at x=550');
    assert.equal(castRay({ x: 500, y: 350 }, 0, 300), 300, 'doorway between y=288 and 410');
    const beam = lightPolygon({ x: 500, y: 200 }, 0).slice(0, 33);
    assert.ok(beam.every(p => p.x <= 560), 'no light leaks past the wall face');
});

test('cop aim follows an explicit aim, otherwise movement', () => {
    const { r, cop } = round();
    r.input(cop.id, 0, 0, 1.25);
    assert.equal(cop.aim, 1.25);
    r.input(cop.id, -1, 0);
    assert.equal(cop.aim, Math.PI);
    r.input(cop.id, 0, 0, 'east');
    assert.equal(cop.aim, Math.PI, 'non-numeric aims are ignored');
});

test('snapshots never carry server-only fields', () => {
    const { r } = round();
    for (const view of [r.snapshot(), r.snapshot(true)]) {
        for (const p of view.players)
            for (const key of ['input', 'lastInput', 'lastSeen'])
                assert.ok(!(key in p), `${key} leaked`);
        for (const token of r.tokens.keys())
            assert.ok(!JSON.stringify(view).includes(token));
    }
});

test('sprinting thieves leave anonymous footstep noises that fade', () => {
    const { r, thieves: [thief] } = round();
    Object.assign(thief, { x: 780, y: 1030 });
    r.act(thief.id, 'sprint');
    for (let i = 0; i < 12; i++) r.update(1 / 30);
    assert.ok(r.state.noises!.length > 0);
    for (const n of r.state.noises!) assert.deepEqual(Object.keys(n).sort(), ['age', 'x', 'y']);
    for (let i = 0; i < 120; i++) r.update(1 / 30);
    assert.equal(r.state.noises!.length, 0);
});
