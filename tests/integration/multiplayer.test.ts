import { test } from 'node:test';
import assert from 'node:assert/strict';
import { io, type Socket } from 'socket.io-client';
import type { State } from '../../shared/world.js';
const url = process.env.TEST_SERVER_URL;
const delay = (ms: number) => new Promise(r => setTimeout(r, ms));
function client() { const s = io(url!, { forceNew: true, transports: ['websocket'], reconnection: false }); return new Promise<Socket>((resolve, reject) => { s.on('connect', () => resolve(s)); s.on('connect_error', reject); }); }
function join(s: Socket, data: object) { return new Promise<any>(resolve => s.emit('join', data, resolve)); }
function next(s: Socket, predicate: (s: State) => boolean) { return new Promise<State>((resolve, reject) => { const timer = setTimeout(() => { s.off('state', on); reject(Error('State timeout')); }, 5000); function on(state: State) { if (predicate(state)) {
    clearTimeout(timer);
    s.off('state', on);
    resolve(state);
} } s.on('state', on); }); }
test('independent network clients synchronize movement, transformation, reconnect, spectator and isolation', { skip: !url }, async () => {
    const sockets: Socket[] = [];
    try {
        const a = await client(), b = await client(), c = await client();
        sockets.push(a, b, c);
        const ar = await join(a, { create: true, mode:'coop', name: 'Network Fern' }), br = await join(b, { code: ar.code, name: 'Network Chair' }), cr = await join(c, { create: true, name: 'Other Room' });
        assert.ok(ar.token && br.id && cr.code !== ar.code);
        a.emit('action', 'ready');
        b.emit('action', 'ready');
        await delay(150);
        a.emit('action', 'start');
        await next(b, s => s.phase === 'playing');
        const observedA = new Map<number, State>();
        const observedB = new Map<number, State>();
        const observeA = (s: State) => observedA.set(s.tick, s);
        const observeB = (s: State) => observedB.set(s.tick, s);
        a.on('state', observeA); b.on('state', observeB);
        await delay(250);
        a.off('state', observeA); b.off('state', observeB);
        const commonTick = [...observedA.keys()].find(t => observedB.has(t));
        assert.notEqual(commonTick, undefined);
        assert.deepEqual(observedA.get(commonTick!)!.guards, observedB.get(commonTick!)!.guards);
        assert.deepEqual(observedA.get(commonTick!)!.players, observedB.get(commonTick!)!.players);

        let input = { x: -1, y: 0 };
        const loop = setInterval(() => a.emit('input', input), 40);
        await delay(400);
        input = { x: 0, y: -1 };
        await delay(1100);
        input = { x: 0, y: 0 };
        clearInterval(loop);
        a.emit('input', input);
        await delay(150);
        a.emit('action', 'transform');
        const sync = await next(b, s => !!s.players.find(p => p.id === ar.id)?.disguise);
        assert.equal(sync.players.find(p => p.id === ar.id)!.disguise, 'plant');
        const isolated = await next(c, s => s.phase === 'lobby');
        assert.equal(isolated.players.length, 1);
        a.disconnect();
        await next(b, s => !s.players.find(p => p.id === ar.id)!.connected);
        const reconnect = await client();
        sockets.push(reconnect);
        const rr = await join(reconnect, { code: ar.code, token: ar.token, name: 'Network Fern' });
        assert.equal(rr.id, ar.id);
        const restored = await next(b, s => s.players.find(p => p.id === ar.id)!.connected);
        assert.equal(restored.players.length, 2);
        const late = await client();
        sockets.push(late);
        const lr = await join(late, { code: ar.code, name: 'Late' });
        const watch = await next(b, s => s.players.length === 3);
        assert.equal(watch.players.find(p => p.id === lr.id)!.spectator, true);
    }
    finally {
        sockets.forEach(s => s.disconnect());
    }
});
