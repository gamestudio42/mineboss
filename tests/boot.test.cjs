require('./register.cjs');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { BOOT_LABEL, bootPercent } = require('../src/ui/BootScreen.ts');

const root = path.join(__dirname, '..');

test('the page ships a splash that matches the Urbe boot pattern', () => {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  assert.match(html, /id="boot-screen"/);
  assert.match(html, /data-testid="boot-screen"/);
  assert.match(html, /data-testid="boot-step"/);
  assert.match(html, /MINEBOSS/);
  assert.match(html, /Carregando…/);
  assert.match(html, /favicon\.svg/);
  assert.match(html, /theme-color" content="#05070c"/);
  assert.match(html, /id="overlay" class="hidden"/);
  assert.match(html, /data-testid="main-menu"/);

  const css = fs.readFileSync(path.join(root, 'src/styles.css'), 'utf8');
  assert.match(css, /\.boot-screen/);
  assert.match(css, /\.boot-screen\.leaving/);
  assert.match(css, /prefers-reduced-motion/);

  const icon = fs.readFileSync(path.join(root, 'public/favicon.svg'), 'utf8');
  assert.match(icon, /<svg/);
  assert.match(icon, /#ffb347/);
});

test('boot copy and progress stay in range', () => {
  assert.equal(BOOT_LABEL.graphics, 'Preparando os gráficos…');
  assert.equal(BOOT_LABEL.world, 'Abrindo o terreno…');
  assert.equal(BOOT_LABEL.done, 'Pronto');
  assert.equal(bootPercent(-1), 0);
  assert.equal(bootPercent(0.15), 15);
  assert.equal(bootPercent(2), 100);
});

test('the entry point fades the splash before handing off to the menu', () => {
  const main = fs.readFileSync(path.join(root, 'src/main.ts'), 'utf8');
  assert.match(main, /BootScreen/);
  assert.match(main, /async function boot/);
  assert.match(main, /splash\.finish/);
  assert.match(main, /splash\.fail/);
});
