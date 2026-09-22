import type { RpcMethod } from '../../src/platform/ipc/common/ipc.ts';

export type SubjectKind = 'Issue' | 'PullRequest' | 'Other';

export interface NotificationItem {
  id: string;
  kind: SubjectKind;
  subjectType: string;
  reason: string;
  repository: string;
  title: string;
  updatedAt: string;
  unread: boolean;
  url: string;
  releasePath?: string;
  owner?: string;
  repo?: string;
  number?: number;
}

export interface Comment {
  author: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
  url: string;
}

export interface SubjectDetail {
  kind: 'Issue' | 'PullRequest';
  repository: string;
  number: number;
  title: string;
  body: string;
  state: string;
  author: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: string[];
  comments: Comment[];
  draft?: boolean;
  merged?: boolean;
  mergeable?: boolean | null;
  mergeableState?: string;
  headSha?: string;
  headLabel?: string;
  baseLabel?: string;
  additions?: number;
  deletions?: number;
  changedFiles?: number;
}

export interface ExternalRequest {
  url?: string;
}

export interface GitHubInboxRpc {
  getToken: RpcMethod<undefined, string>;
  loadInbox: RpcMethod<undefined, unknown>;
  openExternal: RpcMethod<ExternalRequest, void>;
  saveInbox: RpcMethod<readonly NotificationItem[], void>;
}
