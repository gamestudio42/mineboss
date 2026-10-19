const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
const { pathToFileURL } = require('node:url');
// Execute project modules without emitting build files or requiring browser globals.
require.extensions['.ts'] = (module, filename) => {
  const source = fs.readFileSync(filename, 'utf8')
    .replaceAll('import.meta.url', JSON.stringify(pathToFileURL(filename).href))
    .replaceAll('import.meta.env.DEV', 'false');
  module._compile(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const THREE = require('three');
const { Block, BLOCKS, getBlockDef, isSolid } = require('../src/world/blocks.ts');
const { Inventory } = require('../src/player/Inventory.ts');
const { Player } = require('../src/player/Player.ts');
const { PlayerController } = require('../src/player/PlayerController.ts');
const { World } = require('../src/world/World.ts');
const { TerrainGenerator } = require('../src/world/terrain/generator.ts');
const { OneBlock } = require('../src/world/oneblock/OneBlock.ts');
const { PHASES } = require('../src/world/oneblock/phases.ts');
const { EntityManager } = require('../src/entities/EntityManager.ts');
const { blastTerrain, hitPlayer } = require('../src/combat/DamageSystem.ts');
const { loadSave, saveRun, parseSave } = require('../src/core/Save.ts');
const { Game } = require('../src/core/Game.ts');
const storage = new Map();
global.localStorage = { getItem: key => storage.get(key) ?? null, setItem: (key, value) => storage.set(key, value) };
function run(mode = 'adventure') {
 return { version: 5, mode, seed: 42, elapsed: 3, deaths: 0, blocksMined: 0,
 hintedConsumable:false,hintedUpgrade:false,hintedTorch:false,
 player: { x:0.5,y:73,z:0.5,spawnX:0.5,spawnY:73,spawnZ:0.5,yaw:0,pitch:0,health:20,hammer:0,selected:0,slots:Array.from({length:9},()=>({block:null,count:0})) },
 arena:{defeated:false,discovered:false},oneBlock:{broken:0,phase:0},edits:[] };
}
function world() { const w = new World(new TerrainGenerator(42,'oneblock')); for(let x=-1;x<=1;x++)for(let z=-1;z<=1;z++)w.ensureChunk(x,z); return w; }
const noInput = { wasPressed:()=>false,isDown:()=>false };
test('block IDs map to their definitions and every phase core is solid',()=>{
 for(const b of BLOCKS) assert.equal(getBlockDef(b.id),b);
 assert.equal(getBlockDef(Block.Lava).contactDamage,7);
 assert.equal(getBlockDef(Block.Mushroom).solid,false);
 for(const p of PHASES)for(const entry of p.blocks)assert.ok(isSolid(entry.id));
});
test('full inventory retains overflow and swapping reserve does not lose the previous slot',()=>{
 const i = new Inventory();i.add(Block.Dirt,9*64);i.add(Block.GoldOre,70);
 assert.equal(i.reserve.get(Block.GoldOre),70);
 i.equipReserve(Block.GoldOre);assert.equal(i.selectedSlot.count,64);assert.equal(i.reserve.get(Block.GoldOre),6);assert.equal(i.reserve.get(Block.Dirt),64);
 i.equipReserve(Block.Dirt);assert.equal(i.reserve.get(Block.GoldOre),70);
});
test('creative selection never consumes blocks and restores survival inventory including reserve',()=>{
 const g=Object.create(Game.prototype);g.mode='adventure';g.player=new Player();
 g.player.inventory.add(Block.GoldOre,700);const before=g.inventorySnapshot();
 g.setCreative(true);assert.equal(g.player.creative,true);const count=g.player.inventory.selectedSlot.count;g.player.inventory.takeSelected();assert.equal(g.player.inventory.selectedSlot.count,count);
 g.player.inventory.selectedSlot.block=Block.BirchLeaves;
 g.setCreative(false);assert.deepEqual(g.inventorySnapshot(),before);assert.equal(g.player.health.immune,false);
});
test('saves stay separate and exported files validate before replacing anything',()=>{
 storage.clear();assert.equal(saveRun(run()),true);const b=run('oneblock');b.seed=99;saveRun(b);
 assert.equal(loadSave('adventure').seed,42);assert.equal(loadSave('oneblock').seed,99);
 for(const invalid of ['{','null',JSON.stringify({...run(),player:{...run().player,x:null}}),JSON.stringify({...run(),edits:[{x:0,y:999,z:0,id:1}]}),JSON.stringify({...run(),creative:true}),
  JSON.stringify({...run(),arena:{...run().arena,ruinFound:'yes'}}),JSON.stringify({...run(),arena:{...run().arena,cacheClaimed:1}}),JSON.stringify({...run(),arena:{...run().arena,ruinDefeated:'no'}}),JSON.stringify({...run(),arena:{...run().arena,beaconDefeated:'no'}})]) assert.equal(parseSave(invalid),null);
 assert.equal(loadSave('adventure').seed,42);
});
test('legacy versions 1, 2 and 3 load into the correct mode',()=>{
 for(const version of [1,2,3,4]){ const r=run(version===2?'oneblock':'adventure');r.version=version;if(version===1)delete r.oneBlock;
 assert.equal(parseSave(JSON.stringify(r)).version,5);assert.equal(parseSave(JSON.stringify(r)).mode,version===2?'oneblock':'adventure'); }
});
test('creative world, reserve, awards, preferences survive JSON roundtrip',()=>{
 const r=run();r.creative=true;r.gentle=true;r.edgeProtection=false;r.trophies=[Block.SentinelTrophy];r.reserve=[{block:Block.Dirt,count:700}];r.survival={slots:r.player.slots,selected:0,reserve:[{block:Block.GoldOre,count:12}]};
 assert.deepEqual(parseSave(JSON.stringify(r)),r);
});
test('storage failure is reported instead of claiming the save worked',()=>{
 const fn=localStorage.setItem;localStorage.setItem=()=>{throw Error('quota');};assert.equal(saveRun(run()),false);localStorage.setItem=fn;
});
test('boss explosions protect player construction and structure rebuild preserves player edits',()=>{
 const w=world();w.setBlock(2,73,0,Block.Planks);w.restoreStructure(3,73,0,Block.Cobblestone);
 blastTerrain({world:w,center:new THREE.Vector3(2.5,73.5,0.5),radius:2,terrainRadius:2,particles:{burst(){}},atlas:{tileColors:[]}});
 assert.equal(w.getBlock(2,73,0),Block.Planks);assert.equal(w.getBlock(3,73,0),Block.Air);
 w.restoreStructure(2,73,0,Block.RunicStone);assert.equal(w.getBlock(2,73,0),Block.Planks);
});
test('generated statue can be cleared and restored repeatedly',()=>{
 const w=world();w.restoreStructure(2,73,0,Block.RunicStone);w.restoreStructure(2,73,0,Block.Air);w.restoreStructure(2,73,0,Block.RunicStone);
 assert.equal(w.getBlock(2,73,0),Block.RunicStone);assert.equal(w.edits.has('2,73,0'),false);
});
test('chunk reload reapplies only that column of edits and nearby torches skip distant columns',()=>{
 const w=world();w.setBlock(2,73,2,Block.Planks);w.ensureChunk(8,8);w.setBlock(130,73,130,Block.Torch);
 w.unloadChunk(0,0);w.ensureChunk(0,0);assert.equal(w.getBlock(2,73,2),Block.Planks);
 const near=[];w.forEachNearbyTorch(2.5,2.5,26,torch=>near.push(torch));assert.equal(near.length,0);
 const far=[];w.forEachNearbyTorch(130.5,130.5,26,torch=>far.push(torch));assert.equal(far.length,1);
});
test('gentle damage is lower and respawn has protection',()=>{
 const p=new Player();p.gentle=false;hitPlayer(p,4,null,0);assert.equal(p.health.current,16);
 p.health.reset();p.gentle=true;hitPlayer(p,4,null,0);assert.equal(p.health.current,18.2);
 p.respawn();assert.equal(hitPlayer(p,4,null,0),false);assert.equal(p.health.current,20);
});
test('edge protection prevents walking off a block; disabling permits it',()=>{
 for(const protect of [true,false]){const w=world(),p=new Player();p.position.set(0.5,73,0.5);p.body.onGround=true;p.edgeProtection=protect;
 const c=new PlayerController(p,w,new THREE.PerspectiveCamera());const input={...noInput,isDown:k=>k==='KeyD'};
 for(let i=0;i<60;i++)c.update(1/60,input);
 assert.equal(p.position.y>=72.9,protect);}
});
test('OneBlock warns before spawning, and gentle Ember never creates lava',()=>{
 const w=world(),p=new Player(),entities=new EntityManager(new THREE.Scene()),core=new OneBlock(42);let warnings=0;core.onWarning=()=>warnings++;
 core.broken=460;for(let i=0;i<99;i++)core.break(w,p,entities);
 assert.ok(warnings>0);assert.equal(entities.entities.length,0);
 for(const [x,z] of [[1,0],[-1,0],[0,1],[0,-1]]){assert.notEqual(w.getBlock(x,72,z),Block.Lava);w.setBlock(x,72,z,Block.Air);}
 core.update(1,w,entities);assert.equal(entities.entities.length,0);core.update(3,w,entities);assert.equal(entities.entities.length,0);
 w.setBlock(1,72,0,Block.Dirt);core.update(1,w,entities);assert.equal(entities.entities.length,1);
});
test('unsafe spawn relocates without deleting player blocks',()=>{
 const g=Object.create(Game.prototype);g.mode='oneblock';g.world=world();g.player=new Player();g.chunks={preload(){}};
 g.player.setSpawn(0.5,73,0.5);g.world.setBlock(0,73,0,Block.Planks);g.ensureSafeSpawn();
 assert.equal(g.world.getBlock(0,73,0),Block.Planks);assert.equal(g.player.spawn.y,74);
});
test('ruin discovery hint waits until a boss fight ends',()=>{
 const g=Object.create(Game.prototype);g.mode='adventure';g.player=new Player();
 let discoveries=0,hints=0;
 g.arena={active:false,tryDiscoverRuin(){discoveries++;return true;}};
 g.ruin={active:true};g.hud={showHint(){hints++;}};g.saveSoon=false;
 g.tryDiscoverRuin();assert.equal(discoveries,0);assert.equal(hints,0);
 g.ruin.active=false;g.tryDiscoverRuin();assert.equal(discoveries,1);assert.equal(hints,1);assert.equal(g.saveSoon,true);
});
test('Sentinel victory restores creative play, grants one trophy and supports a repeat fight',()=>{
 const { RuinEncounter }=require('../src/entities/boss/RuinEncounter.ts');
 const g=Object.create(Game.prototype);g.mode='adventure';g.player=new Player();g.trophies=new Set();g.fightReturn=null;g.hud={bossBar:{hide(){}},cleared:0,hideHint(){this.cleared++},setObjective(){}};
 g.entities=new EntityManager(new THREE.Scene());g.arena={boss:null};g.grove={boss:null,active:false,defeated:false};g.world=world();g.world.generator.ruinUnlocked=true;
 for(let x=-5;x<=-3;x++)for(let z=0;z<=2;z++)g.world.ensureChunk(x,z);
 g.player.inventory.add(Block.Dirt,4);
 const ctx={dt:1/60,elapsed:0,player:g.player,world:g.world,entities:g.entities,particles:{burst(){}},sfx:{play(){}},atlas:{tileColors:[]}};
 g.ruin=new RuinEncounter(g.entities,{onSummon(){},onPhase(){},onShake(){},onStagger(){},onDefeated(){g.rewardBoss(Block.SentinelTrophy);g.finishFight();g.ruin.rebuildStatue(g.world);}});
 g.setCreative(true);
 for(let fight=0;fight<2;fight++){
   g.fightCreative=true;g.setCreative(false);
   const boss=g.ruin.summon(g.world);boss.health.damage(boss.health.max);
   for(let frame=0;frame<350;frame++){ctx.elapsed+=ctx.dt;g.entities.update(ctx);g.ruin.update();}
   assert.equal(g.ruin.defeated,true);assert.equal(g.ruin.active,false);assert.equal(g.player.creative,true);
   const earned=g.survival.slots.filter(s=>s.block===Block.SentinelTrophy).reduce((n,s)=>n+s.count,0);
   assert.equal(earned,1);
 }
 assert.equal(g.world.getBlock(-62,74,28),Block.RunicStone);
 assert.equal(g.hud.cleared,2);
});
