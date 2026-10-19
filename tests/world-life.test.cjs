require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const { World } = require('../src/world/World.ts');
const { TerrainGenerator } = require('../src/world/terrain/generator.ts');
const { Block } = require('../src/world/blocks.ts');
const { Player } = require('../src/player/Player.ts');
const { EntityManager } = require('../src/entities/EntityManager.ts');
const { Minion } = require('../src/entities/boss/Minion.ts');
const { Game } = require('../src/core/Game.ts');
const { parseSave } = require('../src/core/Save.ts');
const { BuildWatcher, PEN_SETTLE_SECONDS, TOWER_HEIGHT, recognizeBuild } = require('../src/world/builds.ts');
const { ideaCubes } = require('../src/ui/BuildIdeas.ts');
const { Pet, PET_FOLLOW_DISTANCE, PET_HOME_RADIUS, PET_STRAY_SECONDS } = require('../src/entities/Pet.ts');

const DT = 1 / 60;
const Y = 100;

function world() {
  const w = new World(new TerrainGenerator(42, 'oneblock'));
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) w.ensureChunk(x, z);
  return w;
}

/** Places an idea from the build guide, block by block, the way a child follows it. */
function buildIdea(w, watcher, id, stage, ox, oz, color = Block.Planks) {
  const found = [];
  for (const cube of ideaCubes(id, stage)) {
    const x = ox + cube.x, y = Y + cube.y, z = oz + cube.z;
    if (w.getBlock(x, y, z) !== Block.Air) continue;
    const block = cube.color === '#ffd97c' ? Block.Torch : color;
    w.setBlock(x, y, z, block);
    const build = watcher.notice(w, x, y, z);
    if (build) found.push(build.kind);
  }
  return found;
}

test('calm building music uses only pentatonic notes, fights get a faster beat, menus are silent', () => {
  const { musicNotes, musicTheme, MUSIC_LOOP_STEPS, MUSIC_STEP_SECONDS } = require('../src/audio/music.ts');
  const pitchClass = (hz) => ((Math.round(69 + 12 * Math.log2(hz / 440)) % 12) + 12) % 12;
  for (let step = 0; step < MUSIC_LOOP_STEPS.build; step++) {
    for (const note of musicNotes('build', step)) {
      if (note.wave === 'triangle') assert.ok([0, 2, 4, 7, 9].includes(pitchClass(note.frequency)), `step ${step}`);
      assert.ok(note.gain <= 0.08, 'music stays under the sound effects');
    }
    assert.deepEqual(musicNotes('build', step + MUSIC_LOOP_STEPS.build), musicNotes('build', step), 'the theme loops');
  }
  for (let step = 0; step < MUSIC_LOOP_STEPS.boss; step++) assert.ok(musicNotes('boss', step).length >= 1, 'the fight has a steady pulse');
  assert.ok(MUSIC_STEP_SECONDS.boss < MUSIC_STEP_SECONDS.build);
  assert.equal(musicTheme(false, true), null);
  assert.equal(musicTheme(true, false), 'build');
  assert.equal(musicTheme(true, true), 'boss');

  const { Sfx } = require('../src/audio/Sfx.ts');
  const sfx = new Sfx();
  sfx.setMusic('build');
  sfx.updateMusic();
});

test('the music switch is a saved comfort setting, on by default', () => {
  const data = new Map();
  global.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  const { loadSettings, saveSettings } = require('../src/core/Settings.ts');
  assert.equal(loadSettings().music, true);
  saveSettings({ ...loadSettings(), music: false });
  assert.equal(loadSettings().music, false);
});

test('the album recognises the house from the build guide only once the roof is on', () => {
  const w = world();
  const watcher = new BuildWatcher();
  assert.deepEqual(buildIdea(w, watcher, 'house', 1, 4, 4), [], 'walls alone are not a house');
  assert.deepEqual(buildIdea(w, watcher, 'house', 2, 4, 4), ['house']);
  assert.equal(watcher.update(w, PEN_SETTLE_SECONDS + 1), null, 'a house never turns into a pen');
  assert.deepEqual([...watcher.found], ['house']);
});

test('a tower is six placed blocks high, and only the player\'s blocks count', () => {
  const w = world();
  for (let i = 0; i < TOWER_HEIGHT - 1; i++) w.setBlock(20, Y + i, 20, Block.Cobblestone);
  assert.equal(recognizeBuild(w, 20, Y + TOWER_HEIGHT - 2, 20), null);
  w.setBlock(20, Y + TOWER_HEIGHT - 1, 20, Block.Cobblestone);
  assert.equal(recognizeBuild(w, 20, Y + TOWER_HEIGHT - 1, 20).kind, 'tower');

  for (let i = 0; i < 8; i++) w.restoreStructure(24, Y + i, 20, Block.Cobblestone);
  assert.equal(recognizeBuild(w, 24, Y + 7, 20), null, 'generated pillars are not towers');
});

test('a fenced pen enters the album after it settles, but the first ring of a house does not', () => {
  const w = world();
  const pen = new BuildWatcher();
  assert.deepEqual(buildIdea(w, pen, 'pen', 2, 4, 4, Block.Log), [], 'a pen waits to settle');
  const settled = pen.update(w, PEN_SETTLE_SECONDS + 0.1);
  assert.equal(settled.kind, 'pen');
  assert.ok(settled.x >= 5 && settled.x <= 7 && settled.z >= 5 && settled.z <= 7, 'the pet home is inside the fence');

  const house = new BuildWatcher();
  const ring = ideaCubes('house', 1).filter(cube => cube.y <= 1);
  const rest = ideaCubes('house', 1).filter(cube => cube.y > 1);
  for (const cube of ideaCubes('house', 0)) w.setBlock(14 + cube.x, Y + cube.y, 4 + cube.z, Block.Planks);
  for (const cube of ring) { w.setBlock(14 + cube.x, Y + cube.y, 4 + cube.z, Block.Blue); house.notice(w, 14 + cube.x, Y + cube.y, 4 + cube.z); }
  house.update(w, PEN_SETTLE_SECONDS / 2);
  for (const cube of rest) { w.setBlock(14 + cube.x, Y + cube.y, 4 + cube.z, Block.Blue); house.notice(w, 14 + cube.x, Y + cube.y, 4 + cube.z); }
  assert.equal(house.update(w, PEN_SETTLE_SECONDS), null, 'raised walls cancel the pen');
  assert.equal(house.found.has('pen'), false);

  const generated = new BuildWatcher();
  for (const cube of ideaCubes('pen', 1)) w.restoreStructure(4 + cube.x, Y + cube.y, 14 + cube.z, Block.Log);
  generated.notice(w, 4, Y + 1, 14);
  assert.equal(generated.update(w, PEN_SETTLE_SECONDS + 1), null, 'only fences the player built count');
});

test('the album gathers builds, trophies and island goals without adding new tasks', () => {
  const { albumSections, albumCount, buildFoundText, PET_ARRIVED_TEXT } = require('../src/ui/Album.ts');
  const { VICTORY_SIGN_TEXT } = require('../src/world/victory.ts');
  const adventure = albumSections({ builds: new Set(['pen']), trophies: new Set([Block.WardenTrophy]), pet: true, islandGoals: null });
  assert.deepEqual(adventure.map(s => s.title), ['Construções', 'Troféus']);
  assert.deepEqual(albumCount(adventure), { done: 2, total: 6 });
  assert.equal(adventure[0].items.find(i => i.label === 'Curral').detail, 'Curral com um bichinho');
  assert.equal(adventure[1].items.find(i => i.label === 'Guardião').detail, VICTORY_SIGN_TEXT.warden);

  const island = albumSections({ builds: new Set(), trophies: new Set(), pet: false, islandGoals: [
    { label: 'Amplie a ilha: 8 blocos de chão', current: 3, target: 8, done: false, reward: '16 Tábuas' },
  ] });
  assert.equal(island[2].title, 'Metas da ilha');
  assert.equal(island[2].items[0].detail, '3/8 · prêmio: 16 Tábuas');
  assert.ok(buildFoundText('pen', true).endsWith(PET_ARRIVED_TEXT));
  assert.match(buildFoundText('house', false), /álbum/);
});

function petScene() {
  const w = world();
  for (let x = 0; x < 30; x++) for (let z = 0; z < 30; z++) w.setBlock(x, Y - 1, z, Block.Planks);
  const player = new Player();
  player.position.set(25.5, Y, 25.5);
  player.body.onGround = true;
  const entities = new EntityManager(new THREE.Scene());
  const pet = entities.add(new Pet({ x: 3.5, y: Y, z: 3.5 }));
  const context = { dt: DT, elapsed: 0, world: w, player, entities, particles: { burst() {} }, sfx: { play() {} }, atlas: { tileColors: [] } };
  const run = (seconds) => { for (let t = 0; t < seconds; t += DT) { context.elapsed += DT; entities.update(context); } };
  return { w, player, entities, pet, run };
}

test('the pet follows the player, waits at home, catches up after a teleport and never gets hurt', () => {
  const { player, entities, pet, run } = petScene();
  pet.following = true;
  run(8);
  const gap = () => Math.hypot(player.position.x - pet.position.x, player.position.z - pet.position.z);
  assert.ok(gap() <= PET_FOLLOW_DISTANCE + 0.6, `trots to the player (${gap().toFixed(2)})`);

  pet.following = false;
  run(10);
  assert.ok(Math.hypot(pet.position.x - 3.5, pet.position.z - 3.5) <= PET_HOME_RADIUS + 0.6, 'walks back home');

  pet.following = true;
  player.position.set(28.5, Y, 1.5);
  run(DT);
  player.position.set(28.5 + 40, Y, 1.5);
  run(DT);
  assert.ok(gap() < 1, 'catches up when far away');

  assert.equal(pet.team, 'neutral');
  assert.ok(!(pet instanceof Minion), 'boss and island mob counts ignore the pet');
  assert.equal(pet.health.damage(50), false);
  const eye = new THREE.Vector3(pet.position.x - 2, pet.position.y + 0.4, pet.position.z);
  assert.equal(entities.raycast(eye, new THREE.Vector3(1, 0, 0), 4, 'boss'), null, 'the hammer never aims at it');
  assert.equal(entities.raycast(eye, new THREE.Vector3(1, 0, 0), 4, 'neutral').entity, pet);
});

test('a one-block fence keeps the waiting pet in, and a pet left outside finds its way home', () => {
  const { w, pet, run } = petScene();
  // The smallest pen the album accepts: two by two, so the fence is a step away from home.
  for (let x = 2; x <= 5; x++) for (let z = 2; z <= 5; z++) {
    if ((x === 2 || x === 5 || z === 2 || z === 5) && !(x === 4 && z === 5)) w.setBlock(x, Y, z, Block.Log);
  }
  // Every wander target sits at the edge of the home circle, past the fence.
  const picks = [0.25, 0.75, 0, 0.5, 0.125, 0.375, 0.625, 0.875];
  let draw = 0;
  const random = Math.random;
  Math.random = () => { const slot = draw++ % 3; return slot === 0 ? 0 : slot === 1 ? picks[Math.floor(draw / 3) % picks.length] : 0.999; };
  try {
    for (let t = 0; t < 60; t += DT) {
      run(DT);
      assert.ok(pet.position.y < Y + 0.5, `never climbs the fence (t=${t.toFixed(2)})`);
      assert.ok(pet.position.x > 3 && pet.position.x < 5 && pet.position.z > 3 && pet.position.z < 5, `stays in the pen (t=${t.toFixed(2)})`);
    }
  } finally {
    Math.random = random;
  }

  // Sent off to follow and then back home from right outside the fence.
  const leaveFor = (x, z) => { pet.following = true; run(DT); pet.position.set(x, Y, z); pet.velocity.set(0, 0, 0); pet.following = false; };
  const home = () => Math.hypot(pet.position.x - 3.5, pet.position.z - 3.5);
  leaveFor(1.5, 3.5);
  run(4);
  assert.ok(home() <= PET_HOME_RADIUS + 0.6 && pet.position.x > 3, `climbs back in (${home().toFixed(2)})`);

  for (let y = Y; y <= Y + 1; y++) for (let i = 13; i <= 16; i++) {
    w.setBlock(i, y, 13, Block.Cobblestone); w.setBlock(i, y, 16, Block.Cobblestone);
    w.setBlock(13, y, i, Block.Cobblestone); w.setBlock(16, y, i, Block.Cobblestone);
  }
  leaveFor(14.5, 14.5);
  run(PET_STRAY_SECONDS - 1);
  assert.ok(home() > 5, 'walled in, it cannot walk back');
  run(2);
  assert.ok(home() <= PET_HOME_RADIUS + 0.6, 'so it pops back home');
});

function petGame() {
  const g = Object.create(Game.prototype);
  const hints = [];
  const w = world();
  for (let x = 0; x < 12; x++) for (let z = 0; z < 12; z++) w.setBlock(x, Y - 1, z, Block.Planks);
  let aim = new THREE.Vector3(1, 0, 0);
  Object.assign(g, {
    world: w, entities: new EntityManager(new THREE.Scene()), hud: { showHint(text) { hints.push(text); } }, sfx: { play() {} },
    arena: { active: false }, ruin: { active: false }, grove: { active: false }, practice: null, interaction: { target: null },
    petHome: null, petFollowing: false, pet: null, saveSoon: false,
    player: { gentle: false, startSwing() {}, getEyePosition(v) { v.set(2.5, Y + 0.4, 6.5); }, getForward(v) { v.copy(aim); } },
  });
  return { g, hints, aimAt: (v) => { aim = v; } };
}

test('a new pen brings a pet that a right click sends to follow or to wait, and it stays home in fights', () => {
  const { PET_ARRIVED_TEXT } = require('../src/ui/Album.ts');
  const { g, hints, aimAt } = petGame();
  g.celebrateBuild({ kind: 'pen', x: 5, y: Y, z: 6 });
  assert.ok(hints.at(-1).endsWith(PET_ARRIVED_TEXT));
  g.tendPet();
  assert.ok(g.pet instanceof Pet);
  assert.equal(g.pet.following, false, 'it starts at home');

  assert.equal(g.tapPet(), true);
  assert.equal(g.petFollowing, true);
  g.tendPet();
  assert.equal(g.pet.following, true);
  g.ruin.active = true;
  g.tendPet();
  assert.equal(g.pet.following, false, 'it waits while a boss fight is on');
  assert.equal(g.tapPet(), false);
  g.ruin.active = false;

  aimAt(new THREE.Vector3(-1, 0, 0));
  assert.equal(g.tapPet(), false, 'a click elsewhere still places blocks');
  aimAt(new THREE.Vector3(1, 0, 0));
  g.interaction.target = { distance: 1 };
  assert.equal(g.tapPet(), false, 'a block in front of the pet takes the click');

  g.entities.clear();
  g.tendPet();
  assert.ok(g.pet && !g.pet.removed, 'it comes back after a death or a reload clears entities');

  g.celebrateBuild({ kind: 'pen', x: 9, y: Y, z: 9 });
  assert.deepEqual(g.petHome, { x: 5.5, y: Y, z: 6.5 }, 'one pet, in the first pen');
});

test('a right click on the pet never places a block, even when held', () => {
  const { BlockInteraction } = require('../src/player/BlockInteraction.ts');
  const w = world();
  for (let x = 0; x < 8; x++) for (let z = 0; z < 8; z++) w.setBlock(x, 72, z, Block.Planks);
  const player = new Player();
  player.position.set(3.5, 73, 5.5); player.pitch = -0.7; player.creative = true; player.inventory.unlimited = true; player.inventory.add(Block.Blue, 64);
  const action = new BlockInteraction(player, w, { tileColors: [] }, { burst() {} }, { play() {} }, new THREE.Scene());
  let taps = 0, placed = 0;
  action.onEntityUse = () => { taps++; return true; };
  action.onBlockPlaced = () => placed++;
  const click = (held) => ({ mouseDX: 0, mouseDY: 0, wasPressed: () => false, isDown: () => false, isMouseDown: b => held && b === 2, wasMousePressed: b => !held && b === 2 });
  action.update(DT, click(false), false);
  for (let i = 0; i < 90; i++) action.update(DT, click(true), false);
  assert.equal(taps, 1);
  assert.equal(placed, 0);
  action.onEntityUse = () => false;
  action.update(DT, { ...click(false), isMouseDown: () => false, wasMousePressed: () => false }, false);
  action.update(DT, click(false), false);
  assert.equal(placed, 1, 'once released, a normal click places again');
});

test('builds and the pet are saved with the world and validated on import', () => {
  const base = { version: 5, mode: 'adventure', seed: 42, elapsed: 1, deaths: 0, blocksMined: 0, hintedConsumable: false, hintedUpgrade: false, hintedTorch: false,
    player: { x: 0.5, y: 73, z: 0.5, spawnX: 0.5, spawnY: 73, spawnZ: 0.5, yaw: 0, pitch: 0, health: 20, hammer: 0, selected: 0, slots: Array.from({ length: 9 }, () => ({ block: null, count: 0 })) },
    arena: { defeated: false, discovered: false }, oneBlock: { broken: 0, phase: 0 }, edits: [] };
  const saved = parseSave(JSON.stringify({ ...base, builds: ['house', 'pen'], pet: { x: 5.5, y: 100, z: 6.5, following: true } }));
  assert.deepEqual(saved.builds, ['house', 'pen']);
  assert.equal(saved.pet.following, true);
  assert.equal(parseSave(JSON.stringify({ ...base, builds: ['castle!'] })), null);
  assert.equal(parseSave(JSON.stringify({ ...base, pet: { x: 'a', y: 1, z: 1, following: false } })), null);
  assert.ok(parseSave(JSON.stringify(base)), 'older saves without an album still load');

  const watcher = new BuildWatcher();
  watcher.load(['tower', 'nonsense']);
  assert.deepEqual([...watcher.found], ['tower']);
});
