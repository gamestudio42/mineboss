require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  SessionLog,
  parseSession,
  SESSION_EVENT_CAP,
  SESSION_IDLE_SECONDS,
  SESSION_PERF_INTERVAL,
} = require('../src/core/SessionLog.ts');

function storage() {
  const data = new Map();
  global.localStorage = {
    getItem: key => data.get(key) ?? null,
    setItem: (key, value) => { data.set(key, value); },
    removeItem: key => { data.delete(key); },
  };
  return data;
}

const context = {
  mode: 'adventure',
  creative: true,
  gentle: true,
  quality: 'balanced',
  reducedMotion: false,
};

function diary(now = () => 0) {
  storage();
  return new SessionLog(now);
}

test('disabled log records nothing', () => {
  const log = diary();
  log.record('block_placed', { block: 'Dirt' });
  log.observe({ dt: 1, playing: true, locked: true, moving: true, looking: true, fps: 60 });
  assert.equal(log.events.length, 0);
  assert.equal(log.enabled, false);
});

test('first move, first look and idle each record once per stretch', () => {
  let now = 0;
  const log = diary(() => now);
  log.enable();
  log.begin(context);
  log.observe({ dt: 0.05, playing: true, locked: true, moving: true, looking: false, fps: 60 });
  log.observe({ dt: 0.05, playing: true, locked: true, moving: true, looking: false, fps: 60 });
  log.observe({ dt: 0.05, playing: true, locked: true, moving: false, looking: true, fps: 60 });
  log.observe({ dt: 0.05, playing: true, locked: true, moving: false, looking: true, fps: 60 });
  assert.equal(log.events.filter(event => event.type === 'first_move').length, 1);
  assert.equal(log.events.filter(event => event.type === 'first_look').length, 1);

  const idleFrames = Math.ceil(SESSION_IDLE_SECONDS / 0.25) + 1;
  for (let i = 0; i < idleFrames; i++) {
    now = 1000 + i * 250;
    log.observe({ dt: 0.25, playing: true, locked: true, moving: false, looking: false, fps: 60 });
  }
  assert.equal(log.events.filter(event => event.type === 'idle' && event.active === true).length, 1);
  now += 250;
  log.observe({ dt: 0.25, playing: true, locked: true, moving: true, looking: false, fps: 60 });
  assert.equal(log.events.filter(event => event.type === 'idle' && event.active === false).length, 1);
});

test('the same objective or panel in a row is stored once', () => {
  const log = diary();
  log.enable();
  log.begin(context);
  log.record('objective', { text: 'Encontre o Sentinela' });
  log.record('objective', { text: 'Encontre o Sentinela' });
  log.record('panel', { id: 'pause' });
  log.record('panel', { id: 'pause' });
  log.record('panel', { id: 'catalog' });
  log.record('objective', { text: 'Encontre o Sentinela' });
  assert.equal(log.events.filter(event => event.type === 'objective').length, 2);
  assert.equal(log.events.filter(event => event.type === 'panel').length, 2);
});

test('the cap omits blocks and still keeps a mark, mouse failure and save failure', () => {
  const log = diary();
  log.enable();
  log.begin(context);
  const room = SESSION_EVENT_CAP - log.events.length;
  for (let i = 0; i < room; i++) log.record('block_placed', { block: 'Dirt' });
  assert.equal(log.events.length, SESSION_EVENT_CAP);
  const omittedBefore = log.omitted;
  log.record('block_placed', { block: 'Planks' });
  log.record('block_removed', { block: 'Stone' });
  assert.ok(log.omitted > omittedBefore);
  assert.equal(log.events.some(event => event.block === 'Planks'), false);
  log.record('mark', { kind: 'help', objective: 'Encontre o Sentinela' });
  log.record('pointer_lock', { ok: false });
  log.record('save', { ok: false });
  assert.ok(log.events.some(event => event.type === 'mark' && event.kind === 'help'));
  assert.ok(log.events.some(event => event.type === 'pointer_lock' && event.ok === false));
  assert.ok(log.events.some(event => event.type === 'save' && event.ok === false));
  const summary = log.summary();
  assert.ok(summary.blocksPlaced > SESSION_EVENT_CAP - 2);
  assert.equal(summary.helpMarks, 1);
});

test('summary answers the observation checklist from the events', () => {
  let now = 0;
  const log = diary(() => now);
  log.enable();
  log.begin(context);
  log.record('pointer_lock', { ok: true });
  now = 1200;
  log.record('first_move');
  now = 1800;
  log.record('first_look');
  log.record('lesson', { step: 1 });
  log.record('lesson', { step: 'done' });
  log.record('block_placed', { block: 'Planks' });
  log.record('block_removed', { block: 'Dirt' });
  log.record('craft', { recipe: 'torch' });
  log.record('practice', { action: 'start' });
  log.record('encounter', { action: 'start', boss: 'sentinel' });
  log.record('death');
  log.record('save', { ok: true });
  log.record('loaded');
  log.record('mark', { kind: 'help' });
  log.record('mark', { kind: 'cheer' });
  log.record('mark', { kind: 'quit' });
  now = 30_000;
  for (let i = 0; i < 2; i++) {
    log.observe({
      dt: SESSION_PERF_INTERVAL,
      playing: true,
      locked: true,
      moving: true,
      looking: false,
      fps: 50 + i * 10,
    });
  }
  const summary = log.summary();
  assert.equal(summary.pointerLocked, true);
  assert.equal(summary.timeToMove, 1.2);
  assert.equal(summary.timeToLook, 1.8);
  assert.equal(summary.lessonDone, true);
  assert.equal(summary.blocksPlaced, 1);
  assert.equal(summary.blocksRemoved, 1);
  assert.equal(summary.crafted, true);
  assert.equal(summary.practice, true);
  assert.equal(summary.encounter, true);
  assert.equal(summary.deaths, 1);
  assert.equal(summary.saved, true);
  assert.equal(summary.reloaded, true);
  assert.equal(summary.helpMarks, 1);
  assert.equal(summary.cheerMarks, 1);
  assert.equal(summary.quitMarks, 1);
  assert.ok(summary.medianFps !== null);
});

test('invalid JSON and coordinate payloads are rejected', () => {
  assert.equal(parseSession('{'), null);
  assert.equal(parseSession('null'), null);
  assert.equal(parseSession(JSON.stringify({
    version: 1,
    startedAt: null,
    context: null,
    events: [{ t: 0, type: 'block_placed', x: 3, y: 70, z: 1 }],
    omitted: 0,
  })), null);
});

test('a quota failure keeps the in-memory diary available to export', () => {
  storage();
  const log = new SessionLog(() => 0);
  log.enable();
  log.begin(context);
  const write = localStorage.setItem;
  localStorage.setItem = () => { throw new Error('quota'); };
  log.record('block_placed', { block: 'Dirt' });
  localStorage.setItem = write;
  const exported = log.toExport();
  assert.ok(exported.events.some(event => event.type === 'block_placed'));
  assert.equal(parseSession(JSON.stringify(exported))?.events.some(event => event.type === 'block_placed'), true);
});

test('the exported file has no coordinates or mouse deltas', () => {
  const log = diary();
  log.enable();
  log.begin(context);
  log.record('block_placed', { block: 'Dirt' });
  log.record('first_look');
  log.record('mark', { kind: 'help', objective: 'Construa do seu jeito' });
  const raw = JSON.stringify(log.toExport());
  assert.equal(/"x"\s*:/.test(raw), false);
  assert.equal(/"y"\s*:/.test(raw), false);
  assert.equal(/"z"\s*:/.test(raw), false);
  assert.equal(raw.includes('mouseDX'), false);
  assert.equal(raw.includes('mouseDY'), false);
  const parsed = parseSession(raw);
  assert.ok(parsed);
  assert.equal(parsed.version, 1);
  assert.equal(parsed.context.mode, 'adventure');
});

test('the recording toggle survives a new SessionLog on the same origin', () => {
  storage();
  const first = new SessionLog(() => 0);
  first.enable();
  const second = new SessionLog(() => 0);
  assert.equal(second.enabled, true);
  assert.equal(second.events.length, 0);
});
