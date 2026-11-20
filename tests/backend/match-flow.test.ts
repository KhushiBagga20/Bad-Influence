import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../backend/src/game-room.js';
import { TIMING, MAX_PLAYERS, roleFor } from '../../shared/rules.js';
import { match, advance, thieves, police } from './helpers.js';

test('a solo start fills ten seats with labelled bots split five against five', () => {
    const { r, humans } = match();
    const s = r.state;
    assert.equal(s.players.length, MAX_PLAYERS);
    assert.equal(s.players.filter(p => p.bot).length, 9);
    assert.ok(s.players.filter(p => p.bot).every(p => p.name.startsWith('Bot ')));
    assert.equal(s.players.filter(p => p.team === 'A').length, 5);
    assert.equal(s.players.filter(p => p.team === 'B').length, 5);
    assert.equal(s.host, humans[0].p.id);
    assert.equal(s.phase, 'briefing');
    assert.equal(thieves(r).length, 5);
    assert.equal(police(r).length, 5);
});

test('the server runs vote → briefing → prep → play, opening the staging gate only for play', () => {
    const r = new Room('VOTE', true), h = r.join('Host');
    h.p.ready = true; r.start(h.p.id);
    assert.equal(r.state.phase, 'vote');
    r.act(h.p.id, 'vote:museum');
    r.update(1 / 30);
    assert.equal(r.state.phase, 'briefing', 'everyone human voted, so the vote closes early');
    assert.equal(r.state.match!.mapId, 'museum');
    advance(r, 'prep');
    assert.equal(r.state.gateOpen, false);
    assert.ok(Math.abs(r.state.phaseTime - TIMING.prep) < 0.1);
    advance(r, 'play');
    assert.equal(r.state.gateOpen, true);
    assert.equal(Math.round(r.state.phaseTime), 240);
});

test('teams stay fixed and swap roles every round; both rounds of a pair share map and layout', () => {
    const { r } = match({ wins: 5 });
    const teams = new Map(r.state.players.map(p => [p.id, p.team]));
    const seen: { round: number; seed: number; map: string; thiefTeam: string }[] = [];
    for (let round = 1; round <= 4; round++) {
        const m = r.state.match!;
        assert.equal(m.round, round);
        for (const p of r.state.players) { assert.equal(p.team, teams.get(p.id), 'no reshuffle between rounds'); assert.equal(p.role, roleFor(p.team!, round)); }
        seen.push({ round, seed: m.seed, map: m.mapId, thiefTeam: thieves(r)[0].team! });
        advance(r, 'play'); r.state.phaseTime = 0; r.update(1 / 30); // time up: thieves survive
        advance(r, round === 4 ? 'briefing' : 'briefing');
    }
    assert.deepEqual(seen.map(x => x.thiefTeam), ['A', 'B', 'A', 'B']);
    assert.equal(seen[0].seed, seen[1].seed); assert.equal(seen[0].map, seen[1].map);
    assert.equal(seen[2].seed, seen[3].seed);
    assert.notEqual(seen[1].map, seen[2].map, 'maps rotate between pairs');
});

test('round wins score one point for the winning team and first to the target wins the match', () => {
    const { r } = match({ wins: 2 });
    const winners: string[] = [];
    for (let i = 0; i < 4 && r.state.phase !== 'matchEnd'; i++) {
        advance(r, 'play');
        // Thieves survive every round, so the teams trade rounds: A, B, A.
        r.state.phaseTime = 0; r.update(1 / 30);
        assert.equal(r.state.phase, 'roundEnd');
        winners.push(r.state.match!.results.at(-1)!.winner);
        advance(r, r.state.match!.scores.A >= 2 || r.state.match!.scores.B >= 2 ? 'matchEnd' : 'briefing');
    }
    assert.deepEqual(winners, ['A', 'B', 'A']);
    assert.deepEqual(r.state.match!.scores, { A: 2, B: 1 });
    assert.equal(r.state.match!.winner, 'A');
    assert.equal(r.state.phase, 'matchEnd');
});

test('rematch keeps the players and starts fresh; back to lobby drops the bots', () => {
    const { r, humans } = match({ wins: 1 });
    advance(r, 'play'); r.state.phaseTime = 0; r.update(1 / 30); advance(r, 'matchEnd');
    r.act(humans[0].p.id, 'rematch');
    assert.equal(r.state.phase, 'briefing');
    assert.deepEqual(r.state.match!.scores, { A: 0, B: 0 });
    assert.equal(r.state.players.length, 10);
    advance(r, 'play'); r.state.phaseTime = 0; r.update(1 / 30); advance(r, 'matchEnd');
    r.act(humans[0].p.id, 'lobby');
    assert.equal(r.state.phase, 'lobby');
    assert.equal(r.state.players.length, 1);
    assert.equal(r.state.match, undefined);
});

test('the host chooses wins, map and bots in the lobby; others cannot', () => {
    const r = new Room('SET', true), a = r.join('Host'), b = r.join('Guest');
    r.act(b.p.id, 'settings:wins:5'); assert.equal(r.state.settings.wins, 3);
    r.act(a.p.id, 'settings:wins:5'); assert.equal(r.state.settings.wins, 5);
    r.act(a.p.id, 'settings:wins:9'); assert.equal(r.state.settings.wins, 5);
    r.act(a.p.id, 'settings:map:market'); assert.equal(r.state.settings.map, 'market');
    r.act(a.p.id, 'settings:map:moon'); assert.equal(r.state.settings.map, 'market');
    r.act(a.p.id, 'settings:bots:off'); assert.equal(r.state.settings.fillBots, false);
    a.p.ready = true;
    assert.throws(() => r.start(a.p.id), /ready/);
    b.p.ready = true; r.start(a.p.id);
    assert.equal(r.state.players.length, 2, 'no bots when switched off');
});
