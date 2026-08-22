import * as THREE from 'three';

import { mulberry32 } from '../core/math.ts';
import { ATLAS_SIZE_PX, ATLAS_TILE_PX, ATLAS_TILES_PER_ROW, Tile } from '../world/blocks.ts';

type RGB = [number, number, number];
type SetPixel = (x: number, y: number, color: RGB) => void;
type Painter = (set: SetPixel, rng: () => number) => void;

const S = ATLAS_TILE_PX;

function shade([r, g, b]: RGB, amount: number): RGB {
  return [r + amount, g + amount, b + amount];
}

function jitter(color: RGB, rng: () => number, amount: number): RGB {
  return shade(color, (rng() - 0.5) * amount);
}

function fill(color: RGB, amount: number): Painter {
  return (set, rng) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) set(x, y, jitter(color, rng, amount));
    }
  };
}

function combine(...painters: Painter[]): Painter {
  return (set, rng) => {
    for (const painter of painters) painter(set, rng);
  };
}

/** Scatters rounded clusters, used for ore veins and pebbles. */
function speckles(color: RGB, count: number, radius: number, variance: number): Painter {
  return (set, rng) => {
    for (let i = 0; i < count; i++) {
      const cx = rng() * S;
      const cy = rng() * S;
      const r = radius * (0.6 + rng() * 0.8);
      for (let y = Math.floor(cy - r); y <= cy + r; y++) {
        for (let x = Math.floor(cx - r); x <= cx + r; x++) {
          if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) continue;
          set((x + S) % S, (y + S) % S, jitter(color, rng, variance));
        }
      }
    }
  };
}

function bricks(base: RGB, mortar: RGB): Painter {
  return (set, rng) => {
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const row = Math.floor(y / 8);
        const offset = row % 2 === 0 ? 0 : 8;
        const onMortar = y % 8 === 0 || (x + offset) % 16 === 0 || (x + offset) % 16 === 8;
        set(x, y, jitter(onMortar ? mortar : base, rng, onMortar ? 6 : 16));
      }
    }
  };
}

/** Grass fringe dripping over a dirt side face. */
const grassSide: Painter = (set, rng) => {
  const dirt: RGB = [134, 96, 67];
  const grass: RGB = [92, 150, 66];
  for (let x = 0; x < S; x++) {
    const fringe = 3 + Math.floor(rng() * 3);
    for (let y = 0; y < S; y++) {
      set(x, y, jitter(y < fringe ? grass : dirt, rng, y < fringe ? 22 : 26));
    }
  }
};

const logTop: Painter = (set, rng) => {
  const light: RGB = [166, 132, 84];
  const dark: RGB = [120, 92, 54];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const d = Math.hypot(x - 7.5, y - 7.5);
      const ring = Math.sin(d * 1.9) > 0 ? light : dark;
      set(x, y, jitter(ring, rng, 14));
    }
  }
};

const logSide: Painter = (set, rng) => {
  const bark: RGB = [104, 78, 47];
  for (let x = 0; x < S; x++) {
    const streak = Math.sin(x * 1.7) * 12;
    for (let y = 0; y < S; y++) set(x, y, jitter(shade(bark, streak), rng, 18));
  }
};

const leaves: Painter = (set, rng) => {
  const base: RGB = [58, 110, 48];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const clump = (Math.sin(x * 1.3) + Math.cos(y * 1.7)) * 10;
      set(x, y, jitter(shade(base, clump), rng, 40));
    }
  }
};

const planks: Painter = (set, rng) => {
  const base: RGB = [163, 124, 74];
  for (let y = 0; y < S; y++) {
    const seam = y % 4 === 0;
    for (let x = 0; x < S; x++) {
      set(x, y, jitter(shade(base, seam ? -34 : 0), rng, seam ? 8 : 18));
    }
  }
};

const bed: Painter = (set, rng) => {
  const cloth: RGB = [168, 62, 58];
  const stitch: RGB = [214, 196, 168];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const seam = y % 5 === 0 || x === 0 || x === S - 1;
      set(x, y, jitter(seam ? stitch : cloth, rng, seam ? 10 : 18));
    }
  }
};

const bedEnd: Painter = (set, rng) => {
  const cloth: RGB = [168, 62, 58];
  const pillow: RGB = [232, 220, 198];
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const onPillow = y < 6;
      set(x, y, jitter(onPillow ? pillow : cloth, rng, 16));
    }
  }
};

const lava: Painter = (set, rng) => {
  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const flow = Math.sin(x * 0.8 + y * 0.5) + Math.cos(y * 1.1);
      const hot = flow > 0.4;
      set(x, y, jitter(hot ? [252, 186, 62] : [206, 74, 20], rng, 26));
    }
  }
};

/** Dark stone carved with a glowing rune; marks the summoning altar. */
function runic(glyph: 'top' | 'side'): Painter {
  return (set, rng) => {
    const stone: RGB = [46, 44, 56];
    const rune: RGB = [176, 120, 246];
    for (let y = 0; y < S; y++) {
      for (let x = 0; x < S; x++) {
        const cx = x - 7.5;
        const cy = y - 7.5;
        const onGlyph =
          glyph === 'top'
            ? Math.abs(Math.abs(cx) - Math.abs(cy)) < 1.2 && Math.abs(cx) < 6
            : (Math.abs(cx) < 1.2 && Math.abs(cy) < 5) || (Math.abs(cy) < 1.2 && Math.abs(cx) < 5);
        set(x, y, jitter(onGlyph ? rune : stone, rng, onGlyph ? 30 : 12));
      }
    }
  };
}

/** Side-on torch: a thin oak stick under a bright flame, used as the hotbar icon. */
const torchStick: Painter = (set, rng) => {
  const empty: RGB = [18, 16, 14];
  const wood: RGB = [132, 90, 46];
  const woodDark: RGB = [86, 56, 28];
  const flame: RGB = [244, 148, 42];
  const flameHot: RGB = [255, 228, 110];

  for (let y = 0; y < S; y++) {
    for (let x = 0; x < S; x++) {
      const cx = Math.abs(x - 7.5);
      const onStick = y >= 6 && cx < 1.6;
      const onFlame = y < 7 && cx < 2.8 - y * 0.18;
      if (onFlame) set(x, y, jitter(y < 3 ? flameHot : flame, rng, 28));
      else if (onStick) set(x, y, jitter(cx < 0.7 ? wood : woodDark, rng, 16));
      else set(x, y, empty);
    }
  }
};

const PAINTERS: Record<Tile, Painter> = {
  [Tile.Stone]: fill([128, 128, 132], 22),
  [Tile.Dirt]: fill([134, 96, 67], 28),
  [Tile.GrassTop]: combine(fill([92, 150, 66], 30), speckles([112, 172, 78], 6, 2, 20)),
  [Tile.GrassSide]: grassSide,
  [Tile.Sand]: fill([219, 205, 150], 20),
  [Tile.Gravel]: combine(fill([120, 116, 114], 26), speckles([158, 152, 148], 10, 2, 24)),
  [Tile.Cobblestone]: combine(fill([98, 98, 102], 14), speckles([138, 138, 142], 9, 2.6, 26)),
  [Tile.LogSide]: logSide,
  [Tile.LogTop]: logTop,
  [Tile.Leaves]: leaves,
  [Tile.Planks]: planks,
  [Tile.CoalOre]: combine(fill([128, 128, 132], 22), speckles([36, 34, 38], 4, 2.2, 18)),
  [Tile.IronOre]: combine(fill([128, 128, 132], 22), speckles([206, 158, 120], 4, 2.2, 22)),
  [Tile.GoldOre]: combine(fill([128, 128, 132], 22), speckles([238, 200, 74], 4, 2.1, 26)),
  [Tile.CrystalOre]: combine(fill([104, 100, 118], 20), speckles([158, 226, 246], 5, 2.3, 34)),
  [Tile.Bedrock]: combine(fill([64, 64, 68], 30), speckles([38, 38, 42], 8, 2.4, 20)),
  [Tile.Lava]: lava,
  [Tile.Obsidian]: combine(fill([32, 24, 46], 14), speckles([64, 48, 90], 5, 2, 18)),
  [Tile.RunicTop]: runic('top'),
  [Tile.RunicSide]: runic('side'),
  [Tile.DarkBrick]: bricks([58, 56, 66], [38, 36, 46]),
  [Tile.Glowstone]: combine(fill([228, 190, 96], 20), speckles([255, 240, 176], 7, 2.2, 24)),
  [Tile.Mushroom]: combine(fill([168, 42, 38], 18), speckles([236, 226, 210], 6, 1.8, 14)),
  [Tile.Torch]: torchStick,
  [Tile.TorchFlame]: combine(fill([236, 132, 36], 20), speckles([255, 226, 96], 5, 2.2, 28)),
  [Tile.Water]: combine(fill([38, 108, 186], 14), speckles([120, 198, 236], 7, 2.6, 28)),
  [Tile.Bed]: bed,
  [Tile.BedEnd]: bedEnd,
};

export interface BlockAtlas {
  texture: THREE.CanvasTexture;
  canvas: HTMLCanvasElement;
  /** Average colour of every tile, used to tint particles and UI. */
  tileColors: THREE.Color[];
}

function averageTileColors(ctx: CanvasRenderingContext2D): THREE.Color[] {
  const colors: THREE.Color[] = [];

  for (const key of Object.keys(PAINTERS)) {
    const tile = Number(key);
    const image = ctx.getImageData(
      (tile % ATLAS_TILES_PER_ROW) * S,
      Math.floor(tile / ATLAS_TILES_PER_ROW) * S,
      S,
      S,
    );

    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < image.data.length; i += 4) {
      r += image.data[i];
      g += image.data[i + 1];
      b += image.data[i + 2];
    }

    const pixels = image.data.length / 4;
    colors[tile] = new THREE.Color(r / pixels / 255, g / pixels / 255, b / pixels / 255);
  }

  return colors;
}

/**
 * Builds the block texture atlas at runtime, which keeps the repository free
 * of binary assets. Mipmaps are disabled so neighbouring tiles can never bleed
 * into each other and the look stays crisp.
 */
export function createBlockAtlas(): BlockAtlas {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_SIZE_PX;
  canvas.height = ATLAS_SIZE_PX;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('2D canvas context unavailable');

  for (const [key, painter] of Object.entries(PAINTERS)) {
    const tile = Number(key);
    const image = ctx.createImageData(S, S);
    const rng = mulberry32(0x5eed + tile * 7919);

    const set: SetPixel = (x, y, [r, g, b]) => {
      const offset = (y * S + x) * 4;
      image.data[offset] = r;
      image.data[offset + 1] = g;
      image.data[offset + 2] = b;
      image.data[offset + 3] = 255;
    };

    painter(set, rng);
    ctx.putImageData(image, (tile % ATLAS_TILES_PER_ROW) * S, Math.floor(tile / ATLAS_TILES_PER_ROW) * S);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.generateMipmaps = false;
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;

  return { texture, canvas, tileColors: averageTileColors(ctx) };
}
