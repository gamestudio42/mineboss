require('./register.cjs');
const {test}=require('node:test'),assert=require('node:assert/strict'),THREE=require('three');
const {Player}=require('../src/player/Player.ts');
const {PlayerController}=require('../src/player/PlayerController.ts');
const {BlockInteraction}=require('../src/player/BlockInteraction.ts');
const {Block}=require('../src/world/blocks.ts');
const {PlayerCombat}=require('../src/player/PlayerCombat.ts');
const {World}=require('../src/world/World.ts');
const {TerrainGenerator}=require('../src/world/terrain/generator.ts');
const {EntityManager}=require('../src/entities/EntityManager.ts');
const {BossArena}=require('../src/entities/boss/BossArena.ts');
const {RuinEncounter}=require('../src/entities/boss/RuinEncounter.ts');
const {GroveEncounter}=require('../src/entities/boss/GroveEncounter.ts');
const {Shockwave}=require('../src/entities/boss/attacks/Shockwave.ts');
const {RUIN_COURTYARD,ARENA,GROVE}=require('../src/world/arena.ts');
const {mulberry32}=require('../src/core/math.ts');
for(const kind of ['sentinel','warden','beacon'])test(`${kind}: movement, dodges and melee can win gentle combat with damage enabled`,()=>{
 const random=Math.random;Math.random=mulberry32(42);
 try{
 const world=new World(new TerrainGenerator(42,'adventure')),player=new Player(),entities=new EntityManager(new THREE.Scene());
 const center=kind==='sentinel'?{x:RUIN_COURTYARD.centerX,z:RUIN_COURTYARD.centerZ}:kind==='beacon'?{x:GROVE.x,z:GROVE.z}:{x:ARENA.centerX,z:ARENA.centerZ};
 for(let x=(center.x>>4)-3;x<=(center.x>>4)+3;x++)for(let z=(center.z>>4)-3;z<=(center.z>>4)+3;z++)world.ensureChunk(x,z);
 const particles={burst(){}},sfx={play(){}},atlas={tileColors:Array.from({length:64},()=>new THREE.Color('white'))};
 const c={world,player,entities,particles,sfx,atlas,dt:1/60,elapsed:0};
 let wins=0,hits=0,received=0;
 const callbacks={onSummon(){},onPhase(){},onShake(){},onStagger(){},onDefeated(){wins++;},onVictory(){wins++;}};
 const encounter=kind==='sentinel'?new RuinEncounter(entities,callbacks):kind==='beacon'?new GroveEncounter(entities,callbacks):new BossArena(entities,callbacks);
 const boss=kind==='warden'?encounter.summon():encounter.summon(world);
 player.hammerTier=kind==='sentinel'?0:1;player.plates=kind==='sentinel'?0:1;
 player.position.set(boss.position.x+8,boss.position.y,boss.position.z);player.body.fallPeak=player.position.y;
 player.health.onDamage=amount=>received+=amount;
 player.inventory.add(Block.Mushroom,4);
 const interaction=new BlockInteraction(player,world,atlas,particles,sfx,new THREE.Scene());
 const controller=new PlayerController(player,world,new THREE.PerspectiveCamera()),combat=new PlayerCombat(player,entities,particles,sfx,world);combat.onHit=()=>hits++;
 let keys=new Set();const input={isDown:k=>keys.has(k),wasPressed:()=>false,isMouseDown:b=>b===0 ? boss.stateName==='stagger' : b===2&&player.health.current<=12,wasMousePressed:()=>false};
 for(let frame=0;frame<60*240&&!wins&&!player.dead;frame++){
  const dx=boss.position.x-player.position.x,dz=boss.position.z-player.position.z,distance=Math.hypot(dx,dz);
  player.yaw=Math.atan2(-dx,-dz);player.pitch=Math.atan2(boss.position.y+boss.body.height*.5-player.position.y-1.62,distance);
  keys=new Set();
  if(boss.stateName==='stagger'){if(distance>2.8)keys.add('KeyW');}
  else {keys.add('KeyD');if(distance<7)keys.add('KeyS');else if(distance>10)keys.add('KeyW');}
  if(entities.entities.some(e=>e instanceof Shockwave&&e.approaching(player.position)))keys.add('Space');
  controller.update(c.dt,input);combat.update(c.dt,input);if(player.health.current<=12)interaction.update(c.dt,{...input,isMouseDown:b=>b===2},true);c.elapsed+=c.dt;entities.update(c);encounter.update();player.health.update(c.dt);
 }
 console.log('Damage-enabled combat:',JSON.stringify({kind,seconds:Math.round(c.elapsed),wins,hits,received:Math.round(received*10)/10,health:player.health.current,foodRemaining:player.inventory.count(Block.Mushroom)}));
 assert.equal(player.health.immune,false);assert.equal(wins,1);assert.ok(hits>0);assert.ok(player.health.current>0);entities.clear();
 }finally{Math.random=random;}
});
