require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const { Player } = require('../src/player/Player.ts');
const { PLAYER_EYE_HEIGHT } = require('../src/player/Player.ts');
const { PlayerController, CameraView, THIRD_PERSON_DISTANCE, nextCameraView, placePlayerCamera } = require('../src/player/PlayerController.ts');
const { BlockInteraction } = require('../src/player/BlockInteraction.ts');
const { Block } = require('../src/world/blocks.ts');
const { World } = require('../src/world/World.ts');
const { TerrainGenerator } = require('../src/world/terrain/generator.ts');

function air() {
  const world = new World(new TerrainGenerator(42, 'oneblock'));
  world.ensureChunk(0, 0);
  return world;
}

const idle = { mouseDX: 0, mouseDY: 0, wasPressed: () => false, isDown: () => false, isMouseDown: () => false, wasMousePressed: () => false };

test('camera view toggles between first person and behind the character', () => {
  assert.equal(nextCameraView(CameraView.First), CameraView.Back);
  assert.equal(nextCameraView(CameraView.Back), CameraView.First);
});

test('first person stays on the eyes and third person sits along the look', () => {
  const first = placePlayerCamera(8.5, 20.5, 8.5, 0, 0, CameraView.First, 0.2, 0.1, null);
  assert.deepEqual([first.x, first.y, first.z, first.yaw, first.pitch], [8.7, 20.6, 8.5, 0, 0]);

  const back = placePlayerCamera(8.5, 20.5, 8.5, 0, 0, CameraView.Back, 0, 0, null);
  assert.ok(Math.abs(back.x - 8.5) < 1e-6);
  assert.ok(Math.abs(back.y - 20.5) < 1e-6);
  assert.ok(Math.abs(back.z - (8.5 + THIRD_PERSON_DISTANCE)) < 1e-6);
  assert.equal(back.yaw, 0);
  assert.equal(back.pitch, 0);

  const down = placePlayerCamera(8.5, 20.5, 8.5, 0, -0.4, CameraView.Back, 0, 0, null);
  assert.ok(down.y > 20.5);
});

test('a solid block shortens the third-person camera and a torch does not', () => {
  const world = air();
  world.setBlock(8, 20, 11, Block.Stone);
  const blocked = placePlayerCamera(8.5, 20.5, 8.5, 0, 0, CameraView.Back, 0, 0, world);
  assert.ok(blocked.z < 11);
  assert.ok(blocked.z > 8.5);
  assert.ok(blocked.z < 8.5 + THIRD_PERSON_DISTANCE - 0.2);

  world.setBlock(8, 20, 11, Block.Torch);
  const open = placePlayerCamera(8.5, 20.5, 8.5, 0, 0, CameraView.Back, 0, 0, world);
  assert.ok(Math.abs(open.z - (8.5 + THIRD_PERSON_DISTANCE)) < 1e-6);
});

test('the live controller keeps first person on the eyes and third person behind them', () => {
  const world = air();
  const player = new Player();
  player.position.set(8.5, 20, 8.5);
  player.body.onGround = true;
  const camera = new THREE.PerspectiveCamera();
  const controller = new PlayerController(player, world, camera);
  controller.reducedMotion = true;
  controller.update(1 / 60, idle);
  const eye = new THREE.Vector3();
  player.getEyePosition(eye);
  assert.ok(Math.abs(camera.position.x - eye.x) < 1e-6);
  assert.ok(Math.abs(camera.position.y - eye.y) < 1e-6);
  assert.ok(Math.abs(camera.position.z - eye.z) < 1e-6);

  controller.cycleView();
  player.body.onGround = true;
  player.velocity.set(0, 0, 0);
  controller.update(1 / 60, idle);
  player.getEyePosition(eye);
  assert.ok(camera.position.z > eye.z + 3);
  assert.equal(camera.position.y, eye.y);
});

test('mining and melee aim from the eyes, not from where the third-person camera sits', () => {
  const world = air();
  const player = new Player();
  player.position.set(8.5, 20, 8.5);
  player.yaw = 0;
  player.pitch = 0;
  const eyeY = 20 + PLAYER_EYE_HEIGHT;
  world.setBlock(8, Math.floor(eyeY), 6, Block.Stone);
  world.setBlock(8, Math.floor(eyeY), 12, Block.Stone);
  const camera = placePlayerCamera(8.5, eyeY, 8.5, 0, 0, CameraView.Back, 0, 0, null);
  assert.ok(camera.z > 11);

  const scene = new THREE.Scene();
  const interaction = new BlockInteraction(player, world, { tileColors: [] }, { burst() {} }, { play() {} }, scene);
  interaction.update(1 / 60, idle, false);
  assert.equal(interaction.target.x, 8);
  assert.equal(interaction.target.z, 6);
  assert.notEqual(interaction.target.z, 12);
});
