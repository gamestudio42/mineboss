require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),THREE=require('three');
const {Player}=require('../src/player/Player.ts');
const {PlayerController}=require('../src/player/PlayerController.ts');
const {VoxelBody}=require('../src/physics/VoxelBody.ts');
const {BlockInteraction}=require('../src/player/BlockInteraction.ts');
const {BuildHistory}=require('../src/player/BuildHistory.ts');
const {World}=require('../src/world/World.ts');
const {TerrainGenerator}=require('../src/world/terrain/generator.ts');
const {Block}=require('../src/world/blocks.ts');
const {Input}=require('../src/core/Input.ts');
function world(){const w=new World(new TerrainGenerator(42,'oneblock'));w.ensureChunk(0,0);return w;}
const input={isDown:()=>false,wasPressed:()=>false};
for(const dt of [1/60,1/30,.1])test(`long falls hit a thin platform from every starting height at dt=${dt}`,()=>{
 const w=world();w.setBlock(5,40,5,Block.Stone);
 for(let y=45;y<=120;y++){
  const p=new Player();p.creative=true;p.health.immune=true;p.position.set(5.5,y,5.5);p.body.fallPeak=y;
  const controller=new PlayerController(p,w,new THREE.PerspectiveCamera());
  for(let i=0;i<8/dt&&!p.body.onGround;i++)controller.update(dt,input);
  assert.equal(p.position.y,41,`start ${y}`);assert.equal(p.body.onGround,true);assert.equal(p.body.intersectsWorld(w),false);
 }
});
test('fast horizontal motion and ascent cannot skip a one-block wall or ceiling',()=>{
 const w=world();for(let y=40;y<45;y++)w.setBlock(5,y,5,Block.Stone);
 const body=new VoxelBody(.6,1.8);body.position.set(2.5,40,5.5);body.velocity.x=60;body.move(w,.1);assert.ok(body.position.x<5);assert.equal(body.intersectsWorld(w),false);
 w.setBlock(2,45,5,Block.Stone);body.position.set(2.5,40,5.5);body.velocity.set(0,60,0);body.move(w,.1);assert.ok(body.position.y+body.height<45);assert.equal(body.intersectsWorld(w),false);
});
test('Q consumes only a successful placement, including world limits and unloaded terrain',()=>{
 const w=world(),p=new Player();p.position.set(5.5,129,5.5);Object.assign(p.inventory.selectedSlot,{block:Block.Planks,count:10});
 const a=new BlockInteraction(p,w,{tileColors:[]},{burst(){}},{play(){}},new THREE.Scene());
 assert.equal(a.tossSelected(),false);assert.equal(p.inventory.selectedSlot.count,10);
 p.position.y=128;assert.equal(a.tossSelected(),true);assert.equal(p.inventory.selectedSlot.count,9);assert.equal(w.getBlock(5,127,4),Block.Planks);
 p.position.set(20.5,90,20.5);assert.equal(a.tossSelected(),false);assert.equal(p.inventory.selectedSlot.count,9);
});
test('undo and redo several edits preserve original provenance and reject collisions',()=>{
 const w=world(),h=new BuildHistory();
 for(let x=2;x<5;x++){const before=w.getBlock(x,90,3);w.setBlock(x,90,3,Block.Blue);h.record({x,y:90,z:3,before,after:Block.Blue});}
 for(let x=4;x>=2;x--){assert.equal(h.undo(w,()=>false),true);assert.equal(w.getBlock(x,90,3),Block.Air);assert.equal(w.edits.has(`${x},90,3`),false);}
 assert.equal(h.canUndo,false);assert.equal(h.redo(w,()=>true),false);assert.equal(h.canRedo,true);
 for(let x=2;x<5;x++){assert.equal(h.redo(w,()=>false),true);assert.equal(w.getBlock(x,90,3),Block.Blue);}
 h.undo(w,()=>false);w.setBlock(9,90,3,Block.Glass);h.record({x:9,y:90,z:3,before:Block.Air,after:Block.Glass});assert.equal(h.canRedo,false);
});
test('history bounds, stale blocks and protected edits never overwrite another change',()=>{
 const w=world(),h=new BuildHistory();
 for(let y=50;y<110;y++){w.setBlock(2,y,3,Block.Blue);h.record({x:2,y,z:3,before:Block.Air,after:Block.Blue});}
 let n=0;while(h.undo(w,()=>false))n++;assert.equal(n,50);assert.equal(w.getBlock(2,50,3),Block.Blue);
 w.setBlock(4,90,4,Block.Blue);h.record({x:4,y:90,z:4,before:Block.Air,after:Block.Blue});w.setBlock(4,90,4,Block.Glass);assert.equal(h.undo(w,()=>false),false);assert.equal(w.getBlock(4,90,4),Block.Glass);
 h.record({x:0,y:72,z:0,before:Block.Grass,after:Block.Dirt});assert.equal(h.canUndo,false);
});
test('Tab is available in menus and captured only while the pointer is locked',()=>{
 const oldW=global.window,oldD=global.document;global.window=new EventTarget();global.document=new EventTarget();
 try{const canvas=new EventTarget(),i=new Input(canvas);for(const locked of [false,true]){i.locked=locked;const e=Object.assign(new Event('keydown',{cancelable:true}),{code:'Tab',repeat:false});window.dispatchEvent(e);assert.equal(e.defaultPrevented,locked);}}
 finally{global.window=oldW;global.document=oldD;}
});
const {loadSettings,saveSettings}=require('../src/core/Settings.ts');
const {combatCue}=require('../src/ui/CombatCue.ts');
const {Shockwave}=require('../src/entities/boss/attacks/Shockwave.ts');
const {BossModel}=require('../src/entities/boss/BossModel.ts');
test('old, malformed and new comfort settings load safely and round-trip',()=>{
 const old=global.localStorage;let stored='{}';global.localStorage={getItem:()=>stored,setItem:(k,v)=>stored=v};
 try{
  stored=JSON.stringify({volume:.6,sensitivity:1.2});let s=loadSettings();assert.equal(s.quality,'balanced');assert.equal(s.volume,.6);assert.equal(s.reducedMotion,false);
  saveSettings({...s,quality:'light',reducedMotion:true,reducedEffects:true});s=loadSettings();assert.equal(s.quality,'light');assert.equal(s.reducedEffects,true);assert.equal(s.reducedMotion,true);
  for(const bad of ['null','{','{"volume":1e999,"sensitivity":-50,"quality":"unknown"}']){stored=bad;s=loadSettings();assert.ok(Number.isFinite(s.volume)&&s.volume<=1);assert.ok(s.sensitivity>=.4);assert.equal(s.quality,'balanced');}
 }finally{global.localStorage=old;}
});
test('placement preview marks player overlap, valid terrain and height limits without editing',()=>{
 const w=world(),p=new Player();p.creative=true;p.position.set(3.5,73,3.5);Object.assign(p.inventory.selectedSlot,{block:Block.Blue,count:64});
 const a=new BlockInteraction(p,w,{tileColors:[]},{burst(){}},{play(){}},new THREE.Scene());const size=w.edits.size;
 a.target={x:3,y:72,z:3,nx:0,ny:1,nz:0,block:Block.Grass,distance:2};a.updatePreview();assert.match(a.placementHint,/Afaste/);assert.equal(a.preview.visible,true);
 a.target.x=5;a.updatePreview();assert.equal(a.placementHint,'');assert.deepEqual(a.preview.position.toArray(),[5.5,73.5,3.5]);
 a.target.y=127;a.updatePreview();assert.match(a.placementHint,/Limite/);assert.equal(w.edits.size,size);
 a.previewEnabled=false;a.updatePreview();assert.equal(a.preview.visible,false);
});
test('edge guard explains blocked movement and calm camera removes walking bob',()=>{
 const w=world();for(let x=2;x<5;x++)w.setBlock(x,72,3,Block.Stone);
 const p=new Player();p.position.set(4.7,73,3.5);p.body.onGround=true;p.edgeProtection=true;
 const camera=new THREE.PerspectiveCamera(),c=new PlayerController(p,w,camera);c.reducedMotion=true;
 let blocked=false;for(let i=0;i<60;i++){c.update(1/60,{...input,isDown:k=>k==='KeyD'});blocked ||=c.edgeBlocked;}
 assert.ok(blocked);const eye=new THREE.Vector3();p.getEyePosition(eye);assert.deepEqual(camera.position.toArray(),eye.toArray());
});
test('boss cues prioritize imminent waves over vulnerability and do not warn after passing',()=>{
 assert.equal(combatCue('stagger',undefined,true).text,'Pule a onda!');assert.equal(combatCue('stagger',undefined,false).text,'BATA AGORA!');assert.equal(combatCue(undefined,'circle',false).text,'Saia do círculo');assert.equal(combatCue(undefined,undefined,false),null);
 const wave=new Shockwave({maxRadius:12,speed:3,damage:3,knockback:0});wave.position.set(0,73,0);
 assert.equal(wave.approaching({x:10,y:73,z:0}),false);assert.equal(wave.approaching({x:4,y:73,z:0}),true);wave.hitPlayerAlready=true;assert.equal(wave.approaching({x:4,y:73,z:0}),false);wave.onRemoved();
});
test('repeated boss disposal releases all model geometries and materials',()=>{
 for(let i=0;i<3;i++){
  const model=new BossModel();let geometries=0,materials=0,disposedGeometry=0,disposedMaterial=0;
  model.root.traverse(o=>{if(o instanceof THREE.Mesh){geometries++;o.geometry.addEventListener('dispose',()=>disposedGeometry++);for(const m of Array.isArray(o.material)?o.material:[o.material]){materials++;m.addEventListener('dispose',()=>disposedMaterial++);}}});
  model.dispose();assert.ok(geometries>10);assert.equal(disposedGeometry,geometries);assert.equal(disposedMaterial,materials);
 }
});
