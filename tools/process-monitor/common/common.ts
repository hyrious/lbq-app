import type { RpcMethod } from '../../../src/platform/ipc/common/ipc.ts';

export interface ProcessEntry {
  pid: number;
  /** Resident set size in bytes. */
  memory: number;
  /** Friendly display name, falling back to the executable name. */
  name: string;
  path?: string;
}

export interface ProgramGroup {
  key: string;
  name: string;
  /** Total resident memory in bytes, rounded for display. */
  memory: number;
  processCount: number;
  processes: ProcessEntry[];
}

export interface ProcessSnapshot {
  /** Total resident memory in bytes across all captured processes. */
  totalMemory: number;
  programs: ProgramGroup[];
}

export interface ProcessMonitorRpc {
  listProcesses: RpcMethod<undefined, ProcessSnapshot>;
}
