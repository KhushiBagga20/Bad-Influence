/** Socket connection, the latest server state and small client-side session details. */
import { io } from 'socket.io-client';
import type { Player, State } from '../../shared/rules.js';

export const socket = io((import.meta as any).env.VITE_SERVER_URL || undefined, { autoConnect: true, reconnectionDelayMax: 4000 });

type Session = { code: string; token: string; name: string };
const read = (k: string) => { try { return sessionStorage.getItem(k); } catch { return null; } };
export const store = {
    state: null as State | null,
    myId: '',
    snapshotAt: 0,
    connected: false,
    /** True once the first connection attempt has failed: the server is unreachable. */
    unreachable: false,
    session: (() => { try { return JSON.parse(read('petty-session') || 'null') as Session | null; } catch { return null; } })(),
    /** Local aim for police (radians). */
    aim: Math.PI / 2,
    usingMouse: false,
    /** Which teammate a spectator is following. */
    follow: 0,
};
export const me = (): Player | undefined => store.state?.players.find(p => p.id === store.myId);

const listeners = { state: new Set<() => void>(), notice: new Set<(s: string) => void>(), connection: new Set<() => void>() };
export const onState = (f: () => void) => listeners.state.add(f);
export const onNotice = (f: (s: string) => void) => listeners.notice.add(f);
export const onConnection = (f: () => void) => listeners.connection.add(f);
const saveSession = (s: Session | null) => { store.session = s; try { s ? sessionStorage.setItem('petty-session', JSON.stringify(s)) : sessionStorage.removeItem('petty-session'); } catch { } };

socket.on('connect', () => {
    store.connected = true; store.unreachable = false;
    listeners.connection.forEach(f => f());
    // Rejoin the same seat after a reload or a dropped connection.
    if (store.session) join({ code: store.session.code, token: store.session.token, name: store.session.name }).catch(() => { saveSession(null); store.state = null; listeners.state.forEach(f => f()); });
});
socket.on('connect_error', () => { store.connected = false; store.unreachable = true; listeners.connection.forEach(f => f()); });
socket.on('disconnect', () => { store.connected = false; listeners.connection.forEach(f => f()); });
socket.on('state', (s: State) => {
    const before = store.state?.message;
    store.state = s; store.snapshotAt = performance.now();
    if (s.message && s.message !== before) listeners.notice.forEach(f => f(s.message));
    listeners.state.forEach(f => f());
});
socket.on('notice', (s: string) => listeners.notice.forEach(f => f(s)));

export function join(data: { create?: boolean; code?: string; token?: string; name: string; color?: string; fillBots?: boolean }) {
    return new Promise<{ id: string; token: string; code: string }>((resolve, reject) => {
        if (!socket.connected) return reject(Error(store.unreachable ? 'Can’t reach the game server. Check your connection, or that the server is running.' : 'Still connecting to the game server…'));
        socket.timeout(6000).emit('join', data, (err: Error | null, reply: any) => {
            if (err) return reject(Error('The game server didn’t answer. Try again in a moment.'));
            if (reply?.error) return reject(Error(reply.error));
            store.myId = reply.id;
            saveSession({ code: reply.code, token: reply.token, name: data.name });
            resolve(reply);
        });
    });
}
export const act = (action: string) => socket.emit('action', action);
let lastInput = '', lastSent = 0;
/** Movement intent (and aim for police), throttled; repeats are dropped unless it's been a while. */
export function sendInput(x: number, y: number, aim?: number) {
    const key = `${x.toFixed(2)},${y.toFixed(2)},${aim?.toFixed(2)}`, now = performance.now();
    if (key === lastInput && now - lastSent < 250) return;
    lastInput = key; lastSent = now;
    socket.emit('input', { x, y, aim });
}
export function leave() {
    socket.emit('leave');
    saveSession(null);
    store.state = null; store.myId = '';
    listeners.state.forEach(f => f());
}
