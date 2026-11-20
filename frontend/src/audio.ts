/**
 * All sound is synthesised with Web Audio (no audio files): effects, directional cues and a quiet generative
 * music loop per map. Sound and music volumes are separate settings, remembered on this device.
 */
type Theme = 'museum' | 'market' | 'arcade' | 'title';
const saved = (k: string, d: number) => { try { const v = Number(localStorage.getItem(k)); return Number.isFinite(v) && localStorage.getItem(k) !== null ? v : d; } catch { return d; } };
export const volume = { sound: saved('petty-sound', 0.8), music: saved('petty-music', 0.4) };
let ctx: AudioContext | null = null, sfx: GainNode, music: GainNode, noise: AudioBuffer;
let theme: Theme | null = null, beat = 0, nextAt = 0, timer: number | undefined;

function boot() {
    if (ctx) return ctx;
    try { ctx = new AudioContext(); } catch { return null; }
    sfx = ctx.createGain(); music = ctx.createGain();
    sfx.connect(ctx.destination); music.connect(ctx.destination);
    sfx.gain.value = volume.sound; music.gain.value = volume.music * 0.35;
    noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = noise.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return ctx;
}
/** Browsers only allow audio after a gesture; call from any input handler. */
export function unlock() { const c = boot(); if (c && c.state !== 'running') void c.resume(); }
export function setVolume(kind: 'sound' | 'music', v: number) {
    volume[kind] = v;
    try { localStorage.setItem('petty-' + kind, String(v)); } catch { }
    if (!ctx) return;
    if (kind === 'sound') sfx.gain.value = v; else music.gain.value = v * 0.35;
}

function tone(freq: number, dur: number, type: OscillatorType, gain: number, out: AudioNode, at = 0, slide?: number) {
    const c = ctx!, o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(slide, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(gain, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out); o.start(t); o.stop(t + dur + 0.02);
}
function hiss(dur: number, gain: number, out: AudioNode, freq = 1200, at = 0) {
    const c = ctx!, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + at;
    s.buffer = noise; f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = 0.8;
    g.gain.setValueAtTime(gain, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(out); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.02);
}

/** Plays an effect, optionally placed left/right and attenuated (0–1) by distance. */
export function play(name: string, opts: { pan?: number; level?: number } = {}) {
    const c = boot();
    if (!c || c.state !== 'running' || volume.sound <= 0) return;
    const pan = c.createStereoPanner(), level = c.createGain();
    pan.pan.value = Math.max(-1, Math.min(1, opts.pan ?? 0)); level.gain.value = Math.max(0, Math.min(1, opts.level ?? 1));
    pan.connect(level).connect(sfx);
    const o = pan;
    switch (name) {
        case 'whistle': tone(1250, 0.18, 'sine', 0.3, o, 0, 1750); tone(1250, 0.22, 'sine', 0.3, o, 0.24, 2100); break;
        case 'plant': case 'tree': hiss(0.35, 0.4, o, 2600); hiss(0.25, 0.3, o, 3400, 0.18); break;
        case 'bench': case 'chair': case 'stool': tone(170, 0.4, 'sawtooth', 0.12, o, 0, 120); break;
        case 'statue': case 'gem': case 'candelabra': case 'silver': case 'shield': tone(620, 0.25, 'square', 0.1, o); tone(930, 0.3, 'triangle', 0.15, o, 0.06); break;
        case 'bin': case 'barrel': case 'hydrant': case 'mailbox': tone(880, 0.12, 'triangle', 0.2, o); tone(660, 0.16, 'triangle', 0.18, o, 0.1); break;
        case 'crate': case 'parcel': case 'sack': case 'fruit': case 'produce': tone(140, 0.12, 'sine', 0.5, o); tone(120, 0.14, 'sine', 0.45, o, 0.14); break;
        case 'cabinet': case 'cabinet2': case 'claw': tone(523, 0.08, 'square', 0.1, o); tone(659, 0.08, 'square', 0.1, o, 0.09); tone(784, 0.12, 'square', 0.1, o, 0.18); break;
        case 'umbrella': case 'buoy': case 'lantern': hiss(0.4, 0.3, o, 900); tone(300, 0.3, 'sine', 0.15, o); break;
        case 'shot': tone(1500, 0.16, 'square', 0.12, o, 0, 320); break;
        case 'capture': [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.16, 'triangle', 0.25, o, i * 0.07)); break;
        case 'miss': tone(160, 0.18, 'sine', 0.35, o, 0, 90); break;
        case 'overheat': hiss(0.6, 0.3, o, 400); tone(220, 0.5, 'sawtooth', 0.08, o, 0, 110); break;
        case 'stun': tone(90, 0.6, 'sine', 0.5, o, 0, 420); hiss(0.4, 0.2, o, 600); break;
        case 'smoke': hiss(0.9, 0.5, o, 500); break;
        case 'decoy': tone(1000, 0.1, 'square', 0.08, o); break;
        case 'tick': tone(1200, 0.04, 'square', 0.06, o); break;
        case 'task': [660, 880, 1320].forEach((f, i) => tone(f, 0.15, 'triangle', 0.22, o, i * 0.08)); break;
        case 'exit': [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'square', 0.08, o, i * 0.1)); break;
        case 'gate': tone(110, 0.35, 'square', 0.15, o, 0, 70); hiss(0.3, 0.2, o, 300); break;
        case 'win': [523, 659, 784, 659, 1047].forEach((f, i) => tone(f, 0.25, 'triangle', 0.25, o, i * 0.13)); break;
        case 'lose': [392, 349, 311, 262].forEach((f, i) => tone(f, 0.3, 'triangle', 0.2, o, i * 0.16)); break;
        case 'click': tone(800, 0.03, 'square', 0.05, o); break;
        default: tone(700, 0.08, 'sine', 0.15, o);
    }
}

// Generative music: a slow loop per theme, scheduled a little ahead of time.
const SCALES: Record<Theme, number[]> = { museum: [196, 233, 262, 294, 349, 392], market: [220, 247, 277, 330, 370, 440], arcade: [262, 330, 392, 494, 523, 659], title: [175, 208, 233, 262, 311, 349] };
function schedule() {
    if (!ctx || !theme) return;
    const scale = SCALES[theme], step = theme === 'arcade' ? 0.22 : theme === 'market' ? 0.3 : 0.42;
    while (nextAt < ctx.currentTime + 0.6) {
        const at = nextAt - ctx.currentTime, b = beat % 16;
        if (b % 4 === 0) tone(scale[[0, 3, 4, 2][Math.floor(beat / 4) % 4]] / 2, step * 3.6, 'sine', 0.35, music, at);
        if (theme === 'arcade' && b % 2 === 0) tone(scale[(beat * 3) % scale.length] * 2, step * 0.8, 'square', 0.05, music, at);
        else if (b % 2 === 1 && (beat * 7) % 5 < 3) tone(scale[(beat * 5) % scale.length], step * 1.6, theme === 'market' ? 'triangle' : 'sine', 0.12, music, at);
        if (theme === 'market' && b % 4 === 2) hiss(0.05, 0.08, music, 6000, at);
        beat++; nextAt += step;
    }
}
export function setMusic(next: Theme | null) {
    if (next === theme) return;
    theme = next;
    if (timer) clearInterval(timer);
    timer = undefined;
    if (!next) return;
    const c = boot();
    if (!c) return;
    beat = 0; nextAt = c.currentTime + 0.1;
    timer = window.setInterval(schedule, 200);
}
