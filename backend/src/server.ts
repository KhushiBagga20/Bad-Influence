import { fileURLToPath } from 'node:url';
import express from 'express';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import { Room } from './game-room.js';
const app = express(), http = createServer(app), io = new Server(http, { cors: process.env.CLIENT_ORIGIN ? { origin: process.env.CLIENT_ORIGIN } : undefined, maxHttpBufferSize: 8192 });
const rooms = new Map<string, Room>(), sessions = new Map<string, {
    room: Room;
    id: string;
}>();
app.get('/health', (_, res) => res.json({ ok: true, rooms: rooms.size }));
if (process.env.NODE_ENV === 'production')
    app.use(express.static(fileURLToPath(new URL('../../frontend/dist', import.meta.url))));
else {
    const { createServer } = await import('vite');
    const vite = await createServer({ configFile: fileURLToPath(new URL('../../frontend/vite.config.ts', import.meta.url)), server: { middlewareMode: true }, appType: 'spa' });
    app.use(vite.middlewares);
}
/** Sends each socket its own view: cops get the filtered dark-museum snapshot, everyone else the full one. */
function broadcast(room: Room) {
    const members = io.sockets.adapter.rooms.get(room.code);
    if (!members)
        return;
    let full: ReturnType<Room['snapshot']> | undefined, cop: ReturnType<Room['snapshot']> | undefined;
    for (const sid of members) {
        const session = sessions.get(sid);
        const viewer = session && room.player(session.id);
        const view = room.copView(viewer) ? (cop ??= room.snapshot(true)) : (full ??= room.snapshot());
        io.sockets.sockets.get(sid)?.emit('state', view);
    }
}
function code() { const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; return Array.from({ length: 4 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join(''); }
io.on('connection', socket => {
    let lastAction = 0, attempts = 0;
    socket.on('join', (data, reply) => { if (typeof reply !== 'function')
        return; if (++attempts > 30)
        return reply({ error: 'Too many attempts. Reconnect to try again.' }); try {
        if (sessions.has(socket.id))
            throw Error('Already in a crew.');
        if (!data || typeof data.name !== 'string')
            throw Error('Choose a nickname.');
        let room: Room | undefined;
        if (data.create) {
            if (rooms.size >= 500)
                throw Error('The museum is busy. Try later.');
            let c = code();
            while (rooms.has(c))
                c = code();
            room = new Room(c, data.mode==='coop'?'coop':'versus');
            rooms.set(c, room);
        }
        else
            room = rooms.get(String(data.code).toUpperCase());
        if (!room)
            throw Error('No crew with that code. Check the four letters.');
        const { p, token } = room.join(data.name, typeof data.token === 'string' ? data.token : undefined, data.color);
        for (const [sid, session] of sessions)
            if (session.room === room && session.id === p.id) {
                sessions.delete(sid);
                io.sockets.sockets.get(sid)?.disconnect(true);
            }
        sessions.set(socket.id, { room, id: p.id });
        socket.join(room.code);
        reply({ id: p.id, token, code: room.code });
        broadcast(room);
    }
    catch (e) {
        reply({ error: (e as Error).message });
    } });
    socket.on('input', data => { const session = sessions.get(socket.id); if (session && data && typeof data.x === 'number' && typeof data.y === 'number')
        session.room.input(session.id, data.x, data.y, data.aim); });
    socket.on('action', action => { if (Date.now() - lastAction < 100)
        return; lastAction = Date.now(); const session = sessions.get(socket.id); if (session && typeof action === 'string')
        try {
            session.room.act(session.id, action);
        }
        catch (e) {
            socket.emit('notice', (e as Error).message);
        } });
    socket.on('leave', () => { const session = sessions.get(socket.id); if (session) {
        session.room.disconnect(session.id);
        socket.leave(session.room.code);
        sessions.delete(socket.id);
        if (session.room.state.phase === 'lobby')
            session.room.state.players = session.room.state.players.filter(p => p.id !== session.id);
    } });
    socket.on('disconnect', () => { const session = sessions.get(socket.id); if (session) {
        session.room.disconnect(session.id);
        sessions.delete(socket.id);
    } });
});
let previous = Date.now(), frame = 0;
setInterval(() => { const now = Date.now(), dt = Math.min((now - previous) / 1000, .1); previous = now; frame++; for (const [code, room] of rooms) {
    // One room's bug must not crash the process and end every other room's game.
    try {
        room.update(dt);
        if (frame % 2 === 0)
            broadcast(room);
    }
    catch (e) {
        console.error(`Room ${code} tick failed:`, e);
    }
    if (room.state.players.every(p => !p.connected)) {
        if (!room.vacantSince)
            room.vacantSince = now;
        if (now - room.vacantSince > 120000)
            rooms.delete(code);
    }
    else
        room.vacantSince = 0;
} }, 1000 / 30);
const port = Number(process.env.PORT) || 3000;
http.listen(port, '0.0.0.0', () => console.log(`PETTY THEFT listening on http://localhost:${port}`));
