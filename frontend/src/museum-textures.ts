import Phaser from 'phaser';
import {WORLD} from '../../shared/world';
/** Seeded raster floor material: generated once, never redrawn per animation frame. */
export function createMuseumFloor(scene:Phaser.Scene){
 if(scene.textures.exists('museum-floor'))return;
 const canvas=document.createElement('canvas');canvas.width=WORLD.w;canvas.height=WORLD.h;
 const context=canvas.getContext('2d')!,pixels=context.createImageData(WORLD.w,WORLD.h);
 const palettes=[[45,57,57],[58,54,51],[49,47,59],[48,64,49],[64,50,47]];
 let seed=731;
 for(let y=0;y<WORLD.h;y++)for(let x=0;x<WORLD.w;x++){
  seed=(Math.imul(seed,1664525)+1013904223)>>>0;
  const palette=y>944?[23,36,44]:palettes[Math.min(4,Math.floor(x/550))];
  const seam=(x%96<2||y%96<2)?-10:0;
  const veins=Math.sin(x*.024+Math.sin(y*.012)*5)*Math.sin(y*.011+x*.009)*5;
  const grain=(seed/4294967296-.5)*9;
  const tile=((Math.floor(x/96)*13+Math.floor(y/96)*7)%9)-4;
  const i=(y*WORLD.w+x)*4;
  for(let c=0;c<3;c++)pixels.data[i+c]=palette[c]+veins+grain+tile+seam;
  pixels.data[i+3]=255;
 }
 context.putImageData(pixels,0,0);
 scene.textures.addCanvas('museum-floor',canvas);
}
