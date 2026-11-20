import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Room } from '../../backend/src/game-room.js';
import { planBots } from '../../backend/src/bot-planner.js';
import { rng } from '../../shared/layout.js';
import { match, advance, tick } from './helpers.js';

test('bots play whole rounds under the new rules: they hide, disguise, do tasks, hunt and capture', () => {
    const { r } = match({ seed: 3 });
    const human = r.state.players.find(p => !p.bot)!;
    advance(r, 'play');
    tick(r, 3);
    const thieves = r.state.players.filter(p => p.role === 'thief' && p.bot);
    assert.ok(thieves.filter(p => p.disguise).length >= 3, 'thief bots disguise during prep');
    let captures = 0, tasks = 0, rounds = 0;
    for (let t = 0; t < 30 * 60 * 25 && r.state.phase !== 'matchEnd'; t++) {
        // Keep the human seat out of the way so the bots decide the rounds.
        if (r.state.phase === 'play' && !human.captured && human.role === 'thief') human.captured = true;
        r.update(1 / 30);
        if (r.state.phase === 'roundEnd' && r.state.match!.results.length > rounds) rounds = r.state.match!.results.length;
    }
    for (const p of r.state.players) { captures += p.stats.captures; tasks += p.stats.tasks; }
    assert.ok(rounds >= 3, `played ${rounds} rounds`);
    assert.ok(captures > 0, 'police bots caught someone');
    assert.ok(tasks > 0, 'thief bots completed tasks');
    assert.equal(r.state.phase, 'matchEnd');
});

test('bots swap roles with their team every round', () => {
    const { r } = match({ seed: 5 });
    const bot = r.state.players.find(p => p.bot)!, roles: string[] = [];
    for (let i = 0; i < 3; i++) { advance(r, 'play'); roles.push(bot.role!); r.state.phaseTime = 0; r.update(1 / 30); advance(r, 'briefing'); }
    assert.deepEqual(roles, [roles[0], roles[0] === 'thief' ? 'police' : 'thief', roles[0]]);
});

test('police bots act on the police view only: they never get a hidden thief’s position', () => {
    const { r } = match({ seed: 9 });
    advance(r, 'play'); tick(r, 2);
    const cop = r.state.players.find(p => p.bot && p.role === 'police')!;
    const view = r.snapshot(cop.id);
    assert.equal(view.view, 'police');
    for (const p of view.players.filter(q => q.role === 'thief' && q.hidden)) assert.equal(p.x + p.y, 0);
    assert.ok(!view.props.some(q => r.state.players.some(p => p.id === q.id)), 'props carry anonymous ids only');
});

test('a slow or failing planner never stalls the round, and failures fall back to local play', async () => {
    const old = { key: process.env.OPENAI_API_KEY, on: process.env.OPENAI_BOTS_ENABLED };
    process.env.OPENAI_API_KEY = 'test-only'; process.env.OPENAI_BOTS_ENABLED = 'true';
    const realFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = (async () => { calls++; return new Response('nope', { status: 503 }); }) as typeof fetch;
    try {
        const { r } = match({ seed: 4 });
        advance(r, 'play');
        const before = r.state.players.filter(p => p.bot).map(p => ({ id: p.id, x: p.x, y: p.y }));
        tick(r, 12);
        await new Promise(res => setTimeout(res, 20));
        tick(r, 1);
        assert.ok(calls >= 1, 'asked the planner');
        assert.equal(r.state.botMode, 'fallback');
        assert.ok(before.some(b => { const p = r.player(b.id)!; return Math.hypot(p.x - b.x, p.y - b.y) > 30 || p.captured; }), 'bots kept playing');
    } finally {
        globalThis.fetch = realFetch;
        if (old.key === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old.key;
        if (old.on === undefined) delete process.env.OPENAI_BOTS_ENABLED; else process.env.OPENAI_BOTS_ENABLED = old.on;
    }
});

test('the planner validates ids and focus per role, stores nothing, and never sends the key in the body', async () => {
    const old = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = 'test-only';
    try {
        let body: any, auth = '';
        const fake = (async (_url: any, init: any) => {
            body = JSON.parse(init.body); auth = init.headers.Authorization;
            return new Response(JSON.stringify({ output: [{ content: [{ type: 'output_text', text: JSON.stringify({ plans: [{ id: 't1', focus: 'tasks' }, { id: 'c1', focus: 'tasks' }, { id: 'c1', focus: 'guard' }, { id: 'ghost', focus: 'hide' }] }) }] }] }));
        }) as typeof fetch;
        const plans = await planBots([{ id: 't1', role: 'thief', disguised: true, decoys: 2, stuns: 0 }, { id: 'c1', role: 'police', disguised: false, decoys: 0, stuns: 1 }], { secondsLeft: 100, tasksDone: 1, tasksRequired: 6, exitOpen: false, thievesFree: 4, scoreLead: 0 }, fake);
        assert.equal(plans.get('t1'), 'tasks');
        assert.equal(plans.get('c1'), 'guard', 'a thief focus is refused for police');
        assert.equal(plans.has('ghost'), false);
        assert.equal(body.store, false);
        assert.ok(!JSON.stringify(body).includes('test-only'));
        assert.equal(auth, 'Bearer test-only');
        assert.ok(!JSON.stringify(body.input).match(/"x"|"y"|name/), 'no positions or names leave the server');
        await assert.rejects(() => planBots([{ id: 'a', role: 'thief', disguised: false, decoys: 0, stuns: 0 }], { secondsLeft: 1, tasksDone: 0, tasksRequired: 3, exitOpen: false, thievesFree: 1, scoreLead: 0 }, (async () => new Response('', { status: 429 })) as typeof fetch));
    } finally { if (old === undefined) delete process.env.OPENAI_API_KEY; else process.env.OPENAI_API_KEY = old; }
});

test('without a key the planner is never called and bots stay local', () => {
    const old = process.env.OPENAI_API_KEY;
    delete process.env.OPENAI_API_KEY;
    try {
        const r = new Room('LOCAL', true); r.random = rng(1); r.state.settings.map = 'museum';
        const h = r.join('Solo'); h.p.ready = true; r.start(h.p.id);
        advance(r, 'play'); tick(r, 40);
        assert.equal(r.state.botMode, 'local');
    } finally { if (old !== undefined) process.env.OPENAI_API_KEY = old; }
});
