import type { RpcMethod } from '../../../../src/platform/ipc/common/ipc.ts';

export type Action = 'pull' | 'clean' | 'open' | 'terminal' | 'sublime' | 'vscode';

export interface Repository {
  path: string;
  name: string;
  remote: string;
  branch: string;
  changed: number;
  upstream: string;
  ahead: number;
  behind: number;
  fetchedAt: number;
  error: string;
  pullRequest: PullRequest | undefined;
  openCounts: OpenCounts | undefined;
}

export interface OpenCounts {
  pulls: number;
  issues: number;
}

export interface OpenItem {
  number: number;
  title: string;
  url: string;
  author: string;
  updatedAt: string;
  isPullRequest: boolean;
  isDraft: boolean;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  isDraft: boolean;
}

export interface ActionRequest {
  path: string;
  action: Action;
}

export interface CommandResult {
  command: string;
  output: string;
  failed: boolean;
}

export function commandText(file: string, args: readonly string[]): string {
  return [file, ...args].map(value => /^[\w./:@=+-]+$/.test(value) ? value : `'${value.replaceAll("'", "'\\''")}'`).join(' ');
}

export function initialCommand(action: Action, path: string): string {
  if (action == 'open') return commandText('smerge', [path]);
  if (action == 'sublime') return commandText('subl', [path]);
  if (action == 'vscode') return commandText('code', [path]);
  if (action == 'terminal') return '';
  if (action == 'pull') return 'git pull --prune';
  if (action == 'clean') return 'git fetch --all --tags --prune --jobs=10';
  throw new Error('未知操作');
}

export interface ReposRpc {
  reposOpenItems: RpcMethod<string, OpenItem[]>;
  reposHome: RpcMethod<undefined, string>;
  reposAvatar: RpcMethod<string, string>;
  reposList: RpcMethod<undefined, Repository[]>;
  reposAdd: RpcMethod<undefined, string | undefined>;
  reposRemove: RpcMethod<string, void>;
  reposReorder: RpcMethod<string[], void>;
  reposOpenItem: RpcMethod<string, void>;
  reposRun: RpcMethod<ActionRequest, CommandResult>;
  reposCopy: RpcMethod<string, void>;
}
