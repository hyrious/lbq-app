import type { RpcMethod } from '../../src/platform/ipc/common/ipc.ts';

export interface ImageRequest {
  path?: string;
  scale?: number;
  width?: number;
}

export interface ProcessedImage {
  width: number;
  height: number;
  preview: Uint8Array;
}

export interface ImagePortalRpc {
  processImage: RpcMethod<ImageRequest, ProcessedImage>;
}
