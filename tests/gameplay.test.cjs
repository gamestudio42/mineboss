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
const { phaseAt,unlocksForBroken,pickWeighted,unlockBreaks,PHASES,chestLoot }=require('../src/world/oneblock/phases.ts');
const { EntityManager }=require('../src/entities/EntityManager.ts');
const { BossPractice }=require('../src/entities/boss/BossPractice.ts');
const { BossArena }=require('../src/entities/boss/BossArena.ts');
const { RuinEncounter }=require('../src/entities/boss/RuinEncounter.ts');
const { GroveEncounter }=require('../src/entities/boss/GroveEncounter.ts');
const { RECIPES,craftRecipe,recipeStatus }=require('../src/player/Recipes.ts');
const { hash2 }=require('../src/core/math.ts');
const { RUIN_COURTYARD,ARENA,GROVE }=require('../src/world/arena.ts');
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
 for(const [pace,ruin,shrine] of [['classic',320,520],['quick',80,130]]){
  assert.equal(unlockBreaks('ruin',pace),ruin);assert.equal(unlockBreaks('shrine',pace),shrine);
  assert.equal(unlocksForBroken(ruin-1,pace).ruin,false);assert.equal(unlocksForBroken(ruin,pace).ruin,true);
  assert.equal(unlocksForBroken(shrine-1,pace).shrine,false);assert.equal(unlocksForBroken(shrine,pace).shrine,true);
  const core=new OneBlock(42);core.load({broken:ruin,phase:0,pace});assert.equal(core.ruinUnlocked,true);assert.equal(core.shrineUnlocked,false);
  const copy=new OneBlock(42);copy.load(core.snapshot());assert.equal(copy.pace,pace);assert.equal(copy.broken,ruin);
 }
 const legacy=new OneBlock(42);legacy.load({broken:120,phase:2});assert.equal(legacy.pace,'classic');assert.equal(legacy.ruinUnlocked,false);
 assert.equal(unlockBreaks('beacon','classic'),640);assert.equal(unlockBreaks('beacon','quick'),160);
 assert.equal(unlocksForBroken(639,'classic').beacon,false);assert.equal(unlocksForBroken(640,'classic').beacon,true);
 assert.equal(unlocksForBroken(159,'quick').beacon,false);assert.equal(unlocksForBroken(160,'quick').beacon,true);
 const grove=new World(new TerrainGenerator(1,'oneblock'));
 grove.generator.applyUnlocks({ruin:false,shrine:false,cache:false,beacon:true});
 grove.ensureChunk(1,5);
 assert.equal(grove.getBlock(GROVE.x,72,GROVE.z),Block.Moss);
 assert.equal(grove.getBlock(GROVE.x,75,GROVE.z),Block.Glowstone);
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
test('early phases stay peaceful, the core stays safe, and a chest opens once',()=>{
 const ore=PHASES.findIndex(p=>p.id==='ore');
 for(let i=0;i<ore;i++)assert.equal(PHASES[i].mobChance,0);
 assert.ok(PHASES[ore].mobChance>0);
 const garden=PHASES.find(p=>p.id==='garden');
 assert.equal(garden.name,'Jardim');assert.equal(garden.length,40);
 assert.ok(garden.extras.some(extra=>extra.id===Block.Chest&&extra.neighbor));
 for(const phase of PHASES)assert.ok(!phase.blocks.some(entry=>entry.id===Block.Chest||entry.id===Block.Lava||entry.id===Block.Water));
 assert.equal(getBlockDef(Block.Flower).heal,2);assert.equal(getBlockDef(Block.Moss).solid,true);
 const c=setup(),core=new OneBlock(11);core.placeInitial(c.world);
 const limit=unlockBreaks('ruin','classic');
 for(let n=0;n<80;n++){
  core.break(c.world,c.player,c.entities);
  const id=c.world.getBlock(0,72,0);
  assert.notEqual(id,Block.Air);assert.notEqual(id,Block.Lava);assert.notEqual(id,Block.Water);assert.notEqual(id,Block.Chest);
 }
 assert.equal(core.phase.id,'garden');
 assert.ok(c.player.inventory.count(Block.Planks)+c.player.inventory.count(Block.Mushroom)>0);
 for(let n=80;n<limit-1;n++){
  core.break(c.world,c.player,c.entities);
  const id=c.world.getBlock(0,72,0);
  assert.notEqual(id,Block.Air);assert.notEqual(id,Block.Lava);assert.notEqual(id,Block.Water);assert.notEqual(id,Block.Chest);
 }
 core.update(10,c.world,c.entities,c.player);
 assert.equal(c.entities.entities.filter(entity=>!entity.removed).length,0);
 assert.equal(core.ruinUnlocked,false);
 core.break(c.world,c.player,c.entities);assert.equal(core.ruinUnlocked,true);
 for(let x=0;x<8;x++)for(let z=0;z<8;z++)c.world.setBlock(x,72,z,Block.Planks);
 c.player.position.set(3.5,73,5.5);c.player.yaw=0;c.player.pitch=-.7;
 const action=new BlockInteraction(c.player,c.world,c.atlas,c.particles,c.sfx,new THREE.Scene());
 action.update(1/60,input(-1),false);
 const hit=action.target;assert.ok(hit);assert.ok(!(hit.x===0&&hit.y===72&&hit.z===0));
 const loot=chestLoot(2),before=c.player.inventory.count(Block.Dirt);
 c.world.setBlock(hit.x,hit.y,hit.z,Block.Chest);
 let opened=0;
 action.onChestOpened=()=>{opened++;for(const item of loot)c.player.inventory.add(item.id,item.count);};
 action.update(1/60,input(2),false);
 assert.equal(opened,1);assert.equal(c.world.getBlock(hit.x,hit.y,hit.z),Block.Air);
 assert.equal(c.player.inventory.count(Block.Dirt),before+loot.find(item=>item.id===Block.Dirt).count);
 action.update(1,input(2),false);assert.equal(opened,1);
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
test('all three boss state machines complete via real melee in vulnerability windows and can restart',()=>{
 for(const kind of ['sentinel','warden','beacon']){
  const c=setup();c.world=new World(new TerrainGenerator(42,'adventure'));
  const center=kind==='sentinel'?{x:RUIN_COURTYARD.centerX,z:RUIN_COURTYARD.centerZ}:kind==='beacon'?{x:GROVE.x,z:GROVE.z}:{x:ARENA.centerX,z:ARENA.centerZ};
  for(let x=(center.x>>4)-3;x<=(center.x>>4)+3;x++)for(let z=(center.z>>4)-3;z<=(center.z>>4)+3;z++)c.world.ensureChunk(x,z);
  c.player.health.immune=true;c.player.gentle=true;c.player.hammerTier=2;let wins=0;
  const callbacks={onSummon(){},onPhase(){},onShake(){},onStagger(){},onDefeated(){wins++;},onVictory(){wins++;}};
  const encounter=kind==='sentinel'?new RuinEncounter(c.entities,callbacks):kind==='beacon'?new GroveEncounter(c.entities,callbacks):new BossArena(c.entities,callbacks);
  const boss=kind==='warden'?encounter.summon():encounter.summon(c.world);
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
  assert.equal(encounter.active,false);const again=kind==='warden'?encounter.summon():encounter.summon(c.world);assert.ok(again.health.current>0);
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
 for(const [pace,limit] of [['classic',520],['quick',130]]){
  let seconds=0,block=Block.Grass;
  for(let n=1;n<=limit;n++){seconds+=getBlockDef(block).hardness;block=pickWeighted(phaseAt(n,pace).phase.blocks,hash2(n,11,42));}
  result[pace]={blocksToSanctuary:limit,uninterruptedMiningSeconds:Math.round(seconds)};
 }
 console.log('OneBlock workload (seed 42, starter hammer, excludes movement/combat):',JSON.stringify(result));
 assert.ok(result.quick.uninterruptedMiningSeconds<result.classic.uninterruptedMiningSeconds);
});
