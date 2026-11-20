import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../backend/src/game-room.js';
import { match, advance, tick } from './helpers.js';

test('ten humans fit; an eleventh is turned away', () => {
    const r = new Room('FULL', false);
    for (let i = 0; i < 10; i++) r.join('Human ' + i);
    assert.throws(() => r.join('Extra'), /full/);
});

test('a human joining mid-match takes over a bot seat with its team, role and round state', () => {
    const { r } = match();
    advance(r, 'play'); tick(r, 3);
    const before = new Map(r.state.players.filter(p => p.bot).map(p => [p.id, { team: p.team, role: p.role, x: p.x, y: p.y, disguise: p.disguise }]));
    const joined = r.join('Late friend');
    assert.ok(before.has(joined.p.id), 'took a bot seat');
    assert.equal(joined.p.bot, false);
    assert.equal(joined.p.name, 'Late friend');
    assert.deepEqual({ team: joined.p.team, role: joined.p.role, x: joined.p.x, y: joined.p.y, disguise: joined.p.disguise }, before.get(joined.p.id));
    assert.equal(r.state.players.length, 10);
});

test('a disconnect mid-match hands the seat to a bot; the token brings the human back to the same seat and team', () => {
    const { r, humans } = match();
    const me = humans[0];
    advance(r, 'play');
    const scores = { ...r.state.match!.scores }, team = me.p.team;
    r.disconnect(me.p.id);
    assert.equal(me.p.bot, true);
    assert.equal(me.p.away, true);
    assert.equal(r.state.players.length, 10, 'team numbers unchanged');
    tick(r, 1);
    const back = r.join('ignored', me.token);
    assert.equal(back.p.id, me.p.id);
    assert.equal(back.p.bot, false);
    assert.equal(back.p.team, team);
    assert.deepEqual(r.state.match!.scores, scores);
    assert.equal(r.state.host, me.p.id);
});

test('a newcomer prefers a pure bot seat over one held for someone who dropped out', () => {
    const { r, humans } = match({ humans: 2 });
    advance(r, 'play');
    r.disconnect(humans[1].p.id);
    const joined = r.join('Newcomer');
    assert.notEqual(joined.p.id, humans[1].p.id);
    assert.equal(r.join('x', humans[1].token).p.id, humans[1].p.id, 'the dropped player can still return');
});

test('without bots, a late arrival joins the smaller team and watches until the next round', () => {
    const { r } = match({ humans: 3, fillBots: false });
    advance(r, 'play');
    const late = r.join('Late');
    const a = r.state.players.filter(p => p.team === 'A').length, b = r.state.players.filter(p => p.team === 'B').length;
    assert.equal(a, b, 'balanced after the late join');
    assert.equal(late.p.spectator, true);
    r.state.phaseTime = 0; r.update(1 / 30); advance(r, 'briefing');
    assert.equal(late.p.spectator, false, 'plays from the next round');
});

test('host moves to another connected human, never a bot', () => {
    const { r, humans } = match({ humans: 2 });
    r.disconnect(humans[0].p.id);
    assert.equal(r.state.host, humans[1].p.id);
    r.disconnect(humans[1].p.id);
    const fresh = r.join('Replacement');
    assert.equal(r.state.host, fresh.p.id);
    assert.equal(fresh.p.bot, false);
});
