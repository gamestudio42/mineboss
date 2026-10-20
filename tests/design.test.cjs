require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const THREE = require('three');
const { Player } = require('../src/player/Player.ts');
const { PlayerController, movementAxes, isMoving } = require('../src/player/PlayerController.ts');
const { HoldTrigger } = require('../src/core/Input.ts');
const { World } = require('../src/world/World.ts');
const { TerrainGenerator } = require('../src/world/terrain/generator.ts');
const { Block } = require('../src/world/blocks.ts');
const { EntityManager } = require('../src/entities/EntityManager.ts');
const { Minion } = require('../src/entities/boss/Minion.ts');
const { PlayerCombat } = require('../src/player/PlayerCombat.ts');
const { Game } = require('../src/core/Game.ts');
const { saveRun } = require('../src/core/Save.ts');
const { hudChrome, PLAY_HELP_SECONDS } = require('../src/ui/HudChrome.ts');
const { Narrator, spokenText } = require('../src/audio/Narrator.ts');
const { combatCue, spokenCue } = require('../src/ui/CombatCue.ts');
const { loadSettings, saveSettings } = require('../src/core/Settings.ts');

function fakeVoice() {
  return { lines: [], cancels: 0, speak(text) { this.lines.push(text); }, cancel() { this.cancels++; } };
}

const DT = 1 / 60;

function storage() {
  const data = new Map();
  global.localStorage = { getItem: (k) => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: (k) => data.delete(k) };
  return data;
}

function savedRun(mode) {
  return { version: 5, mode, seed: 42, elapsed: 1, deaths: 0, blocksMined: 0, hintedConsumable: false, hintedUpgrade: false, hintedTorch: false,
    player: { x: 0.5, y: 73, z: 0.5, spawnX: 0.5, spawnY: 73, spawnZ: 0.5, yaw: 0, pitch: 0, health: 20, hammer: 0, selected: 0, slots: Array.from({ length: 9 }, () => ({ block: null, count: 0 })) },
    arena: { defeated: false, discovered: false }, oneBlock: { broken: 0, phase: 0 }, edits: [] };
}

function menuGame() {
  const g = Object.create(Game.prototype);
  const calls = [];
  g.hud = { setVisible() {} };
  g.overlay = {
    show(content, primary, secondary) { Object.assign(this, { content, primary, secondary, back: null }); },
    addAction() {},
    setBackAction(action) { this.back = action; },
  };
  g.newGame = (mode, pace) => calls.push(['new', mode, pace]);
  g.setCreative = (on) => calls.push(['creative', on]);
  g.openCatalog = () => calls.push(['catalog']);
  return { g, calls };
}

function world() {
  const w = new World(new TerrainGenerator(42, 'oneblock'));
  for (let x = -1; x <= 1; x++) for (let z = -1; z <= 1; z++) w.ensureChunk(x, z);
  return w;
}

function keys(...held) {
  return { wasPressed: () => false, isDown: (code) => held.includes(code) };
}

function flyer() {
  const w = world();
  const player = new Player();
  player.creative = true;
  player.flying = true;
  player.position.set(0.5, 80, 0.5);
  const controller = new PlayerController(player, w, new THREE.PerspectiveCamera());
  return { player, controller };
}

test('arrow keys move like WASD and count as movement for the session log', () => {
  assert.deepEqual(movementAxes(keys('ArrowUp', 'ArrowRight')), { forward: 1, strafe: 1 });
  assert.deepEqual(movementAxes(keys('KeyS', 'ArrowLeft')), { forward: -1, strafe: -1 });
  assert.equal(isMoving(keys('ArrowDown')), true);
  assert.equal(isMoving(keys('Space')), false);

  const w = world();
  for (let x = -6; x <= 6; x++) for (let z = -6; z <= 6; z++) w.setBlock(x, 72, z, Block.Grass);
  const player = new Player();
  player.position.set(0.5, 73, 0.5);
  player.body.onGround = true;
  const controller = new PlayerController(player, w, new THREE.PerspectiveCamera());
  for (let i = 0; i < 30; i++) controller.update(DT, keys('ArrowUp'));
  assert.ok(player.position.z < -0.8, `arrow walk ended at ${player.position.z}`);
});

test('flight descends with Shift and ignores Ctrl, which would close the tab with W', () => {
  const shift = flyer();
  for (let i = 0; i < 30; i++) shift.controller.update(DT, keys('ShiftLeft'));
  assert.ok(shift.player.position.y < 79, `Shift left the player at ${shift.player.position.y}`);

  const ctrl = flyer();
  for (let i = 0; i < 30; i++) ctrl.controller.update(DT, keys('ControlLeft', 'KeyW'));
  assert.ok(Math.abs(ctrl.player.position.y - 80) < 0.01, `Ctrl moved the player to ${ctrl.player.position.y}`);
  assert.equal(ctrl.player.sprinting, false);
});

test('Tranquila aim assist catches a near miss that Normal still misses, and the hit lands', () => {
  const aimedFor = (gentle) => {
    const entities = new EntityManager(new THREE.Scene());
    const minion = entities.add(new Minion(0.85, 72, -3));
    const player = new Player();
    player.gentle = gentle;
    player.position.set(0, 72, 0);
    const combat = new PlayerCombat(player, entities, { burst() {} }, { play() {} });
    combat.update(DT, { isMouseDown: () => false, wasMousePressed: () => false });
    const missed = combat.aimed === null;
    combat.update(DT, { isMouseDown: () => true, wasMousePressed: () => true });
    return { missed, hurt: minion.health.current < minion.health.max };
  };
  assert.deepEqual(aimedFor(false), { missed: true, hurt: false });
  assert.deepEqual(aimedFor(true), { missed: false, hurt: true });
});

test('a Q drop needs a deliberate hold and a short tap only reports itself', () => {
  const hold = new HoldTrigger(0.4);
  const results = [];
  for (let i = 0; i < 30; i++) results.push(hold.update(true, DT));
  assert.equal(results.filter((value) => value === 'fire').length, 1);
  assert.equal(hold.update(false, DT), null);

  const tap = new HoldTrigger(0.4);
  for (let i = 0; i < 6; i++) assert.equal(tap.update(true, DT), null);
  assert.equal(tap.update(false, DT), 'tap');
  assert.equal(tap.update(false, DT), null);
});

test('a first visit plays straight into free building and OneBlock starts on the short pace', () => {
  storage();
  const { g, calls } = menuGame();
  g.showMenu();
  assert.equal(g.overlay.content.button, '▶ Jogar');
  g.overlay.primary();
  assert.deepEqual(calls, [['new', 'adventure', undefined], ['creative', true], ['catalog']]);

  g.overlay.secondary();
  assert.equal(g.overlay.content.button, '🌳 Aventura');
  assert.equal(typeof g.overlay.back, 'function', 'the mode list can go back to the quick start');

  calls.length = 0;
  g.chooseStyle('oneblock');
  assert.deepEqual(calls, [['new', 'oneblock', 'quick']]);
});

test('a returning player keeps the world list as the main menu', () => {
  storage();
  saveRun(savedRun('oneblock'));
  const { g } = menuGame();
  g.showMenu();
  assert.equal(g.overlay.content.button, '🌳 Aventura');
  assert.equal(g.overlay.back, null);
});

test('free play HUD keeps only the objective and hint once the lesson is over', () => {
  const base = { mode: 'adventure', creative: true, flying: false, fighting: false, tutorialDone: true, elapsed: 600, oneBlockMark: 'Floresta · Ruína: 3/80' };
  assert.deepEqual(hudChrome(base), { phase: '', playHelp: '', flight: '✈ F: voar' });
  assert.equal(hudChrome({ ...base, flying: true }).flight, '✈ Shift desce · F pousa');
  assert.notEqual(hudChrome({ ...base, tutorialDone: false }).playHelp, '');

  const survival = { ...base, creative: false };
  assert.notEqual(hudChrome({ ...survival, elapsed: PLAY_HELP_SECONDS - 1 }).playHelp, '');
  assert.deepEqual(hudChrome(survival), { phase: '', playHelp: '', flight: '' });

  assert.equal(hudChrome({ ...survival, mode: 'oneblock' }).phase, 'Floresta · Ruína: 3/80');
  const fight = hudChrome({ ...base, fighting: true, flying: true });
  assert.equal(fight.flight, '');
  assert.match(fight.playHelp, /pular/);
});

test('the narrator reads clean pt-BR lines, cuts the previous one and never chatters', () => {
  let now = 0;
  const voice = fakeVoice();
  const narrator = new Narrator(voice, () => now);
  assert.equal(narrator.say('✈ Construa do seu jeito · Esc: sua base'), true);
  assert.deepEqual(voice.lines, ['Construa do seu jeito, Esc: sua base']);
  assert.equal(voice.cancels, 1);

  now = 5;
  assert.equal(narrator.say('✈ Construa do seu jeito · Esc: sua base'), false, 'same line inside the repeat window');
  now = 30;
  assert.equal(narrator.say('Construa do seu jeito · Esc: sua base'), true);

  narrator.muted = true;
  assert.equal(narrator.say('Pule a onda!'), false);
  narrator.muted = false;
  narrator.enabled = false;
  assert.equal(narrator.say('Pule a onda!'), false);
  assert.equal(new Narrator(null).say('Pule a onda!'), false, 'browsers without speech stay silent');

  assert.equal(spokenText('BATA AGORA!'), 'Bata agora!');
  assert.equal(spokenText('🔨'), '');
});

test('fight cues are spoken except the neutral waiting line', () => {
  assert.equal(spokenCue(combatCue('slam', undefined, true)), 'Pule a onda!');
  assert.equal(spokenCue(combatCue('stagger', undefined, false)), 'BATA AGORA!');
  assert.equal(spokenCue(combatCue('idle', undefined, false)), null);
  assert.equal(spokenCue(null), null);
});

test('the game speaks a new objective once, not every frame it stays on screen', () => {
  const voice = fakeVoice();
  const g = Object.create(Game.prototype);
  g.narrator = new Narrator(voice, () => 0);
  g.hud = { setObjective() {}, showHint() {} };
  g.guideText = null;
  for (let i = 0; i < 60; i++) g.setGuideObjective('Quebre o bloco infinito');
  g.setGuideObjective(null);
  assert.deepEqual(voice.lines, ['Quebre o bloco infinito']);
});

test('reading aloud is on by default and the choice survives a reload', () => {
  storage();
  assert.equal(loadSettings().narrator, true);
  saveSettings({ ...loadSettings(), narrator: false });
  assert.equal(loadSettings().narrator, false);
});

test('hit-stop keeps the longest freeze instead of stacking hits into a stall', () => {
  const { HitStop, HIT_STOP } = require('../src/combat/HitStop.ts');
  const stop = new HitStop();
  for (let i = 0; i < 5; i++) stop.trigger(HIT_STOP.stagger);
  let frozen = 0;
  while (stop.update(DT)) frozen++;
  assert.equal(frozen, Math.ceil(HIT_STOP.stagger / DT));

  stop.trigger(HIT_STOP.stagger);
  stop.trigger(HIT_STOP.phase);
  stop.trigger(HIT_STOP.stagger);
  frozen = 0;
  while (stop.update(DT)) frozen++;
  assert.equal(frozen, Math.ceil(HIT_STOP.phase / DT));
});

test('a boss phase change and the final blow both freeze the creatures for a beat', () => {
  const { HitStop } = require('../src/combat/HitStop.ts');
  const g = Object.create(Game.prototype);
  const boss = { stateName: 'idle', removed: false };
  Object.assign(g, { hitStop: new HitStop(), lastBossState: null, arena: { boss: null }, ruin: { boss }, grove: { boss: null } });
  g.watchBossBeats();
  assert.equal(g.hitStop.active, false);
  boss.stateName = 'phaseShift';
  g.watchBossBeats();
  assert.equal(g.hitStop.active, true);
  g.hitStop.clear();
  g.watchBossBeats();
  assert.equal(g.hitStop.active, false, 'a state that stays put only freezes once');
  boss.stateName = 'dying';
  g.watchBossBeats();
  assert.equal(g.hitStop.active, true);
});

test('a hit in the stagger window sounds different from a regular hit', () => {
  const soundOf = (multiplier) => {
    const entities = new EntityManager(new THREE.Scene());
    const minion = entities.add(new Minion(0, 72, -2.5));
    minion.damageMultiplier = multiplier;
    const player = new Player();
    player.position.set(0, 72, 0);
    const played = [];
    const combat = new PlayerCombat(player, entities, { burst() {} }, { play: (name) => played.push(name) });
    combat.update(DT, { isMouseDown: () => true, wasMousePressed: () => true });
    return played;
  };
  assert.deepEqual(soundOf(1), ['hit']);
  assert.deepEqual(soundOf(2), ['smash']);
});

test('each hammer tier mines faster than the one before it', () => {
  const { HAMMER } = require('../src/player/Hammer.ts');
  assert.ok(HAMMER[1].mineSpeed > HAMMER[0].mineSpeed);
  assert.ok(HAMMER[2].mineSpeed > HAMMER[1].mineSpeed, 'gold must not feel like a downgrade');
  assert.ok(HAMMER[2].damage > HAMMER[1].damage);
});

function waveScene() {
  const w = world();
  for (let x = -6; x <= 8; x++) for (let z = -4; z <= 4; z++) w.setBlock(x, 72, z, Block.Stone);
  const player = new Player();
  player.position.set(4.5, 73, 0.5);
  player.body.onGround = true;
  const entities = new EntityManager(new THREE.Scene());
  const context = { dt: DT, elapsed: 0, world: w, player, entities, particles: { burst() {} }, sfx: { play() {} }, atlas: { tileColors: [] } };
  return { w, player, entities, context };
}

function runWave(scene) {
  const { Shockwave } = require('../src/entities/boss/attacks/Shockwave.ts');
  const wave = scene.entities.add(new Shockwave({ maxRadius: 12, speed: 8, damage: 3, knockback: 0 }));
  wave.position.set(0.5, 73, 0.5);
  for (let i = 0; i < 120 && wave.outcome === 'pending'; i++) scene.entities.update(scene.context);
  return { outcome: wave.outcome, health: scene.player.health.current };
}

test('a block at the feet between the boss and the player stops the wave', () => {
  const open = waveScene();
  const full = open.player.health.max;
  const hit = runWave(open);
  assert.equal(hit.outcome, 'hit');
  assert.ok(hit.health < full);

  const walled = waveScene();
  walled.w.setBlock(3, 73, 0, Block.Dirt);
  assert.deepEqual(runWave(walled), { outcome: 'blocked', health: full });

  const farAway = waveScene();
  farAway.player.position.set(7.5, 73, 0.5);
  farAway.w.setBlock(2, 73, 0, Block.Dirt);
  assert.equal(runWave(farAway).outcome, 'hit', 'a bump next to the boss is not cover');

  const behind = waveScene();
  behind.w.setBlock(6, 73, 0, Block.Dirt);
  assert.equal(runWave(behind).outcome, 'hit', 'a block behind the player does not help');
});

test('a sheltered player sees the wall cue, quietly, instead of the jump warning', () => {
  const { SHELTER_CUE } = require('../src/ui/CombatCue.ts');
  assert.equal(combatCue('slam', undefined, false, true).text, SHELTER_CUE);
  assert.equal(combatCue('slam', undefined, true, true).text, 'Pule a onda!');
  assert.equal(spokenCue(combatCue('slam', undefined, false, true)), null);
});

test('the practice bonus asks for a wall only with a block in the hotbar and any outcome moves on', () => {
  const { BossPractice, WALL_PREP_SECONDS } = require('../src/entities/boss/BossPractice.ts');
  const run = (withBlock, wall) => {
    const scene = waveScene();
    scene.player.position.set(3.5, 73, 0.5);
    if (withBlock) scene.player.inventory.add(Block.Dirt, 4);
    const hints = [];
    const practice = scene.entities.add(new BossPractice(0.5, 73, 0.5, (text) => hints.push(text), () => {}));
    const step = (seconds) => { for (let t = 0; t < seconds; t += DT) scene.entities.update(scene.context); };
    scene.player.body.onGround = false;
    step(4.5);
    const afterJump = practice.stage;
    scene.player.body.onGround = true;
    if (wall) scene.w.setBlock(2, 73, 0, Block.Dirt);
    for (let t = 0; t < WALL_PREP_SECONDS + 3 && practice.stage === 'wall'; t += DT) scene.entities.update(scene.context);
    return { afterJump, stage: practice.stage, last: hints.at(-1) };
  };
  assert.equal(run(false, false).afterJump, 'circle', 'no block, no bonus');
  const walled = run(true, true);
  assert.equal(walled.afterJump, 'wall');
  assert.equal(walled.stage, 'circle');
  assert.match(walled.last, /O muro segurou a onda/);
  const skipped = run(true, false);
  assert.equal(skipped.stage, 'circle', 'the bonus never blocks the practice');
  assert.match(skipped.last, /muro de blocos segura a onda/);
});

test('the fight suggests a wall once after a wave lands, and only with a block to place', () => {
  const { Shockwave } = require('../src/entities/boss/attacks/Shockwave.ts');
  const g = Object.create(Game.prototype);
  const hints = [];
  const wave = new Shockwave({ maxRadius: 12, speed: 3, damage: 0, knockback: 0 });
  wave.outcome = 'hit';
  Object.assign(g, {
    player: new Player(), hintedWall: false,
    arena: { active: false }, ruin: { active: true }, grove: { active: false },
    entities: { entities: [wave] }, hud: { showHint: (text) => hints.push(text) },
  });
  g.watchWaves();
  assert.equal(hints.length, 0, 'nothing to build with');
  g.player.inventory.add(Block.Dirt, 3);
  g.watchWaves();
  g.watchWaves();
  assert.equal(hints.length, 1);
  assert.match(hints[0], /muro de blocos segura a onda/);
});

function beamRun({ jump = false, wall = false, gentle = false } = {}) {
  const { LightBeam } = require('../src/entities/boss/attacks/LightBeam.ts');
  const scene = waveScene();
  scene.player.gentle = gentle;
  scene.player.position.set(5.5, 73, 0.5);
  if (wall) scene.w.setBlock(4, 73, 0, Block.Dirt);
  const beam = scene.entities.add(new LightBeam({ length: 14, warmUp: 1.1, sweep: 3.2, damage: 5, knockback: 0, color: 0xffffff, startAngle: Math.PI, direction: 1 }));
  beam.position.set(0.5, 73, 0.5);
  let frames = 0, warned = false;
  while (!beam.removed && frames < 60 * 20) {
    scene.player.body.onGround = !(jump && beam.approaching(scene.player.position));
    warned ||= beam.approaching(scene.player.position);
    scene.entities.update(scene.context);
    frames++;
  }
  return { outcome: beam.outcome, hurt: scene.player.health.current < scene.player.health.max, warned, seconds: frames * DT };
}

test('the keeper beam warns, then hits a grounded player unless they jump or hide behind a block', () => {
  const open = beamRun();
  assert.equal(open.outcome, 'hit');
  assert.equal(open.hurt, true);
  assert.equal(open.warned, true, 'the jump cue shows before the pass');
  assert.deepEqual([beamRun({ jump: true }).outcome, beamRun({ jump: true }).hurt], ['jumped', false]);
  assert.deepEqual([beamRun({ wall: true }).outcome, beamRun({ wall: true }).hurt], ['blocked', false]);
});

test('Tranquila slows the beam by the same rule as the bosses', () => {
  const { GENTLE_TIME_SCALE } = require('../src/entities/boss/attacks/LightBeam.ts');
  const normal = beamRun().seconds;
  const gentle = beamRun({ gentle: true }).seconds;
  assert.ok(Math.abs(gentle - normal / GENTLE_TIME_SCALE) < 0.1, `${normal} vs ${gentle}`);
});

test('the Beacon Keeper is the last and toughest short fight, and its beam takes turns with the slam', () => {
  const { BeaconKeeper, BEACON_MAX_HEALTH } = require('../src/entities/boss/BeaconKeeper.ts');
  const { SENTINEL_MAX_HEALTH } = require('../src/entities/boss/RuinSentinel.ts');
  assert.ok(BEACON_MAX_HEALTH > SENTINEL_MAX_HEALTH);
  const keeper = new BeaconKeeper(72);
  keeper.context = { player: { position: new THREE.Vector3(keeper.position.x + 4, 73, keeper.position.z) } };
  assert.equal(keeper.pickAttack(), 'slam');
  keeper.lastAttack = 'slam';
  assert.equal(keeper.pickAttack(), 'beam');
  keeper.lastAttack = 'beam';
  assert.equal(keeper.pickAttack(), 'slam');
  assert.equal(combatCue('beam', undefined, false).text, 'Feixe de luz! Pule ou fique atrás de um bloco');
  assert.equal(combatCue('beam', undefined, false, false, true).text, 'Pule o feixe!');
});

const BOSSES = ['sentinel', 'warden', 'beacon'];

function signWorld(won = {}) {
  const generator = new TerrainGenerator(42, 'adventure');
  generator.applyVictories({ sentinel: false, warden: false, beacon: false, ...won });
  return new World(generator);
}

function signsOf(w, boss) {
  const { victoryBlocks } = require('../src/world/victory.ts');
  const signs = victoryBlocks(boss, (x, z) => w.generator.surfaceHeight(x, z));
  for (const sign of signs) w.ensureChunk(sign.x >> 4, sign.z >> 4);
  return signs;
}

function torchesNear(w, sign) {
  let found = false;
  w.forEachNearbyTorch(sign.x, sign.z, 1, (torch) => { found ||= torch.x === sign.x && torch.y === sign.y && torch.z === sign.z; });
  return found;
}

test('each boss win lights its own structure and the sign survives a reload', () => {
  const { applyVictorySign } = require('../src/world/victory.ts');
  for (const boss of BOSSES) {
    const w = signWorld();
    const signs = signsOf(w, boss);
    assert.ok(signs.length >= 5, `${boss} sign is visible`);
    for (const s of signs) assert.notEqual(w.getBlock(s.x, s.y, s.z), s.id, `${boss} is dark before the win`);

    w.generator.applyVictories({ sentinel: false, warden: false, beacon: false, [boss]: true });
    assert.equal(applyVictorySign(w, boss), signs.length);
    for (const s of signs) assert.equal(w.getBlock(s.x, s.y, s.z), s.id);
    assert.deepEqual(w.exportEdits(), [], 'the save keeps the win flag, not loose blocks');

    const reloaded = signWorld({ [boss]: true });
    for (const s of signsOf(reloaded, boss)) {
      assert.equal(reloaded.getBlock(s.x, s.y, s.z), s.id, `${boss} sign after reload`);
      if (s.id === Block.Torch) assert.ok(torchesNear(reloaded, s), 'reloaded torches still light up');
    }
  }
});

test('a victory sign never replaces or refills a player edit', () => {
  const { applyVictorySign } = require('../src/world/victory.ts');
  for (const boss of BOSSES) {
    const w = signWorld();
    const [placed, mined] = signsOf(w, boss);
    w.setBlock(placed.x, placed.y, placed.z, Block.Planks);
    w.setBlock(mined.x, mined.y, mined.z, Block.Dirt);
    w.setBlock(mined.x, mined.y, mined.z, Block.Air);

    w.generator.applyVictories({ sentinel: false, warden: false, beacon: false, [boss]: true });
    applyVictorySign(w, boss);
    assert.equal(w.getBlock(placed.x, placed.y, placed.z), Block.Planks, `${boss} keeps the player block`);
    assert.equal(w.getBlock(mined.x, mined.y, mined.z), Block.Air, `${boss} keeps the mined cell empty`);

    for (const s of [placed, mined]) w.unloadChunk(s.x >> 4, s.z >> 4);
    for (const s of [placed, mined]) w.ensureChunk(s.x >> 4, s.z >> 4);
    assert.equal(w.getBlock(placed.x, placed.y, placed.z), Block.Planks);
    assert.equal(w.getBlock(mined.x, mined.y, mined.z), Block.Air);
  }
});

test('OneBlock signs wait for their structure, and the saved wins drive the generator', () => {
  const { ENTRANCE, RUIN, GROVE } = require('../src/world/arena.ts');
  const oneBlock = new TerrainGenerator(42, 'oneblock');
  oneBlock.applyVictories({ sentinel: true, warden: true, beacon: true });
  for (const at of [RUIN, ENTRANCE, GROVE]) assert.deepEqual(oneBlock.victorySignsIn(at.x >> 4, at.z >> 4), []);
  oneBlock.applyUnlocks({ ruin: true, shrine: true, cache: false, beacon: true });
  for (const at of [RUIN, GROVE]) assert.ok(oneBlock.victorySignsIn(at.x >> 4, at.z >> 4).length > 0);

  const g = Object.create(Game.prototype);
  g.mode = 'adventure';
  g.world = signWorld();
  g.oneBlock = {};
  g.ruin = { defeated: false };
  g.arena = { defeated: true };
  g.grove = { defeated: true };
  g.syncGeneratorUnlocks();
  assert.deepEqual(g.world.generator.victorySignsIn(RUIN.x >> 4, RUIN.z >> 4), []);
  assert.ok(g.world.generator.victorySignsIn(GROVE.x >> 4, GROVE.z >> 4).length > 0);
  assert.ok(g.world.generator.victorySignsIn(ENTRANCE.x >> 4, ENTRANCE.z >> 4).some(s => s.id === Block.Glowstone));
});

test('a rematch with the Beacon Keeper dims the beacon and the win lights it again', () => {
  const { BeaconKeeper } = require('../src/entities/boss/BeaconKeeper.ts');
  const { GroveEncounter } = require('../src/entities/boss/GroveEncounter.ts');
  const { GROVE } = require('../src/world/arena.ts');
  const { groveFloorY } = require('../src/world/grove.ts');
  const w = signWorld({ beacon: true });
  signsOf(w, 'beacon');
  const floor = groveFloorY(w.generator.surfaceHeight(GROVE.x, GROVE.z));
  assert.equal(w.getBlock(GROVE.x, floor + 6, GROVE.z), Block.Glowstone);

  const keeper = new BeaconKeeper(floor);
  keeper.context = { world: w };
  keeper.clearBeacon();
  for (let y = floor + 1; y <= floor + 7; y++) assert.equal(w.getBlock(GROVE.x, y, GROVE.z), Block.Air, 'nothing floats over the keeper');

  const grove = new GroveEncounter(new EntityManager(new THREE.Scene()), {});
  grove.defeated = true;
  grove.rebuildBeacon(w);
  assert.equal(w.getBlock(GROVE.x, floor + 4, GROVE.z), Block.Glowstone);
  assert.equal(w.getBlock(GROVE.x, floor + 6, GROVE.z), Block.Glowstone);
  assert.equal(w.getBlock(GROVE.x, floor + 7, GROVE.z), Block.Torch);
});
