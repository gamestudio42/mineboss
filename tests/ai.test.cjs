require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const { pickGuideHint, shownFromSave } = require('../src/player/Guide.ts');
const { steerAround } = require('../src/entities/boss/steer.ts');
const { scoreSentinelAttack, pickSentinelAttack } = require('../src/entities/boss/sentinelAttack.ts');
const { mobPressure, phaseHasMushroomExtra } = require('../src/world/oneblock/director.ts');
const { OneBlock } = require('../src/world/oneblock/OneBlock.ts');
const { PHASES } = require('../src/world/oneblock/phases.ts');
const { Block } = require('../src/world/blocks.ts');
const { Player } = require('../src/player/Player.ts');
const { World } = require('../src/world/World.ts');
const { TerrainGenerator } = require('../src/world/terrain/generator.ts');
const { EntityManager } = require('../src/entities/EntityManager.ts');
const { BUILD_IDEAS, ideaCubes } = require('../src/ui/BuildIdeas.ts');
const { parseSave } = require('../src/core/Save.ts');

const idle = {
  enabled: true,
  fighting: false,
  health: 20,
  hasHeal: false,
  mode: 'adventure',
  hasDirtOrGrass: false,
  hasPlanksOrLog: false,
  hasTorchFuel: false,
  hasTorch: false,
  platformDone: false,
  shelterDone: false,
  ruinUnlocked: false,
  ruinFound: false,
};

function worldSetup() {
  const world = new World(new TerrainGenerator(42, 'oneblock'));
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) world.ensureChunk(x, z);
  const player = new Player();
  const entities = new EntityManager(new THREE.Scene());
  return { world, player, entities };
}

test('guide picks the first unused hint and stays quiet when disabled or fighting', () => {
  const eat = pickGuideHint({ ...idle, health: 6, hasHeal: true }, new Set());
  assert.equal(eat.id, 'eat');
  const next = pickGuideHint({ ...idle, health: 6, hasHeal: true, hasTorchFuel: true }, new Set(['eat']));
  assert.equal(next.id, 'torch');
  assert.equal(pickGuideHint({ ...idle, health: 6, hasHeal: true, enabled: false }, new Set()), null);
  assert.equal(pickGuideHint({ ...idle, health: 6, hasHeal: true, fighting: true }, new Set()), null);
  assert.equal(pickGuideHint({ ...idle, health: 6, hasHeal: true }, new Set(['eat'])), null);
});

test('guide prefers island goals before the ruin, and save flags seed shown ids', () => {
  const facts = {
    ...idle,
    mode: 'oneblock',
    hasDirtOrGrass: true,
    hasPlanksOrLog: true,
    ruinUnlocked: true,
  };
  assert.equal(pickGuideHint(facts, new Set()).id, 'platform');
  assert.equal(pickGuideHint(facts, new Set(['platform'])).id, 'shelter');
  assert.equal(pickGuideHint(facts, new Set(['platform', 'shelter'])).id, 'ruin');
  assert.deepEqual(shownFromSave({ hintedConsumable: true, hintedTorch: true }).sort(), ['eat', 'torch']);
});

test('steerAround keeps an open corridor, takes a right gap, and turns away from the void', () => {
  const floor = new Set(['0,72,0', '0,72,1', '1,72,0', '-1,72,0']);
  const wall = new Set(['0,73,1', '0,74,1']);
  const getBlock = (x, y, z) => {
    const key = `${x},${y},${z}`;
    if (wall.has(key)) return Block.Cobblestone;
    if (floor.has(key)) return Block.Grass;
    return Block.Air;
  };
  const open = steerAround({ x: 0.5, y: 73, z: 0.5 }, 0, 1, (x, y, z) => {
    if (x === 0 && z === 1 && y >= 73) return Block.Air;
    return getBlock(x, y, z);
  }, 1);
  assert.ok(open.z > 0.5);
  assert.ok(Math.abs(open.x) < 0.01);

  const around = steerAround({ x: 0.5, y: 73, z: 0.5 }, 0, 1, getBlock, -1);
  assert.ok(around.x > 0.5);
  assert.ok(around.z < 0.2);

  const drop = steerAround({ x: 0.5, y: 73, z: 0.5 }, 0, 1, (x, y, z) => {
    if (z >= 1) return Block.Air;
    return getBlock(x, y, z);
  }, 1);
  assert.ok(drop.z < 0.2);
});

test('sentinel scoring keeps the current attacks, prefers slam up close, and eases slam after a jump', () => {
  const close = scoreSentinelAttack({ distance: 4, phase: 0, gentle: false });
  assert.ok(close.slam > close.charge);
  assert.equal(close.shard, 0);
  assert.equal(pickSentinelAttack({ distance: 4, phase: 0, gentle: false }, () => 0), 'slam');

  const far = scoreSentinelAttack({ distance: 12, phase: 1, gentle: false });
  assert.ok(far.shard > 0);
  assert.ok(far.charge > far.slam);

  const ready = { distance: 8, phase: 0, gentle: false };
  const jumped = scoreSentinelAttack({ ...ready, lastWaveJumped: true });
  assert.ok(jumped.slam < scoreSentinelAttack(ready).slam);

  const gentle = scoreSentinelAttack({ distance: 12, phase: 0, gentle: true });
  assert.equal(gentle.shard, 0);
  assert.ok(gentle.slam === 0 || gentle.charge > 0);
});

test('oneblock director only relieves pressure and grants a mushroom when the phase already has one', () => {
  for (const phase of PHASES) {
    if (phase.mobChance === 0) assert.equal(phase.mobChance * mobPressure({ gentle: false, deathsSinceBreak: 3, health: 4 }), 0);
  }
  const calm = mobPressure({ gentle: true, deathsSinceBreak: 0, health: 20 });
  const afterDeath = mobPressure({ gentle: true, deathsSinceBreak: 1, health: 20 });
  const hurt = mobPressure({ gentle: false, deathsSinceBreak: 1, health: 6 });
  assert.equal(calm, 0.4);
  assert.ok(afterDeath < calm);
  assert.ok(afterDeath >= 0.25);
  assert.ok(hurt < 1);
  assert.ok(mobPressure({ gentle: false, deathsSinceBreak: 0, health: 20 }) <= 1);
  assert.ok(phaseHasMushroomExtra(PHASES.find((phase) => phase.id === 'plains')));
  assert.equal(phaseHasMushroomExtra(PHASES.find((phase) => phase.id === 'ore')), false);

  const { world, player, entities } = worldSetup();
  const plains = new OneBlock(1);
  plains.noteDeath();
  const before = player.inventory.count(Block.Mushroom);
  plains.break(world, player, entities);
  assert.ok(player.inventory.count(Block.Mushroom) >= before + 1);

  const wastes = new OneBlock(7);
  wastes.load({ broken: 160, phase: 4 });
  const start = player.inventory.count(Block.Mushroom);
  wastes.noteDeath();
  wastes.break(world, player, entities);
  assert.equal(player.inventory.count(Block.Mushroom), start);
});

test('tower and pen ideas stay previews, and shownHints round-trip in a v5 save', () => {
  assert.ok(BUILD_IDEAS.some((idea) => idea.id === 'tower'));
  assert.ok(BUILD_IDEAS.some((idea) => idea.id === 'pen'));
  assert.ok(ideaCubes('tower', 2).length > ideaCubes('tower', 0).length);
  assert.ok(ideaCubes('pen', 2).length > ideaCubes('pen', 0).length);
  const raw = {
    version: 5, mode: 'adventure', seed: 42, elapsed: 1, deaths: 0, blocksMined: 0,
    hintedConsumable: false, hintedUpgrade: false, hintedTorch: false,
    shownHints: ['platform', 'eat'],
    player: { x: 0.5, y: 73, z: 0.5, spawnX: 0.5, spawnY: 73, spawnZ: 0.5, yaw: 0, pitch: 0, health: 20, hammer: 0, selected: 0, slots: Array.from({ length: 9 }, () => ({ block: null, count: 0 })) },
    arena: { defeated: false, discovered: false }, oneBlock: { broken: 0, phase: 0 }, edits: [],
  };
  assert.deepEqual(parseSave(JSON.stringify(raw)).shownHints, ['platform', 'eat']);
  assert.equal(parseSave(JSON.stringify({ ...raw, shownHints: ['x'.repeat(40)] })), null);
});
