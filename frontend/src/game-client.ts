import {createMuseumFloor, PX} from './museum-textures';
import {PIXEL_ATLAS, PIXEL_FRAMES} from './pixel-atlas';
import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { MAPS, predictPosition, WORLD, walls, props, lootSeeds, VAN, LOCK, NOISE, COLORS, HEAD_START, MISS_COOLDOWN, dist, lightPolygon, pickTarget, los as baseLos, type State, type Player, type Point } from '../../shared/world';
import './styles.css';
function los(a:Point,b:Point){return baseLos(a,b,state?.geometry||walls);}
const ui = document.querySelector<HTMLDivElement>('#ui')!;
const socket = io((import.meta as any).env.VITE_SERVER_URL || undefined, { autoConnect: true });
let snapshotAt=performance.now();
let state: State | null = null, myId = '', selectedColor = COLORS[0], screen = '', toast = '', toastUntil = 0, muted = localStorage.getItem('petty-muted') === '1', help = false;
/** Flashlight direction for the local cop: the mouse once it has moved, otherwise the movement direction. */
let aim = Math.PI / 2, usingMouse = false, localPos: Point | null = null;
let desired: Point = { x: 0, y: 0 }, stick: Point = { x: 0, y: 0 }, saved: {
    code: string;
    token: string;
    name: string;
} | null = null;
try {
    saved = JSON.parse(sessionStorage.getItem('petty-session') || 'null');
}
catch { }
const escape = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
const me = () => state?.players.find(p => p.id === myId);
let audio: AudioContext | null = null;
function tone(f = 440) { if (muted)
    return; try {
    audio ??= new AudioContext();
    void audio.resume();
    const o = audio.createOscillator(), g = audio.createGain();
    o.connect(g);
    g.connect(audio.destination);
    o.frequency.setValueAtTime(f, audio.currentTime);
    o.frequency.exponentialRampToValueAtTime(f * .6, audio.currentTime + .12);
    g.gain.setValueAtTime(.05, audio.currentTime);
    g.gain.exponentialRampToValueAtTime(.001, audio.currentTime + .17);
    o.start();
    o.stop(audio.currentTime + .18);
}
catch { } }
/** When the current radio message arrived, for its typewriter reveal. */
let toastAt = 0;
function notice(s: string) { toast = s; toastUntil = Date.now() + 5000; toastAt = Date.now(); const e = document.querySelector('.error'); if (e)
    e.textContent = s; }
function action(a: string) {
    const p = me();
    if (p?.role === 'cop' && state?.phase === 'playing') {
        if (a === 'transform' || a === 'drop')
            return;
        if (a === 'interact') {
            if ((state.headStart || 0) > 0 || p.cooldown > 0)
                return;
            const t = arrestTarget();
            if (!t) {
                notice('Point your flashlight at a suspect first.');
                return;
            }
            a = 'arrest:' + t.id;
        }
    }
    tone(a === 'transform' ? 660 : 360); socket.emit('action', a); }
/** What the local cop's flashlight is pointed at: a prop (real or a disguised thief) or a visible thief. */
function arrestTarget() {
    const p = me();
    if (!p || !state || p.role !== 'cop' || state.phase !== 'playing' || (state.headStart || 0) > 0)
        return;
    const candidates = [
        ...(state.visibleProps || []).map(q => ({ id: q.id, x: q.x, y: q.y, label: 'the ' + q.kind })),
        ...state.players.filter(q => q.role !== 'cop' && !q.hidden && !q.disguise && q.connected && !q.spectator && !q.captured && !q.escaped).map(q => ({ id: q.id, x: q.x, y: q.y, label: q.name }))
    ];
    return pickTarget(localPos || p, aim, candidates, state.geometry || walls);
}
function join(create: boolean) { const name = (document.querySelector<HTMLInputElement>('#name')?.value || '').trim(); const code = (document.querySelector<HTMLInputElement>('#code')?.value || '').trim().toUpperCase(); if (!name) {
    notice('Every art criminal needs a name.');
    return;
} socket.emit('join', { create, code, name, color: selectedColor }, (r: any) => { if (r.error) {
    notice(r.error);
    return;
} myId = r.id; saved = { token: r.token, code: r.code, name }; sessionStorage.setItem('petty-session', JSON.stringify(saved)); remember.set('petty-alias', name); tone(); }); }
socket.on('connect', () => { document.querySelector('.connection')?.remove(); if (saved)
    socket.emit('join', { code: saved.code, token: saved.token, name: saved.name }, (r: any) => { if (r.error) {
        saved = null;
        sessionStorage.removeItem('petty-session');
        state = null;
        screen = '';
        render();
        notice(r.error);
    }
    else
        myId = r.id; }); });
socket.on('disconnect', () => { if (!document.querySelector('.connection')) {
    const d = document.createElement('div');
    d.className = 'connection';
    d.textContent = 'Connection lost. Reconnecting… your loot has been dropped safely.';
    ui.append(d);
} });
socket.on('notice', notice);
socket.on('state', (s: State) => { snapshotAt=performance.now(); if (s.message && s.message !== state?.message) {
    notice(s.message);
    tone(520);
} const old = me(); const next = s.players.find(p => p.id === myId); if (old && next && old.captured !== next.captured)
    tone(next.captured ? 140 : 800); state = s; render(); });
function target() { const p = me(); if (!p || !state)
    return 'Interact'; if(p.role==='cop'){ if((state.headStart||0)>0) return `Eyes closed · ${Math.ceil(state.headStart!)}s`; if(p.cooldown>0) return `Arrest · ${Math.ceil(p.cooldown)}s`; const t=arrestTarget(); return t?`Arrest ${t.label}`:'Aim at a suspect'; }
    if (p.captured)
    return 'Await rescue'; if (p.escaped || p.spectator)
    return 'Spectating'; const carried = state.loot.filter(l => l.carriers.includes(myId)); if (dist(p, VAN) < 125)
    return carried.length ? 'Deposit loot' : state.total >= state.quota ? 'Escape in van' : 'Van · quota not met'; if (dist(p, LOCK) < 95 && state.players.some(q => q.captured))
    return p.rescue > 0 ? `Picking lock · ${Math.ceil(3 - p.rescue)}s` : 'Rescue crew · 3s'; if (dist(p, NOISE) < 90)
    return state.noiseCooldown > 0 ? `Noise · ${Math.ceil(state.noiseCooldown)}s` : 'Play gramophone'; const l = state.loot.find(l => !l.deposited && !l.carriers.includes(myId) && dist(p, l) < 80 && los(p, l) && l.carriers.length < (l.large ? 2 : 1)); return l ? l.large ? (l.carriers.length ? 'Help carry painting' : 'Lift painting · partner needed') : 'Pocket treasure · $200' : 'Explore the museum'; }
function transformLabel() { const p = me(); if (!p)
    return 'Disguise';
    if(p.role==='cop')return 'Officer · no disguise'; if (state?.loot.some(l => l.large && l.carriers.includes(myId)))
    return 'Drop painting to hide'; if (p.cooldown > 0)
    return `Disguise · ${p.cooldown.toFixed(1)}s`; if (p.disguise)
    return 'Become thief'; const prop = props.filter(q => dist(p, q) < 100 && los(p, q)).sort((a, b) => dist(a, p) - dist(b, p))[0]; return prop ? 'Copy ' + prop.kind : 'Find a prop'; }
function render() { const phase = state?.phase || 'home'; const key = phase + ((phase === 'lobby' || phase === 'results') ? JSON.stringify(state?.players.map(p => [p.id, p.ready, p.connected, p.name])) + state?.host + state?.selectedMap : ''); if (screen !== key) {
    help = false;
    screen = key;
    if (phase === 'home')
        home();
    else if (phase === 'lobby')
        lobby();
    else if (phase === 'results')
        results();
    else
        playing();
} if (phase === 'playing')
    updateHud(); }
function brand() { return '<div class="brand">PETTY<span> THEFT.</span></div>'; }
/** Remembered between visits so returning players can hit Enter and go. */
const remember = { get: (k: string) => { try { return localStorage.getItem(k) || ''; } catch { return ''; } }, set: (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { } } };
if (COLORS.includes(remember.get('petty-color'))) selectedColor = remember.get('petty-color');
/** Title screen: a text menu in the dark, navigated with the mouse or arrow keys + Enter. */
function home() {
    ui.innerHTML = `<main class="screen title-screen">
<section class="title-menu">
  <h1 class="title-mark">PETTY THEFT<span>.</span></h1>
  <svg class="title-rule" viewBox="0 0 200 4" preserveAspectRatio="none" shape-rendering="crispEdges" aria-hidden="true"><rect x="0" y="2" width="200" height="1" fill="currentColor" opacity=".3"/><rect x="0" y="1" width="150" height="2" fill="currentColor" opacity=".55"/><rect x="0" y="0" width="64" height="3" fill="currentColor" opacity=".9"/><rect x="0" y="0" width="10" height="3" fill="#f1c46a"/></svg>
  <p class="title-tag">Good art. Bad intent. Prop hunt in a dark museum, for 2–6 friends.</p>
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
</main>`;
    const name = document.querySelector<HTMLInputElement>('#name')!, code = document.querySelector<HTMLInputElement>('#code')!;
    const joinCrew = () => { if (code.value.trim().length < 4) { code.focus(); notice('Type the four-letter code from your crew.'); return; } join(false); };
    document.querySelector('#create')!.addEventListener('click', () => join(true));
    document.querySelector('#join')!.addEventListener('click', joinCrew);
    code.addEventListener('keydown', e => { if (e.key === 'Enter') joinCrew(); });
    name.addEventListener('keydown', e => { if (e.key === 'Enter') document.querySelector<HTMLElement>('#create')!.focus(); });
    document.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(b => b.onclick = () => {
        selectedColor = b.dataset.color!;
        remember.set('petty-color', selectedColor);
        document.querySelectorAll<HTMLButtonElement>('.swatch').forEach(s => { s.classList.toggle('selected', s === b); s.setAttribute('aria-checked', String(s === b)); });
    });
    // Arrow keys walk the alias field and the menu; the join row counts as one stop whether its button or code box has focus.
    document.querySelector('.title-screen')!.addEventListener('keydown', e => {
        const k = (e as KeyboardEvent).key;
        if (k !== 'ArrowDown' && k !== 'ArrowUp') return;
        const stops = [name, ...Array.from(document.querySelectorAll<HTMLElement>('[data-nav]'))];
        const at = stops.indexOf(document.activeElement === code ? document.querySelector<HTMLElement>('#join')! : document.activeElement as HTMLElement);
        e.preventDefault();
        const next = stops[at < 0 ? 1 : (at + (k === 'ArrowDown' ? 1 : -1) + stops.length) % stops.length];
        next.focus();
        select(next.closest('.menu-item'));
    });
    // The diamond cursor marks one menu item at a time, like an old console menu: it follows keyboard focus
    // and the mouse, and stays put when you go back to edit your alias.
    const items = Array.from(document.querySelectorAll<HTMLElement>('.title-options .menu-item'));
    const select = (item?: Element | null) => { if (item) items.forEach(i => i.classList.toggle('is-selected', i === item)); };
    document.querySelector('.title-options')!.addEventListener('focusin', e => select((e.target as Element).closest('.menu-item')));
    items.forEach(i => i.addEventListener('mouseenter', () => select(i)));
    select(items[0]);
    (name.value ? document.querySelector<HTMLElement>('#create')! : name).focus({ preventScroll: true });
}
/** The pixel atlas as a DOM image, for drawing sprites into the lobby's mugshots and the newspaper photo. */
const atlasImage = new Image();
atlasImage.src = PIXEL_ATLAS;
atlasImage.onload = () => { if (state?.phase === 'lobby' || state?.phase === 'results') { screen = ''; render(); } };
/** A sprite placed in a pixel scene: bottom-centre at (x, y) in art pixels, optionally tinted. */
type Placed = { frame: string; x: number; y: number; tint?: string };
const scenes = new Map<string, string>();
/** Draws sprites from the atlas into a small canvas and returns it as a data URL (CSS scales it up crisply). */
function pixelScene(w: number, h: number, items: Placed[]) {
    if (!atlasImage.naturalWidth) return '';
    const key = w + 'x' + h + JSON.stringify(items);
    let url = scenes.get(key);
    if (url) return url;
    const canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const out = canvas.getContext('2d')!;
    for (const item of items) {
        const [sx, sy, fw, fh] = PIXEL_FRAMES[item.frame], dx = Math.round(item.x - fw / 2), dy = item.y - fh;
        if (!item.tint) { out.drawImage(atlasImage, sx, sy, fw, fh, dx, dy, fw, fh); continue; }
        // Tint a grey layer: multiply by the colour, then cut back to the layer's own shape.
        const layer = document.createElement('canvas');
        layer.width = fw; layer.height = fh;
        const l = layer.getContext('2d')!;
        l.drawImage(atlasImage, sx, sy, fw, fh, 0, 0, fw, fh);
        l.globalCompositeOperation = 'multiply'; l.fillStyle = item.tint; l.fillRect(0, 0, fw, fh);
        l.globalCompositeOperation = 'destination-in'; l.drawImage(atlasImage, sx, sy, fw, fh, 0, 0, fw, fh);
        out.drawImage(layer, dx, dy);
    }
    url = canvas.toDataURL();
    scenes.set(key, url);
    return url;
}
/** A thief at (x, y) in a player's colour: body plus tinted shirt. */
const thiefAt = (x: number, y: number, color: string, dir = 'down'): Placed[] => [{ frame: `thief-${dir}-0`, x, y }, { frame: `thief-shirt-${dir}-0`, x, y, tint: color }];
/** A front-facing thief in a player's colour, 16x16. */
const mugshot = (color: string) => pixelScene(16, 16, thiefAt(8, 16, color));
/** The chosen museum as a blueprint: walls, props, the van, and an X on every painting. */
function blueprint(selected: number) {
    const random = selected < 0, geometry = MAPS[random ? 0 : selected].walls;
    const rect = (x: number, y: number, w: number, h: number, cls = '') => `<rect${cls ? ` class="${cls}"` : ''} x="${x}" y="${y}" width="${w}" height="${h}"/>`;
    return `<div class="plan-wrap"><svg class="plan${random ? ' is-random' : ''}" viewBox="0 0 ${WORLD.w} ${WORLD.h}" shape-rendering="crispEdges" role="img" aria-label="Floor plan: ${random ? 'a random museum' : escape(MAPS[selected].name)}">`
        + `<defs><pattern id="plan-grid" width="96" height="96" patternUnits="userSpaceOnUse"><path d="M96 0H0V96"/></pattern></defs>`
        + `<rect class="plan-paper" width="${WORLD.w}" height="${WORLD.h}"/><rect width="${WORLD.w}" height="${WORLD.h}" fill="url(#plan-grid)"/>`
        + `<g class="plan-walls">${geometry.map(w => rect(w.x, w.y, w.w, w.h)).join('')}</g>`
        + `<g class="plan-props">${props.map(q => rect(q.x - 16, q.y - 16, 32, 32)).join('')}</g>`
        + rect(700, 970, 280, 145, 'plan-van')
        + `<g class="plan-x">${lootSeeds.filter(l => l.large).map(l => `<path d="M${l.x - 34} ${l.y - 34}l68 68m0-68l-68 68"/>`).join('')}</g></svg>`
        + (random ? '<span class="plan-stamp">Surprise me</span>' : '') + '</div>';
}
/** Red string from every suspect to the target, and pixel pushpins on every note. Redrawn after layout changes. */
function drawString() {
    const board = document.querySelector<HTMLElement>('.board'), svg = board?.querySelector<SVGSVGElement>('.board-string');
    if (!board || !svg) return;
    const box = board.getBoundingClientRect();
    const at = (el: Element) => { const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2 - box.left), y: Math.round(r.top + r.height / 2 - box.top) }; };
    const pins = Array.from(board.querySelectorAll<HTMLElement>('.pin')), target = board.querySelector('.blueprint .pin');
    // Stacked in one column (phones), the target sits far below the suspects, so the board keeps its pins but skips the string.
    const stacked = matchMedia('(max-width: 820px)').matches;
    const strings = target && !stacked ? pins.filter(pin => pin.closest('.polaroid:not(.empty)')).map(pin => {
        const a = at(pin), b = at(target), sag = Math.min(70, Math.hypot(b.x - a.x, b.y - a.y) * .14);
        return `<path d="M${a.x} ${a.y}Q${(a.x + b.x) / 2} ${(a.y + b.y) / 2 + sag} ${b.x} ${b.y}"/>`;
    }) : [];
    const heads = pins.map(pin => {
        const { x, y } = at(pin), c = pin.dataset.color || '#c8412f';
        return `<rect x="${x - 3}" y="${y - 1}" width="9" height="9" fill="#0007"/><rect x="${x - 5}" y="${y - 5}" width="9" height="9" fill="${c}"/><rect x="${x - 3}" y="${y - 3}" width="3" height="3" fill="#fffa"/>`;
    });
    svg.setAttribute('viewBox', `0 0 ${Math.round(box.width)} ${Math.round(box.height)}`);
    svg.innerHTML = `<g class="string-shadow">${strings.join('')}</g><g class="string">${strings.join('')}</g>${heads.join('')}`;
}
window.addEventListener('resize', drawString);
/** The lobby: a heist-planning corkboard. Suspects are pinned up with red string running to the target museum. */
function lobby() {
    if (!state) return;
    const s = state, mine = me(), host = s.host === myId, tilt = [-3, 2, -1.5, 2.5, -2, 1.5], map = s.selectedMap ?? -1;
    const suspects = s.players.map((p, i) => `<li class="polaroid${p.ready ? ' is-ready' : ''}${!p.connected ? ' is-offline' : ''}${p.id === myId ? ' is-me' : ''}" style="--tilt:${tilt[i % 6]}deg">`
        + `<i class="pin" data-color="${p.color}"></i><div class="mug"><img src="${mugshot(p.color)}" alt=""></div>`
        + `<b>${escape(p.name)}</b><small>${p.id === s.host ? 'MASTERMIND' : 'ACCOMPLICE'}${p.id === myId ? ' · YOU' : ''}</small>`
        + (!p.connected ? '<span class="stamp">No-show</span>' : p.ready ? '<span class="stamp">Ready</span>' : '<span class="pencil">getting shady…</span>') + '</li>').join('')
        + Array.from({ length: Math.max(0, 6 - s.players.length) }, (_, i) => `<li class="polaroid empty" style="--tilt:${tilt[(s.players.length + i) % 6]}deg"><div class="mug">?</div><small>WANTED</small></li>`).join('');
    ui.innerHTML = `<main class="screen board-screen"><header class="board-head"><span class="board-brand">PETTY THEFT<span>.</span></span><span class="board-case">CASE FILE · ${s.players.length}/6 SUSPECTS</span></header>`
        + `<section class="board"><svg class="board-string" aria-hidden="true"></svg>`
        + `<div class="note sticky"><i class="pin"></i><small>MEET AT ROOM</small><strong class="code">${s.code}</strong><small>Send this code to your crew.</small><button id="copy" class="text-button">Copy invitation</button></div>`
        + `<div class="note blueprint"><i class="pin" data-color="#f1c46a"></i><label for="map-choice">THE TARGET</label>${blueprint(map)}<select id="map-choice" ${host ? '' : 'disabled'}><option value="-1" ${map === -1 ? 'selected' : ''}>Random museum</option>${MAPS.map((m, i) => `<option value="${i}" ${map === i ? 'selected' : ''}>${m.name}</option>`).join('')}</select><small>${host ? 'You pick. Changing it resets everyone’s ready.' : 'The mastermind picks the museum.'}</small></div>`
        + `<ol class="suspects" aria-label="The crew">${suspects}</ol>`
        + `<div class="note card"><i class="pin"></i><h2>The job</h2><ul>`
        + `<li>Lights out. Cops and thieves are drawn at random each round.</li>`
        + `<li><b>Thieves</b> get ${HEAD_START} seconds to hide. Turn into a prop, steal the quota, reach the van.</li>`
        + `<li><b>Cops</b> only see what their flashlight hits. Point, then E or click to arrest. Arrest a real prop and you lose ${MISS_COOLDOWN} seconds.</li>`
        + `<li>A prop that moves in a beam is a dead giveaway.</li></ul>`
        + `<p class="keys"><b>WASD</b> move · <b>E</b> act · <b>Q</b> disguise · <b>R</b> drop · <b>SPACE</b> sprint</p><a class="guide-link" href="/how-to-play.html" target="_blank" rel="noopener">Full rules ↗</a></div>`
        + `<div class="board-actions"><button class="pixel-button primary" data-action="ready">${mine?.ready ? 'Not ready yet' : 'I’m in'}</button>`
        + (host ? '<button class="pixel-button" data-action="start">Start the heist →</button>' : '<p class="waiting">The mastermind starts the heist when everyone’s ready.</p>')
        + `<button id="leave" class="text-button">Leave crew</button><div class="error" role="alert"></div></div></section></main>`;
    bind();
    document.querySelector<HTMLSelectElement>('#map-choice')!.onchange = e => action('map:' + (e.target as HTMLSelectElement).value);
    document.querySelector<HTMLButtonElement>('#leave')!.onclick = leaveRoom;
    document.querySelector<HTMLButtonElement>('#copy')!.onclick = () => { navigator.clipboard.writeText(`${location.origin} — PETTY THEFT room ${s.code}`).then(() => notice('Invitation copied.'), () => notice(`Share ${location.origin} and code ${s.code}`)); };
    requestAnimationFrame(drawString);
    document.fonts?.ready.then(drawString).catch(() => {});
}
/** Pixel speaker icon for the sound toggle: waves when on, a little cross when off. */
const soundIcon = (off: boolean) => `<svg viewBox="0 0 12 12" width="24" height="24" shape-rendering="crispEdges" aria-hidden="true"><path d="M1 4h2l3-3h1v10H6L3 8H1z" fill="currentColor"/>`
    + (off ? '<path d="M8 4h1v1H8zM10 4h1v1h-1zM9 5h1v1H9zM8 6h1v1H8zM10 6h1v1h-1z" fill="currentColor"/>' : '<path d="M8 5h1v2H8zM10 3h1v6h-1z" fill="currentColor"/>') + '</svg>';
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
function playing() {
    ui.innerHTML = `<div class="rotate-hint"><span class="rotate-phone" aria-hidden="true"></span>Turn your phone sideways<small>This heist plays in landscape.</small></div>`
        + `<div class="round-banner" id="round-banner" hidden><small>LIGHTS OUT</small><b id="banner-title"></b><span id="banner-text"></span><strong id="banner-count"></strong></div>`
        + `<div class="mission" id="mission"></div>`
        + `<div class="hud"><div class="brand hud-brand">PETTY THEFT<span>.</span></div><div class="stats"><div class="stat"><label>LOCKDOWN</label><strong id="timer"></strong></div><div class="stat"><label>THE HAUL</label><strong id="haul"></strong><div class="progress"><i id="bar"></i></div></div></div>`
        + `<div class="hud-buttons"><button id="mute" class="icon-button" aria-label="Sound" aria-pressed="${!muted}" title="Sound">${soundIcon(muted)}</button><button id="help" class="icon-button" aria-label="How to play" title="How to play">?</button></div></div>`
        + `<div class="objective">${escape(state!.mapName || 'Museum of Questionable Taste')} · ROOM ${state!.code}</div>`
        + `<div class="status"><div class="status-card"><b id="stealth"></b><span id="bag"></span></div><div class="status-card" id="partners"></div></div>`
        + `<div class="controls"><button data-action="sprint"><span class="key">SPACE</span><span id="sprint-label">Sprint</span></button><button data-action="interact"><span class="key">E</span><span id="interact-label"></span></button><button data-action="transform"><span class="key">Q</span><span id="transform-label"></span></button><button data-action="drop"><span class="key">R</span>Drop</button></div>`
        + `<div class="joystick"><div class="stick"></div></div>`
        + `<div class="toast radio" hidden><span class="radio-tag">SECURITY RADIO</span><p class="radio-text"></p></div>`;
    bind();
    const mute = document.querySelector<HTMLButtonElement>('#mute')!;
    mute.onclick = () => { muted = !muted; localStorage.setItem('petty-muted', muted ? '1' : '0'); mute.innerHTML = soundIcon(muted); mute.setAttribute('aria-pressed', String(!muted)); };
    document.querySelector<HTMLButtonElement>('#help')!.onclick = showHelp;
    const joy = document.querySelector<HTMLDivElement>('.joystick')!;
    let pointer: number | null = null;
    const update = (e: PointerEvent) => { const r = joy.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, n = Math.max(40, Math.hypot(dx, dy)); stick = { x: dx / n, y: dy / n }; (joy.firstChild as HTMLElement).style.transform = `translate(${stick.x * 32}px,${stick.y * 32}px)`; };
    joy.onpointerdown = e => { pointer = e.pointerId; joy.setPointerCapture(pointer); update(e); };
    joy.onpointermove = e => { if (e.pointerId === pointer) update(e); };
    joy.onpointerup = joy.onpointercancel = () => { pointer = null; stick = { x: 0, y: 0 }; (joy.firstChild as HTMLElement).style.transform = ''; };
}
function leaveRoom() { socket.emit('leave'); saved = null; sessionStorage.removeItem('petty-session'); state = null; myId = ''; screen = ''; help = false; render(); }
function bind() { document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => b.onclick = () => action(b.dataset.action!)); }
function showHelp() {
    if (help) return;
    help = true;
    const d = document.createElement('div');
    d.className = 'help';
    d.setAttribute('role', 'dialog');
    d.setAttribute('aria-modal', 'true');
    d.setAttribute('aria-labelledby', 'help-title');
    d.innerHTML = '<header><h2 id="help-title">Lights out</h2><button id="close-help" class="text-button">Close ×</button></header>'
        + '<p class="help-intro">Cops and thieves are drawn at random each round. The museum is dark.</p>'
        + '<div class="help-cols"><section><h3>Thieves</h3><ul>'
        + '<li>You see the whole museum, and every flashlight beam.</li>'
        + '<li>Press <kbd>Q</kbd> beside a highlighted prop to become one. Move freely in the dark; in a beam, freeze. A prop that moves is a dead giveaway.</li>'
        + '<li>Sprinting is loud: cops see gold ripples roughly where you are.</li>'
        + '<li>Pocket up to two treasures. A painting needs two thieves for full speed (the first carrier steers), and you can’t disguise while carrying one.</li>'
        + '<li>Deposit the quota at the van, then press <kbd>E</kbd> there empty-handed to escape. Every free thief has to get out.</li>'
        + '</ul></section><section><h3>Cops</h3><ul>'
        + '<li>Eyes closed for the first ' + HEAD_START + ' seconds while the thieves hide.</li>'
        + '<li>You only see what your flashlight lights up, plus a faint floor plan. Aim with the mouse, or by moving.</li>'
        + '<li>Press <kbd>E</kbd> or click to arrest whatever your beam points at (blue ring). Catching a thief recharges in 2 seconds; arresting a real prop costs ' + MISS_COOLDOWN + '.</li>'
        + '<li>The van apron is a safe zone, and freshly rescued thieves are protected for 5 seconds (green shield).</li>'
        + '<li>Cops win when the clock runs out or every thief is caught.</li>'
        + '</ul></section></div>'
        + '<section class="help-more"><h3>Also</h3><p>Caught thieves wait in the holding room. A free teammate presses <kbd>E</kbd> at the lock and stands still for 3 seconds to free everyone. The gramophone distracts guards for a moment (25-second recharge). Disconnected thieves drop their loot; reopen the game in the same tab to get your place back. Late arrivals watch until the next round.</p></section>'
        + '<p class="help-keys"><span><kbd>WASD</kbd> move</span><span><kbd>E</kbd> act</span><span><kbd>Q</kbd> disguise</span><span><kbd>R</kbd> drop</span><span><kbd>SPACE</kbd> sprint</span></p>'
        + '<footer><button id="touch-toggle" class="text-button">Toggle touch controls</button><button id="leave-game" class="text-button">Leave crew</button></footer>';
    const close = () => { d.remove(); help = false; document.removeEventListener('keydown', onKey); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('keydown', onKey);
    d.querySelector<HTMLButtonElement>('#close-help')!.onclick = close;
    d.querySelector<HTMLButtonElement>('#leave-game')!.onclick = () => { close(); leaveRoom(); };
    d.querySelector<HTMLButtonElement>('#touch-toggle')!.onclick = () => { document.body.classList.toggle('touch'); close(); };
    ui.append(d);
    d.querySelector<HTMLButtonElement>('#close-help')!.focus();
}
function updateHud() {
    const p = me();
    if (!p || !state) return;
    const s = state, cop = p.role === 'cop', $ = <T extends HTMLElement = HTMLElement>(q: string) => document.querySelector<T>(q)!;
    $<HTMLButtonElement>('[data-action="transform"]').hidden = cop;
    $<HTMLButtonElement>('[data-action="drop"]').hidden = cop;
    $<HTMLButtonElement>('[data-action="interact"]').disabled = p.captured || p.escaped || p.spectator || (cop && ((s.headStart || 0) > 0 || p.cooldown > 0));
    $('#sprint-label').textContent = p.disguise ? 'Unhide to sprint' : p.sprintCooldown! > 0 ? `Sprint · ${Math.ceil(p.sprintCooldown!)}s` : 'Sprint';
    const banner = $('#round-banner');
    banner.hidden = !(s.headStart! > 0);
    if (!banner.hidden) {
        banner.dataset.role = cop ? 'cop' : 'thief';
        $('#banner-title').textContent = cop ? 'You are a cop' : 'You are a thief';
        $('#banner-text').textContent = cop ? 'Eyes closed. Your flashlight comes on when the count hits zero.' : 'Hide before the flashlights come on.';
        $('#banner-count').textContent = String(Math.ceil(s.headStart || 0));
    }
    const captured = s.players.filter(q => q.role !== 'cop' && q.captured).length;
    $('#mission').textContent = p.spectator ? 'Spectating · join next round' : p.escaped ? 'Extracted · waiting for crew' : p.captured ? 'HOLDING ROOM · Wait for a teammate to pick the lock' : cop ? `FLASHLIGHT ON · Point at something that shouldn’t be there and press E · wrong guesses cost ${MISS_COOLDOWN}s` : p.protectedFor! > 0 ? `RESCUED · Safe for ${Math.ceil(p.protectedFor!)}s` : s.total >= s.quota ? 'QUOTA MET · Return to the van and press E to escape' : captured ? `${captured} TEAMMATE(S) CAPTURED · Rescue at the holding-room lock` : 'STEAL → DEPOSIT AT THE VAN → REACH QUOTA → ESCAPE';
    const timer = $('#timer');
    timer.classList.toggle('urgent', s.seconds <= 30);
    timer.textContent = `${Math.floor(s.seconds / 60)}:${String(Math.floor(s.seconds % 60)).padStart(2, '0')}`;
    $('#haul').textContent = `$${s.total.toLocaleString()} / $${s.quota.toLocaleString()}`;
    $('#bar').style.width = Math.min(100, s.total / s.quota * 100) + '%';
    const stealth = $('#stealth');
    stealth.textContent = cop ? 'COP · AIM YOUR FLASHLIGHT · E OR CLICK TO ARREST' : p.spectator ? 'WATCHING THE CREW' : p.escaped ? 'SAFE IN THE VAN' : p.captured ? 'CAPTURED · CREW CAN RESCUE YOU' : p.suspicion > .65 ? 'SPOTTED · BREAK LINE OF SIGHT' : p.suspicion > .05 ? 'SUSPICIOUS · KEEP YOUR COOL' : p.disguise ? (p.moving ? 'MOVING PROP · BE CAREFUL' : 'HIDDEN · PERFECTLY NORMAL') : 'THIEF · KEEP A LOW PROFILE';
    // Colour-codes the status line: calm, careful, in trouble.
    stealth.dataset.mood = cop ? 'cop' : p.spectator || p.escaped ? 'out' : p.captured || p.suspicion > .65 ? 'alarm' : p.suspicion > .05 || (p.disguise && p.moving) ? 'warn' : p.disguise ? 'safe' : 'calm';
    const carried = s.loot.filter(l => l.carriers.includes(myId)), painting = carried.find(l => l.large);
    $('#bag').textContent = cop ? `Arrests ${p.score}${p.cooldown > 0 && !((s.headStart || 0) > 0) ? ` · ready in ${Math.ceil(p.cooldown)}s` : ''}` : painting ?`Painting · ${painting.carriers.length === 2 ? (painting.carriers[0] === myId ? 'you steer' : 'partner steers') : 'partner needed · slow carry'}` : `Pockets ${carried.length}/2 · $${carried.reduce((n, l) => n + l.value, 0)}${p.disguise ? ' · ' + p.disguise : ''}`;
    $('#interact-label').textContent = target();
    $('#transform-label').textContent = transformLabel();
    const partners = $('#partners'), crew = s.players.filter(q => q.connected && !q.spectator)
        .map(q => `<span class="crew-tag${q.captured ? ' is-caught' : q.escaped ? ' is-out' : ''}"><i style="background:${escape(q.color)}"></i>${escape(q.name)}${q.captured ? ' ×' : q.escaped ? ' ✓' : ''}</span>`).join('');
    if (partners.dataset.html !== crew) { partners.innerHTML = crew; partners.dataset.html = crew; }
    // Radio messages type themselves out, a few letters per update.
    const radio = $('.toast'), now = Date.now(), text = $('.radio-text');
    radio.hidden = now > toastUntil || (s.headStart || 0) > 0;
    const shown = reducedMotion ? toast.length : Math.min(toast.length, Math.floor((now - toastAt) / 22));
    const line = toast.slice(0, shown);
    if (text.textContent !== line) text.textContent = line;
    radio.classList.toggle('is-typing', shown < toast.length);
}
/** Results: tomorrow's front page, with a pixel photo printed in newsprint grey and a stamp for how you did. */
function results() {
    const s = state!, p = me(), team = p?.role === 'cop' ? 'cops' : 'thieves', spectator = !p || p.spectator, won = !spectator && s.winner === team;
    const crew = s.players.filter(q => !q.spectator), thieves = crew.filter(q => q.role !== 'cop'), present = thieves.filter(q => q.connected);
    const money = (n: number) => '$' + n.toLocaleString();
    const caught = s.winner !== 'thieves' && present.length > 0 && present.every(q => q.captured);
    const colors = thieves.map(q => q.color).concat(COLORS).slice(0, 3);
    const disguises = thieves.map(q => q.disguise || '').filter(Boolean).concat(['plant', 'bench', 'statue']).slice(0, 3);
    const story = s.winner === 'thieves' ? {
        kind: 'street',
        head: 'Museum robbed blind',
        deck: `Crew walks off with ${money(s.total)} in questionable art. Getaway van seen leaving “very quickly”.`,
        photo: [{ frame: 'painting-1', x: 11, y: 37 }, ...thiefAt(26, 37, colors[0], 'right'), { frame: 'van', x: 52, y: 37 }, ...thiefAt(76, 37, colors[1]), ...thiefAt(89, 37, colors[2], 'left')],
        caption: 'The getaway van, photographed leaving. Police describe it as “green”.',
    } : caught ? {
        kind: 'lineup',
        head: 'Furniture arrested',
        deck: `Police detain ${present.length} ${present.length === 1 ? 'suspect' : 'suspects'} disguised as museum exhibits. A plant declined to comment.`,
        photo: [{ frame: 'cop-right-0', x: 13, y: 37 }, ...disguises.map((kind, i) => ({ frame: kind, x: 40 + i * 24, y: 37 }))],
        caption: 'The suspects at the station. None of them have said a word.',
    } : {
        kind: 'gallery',
        head: 'Heist fizzles at closing time',
        deck: s.total >= s.quota ? 'The loot made it to the van. The crew did not.' : `The crew got ${money(s.total)} of ${money(s.quota)} to the van before the doors locked.`,
        photo: [{ frame: 'cop-right-0', x: 22, y: 37 }, { frame: 'loot-0', x: 50, y: 37 }, { frame: 'plant', x: 72, y: 37 }, { frame: 'bin', x: 88, y: 37 }],
        caption: 'An officer keeps watch over the collection after lockdown.',
    };
    const verdict = spectator ? '' : won ? (team === 'cops' ? 'Case closed' : 'Clean getaway') : (team === 'cops' ? 'They got away' : 'Busted');
    const rows = crew.map(q => `<li><i style="background:${escape(q.color)}"></i><b>${escape(q.name)}${q.id === myId ? ' <em>(you)</em>' : ''}</b>`
        + `<span>${q.role === 'cop' ? `Officer · ${q.score} ${q.score === 1 ? 'arrest' : 'arrests'}` : `Thief · ${money(q.score)} delivered · ${q.rescues} ${q.rescues === 1 ? 'rescue' : 'rescues'}`}</span>`
        + `<small>${q.role === 'cop' ? 'On duty' : q.escaped ? 'Escaped' : q.captured ? 'In custody' : !q.connected ? 'Vanished' : 'Still inside'}</small></li>`).join('');
    ui.innerHTML = `<main class="screen paper-screen ${won ? 'victory' : spectator ? '' : 'defeat'}"><article class="paper">`
        + `<header class="masthead"><span>LATE EDITION</span><h1>The Petty Gazette</h1><span>ROOM ${s.code} · 2¢</span></header>`
        + `<p class="dateline">${escape(s.mapName || 'Museum of Questionable Taste')} · Tonight · ${s.winner === 'cops' ? 'Cops' : 'Thieves'} win</p>`
        + `<div class="paper-body"><div class="story"><h2 class="headline">${story.head}</h2><p class="deck">${story.deck}</p>`
        + `<figure class="photo photo-${story.kind}"><img src="${pixelScene(96, 40, story.photo)}" alt=""><figcaption>${story.caption}</figcaption>`
        + (verdict ? `<span class="verdict">${verdict}</span>` : '') + `</figure></div>`
        + `<aside class="persons"><h3>Persons of interest</h3><ol>${rows}</ol><p class="outcome">“${escape(s.outcome)}” · ${money(s.total)} of ${money(s.quota)} deposited.</p>`
        + `<div class="paper-actions">${s.host === myId ? '<button class="pixel-button primary" data-action="again">Plan the next job →</button>' : '<p class="waiting">Waiting for the mastermind to plan the next job.</p>'}`
        + `<button id="results-leave" class="text-button">Leave room</button><a class="guide-link" href="/how-to-play.html" target="_blank" rel="noopener">How to play ↗</a></div></aside></div></article></main>`;
    bind();
    document.querySelector<HTMLButtonElement>('#results-leave')!.onclick = leaveRoom;
    tone(won ? 880 : 180);
}
const keyState = new Set<string>();
window.addEventListener('keydown', e => { if ((e.target as HTMLElement).tagName === 'INPUT')
    return; if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key))
    e.preventDefault(); keyState.add(e.key.toLowerCase()); if (!e.repeat && state?.phase === 'playing') {
    if(e.key===' ')action('sprint');
    if (e.key.toLowerCase() === 'e')
        action('interact');
    if (e.key.toLowerCase() === 'q')
        action('transform');
    if (e.key.toLowerCase() === 'r')
        action('drop');
} });
window.addEventListener('keyup', e => keyState.delete(e.key.toLowerCase()));
const stop = () => { keyState.clear(); stick = { x: 0, y: 0 }; socket.emit('input', { x: 0, y: 0 }); };
window.addEventListener('blur', stop);
document.addEventListener('visibilitychange', () => { if (document.hidden)
    stop(); });
setInterval(() => { desired = { x: (keyState.has('d') || keyState.has('arrowright') ? 1 : 0) - (keyState.has('a') || keyState.has('arrowleft') ? 1 : 0) + stick.x, y: (keyState.has('s') || keyState.has('arrowdown') ? 1 : 0) - (keyState.has('w') || keyState.has('arrowup') ? 1 : 0) + stick.y };
    if (!usingMouse && Math.hypot(desired.x, desired.y) > .2)
        aim = Math.atan2(desired.y, desired.x);
    if (state?.phase === 'playing' && socket.connected)
    socket.emit('input', me()?.role === 'cop' ? { ...desired, aim } : desired); if (state?.phase === 'playing')
    updateHud(); }, 50);
const hex = (s: string) => parseInt(s.replace('#', ''), 16);
/** The sprite direction closest to an angle. Sideways wins near the diagonals, which reads better when walking. */
const facingName = (a: number) => { const c = Math.cos(a), s = Math.sin(a); return Math.abs(c) >= Math.abs(s) * .9 ? (c > 0 ? 'right' : 'left') : s > 0 ? 'down' : 'up'; };
/** A stable small number from an id, so each piece of loot keeps the same look all round. */
const pick = (id: string, n: number) => [...id].reduce((h, c) => Math.imul(h, 31) + c.charCodeAt(0) >>> 0, 7) % n;
/**
 * The title screen's set piece: in the dark gallery, a cop sweeps a flashlight past a painting,
 * a statue, and a plant standing in the middle of the room where no plant should be.
 */
const TITLE = { cop: { x: 615, y: 540 }, plant: { x: 930, y: 330 }, range: 430, aim: (t: number) => -0.68 + 0.6 * Math.sin(t / 3200) };
class Museum extends Phaser.Scene {
    g!: Phaser.GameObjects.Graphics;
    labels = new Map<string, Phaser.GameObjects.Text>();
    positions = new Map<string, Point>();
    cameraPoint = { x: 1050, y: 550 };
    /** Darkness: filled each frame, with every flashlight erased out of it. */
    dark!: Phaser.GameObjects.RenderTexture;
    /** Off-screen brush holding this frame's light shapes. */
    light!: Phaser.GameObjects.Graphics;
    /** Drawn above the darkness: the cop's floor plan, footstep noise, targeting rings. */
    top!: Phaser.GameObjects.Graphics;
    artPool:Phaser.GameObjects.Image[]=[];
    artIndex=0;
    floorPhase=false;
    /** Which way each character last moved, so they keep facing it when they stop. */
    facing = new Map<string, number>();
    lastDrawn = new Map<string, Point>();
    preload(){this.load.image('pixel',PIXEL_ATLAS);}
    /**
     * Draws one frame of the pixel atlas, bottom-centre anchored at (x, y), from a pool reused every frame.
     * Depth follows the anchor's y so things lower on screen draw in front.
     */
    sprite(frame: string, x: number, y: number, tint = 0xffffff, alpha = 1, depth = 3 + y / 10000) {
        let s = this.artPool[this.artIndex++];
        if (!s) { s = this.add.image(0, 0, 'pixel', frame).setOrigin(.5, 1).setScale(PX); this.artPool.push(s); }
        return s.setFrame(frame).setScale(PX).setPosition(Math.round(x), Math.round(y)).setTint(tint).setAlpha(alpha).setDepth(depth).setVisible(true);
    }
    /** A cop or thief standing at (x, y): shadow, body, and for thieves a striped shirt in the player's colour. */
    character(role: 'cop' | 'thief', angle: number, moving: boolean, x: number, y: number, time: number, shirt = 0xffffff) {
        const dir = facingName(angle), step = moving ? [1, 0, 2, 0][Math.floor(time / 130) % 4] : 0;
        this.sprite('shadow', x, y + 19, 0xffffff, 1, 2.5);
        const body = this.sprite(`${role}-${dir}-${step}`, x, y + 16);
        if (role === 'thief') this.sprite(`thief-shirt-${dir}-${step}`, x, y + 16, shirt, 1, body.depth + 1e-6);
    }
    /** Direction a character faces: cops face their flashlight, everyone else faces where they last moved. */
    heading(id: string, pos: Point, fallback = Math.PI / 2) {
        const last = this.lastDrawn.get(id);
        if (last && Math.hypot(pos.x - last.x, pos.y - last.y) > .4) this.facing.set(id, Math.atan2(pos.y - last.y, pos.x - last.x));
        this.lastDrawn.set(id, { x: pos.x, y: pos.y });
        return this.facing.get(id) ?? fallback;
    }
    create() {
        createMuseumFloor(this);this.add.image(0,0,'museum-floor').setOrigin(0).setScale(PX).setDepth(-1);
        const atlas = this.textures.get('pixel');
        for (const [name, [x, y, w, h]] of Object.entries(PIXEL_FRAMES)) atlas.add(name, 0, x, y, w, h);
        atlas.setFilter(Phaser.Textures.FilterMode.NEAREST);
        this.g = this.add.graphics(); this.cameras.main.setBackgroundColor('#101923'); this.cameras.main.setBounds(-80, -80, WORLD.w + 160, WORLD.h + 160);
        this.light = this.make.graphics({}, false);
        this.dark = this.add.renderTexture(0, 0, 16, 16).setOrigin(0).setDepth(20).setVisible(false);
        this.top = this.add.graphics().setDepth(21);
        // Canvas text drawn before a web font arrives keeps the fallback, so redraw once the placard font loads.
        Promise.all([document.fonts?.load('12px "Special Elite"'), document.fonts?.load('12px Silkscreen')]).then(() => this.labels.forEach(l => l.updateText())).catch(() => {});
        this.input.on('pointermove', (ptr: Phaser.Input.Pointer) => { if (!ptr.wasTouch) usingMouse = true; });
        this.input.on('pointerdown', (ptr: Phaser.Input.Pointer) => { if (!ptr.wasTouch && ptr.leftButtonDown() && me()?.role === 'cop' && state?.phase === 'playing') action('interact'); }); }
    label(id: string, x: number, y: number, text: string, size = 12, color = '#9badaf', alpha = 1, depth = 10, font = 'Silkscreen, monospace') { let t = this.labels.get(id); if (!t) {
        t = this.add.text(x, y, text, { fontFamily: font, fontSize: size, color, align: 'center' }).setOrigin(.5);
        this.labels.set(id, t);
    } t.setPosition(x, y).setText(text).setColor(color).setAlpha(alpha).setDepth(depth); }
    /** Eases a drawn position toward its latest target; snaps on big jumps (respawns, reappearing). */
    smooth(key: string, target: Point, delta: number, ms: number) {
        let pos = this.positions.get(key);
        if (!pos || dist(pos, target) > 200) {
            pos = { x: target.x, y: target.y };
            this.positions.set(key, pos);
        }
        const blend = 1 - Math.exp(-delta / ms);
        pos.x = Phaser.Math.Linear(pos.x, target.x, blend);
        pos.y = Phaser.Math.Linear(pos.y, target.y, blend);
        return pos;
    }
    rect(x: number, y: number, w: number, h: number, c: number, r = 0) { if(this.floorPhase)return; this.g.fillStyle(c, 1); r ? this.g.fillRoundedRect(x, y, w, h, r) : this.g.fillRect(x, y, w, h); }
    ellipse(x: number, y: number, w: number, h: number, c: number, a = 1) { this.g.fillStyle(c, a); this.g.fillEllipse(x, y, w, h); }
    /** A prop at (x, y). Disguised thieves draw through here too, so they're pixel-identical to the real thing. */
    prop(kind: string, x: number, y: number) {
        this.sprite('shadow', x, y + 19, 0xffffff, 1, 2.5);
        this.sprite(kind, x, y + 16);
    }
    thief(p: Player, x: number, y: number, time: number) { const g = this.g;
        if(p.protectedFor!>0){g.lineStyle(3,0x83d3bd,.5+.3*Math.sin(time/150));g.strokeCircle(x,y-14,38);}
        if(p.role==='cop'&&p.cooldown>0&&p.cooldown<.6){g.lineStyle(2,0x80bde0,p.cooldown);g.strokeCircle(x,y,65);}
        if(p.sprintFor!>0){g.lineStyle(2,0xc0d9e6,.4);g.lineBetween(x-25,y+5,x-45,y+5);g.lineBetween(x-20,y+15,x-35,y+15);}
        // Cops must not get any mark on a disguised thief: no colour ring, no name.
        const hiddenFromMe = me()?.role === 'cop' && p.role !== 'cop' && !!p.disguise;
        if (p.disguise) {
            this.prop(p.disguise, x, y);
            if (!hiddenFromMe) { g.lineStyle(2, hex(p.color), .8); g.strokeEllipse(x, y + 24, 42, 14); }
        }
        else {
            const angle = p.role === 'cop' ? (p.id === myId ? aim : p.aim ?? Math.PI / 2) : this.heading(p.id, { x, y });
            const moving = p.moving || (p.id === myId && (desired.x !== 0 || desired.y !== 0));
            this.character(p.role === 'cop' ? 'cop' : 'thief', angle, moving, x, y, time, hex(p.color));
            g.lineStyle(2, hex(p.color), .9); g.strokeEllipse(x, y + 19, 40, 12);
        }
        if (p.id === myId) {
            g.lineStyle(2, 0xeabe70, .7);
            g.strokeEllipse(x, y + 24, 46, 15);
            g.fillStyle(0xeabe70);
            g.fillTriangle(x - 5, y - 62, x + 5, y - 62, x, y - 56);
        }
        if (p.suspicion > 0) {
            g.lineStyle(4, p.suspicion > .65 ? 0xea826b : 0xeabe70);
            g.beginPath();
            g.arc(x, y - 16, 34, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.suspicion);
            g.strokePath();
        }
        if (!hiddenFromMe) this.label(p.id, x, y + 38, (p.role === 'cop' ? 'OFFICER ' : '') + p.name, 9, p.color); }
    update(time: number, delta: number) {
        const g = this.g;
        g.clear();
        this.top.clear();
        this.artIndex=0;this.artPool.forEach(s=>s.setVisible(false));
        this.labels.forEach(l => l.setAlpha(0));
        const playing = state?.phase === 'playing';
        const local = me();
        const watching = local && (local.spectator || local.escaped);
        const focus = watching ? state?.players.find(p => p.connected && !p.captured && !p.escaped && !p.spectator) : local;
        const title = !state;
        const zoom = playing ? (window.innerWidth < 650 ? .75 : 1) : title ? Phaser.Math.Clamp(Math.min(window.innerHeight / 720, window.innerWidth / 900), .7, 1.6) : Math.max(window.innerWidth / 1800, window.innerHeight / 1300);
        this.cameras.main.setZoom(zoom);
        // The title may frame past the museum's edge (it's all darkness there); gameplay stays inside the walls.
        this.cameras.main.useBounds = !title;
        let fx = playing && focus ? focus.x : 1020, fy = playing && focus ? focus.y : 530;
        if (title) {
            // Wide screens: the cop stands just right of the menu and sweeps toward the right edge.
            // Narrow screens: the menu fills the top, so the scene plays out in the empty lower half.
            const narrow = window.innerWidth < 760;
            fx = narrow ? 790 : TITLE.cop.x - .07 * window.innerWidth / zoom;
            fy = narrow ? 380 - .22 * window.innerHeight / zoom : 380;
        }
        else if (!playing)
            fx += 120;
        if(playing&&focus?.id===myId&&!local?.captured){fx=(this.positions.get(myId)?.x||fx)+desired.x*45;fy=(this.positions.get(myId)?.y||fy)+desired.y*45;}
        this.cameraPoint.x = Phaser.Math.Linear(this.cameraPoint.x, fx, Math.min(1, delta / 110));
        this.cameraPoint.y = Phaser.Math.Linear(this.cameraPoint.y, fy, Math.min(1, delta / 110));
        this.cameras.main.centerOn(this.cameraPoint.x, this.cameraPoint.y);
        this.floorPhase=true;
        this.rect(0, 0, WORLD.w, WORLD.h, 0x22333d);
        this.rect(28, 28, 522, 532, 0x344849);
        this.rect(574, 28, 536, 532, 0x3d4143);
        this.rect(1134, 28, 518, 532, 0x3c3d4c);
        this.rect(28, 584, 522, 336, 0x2b3b42);
        this.rect(574, 584, 536, 336, 0x304446);
        this.rect(1134, 584, 518, 336, 0x343b45);
        this.rect(28, 944, 2584, 188, 0x1a2933);
        this.rect(1680,28,460,532,0x354a3d);this.rect(2164,28,448,532,0x3f343b);
        this.rect(1680,584,460,336,0x3b454c);this.rect(2164,584,448,336,0x514537);
        this.label('east1',1910,500,'THE CONSERVATORY',15,'#a1b89c');this.label('east2',2390,500,'ROYAL COLLECTION',15,'#c8b294');
        this.label('east3',1910,880,'RESTORATION STUDIO',13,'#9fb7bc');this.label('east4',2390,880,'ANTIQUITIES',14,'#c8b294');
        this.label('east-route',1580,345,'EAST WING →',10,'#eabe70');
        this.floorPhase=false;
        for(const x of [70,610,1160]){this.rect(x,110,12,390,0x172b34);this.rect(x+2,110,4,390,0x657774);}
        for (const w of (state?.geometry||walls)) {
            this.rect(w.x + 5, w.y + 7, w.w, w.h, 0x111e29);
            this.rect(w.x, w.y, w.w, w.h, 0x59676a);
            this.rect(w.x, w.y, w.w, 5, 0x7a8581);
        }
        // Paintings hanging on the north wall.
        [170, 400, 710, 970, 1250, 1500].forEach((x, n) => this.sprite('wall-art-' + n % 3, x, 96, 0xffffff, 1, 2.6));
        this.label('wing1', 285, 490, 'THE OLD MONEY WING', 13, '#829b98');
        this.label('wing2', 840, 505, 'GALLERY OF GREAT TASTE', 13, '#9c9890');
        this.label('wing3', 1390, 495, 'OBJECTS OF DESIRE', 13, '#9a93a4');
        this.label('wing4', 850, 875, 'NIGHT VISITORS WELCOME', 11, '#7c9b98');
        // Van and extraction zone.
        g.lineStyle(2, 0xeabe70, .25);
        g.strokeRoundedRect(700, 970, 280, 145, 15);
        this.sprite('shadow', 840, 1094, 0xffffff, 1, 2.5).setScale(PX * 2, PX);
        this.sprite('van', 840, 1090);
        this.label('van', 840, 1103, 'NO QUESTIONS ASKED', 8, '#e5dfc8');
        if(state&&state.total>=state.quota){g.lineStyle(3,0x83d3bd,.5+.3*Math.sin(time/180));g.strokeRoundedRect(700,970,280,145,15);}
        this.label('extract', 840, 990, state && state.total >= state.quota ? 'THE GETAWAY · READY TO LEAVE' : 'THE GETAWAY · DEPOSIT HERE', 11, '#eabe70');
        this.rect(1330, 830, 302, 76, 0x202e38);
        for (let x = 1340; x < 1630; x += 32) {
            g.lineStyle(3, 0x71868a, .5);
            g.lineBetween(x, 820, x, 900);
        }
        this.rect(1426, 791, 28, 28, 0xc6a463, 4);
        this.label('lock', 1467, 775, 'HOLDING ROOM · LOCK', 10, '#c9b78a');
        this.rect(NOISE.x - 22, NOISE.y - 10, 44, 35, 0x9b7457, 4);
        g.fillStyle(0xc6a463);
        g.fillTriangle(NOISE.x, NOISE.y - 10, NOISE.x + 44, NOISE.y - 45, NOISE.x + 45, NOISE.y - 8);
        if (state && state.noiseUntil > 0) {
            // Sound carries through the dark, so this draws above it.
            this.top.lineStyle(3, 0xeabe70, .5);
            this.top.strokeCircle(NOISE.x, NOISE.y, 40 + (time / 15) % 90);
        }
        this.label('noise', NOISE.x, NOISE.y + 48, 'MAKE SOME NOISE', 9, '#c6ae83');
        // Cops only get the props near their team, real and disguised thieves mixed under anonymous ids.
        for (const q of state?.visibleProps ?? props) {
            const pos = state?.visibleProps ? this.smooth('v:' + q.id, q, delta, 90) : q;
            this.prop(q.kind, pos.x, pos.y);
        }
        // During a round, show only what the server sent; a cop's list is often empty and must not fall back to the demo.
        const allLoot = state && (state.phase !== 'lobby' || state.loot.length) ? state.loot : lootSeeds.map((l, i) => ({ ...l, id: 'demo' + i, value: 0, carriers: [], deposited: false }));
        for (const l of allLoot) {
            if (l.deposited)
                continue;
            if (l.carriers.length && !l.large)
                continue;
            if (l.large) {
                this.sprite('shadow', l.x, l.y + 27, 0xffffff, 1, 2.5);
                this.sprite('painting-' + pick(l.id, 3), l.x, l.y + 24);
                if (l.carriers.length === 1)
                    this.label('carry' + l.id, l.x, l.y - 114, 'PARTNER NEEDED', 9, '#eabe70');
            }
            else {
                this.sprite('shadow', l.x, l.y + 19, 0xffffff, 1, 2.5);
                this.sprite('loot-' + pick(l.id, 4), l.x, l.y + 16);
                // A glint now and then, at a different moment for each piece.
                const glint = Math.sin(time / 260 + pick(l.id, 97));
                if (glint > .6)
                    this.sprite('sparkle', l.x + 18, l.y - 44, 0xffffff, (glint - .6) / .4, 3 + (l.y + 17) / 10000);
            }
        }
        const guards = state?.phase==='playing' ? state.guards : title ? [] : [{ id: 'demo-guard', x: 1060, y: 650, angle: -2.3, mode: 'patrol' }];
        for (const guard of guards) {
            const chase = guard.mode === 'chase';
            g.fillStyle(chase ? 0xe87d63 : 0xf1cf85, .10);
            g.beginPath();
            g.moveTo(guard.x, guard.y);
            for (let a = guard.angle - .62; a <= guard.angle + .63; a += .04) {
                let end = { x: guard.x, y: guard.y };
                for (let r = 8; r <= 260; r += 8) {
                    const q = { x: guard.x + Math.cos(a) * r, y: guard.y + Math.sin(a) * r };
                    if ((state?.geometry||walls).some(w => q.x >= w.x && q.x <= w.x + w.w && q.y >= w.y && q.y <= w.y + w.h))
                        break;
                    end = q;
                }
                g.lineTo(end.x, end.y);
            }
            g.closePath();
            g.fillPath();
            this.character('cop', guard.angle, true, guard.x, guard.y, time);
            if (guard.mode !== 'patrol')
                this.label(guard.id + 'alert', guard.x, guard.y - 64, chase ? '!' : '?', 22, chase ? '#ed8b71' : '#eabe70');
        }
        if (state?.phase === 'playing' || state?.phase === 'results') {
            for (const p of state.players) {
                // Hidden: a thief the cops can't see. The cop's snapshot carries no position for them.
                if (p.spectator || p.escaped || !p.connected || p.hidden)
                    continue;
                const predicted=p.id===myId?predictPosition(p,desired,(performance.now()-snapshotAt)/1000,state):p;
                const pos = this.smooth(p.id, predicted, delta, p.id === myId ? 25 : 90);
                this.thief(p, pos.x, pos.y, time);
            }
        }
        else if (title) {
            // The plant that shouldn't be there, with its own museum placard, only readable when the beam passes.
            const { x, y } = TITLE.plant;
            this.prop('plant', x, y);
            this.rect(x - 52, y + 30, 104, 28, 0x15120d, 2);
            this.rect(x - 50, y + 28, 100, 26, 0xd6c79f, 2);
            this.label('placard', x, y + 41, 'EXHIBIT 14\nA completely normal plant', 9, '#2b241a', 1, 10, 'Special Elite, Courier New, monospace');
            this.character('cop', TITLE.aim(time), false, TITLE.cop.x, TITLE.cop.y, time);
        }
        else {
            this.prop('plant', 1080, 760);
            this.label('demo-name', 1080, 806, 'ABSOLUTELY NOT A THIEF', 10, '#eabe70');
        }
        localPos = this.positions.get(myId) || null;
        if (playing && local?.role === 'cop' && usingMouse && localPos) {
            const ptr = this.input.activePointer, at = this.cameras.main.getWorldPoint(ptr.x, ptr.y);
            aim = Math.atan2(at.y - localPos.y, at.x - localPos.x);
        }
        this.darkness(local, time);
        if(playing&&local?.role==='cop'&&!local.spectator&&!(state!.headStart!>0)&&local.cooldown<=0){
            const t=arrestTarget();
            if(t){
                this.top.lineStyle(2,0x80bde0,.95);
                this.top.strokeEllipse(t.x,t.y+22,78,32);
                this.label('arrest-target',t.x,t.y-66,'E · ARREST',10,'#a9d4ee',1,22);
            }
        }
        if (playing && local && local.role!=='cop' && !local.spectator && !local.captured && !local.escaped) {
            const prop = props.filter(p => dist(local, p) < 100 && los(local, p)).sort((a, b) => dist(local, a) - dist(local, b))[0];
            if (prop) {
                this.top.lineStyle(2, 0xeabe70, .8);
                this.top.strokeEllipse(prop.x, prop.y + 22, 75, 32);
                this.label('target', prop.x, prop.y - 65, 'Q · COPY ' + prop.kind.toUpperCase(), 10, '#f3d9a3', 1, 22);
            }
        }
    }
    /**
     * The dark museum (competitive rounds). Cops see only what flashlights light, plus a faint floor
     * plan; thieves see the whole museum dimmed, with the beams bright so they know when to freeze.
     */
    darkness(local?: Player, time = 0) {
        const s = state, title = !s, on = title || (s.phase === 'playing' && s.mode === 'versus');
        this.dark.setVisible(on);
        if (!on)
            return;
        const geometry = s?.geometry || walls, copEyes = !title && local?.role === 'cop' && !local.spectator;
        // Flashlights stay off while the cops' eyes are closed. The local cop's beam follows the local aim so it feels instant.
        const beams = title ? [lightPolygon(TITLE.cop, TITLE.aim(time), geometry, TITLE.range)]
            : (s.headStart || 0) > 0 ? [] : s.players.filter(p => p.role === 'cop' && p.connected && !p.spectator && !p.hidden)
                .map(p => lightPolygon(this.positions.get(p.id) || p, p.id === myId ? aim : (p.aim ?? Math.PI / 2), geometry));
        for (const poly of beams) {
            // A faint warm wash inside the beam; on the title it flickers like an old torch.
            this.g.fillStyle(0xfff0c8, title ? .09 + .02 * Math.sin(time / 85) : .07);
            this.g.fillPoints(poly, true);
        }
        // The texture covers the camera view plus a margin, so it needs no repositioning maths for zoom or bounds.
        // Sizes are kept even (Phaser rounds odd ones up) so the comparison below is stable.
        const view = this.cameras.main.worldView, pad = 160, even = (n: number) => Math.max(16, Math.ceil(n / 2) * 2);
        const w = even(view.width + pad * 2), h = even(view.height + pad * 2);
        if (this.dark.width !== w || this.dark.height !== h) {
            // Recreate rather than resize: in Phaser 3.90 RenderTexture.resize() leaves the WebGL texture at its old size.
            this.dark.destroy();
            this.dark = this.add.renderTexture(0, 0, w, h).setOrigin(0).setDepth(20);
        }
        this.dark.setPosition(view.x - pad, view.y - pad);
        this.dark.clear().fill(0x03060a, copEyes ? 1 : title ? .93 : .45);
        if (beams.length) {
            this.light.clear().fillStyle(0xffffff, 1);
            for (const poly of beams)
                this.light.fillPoints(poly, true);
            this.dark.erase(this.light, -this.dark.x, -this.dark.y);
        }
        if (copEyes) {
            // A faint floor plan so cops can find their way in the dark: walls, the van and the holding-room lock.
            this.top.fillStyle(0x8fa3a8, .14);
            for (const wall of geometry)
                this.top.fillRect(wall.x, wall.y, wall.w, wall.h);
            this.top.lineStyle(2, 0xeabe70, .22);
            this.top.strokeRoundedRect(700, 970, 280, 145, 15);
            this.top.lineStyle(2, 0xc6a463, .35);
            this.top.strokeRect(LOCK.x - 14, LOCK.y - 9, 28, 28);
        }
        // Sprinting footsteps: an approximate spot, heard through the dark by everyone.
        for (const n of s?.noises || []) {
            const t = Math.min(1, n.age / 1.2);
            this.top.lineStyle(2, 0xeabe70, .7 * (1 - t));
            this.top.strokeCircle(n.x, n.y, 12 + t * 45);
        }
    }
}
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: window.innerWidth, height: window.innerHeight, backgroundColor: '#101923', antialias: true,  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: Museum, render: { roundPixels: true }, input: { activePointers: 3 } });
render();
