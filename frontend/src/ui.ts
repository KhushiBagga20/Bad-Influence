/** DOM screens and HUD: title, corkboard lobby, map vote, in-game HUD and overlays, match results, help. */
import { COLORS, CUE, DECOY, DISGUISE, SMOKE, STUN, TASK, TEAM_COLORS, TEAM_NAMES, MAX_PLAYERS, roleFor, thiefTeam, otherTeam, type Player, type State, type TeamId, type Role } from '../../shared/rules.js';
import { MAP_DEFS, layoutFor, mapDef } from '../../shared/maps.js';
import { CELL, districtAt, FLOOR, type Layout } from '../../shared/layout.js';
import { PIXEL_ATLAS, PIXEL_FRAMES } from './pixel-atlas.js';
import { act, join, leave, me, onConnection, onNotice, onState, store } from './net.js';
import { input } from './input.js';
import { play, setMusic, setVolume, unlock, volume } from './audio.js';

const ui = document.querySelector<HTMLDivElement>('#ui')!;
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const remember = { get: (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { } } };
let selectedColor = COLORS.includes(remember.get('petty-color')) ? remember.get('petty-color') : COLORS[0];
let screen = '', help = false, toast = '', toastAt = 0, toastUntil = 0;
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
/** Counts up to the next whole second, so the clock and the countdown banners always agree. */
const clock = (s: number) => { const t = Math.ceil(s); return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`; };
const ROLE_NAME: Record<Role, string> = { thief: 'Thief', police: 'Police' };

// ---- pixel art helpers (mugshots, newspaper photos) ----------------------------------------------
const atlasImage = new Image();
atlasImage.src = PIXEL_ATLAS;
atlasImage.onload = () => { screen = ''; render(); };
type Placed = { frame: string; x: number; y: number; tint?: string; flip?: boolean };
const scenes = new Map<string, string>();
function pixelScene(w: number, h: number, items: Placed[]) {
    if (!atlasImage.naturalWidth) return '';
    const key = w + 'x' + h + JSON.stringify(items);
    if (scenes.has(key)) return scenes.get(key)!;
    const canvas = document.createElement('canvas'); canvas.width = w; canvas.height = h;
    const out = canvas.getContext('2d')!;
    for (const it of items) {
        const [sx, sy, fw, fh] = PIXEL_FRAMES[it.frame], dx = Math.round(it.x - fw / 2), dy = it.y - fh;
        const layer = document.createElement('canvas'); layer.width = fw; layer.height = fh;
        const l = layer.getContext('2d')!;
        if (it.flip) { l.translate(fw, 0); l.scale(-1, 1); }
        l.drawImage(atlasImage, sx, sy, fw, fh, 0, 0, fw, fh);
        if (it.tint) { l.setTransform(1, 0, 0, 1, 0, 0); l.globalCompositeOperation = 'multiply'; l.fillStyle = it.tint; l.fillRect(0, 0, fw, fh); l.globalCompositeOperation = 'destination-in'; if (it.flip) { l.translate(fw, 0); l.scale(-1, 1); } l.drawImage(atlasImage, sx, sy, fw, fh, 0, 0, fw, fh); }
        out.drawImage(layer, dx, dy);
    }
    const url = canvas.toDataURL(); scenes.set(key, url); return url;
}
const person = (x: number, y: number, color: string, role: Role = 'thief', dir = 'down'): Placed[] => role === 'police' ? [{ frame: `cop-${dir}-0`, x, y }] : [{ frame: `thief-${dir}-0`, x, y }, { frame: `thief-shirt-${dir}-0`, x, y, tint: color }];
const mugshot = (p: Player, role: Role = 'thief') => pixelScene(16, 16, person(8, 16, p.color, role));

/** A map thumbnail: floors light, walls dark, exit green, staging blue. Two pixels per cell. */
const thumbs = new Map<string, string>();
function thumbnail(l: Layout) {
    const key = l.def.id + l.seed;
    if (thumbs.has(key)) return thumbs.get(key)!;
    const c = document.createElement('canvas'); c.width = l.cols * 2; c.height = l.rows * 2;
    const g = c.getContext('2d')!;
    g.fillStyle = '#1b2a3c'; g.fillRect(0, 0, c.width, c.height);
    for (let y = 0; y < l.rows; y++) for (let x = 0; x < l.cols; x++) { const t = l.type[y * l.cols + x]; if (t === FLOOR) { g.fillStyle = '#9fb8d0'; g.fillRect(x * 2, y * 2, 2, 2); } else if (t === 2) { g.fillStyle = '#5d7690'; g.fillRect(x * 2, y * 2, 2, 2); } }
    const z = (r: number[], col: string) => { g.fillStyle = col; g.fillRect(r[0] * 2, r[1] * 2, r[2] * 2, r[3] * 2); };
    z(l.def.exitZone, '#7fd67a'); z(l.def.staging, '#80bde0');
    const url = c.toDataURL(); thumbs.set(key, url); return url;
}

// ---- dispatch ---------------------------------------------------------------------------------------
export function notice(s: string) {
    toast = s; toastAt = Date.now(); toastUntil = Date.now() + 5000;
    const e = document.querySelector('.error'); if (e) e.textContent = s;
}
onNotice(notice);
onState(render);
onConnection(() => { const b = document.querySelector<HTMLElement>('#connection'); if (b) b.hidden = store.connected || !store.unreachable; });
input.onHelp = showHelp;

export function render() {
    const s = store.state, phase = s?.phase ?? 'home';
    const key = phase === 'lobby' ? 'lobby' + JSON.stringify([s!.players.map(p => [p.id, p.ready, p.connected, p.name]), s!.host, s!.settings])
        : phase === 'vote' ? 'vote' + JSON.stringify(s!.match!.votes) + s!.match!.round
        : phase === 'matchEnd' ? 'end' + s!.host + s!.players.length
        : phase === 'home' ? 'home' : 'game' + s!.match!.round + (me()?.role ?? '');
    if (screen !== key) {
        screen = key; help = false;
        if (phase === 'home') home(); else if (phase === 'lobby') lobby(); else if (phase === 'vote') vote(); else if (phase === 'matchEnd') matchEnd(); else game();
        setMusic(phase === 'home' || phase === 'lobby' ? 'title' : s?.match ? mapDef(s.match.mapId).theme : 'title');
    }
    if (s && ['briefing', 'prep', 'play', 'roundEnd'].includes(phase)) hud(s);
    if (phase === 'vote') voteClock(s!);
}
setInterval(() => { const s = store.state; if (s && ['briefing', 'prep', 'play', 'roundEnd'].includes(s.phase)) radio(); }, 50);

// ---- title ------------------------------------------------------------------------------------------
function home() {
    ui.innerHTML = `<main class="screen title-screen">
<section class="title-menu">
  <h1 class="title-mark">PETTY THEFT<span>.</span></h1>
  <svg class="title-rule" viewBox="0 0 200 4" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="2" width="200" height="1" fill="currentColor" opacity=".3"/><rect x="0" y="1" width="150" height="2" fill="currentColor" opacity=".55"/><rect x="0" y="0" width="64" height="3" fill="currentColor" opacity=".9"/><rect x="0" y="0" width="10" height="3" fill="#f1c46a"/></svg>
  <p class="title-tag">Good art. Bad intent. Prop hunt for 1–10 players: hide as the furniture, or hunt it down.</p>
  <div class="case-fields">
    <label class="field" for="name"><span>ALIAS</span><input id="name" maxlength="16" placeholder="Shady Fern" autocomplete="nickname" spellcheck="false" value="${escape(remember.get('petty-alias'))}"></label>
    <div class="field"><span>COLOUR</span><div class="swatches" role="radiogroup" aria-label="Character colour">${COLORS.map((c, i) => `<button class="swatch ${c === selectedColor ? 'selected' : ''}" data-color="${c}" style="--swatch:${c}" role="radio" aria-checked="${c === selectedColor}" aria-label="Colour ${i + 1}"></button>`).join('')}</div></div>
  </div>
  <nav class="title-options" aria-label="Main menu">
    <button id="create" class="menu-item" data-nav>Plan a heist</button>
    <div class="menu-item join-item"><button id="join" class="menu-text" data-nav>Join a crew</button><input id="code" maxlength="4" placeholder="CODE" aria-label="Room code" autocomplete="off" spellcheck="false"></div>
    <a class="menu-item" href="/how-to-play.html" target="_blank" rel="noopener" data-nav>How to play</a>
  </nav>
  <div class="error" role="alert"></div>
</section>
<footer class="title-foot"><span><b>ARROWS</b> choose · <b>ENTER</b> select</span><span class="title-quip">No honour among houseplants.</span></footer>
</main>${connectionBanner()}`;
    const name = document.querySelector<HTMLInputElement>('#name')!, code = document.querySelector<HTMLInputElement>('#code')!;
    const go = (create: boolean) => {
        unlock();
        const alias = name.value.trim() || 'Sneaky Pete';
        remember.set('petty-alias', alias);
        join(create ? { create: true, name: alias, color: selectedColor } : { code: code.value.trim().toUpperCase(), name: alias, color: selectedColor }).then(() => { screen = ''; render(); }).catch(e => notice(e.message));
    };
    const joinCrew = () => { if (code.value.trim().length < 4) { code.focus(); notice('Type the four-letter code from your crew.'); return; } go(false); };
    document.querySelector('#create')!.addEventListener('click', () => go(true));
    document.querySelector('#join')!.addEventListener('click', joinCrew);
    code.addEventListener('keydown', e => { if (e.key === 'Enter') joinCrew(); });
    name.addEventListener('keydown', e => { if (e.key === 'Enter') document.querySelector<HTMLElement>('#create')!.focus(); });
    document.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(b => b.onclick = () => {
        selectedColor = b.dataset.color!; remember.set('petty-color', selectedColor);
        document.querySelectorAll<HTMLButtonElement>('.swatch').forEach(s => { s.classList.toggle('selected', s === b); s.setAttribute('aria-checked', String(s === b)); });
    });
    const items = Array.from(document.querySelectorAll<HTMLElement>('.title-options .menu-item'));
    const select = (item?: Element | null) => { if (item) items.forEach(i => i.classList.toggle('is-selected', i === item)); };
    document.querySelector('.title-screen')!.addEventListener('keydown', e => {
        const k = (e as KeyboardEvent).key;
        if (k !== 'ArrowDown' && k !== 'ArrowUp') return;
        const stops = [name, ...Array.from(document.querySelectorAll<HTMLElement>('[data-nav]'))];
        const at = stops.indexOf(document.activeElement === code ? document.querySelector<HTMLElement>('#join')! : document.activeElement as HTMLElement);
        e.preventDefault();
        const next = stops[at < 0 ? 1 : (at + (k === 'ArrowDown' ? 1 : -1) + stops.length) % stops.length];
        next.focus(); select(next.closest('.menu-item'));
    });
    document.querySelector('.title-options')!.addEventListener('focusin', e => select((e.target as Element).closest('.menu-item')));
    items.forEach(i => i.addEventListener('mouseenter', () => select(i)));
    select(items[0]);
    (name.value ? document.querySelector<HTMLElement>('#create')! : name).focus({ preventScroll: true });
}
/** Shown whenever the game server can't be reached, instead of buttons that silently do nothing. */
function connectionBanner() {
    return `<div id="connection" class="connection-banner" role="status" ${store.connected || !store.unreachable ? 'hidden' : ''}><b>Can’t reach the game server.</b> Retrying… If this is a hosted copy, its multiplayer server may be asleep or not deployed yet.</div>`;
}

// ---- lobby ------------------------------------------------------------------------------------------
function lobby() {
    const s = store.state!, mine = me(), host = s.host === myId(), st = s.settings, tilt = [-3, 2, -1.5, 2.5, -2, 1.5];
    const humans = s.players.length, bots = st.fillBots ? MAX_PLAYERS - humans : 0;
    const suspects = s.players.map((p, i) => `<li class="polaroid${p.ready ? ' is-ready' : ''}${!p.connected ? ' is-offline' : ''}${p.id === myId() ? ' is-me' : ''}" style="--tilt:${tilt[i % 6]}deg"><i class="pin" data-color="${p.color}"></i><div class="mug"><img src="${mugshot(p)}" alt=""></div><b>${escape(p.name)}</b><small>${p.id === s.host ? 'MASTERMIND' : 'ACCOMPLICE'}${p.id === myId() ? ' · YOU' : ''}</small>${!p.connected ? '<span class="stamp">No-show</span>' : p.ready ? '<span class="stamp">Ready</span>' : '<span class="pencil">getting shady…</span>'}</li>`).join('')
        + (bots ? `<li class="polaroid empty bots" style="--tilt:${tilt[humans % 6]}deg"><div class="mug">${bots}</div><small>BOTS FILL THE REST</small></li>` : '');
    const opt = (v: string, label: string, cur: string) => `<option value="${v}" ${v === cur ? 'selected' : ''}>${label}</option>`;
    const preview = st.map === 'vote' ? `<div class="plan-wrap"><img class="plan" src="${thumbnail(layoutFor('museum', 1))}" alt=""><span class="plan-stamp">Crew votes</span></div>` : `<div class="plan-wrap"><img class="plan" src="${thumbnail(layoutFor(st.map, 1))}" alt="Floor plan of ${escape(mapDef(st.map).name)}"></div>`;
    ui.innerHTML = `<main class="screen board-screen"><header class="board-head"><span class="board-brand">PETTY THEFT<span>.</span></span><span class="board-case">CASE FILE · ${humans}/${MAX_PLAYERS} PLAYERS${bots ? ` + ${bots} BOTS` : ''}</span></header>`
        + `<section class="board"><svg class="board-string" aria-hidden="true"></svg>`
        + `<div class="note sticky"><i class="pin"></i><small>MEET AT ROOM</small><strong class="code">${s.code}</strong><small>Send this code to your crew.</small><button id="copy" class="text-button">Copy invitation</button></div>`
        + `<div class="note blueprint"><i class="pin" data-color="#f1c46a"></i><label>THE JOB</label>${preview}`
        + `<div class="settings"><label>Map<select id="set-map" ${host ? '' : 'disabled'}>${opt('vote', 'Crew votes', st.map)}${MAP_DEFS.map(m => opt(m.id, m.name.replace(' After Hours', ''), st.map)).join('')}</select></label>`
        + `<label>First to<select id="set-wins" ${host ? '' : 'disabled'}>${[1, 2, 3, 4, 5].map(n => opt(String(n), `${n} round${n > 1 ? 's' : ''}`, String(st.wins))).join('')}</select></label>`
        + `<label>Empty seats<select id="set-bots" ${host ? '' : 'disabled'}>${opt('on', 'Fill with bots', st.fillBots ? 'on' : 'off')}${opt('off', 'Humans only', st.fillBots ? 'on' : 'off')}</select></label></div>`
        + `<small>${host ? 'You set the job. Changing it resets everyone’s ready.' : 'The mastermind sets the job.'}</small></div>`
        + `<ol class="suspects" aria-label="The crew">${suspects}</ol>`
        + `<div class="note card"><i class="pin"></i><h2>How a match works</h2><ul>`
        + `<li>Two teams, picked at random. They swap between <b>thieves</b> and <b>police</b> every round; first team to ${st.wins} round wins takes the match.</li>`
        + `<li><b>Thieves</b> get ${25} seconds to hide. Turn into props, do tasks to unlock the exit, and escape — or just survive until closing.</li>`
        + `<li><b>Police</b> start locked in staging. Follow the whistles and catch every thief before time runs out.</li>`
        + `<li>Friends can join mid-match: they take over a bot’s seat and team.</li></ul>`
        + `<a class="guide-link" href="/how-to-play.html" target="_blank" rel="noopener">Full guide ↗</a></div>`
        + `<div class="board-actions"><button class="pixel-button primary" id="ready">${mine?.ready ? 'Not ready yet' : 'I’m in'}</button>`
        + (host ? '<button class="pixel-button" id="start">Start the match →</button>' : '<p class="waiting">The mastermind starts when everyone’s ready.</p>')
        + `<button id="leave" class="text-button">Leave crew</button><div class="error" role="alert"></div></div></section></main>${connectionBanner()}`;
    const set = (k: string) => (e: Event) => act(`settings:${k}:${(e.target as HTMLSelectElement).value}`);
    for (const k of ['map', 'wins', 'bots']) document.querySelector<HTMLSelectElement>('#set-' + k)!.onchange = set(k);
    document.querySelector<HTMLButtonElement>('#ready')!.onclick = () => { unlock(); act('ready'); };
    document.querySelector<HTMLButtonElement>('#start')?.addEventListener('click', () => act('start'));
    document.querySelector<HTMLButtonElement>('#leave')!.onclick = () => { leave(); screen = ''; render(); };
    document.querySelector<HTMLButtonElement>('#copy')!.onclick = () => { navigator.clipboard.writeText(`${location.origin} — PETTY THEFT room ${s.code}`).then(() => notice('Invitation copied.'), () => notice(`Share ${location.origin} and code ${s.code}`)); };
    requestAnimationFrame(drawString);
}
const myId = () => store.myId;
function drawString() {
    const board = document.querySelector<HTMLElement>('.board'), svg = board?.querySelector<SVGSVGElement>('.board-string');
    if (!board || !svg) return;
    const box = board.getBoundingClientRect(), at = (el: Element) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2 - box.left), y: Math.round(r.top + r.height / 2 - box.top) }; };
    const pins = Array.from(board.querySelectorAll<HTMLElement>('.pin')), target = board.querySelector('.blueprint .pin'), stacked = matchMedia('(max-width: 820px)').matches;
    const strings = target && !stacked ? pins.filter(p => p.closest('.polaroid:not(.empty)')).map(pin => { const a = at(pin), b = at(target), sag = Math.min(70, Math.hypot(b.x - a.x, b.y - a.y) * 0.14); return `<path d="M${a.x} ${a.y}Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + sag} ${b.x} ${b.y}"/>`; }) : [];
    const heads = pins.map(pin => { const { x, y } = at(pin), c = pin.dataset.color || '#c8412f'; return `<rect x="${x - 3}" y="${y - 1}" width="9" height="9" fill="#0007"/><rect x="${x - 5}" y="${y - 5}" width="9" height="9" fill="${c}"/><rect x="${x - 3}" y="${y - 3}" width="3" height="3" fill="#fffa"/>`; });
    svg.setAttribute('viewBox', `0 0 ${Math.round(box.width)} ${Math.round(box.height)}`);
    svg.innerHTML = `<g class="string-shadow">${strings.join('')}</g><g class="string">${strings.join('')}</g>${heads.join('')}`;
}
addEventListener('resize', drawString);

// ---- vote -------------------------------------------------------------------------------------------
function vote() {
    const s = store.state!, m = s.match!, mine = m.votes[myId()];
    const counts = (id: string) => Object.values(m.votes).filter(v => v === id).length;
    ui.innerHTML = `<main class="screen vote-screen"><header class="vote-head"><span class="board-brand">PICK THE NEXT JOB</span><span class="vote-clock" id="vote-clock"></span></header>`
        + `<p class="vote-sub">Round ${m.round} and ${m.round + 1} are played on this map: once as thieves, once as police.</p>`
        + `<div class="vote-cards">${MAP_DEFS.map(d => `<button class="vote-card${mine === d.id ? ' is-picked' : ''}" data-map="${d.id}"><img src="${thumbnail(layoutFor(d.id, 1))}" alt=""><b>${d.name}</b><small>${d.blurb}</small><span class="votes">${counts(d.id)} vote${counts(d.id) === 1 ? '' : 's'}</span></button>`).join('')}</div>`
        + `<div class="toast radio" hidden><span class="radio-tag">SECURITY RADIO</span><p class="radio-text"></p></div></main>`;
    document.querySelectorAll<HTMLButtonElement>('[data-map]').forEach(b => b.onclick = () => { play('click'); act('vote:' + b.dataset.map); });
}
function voteClock(s: State) { const c = document.querySelector('#vote-clock'); if (c) c.textContent = `${Math.ceil(s.phaseTime)}s`; }

// ---- in game ----------------------------------------------------------------------------------------
function game() {
    const p = me(), police = p?.role === 'police';
    const btn = (act: string, key: string, label: string, id = act) => `<button class="ability" data-act="${act}" id="ab-${id}"><span class="key">${key}</span><span class="ab-label">${label}</span><span class="ab-meta" id="meta-${id}"></span></button>`;
    ui.innerHTML = `<div class="rotate-hint"><span class="rotate-phone" aria-hidden="true"></span>Turn your phone sideways<small>This heist plays in landscape.</small></div>`
        + `<div class="scorebar" id="scorebar"></div>`
        + `<div class="role-card" id="role-card"></div>`
        + `<div class="hud-side"><canvas id="minimap" width="176" height="108" aria-label="Map"></canvas><span id="district"></span><div class="hud-buttons"><button id="settings" class="icon-button" aria-label="Sound and music">♪</button><button id="help" class="icon-button" aria-label="How to play">?</button></div></div>`
        + `<div class="objective-bar" id="objective-bar"></div>`
        + `<div class="abilities" id="abilities">${police ? btn('fire', 'CLICK', 'Fire') + btn('stun', 'Q', 'Stun') : btn('disguise', 'Q', 'Copy') + btn('rotate', 'R', 'Mirror') + btn('task', 'E', 'Task') + btn('decoy', 'F', 'Decoy') + btn('smoke', 'SPACE', 'Smoke')}</div>`
        + (police ? `<div class="heat" id="heat"><span>BLASTER</span><i id="heat-bar"></i></div>` : '')
        + `<div class="sound-arrows" id="sound-arrows" aria-hidden="true"></div>`
        + `<div class="spectating" id="spectating" hidden></div>`
        + `<div class="toast radio" hidden><span class="radio-tag">SECURITY RADIO</span><p class="radio-text"></p></div>`
        + `<div class="joystick"><div class="stick"></div></div>${police ? '<div class="aimstick"><div class="stick"></div><span>AIM</span></div>' : ''}`
        + `<div class="phase-overlay" id="overlay" hidden></div>${connectionBanner()}`;
    document.querySelectorAll<HTMLButtonElement>('[data-act]').forEach(b => b.onclick = () => input.action(b.dataset.act!));
    document.querySelector<HTMLButtonElement>('#help')!.onclick = showHelp;
    document.querySelector<HTMLButtonElement>('#settings')!.onclick = showSettings;
    stick(document.querySelector('.joystick')!, v => { input.stick = v ?? { x: 0, y: 0 }; });
    const aim = document.querySelector<HTMLElement>('.aimstick');
    if (aim) stick(aim, v => { if (v && Math.hypot(v.x, v.y) > 0.25) input.aimStick = v; else if (!v && input.aimStick) { input.action('fire'); input.aimStick = null; } });
    lastOverlay = '';
}
/** A thumbstick: reports a direction while held and null on release. */
function stick(el: HTMLElement, onMove: (v: { x: number; y: number } | null) => void) {
    let id: number | null = null;
    const knob = el.querySelector<HTMLElement>('.stick')!;
    const update = (e: PointerEvent) => { const r = el.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, n = Math.max(40, Math.hypot(dx, dy)); const v = { x: dx / n, y: dy / n }; knob.style.transform = `translate(${v.x * 32}px,${v.y * 32}px)`; onMove(v); };
    el.onpointerdown = e => { unlock(); id = e.pointerId; el.setPointerCapture(id); update(e); };
    el.onpointermove = e => { if (e.pointerId === id) update(e); };
    el.onpointerup = el.onpointercancel = () => { id = null; knob.style.transform = ''; onMove(null); };
}

let lastOverlay = '';
function hud(s: State) {
    const m = s.match!, p = me(), def = mapDef(m.mapId), l = layoutFor(m.mapId, m.seed);
    const myTeam = p?.team, role = p?.role ?? roleFor(myTeam ?? 'A', m.round), next = myTeam ? roleFor(myTeam, m.round + 1) : role;
    const phaseLabel = s.phase === 'briefing' ? 'BRIEFING' : s.phase === 'prep' ? 'HIDE!' : s.phase === 'play' ? 'LIVE' : 'ROUND OVER';
    const team = (t: TeamId) => `<span class="team${t === myTeam ? ' is-mine' : ''}" style="--team:${TEAM_COLORS[t]}"><i></i><span>${TEAM_NAMES[t]}</span><b>${m.scores[t]}</b><small>${roleFor(t, m.round) === 'thief' ? 'THIEVES' : 'POLICE'}</small></span>`;
    set('#scorebar', `${team('A')}<span class="round"><small>ROUND ${m.round} · FIRST TO ${s.settings.wins}</small><strong class="${s.phase === 'play' && s.phaseTime <= 30 ? 'urgent' : ''}">${clock(s.phaseTime)}</strong><small>${phaseLabel}</small></span>${team('B')}`);
    const objective = !p ? '' : p.spectator ? 'You join the game next round. Watch your team for now.' : p.captured ? 'Caught! Watching your team. Tab or tap to switch.' : p.escaped ? 'You escaped! Watching the rest of your crew.'
        : role === 'thief' ? (s.phase === 'prep' ? 'Hide! Find a prop, press Q to copy it, and stand still.' : s.exitOpen ? 'The exit is open: get out, or stay hidden until closing.' : 'Stay hidden. Do tasks to open the exit, or survive until closing.')
        : s.phase === 'prep' ? 'Locked in staging while the thieves hide.' : s.exitOpen ? 'The exit is open! Guard it and catch anyone heading there.' : 'Follow the whistles. Shoot what shouldn’t be there.';
    set('#role-card', `<span class="role-name role-${role}">${ROLE_NAME[role]}</span><span class="role-team" style="--team:${TEAM_COLORS[myTeam ?? 'A']}">${myTeam ? TEAM_NAMES[myTeam] : ''}</span><small>Next round: ${ROLE_NAME[next]}</small><p>${objective}</p>`);
    const done = s.tasks.filter(t => t.done).length;
    set('#objective-bar', `<span class="tasks-label">TASKS</span>${Array.from({ length: s.required }, (_, i) => `<i class="${i < done ? 'is-done' : ''}"></i>`).join('')}<span>${done}/${s.required}</span><span class="exit-state ${s.exitOpen ? 'is-open' : ''}">${s.exitOpen ? 'EXIT OPEN' : 'EXIT LOCKED'}</span><span class="free">${s.players.filter(q => q.role === 'thief' && !q.spectator && !q.captured && !q.escaped).length} THIEVES FREE</span>`);
    const d = document.querySelector('#district'); const focus = p && !p.hidden ? p : undefined;
    if (d) d.textContent = focus ? districtAt(l, focus).toUpperCase() : def.name.toUpperCase();
    minimap(s, l);
    abilities(s, p);
    soundArrows(s, p);
    const spec = document.querySelector<HTMLElement>('#spectating');
    if (spec) { spec.hidden = !(p && (p.captured || p.escaped || p.spectator)); spec.innerHTML = 'SPECTATING · <button class="text-button" id="next-cam">Next teammate ›</button>'; spec.querySelector<HTMLButtonElement>('#next-cam')!.onclick = () => input.action('spectate'); }
    overlay(s, p);
}
const set = (sel: string, html: string) => { const e = document.querySelector<HTMLElement>(sel); if (e && e.dataset.html !== html) { e.innerHTML = html; e.dataset.html = html; } };

function abilities(s: State, p?: Player) {
    if (!p) return;
    const meta = (id: string, text: string, disabled = false) => { const b = document.querySelector<HTMLButtonElement>('#ab-' + id); if (!b) return; set('#meta-' + id, text); b.disabled = disabled; };
    const out = p.captured || p.escaped || p.spectator || (s.phase !== 'play' && s.phase !== 'prep');
    if (p.role === 'police') {
        meta('fire', p.lockedFor > 0 ? `HOT ${Math.ceil(p.lockedFor)}s` : '', out || s.phase !== 'play' || p.lockedFor > 0);
        meta('stun', p.stunCooldown > 0 ? `${Math.ceil(p.stunCooldown)}s` : `×${p.stuns}`, out || s.phase !== 'play' || p.stuns <= 0 || p.stunCooldown > 0);
        const bar = document.querySelector<HTMLElement>('#heat-bar'); if (bar) { bar.style.width = `${Math.round(p.heat * 100)}%`; bar.classList.toggle('is-locked', p.lockedFor > 0); }
        return;
    }
    meta('disguise', p.cooldown > 0 ? `${Math.ceil(p.cooldown)}s` : p.disguise ? 'ON' : '', out || (p.cooldown > 0 && !p.disguise));
    meta('rotate', '', out || !p.disguise);
    meta('task', p.task ? 'CANCEL' : '', out || s.phase !== 'play');
    meta('decoy', `×${p.decoys}`, out || s.phase !== 'play' || p.decoys <= 0);
    meta('smoke', `×${p.smokes}`, out || s.phase !== 'play' || p.smokes <= 0);
    void DISGUISE; void DECOY; void SMOKE; void STUN;
}

/** Each recent sound as an arrow around the screen edge: direction and loudness, never a spot. */
function soundArrows(s: State, p?: Player) {
    const box = document.querySelector<HTMLElement>('#sound-arrows');
    if (!box) return;
    const from = p && !p.hidden && !p.captured && !p.escaped ? p : undefined;
    if (!from) { set('#sound-arrows', ''); return; }
    const html = s.sounds.filter(n => n.age < 2.2 && n.owner !== store.myId && Math.hypot(n.x - from.x, n.y - from.y) < CUE.range).map(n => {
        const a = Math.atan2(n.y - from.y, n.x - from.x), d = Math.hypot(n.x - from.x, n.y - from.y), loud = Math.max(0.25, 1 - d / CUE.range);
        const x = 50 + Math.cos(a) * 44, y = 50 + Math.sin(a) * 40, label = n.kind === 'whistle' ? '♪' : '♫';
        return `<span class="sound-arrow" style="left:${x}%;top:${y}%;opacity:${(loud * (1 - n.age / 2.2)).toFixed(2)};--a:${a}rad;--s:${(0.7 + loud * 0.6).toFixed(2)}"><i></i>${label}</span>`;
    }).join('');
    set('#sound-arrows', html);
}

const minimapBase = new Map<string, HTMLCanvasElement>();
function minimap(s: State, l: Layout) {
    const c = document.querySelector<HTMLCanvasElement>('#minimap');
    if (!c) return;
    const key = l.def.id + l.seed;
    let base = minimapBase.get(key);
    if (!base) {
        base = document.createElement('canvas'); base.width = l.cols * 2; base.height = l.rows * 2;
        const g = base.getContext('2d')!;
        for (let y = 0; y < l.rows; y++) for (let x = 0; x < l.cols; x++) { const t = l.type[y * l.cols + x]; g.fillStyle = t === FLOOR ? '#3a4334' : t === 2 ? '#262c22' : '#0b0d0a'; g.fillRect(x * 2, y * 2, 2, 2); }
        minimapBase.set(key, base);
    }
    const g = c.getContext('2d')!, p = me();
    g.imageSmoothingEnabled = false;
    g.drawImage(base, 0, 0);
    const z = (r: number[], col: string) => { g.fillStyle = col; g.fillRect(r[0] * 2, r[1] * 2, r[2] * 2, r[3] * 2); };
    z(l.def.exitZone, s.exitOpen ? '#7fd67a' : '#7a2e2a');
    for (const t of s.tasks) { g.fillStyle = t.done ? '#5d5b4d' : '#f1c46a'; g.fillRect(t.x / CELL * 2 - 1, t.y / CELL * 2 - 1, 3, 3); }
    // Only your own team on the minimap, never the other side.
    for (const q of s.players) {
        if (q.hidden || q.captured || q.escaped || q.spectator || (p && q.team !== p.team)) continue;
        g.fillStyle = q.id === store.myId ? '#ffffff' : TEAM_COLORS[q.team ?? 'A'];
        g.fillRect(q.x / CELL * 2 - 1.5, q.y / CELL * 2 - 1.5, q.id === store.myId ? 4 : 3, q.id === store.myId ? 4 : 3);
    }
}

function overlay(s: State, p?: Player) {
    const el = document.querySelector<HTMLElement>('#overlay');
    if (!el) return;
    const m = s.match!, def = mapDef(m.mapId), role = p?.role ?? 'thief', tt = thiefTeam(m.round);
    let html = '', key = s.phase;
    if (s.phase === 'briefing') {
        key += m.round;
        const bullets = role === 'thief'
            ? ['You have <b>25 seconds</b> to hide before the police are released.', 'Walk up to a prop and press <b>Q</b> to look exactly like it. <b>R</b> mirrors it to match its neighbours.', 'Every 25–35 s you <b>whistle</b>. Watch the countdown and move before the police arrive.', `Do <b>${s.required} tasks</b> to open the exit, then escape. Or just survive until closing.`]
            : ['You’re locked in <b>staging</b> while the thieves hide.', 'Thieves look exactly like props. Follow their <b>whistles</b> (arrows on the screen edge).', 'Aim and <b>click</b> to fire. Shooting a real prop heats your blaster; too hot and it locks.', 'Catch <b>every</b> thief before time runs out. <b>Q</b> stuns nearby thieves and makes disguises wobble.'];
        html = `<div class="brief-card role-${role}"><small>ROUND ${m.round} · ${def.name.toUpperCase()}</small><h2>You are ${role === 'thief' ? 'a thief' : 'the police'}</h2><p class="brief-team" style="--team:${TEAM_COLORS[p?.team ?? 'A']}">${p?.team ? TEAM_NAMES[p.team] : ''} · next round you swap to ${ROLE_NAME[roleFor(p?.team ?? 'A', m.round + 1)].toLowerCase()}</p><ul>${bullets.map(b => `<li>${b}</li>`).join('')}</ul><strong class="brief-count">${Math.ceil(s.phaseTime)}</strong></div>`;
    } else if (s.phase === 'prep') {
        html = `<div class="prep-banner role-${role}">${role === 'thief' ? `HIDE! Police released in <b>${Math.ceil(s.phaseTime)}</b>` : `Locked in staging · <b>${Math.ceil(s.phaseTime)}</b>`}</div>`;
    } else if (s.phase === 'roundEnd') {
        const r = m.results.at(-1)!;
        key += r.round;
        const thievesWon = r.winnerRole === 'thief', mineWon = p?.team === r.winner;
        const rows = s.players.filter(q => !q.spectator).sort((a, b) => (a.team === b.team ? 0 : a.team === r.winner ? -1 : 1)).map(q => {
            const rs = q.roundStats?.round === m.round ? q.roundStats : undefined;
            return `<li style="--team:${TEAM_COLORS[q.team ?? 'A']}"><i></i><b>${escape(q.name)}${q.bot ? ' <em>BOT</em>' : ''}</b><span>${q.role === 'police' ? `${rs?.captures ?? 0} caught` : q.escaped ? 'escaped' : q.captured ? 'caught' : 'survived'}${q.role === 'thief' && rs?.tasks ? ` · ${rs.tasks} task${rs.tasks > 1 ? 's' : ''}` : ''}</span></li>`;
        }).join('');
        html = `<div class="round-card ${thievesWon ? 'thieves' : 'police'} ${mineWon ? 'won' : 'lost'}"><span class="round-stamp">${thievesWon ? 'Clean getaway' : 'Case closed'}</span><small>ROUND ${m.round} · ${TEAM_NAMES[r.winner].toUpperCase()} WIN AS ${thievesWon ? 'THIEVES' : 'POLICE'}</small><h2>${escape(r.reason[0].toUpperCase() + r.reason.slice(1))}</h2>`
            + (r.highlights.length ? `<p class="highlights">${r.highlights.map(escape).join(' · ')}</p>` : '')
            + `<ol class="round-rows">${rows}</ol><p class="next-up">${m.scores.A >= s.settings.wins || m.scores.B >= s.settings.wins ? 'Final scores next…' : `Next: round ${m.round + 1} — the ${TEAM_NAMES[otherTeam(tt)]} become thieves. ${Math.ceil(s.phaseTime)}s`}</p></div>`;
        if (key !== lastOverlay) play(mineWon ? 'win' : 'lose');
    }
    el.hidden = !html;
    if (html !== el.dataset.html) { el.innerHTML = html; el.dataset.html = html; }
    if (key !== lastOverlay && s.phase === 'briefing') play('click');
    lastOverlay = key;
}

/** The radio box types out the latest message, a few letters at a time (instantly with reduced motion). */
function radio() {
    const box = document.querySelector<HTMLElement>('.toast'), text = document.querySelector<HTMLElement>('.radio-text');
    if (!box || !text) return;
    const now = Date.now();
    box.hidden = now > toastUntil || !toast;
    const shown = reducedMotion ? toast.length : Math.min(toast.length, Math.floor((now - toastAt) / 22)), line = toast.slice(0, shown);
    if (text.textContent !== line) text.textContent = line;
    box.classList.toggle('is-typing', shown < toast.length);
}

// ---- match end --------------------------------------------------------------------------------------
function matchEnd() {
    const s = store.state!, m = s.match!, p = me(), w = m.winner ?? 'A', won = p?.team === w;
    const crew = s.players.filter(q => q.team);
    const mvp = (key: 'captures' | 'tasks' | 'escapes') => crew.slice().sort((a, b) => b.stats[key] - a.stats[key])[0];
    const winners = crew.filter(q => q.team === w).slice(0, 4);
    const photo = pixelScene(96, 40, [{ frame: 'van', x: 70, y: 36 }, ...winners.flatMap((q, i) => person(14 + i * 13, 37, q.color, i % 2 ? 'police' : 'thief'))]);
    const rows = crew.sort((a, b) => (a.team === w ? -1 : 1) - (b.team === w ? -1 : 1) || b.stats.captures + b.stats.tasks - a.stats.captures - a.stats.tasks).map(q => `<li><i style="background:${TEAM_COLORS[q.team!]}"></i><b>${escape(q.name)}${q.id === myId() ? ' <em>(you)</em>' : ''}${q.bot ? ' <em>[bot]</em>' : ''}</b><span>${q.stats.captures} caught · ${q.stats.tasks} tasks · ${q.stats.escapes} escapes · ${q.stats.survived}s hidden</span><small>${TEAM_NAMES[q.team!]}</small></li>`).join('');
    const top = [mvp('captures'), mvp('tasks'), mvp('escapes')];
    ui.innerHTML = `<main class="screen paper-screen ${won ? 'victory' : 'defeat'}"><article class="paper">`
        + `<header class="masthead"><span>LATE EDITION</span><h1>The Petty Gazette</h1><span>ROOM ${s.code} · 2¢</span></header>`
        + `<p class="dateline">${m.results.length} rounds · ${[...new Set(m.results.map(r => r.map))].join(' · ')}</p>`
        + `<div class="paper-body"><div class="story"><h2 class="headline">${TEAM_NAMES[w]} win ${m.scores[w]}–${m.scores[otherTeam(w)]}</h2><p class="deck">${m.results.map(r => `Round ${r.round}: ${TEAM_NAMES[r.winner]} (${r.winnerRole === 'thief' ? 'getaway' : 'case closed'})`).join(' · ')}.</p>`
        + `<figure class="photo photo-street"><img src="${photo}" alt=""><figcaption>The ${TEAM_NAMES[w]}, celebrating in a manner police describe as “smug”.</figcaption>${p?.team ? `<span class="verdict">${won ? 'Champions' : 'Rematch?'}</span>` : ''}</figure>`
        + `<p class="mvps">${top[0]?.stats.captures ? `Top cop: <b>${escape(top[0].name)}</b> (${top[0].stats.captures} caught). ` : ''}${top[1]?.stats.tasks ? `Busiest saboteur: <b>${escape(top[1].name)}</b> (${top[1].stats.tasks} tasks). ` : ''}${top[2]?.stats.escapes ? `Escape artist: <b>${escape(top[2].name)}</b>.` : ''}</p></div>`
        + `<aside class="persons"><h3>Persons of interest</h3><ol>${rows}</ol>`
        + `<div class="paper-actions">${s.host === myId() ? '<button class="pixel-button primary" id="rematch">Rematch →</button><button class="text-button" id="to-lobby">Back to the planning board</button>' : '<p class="waiting">Waiting for the mastermind: rematch or back to the board.</p>'}`
        + `<button id="results-leave" class="text-button">Leave room</button></div></aside></div></article></main>`;
    document.querySelector('#rematch')?.addEventListener('click', () => act('rematch'));
    document.querySelector('#to-lobby')?.addEventListener('click', () => act('lobby'));
    document.querySelector<HTMLButtonElement>('#results-leave')!.onclick = () => { leave(); screen = ''; render(); };
    play(won ? 'win' : 'lose');
}

// ---- help & settings --------------------------------------------------------------------------------
function showHelp() {
    if (help) return;
    help = true;
    const d = document.createElement('div');
    d.className = 'help'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'help-title');
    d.innerHTML = '<header><h2 id="help-title">How to play</h2><button id="close-help" class="text-button">Close ×</button></header>'
        + '<p class="help-intro">Two teams swap between thieves and police every round. First to the target number of round wins takes the match.</p>'
        + '<div class="help-cols"><section><h3>Thieves</h3><ul>'
        + `<li>Copy a nearby prop with <kbd>Q</kbd>; <kbd>R</kbd> mirrors it. Moving is allowed, but a prop that slides around gets noticed. <kbd>Z</kbd> drops the disguise.</li>`
        + `<li>You whistle every 25–35 seconds; a countdown warns you. The police hear roughly where.</li>`
        + `<li><kbd>E</kbd> works a task (stand still). Enough tasks open the exit: everyone left escaping wins the round.</li>`
        + `<li><kbd>F</kbd> drops a decoy that makes fake noises (×${DECOY.uses}). <kbd>SPACE</kbd> throws smoke and gives you a burst of speed (once a round).</li>`
        + '<li>Survive until closing with even one thief free and your team wins the round.</li></ul></section>'
        + '<section><h3>Police</h3><ul>'
        + '<li>Locked in staging for 25 seconds while the thieves hide.</li>'
        + '<li>Aim with the mouse (or the right stick) and <kbd>CLICK</kbd> / <kbd>SPACE</kbd> to fire. Walls stop shots.</li>'
        + '<li>Shooting a real prop heats the blaster; too hot and it locks for a few seconds.</li>'
        + `<li><kbd>Q</kbd> or right-click: a stun pulse that freezes nearby thieves and makes disguises wobble (×${STUN.uses}).</li>`
        + '<li>Arrows at the screen edge show which way you heard a whistle. Catch every thief to win.</li></ul></section></div>'
        + `<p class="help-keys"><span><kbd>WASD</kbd> move</span><span><kbd>TAB</kbd> next camera when out</span><span><kbd>H</kbd> this help</span></p>`
        + '<footer><button id="touch-toggle" class="text-button">Toggle touch controls</button><a class="text-button" href="/how-to-play.html" target="_blank" rel="noopener">Full guide ↗</a><button id="leave-game" class="text-button">Leave match</button></footer>';
    const close = () => { d.remove(); help = false; document.removeEventListener('keydown', onKey); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    d.querySelector<HTMLButtonElement>('#close-help')!.onclick = close;
    d.querySelector<HTMLButtonElement>('#leave-game')!.onclick = () => { close(); leave(); screen = ''; render(); };
    d.querySelector<HTMLButtonElement>('#touch-toggle')!.onclick = () => { document.body.classList.toggle('touch'); close(); };
    ui.append(d);
    d.querySelector<HTMLButtonElement>('#close-help')!.focus();
}
function showSettings() {
    if (document.querySelector('.settings-pop')) return;
    const d = document.createElement('div');
    d.className = 'settings-pop'; d.setAttribute('role', 'dialog'); d.setAttribute('aria-label', 'Sound settings');
    d.innerHTML = `<label>Sound effects<input type="range" min="0" max="1" step="0.05" value="${volume.sound}" id="vol-sound"></label><label>Music<input type="range" min="0" max="1" step="0.05" value="${volume.music}" id="vol-music"></label><button class="text-button" id="close-settings">Done</button>`;
    ui.append(d);
    d.querySelector<HTMLInputElement>('#vol-sound')!.oninput = e => { setVolume('sound', Number((e.target as HTMLInputElement).value)); play('click'); };
    d.querySelector<HTMLInputElement>('#vol-music')!.oninput = e => setVolume('music', Number((e.target as HTMLInputElement).value));
    d.querySelector<HTMLButtonElement>('#close-settings')!.onclick = () => d.remove();
}
void TASK;
