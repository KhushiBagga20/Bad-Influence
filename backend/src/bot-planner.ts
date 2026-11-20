/**
 * Optional strategy from OpenAI, a few times a round. It only picks a focus per bot from a fixed list; all
 * movement and immediate decisions stay local. No player names, positions or hidden information are sent,
 * the key never leaves the server, and every failure falls back to local play.
 */
export type ThiefFocus = 'hide' | 'tasks' | 'escape' | 'decoy';
export type PoliceFocus = 'patrol' | 'sweep' | 'guard';
export type BotFocus = ThiefFocus | PoliceFocus;
export type BotBrief = { id: string; role: 'thief' | 'police'; disguised: boolean; decoys: number; stuns: number };
export type PlanContext = { secondsLeft: number; tasksDone: number; tasksRequired: number; exitOpen: boolean; thievesFree: number; scoreLead: number };
const THIEF: ThiefFocus[] = ['hide', 'tasks', 'escape', 'decoy'], POLICE: PoliceFocus[] = ['patrol', 'sweep', 'guard'];
let active = 0;

export async function planBots(bots: BotBrief[], context: PlanContext, request: typeof fetch = fetch): Promise<Map<string, BotFocus>> {
    const key = process.env.OPENAI_API_KEY, model = process.env.OPENAI_BOT_MODEL || 'gpt-4.1-mini';
    if (!key || process.env.OPENAI_BOTS_ENABLED === 'false' || active >= 2) throw Error('planner-unavailable');
    if (!bots.length) return new Map();
    active++;
    try {
        const response = await request('https://api.openai.com/v1/responses', {
            method: 'POST', signal: AbortSignal.timeout(4000),
            headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model, store: false, max_output_tokens: 500,
                instructions: 'You set strategy for bots in a hide-and-seek heist game. Thieves choose hide, tasks, escape or decoy; police choose patrol, sweep or guard. Use only the given ids. Escape only makes sense when exitOpen is true; guard is for when the exit is open or few tasks remain. Return the requested JSON.',
                input: JSON.stringify({ bots, context }),
                text: { format: { type: 'json_schema', name: 'bot_focus', strict: true, schema: {
                    type: 'object', additionalProperties: false, required: ['plans'],
                    properties: { plans: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['id', 'focus'], properties: { id: { type: 'string' }, focus: { type: 'string', enum: [...THIEF, ...POLICE] } } } } },
                } } },
            }),
        });
        if (!response.ok) throw Error('planner-http-' + response.status);
        const body = await response.json();
        const text = body.output?.flatMap((item: any) => item.content || []).filter((c: any) => c.type === 'output_text').map((c: any) => c.text).join('');
        const data = JSON.parse(text || '{}');
        if (!Array.isArray(data.plans)) throw Error('planner-invalid-output');
        const result = new Map<string, BotFocus>();
        for (const plan of data.plans.slice(0, 10)) {
            const bot = bots.find(b => b.id === plan?.id);
            if (!bot) continue;
            // Each role may only take its own focuses.
            if (((bot.role === 'thief' ? THIEF : POLICE) as string[]).includes(plan.focus)) result.set(bot.id, plan.focus as BotFocus);
        }
        return result;
    } finally { active--; }
}
