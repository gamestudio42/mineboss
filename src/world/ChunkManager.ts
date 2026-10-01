import * as THREE from 'three';

import { CHUNK_SIZE, SECTION_COUNT, SECTION_HEIGHT, chunkKey, sectionKey } from './Chunk.ts';
import { VOLUME_LENGTH, volumeIndex } from './meshing/mesher.ts';
import type { MeshRequest, MeshResponse } from './meshing/mesher.worker.ts';
import type { World } from './World.ts';

const RENDER_DISTANCE = 8;
/** Neighbours must exist before a chunk can be meshed without seams. */
const GENERATE_MARGIN = 1;
const UNLOAD_MARGIN = 2;
/** Terrain generation is synchronous, so one column per frame keeps frames smooth. */
const MAX_GENERATED_PER_FRAME = 1;
const MAX_JOBS_PER_WORKER = 2;

interface PendingJob {
  key: string;
  jobId: number;
  /** Set when the section changed again while the worker was busy. */
  stale: boolean;
}

/**
 * Streams chunks around the player: generates terrain, hands sections to the
 * mesher worker pool and keeps the resulting meshes in the scene.
 */
export class ChunkManager {
  private readonly workers: Worker[] = [];
  private readonly workerLoad: number[] = [];
  private readonly meshes = new Map<string, THREE.Mesh>();
  private readonly waterMeshes = new Map<string, THREE.Mesh>();
  private readonly pending = new Map<string, PendingJob>();
  private readonly queue: string[] = [];
  private readonly queued = new Set<string>();
  private readonly meshedChunks = new Set<string>();
  private readonly volumePool: Uint8Array[] = [];
  private readonly offsets: Array<{ dx: number; dz: number; distance: number }> = [];

  private nextJobId = 1;
  /** In-flight meshes with a lower id are discarded after a new-game reset. */
  private discardBeforeJobId = 0;
  private lastChunkX = Number.NaN;
  private lastChunkZ = Number.NaN;

  constructor(
    private readonly world: World,
    private readonly scene: THREE.Scene,
    private readonly materials: [THREE.Material, THREE.Material],
    private readonly waterMaterial: THREE.Material,
  ) {
    const poolSize = Math.max(1, Math.min(4, (navigator.hardwareConcurrency ?? 4) - 1));
    for (let i = 0; i < poolSize; i++) {
      const worker = new Worker(new URL('./meshing/mesher.worker.ts', import.meta.url), {
        type: 'module',
      });
      worker.onmessage = (event: MessageEvent<MeshResponse>) => this.handleMeshResult(event.data, i);
      this.workers.push(worker);
      this.workerLoad.push(0);
    }

    const reach = RENDER_DISTANCE + GENERATE_MARGIN;
    for (let dz = -reach; dz <= reach; dz++) {
      for (let dx = -reach; dx <= reach; dx++) {
        const distance = Math.hypot(dx, dz);
        if (distance <= reach) this.offsets.push({ dx, dz, distance });
      }
    }
    this.offsets.sort((a, b) => a.distance - b.distance);
  }

  get queuedJobs(): number {
    return this.queue.length;
  }

  get activeJobs(): number {
    return this.pending.size;
  }

  get loadedChunks(): number {
    return this.world.chunks.size;
  }

  /** Generates and meshes everything around a point, used before the first frame. */
  preload(x: number, z: number, radius: number): void {
    const cx = Math.floor(x / CHUNK_SIZE);
    const cz = Math.floor(z / CHUNK_SIZE);

    for (let dz = -radius - 1; dz <= radius + 1; dz++) {
      for (let dx = -radius - 1; dx <= radius + 1; dx++) {
        this.world.ensureChunk(cx + dx, cz + dz);
      }
    }

    for (let dz = -radius; dz <= radius; dz++) {
      for (let dx = -radius; dx <= radius; dx++) {
        this.enqueueChunk(cx + dx, cz + dz);
      }
    }

    this.dispatch();
  }

  update(playerX: number, playerZ: number): void {
    const cx = Math.floor(playerX / CHUNK_SIZE);
    const cz = Math.floor(playerZ / CHUNK_SIZE);

    this.generateAround(cx, cz);
    this.meshAround(cx, cz);

    for (const section of this.world.takeDirtySections()) {
      this.enqueueSection(section.cx, section.cz, section.sy);
    }

    if (cx !== this.lastChunkX || cz !== this.lastChunkZ) {
      this.unloadFar(cx, cz);
      this.lastChunkX = cx;
      this.lastChunkZ = cz;
    }

    this.dispatch();
  }

  /**
   * Unloads matching columns so the next ensure regenerates them with the
   * current generator flags, then remeshes those columns and their neighbours.
   */
  regenerateWhere(test: (cx: number, cz: number) => boolean): void {
    const targets: Array<{ cx: number; cz: number }> = [];
    for (const chunk of [...this.world.chunks.values()]) {
      if (!test(chunk.cx, chunk.cz)) continue;
      targets.push({ cx: chunk.cx, cz: chunk.cz });
      this.evictChunk(chunk.cx, chunk.cz);
    }

    const neighbors = new Set<string>();
    for (const { cx, cz } of targets) {
      this.world.ensureChunk(cx, cz);
      for (let dz = -1; dz <= 1; dz++) {
        for (let dx = -1; dx <= 1; dx++) {
          this.world.ensureChunk(cx + dx, cz + dz);
          neighbors.add(chunkKey(cx + dx, cz + dz));
        }
      }
    }

    for (const key of neighbors) {
      const [cx, cz] = key.split(',').map(Number);
      this.meshedChunks.delete(key);
      this.enqueueChunk(cx, cz);
    }

    this.dispatch();
  }

  /** Tears down streamed meshes so a new run can generate the world from scratch. */
  reset(): void {
    this.discardBeforeJobId = this.nextJobId;
    this.queue.length = 0;
    this.queued.clear();
    this.pending.clear();
    this.meshedChunks.clear();
    this.lastChunkX = Number.NaN;
    this.lastChunkZ = Number.NaN;

    this.clearMeshMap(this.meshes);
    this.clearMeshMap(this.waterMeshes);
  }

  dispose(): void {
    for (const worker of this.workers) worker.terminate();
    this.clearMeshMap(this.meshes);
    this.clearMeshMap(this.waterMeshes);
  }

  private generateAround(cx: number, cz: number): void {
    let budget = MAX_GENERATED_PER_FRAME;

    for (const { dx, dz } of this.offsets) {
      if (budget === 0) return;
      const x = cx + dx;
      const z = cz + dz;
      if (this.world.chunks.has(chunkKey(x, z))) continue;
      this.world.ensureChunk(x, z);
      budget -= 1;
    }
  }

  private meshAround(cx: number, cz: number): void {
    for (const { dx, dz, distance } of this.offsets) {
      if (distance > RENDER_DISTANCE) break;
      this.enqueueChunk(cx + dx, cz + dz);
    }
  }

  /** Queues every non-empty section of a chunk once its neighbours exist. */
  private enqueueChunk(cx: number, cz: number): void {
    const key = chunkKey(cx, cz);
    if (this.meshedChunks.has(key)) return;

    const chunk = this.world.getChunk(cx, cz);
    if (!chunk?.generated) return;
    if (
      !this.world.getChunk(cx - 1, cz) ||
      !this.world.getChunk(cx + 1, cz) ||
      !this.world.getChunk(cx, cz - 1) ||
      !this.world.getChunk(cx, cz + 1)
    ) {
      return;
    }

    this.meshedChunks.add(key);
    for (let sy = 0; sy < SECTION_COUNT; sy++) {
      if (chunk.isSectionEmpty(sy)) continue;
      this.enqueueSection(cx, cz, sy);
    }
  }

  private enqueueSection(cx: number, cz: number, sy: number): void {
    const key = sectionKey(cx, cz, sy);

    const inFlight = this.pending.get(key);
    if (inFlight) {
      inFlight.stale = true;
      return;
    }

    if (this.queued.has(key)) return;
    this.queued.add(key);
    this.queue.push(key);
  }

  private dispatch(): void {
    while (this.queue.length > 0) {
      const workerIndex = this.pickWorker();
      if (workerIndex < 0) return;

      const key = this.queue.shift() as string;
      this.queued.delete(key);

      const [cx, cz, sy] = key.split(',').map(Number);
      if (!this.world.getChunk(cx, cz)) continue;

      const volume = this.volumePool.pop() ?? new Uint8Array(VOLUME_LENGTH);
      this.fillVolume(volume, cx, cz, sy);

      const request: MeshRequest = { jobId: this.nextJobId++, key, volume };
      this.pending.set(key, { key, jobId: request.jobId, stale: false });
      this.workerLoad[workerIndex] += 1;
      this.workers[workerIndex].postMessage(request, [volume.buffer]);
    }
  }

  private pickWorker(): number {
    let best = -1;
    let bestLoad = MAX_JOBS_PER_WORKER;

    for (let i = 0; i < this.workers.length; i++) {
      if (this.workerLoad[i] < bestLoad) {
        best = i;
        bestLoad = this.workerLoad[i];
      }
    }

    return best;
  }

  /** Copies a section plus a one block border into the padded worker volume. */
  private fillVolume(volume: Uint8Array, cx: number, cz: number, sy: number): void {
    const chunk = this.world.getChunk(cx, cz);
    const baseX = cx * CHUNK_SIZE;
    const baseZ = cz * CHUNK_SIZE;
    const baseY = sy * SECTION_HEIGHT;

    for (let y = -1; y <= SECTION_HEIGHT; y++) {
      for (let z = -1; z <= SECTION_HEIGHT; z++) {
        for (let x = -1; x <= SECTION_HEIGHT; x++) {
          const interior =
            chunk !== undefined &&
            x >= 0 &&
            x < CHUNK_SIZE &&
            z >= 0 &&
            z < CHUNK_SIZE &&
            baseY + y >= 0 &&
            baseY + y < SECTION_COUNT * SECTION_HEIGHT;

          volume[volumeIndex(x, y, z)] = interior
            ? chunk.get(x, baseY + y, z)
            : this.world.getBlock(baseX + x, baseY + y, baseZ + z);
        }
      }
    }
  }

  private handleMeshResult(response: MeshResponse, workerIndex: number): void {
    this.workerLoad[workerIndex] -= 1;
    this.volumePool.push(response.volume);

    if (response.jobId < this.discardBeforeJobId) {
      this.dispatch();
      return;
    }

    const job = this.pending.get(response.key);
    if (!job || job.jobId !== response.jobId) {
      this.dispatch();
      return;
    }
    this.pending.delete(response.key);

    const [cx, cz, sy] = response.key.split(',').map(Number);
    if (this.world.getChunk(cx, cz)) {
      this.applyMesh(response, cx, cz, sy);
      if (job.stale) this.enqueueSection(cx, cz, sy);
    }

    this.dispatch();
  }

  private applyMesh(response: MeshResponse, cx: number, cz: number, sy: number): void {
    if (response.indices.length === 0 && response.waterIndices.length === 0) {
      this.removeMesh(this.meshes, response.key);
      this.removeMesh(this.waterMeshes, response.key);
      return;
    }

    if (response.indices.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(response.positions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(response.normals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(response.uvs, 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(response.colors, 3));
      geometry.setIndex(new THREE.BufferAttribute(response.indices, 1));

      const emissiveCount = response.indices.length - response.litIndexCount;
      if (response.litIndexCount > 0) geometry.addGroup(0, response.litIndexCount, 0);
      if (emissiveCount > 0) geometry.addGroup(response.litIndexCount, emissiveCount, 1);
      geometry.computeBoundingSphere();
      this.upsertMesh(this.meshes, response.key, geometry, this.materials, cx, cz, sy);
    } else {
      this.removeMesh(this.meshes, response.key);
    }

    if (response.waterIndices.length > 0) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(response.waterPositions, 3));
      geometry.setAttribute('normal', new THREE.BufferAttribute(response.waterNormals, 3));
      geometry.setAttribute('uv', new THREE.BufferAttribute(response.waterUvs, 2));
      geometry.setAttribute('color', new THREE.BufferAttribute(response.waterColors, 3));
      geometry.setIndex(new THREE.BufferAttribute(response.waterIndices, 1));
      geometry.computeBoundingSphere();
      this.upsertMesh(this.waterMeshes, response.key, geometry, this.waterMaterial, cx, cz, sy);
    } else {
      this.removeMesh(this.waterMeshes, response.key);
    }
  }

  private upsertMesh(
    map: Map<string, THREE.Mesh>,
    key: string,
    geometry: THREE.BufferGeometry,
    material: THREE.Material | THREE.Material[],
    cx: number,
    cz: number,
    sy: number,
  ): void {
    const existing = map.get(key);
    if (existing) {
      existing.geometry.dispose();
      existing.geometry = geometry;
      return;
    }

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(cx * CHUNK_SIZE, sy * SECTION_HEIGHT, cz * CHUNK_SIZE);
    mesh.matrixAutoUpdate = false;
    mesh.updateMatrix();
    this.scene.add(mesh);
    map.set(key, mesh);
  }

  private removeMesh(map: Map<string, THREE.Mesh>, key: string): void {
    const mesh = map.get(key);
    if (!mesh) return;
    this.scene.remove(mesh);
    mesh.geometry.dispose();
    map.delete(key);
  }

  private clearMeshMap(map: Map<string, THREE.Mesh>): void {
    for (const mesh of map.values()) {
      this.scene.remove(mesh);
      mesh.geometry.dispose();
    }
    map.clear();
  }

  private evictChunk(cx: number, cz: number): void {
    for (let sy = 0; sy < SECTION_COUNT; sy++) {
      const key = sectionKey(cx, cz, sy);
      this.removeMesh(this.meshes, key);
      this.removeMesh(this.waterMeshes, key);
      this.pending.delete(key);
      if (this.queued.has(key)) {
        this.queued.delete(key);
        const index = this.queue.indexOf(key);
        if (index >= 0) this.queue.splice(index, 1);
      }
    }
    this.meshedChunks.delete(chunkKey(cx, cz));
    this.world.unloadChunk(cx, cz);
  }

  private unloadFar(cx: number, cz: number): void {
    const limit = RENDER_DISTANCE + UNLOAD_MARGIN;

    for (const chunk of [...this.world.chunks.values()]) {
      if (Math.hypot(chunk.cx - cx, chunk.cz - cz) <= limit) continue;

      for (let sy = 0; sy < SECTION_COUNT; sy++) {
        const key = sectionKey(chunk.cx, chunk.cz, sy);
        this.removeMesh(this.meshes, key);
        this.removeMesh(this.waterMeshes, key);
      }

      this.meshedChunks.delete(chunkKey(chunk.cx, chunk.cz));
      this.world.unloadChunk(chunk.cx, chunk.cz);
    }
  }
}
