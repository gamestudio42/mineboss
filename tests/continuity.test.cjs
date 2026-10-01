require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const { Game } = require('../src/core/Game.ts');
const { Player } = require('../src/player/Player.ts');
const { PlayerController } = require('../src/player/PlayerController.ts');
const { BuildHistory } = require('../src/player/BuildHistory.ts');
const { World } = require('../src/world/World.ts');
const { TerrainGenerator } = require('../src/world/terrain/generator.ts');
const { Block, BLOCKS } = require('../src/world/blocks.ts');
const { OneBlock } = require('../src/world/oneblock/OneBlock.ts');
const { Input } = require('../src/core/Input.ts');
const { parseSave, saveRun, loadSave, loadPreviousSave } = require('../src/core/Save.ts');
const { buildSectionMesh, volumeIndex, VOLUME_LENGTH } = require('../src/world/meshing/mesher.ts');
const { createTerrainMaterial } = require('../src/render/materials.ts');

function world() { const w = new World(new TerrainGenerator(42,'oneblock')); for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)w.ensureChunk(x,z); return w; }
function run() { return {version:5,mode:'adventure',seed:42,elapsed:1,deaths:0,blocksMined:0,hintedConsumable:false,hintedUpgrade:false,hintedTorch:false,player:{x:.5,y:73,z:.5,spawnX:.5,spawnY:73,spawnZ:.5,yaw:0,pitch:0,health:20,hammer:0,selected:0,slots:Array.from({length:9},()=>({block:null,count:0}))},arena:{defeated:false,discovered:false},oneBlock:{broken:0,phase:0},edits:[]}; }
function storage() { const data=new Map(); global.localStorage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k)};return data; }
function game() {
 const g=Object.create(Game.prototype);Object.assign(g,{mode:'adventure',player:new Player(),world:world(),trophies:new Set(),oneBlock:new OneBlock(42),arena:{active:false,defeated:false,discovered:false},ruin:{active:false,defeated:false},seed:42,elapsed:0,deaths:0,blocksMined:0,guidance:false,home:{x:2.5,y:73,z:2.5}});
 return g;
}
test('custom creative palette survives style and fight roundtrips with survival reserve intact',()=>{
 const g=game();g.player.inventory.add(Block.GoldOre,700);const survival=g.inventorySnapshot();
 g.setCreative(true);g.player.inventory.slots[7]={block:Block.Blue,count:64};g.player.inventory.select(7);const palette=g.inventorySnapshot();
 for(let i=0;i<3;i++){g.setCreative(false);assert.deepEqual(g.inventorySnapshot(),survival);g.setCreative(true);assert.deepEqual(g.inventorySnapshot(),palette);}
});
test('saving mid-fight restores original position, spawn, palette and preferences on reload',()=>{
 const g=game();g.player.inventory.add(Block.Dirt,25);g.setCreative(true);g.player.inventory.slots[0]={block:Block.Glass,count:64};const palette=g.inventorySnapshot();
 g.fightReturn={position:new THREE.Vector3(5,73,6),spawn:new THREE.Vector3(2,73,3),yaw:1,pitch:-.4};
 g.fightCreative=true;g.setCreative(false);g.player.position.set(80,20,80);g.player.setSpawn(80,20,80);
 const saved=parseSave(JSON.stringify(g.snapshotRun(false)));
 assert.ok(saved);assert.equal(saved.creative,true);assert.equal(saved.guidance,false);
 assert.deepEqual(saved.player.slots,palette.slots);assert.equal(saved.player.x,5);assert.equal(saved.player.spawnX,2);assert.equal(saved.player.yaw,1);
 assert.equal(saved.survival.slots[0].count,25);assert.deepEqual(saved.home,g.home);
});
test('corrupt primary recovers the previous valid save without rotating corruption into backup',()=>{
 const data=storage(),a=run(),b={...run(),seed:88};
 assert.ok(saveRun(a));assert.ok(saveRun(b));assert.equal(loadPreviousSave('adventure').seed,42);
 data.set('mineboss.run.adventure','{');assert.equal(loadSave().seed,42);
 assert.ok(saveRun(b));assert.equal(loadPreviousSave('adventure').seed,42);
});
test('quota failure during backup or primary write retains a readable world',()=>{
 for(const failAt of ['mineboss.run.adventure.previous','mineboss.run.adventure']){
  storage();saveRun(run());const write=localStorage.setItem;
  localStorage.setItem=(k,v)=>{if(k===failAt)throw Error('quota');write(k,v);};
  assert.equal(saveRun({...run(),seed:99}),false);assert.equal(loadSave().seed,42);
 }
});
test('invalid new save fields cannot replace valid storage',()=>{
 storage();saveRun(run());
 for(const bad of [{home:{x:NaN,y:73,z:0}},{guidance:'off'},{creativePalette:{slots:[],selected:99,reserve:[]}},{updatedAt:-1}]){
  assert.equal(saveRun({...run(),...bad}),false);assert.equal(loadSave().seed,42);
 }
});
test('undo restores block and edit provenance, refuses collision and later changes',()=>{
 const w=world(),history=new BuildHistory();w.setBlock(2,72,2,Block.Planks);history.record({x:2,y:72,z:2,before:Block.Air,after:Block.Planks});
 assert.equal(history.undo(w,()=>false),true);assert.equal(w.getBlock(2,72,2),Block.Air);assert.equal(w.edits.has('2,72,2'),false);
 w.setBlock(2,72,2,Block.Air);history.record({x:2,y:72,z:2,before:Block.Planks,after:Block.Air,previousEdit:Block.Planks});
 assert.equal(history.undo(w,()=>true),false);assert.equal(history.undo(w,()=>false),true);assert.equal(w.edits.get('2,72,2'),Block.Planks);
 history.record({x:2,y:72,z:2,before:Block.Air,after:Block.Planks});w.setBlock(2,72,2,Block.Blue);assert.equal(history.undo(w,()=>false),false);
 history.record({x:0,y:72,z:0,before:Block.Air,after:Block.Grass});assert.equal(history.undo(w,()=>false),false);
});
test('glass is solid but exposes neighboring solid faces and culls internal glass faces',()=>{
 const volume=new Uint8Array(VOLUME_LENGTH);volume[volumeIndex(2,2,2)]=Block.Glass;
 assert.equal(BLOCKS[Block.Glass].solid,true);assert.equal(BLOCKS[Block.Glass].opaque,false);
 assert.equal(buildSectionMesh(volume).indices.length,36);
 volume[volumeIndex(3,2,2)]=Block.Glass;assert.equal(buildSectionMesh(volume).indices.length,60);
 volume[volumeIndex(3,2,2)]=Block.Planks;assert.equal(buildSectionMesh(volume).indices.length,66);
 const mat=createTerrainMaterial({texture:new THREE.Texture()});assert.equal(mat.alphaTest,.5);mat.dispose();
 const r=run();r.edits=[{x:2,y:74,z:2,id:Block.Glass},{x:3,y:74,z:2,id:Block.Blue}];assert.deepEqual(parseSave(JSON.stringify(r)).edits,r.edits);
});
test('OneBlock waits for solid safe support and enough headroom',()=>{
 const w=world(),core=new OneBlock(42);assert.equal(core.mobSpawn(w),null);
 w.setBlock(1,72,0,Block.Water);assert.equal(core.mobSpawn(w),null);
 w.setBlock(1,72,0,Block.Lava);assert.equal(core.mobSpawn(w),null);
 w.setBlock(1,72,0,Block.Planks);w.setBlock(1,74,0,Block.Planks);assert.equal(core.mobSpawn(w),null);
 w.setBlock(1,74,0,Block.Air);assert.deepEqual(core.mobSpawn(w),{x:1.5,y:73,z:.5});
});
test('creative flight has a slower building speed and Shift accelerates',()=>{
 const distances=[];
 for(const fast of [false,true]){
  const w=world(),p=new Player();p.creative=true;p.flying=true;p.position.set(.5,80,.5);
  const c=new PlayerController(p,w,new THREE.PerspectiveCamera());
  for(let i=0;i<120;i++)c.update(1/60,{wasPressed:()=>false,isDown:key=>key==='KeyW'||(fast&&key==='ShiftLeft')});
  distances.push(Math.abs(p.position.z-.5));
 }
 assert.ok(distances[0]>8&&distances[0]<13);assert.ok(distances[1]>distances[0]*1.5);
});
test('pointer-lock errors are visible and losing focus clears held and pressed input',async()=>{
 const oldW=global.window,oldD=global.document;
 global.window=new EventTarget();global.document=new EventTarget();
 const canvas=new EventTarget();document.pointerLockElement=null;document.exitPointerLock=()=>{document.pointerLockElement=null;document.dispatchEvent(new Event('pointerlockchange'));};
 canvas.requestPointerLock=()=>Promise.reject(Error('denied'));
 const input=new Input(canvas);let errors=0,losses=0;input.onLockError=()=>errors++;input.onLockChange=locked=>{if(!locked)losses++;};
 try {
  input.requestLock();await Promise.resolve();assert.equal(errors,1);
  canvas.requestPointerLock=()=>{document.pointerLockElement=canvas;document.dispatchEvent(new Event('pointerlockchange'));return Promise.resolve();};
  input.requestLock();assert.equal(input.locked,true);
  window.dispatchEvent(Object.assign(new Event('keydown'),{code:'KeyW',repeat:false}));
  canvas.dispatchEvent(Object.assign(new Event('mousedown'),{button:0}));
  assert.equal(input.isDown('KeyW'),true);assert.equal(input.isMouseDown(0),true);
  window.dispatchEvent(new Event('blur'));assert.equal(losses,1);assert.equal(input.wasPressed('KeyW'),false);assert.equal(input.isMouseDown(0),false);assert.equal(input.mouseDX,0);
  input.releaseLock();assert.equal(input.locked,false);
 }finally{global.window=oldW;global.document=oldD;}
});
test('visiting Sentinel opens confirmation without moving or replacing spawn',()=>{
 const g=game();g.world.generator.ruinUnlocked=true;g.player.position.set(10,73,12);g.player.spawn.set(10,73,12);const actions=new Map();g.overlay={addAction:(label,fn)=>actions.set(label,fn)};let asked=false;g.confirmFight=()=>{asked=true;};
 g.addPlayActions();actions.get('Visitar o Sentinela')();assert.equal(asked,true);assert.deepEqual(g.player.position.toArray(),[10,73,12]);assert.deepEqual(g.player.spawn.toArray(),[10,73,12]);
});

test('frequent autosaves keep a meaningful checkpoint and refresh it after a minute',()=>{
 storage();saveRun({...run(),updatedAt:1000});saveRun({...run(),updatedAt:13000});
 assert.equal(loadPreviousSave('adventure').updatedAt,1000);
 saveRun({...run(),updatedAt:25000});assert.equal(loadPreviousSave('adventure').updatedAt,1000);
 saveRun({...run(),updatedAt:73000});assert.equal(loadPreviousSave('adventure').updatedAt,25000);
 assert.equal(parseSave(JSON.stringify({...run(),player:{...run().player,flying:'yes'}})),null);
});
test('OneBlock defers spawning on the player or another mob',()=>{
 const w=world(),core=new OneBlock(42),p=new Player();w.setBlock(1,72,0,Block.Planks);p.position.set(1.5,73,.5);
 assert.equal(core.mobSpawn(w,p),null);p.position.set(.5,73,.5);
 assert.ok(core.mobSpawn(w,p));assert.equal(core.mobSpawn(w,p,[{position:{x:1.5,z:.5}}]),null);
});

// Real gameplay objects with only DOM, audio and renderer adapters replaced.
function integratedGame(mode='adventure',creative=true) {
 const {EntityManager}=require('../src/entities/EntityManager.ts');
 const {BossArena}=require('../src/entities/boss/BossArena.ts');
 const {RuinEncounter}=require('../src/entities/boss/RuinEncounter.ts');
 const g=game();g.mode=mode;g.practice=null;g.fightReturn=null;g.fightCreative=false;
 g.world=new World(new TerrainGenerator(42,mode));g.entities=new EntityManager(new THREE.Scene());
 g.buildHistory=new BuildHistory();g.hud={bossBar:{hide(){}},hideHint(){},showHint(){},setObjective(){},compass:{update(){}}};
 g.overlay={actions:new Map(),show(content,primary,secondary){this.content=content;this.primary=primary;this.secondary=secondary;this.actions.clear();},addAction(label,action){this.actions.set(label,action);}};
 const callbacks={onSummon(){},onPhase(){},onShake(){},onStagger(){},onVictory(){},onDefeated(){}};
 g.arena=new BossArena(g.entities,callbacks);g.ruin=new RuinEncounter(g.entities,callbacks);
 g.particles={clear(){},burst(){}};g.torchLights={clear(){}};g.sfx={play(){}};g.viewModel={setTier(){},setPlates(){}};
 g.input={releaseLock(){},wasPressed:()=>false,isDown:()=>false};
 g.chunks={reset(){},preload(x,z,r){for(let cx=Math.floor(x/16)-r;cx<=Math.floor(x/16)+r;cx++)for(let cz=Math.floor(z/16)-r;cz<=Math.floor(z/16)+r;cz++)g.world.ensureChunk(cx,cz);}};
 g.controller=new PlayerController(g.player,g.world,new THREE.PerspectiveCamera());
 g.context={dt:1/60,elapsed:0,world:g.world,player:g.player,entities:g.entities,particles:g.particles,sfx:g.sfx,atlas:{tileColors:[]}};
 g.persistSave=()=>{g.lastSave=g.snapshotRun(false);};g.stopForPanel=()=>{g.state='paused';};g.startPlaying=()=>{g.state='playing';};
 g.syncGeneratorUnlocks();g.chunks.preload(0,0,2);
 const y=mode==='oneblock'?73:g.world.generator.surfaceHeight(0,0)+1;
 g.player.setSpawn(.5,y,.5);g.player.respawn();g.home={x:.5,y,z:.5};
 g.player.inventory.add(Block.Dirt,14);g.player.inventory.add(Block.GoldOre,700);
 if(creative){g.setCreative(true);g.player.inventory.slots[7]={block:Block.Blue,count:64};g.player.inventory.select(7);g.player.flying=true;}
 return g;
}
for(const [mode,creative] of [['adventure',true],['adventure',false],['oneblock',false]]){
 for(const sentinel of [true,false]){
  test(`${mode}/${creative?'creative':'survival'} ${sentinel?'Sentinel':'Warden'}: cancel, exit, death and reload preserve home and inventories`,()=>{
   const g=integratedGame(mode,creative);if(mode==='oneblock'){g.oneBlock.broken=560;g.syncGeneratorUnlocks();}
   const palette=g.inventorySnapshot(),home={...g.home},spawn=g.player.spawn.clone();
   g.world.setBlock(4,100,4,Block.Glass);
   g.confirmFight(sentinel);g.overlay.secondary();assert.deepEqual(g.player.spawn,spawn);assert.equal(g.fightReturn,null);
   g.confirmFight(sentinel);g.overlay.primary();assert.equal(g.player.creative,false);assert.ok(g.arena.active||g.ruin.active);
   const midFight=parseSave(JSON.stringify(g.snapshotRun(false)));assert.ok(midFight);
   g.addPlayActions();g.overlay.actions.get('Sair da batalha')();
   assert.equal(g.player.creative,creative);assert.equal(g.player.flying,creative);assert.deepEqual(g.inventorySnapshot(),palette);assert.deepEqual(g.home,home);assert.deepEqual(g.player.spawn,spawn);
   g.confirmFight(sentinel);g.overlay.primary();g.die();g.overlay.actions.get('Voltar à base')();
   assert.equal(g.player.dead,false);assert.equal(g.player.creative,creative);assert.deepEqual(g.inventorySnapshot(),palette);assert.deepEqual(g.home,home);assert.deepEqual(g.player.spawn,spawn);
   const loaded=integratedGame();loaded.applySave(midFight);
   assert.equal(loaded.arena.active||loaded.ruin.active,false);assert.equal(loaded.practice,null);assert.equal(loaded.player.creative,creative);assert.equal(loaded.player.flying,creative);
   assert.deepEqual(loaded.inventorySnapshot(),palette);assert.deepEqual(loaded.home,home);assert.equal(loaded.world.getBlock(4,100,4),Block.Glass);assert.equal(loaded.guidance,false);
  });
 }
}
test('practice exit restores style, flight and home; blocked home keeps construction intact',()=>{
 for(const creative of [true,false]){
  const g=integratedGame('adventure',creative),palette=g.inventorySnapshot(),home={...g.home};
  g.startPractice();assert.ok(g.practice);assert.equal(g.player.creative,false);g.stopPractice();
  assert.equal(g.practice,null);assert.equal(g.player.creative,creative);assert.equal(g.player.health.immune,creative);assert.equal(g.player.flying,creative);assert.deepEqual(g.inventorySnapshot(),palette);
  g.world.setBlock(0,home.y,0,Block.Planks);g.goHome();
  assert.equal(g.world.getBlock(0,home.y,0),Block.Planks);assert.equal(g.player.body.intersectsWorld(g.world),false);assert.deepEqual(g.home,home);
 }
});
test('landing state persists and a late pointer grant is cancelled after opening a panel',async()=>{
 const g=integratedGame();g.player.flying=false;
 const loaded=integratedGame();loaded.applySave(parseSave(JSON.stringify(g.snapshotRun(false))));assert.equal(loaded.player.flying,false);
 const oldW=global.window,oldD=global.document;global.window=new EventTarget();global.document=new EventTarget();
 const canvas=new EventTarget();document.pointerLockElement=null;let exits=0;
 document.exitPointerLock=()=>{exits++;document.pointerLockElement=null;};canvas.requestPointerLock=()=>new Promise(()=>{});
 try {const input=new Input(canvas);input.requestLock();input.releaseLock();document.pointerLockElement=canvas;document.dispatchEvent(new Event('pointerlockchange'));assert.equal(exits,1);assert.equal(input.locked,false);}
 finally{global.window=oldW;global.document=oldD;}
});
test('Warden victory restores each adventure style and grants a unique trophy across repeats',()=>{
 for(const creative of [true,false]){
  const g=integratedGame('adventure',creative),palette=g.inventorySnapshot();g.victoryText=()=> 'Vitória';
  g.arena.callbacks.onVictory=()=>g.win();
  for(let attempt=0;attempt<2;attempt++){
   g.confirmFight(false);g.overlay.primary();g.arena.boss.health.damage(g.arena.boss.health.max);
   for(let frame=0;frame<350;frame++){g.context.elapsed+=g.context.dt;g.entities.update(g.context);g.arena.update();}
   assert.equal(g.state,'victory');assert.equal(g.arena.defeated,true);assert.equal(g.player.creative,creative);
   assert.equal(g.trophies.size,1);const items=creative?g.survival:g.inventorySnapshot();
   assert.equal(items.slots.filter(s=>s.block===Block.WardenTrophy).reduce((n,s)=>n+s.count,0)+items.reserve.filter(s=>s.block===Block.WardenTrophy).reduce((n,s)=>n+s.count,0),1);
   if(creative)assert.deepEqual(g.inventorySnapshot(),palette);
   g.overlay.primary();assert.equal(g.player.dead,false);assert.equal(g.player.flying,creative);
  }
 }
});
