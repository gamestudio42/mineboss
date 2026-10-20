import { isSolid } from './blocks.ts';

export type BuildKind = 'house' | 'tower' | 'pen';
export const BUILD_KINDS: readonly BuildKind[] = ['house', 'tower', 'pen'];

export interface BuildView {
  getBlock(x: number, y: number, z: number): number;
  edits: { get(key: string): number | undefined };
}

export interface RecognizedBuild {
  kind: BuildKind;
  /** Floor cell inside a room, or the foot of a tower. */
  x: number;
  y: number;
  z: number;
}

/** Placed blocks stacked this high count as a tower; a house corner is five at most. */
export const TOWER_HEIGHT = 6;
/** A fence must stay a fence this long, so a house's first ring of walls is not a pen. */
export const PEN_SETTLE_SECONDS = 12;
const MIN_ROOM_CELLS = 4;
const MAX_ROOM_CELLS = 49;
const ROOF_REACH = 5;
const PLAYER_MADE_SHARE = 0.6;

function placedSolid(view: BuildView, x: number, y: number, z: number): boolean {
  const id = view.edits.get(`${x},${y},${z}`);
  return id !== undefined && isSolid(id);
}

function towerAt(view: BuildView, x: number, y: number, z: number): RecognizedBuild | null {
  if (!placedSolid(view, x, y, z)) return null;
  let bottom = y;
  let top = y;
  while (top - bottom < TOWER_HEIGHT && placedSolid(view, x, top + 1, z)) top++;
  while (top - bottom < TOWER_HEIGHT && placedSolid(view, x, bottom - 1, z)) bottom--;
  return top - bottom + 1 >= TOWER_HEIGHT ? { kind: 'tower', x, y: bottom, z } : null;
}

/**
 * Classifies the enclosed floor around one air cell. A one-wide gap between
 * two wall blocks is a door or a gate and closes the room. Walls must be
 * mostly placed by the player, so caves and tree clumps never count.
 */
export function roomAt(view: BuildView, x: number, y: number, z: number): RecognizedBuild | null {
  const solid = (bx: number, by: number, bz: number): boolean => isSolid(view.getBlock(bx, by, bz));
  if (solid(x, y, z)) return null;
  let feet = y;
  for (let i = 0; i < 3 && !solid(x, feet - 1, z); i++) feet--;
  if (!solid(x, feet - 1, z)) return null;

  const gap = (cx: number, cz: number): boolean =>
    (solid(cx - 1, feet, cz) && solid(cx + 1, feet, cz)) || (solid(cx, feet, cz - 1) && solid(cx, feet, cz + 1));

  const cells: Array<[number, number]> = [];
  const seen = new Set<string>();
  const queue: Array<[number, number]> = [[x, z]];
  let walls = 0;
  let placedWalls = 0;
  let tallWalls = 0;
  while (queue.length) {
    const [cx, cz] = queue.pop()!;
    const key = `${cx},${cz}`;
    if (seen.has(key)) continue;
    seen.add(key);
    if (solid(cx, feet, cz)) {
      walls++;
      if (placedSolid(view, cx, feet, cz)) placedWalls++;
      if (solid(cx, feet + 2, cz)) tallWalls++;
      continue;
    }
    if (gap(cx, cz)) continue;
    cells.push([cx, cz]);
    if (cells.length > MAX_ROOM_CELLS) return null;
    queue.push([cx + 1, cz], [cx - 1, cz], [cx, cz + 1], [cx, cz - 1]);
  }
  if (cells.length < MIN_ROOM_CELLS || placedWalls < walls * PLAYER_MADE_SHARE) return null;

  let covered = 0;
  let placedRoof = 0;
  for (const [cx, cz] of cells) {
    for (let ry = feet + 2; ry <= feet + ROOF_REACH; ry++) {
      if (!solid(cx, ry, cz)) continue;
      covered++;
      if (placedSolid(view, cx, ry, cz)) placedRoof++;
      break;
    }
  }

  const mid = cells.reduce((sum, [cx, cz]) => [sum[0] + cx, sum[1] + cz], [0, 0]).map(v => v / cells.length);
  const [px, pz] = cells.reduce((best, cell) =>
    Math.hypot(cell[0] - mid[0], cell[1] - mid[1]) < Math.hypot(best[0] - mid[0], best[1] - mid[1]) ? cell : best);
  if (covered >= cells.length * 0.75 && placedRoof >= covered * PLAYER_MADE_SHARE) return { kind: 'house', x: px, y: feet, z: pz };
  if (covered <= cells.length * 0.25 && tallWalls < walls * 0.5) return { kind: 'pen', x: px, y: feet, z: pz };
  return null;
}

/** What the block just placed at (x, y, z) completes, if anything. */
export function recognizeBuild(view: BuildView, x: number, y: number, z: number): RecognizedBuild | null {
  const tower = towerAt(view, x, y, z);
  if (tower) return tower;
  for (const [dx, dy, dz] of [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, -1, 0]]) {
    const room = roomAt(view, x + dx, y + dy, z + dz);
    if (room) return room;
  }
  return null;
}

/** Remembers which builds the album shows and holds a new pen until it settles. */
export class BuildWatcher {
  readonly found = new Set<BuildKind>();
  private pending: { build: RecognizedBuild; wait: number } | null = null;

  /** Call after each placed block; houses and towers count at once. */
  notice(view: BuildView, x: number, y: number, z: number): RecognizedBuild | null {
    const build = recognizeBuild(view, x, y, z);
    if (!build || this.found.has(build.kind)) return null;
    if (build.kind === 'pen') {
      this.pending = { build, wait: PEN_SETTLE_SECONDS };
      return null;
    }
    this.found.add(build.kind);
    return build;
  }

  /** Confirms a pen that is still a pen once it has settled. */
  update(view: BuildView, dt: number): RecognizedBuild | null {
    if (!this.pending) return null;
    this.pending.wait -= dt;
    if (this.pending.wait > 0) return null;
    const { build } = this.pending;
    this.pending = null;
    const still = roomAt(view, build.x, build.y, build.z);
    if (still?.kind !== 'pen' || this.found.has('pen')) return null;
    this.found.add('pen');
    return still;
  }

  load(kinds: readonly string[] = []): void {
    this.found.clear();
    this.pending = null;
    for (const kind of kinds) if ((BUILD_KINDS as readonly string[]).includes(kind)) this.found.add(kind as BuildKind);
  }
}
