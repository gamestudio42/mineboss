require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const {
  PLAYER_FACE,
  HAIR_RGB,
  SKIN_RGB,
  PUPIL_RGB,
  LIP_RGB,
  WHITE_RGB,
  createPlayerHeadMaterials,
} = require('../src/render/PlayerSkin.ts');
const { PlayerModel } = require('../src/render/PlayerModel.ts');

test('the painted face is a closed look, not a stuck-on grin', () => {
  assert.equal(PLAYER_FACE.length, 8);
  assert.equal(PLAYER_FACE[0].length, 8);
  assert.deepEqual(PLAYER_FACE[0][3], HAIR_RGB);
  assert.deepEqual(PLAYER_FACE[7][3], SKIN_RGB);
  assert.deepEqual(PLAYER_FACE[3][2], PUPIL_RGB);
  assert.deepEqual(PLAYER_FACE[3][5], PUPIL_RGB);
  assert.deepEqual(PLAYER_FACE[3][1], WHITE_RGB);
  assert.deepEqual(PLAYER_FACE[3][6], WHITE_RGB);
  const lips = PLAYER_FACE[6].filter((pixel) => pixel === LIP_RGB);
  assert.equal(lips.length, 2);
  assert.deepEqual(PLAYER_FACE[6][0], SKIN_RGB);
  assert.deepEqual(PLAYER_FACE[6][7], SKIN_RGB);
});

test('the head is one textured cube without floating eyes or a smile bar', () => {
  const model = new PlayerModel({ texture: new THREE.Texture() });
  const head = model.root.children.find((child) => child.position.y > 1.4);
  assert.ok(head);
  const extras = [];
  head.traverse((object) => {
    if (object.isMesh && object.material?.type === 'MeshBasicMaterial') extras.push(object);
  });
  assert.equal(extras.length, 0);
  const cube = head.children.find((child) => Array.isArray(child.material));
  assert.ok(cube);
  assert.equal(cube.material.length, 6);
  assert.ok(cube.material[5].map);
});
