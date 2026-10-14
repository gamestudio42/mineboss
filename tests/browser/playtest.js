// Development-only browser fixture. Uses memory storage, never a saved world.
// Pointer capture is simulated here; the normal entry point tests real capture.
import { Game } from '../../src/core/Game.ts';
import { Block } from '../../src/world/blocks.ts';
import { QUALITY, DEFAULT_SETTINGS } from '../../src/core/Settings.ts';
const memory = new Map();
Object.defineProperty(window, 'localStorage', { value: {
  getItem:key=>memory.get(key)??null,setItem:(key,value)=>memory.set(key,String(value)),removeItem:key=>memory.delete(key),clear:()=>memory.clear(),
} });
const html = new DOMParser().parseFromString(await (await fetch('/')).text(),'text/html');
document.body.append(document.importNode(html.getElementById('app'),true));
const game = new Game(document.getElementById('viewport'));
game.input.requestLock=()=>{game.input.reset();game.input.locked=true;};
game.input.releaseLock=()=>{game.input.locked=false;game.input.reset();};
const bar=document.createElement('div');bar.style.cssText='position:fixed;bottom:0;left:0;z-index:100;background:#0b172a;padding:4px;display:flex;gap:5px;align-items:center;max-width:100vw;flex-wrap:wrap;font:12px monospace';
const status=document.createElement('output');status.id='qa-status';status.style.cssText='max-width:500px;white-space:pre-wrap';
const add=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=fn;bar.append(b);};
let running=false, frames=0, elapsed=0, stalls=0, maxGeometries=0, edits=0;
const originalTick=game.tick.bind(game);let lastFrame=performance.now();
const samples=[];
game.loop.stop();
let lastEdit=0,lastSegment=-1;
function fixture(){
 running=false;game.newGame('adventure');game.setCreative(true);game.player.flying=false;game.player.health.immune=true;
 for(let x=2;x<13;x++)for(let z=2;z<13;z++)for(let y=90;y<97;y++)game.world.setBlock(x,y,z,y===90?Block.Grass:Block.Air);
 game.player.position.set(7.5,91,10.5);game.player.body.onGround=true;game.player.pitch=-.65;game.player.yaw=0;
 game.player.inventory.slots[0]={block:Block.Blue,count:64};game.player.inventory.select(0);game.buildLesson=0;game.tutorialDone=true;
 game.startPlaying();game.chunks.update(7.5,10.5);status.textContent='Cenário: construção · armazenamento em memória · captura simulada';
}
add('Construção',fixture);
add('Pausa',()=>game.pause());
add('Mira bloqueada',()=>{game.player.pitch=-1.52;game.player.yaw=0;});
add('Mira livre',()=>{game.player.pitch=-.65;game.player.yaw=0;});
add('Colocar',()=>{game.interaction.placeCooldown=0;game.interaction.update(1/60,{isMouseDown:()=>false,wasMousePressed:b=>b===2},false);});
add('Desfazer',()=>game.undoBuild());add('Refazer',()=>game.undoBuild(true));
add('Treino',()=>game.startPractice());
add('Sentinela',()=>game.confirmFight(true));add('Guardião',()=>game.confirmFight(false));
add('Estresse 5 min',()=>{fixture();running=true;frames=elapsed=stalls=maxGeometries=edits=lastEdit=0;lastSegment=-1;samples.length=0;});
add('Parar',()=>{running=false;game.pause();report();});
bar.append(status);document.body.append(bar);
function report(){
 const sorted=[...samples].sort((a,b)=>a-b);
 status.textContent=JSON.stringify({seconds:Math.round(elapsed),frames,fps:elapsed?Math.round(frames/elapsed):0,p95ms:Math.round((sorted[Math.floor(sorted.length*.95)]??0)*1000),stalls,edits,chunks:game.chunks.loadedChunks,geometries:game.renderer.info.memory.geometries,maxGeometries,quality:game.overlay.current.quality});
}
const input={isDown:k=>k===['KeyW','KeyD','KeyS','KeyA'][Math.floor(elapsed/3)%4],wasPressed:()=>false};
function tick(){
 const now=performance.now(),actual=(now-lastFrame)/1000,dt=Math.min(actual,.1);lastFrame=now;
 if(running){
  frames++;elapsed+=actual;samples.push(actual);if(samples.length>18000)samples.shift();if(actual>.1)stalls++;
  const segment=Math.floor(elapsed/60)%3;
  if(segment!==lastSegment){lastSegment=segment;const quality=Object.keys(QUALITY)[segment];game.applySettings({...DEFAULT_SETTINGS,quality});game.overlay.bindSettings({...DEFAULT_SETTINGS,quality});}
  game.player.flying=true;game.player.yaw=0;game.player.pitch=-.55;
  game.controller.update(dt,input);game.chunks.preload(game.player.position.x,game.player.position.z,0);
  if(elapsed-lastEdit>.3){lastEdit=elapsed;const x=Math.floor(game.player.position.x),z=Math.floor(game.player.position.z);game.world.setBlock(x,90,z,edits++%2?Block.Blue:Block.Glass);}
  maxGeometries=Math.max(maxGeometries,game.renderer.info.memory.geometries);
  if(frames%60===0)report();if(elapsed>=300){running=false;game.pause();report();}
 }
 // Test-camera motion is deterministic; real mouse capture is tested at /.
 game.input.mouseDX=game.input.mouseDY=0;
 originalTick(dt);requestAnimationFrame(tick);
}
requestAnimationFrame(tick);
fixture();
