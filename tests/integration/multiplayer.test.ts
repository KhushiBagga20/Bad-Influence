/**
 * Real Socket.IO clients against a real server. Uses TEST_SERVER_URL if given (the production smoke test
 * passes one); otherwise starts its own server on a spare port.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn, type ChildProcess } from 'node:child_process';
import { io, type Socket } from 'socket.io-client';
import type { State } from '../../shared/rules.js';

let url = process.env.TEST_SERVER_URL ?? '', server: ChildProcess | undefined;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
before(async () => {
    if (url) return;
    const port = String(3200 + Math.floor(Math.random() * 600));
    url = `http://127.0.0.1:${port}`;
    server = spawn(process.execPath, ['--import', 'tsx', 'backend/src/server.ts'], { env: { ...process.env, NODE_ENV: 'production', PORT: port, OPENAI_API_KEY: '' }, stdio: 'ignore' });
    for (let i = 0; i < 60; i++) { try { if ((await fetch(url + '/health')).ok) return; } catch { } await delay(100); }
    throw Error('test server did not start');
});
after(() => { server?.kill('SIGTERM'); });

function client() { const s = io(url, { forceNew: true, transports: ['websocket'], reconnection: false }); return new Promise<Socket>((resolve, reject) => { s.on('connect', () => resolve(s)); s.on('connect_error', reject); }); }
function join(s: Socket, data: object) { return new Promise<any>(resolve => s.emit('join', data, resolve)); }
function next(s: Socket, predicate: (s: State) => boolean, ms = 8000) {
    return new Promise<State>((resolve, reject) => {
        const timer = setTimeout(() => { s.off('state', on); reject(Error('state timeout')); }, ms);
        function on(state: State) { if (predicate(state)) { clearTimeout(timer); s.off('state', on); resolve(state); } }
        s.on('state', on);
    });
}

test('ten network clients fill a room, start a 5v5 match, get role-filtered views, move, reconnect and stay isolated', async () => {
    const sockets: Socket[] = [];
    try {
        for (let i = 0; i < 11; i++) sockets.push(await client());
        const host = await join(sockets[0], { create: true, name: 'Host', fillBots: false });
        assert.ok(host.code && host.token);
        const replies = [host];
        for (let i = 1; i < 10; i++) replies.push(await join(sockets[i], { code: host.code, name: 'Player ' + i }));
        assert.ok(replies.every(r => r.id && !r.error));
        const full = await join(sockets[10], { code: host.code, name: 'Eleventh' });
        assert.match(full.error, /full/);
        const other = await join(sockets[10], { create: true, name: 'Elsewhere', fillBots: false });
        assert.notEqual(other.code, host.code);
        sockets[0].emit('action', 'settings:map:museum');
        await delay(120);
        for (const s of sockets.slice(0, 10)) { s.emit('action', 'ready'); await delay(70); }
        await delay(150);
        sockets[0].emit('action', 'start');
        const started = await next(sockets[0], s => s.phase === 'briefing');
        assert.equal(started.players.length, 10);
        assert.equal(started.players.filter(p => p.team === 'A').length, 5);
        assert.equal(started.players.filter(p => p.role === 'police').length, 5);
        assert.ok(!started.players.some(p => p.bot), 'humans only');
        // Each socket gets the view for its own role.
        const views = await Promise.all(sockets.slice(0, 10).map(s => next(s, st => st.phase === 'briefing')));
        views.forEach((v, i) => {
            const mine = v.players.find(p => p.id === replies[i].id)!;
            assert.equal(v.view, mine.role === 'police' ? 'police' : 'full');
            if (v.view === 'police') assert.ok(v.players.filter(p => p.role === 'thief').every(p => p.hidden || p.captured), 'police see no thief positions at the start');
            assert.ok(!JSON.stringify(v).includes('"input"'));
        });
        const otherRoom = await next(sockets[10], s => s.code === other.code);
        assert.equal(otherRoom.players.length, 1, 'rooms stay isolated');
        // A thief moves during prep.
        await next(sockets[0], s => s.phase === 'prep', 10000);
        const thiefIndex = views.findIndex((v, i) => v.players.find(p => p.id === replies[i].id)!.role === 'thief');
        const t = sockets[thiefIndex], tid = replies[thiefIndex].id;
        const before = (await next(t, s => s.phase === 'prep')).players.find(p => p.id === tid)!;
        t.emit('input', { x: 1, y: 0 });
        const moved = await next(t, s => { const p = s.players.find(q => q.id === tid)!; return Math.abs(p.x - before.x) > 20 || Math.abs(p.y - before.y) > 20; });
        assert.ok(moved);
        t.emit('input', { x: 0, y: 0 });
        // Drop and reconnect with the token: same seat, same team.
        const team = moved.players.find(p => p.id === tid)!.team;
        t.disconnect();
        await delay(150);
        const again = await client(); sockets[thiefIndex] = again;
        const back = await join(again, { code: host.code, name: 'ignored', token: replies[thiefIndex].token });
        assert.equal(back.id, tid);
        const after = await next(again, s => !!s.players.find(p => p.id === tid));
        assert.equal(after.players.find(p => p.id === tid)!.team, team);
    } finally { sockets.forEach(s => s.disconnect()); }
});

test('a solo player starts a bot-filled match over the network; a second player takes a bot seat', async () => {
    const sockets: Socket[] = [];
    try {
        const a = await client(), b = await client(); sockets.push(a, b);
        const ar = await join(a, { create: true, name: 'Solo' });
        a.emit('action', 'settings:map:market'); await delay(100);
        a.emit('action', 'ready'); await delay(100);
        a.emit('action', 'start');
        const s = await next(a, st => st.phase === 'briefing');
        assert.equal(s.players.length, 10);
        assert.equal(s.players.filter(p => p.bot).length, 9);
        assert.equal(s.match!.mapId, 'market');
        const br = await join(b, { code: ar.code, name: 'Friend' });
        const after = await next(b, st => st.players.some(p => p.id === br.id && !p.bot));
        assert.equal(after.players.length, 10);
        assert.equal(after.players.filter(p => p.bot).length, 8);
    } finally { sockets.forEach(s => s.disconnect()); }
});
