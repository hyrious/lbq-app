import type { RpcMethod } from '../../src/platform/ipc/common/ipc.ts';

export type SubjectKind = 'Issue' | 'PullRequest' | 'Other';
export type SubjectStatus = 'open' | 'draft' | 'merged' | 'closed' | 'completed' | 'not-planned';

export interface NotificationItem {
  id: string;
  kind: SubjectKind;
  subjectType: string;
  repository: string;
  title: string;
  updatedAt: string;
  unread: boolean;
  url: string;
  status?: SubjectStatus;
  releasePath?: string;
  owner?: string;
  repo?: string;
  number?: number;
}

export interface Comment {
  kind: 'comment' | 'review' | 'review-comment';
  author: string;
  avatarUrl: string;
  body: string;
  createdAt: string;
  url: string;
  state?: string;
  path?: string;
  startLine?: number;
  line?: number;
}

export interface SubjectDetail {
  kind: 'Issue' | 'PullRequest';
  repository: string;
  number: number;
  title: string;
  body: string;
  state: string;
  stateReason?: string;
  author: string;
  avatarUrl: string;
  createdAt: string;
  updatedAt: string;
  url: string;
  labels: string[];
  comments: Comment[];
  draft?: boolean;
  merged?: boolean;
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
