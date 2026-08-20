import { buildSectionMesh } from './mesher.ts';

export interface MeshRequest {
  jobId: number;
  key: string;
  volume: Uint8Array;
}

export interface MeshResponse {
  jobId: number;
  key: string;
  positions: Float32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors: Float32Array;
  indices: Uint32Array;
  litIndexCount: number;
  /** Returned so the caller can recycle the scratch volume buffer. */
  volume: Uint8Array;
}

self.onmessage = (event: MessageEvent<MeshRequest>) => {
  const { jobId, key, volume } = event.data;
  const mesh = buildSectionMesh(volume);

  const response: MeshResponse = {
    jobId,
    key,
    positions: mesh.positions,
    normals: mesh.normals,
    uvs: mesh.uvs,
    colors: mesh.colors,
    indices: mesh.indices,
    litIndexCount: mesh.litIndexCount,
    volume,
  };

  (self as unknown as Worker).postMessage(response, [
    mesh.positions.buffer,
    mesh.normals.buffer,
    mesh.uvs.buffer,
    mesh.colors.buffer,
    mesh.indices.buffer,
    volume.buffer,
  ]);
};
