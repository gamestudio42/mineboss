require('./register.cjs');
const { test }=require('node:test'),assert=require('node:assert/strict'),THREE=require('three');
const { Player }=require('../src/player/Player.ts');
const { PlayerController }=require('../src/player/PlayerController.ts');
const { PlayerCombat }=require('../src/player/PlayerCombat.ts');
const { BlockInteraction }=require('../src/player/BlockInteraction.ts');
const { Block,getBlockDef }=require('../src/world/blocks.ts');
const { World }=require('../src/world/World.ts');
const { TerrainGenerator }=require('../src/world/terrain/generator.ts');
const { OneBlock }=require('../src/world/oneblock/OneBlock.ts');
const { phaseAt,unlocksForBroken,pickWeighted }=require('../src/world/oneblock/phases.ts');
const { EntityManager }=require('../src/entities/EntityManager.ts');
const { BossPractice }=require('../src/entities/boss/BossPractice.ts');
const { BossArena }=require('../src/entities/boss/BossArena.ts');
const { RuinEncounter }=require('../src/entities/boss/RuinEncounter.ts');
const { RECIPES,craftRecipe,recipeStatus }=require('../src/player/Recipes.ts');
const { hash2 }=require('../src/core/math.ts');
const { RUIN_COURTYARD,ARENA }=require('../src/world/arena.ts');
function setup() {
 const world=new World(new TerrainGenerator(42,'oneblock'));
 for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)world.ensureChunk(x,z);
 const player=new Player(),entities=new EntityManager(new THREE.Scene()),particles={burst(){}},sfx={play(){}},atlas={tileColors:Array.from({length:64},()=>new THREE.Color('white'))};
 return {world,player,entities,particles,sfx,atlas,dt:1/60,elapsed:0};
}
function input(button=-1,held=false) { return {mouseDX:0,mouseDY:0,wasPressed:()=>false,isDown:()=>false,isMouseDown:b=>held&&b===button,wasMousePressed:b=>!held&&b===button}; }

test('visual recipes consume across slots and reserve without losing full-bar output',()=>{
 const p=new Player();p.inventory.add(Block.Planks,9*64);p.inventory.add(Block.CoalOre,3);
 assert.equal(craftRecipe(p,'torch'),true);assert.equal(p.inventory.count(Block.CoalOre),2);assert.equal(p.inventory.count(Block.Torch),4);
 assert.equal(p.inventory.reserve.get(Block.Torch),4);
 assert.equal(craftRecipe(p,'bed'),true);assert.equal(p.inventory.count(Block.Planks),572);assert.equal(p.inventory.count(Block.Bed),1);
 const before=JSON.stringify([...p.inventory.reserve]);assert.equal(craftRecipe(p,'iron-hammer'),false);assert.equal(JSON.stringify([...p.inventory.reserve]),before);
});
test('equipment recipes are atomic, require the right unlock and cannot downgrade',()=>{
 const p=new Player();p.inventory.add(Block.IronOre,7);p.inventory.add(Block.GoldOre,7);
 assert.equal(craftRecipe(p,'iron-armor'),false);
 assert.equal(craftRecipe(p,'iron-hammer'),true);assert.equal(craftRecipe(p,'iron-armor'),true);assert.equal(p.inventory.count(Block.IronOre),0);
 assert.equal(craftRecipe(p,'gold-hammer'),true);assert.equal(craftRecipe(p,'gold-armor'),true);
 p.inventory.add(Block.IronOre,10);assert.equal(craftRecipe(p,'iron-hammer'),false);assert.equal(p.inventory.count(Block.IronOre),10);
 p.creative=true;assert.ok(RECIPES.every(r=>recipeStatus(p,r)!==null));
});
test('quick and classic progression unlock both encounters at the advertised boundaries',()=>{
 for(const [pace,ruin,shrine] of [['classic',360,560],['quick',90,140]]){
  assert.equal(unlocksForBroken(ruin-1,pace).ruin,false);assert.equal(unlocksForBroken(ruin,pace).ruin,true);
  assert.equal(unlocksForBroken(shrine-1,pace).shrine,false);assert.equal(unlocksForBroken(shrine,pace).shrine,true);
  const core=new OneBlock(42);core.load({broken:ruin,phase:0,pace});assert.equal(core.ruinUnlocked,true);assert.equal(core.shrineUnlocked,false);
  const copy=new OneBlock(42);copy.load(core.snapshot());assert.equal(copy.pace,pace);assert.equal(copy.broken,ruin);
 }
 const legacy=new OneBlock(42);legacy.load({broken:120,phase:2});assert.equal(legacy.pace,'classic');assert.equal(legacy.ruinUnlocked,false);
});
test('island building rewards are optional and granted once, including after reload',()=>{
 const c=setup(),core=new OneBlock(42);
 for(let x=1;x<=8;x++)c.world.setBlock(x,72,0,Block.Planks);
 assert.deepEqual(core.claimGoals(c.world,c.player),['Amplie a ilha: 8 blocos de chão']);
 assert.equal(c.player.inventory.count(Block.Planks),16);assert.deepEqual(core.claimGoals(c.world,c.player),[]);
 for(let x=1;x<=8;x++)for(let y=73;y<=74;y++)c.world.setBlock(x,y,0,Block.Planks);
 core.claimGoals(c.world,c.player);assert.equal(c.player.inventory.count(Block.Glass),8);
 const loaded=new OneBlock(42);loaded.load(core.snapshot());loaded.claimGoals(c.world,c.player);assert.equal(c.player.inventory.count(Block.Glass),8);
 const plain=new OneBlock(42);plain.break(c.world,c.player,c.entities);assert.equal(plain.broken,1);
});
test('quick clicks place and remove a creative block through the raycast interaction',()=>{
 const c=setup();for(let x=0;x<8;x++)for(let z=0;z<8;z++)c.world.setBlock(x,72,z,Block.Planks);
 c.player.position.set(3.5,73,5.5);c.player.yaw=0;c.player.pitch=-.7;c.player.creative=true;c.player.inventory.unlimited=true;c.player.inventory.add(Block.Blue,64);
 const action=new BlockInteraction(c.player,c.world,c.atlas,c.particles,c.sfx,new THREE.Scene());let edit;action.onBuildEdit=value=>edit=value;
 action.update(1/60,input(2),false);assert.equal(edit.after,Block.Blue);const placed={...edit};
 action.update(1/60,input(0),false);assert.equal(c.world.getBlock(placed.x,placed.y,placed.z),Block.Air);assert.equal(edit.before,Block.Blue);assert.equal(c.player.inventory.count(Block.Blue),64);
});
test('survival holding the left button mines continuously and preserves core solidity',()=>{
 const c=setup(),core=new OneBlock(42);c.player.position.set(.5,73,.5);c.player.pitch=-1.5;
 const action=new BlockInteraction(c.player,c.world,c.atlas,c.particles,c.sfx,new THREE.Scene());action.onOneBlockMined=()=>core.break(c.world,c.player,c.entities);
 for(let frame=0;frame<180;frame++)action.update(1/60,input(0,true),false);
 assert.ok(core.broken>=5);assert.notEqual(c.world.getBlock(0,72,0),Block.Air);assert.ok(c.player.inventory.slots.some(s=>s.count>0));
});
test('practice completes by jumping a real wave, exiting a marker and landing a melee hit',()=>{
 const c=setup();c.player.position.set(3,73,0);c.player.health.immune=true;let finished=false;
 const practice=c.entities.add(new BossPractice(0,73,0,()=>{},()=>{finished=true;}));
 for(let i=0;i<210;i++){c.player.body.onGround=false;c.player.position.y=74.5;c.entities.update(c);}
 assert.equal(practice.stage,'circle');
 c.player.position.set(6,73,0);
 for(let i=0;i<200;i++)c.entities.update(c);
 assert.equal(practice.stage,'hit');
 c.player.position.set(3,73,0);c.player.yaw=Math.PI/2;c.player.pitch=0;
 const combat=new PlayerCombat(c.player,c.entities,c.particles,c.sfx,c.world);
 combat.update(1/60,input(0));c.entities.update(c);
 assert.equal(finished,true);assert.equal(c.player.health.current,20);
});
test('melee cannot hit a target behind a solid wall',()=>{
 const c=setup();c.player.position.set(3.5,73,.5);c.player.yaw=Math.PI/2;
 const dummy=c.entities.add(new BossPractice(.5,73,.5,()=>{},()=>{}));dummy.stage='hit';dummy.health.immune=false;
 c.world.setBlock(2,74,0,Block.Planks);
 const combat=new PlayerCombat(c.player,c.entities,c.particles,c.sfx,c.world);combat.update(1/60,input(0));
 assert.equal(dummy.health.current,100);assert.equal(combat.aimed,null);
 c.world.setBlock(2,74,0,Block.Air);combat.update(1/60,input(0));assert.ok(dummy.health.current<100);
});
test('both boss state machines complete via real melee in vulnerability windows and can restart',()=>{
 for(const kind of ['sentinel','warden']){
  const c=setup();c.world=new World(new TerrainGenerator(42,'adventure'));
  const center=kind==='sentinel'?{x:RUIN_COURTYARD.centerX,z:RUIN_COURTYARD.centerZ}:{x:ARENA.centerX,z:ARENA.centerZ};
  for(let x=(center.x>>4)-3;x<=(center.x>>4)+3;x++)for(let z=(center.z>>4)-3;z<=(center.z>>4)+3;z++)c.world.ensureChunk(x,z);
  c.player.health.immune=true;c.player.gentle=true;c.player.hammerTier=2;let wins=0;
  const callbacks={onSummon(){},onPhase(){},onShake(){},onStagger(){},onDefeated(){wins++;},onVictory(){wins++;}};
  const encounter=kind==='sentinel'?new RuinEncounter(c.entities,callbacks):new BossArena(c.entities,callbacks);
  const boss=kind==='sentinel'?encounter.summon(c.world):encounter.summon();
  const combat=new PlayerCombat(c.player,c.entities,c.particles,c.sfx,c.world);let hits=0;combat.onHit=()=>hits++;
  for(let frame=0;frame<18000 && !wins;frame++){
   c.elapsed+=c.dt;
   c.player.position.set(boss.position.x+2.8,boss.position.y,boss.position.z);
   c.player.yaw=Math.PI/2;c.player.pitch=.15;c.player.body.onGround=true;
   c.entities.update(c);
   if(boss.stateName==='stagger')combat.update(c.dt,input(0,true));else combat.update(c.dt,input());
   encounter.update();
  }
  assert.equal(wins,1,kind);assert.ok(hits>0,kind);encounter.reset(c);
  assert.equal(encounter.active,false);const again=kind==='sentinel'?encounter.summon(c.world):encounter.summon();assert.ok(again.health.current>0);
 }
});
test('30 simulated minutes of movement and building retain edits after unload and reload',()=>{
 const c=setup(),camera=new THREE.PerspectiveCamera(),controller=new PlayerController(c.player,c.world,camera);
 c.player.creative=true;c.player.flying=true;c.player.position.set(4.5,90,4.5);
 for(let frame=0;frame<30*60*60;frame++){
  const direction=Math.floor(frame/120)%4;
  controller.update(1/60,{...input(),isDown:key=>key===['KeyW','KeyD','KeyS','KeyA'][direction]});
  if(frame%60===0)c.world.setBlock(3+Math.floor(frame/60)%8,80+Math.floor(frame/480)%4,3,Block.Blue);
  assert.ok(Number.isFinite(c.player.position.x));
 }
 const edits=c.world.exportEdits();c.world.unloadChunk(0,0);c.world.ensureChunk(0,0);
 assert.deepEqual(c.world.exportEdits(),edits);assert.equal(c.world.getBlock(3,80,3),Block.Blue);
});
test('record deterministic mining workload for both OneBlock paces',()=>{
 const result={};
 for(const [pace,limit] of [['classic',560],['quick',140]]){
  let seconds=0,block=Block.Grass;
  for(let n=1;n<=limit;n++){seconds+=getBlockDef(block).hardness;block=pickWeighted(phaseAt(n,pace).phase.blocks,hash2(n,11,42));}
  result[pace]={blocksToSanctuary:limit,uninterruptedMiningSeconds:Math.round(seconds)};
 }
 console.log('OneBlock workload (seed 42, starter hammer, excludes movement/combat):',JSON.stringify(result));
 assert.ok(result.quick.uninterruptedMiningSeconds<result.classic.uninterruptedMiningSeconds);
});
