import { Game } from './core/Game.ts';

declare global {
  interface Window {
    /** Exposed during development so the game can be inspected from the console. */
    mineboss?: Game;
  }
}

const canvas = document.getElementById('viewport');
if (!(canvas instanceof HTMLCanvasElement)) {
  throw new Error('Missing #viewport canvas element');
}

const game = new Game(canvas);
game.loop.start();

if (import.meta.env.DEV) window.mineboss = game;
