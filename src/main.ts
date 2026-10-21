import { Game } from './core/Game.ts';
import { BootScreen } from './ui/BootScreen.ts';

declare global {
  interface Window {
    /** Exposed during development so the game can be inspected from the console. */
    mineboss?: Game;
  }
}

function frame(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => resolve()));
}

async function boot(): Promise<void> {
  const splash = BootScreen.fromDocument();
  splash.set('graphics', 0.14);
  await frame();

  const canvas = document.getElementById('viewport');
  if (!(canvas instanceof HTMLCanvasElement)) {
    splash.fail();
    throw new Error('Missing #viewport canvas element');
  }

  let game: Game;
  try {
    game = new Game(canvas);
  } catch (error) {
    splash.fail();
    console.error('[boot] graphics', error);
    return;
  }

  splash.set('world', 0.78);
  await frame();
  game.loop.start();
  splash.set('world', 0.94);
  await frame();
  await splash.finish();

  if (import.meta.env.DEV) window.mineboss = game;
}

void boot();
