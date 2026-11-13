import {createMuseumFloor} from './museum-textures';
import Phaser from 'phaser';
import { io } from 'socket.io-client';
import { MAPS, predictPosition, WORLD, walls, props, lootSeeds, VAN, LOCK, NOISE, COLORS, dist, los as baseLos, type State, type Player, type Point } from '../../shared/world';
import './styles.css';
function los(a:Point,b:Point){return baseLos(a,b,state?.geometry||walls);}
const ui = document.querySelector<HTMLDivElement>('#ui')!;
const socket = io((import.meta as any).env.VITE_SERVER_URL || undefined, { autoConnect: true });
let snapshotAt=performance.now();
let state: State | null = null, myId = '', selectedColor = COLORS[0], screen = '', toast = '', toastUntil = 0, muted = localStorage.getItem('petty-muted') === '1', help = false;
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
function notice(s: string) { toast = s; toastUntil = Date.now() + 5000; const e = document.querySelector('.error'); if (e)
    e.textContent = s; }
function action(a: string) { if(me()?.role==='cop'&&(a==='transform'||a==='drop'))return; tone(a === 'transform' ? 660 : 360); socket.emit('action', a); }
function join(create: boolean) { const name = (document.querySelector<HTMLInputElement>('#name')?.value || '').trim(); const code = (document.querySelector<HTMLInputElement>('#code')?.value || '').trim().toUpperCase(); if (!name) {
    notice('Every art criminal needs a name.');
    return;
} socket.emit('join', { create, code, name, color: selectedColor }, (r: any) => { if (r.error) {
    notice(r.error);
    return;
} myId = r.id; saved = { token: r.token, code: r.code, name }; sessionStorage.setItem('petty-session', JSON.stringify(saved)); tone(); }); }
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
    return 'Interact'; if(p.role==='cop') return (state.headStart||0)>0?`Briefing · ${Math.ceil(state.headStart!)}s`:p.cooldown>0?`Inspect · ${Math.ceil(p.cooldown)}s`:'Inspect area';
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
function home() { ui.innerHTML = `<main class="screen"><header class="topline">${brand()}<a class="guide-link" href="/how-to-play.html" target="_blank" rel="noopener">How to play ↗</a></header><section class="intro"><div class="kicker">2–6 FRIENDS. ONE VERY BAD IDEA.</div><h1>GOOD ART.<br><span>BAD INTENT.</span></h1><p>Get the gang. Steal the good stuff.<br>When things get awkward, become a chair.</p><div class="form"><div><label for="name">YOUR CRIMINAL ALIAS</label><input id="name" maxlength="16" placeholder="e.g. Shady Fern" autocomplete="nickname"></div><div class="swatches" aria-label="Character colour">${COLORS.map((c, i) => `<button class="swatch ${c === selectedColor ? 'selected' : ''}" data-color="${c}" style="background:${c}" aria-label="Colour ${i + 1}"></button>`).join('')}</div><button id="create" class="primary">Assemble a crew <span style="float:right">↗</span></button><div class="divider">ALREADY AN ACCOMPLICE?</div><div class="joinline"><input id="code" maxlength="4" placeholder="CODE" aria-label="Room code"><button id="join">Join crew →</button></div><div class="error" role="alert"></div></div></section><aside class="tag">EXHIBIT A: A COMPLETELY NORMAL PLANT.</aside><footer class="footer"><span>COPS VS THIEVES · QUESTIONABLE FURNITURE</span><span>NO HONOUR AMONG HOUSEPLANTS.</span></footer></main>`; document.querySelector('#create')!.addEventListener('click', () => join(true)); document.querySelector('#join')!.addEventListener('click', () => join(false)); document.querySelectorAll<HTMLButtonElement>('[data-color]').forEach(b => b.onclick = () => { selectedColor = b.dataset.color!; document.querySelectorAll('.swatch').forEach(s => s.classList.remove('selected')); b.classList.add('selected'); }); }
function lobby() { if (!state)
    return; ui.innerHTML = `<main class="screen"><header class="topline">${brand()}<span class="edition">PREPARING A PERFECTLY INNOCENT VISIT</span></header><section class="lobby"><div class="kicker">YOUR CREW’S PRIVATE INVITATION</div><h1>Room <span class="code">${state.code}</span></h1><p class="muted" style="font-size:12px">Share this page and the room code. ${state.players.length}/6 accomplices.</p><div class="map-picker"><label for="map-choice">MUSEUM LAYOUT · HOST CHOOSES</label><select id="map-choice" ${state.host!==myId?'disabled':''}><option value="-1" ${(state.selectedMap??-1)===-1?'selected':''}>Random museum</option>${MAPS.map((m,i)=>`<option value="${i}" ${state!.selectedMap===i?'selected':''}>${m.name}</option>`).join('')}</select><p class="muted">Three museum layouts. Changing the map resets readiness.</p><a class="guide-link" href="/how-to-play.html" target="_blank" rel="noopener">Read the rules ↗</a></div><div class="crew">${state.players.map(p => `<div class="crew-member"><i class="dot" style="background:${p.color}"></i>${escape(p.name)}${p.id === state!.host ? ' ♛' : ''}<small>${!p.connected ? 'OFFLINE' : p.ready ? 'READY' : 'GETTING SHADY'}</small></div>`).join('')}</div><div class="rules"><b style="color:#eabe70">THE JOB</b> · Thieves get a 12-second head start. Rescue grants 5 seconds of protection. Random teams each round: cops inspect suspects with E; thieves steal the displayed quota in 7 minutes, deposit it at the van, then interact again to escape. Cops win on timeout or by capturing all thieves. Everyone still free must extract; captured or offline thieves may be left behind.<br><br><b>WASD / arrows</b> move · <b>E</b> interact · <b>Q</b> copy a nearby prop · <b>R</b> drop.<br>Still props stay hidden. Moving props look suspicious. A disguise won’t fool a guard already chasing you. Two thieves carry paintings faster; the first steers. Rescue friends at the holding-room lock.</div><div class="actions"><button class="primary" data-action="ready">${me()?.ready ? 'Unready' : 'I’m in · Ready up'}</button>${state.host === myId ? '<button data-action="start">Start the heist →</button>' : '<span class="muted" style="font-size:12px;padding:12px">The host starts when everyone is ready.</span>'}<button id="copy" class="ghost">Copy invitation</button><button id="leave" class="ghost">Leave crew</button></div><div class="error" role="alert"></div></section><footer class="footer"><span>MUSEUM OF QUESTIONABLE TASTE</span><span>PLEASE DO NOT TOUCH THE EXHIBITS.</span></footer></main>`; bind(); document.querySelector<HTMLSelectElement>('#map-choice')!.onchange=e=>action('map:'+(e.target as HTMLSelectElement).value); document.querySelector<HTMLButtonElement>('#leave')!.onclick = leaveRoom; document.querySelector<HTMLButtonElement>('#copy')!.onclick = () => { navigator.clipboard.writeText(`${location.origin} — PETTY THEFT room ${state!.code}`).then(() => notice('Invitation copied.'), () => notice(`Share ${location.origin} and code ${state!.code}`)); }; }
function playing() { ui.innerHTML = `<div class="rotate-hint">↻ Rotate your phone<br><small>This heist plays in landscape.</small></div><div class="round-banner" id="round-banner"></div><div class="mission" id="mission"></div><div class="hud">${brand()}<div class="stats"><div class="stat"><label>LOCKDOWN IN</label><strong id="timer"></strong></div><div class="stat"><label>CREW’S HAUL</label><strong id="haul"></strong><div class="progress"><i id="bar"></i></div></div></div><div style="display:flex;gap:7px"><button id="mute" aria-label="Toggle audio">${muted ? 'Sound off' : 'Sound on'}</button><button id="help">?</button></div></div><div class="objective">${state!.mapName||'MUSEUM OF QUESTIONABLE TASTE'} · ROOM ${state!.code}</div><div class="status"><div class="status-card"><b id="stealth"></b><span id="bag"></span></div><div class="status-card" id="partners"></div></div><div class="controls"><button data-action="sprint"><span class="key">SPACE</span><span id="sprint-label">Sprint</span></button><button data-action="interact"><span class="key">E</span><span id="interact-label"></span></button><button data-action="transform"><span class="key">Q</span><span id="transform-label"></span></button><button data-action="drop"><span class="key">R</span>Drop</button></div><div class="joystick"><div class="stick"></div></div><div class="toast" hidden></div>`; bind(); document.querySelector<HTMLButtonElement>('#mute')!.onclick = () => { muted = !muted; localStorage.setItem('petty-muted', muted ? '1' : '0'); document.querySelector('#mute')!.textContent = muted ? 'Sound off' : 'Sound on'; }; document.querySelector<HTMLButtonElement>('#help')!.onclick = showHelp; const joy = document.querySelector<HTMLDivElement>('.joystick')!; let pointer: number | null = null; const update = (e: PointerEvent) => { const r = joy.getBoundingClientRect(), dx = e.clientX - r.left - r.width / 2, dy = e.clientY - r.top - r.height / 2, n = Math.max(40, Math.hypot(dx, dy)); stick = { x: dx / n, y: dy / n }; (joy.firstChild as HTMLElement).style.transform = `translate(${stick.x * 32}px,${stick.y * 32}px)`; }; joy.onpointerdown = e => { pointer = e.pointerId; joy.setPointerCapture(pointer); update(e); }; joy.onpointermove = e => { if (e.pointerId === pointer)
    update(e); }; joy.onpointerup = joy.onpointercancel = () => { pointer = null; stick = { x: 0, y: 0 }; (joy.firstChild as HTMLElement).style.transform = ''; }; }
function leaveRoom() { socket.emit('leave'); saved = null; sessionStorage.removeItem('petty-session'); state = null; myId = ''; screen = ''; help = false; render(); }
function bind() { document.querySelectorAll<HTMLButtonElement>('[data-action]').forEach(b => b.onclick = () => action(b.dataset.action!)); }
function showHelp() { if (help)
    return; help = true; const d = document.createElement('div'); d.className = 'help'; d.innerHTML = '<button id="close-help">Close ×</button><h2>COPS &amp; THIEVES</h2><p>Roles and museum layout are randomly assigned each round. Thieves get a 12-second head start while cops are held at spawn. Rescued thieves have 5 seconds of arrest protection (green shield). Cops: press E within 65 units to inspect a suspect. Correct arrests recharge in 2 seconds; misses take 4. Thieves are faster, can copy props, and can rescue each other. The van apron is protected from arrest. Cops win on timeout or when all thieves are captured.</p><p><b>Move:</b> WASD / arrows, or the thumbstick. <b>E:</b> interact. <b>Q:</b> disguise. <b>R:</b> drop everything.</p><p>Copy a highlighted prop nearby. All disguises use the same small collision footprint. Standing still keeps you hidden unless already spotted. Break sight and let suspicion fade. Guards cannot see through walls.</p><p>Pocket up to two small treasures. Paintings need two thieves for full speed: first carrier steers, second assists. Either drops both ends. Disguises are unavailable with paintings.</p><p>At the holding room, interact and stand still for 3 seconds to rescue everyone. The gramophone draws nearby guards and recharges in 25 seconds.</p><p>Deposit the displayed quota at the van, then interact empty-handed to escape. All free connected thieves must escape to win. Captured or disconnected friends can be left behind. All captured or the timer reaching zero ends the heist. Late arrivals watch until the next round.</p><p>Disconnected thieves drop loot. Rejoin in the same tab to recover your identity; an entirely empty room is retained for 2 minutes. The heist clock keeps running.</p><button id="touch-toggle">Toggle touch controls</button><button id="leave-game">Leave crew</button>'; d.querySelector<HTMLButtonElement>('#close-help')!.onclick = () => { d.remove(); help = false; }; d.querySelector<HTMLButtonElement>('#leave-game')!.onclick = leaveRoom; d.querySelector<HTMLButtonElement>('#touch-toggle')!.onclick = () => { document.body.classList.toggle('touch'); d.remove(); help = false; }; ui.append(d); }
function updateHud() { const p = me(); if (!p || !state)
    return;
    document.querySelector<HTMLButtonElement>('[data-action="transform"]')!.hidden=p.role==='cop';
    document.querySelector<HTMLButtonElement>('[data-action="drop"]')!.hidden=p.role==='cop';
    document.querySelector<HTMLButtonElement>('[data-action="interact"]')!.disabled=p.captured||p.escaped||p.spectator||(p.role==='cop'&&((state.headStart||0)>0||p.cooldown>0));
    document.querySelector('#sprint-label')!.textContent=p.disguise?'Unhide to sprint':p.sprintCooldown!>0?`Sprint · ${Math.ceil(p.sprintCooldown!)}s`:'Sprint';
    const banner=document.querySelector<HTMLElement>('#round-banner')!;
    banner.hidden=!(state.headStart!>0);
    banner.textContent=`${p.role==='cop'?'YOU ARE A COP · BRIEFING':'YOU ARE A THIEF · GET HIDING'} · ${Math.ceil(state.headStart||0)}s`;
    const mission=document.querySelector<HTMLElement>('#mission')!;
    const captured=state.players.filter(q=>q.role!=='cop'&&q.captured).length;
    mission.textContent=p.spectator?'Spectating · join next round':p.escaped?'Extracted · waiting for crew':p.captured?'HOLDING ROOM · Wait for a teammate to pick the lock':p.role==='cop'?'INSPECT WITH E · Find moving props and stop the escape':p.protectedFor!>0?`RESCUED · Safe for ${Math.ceil(p.protectedFor!)}s`:state.total>=state.quota?'QUOTA MET · Return to the van and press E to escape':captured?`${captured} TEAMMATE(S) CAPTURED · Rescue at the holding-room lock`:'STEAL → DEPOSIT AT THE VAN → REACH QUOTA → ESCAPE';
    document.querySelector('#timer')!.classList.toggle('urgent',state.seconds<=30);
    document.querySelector('#timer')!.textContent = `${Math.floor(state.seconds / 60)}:${String(Math.floor(state.seconds % 60)).padStart(2, '0')}`; document.querySelector('#haul')!.textContent = `$${state.total.toLocaleString()} / $${state.quota.toLocaleString()}`; (document.querySelector('#bar') as HTMLElement).style.width = Math.min(100, state.total / state.quota * 100) + '%'; document.querySelector('#stealth')!.textContent = p.role==='cop' ? 'COP · INSPECT WITH E · STOP THE HEIST' : p.spectator ? 'WATCHING THE CREW' : p.escaped ? 'SAFE IN THE VAN' : p.captured ? 'CAPTURED · CREW CAN RESCUE YOU' : p.suspicion > .65 ? 'SPOTTED · BREAK LINE OF SIGHT' : p.suspicion > .05 ? 'SUSPICIOUS · KEEP YOUR COOL' : p.disguise ? (p.moving ? 'MOVING PROP · BE CAREFUL' : 'HIDDEN · PERFECTLY NORMAL') : 'THIEF · KEEP A LOW PROFILE'; const carried = state.loot.filter(l => l.carriers.includes(myId)); const painting = carried.find(l => l.large); document.querySelector('#bag')!.textContent = painting ? `Painting · ${painting.carriers.length === 2 ? (painting.carriers[0] === myId ? 'you steer' : 'partner steers') : 'partner needed · slow carry'}` : `Pockets ${carried.length}/2 · $${carried.reduce((n, l) => n + l.value, 0)}${p.disguise ? ' · ' + p.disguise : ''}`; document.querySelector('#interact-label')!.textContent = target(); document.querySelector('#transform-label')!.textContent = transformLabel(); document.querySelector('#partners')!.textContent = state.players.filter(p => p.connected && !p.spectator).map(p => `${p.captured ? '×' : p.escaped ? '✓' : '●'} ${p.name}`).join('  '); const t = document.querySelector<HTMLDivElement>('.toast')!; t.hidden = Date.now() > toastUntil || (state.headStart||0)>0; t.textContent = toast; }
function results() {
 const s=state!,p=me(),team=p?.role==='cop'?'cops':'thieves';
 const spectator=!p||p.spectator;
 const won=!spectator&&s.winner===team;
 const winners=s.winner==='cops'?'COPS':'THIEVES';
 const title=spectator?`${winners} WIN`:won?(team==='cops'?'CASE CLOSED.':'A CLEAN GETAWAY.'):(team==='cops'?'THEY GOT AWAY.':'BUSTED.');
 const subtitle=spectator?'The next round needs an accomplice.':won?(team==='cops'?'Your squad protected the collection.':'Your crew pulled off the heist.'):(team==='cops'?'The furniture outsmarted you. Next time.':'The museum keeps its secrets. Try again.');
 ui.innerHTML=`<main class="screen result-screen ${won?'victory':'defeat'}"><header>${brand()}</header>${won?`<div class="confetti" aria-hidden="true">${Array.from({length:28},(_,i)=>`<i style="--x:${(i*37)%100}%;--delay:${i%7*.2}s;--hue:${i%2?'#83d3bd':'#eabe70'}"></i>`).join('')}</div>`:''}<section class="lobby result-panel"><div class="kicker">${spectator?'MATCH COMPLETE':won?'VICTORY · YOUR TEAM WINS':'DEFEAT · NEXT ROUND, NEW PLAN'}</div><h1 class="results-title">${title}</h1><p>${subtitle}</p><p class="rules">${escape(s.outcome)}<br>${winners} WIN · ${escape(s.mapName||'Museum')} · $${s.total.toLocaleString()} / $${s.quota.toLocaleString()} deposited</p><div class="crew">${s.players.filter(q=>!q.spectator).map(q=>`<div class="crew-member"><i class="dot" style="background:${q.color}"></i><div>${escape(q.name)}<div class="muted" style="font-size:11px;margin-top:6px">${q.role==='cop'?`COP · ${q.score} arrests`:`THIEF · $${q.score} delivered · ${q.rescues} rescues`}<br>${q.role==='cop'?'':q.escaped?'Escaped':q.captured?'Captured':!q.connected?'Disconnected':'Still inside'}</div></div></div>`).join('')}</div><div class="actions">${s.host===myId?'<button class="primary" data-action="again">Back to lobby · choose next map →</button>':'<p class="muted">Waiting for the host to return to the lobby.</p>'}<button id="results-leave">Leave room</button><a class="guide-link" href="/how-to-play.html" target="_blank" rel="noopener">How to play ↗</a></div></section></main>`;
 bind();document.querySelector<HTMLButtonElement>('#results-leave')!.onclick=leaveRoom;
 tone(won?880:180);
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
setInterval(() => { desired = { x: (keyState.has('d') || keyState.has('arrowright') ? 1 : 0) - (keyState.has('a') || keyState.has('arrowleft') ? 1 : 0) + stick.x, y: (keyState.has('s') || keyState.has('arrowdown') ? 1 : 0) - (keyState.has('w') || keyState.has('arrowup') ? 1 : 0) + stick.y }; if (state?.phase === 'playing' && socket.connected)
    socket.emit('input', desired); if (state?.phase === 'playing')
    updateHud(); }, 50);
const hex = (s: string) => parseInt(s.replace('#', ''), 16);
class Museum extends Phaser.Scene {
    g!: Phaser.GameObjects.Graphics;
    labels = new Map<string, Phaser.GameObjects.Text>();
    positions = new Map<string, Point>();
    cameraPoint = { x: 1050, y: 550 };
    artPool:Phaser.GameObjects.Image[]=[];
    artIndex=0;
    floorPhase=false;
    preload(){this.load.image('museum-atlas','/assets/museum-atlas.png');}
    art(kind:string,x:number,y:number,size=86){
        if(!this.textures.exists('museum-atlas'))return false;
        const frame={plant:0,bench:1,statue:2,bin:3,thief:4,cop:5}[kind as 'plant'];
        if(frame===undefined)return false;
        let sprite=this.artPool[this.artIndex++];
        if(!sprite){sprite=this.add.image(x,y,'museum-atlas',frame).setOrigin(.5,.82);this.artPool.push(sprite);}
        sprite.setTexture('museum-atlas',frame).setPosition(x,y).setDisplaySize(size,size).setDepth(3+y/10000).setVisible(true);
        return true;
    }
    create() {
        createMuseumFloor(this);this.add.image(0,0,'museum-floor').setOrigin(0).setDepth(-1);
        if(this.textures.exists('museum-atlas')){const texture=this.textures.get('museum-atlas'),source=texture.getSourceImage();const w=Math.floor(source.width/3),h=Math.floor(source.height/2);for(let i=0;i<6;i++)texture.add(i,0,i%3*w,Math.floor(i/3)*h,w,h);}
        this.g = this.add.graphics(); this.cameras.main.setBackgroundColor('#101923'); this.cameras.main.setBounds(-80, -80, WORLD.w + 160, WORLD.h + 160); }
    label(id: string, x: number, y: number, text: string, size = 12, color = '#9badaf', alpha = 1) { let t = this.labels.get(id); if (!t) {
        t = this.add.text(x, y, text, { fontFamily: 'DM Sans, sans-serif', fontSize: size, color, align: 'center' }).setOrigin(.5).setDepth(10);
        this.labels.set(id, t);
    } t.setPosition(x, y).setText(text).setColor(color).setAlpha(alpha); }
    rect(x: number, y: number, w: number, h: number, c: number, r = 0) { if(this.floorPhase)return; this.g.fillStyle(c, 1); r ? this.g.fillRoundedRect(x, y, w, h, r) : this.g.fillRect(x, y, w, h); }
    ellipse(x: number, y: number, w: number, h: number, c: number, a = 1) { this.g.fillStyle(c, a); this.g.fillEllipse(x, y, w, h); }
    prop(kind: string, x: number, y: number, tint?: number) { if(this.art(kind,x,y,kind==='bench'?98:86))return; const g = this.g; this.ellipse(x + 4, y + 12, 65, 25, 0x080e16, .45); if (kind === 'plant') {
        this.rect(x - 13, y + 1, 26, 26, 0x9e6b4d, 4);
        this.rect(x - 17, y - 1, 34, 8, 0xc39168, 3);
        g.lineStyle(4, 0x5c9376);
        g.lineBetween(x, y + 2, x, y - 27);
        for (const [dx, dy, a] of [[-17, -22, -.6], [16, -28, .5], [-10, -38, -.4], [5, -46, .1], [22, -12, .7]]) {
            g.fillStyle(tint || 0x6da68b);
            g.fillEllipse(x + dx, y + dy, 25, 15);
        }
        this.ellipse(x - 2, y - 29, 15, 28, 0x8cbea1);
    }
    else if (kind === 'bench') {
        this.rect(x - 28, y + 6, 7, 17, 0x775342, 2);
        this.rect(x + 21, y + 6, 7, 17, 0x775342, 2);
        this.rect(x - 35, y - 11, 70, 25, tint || 0xac7856, 5);
        g.lineStyle(2, 0xd0a271);
        g.lineBetween(x - 28, y - 3, x + 28, y - 3);
        g.lineBetween(x - 28, y + 5, x + 28, y + 5);
    }
    else if (kind === 'bin') {
        this.rect(x - 19, y - 28, 38, 49, tint || 0x658f92, 5);
        this.rect(x - 22, y - 29, 44, 9, 0x8cafad, 3);
        this.rect(x - 12, y - 17, 24, 8, 0x203a47, 3);
        g.lineStyle(2, 0x436970);
        g.lineBetween(x - 10, y - 2, x - 10, y + 14);
        g.lineBetween(x + 9, y - 2, x + 9, y + 14);
    }
    else {
        this.rect(x - 24, y + 1, 48, 24, 0x6e848a, 3);
        this.rect(x - 28, y, 56, 7, 0xa6b1ac, 2);
        this.rect(x - 13, y - 27, 26, 30, tint || 0xc2c3ad, 5);
        this.ellipse(x, y - 39, 29, 32, tint || 0xd8d1b6);
        this.rect(x - 21, y - 20, 42, 9, tint || 0xb5bca9, 4);
    } }
    thief(p: Player, x: number, y: number, time: number) { const g = this.g;
        if(p.protectedFor!>0){g.lineStyle(3,0x83d3bd,.5+.3*Math.sin(time/150));g.strokeCircle(x,y-10,36);}
        if(p.role==='cop'&&p.cooldown>0&&p.cooldown<.6){g.lineStyle(2,0x80bde0,p.cooldown);g.strokeCircle(x,y,65);}
        if(p.sprintFor!>0){g.lineStyle(2,0xc0d9e6,.4);g.lineBetween(x-25,y+5,x-45,y+5);g.lineBetween(x-20,y+15,x-35,y+15);}
        this.ellipse(x + 3, y + 17, 36, 14, 0x080d13, .5); if (p.disguise) {
        this.prop(p.disguise, x, y);
        g.lineStyle(2, hex(p.color), me()?.role==='cop'&&p.role!=='cop'?0:.8);
        g.strokeEllipse(x, y + 24, 42, 14);
    }
    else if(this.art(p.role==='cop'?'cop':'thief',x,y+(p.moving?Math.sin(time/90)*2:0),88)){
        g.lineStyle(3,hex(p.color),.9);g.strokeEllipse(x,y+17,36,13);
    }
    else {
        const bob = p.moving ? Math.sin(time / 90) * 3 : 0;
        this.rect(x - 10, y + 7, 7, 13 + Math.max(0, bob), 0x14232d, 2);
        this.rect(x + 3, y + 7, 7, 13 + Math.max(0, -bob), 0x14232d, 2);
        this.rect(x - 14, y - 15 + bob, 28, 30, hex(p.color), 9);
        this.ellipse(x, y - 22 + bob, 28, 29, 0xd3b49a);
        this.rect(x - 16, y - 34 + bob, 32, 12, p.role==='cop'?0x467dba:0x24333f, 6);if(p.role==='cop')this.ellipse(x,y-30+bob,7,7,0xffd77f);
        this.rect(x - 15, y - 25 + bob, 30, 10, 0x192833, 3);
        this.ellipse(x - 6, y - 20 + bob, 4, 4, 0xf5ebd5);
        this.ellipse(x + 6, y - 20 + bob, 4, 4, 0xf5ebd5);
        this.rect(x + 13, y - 9 + bob, 10, 20, 0x9a7653, 4);
    } if (p.id === myId) {
        g.lineStyle(2, 0xeabe70, .7);
        g.strokeEllipse(x, y + 23, 40, 14);
        g.fillStyle(0xeabe70);
        g.fillTriangle(x - 5, y - 58, x + 5, y - 58, x, y - 52);
    } if (p.suspicion > 0) {
        g.lineStyle(4, p.suspicion > .65 ? 0xea826b : 0xeabe70);
        g.beginPath();
        g.arc(x, y - 14, 31, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * p.suspicion);
        g.strokePath();
    } if(!(me()?.role==='cop'&&p.role!=='cop'&&p.disguise))this.label(p.id, x, y + 40, (p.role==='cop'?'OFFICER · ':'')+p.name, 11, p.color); }
    update(time: number, delta: number) {
        const g = this.g;
        g.clear();
        this.artIndex=0;this.artPool.forEach(s=>s.setVisible(false));
        this.labels.forEach(l => l.setAlpha(0));
        const playing = state?.phase === 'playing';
        const local = me();
        const watching = local && (local.spectator || local.escaped);
        const focus = watching ? state?.players.find(p => p.connected && !p.captured && !p.escaped && !p.spectator) : local;
        const zoom = playing ? (window.innerWidth < 650 ? .8 : 1.05) : Math.max(window.innerWidth / 1800, window.innerHeight / 1300);
        this.cameras.main.setZoom(zoom);
        let fx = playing && focus ? focus.x : 1020, fy = playing && focus ? focus.y : 530;
        if (!playing)
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
        for(const x of [1730,2220]){g.lineStyle(2,0xd1bb85,.25);g.strokeRect(x,80,340,420);}
        // Skylight reflections and long shafts of cool moonlight.
        for(const x of [1800,2270]){g.fillStyle(0xa4c7d9,.035);g.fillTriangle(x,70,x+180,70,x+330,500);g.fillTriangle(x,70,x+330,500,x+150,500);}
        this.label('east-route',1580,345,'EAST WING →',10,'#eabe70');
        this.floorPhase=false;
        g.lineStyle(1, 0x9cafa2, .045);
        for (let x = 28; x < WORLD.w; x += 48)
            g.lineBetween(x, 28, x, 920);
        for (let y = 28; y < 920; y += 48)
            g.lineBetween(28, y, 2612, y);
        // Inlaid marble borders and polished floor seams.
        g.lineStyle(2,0xc4b391,.14);
        for(const x of [44,590,1150])g.strokeRect(x,108,480,420);
        for(const x of [70,610,1160]){this.rect(x,110,12,390,0x172b34,3);this.rect(x+2,110,3,390,0x657774,1);}
        // Woven runners and warm pools of museum lighting.
        for (const [x, y, w, h] of [[655, 275, 370, 150], [1200, 265, 370, 160], [190, 610, 245, 275]]) {
            this.rect(x, y, w, h, 0x6a4243, 3);
            g.lineStyle(2, 0xa17c60, .4);
            g.strokeRect(x + 10, y + 10, w - 20, h - 20);
        }
        for (const [x, y] of [[290, 150], [840, 145], [1390, 145], [290, 680], [840, 680], [1390, 680]])
            for (let r = 150; r > 20; r -= 20)
                this.ellipse(x, y, r * 2, r * 1.3, 0xe7bc72, .012);
        for (const w of (state?.geometry||walls)) {
            this.rect(w.x + 5, w.y + 7, w.w, w.h, 0x111e29);
            this.rect(w.x, w.y, w.w, w.h, 0x59676a);
            this.rect(w.x, w.y, w.w, 5, 0x7a8581);
        }
        for (const [x, c] of [[170, 0x95b7a1], [400, 0xb98e79], [710, 0xb6a56f], [970, 0x9aa9bb], [1250, 0xad8a9e], [1500, 0xb5ad8c]]) {
            this.rect(x - 34, 39, 68, 56, 0x17242d, 3);
            this.rect(x - 30, 36, 60, 49, 0xb28e56, 2);
            this.rect(x - 24, 42, 48, 37, c);
            this.ellipse(x, 59, 22, 26, 0x45575b);
        }
        this.label('wing1', 285, 490, 'THE OLD MONEY WING', 13, '#829b98');
        this.label('wing2', 840, 505, 'GALLERY OF GREAT TASTE', 13, '#9c9890');
        this.label('wing3', 1390, 495, 'OBJECTS OF DESIRE', 13, '#9a93a4');
        this.label('wing4', 850, 875, 'NIGHT VISITORS WELCOME', 11, '#7c9b98');
        // Van and extraction zone.
        g.lineStyle(2, 0xeabe70, .25);
        g.strokeRoundedRect(700, 970, 280, 145, 15);
        this.rect(760, 1015, 160, 78, 0x9ba99b, 12);
        this.rect(868, 1022, 42, 54, 0x233b45, 5);
        this.rect(772, 1025, 86, 48, 0x708c82, 4);
        this.rect(780, 1090, 27, 12, 0x0c1720, 4);
        this.rect(872, 1090, 27, 12, 0x0c1720, 4);
        this.rect(912, 1025, 8, 12, 0xeabe70, 2);
        this.label('van', 835, 1060, 'NO QUESTIONS ASKED', 9, '#e5dfc8');
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
            g.lineStyle(3, 0xeabe70, .5);
            g.strokeCircle(NOISE.x, NOISE.y, 40 + (time / 15) % 90);
        }
        this.label('noise', NOISE.x, NOISE.y + 48, 'MAKE SOME NOISE', 9, '#c6ae83');
        for (const prop of props)
            this.prop(prop.kind, prop.x, prop.y);
        const allLoot = state?.loot.length ? state.loot : lootSeeds.map((l, i) => ({ ...l, id: 'demo' + i, value: 0, carriers: [], deposited: false }));
        for (const l of allLoot) {
            if (l.deposited)
                continue;
            if (l.carriers.length && !l.large)
                continue;
            if (l.large) {
                this.ellipse(l.x, l.y + 22, 100, 25, 0x09131c, .4);
                this.rect(l.x - 44, l.y - 24, 88, 58, 0xc9a264, 3);
                this.rect(l.x - 36, l.y - 16, 72, 42, 0x35464c);
                this.ellipse(l.x, l.y + 4, 28, 35, 0xb7b69a);
                this.ellipse(l.x + 4, l.y - 7, 19, 18, 0x7c9b8a);
                if (l.carriers.length === 1)
                    this.label('carry' + l.id, l.x, l.y - 43, 'PARTNER NEEDED', 9, '#eabe70');
            }
            else {
                this.ellipse(l.x, l.y + 15, 47, 17, 0x0d1c26, .5);
                this.rect(l.x - 19, l.y - 2, 38, 24, 0x83938f, 2);
                this.rect(l.x - 23, l.y - 6, 46, 8, 0xb3b9a7, 2);
                g.fillStyle(0xe5be76);
                g.fillTriangle(l.x - 11, l.y - 20, l.x, l.y - 35, l.x + 11, l.y - 20);
                g.fillTriangle(l.x - 11, l.y - 20, l.x + 11, l.y - 20, l.x, l.y - 9);
                g.lineStyle(1, 0xf4dfac, .6);
                g.strokeCircle(l.x, l.y - 21, 22 + Math.sin(time / 500) * 2);
            }
        }
        const guards = state?.phase==='playing' ? state.guards : [{ id: 'demo-guard', x: 1060, y: 650, angle: -2.3, mode: 'patrol' }];
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
            this.ellipse(guard.x + 3, guard.y + 18, 35, 13, 0x07111a, .4);
            this.rect(guard.x - 14, guard.y - 13, 28, 32, 0x718998, 7);
            this.ellipse(guard.x, guard.y - 21, 26, 25, 0xc2a68e);
            this.rect(guard.x - 17, guard.y - 35, 34, 14, 0x344d60, 4);
            this.rect(guard.x - 17, guard.y - 25, 34, 4, 0xadc0b8);
            this.rect(guard.x + 6, guard.y - 6, 5, 7, 0xeabe70, 1);
            if (guard.mode !== 'patrol')
                this.label(guard.id + 'alert', guard.x, guard.y - 52, chase ? '!' : '?', 22, chase ? '#ed8b71' : '#eabe70');
        }
        if (state?.phase === 'playing' || state?.phase === 'results') {
            for (const p of state.players) {
                if (p.spectator || p.escaped || !p.connected)
                    continue;
                let pos = this.positions.get(p.id);
                if (!pos || dist(pos, p) > 200) {
                    pos = { x: p.x, y: p.y };
                    this.positions.set(p.id, pos);
                }
                const predicted=p.id===myId?predictPosition(p,desired,(performance.now()-snapshotAt)/1000,state):p;
                const blend = 1 - Math.exp(-delta / (p.id === myId ? 25 : 90));
                pos.x = Phaser.Math.Linear(pos.x, predicted.x, blend);
                pos.y = Phaser.Math.Linear(pos.y, predicted.y, blend);
                this.thief(p, pos.x, pos.y, time);
            }
        }
        else {
            this.prop('plant', 1080, 760);
            this.label('demo-name', 1080, 806, 'ABSOLUTELY NOT A THIEF', 10, '#eabe70');
        }
        if(playing&&local?.role==='cop'&&!local.spectator){
            const position=this.positions.get(local.id)||local;
            const ready=!(state!.headStart!>0)&&local.cooldown<=0;
            g.lineStyle(1,0x80bde0,ready?.3:.12);
            g.strokeCircle(position.x,position.y,65);
            this.label('inspect-area',position.x,position.y-65,ready?'E · INSPECT AREA':(state!.headStart!>0?'BRIEFING':'INSPECTION RECHARGING'),10,'#80bde0');
        }
        if (playing && local && local.role!=='cop' && !local.spectator && !local.captured && !local.escaped) {
            const prop = props.filter(p => dist(local, p) < 100 && los(local, p)).sort((a, b) => dist(local, a) - dist(local, b))[0];
            if (prop) {
                g.lineStyle(2, 0xeabe70, .8);
                g.strokeEllipse(prop.x, prop.y + 22, 75, 32);
                this.label('target', prop.x, prop.y - 65, 'Q · COPY ' + prop.kind.toUpperCase(), 10, '#f3d9a3');
            }
        }
    }
}
new Phaser.Game({ type: Phaser.AUTO, parent: 'game', width: window.innerWidth, height: window.innerHeight, backgroundColor: '#101923', antialias: true,  scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: Museum, render: { roundPixels: false }, input: { activePointers: 3 } });
render();
