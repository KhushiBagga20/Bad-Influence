/**
 * Game rules, tuning and the shared state shape. The server is authoritative for all of it; the client
 * only reads these numbers to draw cooldowns and predict its own movement for a few milliseconds.
 */
export type Point = { x: number; y: number };
export type TeamId = 'A' | 'B';
export type Role = 'thief' | 'police';
export type TaskType = 'panel' | 'label' | 'loading';
export type Phase = 'lobby' | 'vote' | 'briefing' | 'prep' | 'play' | 'roundEnd' | 'matchEnd';

export const MAX_PLAYERS = 10;
export const TEAM_NAMES: Record<TeamId, string> = { A: 'Magpies', B: 'Raccoons' };
export const TEAM_COLORS: Record<TeamId, string> = { A: '#f1c46a', B: '#6fd7df' };
export const COLORS = ['#f3bf67', '#83d3bd', '#e48daa', '#a7a0ed', '#80bde0', '#ed956b', '#b6db78', '#d1a7e8', '#6fd7df', '#e9df88'];

/** Phase lengths in seconds. Play length comes from the map. */
export const TIMING = { vote: 12, briefing: 6, prep: 25, roundEnd: 9 };
/** Rounds needed to win the match; the host can pick 1–5 in the lobby. */
export const DEFAULT_WINS = 3;

export const SPEED = { thief: 175, disguised: 115, police: 185, smokeBoost: 1.5 };
export const RADIUS = { player: 16 };

export const DISGUISE = { range: 120, cooldown: 6 };
export const DECOY = { uses: 2, life: 7, pings: [1.5, 4.5] };
export const SMOKE = { uses: 1, radius: 170, duration: 4.5, boost: 2.5 };
/** Each thief makes a sound every 25–35 seconds; they see a countdown for the last few. */
export const CUE = { min: 25, max: 35, warn: 5, stagger: 3, jitter: 240, range: 1100 };

export const BLASTER = { range: 560, cooldown: 0.7, hitRadius: 26, propHeat: 0.55, emptyHeat: 0.12, decay: 0.09, lock: 4 };
export const STUN = { uses: 1, radius: 190, duration: 2.2, cooldown: 10 };
/** Police see this far with line of sight; the team shares vision. */
export const VISION = { police: 520 };

export const TASK = { range: 72, durations: { panel: 4, label: 3, loading: 5.5 } as Record<TaskType, number>, labels: { panel: 'Disable security panel', label: 'Forge exhibit label', loading: 'Unlock loading bay' } as Record<TaskType, string> };
/** Team task work scales with the thieves in the round: one more task than thieves, at least three. */
export const requiredTasks = (thieves: number, available: number) => Math.min(available, Math.max(3, thieves + 1));

/** Which role a team plays in a round: Team A are thieves in odd rounds. */
export const roleFor = (team: TeamId, round: number): Role => (team === 'A') === (round % 2 === 1) ? 'thief' : 'police';
export const thiefTeam = (round: number): TeamId => round % 2 === 1 ? 'A' : 'B';
export const otherTeam = (team: TeamId): TeamId => team === 'A' ? 'B' : 'A';

export type Player = Point & {
    id: string;
    name: string;
    color: string;
    team?: TeamId;
    /** Seat controlled by the server's bot director. */
    bot?: boolean;
    /** Seat a human left mid-match; a bot keeps it warm until they return. */
    away?: boolean;
    ready: boolean;
    connected: boolean;
    /** Not playing this round (joined late with no free seat). */
    spectator: boolean;
    role?: Role;
    captured: boolean;
    escaped: boolean;
    disguise: string | null;
    /** Disguise mirrored to match its neighbours. */
    flip: boolean;
    aim: number;
    moving: boolean;
    /** Thief: seconds until the disguise can change. Police: seconds until the next shot. */
    cooldown: number;
    heat: number;
    lockedFor: number;
    stunnedFor: number;
    boostFor: number;
    decoys: number;
    smokes: number;
    stuns: number;
    stunCooldown: number;
    /** Thief: seconds until their next sound cue. */
    cueIn: number;
    task: { id: string; progress: number } | null;
    /** Server-only. */
    input?: Point;
    lastSeen?: number;
    stats: Stats;
    /** This round's tallies, for highlights. */
    roundStats?: { captures: number; tasks: number; escapes: number; round: number };
    /** In a police snapshot: a thief the police can't see, sent without position. */
    hidden?: boolean;
};
export type Stats = { captures: number; tasks: number; survived: number; escapes: number; shots: number; misses: number; decoys: number; captured: number };
export const emptyStats = (): Stats => ({ captures: 0, tasks: 0, survived: 0, escapes: 0, shots: 0, misses: 0, decoys: 0, captured: 0 });

export type PropState = Point & { id: string; kind: string; flip: boolean; r: number; wobble?: boolean };
export type TaskState = Point & { id: string; type: TaskType; done: boolean; district: string; doneAt?: number };
export type Decoy = Point & { id: string; owner: string; age: number; pinged: number };
export type Smoke = Point & { id: string; age: number };
/** Something heard: a thief's cue or a decoy. Police get only an approximate spot, never who made it. */
export type Sound = Point & { id: string; kind: string; age: number; owner?: string };
export type Shot = { id: string; from: Point; to: Point; result: 'capture' | 'prop' | 'wall' | 'miss'; age: number; by: string };
export type Pulse = Point & { id: string; age: number };
export type Clue = { id: string; type: TaskType; district: string; age: number };
export type RoundResult = { round: number; winner: TeamId; winnerRole: Role; reason: string; map: string; highlights: string[] };

export type State = {
    code: string;
    host: string;
    phase: Phase;
    /** Seconds left in the current phase. */
    phaseTime: number;
    players: Player[];
    settings: { fillBots: boolean; wins: number; map: string };
    /** Present once a match starts. */
    match?: {
        round: number;
        scores: Record<TeamId, number>;
        mapId: string;
        /** Public layout seed: walls, passages and task spots. Props come from a secret seed. */
        seed: number;
        votes: Record<string, string>;
        results: RoundResult[];
        winner?: TeamId;
    };
    /** Props: all of them for thieves and spectators of the thief team; for police, only those in sight. */
    props: PropState[];
    tasks: TaskState[];
    required: number;
    exitOpen: boolean;
    gateOpen: boolean;
    decoys: Decoy[];
    smokes: Smoke[];
    sounds: Sound[];
    shots: Shot[];
    pulses: Pulse[];
    clues: Clue[];
    message: string;
    tick: number;
    botMode?: 'local' | 'openai' | 'fallback';
    /** Set on police snapshots, so the client knows not to draw props it hasn't been sent. */
    view?: 'full' | 'police';
};
