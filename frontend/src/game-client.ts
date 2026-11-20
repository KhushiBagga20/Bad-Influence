/** Entry point: the Phaser scene, the DOM screens, and the input loop that sends movement to the server. */
import Phaser from 'phaser';
import './styles.css';
import { GameScene } from './scene.js';
import { render } from './ui.js';
import { input } from './input.js';
import { me, sendInput, store } from './net.js';

new Phaser.Game({
    type: Phaser.AUTO, parent: 'game', width: window.innerWidth, height: window.innerHeight, backgroundColor: '#07080a', antialias: true,
    scale: { mode: Phaser.Scale.RESIZE, autoCenter: Phaser.Scale.CENTER_BOTH }, scene: GameScene, render: { roundPixels: true }, input: { activePointers: 4 },
});
render();
// Movement intent (and aim, for police) about twenty times a second; the server does the moving.
setInterval(() => {
    const s = store.state, p = me();
    if (!s?.match || !p || (s.phase !== 'prep' && s.phase !== 'play')) return;
    const v = input.vector();
    sendInput(v.x, v.y, p.role === 'police' ? store.aim : undefined);
}, 50);
