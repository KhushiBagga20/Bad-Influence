/** Thief tasks: start in range with line of sight, hold still to finish, open the exit when enough are done. */
import { TASK, TEAM_NAMES, thiefTeam, type Player } from '../../shared/rules.js';
import { los } from '../../shared/layout.js';
import type { Room } from './game-room.js';

const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export function startTask(room: Room, p: Player, id: string) {
    const s = room.state, t = s.tasks.find(q => q.id === id);
    if (!t) return;
    if (t.done) throw Error('That one’s already done.');
    if (s.phase !== 'play') throw Error('Tasks unlock when the gate opens.');
    if (dist(p, t) > TASK.range || !los(room.layout!, room.flags, p, t)) throw Error('Get right up to it first.');
    if (s.players.some(q => q !== p && q.task?.id === id)) throw Error('A teammate is already on it.');
    // You need your hands free: working a task drops your disguise.
    p.disguise = null;
    p.task = { id, progress: 0 };
}

export function updateTasks(room: Room, dt: number) {
    const s = room.state;
    for (const p of s.players) {
        if (!p.task) continue;
        const t = s.tasks.find(q => q.id === p.task!.id);
        const still = !p.input || Math.hypot(p.input.x, p.input.y) < 0.1;
        // Moving, being caught or stunned, wandering off or losing sight of it all cancel the work.
        if (!t || t.done || s.phase !== 'play' || p.captured || p.escaped || p.stunnedFor > 0 || !still || dist(p, t) > TASK.range || !los(room.layout!, room.flags, p, t)) { p.task = null; continue; }
        p.task.progress += dt;
        if (p.task.progress < TASK.durations[t.type]) continue;
        t.done = true; t.doneAt = Math.round(room.elapsed);
        p.task = null; p.stats.tasks++; room.bump(p, 'tasks');
        // A clue for everyone: which part of the building, not who or exactly where.
        s.clues.push({ id: t.id, type: t.type, district: t.district, age: 0 });
        const done = s.tasks.filter(q => q.done).length;
        if (done >= s.required && !room.flags.exitOpen) {
            room.flags.exitOpen = s.exitOpen = true;
            s.message = `The exit is open! ${TEAM_NAMES[thiefTeam(s.match!.round)]}, get out — or stay hidden until closing.`;
        } else s.message = `Something just happened in the ${t.district}… (${done}/${s.required})`;
    }
}
