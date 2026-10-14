require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const { Player } = require('../src/player/Player.ts');
const { PlayerController } = require('../src/player/PlayerController.ts');
const { World } = require('../src/world/World.ts');
const { TerrainGenerator } = require('../src/world/terrain/generator.ts');
const { Block } = require('../src/world/blocks.ts');

const DT = 1 / 60;
function course(floor, { creative = false, keys = ['KeyD'], x = .5, z = .5, y = 91 } = {}) {
  const world = new World(new TerrainGenerator(42, 'oneblock'));
  for (let cx = -1; cx <= 1; cx++) for (let cz = -1; cz <= 1; cz++) world.ensureChunk(cx, cz);
  for (let bx = -12; bx <= 12; bx++) for (let bz = -12; bz <= 12; bz++) {
    const cell = floor(bx, bz);
    if (cell !== null) world.setBlock(bx, typeof cell === 'number' ? cell : cell.y, bz, typeof cell === 'number' ? Block.Grass : cell.block);
  }
  const player = new Player(); player.creative = creative;
  player.position.set(x, y, z); player.body.onGround = true; player.body.fallPeak = y;
  const controller = new PlayerController(player, world, new THREE.PerspectiveCamera());
  const input = { wasPressed: () => false, isDown: key => keys.includes(key) };
  const run = (seconds = 1.4, dt = DT) => { for (let t = 0; t < seconds; t += dt) controller.update(dt, input); };
  return { world, player, controller, input, run };
}

for (const creative of [false, true]) {
  for (const [key, axis, direction] of [['KeyD','x',1],['KeyA','x',-1],['KeyS','z',1],['KeyW','z',-1]]) {
    test(`walk down one block without jumping: ${creative?'creative':'survival'} ${key}`, () => {
      const c = course((x,z) => ((axis === 'x' ? x : z) * direction < 2 ? 90 : 89), { creative, keys: [key] });
      c.run();
      assert.ok(c.player.position[axis] * direction > 3, `stopped at ${c.player.position.toArray()}`);
      assert.equal(c.player.position.y, 90); assert.equal(c.player.body.onGround, true);
      assert.equal(c.player.health.current, 20); assert.equal(c.player.body.intersectsWorld(c.world), false);
    });
  }
}
test('walking diagonally descends a one-block terrace', () => {
  const c = course((x,z) => x < 2 && z < 2 ? 90 : 89, { keys:['KeyD','KeyS'] }); c.run();
  assert.ok(c.player.position.x > 3 && c.player.position.z > 3); assert.equal(c.player.position.y,90);
});
test('a staircase can be descended continuously without Space', () => {
  const c = course(x => 90 - Math.max(0,Math.floor(x / 2))); c.run(1.6);
  assert.ok(c.player.position.x > 5); assert.ok(c.player.position.y <= 89); assert.equal(c.player.health.current,20);
});
for (const dt of [1/120, 1/60, 1/30, .1]) {
  test(`sprinting onto a narrow lower ledge does not carry the player into the void at dt=${dt}`, () => {
    const c = course((x,z) => z > -2 ? 90 : z === -2 ? 89 : null, { keys:['KeyW','ShiftLeft'] });
    c.run(2,dt);
    assert.equal(c.player.position.y,90); assert.equal(c.player.body.onGround,true);
    assert.ok(c.player.position.z > -2.3); assert.equal(c.player.health.current,20);
  });
}
for (const destination of ['void','damaging drop','lava']) {
  test(`edge protection still blocks ${destination}`, () => {
    const c = course(x => x < 2 ? 90 : destination === 'void' ? null : destination === 'lava' ? { y:89,block:Block.Lava } : 85);
    c.run(); assert.ok(c.player.position.x < 2.3); assert.equal(c.player.position.y,91); assert.equal(c.player.health.current,20);
  });
}
test('jump remains an explicit way to cross a protected edge', () => {
  const c = course(x => x < 2 ? 90 : 85); c.run(.6);
  c.controller.update(DT,{wasPressed:()=>false,isDown:key=>key==='KeyD'||key==='Space'}); c.run(.9);
  assert.ok(c.player.position.x > 3); assert.ok(c.player.position.y < 91);
});
test('ascending a one-block step still works with edge protection enabled', () => {
  const c = course(x => x < 2 ? 90 : 91); c.run();
  assert.ok(c.player.position.x > 3); assert.equal(c.player.position.y,92); assert.equal(c.player.body.intersectsWorld(c.world),false);
});


function enclosedPit(depth, creative, width = 3) {
  const inside = (x,z) => x >= 2 && x < 2 + width && z >= 0 && z < 3;
  const c = course((x,z) => inside(x,z) ? 90-depth : 90, {creative,z:1.5});
  c.player.health.immune = creative;
  // Real side walls, rather than just disconnected horizontal platforms.
  for(let x=-3;x<=8;x++)for(let z=-3;z<=5;z++)for(let y=90-depth;y<90;y++) {
    if(!inside(x,z))c.world.setBlock(x,y,z,Block.Dirt);
  }
  return c;
}
for(const creative of [false,true])for(const depth of [2,3,4]) {
  test(`enter an enclosed ${depth}-block pit by walking in ${creative?'creative':'survival'}`,()=>{
    const c=enclosedPit(depth,creative);c.run(2);
    assert.ok(c.player.position.x>2.3,`blocked at ${c.player.position.toArray()}`);
    assert.equal(c.player.position.y,91-depth);assert.equal(c.player.body.onGround,true);
    assert.equal(c.player.body.intersectsWorld(c.world),false);assert.equal(c.player.health.current,20);
  });
}
test('a one-block-wide pit can be entered without jumping',()=>{
  const c=enclosedPit(3,true,1);c.run(2);
  assert.ok(c.player.position.x>2.3&&c.player.position.x<2.71);
  assert.equal(c.player.position.y,88);assert.equal(c.player.body.onGround,true);
});
for(const depth of [8,16])test(`creative can walk into a ${depth}-block pit with a safe floor`,()=>{
  const c=enclosedPit(depth,true);c.run(2.5);
  assert.ok(c.player.position.x>2.3);assert.equal(c.player.position.y,91-depth);
  assert.equal(c.player.health.current,20);assert.equal(c.player.body.onGround,true);
});
test('survival still refuses a pit deep enough to cause fall damage',()=>{
  const c=enclosedPit(8,false);c.run(2);
  assert.ok(c.player.position.x<2.3);assert.equal(c.player.position.y,91);
});
for(const hazard of ['void','lava'])test(`creative protection still refuses ${hazard}`,()=>{
  const c=course(x=>x<2?90:hazard==='void'?null:{y:82,block:Block.Lava},{creative:true});
  if(hazard==='lava')for(let x=2;x<=12;x++)for(let z=-12;z<=12;z++)c.world.setBlock(x,81,z,Block.Stone);
  c.run();assert.ok(c.player.position.x<2.3);assert.equal(c.player.position.y,91);
});
for(const dt of [1/30,.1])test(`deep creative descent lands on its floor with dt=${dt}`,()=>{
  const c=enclosedPit(32,true);c.run(4,dt);
  assert.equal(c.player.position.y,59);assert.equal(c.player.body.onGround,true);
  assert.equal(c.player.body.intersectsWorld(c.world),false);
});
