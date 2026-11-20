import type { Player, TeamId } from '../../shared/rules.js';

/**
 * Two persistent teams, as even as possible. Humans are split first (so friends aren't all on one side
 * by accident of seat order), then bots balance the numbers.
 */
export function assignTeams(players: Player[], random: () => number) {
    const shuffle = <T>(a: T[]) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
    const first: TeamId = random() < 0.5 ? 'A' : 'B', second: TeamId = first === 'A' ? 'B' : 'A';
    for (const p of players) delete p.team;
    shuffle(players.filter(p => !p.bot)).forEach((p, i) => { p.team = i % 2 === 0 ? first : second; });
    for (const p of shuffle(players.filter(p => p.bot))) p.team = smallerTeam(players);
}
/** The team with fewer seats (A on a tie), for bots and late arrivals. */
export function smallerTeam(players: Player[]): TeamId {
    const a = players.filter(p => p.team === 'A').length, b = players.filter(p => p.team === 'B').length;
    return a <= b ? 'A' : 'B';
}
