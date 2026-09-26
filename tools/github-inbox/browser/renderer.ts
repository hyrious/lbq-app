import { createInvoke, element, getElement, showToast } from 'app-file://shared/renderer.ts';
import { bestScore, highlight } from 'app-file://shared/quick-match.ts';
import type { Comment, GitHubInboxRpc, NotificationItem, SubjectDetail, SubjectStatus } from '../common/common.ts';

const invoke = createInvoke<GitHubInboxRpc>();

interface MarkedModule {
  marked: { parse(markdown: string, options?: { gfm?: boolean; breaks?: boolean }): string | Promise<string> };
}

interface DOMPurifyModule {
  default: { sanitize(html: string): string };
}

interface MermaidRenderOptions {
  bg: string;
  fg: string;
  transparent: boolean;
}

interface BeautifulMermaidModule {
  renderMermaidSVG(text: string, options: MermaidRenderOptions): string;
}

interface FileDiffMetadata {
  name: string;
  prevName?: string;
}

interface ParsedPatch {
  files: FileDiffMetadata[];
}

interface SubjectStatusInput {
  state?: unknown;
  state_reason?: unknown;
  stateReason?: unknown;
  draft?: unknown;
  merged?: unknown;
}

interface CommentSource {
  path: string;
  kind: Comment['kind'];
}

interface CodeViewOptions {
  diffStyle: 'unified' | 'split';
  overflow: 'scroll';
  theme: { dark: string; light: string };
  stickyHeaders: boolean;
  layout: { paddingTop: number; paddingBottom: number; gap: number };
}

interface CodeViewScrollTarget {
  type: 'item';
  id: string;
  align?: 'start' | 'center' | 'end' | 'nearest';
  offset?: number;
  behavior?: 'instant' | 'smooth' | 'smooth-auto';
}

interface CodeViewDiffItem {
  id: string;
  type: 'diff';
  fileDiff: FileDiffMetadata;
}

interface CodeViewRenderedItem {
  id: string;
  element: HTMLElement;
}

interface CodeViewInstance {
  readonly options: CodeViewOptions;
  setup(root: HTMLElement): void;
  setItems(items: readonly CodeViewDiffItem[]): void;
  scrollTo(target: CodeViewScrollTarget): void;
  getRenderedItems(): CodeViewRenderedItem[];
  subscribeToScroll(listener: (scrollTop: number) => void): () => void;
  setOptions(options: CodeViewOptions): void;
  cleanUp(): void;
}

interface PierreDiffsModule {
  CodeView: new(options: CodeViewOptions) => CodeViewInstance;
  parsePatchFiles(patch: string): ParsedPatch[];
}

class RefreshQueue {
  private readonly task: () => Promise<void>;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private running = false;
  private rerun = false;

  constructor(task: () => Promise<void>) {
    this.task = task;
  }

  enqueue(delay = 0): void {
    if (this.running) {
      this.rerun = true;
      return;
    }
    clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(), delay);
  }

  private async run(): Promise<void> {
    this.timer = undefined;
    this.running = true;
    try {
      await this.task();
    } finally {
      this.running = false;
      if (this.rerun) {
        this.rerun = false;
        this.enqueue();
      }
    }
  }
}

class GitHubClient {
  private readonly token: string;
  private readonly detailCache = new Map<string, SubjectDetail>();
  private readonly detailRequests = new Map<string, Promise<SubjectDetail>>();
  private readonly commentRequests = new WeakMap<SubjectDetail, Promise<void>>();
  private readonly commentsLoaded = new WeakSet<SubjectDetail>();
  private readonly diffCache = new Map<string, string>();
  private readonly diffRequests = new Map<string, Promise<string>>();

  private constructor(token: string) {
    this.token = token;
  }

  static async create(): Promise<GitHubClient> {
    return new GitHubClient(await invoke('getToken', undefined));
  }

  async getUnreadNotifications(): Promise<NotificationItem[]> {
    const value = await this.request('/notifications?per_page=50');
    return Array.isArray(value) ? value.map(row => this.toNotification(row)) : [];
  }

  async loadInbox(): Promise<NotificationItem[]> {
    const value = await invoke('loadInbox', undefined);
    return Array.isArray(value)
      ? value.map(toStoredNotification).filter((item): item is NotificationItem => item != null)
      : [];
  }

  async saveInbox(items: readonly NotificationItem[]): Promise<void> {
    await invoke('saveInbox', items);
  }

  async getDetail(item: NotificationItem): Promise<SubjectDetail> {
    const key = this.notificationKey(item);
    const cached = this.detailCache.get(key);
    if (cached) return cached;
    let request = this.detailRequests.get(key);
    if (!request) {
      request = this.fetchDetail(item).then(value => {
        setCached(this.detailCache, key, value);
        return value;
      }).finally(() => this.detailRequests.delete(key));
      this.detailRequests.set(key, request);
    }
    return await request;
  }

  getCachedDetail(item: NotificationItem): SubjectDetail | undefined {
    return this.detailCache.get(this.notificationKey(item));
  }

  hasLoadedComments(detail: SubjectDetail): boolean {
    return this.commentsLoaded.has(detail);
  }

  async loadComments(item: NotificationItem, detail: SubjectDetail, onUpdate: () => void): Promise<void> {
    if (this.commentsLoaded.has(detail)) return;
    let request = this.commentRequests.get(detail);
    if (!request) {
      detail.comments.length = 0;
      request = this.fetchComments(item, detail, onUpdate).then(() => {
        this.commentsLoaded.add(detail);
      }).finally(() => this.commentRequests.delete(detail));
      this.commentRequests.set(detail, request);
    }
    await request;
  }

  async getStatus(item: NotificationItem): Promise<SubjectStatus> {
    const detail = this.detailCache.get(this.notificationKey(item));
    if (detail) return subjectStatus(detail.kind, detail);
    return await this.fetchStatus(item);
  }

  private async fetchStatus(item: NotificationItem): Promise<SubjectStatus> {
    if (!item.owner || !item.repo || !item.number || (item.kind != 'Issue' && item.kind != 'PullRequest')) {
      throw new Error('通知内容无效。');
    }
    const section = item.kind == 'PullRequest' ? 'pulls' : 'issues';
    const value = await this.request(
      `/repos/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.repo)}/${section}/${item.number}`
    );
    return subjectStatus(item.kind, plainObject(value) ?? {});
  }

  private async fetchDetail(item: NotificationItem): Promise<SubjectDetail> {
    if (!item.owner || !item.repo || !item.number || (item.kind != 'Issue' && item.kind != 'PullRequest')) {
      throw new Error('通知内容无效。');
    }
    const base = `/repos/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.repo)}`;
    const path = item.kind == 'PullRequest' ? `${base}/pulls/${item.number}` : `${base}/issues/${item.number}`;
    const [detail, canMerge] = await Promise.all([
      this.request(path),
      item.kind == 'PullRequest' ? this.fetchCanMerge(base) : Promise.resolve(undefined)
    ]);
    const result = this.toDetail(item.kind, item.repository, item.number, detail);
    result.canMerge = canMerge;
    return result;
  }

  private async fetchCanMerge(base: string): Promise<boolean> {
    try {
      const repo = plainObject(await this.request(base));
      const permissions = plainObject(repo?.permissions);
      return permissions?.push == true || permissions?.maintain == true || permissions?.admin == true;
    } catch {
      return false;
    }
  }

  private async fetchComments(item: NotificationItem, detail: SubjectDetail, onUpdate: () => void): Promise<void> {
    if (!item.owner || !item.repo || !item.number) throw new Error('通知内容无效。');
    const base = `/repos/${encodeURIComponent(item.owner)}/${encodeURIComponent(item.repo)}`;
    const sources: CommentSource[] = [
      { path: `${base}/issues/${item.number}/comments`, kind: 'comment' }
    ];
    if (item.kind == 'PullRequest') {
      sources.push(
        { path: `${base}/pulls/${item.number}/reviews`, kind: 'review' },
        { path: `${base}/pulls/${item.number}/comments`, kind: 'review-comment' }
      );
    }
    const results = await Promise.allSettled(sources.map(async source => {
      const values = await this.requestAll(source.path);
      detail.comments.push(...values.map(value => this.toComment(value, source.kind)));
      detail.comments.sort((left, right) => left.createdAt.localeCompare(right.createdAt));
      onUpdate();
    }));
    const failure = results.find(result => result.status == 'rejected');
    if (failure?.status == 'rejected') throw failure.reason;
  }

  async getDiff(detail: SubjectDetail): Promise<string> {
    const key = this.detailKey(detail);
    const cached = this.diffCache.get(key);
    if (cached != null) return cached;
    let request = this.diffRequests.get(key);
    if (!request) {
      request = this.fetchDiff(detail).then(value => {
        setCached(this.diffCache, key, value);
        return value;
      }).finally(() => this.diffRequests.delete(key));
      this.diffRequests.set(key, request);
    }
    return await request;
  }

  getCachedDiff(detail: SubjectDetail): string | undefined {
    return this.diffCache.get(this.detailKey(detail));
  }

  private async fetchDiff(detail: SubjectDetail): Promise<string> {
    const [owner, repo] = detail.repository.split('/');
    if (!owner || !repo || detail.kind != 'PullRequest') throw new Error('Pull Request 内容无效。');
    const value = await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${detail.number}`,
      { headers: { Accept: 'application/vnd.github.v3.diff' } }
    );
    const diff = stringValue(value);
    if (diff == null) throw new Error('GitHub 未返回 diff。');
    return diff;
  }

  private notificationKey(item: NotificationItem): string {
    return `${item.repository}#${item.number ?? ''}@${item.updatedAt}`;
  }

  private detailKey(detail: SubjectDetail): string {
    return `${detail.repository}#${detail.number}@${detail.updatedAt}`;
  }

  async open(item: NotificationItem): Promise<void> {
    const requests = [this.openNotification(item)];
    if (item.unread) requests.push(this.markThreadRead(item.id));
    await Promise.all(requests);
  }

  async openUrl(url: string): Promise<void> {
    await invoke('openExternal', { url });
  }

  private async openNotification(item: NotificationItem): Promise<void> {
    if (!item.releasePath) return await this.openUrl(item.url);
    const release = plainObject(await this.request(item.releasePath));
    await this.openUrl(githubUrl(release?.html_url));
  }

  async squashMerge(owner: string, repo: string, number: number, sha: string) {
    const value = plainObject(await this.request(
      `/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/pulls/${number}/merge`,
      { method: 'PUT', body: JSON.stringify({ merge_method: 'squash', sha }) }
    ));
    return { merged: value?.merged == true, message: stringValue(value?.message) ?? 'GitHub 未返回合并结果。' };
  }

  async markRead(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map(id => this.markThreadRead(id)));
  }

  async markDone(ids: readonly string[]): Promise<void> {
    await Promise.all(ids.map(id => this.markThreadDone(id)));
  }

  private async markThreadDone(id: string): Promise<void> {
    if (!/^\d+$/.test(id)) return;
    await this.request(`/notifications/threads/${id}`, { method: 'DELETE' });
  }

  private async markThreadRead(id: string): Promise<void> {
    if (!/^\d+$/.test(id)) return;
    await this.request(`/notifications/threads/${id}`, { method: 'PATCH' });
  }

  private async request(path: string, init: RequestInit = {}): Promise<unknown> {
    const response = await fetch(`https://api.github.com${path}`, {
      ...init,
      cache: init.method && init.method != 'GET' ? 'default' : 'no-cache',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...init.headers
      }
    });
    const text = await response.text();
    const value = text && response.headers.get('content-type')?.includes('json') ? JSON.parse(text) as unknown : text || undefined;
    if (!response.ok) {
      const message = stringValue(plainObject(value)?.message) ?? `${response.status} ${response.statusText}`;
      throw new Error(`GitHub API：${message}`);
    }
    return value;
  }

  private async requestAll(path: string): Promise<unknown[]> {
    const values: unknown[] = [];
    for (let page = 1; ; page++) {
      const value = await this.request(`${path}?per_page=100&page=${page}`);
      if (!Array.isArray(value)) throw new Error('GitHub API：分页响应格式无效。');
      values.push(...value);
      if (value.length < 100) return values;
    }
  }

  private toNotification(value: unknown): NotificationItem {
    const row = plainObject(value);
    const subject = plainObject(row?.subject);
    const repository = plainObject(row?.repository);
    const fullName = stringValue(repository?.full_name) ?? '';
    const apiUrl = stringValue(subject?.url) ?? '';
    const match = apiUrl.match(/^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/(issues|pulls)\/(\d+)$/);
    const rawKind = stringValue(subject?.type);
    const releasePath = rawKind == 'Release'
      ? apiUrl.match(/^https:\/\/api\.github\.com(\/repos\/[^/]+\/[^/]+\/releases\/\d+)$/)?.[1]
      : undefined;
    const kind = rawKind == 'Issue' || rawKind == 'PullRequest' ? rawKind : 'Other';
    return {
      id: stringValue(row?.id) ?? '',
      kind,
      subjectType: rawKind ?? '',
      repository: fullName,
      title: stringValue(subject?.title) ?? '',
      updatedAt: stringValue(row?.updated_at) ?? '',
      unread: row?.unread == true,
      url: match
        ? `https://github.com/${match[1]}/${match[2]}/${match[3] == 'pulls' ? 'pull' : 'issues'}/${match[4]}`
        : notificationUrl(fullName, stringValue(subject?.latest_comment_url) ?? apiUrl),
      releasePath,
      owner: match?.[1],
      repo: match?.[2],
      number: match ? Number(match[4]) : undefined
    };
  }

  private toDetail(kind: 'Issue' | 'PullRequest', repository: string, number: number,
    detailValue: unknown): SubjectDetail {
    const detail = plainObject(detailValue) ?? {};
    const user = plainObject(detail?.user);
    const head = plainObject(detail?.head);
    const base = plainObject(detail?.base);
    const labels = Array.isArray(detail?.labels)
      ? detail.labels.map(value => stringValue(plainObject(value)?.name)).filter((value): value is string => !!value)
      : [];
    return {
      kind,
      repository,
      number,
      title: stringValue(detail?.title) ?? '',
      body: stringValue(detail?.body) ?? '',
      state: stringValue(detail?.state) ?? '',
      stateReason: stringValue(detail?.state_reason),
      author: stringValue(user?.login) ?? '',
      avatarUrl: stringValue(user?.avatar_url) ?? '',
      createdAt: stringValue(detail?.created_at) ?? '',
      updatedAt: stringValue(detail?.updated_at) ?? '',
      url: githubUrl(detail?.html_url),
      labels,
      comments: [],
      draft: kind == 'PullRequest' ? detail?.draft == true : undefined,
      merged: kind == 'PullRequest' ? detail?.merged == true : undefined,
      headSha: kind == 'PullRequest' ? stringValue(head?.sha) : undefined,
      headLabel: kind == 'PullRequest' ? stringValue(head?.label) : undefined,
      baseLabel: kind == 'PullRequest' ? stringValue(base?.label) : undefined,
      additions: kind == 'PullRequest' ? numberValue(detail?.additions) : undefined,
      deletions: kind == 'PullRequest' ? numberValue(detail?.deletions) : undefined,
      changedFiles: kind == 'PullRequest' ? numberValue(detail?.changed_files) : undefined
    };
  }

  private toComment(value: unknown, kind: Comment['kind']): Comment {
    const comment = plainObject(value);
    const user = plainObject(comment?.user);
    return {
      kind,
      author: stringValue(user?.login) ?? '',
      avatarUrl: stringValue(user?.avatar_url) ?? '',
      body: stringValue(comment?.body) ?? '',
      createdAt: stringValue(kind == 'review' ? comment?.submitted_at : comment?.created_at) ?? '',
      url: githubUrl(comment?.html_url),
      state: kind == 'review' ? stringValue(comment?.state) : undefined,
      path: kind == 'review-comment' ? stringValue(comment?.path) : undefined,
      startLine: kind == 'review-comment' ? numberValue(comment?.start_line) : undefined,
      line: kind == 'review-comment' ? numberValue(comment?.line) ?? numberValue(comment?.original_line) : undefined
    };
  }
}

const selectAllInput = getElement<HTMLInputElement>('select-all');
const selectionBar = getElement<HTMLDivElement>('selection-bar');
const selectionLabel = getElement<HTMLSpanElement>('selection-label');
const markDoneButton = getElement<HTMLButtonElement>('mark-done');
const markReadButton = getElement<HTMLButtonElement>('mark-read');
const inboxStatus = getElement<HTMLDivElement>('inbox-status');
const notifications = getElement<HTMLDivElement>('notifications');
const detailScrim = getElement<HTMLDivElement>('detail-scrim');
const detailPanel = getElement<HTMLElement>('detail');
const diffScrim = getElement<HTMLDivElement>('diff-scrim');
const diffPanel = getElement<HTMLElement>('diff-panel');
let items: NotificationItem[] = [];
let selectedId = '';
const openingIds = new Set<string>();
const completingIds = new Set<string>();
let diffView: CodeViewInstance | undefined;
let diffOptions: CodeViewOptions | undefined;
let unsubscribeDiffScroll: (() => void) | undefined;
let diffFiles: { id: string; fileDiff: FileDiffMetadata }[] = [];
let diffActiveFile = '';
let diffRequest = 0;
let pierreDiffsModule: PierreDiffsModule | undefined;
let beautifulMermaidModule: Promise<BeautifulMermaidModule> | undefined;
const checkedIds = new Set<string>();
const clientPromise = GitHubClient.create();
const markedUrl = 'https://esm.sh/marked@15.0.7';
const domPurifyUrl = 'https://esm.sh/dompurify@3.2.6';
const pierreDiffsUrl = 'https://esm.sh/@pierre/diffs@1.4.3';
const beautifulMermaidUrl = 'https://esm.sh/beautiful-mermaid@1.1.3?bundle&target=es2022';
const iconifyUrl = 'https://esm.sh/iconify-icon@3.0.2';
const splitDiffMedia = window.matchMedia('(min-width: 1200px)');
const markdownModules = Promise.all([
  import(markedUrl) as Promise<MarkedModule>,
  import(domPurifyUrl) as Promise<DOMPurifyModule>
]);
const refreshQueue = new RefreshQueue(refresh);
void import(iconifyUrl);

selectAllInput.onchange = () => {
  checkedIds.clear();
  if (selectAllInput.checked) for (const item of items) checkedIds.add(item.id);
  renderInbox();
};
markDoneButton.onclick = () => void markSelectedDone();
markReadButton.onclick = () => void markSelectedRead();
detailScrim.onclick = event => {
  event.preventDefault();
  event.stopPropagation();
  closeDetail();
};
diffScrim.onclick = closeDiff;
splitDiffMedia.onchange = updateDiffStyle;
document.addEventListener('keydown', handleShortcut);
await initialize();
window.addEventListener('focus', () => refreshQueue.enqueue(120));
setInterval(() => refreshQueue.enqueue(), 60_000);
refreshQueue.enqueue();

async function initialize() {
  try {
    items = await (await clientPromise).loadInbox();
    sortInbox();
    renderInbox();
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
}

async function refresh() {
  try {
    const client = await clientPromise;
    const inbox = new Map(items.map(item => [item.id, item]));
    for (const item of await client.getUnreadNotifications()) {
      const existing = inbox.get(item.id);
      if (existing?.updatedAt == item.updatedAt) item.status = existing.status;
      inbox.set(item.id, item);
    }
    items = [...inbox.values()];
    sortInbox();
    const itemIds = new Set(items.map(item => item.id));
    for (const id of checkedIds) if (!itemIds.has(id)) checkedIds.delete(id);
    renderInbox();
    await Promise.allSettled(items.map(async item => {
      if (item.status || (item.kind != 'Issue' && item.kind != 'PullRequest')) return;
      item.status = await client.getStatus(item);
    }));
    renderInbox();
    await client.saveInbox(items);
  } catch (error) {
    inboxStatus.textContent = errorMessage(error);
    inboxStatus.classList.add('error');
    inboxStatus.classList.remove('hidden');
  }
}

function renderInbox() {
  inboxStatus.classList.remove('error');
  inboxStatus.textContent = '';
  inboxStatus.classList.add('hidden');
  renderSelectionBar();
  if (!items.length) {
    if (notifications.firstElementChild?.classList.contains('empty') && notifications.childElementCount == 1) return;
    const empty = document.createElement('div');
    empty.className = 'empty';
    empty.append(createInboxIcon(), element('strong', '', '全部处理完了'));
    notifications.replaceChildren(empty);
    return;
  }

  const rows = new Map<string, HTMLDivElement>();
  for (const child of notifications.children) {
    if (child instanceof HTMLDivElement && child.dataset.notificationId) {
      rows.set(child.dataset.notificationId, child);
    }
  }
  let cursor = notifications.firstElementChild;
  for (const item of items) {
    const row = rows.get(item.id) ?? createNotificationRow();
    updateNotificationRow(row, item);
    if (row == cursor) {
      cursor = cursor.nextElementSibling;
    } else {
      notifications.insertBefore(row, cursor);
    }
  }
  while (cursor) {
    const next = cursor.nextElementSibling;
    cursor.remove();
    cursor = next;
  }
}

function createNotificationRow(): HTMLDivElement {
  const row = document.createElement('div');
  row.setAttribute('role', 'listitem');
  const selection = document.createElement('input');
  selection.type = 'checkbox';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'notification-content';
  button.append(
    element('span', 'notification-repo', ''),
    element('strong', 'notification-title', '')
  );
  const doneButton = document.createElement('button');
  doneButton.type = 'button';
  doneButton.className = 'notification-done';
  doneButton.title = '标记为已完成';
  doneButton.setAttribute('aria-label', '标记为已完成');
  const doneIcon = document.createElement('iconify-icon');
  doneIcon.setAttribute('icon', 'octicon:check-16');
  doneIcon.setAttribute('aria-hidden', 'true');
  doneButton.append(doneIcon);
  row.append(selection, createNotificationIcon(), button, doneButton);
  return row;
}

function updateNotificationRow(row: HTMLDivElement, item: NotificationItem): void {
  row.dataset.notificationId = item.id;
  const opening = openingIds.has(item.id);
  const completing = completingIds.has(item.id);
  row.className = `notification${item.id == selectedId ? ' current' : ''}${item.unread ? ' unread' : ''}${opening ? ' opening' : ''}`;

  const selection = row.firstElementChild as HTMLInputElement;
  selection.checked = checkedIds.has(item.id);
  selection.setAttribute('aria-label', `选择 ${item.title}`);
  selection.onchange = () => {
    if (selection.checked) checkedIds.add(item.id);
    else checkedIds.delete(item.id);
    renderInbox();
  };

  const button = row.children[2] as HTMLButtonElement;
  const doneButton = row.children[3] as HTMLButtonElement;
  const icon = row.children[1] as HTMLElement;
  const repository = button.firstElementChild as HTMLSpanElement;
  const title = button.lastElementChild as HTMLElement;
  const subject = item.number && (item.kind == 'PullRequest' || item.kind == 'Issue')
    ? ` #${item.number}`
    : '';
  updateNotificationIcon(icon, item);
  repository.textContent = `${item.repository}${subject}`;
  title.textContent = item.title;
  button.disabled = opening;
  button.setAttribute('aria-label', opening ? `正在打开 ${item.title}` : item.title);
  button.onclick = event => void select(item, event.metaKey || event.ctrlKey);
  doneButton.disabled = completing;
  doneButton.title = completing ? '正在完成…' : '标记为已完成';
  doneButton.setAttribute('aria-label', doneButton.title);
  doneButton.onclick = () => void markDone(item);
}

function createNotificationIcon(): HTMLElement {
  const icon = document.createElement('iconify-icon');
  icon.className = 'notification-icon';
  icon.setAttribute('aria-hidden', 'true');
  return icon;
}

function updateNotificationIcon(icon: HTMLElement, item: NotificationItem): void {
  let name = 'bell-16';
  let tone = 'muted';
  if (item.subjectType == 'Issue') {
    name = item.status == 'not-planned' ? 'skip-16' : item.status == 'completed' ? 'issue-closed-16' : 'issue-opened-16';
    tone = item.status ?? 'muted';
  } else if (item.subjectType == 'PullRequest') {
    name = item.status == 'draft' ? 'git-pull-request-draft-16'
      : item.status == 'merged' ? 'git-merge-16'
      : item.status == 'closed' ? 'git-pull-request-closed-16'
      : 'git-pull-request-16';
    tone = item.status ?? 'muted';
  } else if (item.subjectType == 'Release') {
    name = 'tag-16';
  } else if (item.subjectType == 'Discussion') {
    name = 'comment-discussion-16';
  } else if (item.subjectType == 'Commit') {
    name = 'git-commit-16';
  } else if (item.subjectType == 'RepositoryVulnerabilityAlert' || item.subjectType == 'SecurityAdvisory') {
    name = 'shield-16';
  } else if (item.subjectType == 'CheckSuite') {
    name = 'check-circle-16';
  } else if (item.subjectType == 'RepositoryInvitation') {
    name = 'repo-16';
  }
  icon.className = `notification-icon ${tone}`;
  icon.setAttribute('icon', `octicon:${name}`);
}

function renderSelectionBar() {
  const count = checkedIds.size;
  selectionBar.classList.toggle('hidden', items.length == 0);
  selectAllInput.checked = !!items.length && count == items.length;
  selectAllInput.indeterminate = 0 < count && count < items.length;
  selectionLabel.textContent = count ? `已选择 ${count} 项` : '全选';
  markDoneButton.classList.toggle('hidden', count == 0);
  markReadButton.classList.toggle('hidden', count == 0);
}

function handleShortcut(event: KeyboardEvent): void {
  if (event.defaultPrevented) return;
  if ((event.metaKey || event.ctrlKey) && !event.altKey && event.key.toLowerCase() == 'p'
    && diffPanel.classList.contains('open')) {
    event.preventDefault();
    diffPanel.querySelector<HTMLInputElement>('.diff-file-search')?.focus();
    return;
  }
  if (event.metaKey || event.ctrlKey || event.altKey || isEditing(event.target)) return;
  const key = event.key.toLowerCase();
  if (key == 'a' && !event.shiftKey && items.length) {
    event.preventDefault();
    if (checkedIds.size == items.length) {
      checkedIds.clear();
    } else {
      checkedIds.clear();
      for (const item of items) checkedIds.add(item.id);
    }
    renderInbox();
  } else if (key == 'e' && !event.shiftKey && checkedIds.size) {
    event.preventDefault();
    void markSelectedDone();
  } else if (key == 'i' && event.shiftKey && checkedIds.size) {
    event.preventDefault();
    void markSelectedRead();
  } else if (key == 'u' && event.shiftKey && checkedIds.size) {
    event.preventDefault();
    void markSelectedUnread();
  }
}

function isEditing(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && (target.isContentEditable || target.matches('input, textarea, select'));
}

async function markSelectedRead() {
  const ids = [...checkedIds].filter(id => items.find(item => item.id == id)?.unread);
  if (!ids.length) return;
  markReadButton.disabled = true;
  try {
    await (await clientPromise).markRead(ids);
    const readIds = new Set(ids);
    for (const item of items) if (readIds.has(item.id)) item.unread = false;
    checkedIds.clear();
    await (await clientPromise).saveInbox(items);
    renderInbox();
  } catch (error) {
    showToast(errorMessage(error), 'error');
  } finally {
    markReadButton.disabled = false;
  }
}

async function markSelectedUnread(): Promise<void> {
  const selectedIds = new Set(checkedIds);
  for (const item of items) if (selectedIds.has(item.id)) item.unread = true;
  checkedIds.clear();
  try {
    await (await clientPromise).saveInbox(items);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
  renderInbox();
}

async function markSelectedDone(): Promise<void> {
  const ids = [...checkedIds];
  if (!ids.length) return;
  markDoneButton.disabled = true;
  try {
    await (await clientPromise).markDone(ids);
    const doneIds = new Set(ids);
    items = items.filter(item => !doneIds.has(item.id));
    checkedIds.clear();
    if (doneIds.has(selectedId)) closeDetail();
    await (await clientPromise).saveInbox(items);
    renderInbox();
  } catch (error) {
    showToast(errorMessage(error), 'error');
  } finally {
    markDoneButton.disabled = false;
  }
}

async function select(item: NotificationItem, external: boolean) {
  if (external || item.kind == 'Other' || !item.owner || !item.repo || !item.number) {
    const showLoading = !!item.releasePath;
    if (showLoading) {
      openingIds.add(item.id);
      renderInbox();
    }
    try {
      await (await clientPromise).open(item);
      item.unread = false;
      await (await clientPromise).saveInbox(items);
    } catch (error) {
      showToast(errorMessage(error), 'error');
    } finally {
      if (showLoading) openingIds.delete(item.id);
      renderInbox();
    }
    return;
  }

  selectedId = item.id;
  renderInbox();
  detailScrim.classList.add('open');
  detailPanel.classList.add('open');
  detailPanel.dataset.kind = item.kind;
  detailPanel.setAttribute('aria-hidden', 'false');
  try {
    const client = await clientPromise;
    if (selectedId != item.id) return;
    if (item.unread) {
      item.unread = false;
      renderInbox();
      void client.markRead([item.id]).catch(error => {
        item.unread = true;
        renderInbox();
        showToast(errorMessage(error), 'error');
        void client.saveInbox(items).catch(saveError => showToast(errorMessage(saveError), 'error'));
      });
    }
    let detail = client.getCachedDetail(item);
    if (!detail) {
      detailPanel.replaceChildren(element('div', 'loading', '正在加载…'));
      detail = await client.getDetail(item);
    }
    item.status = subjectStatus(detail.kind, detail);
    await client.saveInbox(items);
    renderInbox();
    if (selectedId != item.id) return;
    renderDetail(detail, !client.hasLoadedComments(detail));
    void client.loadComments(item, detail, () => {
      if (selectedId == item.id) updateComments(detail, true);
    }).then(() => {
      if (selectedId == item.id) updateComments(detail, false);
    }).catch(error => {
      if (selectedId != item.id) return;
      updateComments(detail, false);
      showToast(errorMessage(error), 'error');
    });
  } catch (error) {
    if (selectedId != item.id) return;
    detailPanel.replaceChildren(element('div', 'loading error', errorMessage(error)));
  }
}

async function markDone(item: NotificationItem) {
  completingIds.add(item.id);
  renderInbox();
  try {
    const client = await clientPromise;
    await client.markDone([item.id]);
    items = items.filter(candidate => candidate.id != item.id);
    checkedIds.delete(item.id);
    if (selectedId == item.id) closeDetail();
    await client.saveInbox(items);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  } finally {
    completingIds.delete(item.id);
    renderInbox();
  }
}

function sortInbox(): void {
  items.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
}

function renderDetail(detail: SubjectDetail, loadingComments = false) {
  const article = document.createElement('article');
  const header = document.createElement('header');
  header.className = 'subject-header';
  const closeButton = document.createElement('button');
  closeButton.type = 'button';
  closeButton.className = 'close';
  closeButton.title = '关闭';
  closeButton.setAttribute('aria-label', '关闭');
  closeButton.append(createCloseIcon());
  closeButton.onclick = closeDetail;
  const eyebrow = element('button', 'subject-eyebrow', `${detail.repository} #${detail.number}`);
  eyebrow.type = 'button';
  eyebrow.title = detail.url;
  eyebrow.onclick = () => void openUrl(detail.url);
  const title = document.createElement('h1');
  title.append(element('span', 'subject-title', detail.title));
  const actions = document.createElement('div');
  actions.className = 'subject-actions';
  if (detail.kind == 'PullRequest' && detail.state == 'open' && !detail.merged && detail.headSha && detail.canMerge) {
    const mergeButton = element('button', 'merge', 'Squash 合并');
    mergeButton.onclick = () => void squashMerge(detail, mergeButton);
    actions.append(mergeButton);
  }
  actions.append(closeButton);
  header.append(eyebrow, title, actions);
  article.append(header);

  if (detail.labels.length) {
    const labels = document.createElement('div');
    labels.className = 'labels';
    for (const label of detail.labels) labels.append(element('span', 'label', label));
    article.append(labels);
  }
  if (detail.kind == 'PullRequest') article.append(renderPullSummary(detail));
  article.append(renderPost(detail.author, detail.avatarUrl, detail.createdAt, detail.body || '（无正文）', detail.url));
  const comments = document.createElement('section');
  comments.className = 'comments';
  article.append(comments);
  detailPanel.replaceChildren(article);
  updateComments(detail, loadingComments);
  detailPanel.scrollTop = 0;
}

function updateComments(detail: SubjectDetail, loading: boolean): void {
  const section = detailPanel.querySelector<HTMLElement>('.comments');
  if (!section) return;
  let heading = section.querySelector<HTMLHeadingElement>('.comments-heading');
  let list = section.querySelector<HTMLDivElement>('.comment-list');
  if (!heading) {
    heading = element('h2', 'comments-heading', '');
    section.append(heading);
  }
  if (!list) {
    list = document.createElement('div');
    list.className = 'comment-list';
    section.append(list);
  }
  heading.textContent = detail.kind == 'PullRequest'
    ? `${detail.comments.length} 条评论与审查`
    : `${detail.comments.length} 条评论`;
  heading.hidden = !detail.comments.length;
  const nodes = new Map([...list.children].map(node => [(node as HTMLElement).dataset.commentUrl, node]));
  const fragment = document.createDocumentFragment();
  for (const comment of detail.comments) {
    const post = nodes.get(comment.url) ?? renderComment(comment);
    fragment.append(post);
  }
  list.replaceChildren(fragment);
  section.querySelector('.comments-loading')?.remove();
  if (loading) section.append(element('div', 'comments-loading', '正在加载评论…'));
}

function renderPullSummary(detail: SubjectDetail): HTMLElement {
  const summary = document.createElement('div');
  summary.className = 'pull-summary';
  const diffButton = document.createElement('button');
  diffButton.type = 'button';
  diffButton.className = 'diff-trigger';
  diffButton.title = '查看 diff';
  diffButton.append(
    element('span', 'additions', `+${detail.additions ?? 0}`),
    element('span', 'deletions', `−${detail.deletions ?? 0}`),
    element('span', '', `${detail.changedFiles ?? 0} 个文件`)
  );
  diffButton.onclick = () => void openDiff(detail);
  summary.append(
    createStateBadge(detail),
    element('code', '', stripOwner(detail.baseLabel ?? '')),
    element('span', '', '←'),
    element('code', '', stripOwner(detail.headLabel ?? '')),
    diffButton
  );
  return summary;
}

async function openDiff(detail: SubjectDetail): Promise<void> {
  closeDiff();
  const request = ++diffRequest;
  diffScrim.classList.add('open');
  diffPanel.classList.add('open');
  diffPanel.setAttribute('aria-hidden', 'false');
  try {
    const client = await clientPromise;
    if (request != diffRequest) return;
    const cachedPatch = client.getCachedDiff(detail);
    if (cachedPatch != null && pierreDiffsModule) {
      renderDiff(cachedPatch, pierreDiffsModule);
      return;
    }
    diffPanel.replaceChildren(element('div', 'loading', '正在加载 diff…'));
    const [patch, diffs] = await Promise.all([client.getDiff(detail), loadPierreDiffs()]);
    if (request != diffRequest) return;
    renderDiff(patch, diffs);
  } catch (error) {
    if (request != diffRequest) return;
    closeDiffView();
    diffPanel.replaceChildren(element('div', 'loading error', errorMessage(error)));
  }
}

function renderDiff(patch: string, diffs: PierreDiffsModule): void {
  const files = diffs.parsePatchFiles(patch).flatMap(parsed => parsed.files);
  const seen = new Set<string>();
  diffFiles = files.map((fileDiff, index) => {
    const name = fileDiff.name || `file-${index}`;
    const id = seen.has(name) ? `${name}#${index}` : name;
    seen.add(id);
    return { id, fileDiff };
  });
  diffActiveFile = diffFiles[0]?.id ?? '';

  const shell = element('div', 'diff-shell', '');
  const toolbar = renderDiffToolbar();
  const view = element('div', 'diff-view', '');
  shell.append(toolbar, view);
  diffPanel.replaceChildren(shell);

  if (!diffFiles.length) {
    view.append(element('div', 'loading', '没有可显示的文件变更。'));
    return;
  }

  diffOptions = {
    diffStyle: diffStyle(),
    overflow: 'scroll',
    theme: { dark: 'pierre-dark', light: 'pierre-light' },
    stickyHeaders: true,
    layout: { paddingTop: 0, paddingBottom: 36, gap: 10 }
  };
  diffView = new diffs.CodeView(diffOptions);
  diffView.setup(view);
  diffView.setItems(diffFiles.map(({ id, fileDiff }) => ({ id, type: 'diff', fileDiff })));
  unsubscribeDiffScroll = diffView.subscribeToScroll(syncActiveDiffFile);
}

function renderDiffToolbar(): HTMLElement {
  const toolbar = element('div', 'diff-toolbar', '');
  const search = document.createElement('input');
  search.type = 'search';
  search.className = 'diff-file-search';
  search.placeholder = '搜索文件…';
  search.autocomplete = 'off';
  search.spellcheck = false;

  const results = element('div', 'diff-file-results hidden', '');
  const fileById = new Map(diffFiles.map(({ id, fileDiff }) => [id, fileDiff]));
  let matches: string[] = [];
  let activeIndex = 0;

  const select = (index: number) => {
    activeIndex = index;
    for (const [position, result] of [...results.children].entries()) {
      result.classList.toggle('active', position == activeIndex);
    }
  };
  const close = () => {
    results.classList.add('hidden');
    results.replaceChildren();
  };
  const jump = (id: string) => {
    search.value = '';
    close();
    search.blur();
    jumpToDiffFile(id);
  };

  const runSearch = () => {
    const query = search.value.trim();
    matches = query
      ? diffFiles
        .map(({ id, fileDiff }) => ({ id, score: bestScore(query, [fileDiff.name, fileDiff.prevName]) }))
        .filter(({ score }) => score > -Infinity)
        .sort((a, b) => b.score - a.score)
        .map(({ id }) => id)
      : diffFiles.map(({ id }) => id);
    const fragment = document.createDocumentFragment();
    for (const [index, id] of matches.entries()) {
      const row = element('button', `diff-file-result${index == 0 ? ' active' : ''}`, '');
      row.type = 'button';
      row.append(...highlight(query, fileById.get(id)!.name));
      row.onclick = () => jump(id);
      fragment.append(row);
    }
    if (!matches.length) fragment.append(element('div', 'diff-file-empty', '没有匹配的文件。'));
    results.replaceChildren(fragment);
    results.classList.remove('hidden');
    activeIndex = 0;
  };

  search.oninput = runSearch;
  search.onfocus = runSearch;
  search.onkeydown = event => {
    if (event.key == 'ArrowDown' || event.key == 'ArrowUp') {
      event.preventDefault();
      if (!matches.length) return;
      const offset = event.key == 'ArrowDown' ? 1 : -1;
      select((activeIndex + offset + matches.length) % matches.length);
      results.children[activeIndex]?.scrollIntoView({ block: 'nearest' });
    } else if (event.key == 'Enter') {
      event.preventDefault();
      if (matches[activeIndex]) jump(matches[activeIndex]);
    } else if (event.key == 'Escape') {
      event.preventDefault();
      if (search.value) {
        search.value = '';
        runSearch();
      } else {
        close();
        search.blur();
      }
    }
  };

  toolbar.append(element('span', 'diff-file-count', `${diffFiles.length} 个文件`), search, results);
  return toolbar;
}

function syncActiveDiffFile(): void {
  if (!diffView) return;
  const view = diffPanel.querySelector<HTMLElement>('.diff-view');
  if (!view) return;
  const viewTop = view.getBoundingClientRect().top;
  const rendered = diffView.getRenderedItems();
  let active = rendered[0]?.id ?? diffActiveFile;
  for (const item of rendered) {
    if (item.element.getBoundingClientRect().top - viewTop <= 2) active = item.id;
    else break;
  }
  if (active == diffActiveFile) return;
  diffActiveFile = active;
  const search = diffPanel.querySelector<HTMLInputElement>('.diff-file-search');
  if (search && !search.value) search.placeholder = `搜索文件…（当前：${active.split('/').pop()}）`;
}

function jumpToDiffFile(id: string): void {
  if (!diffView) return;
  diffActiveFile = id;
  diffView.scrollTo({ type: 'item', id, align: 'start', behavior: 'instant' });
  const item = diffView.getRenderedItems().find(rendered => rendered.id == id);
  if (!item) return;
  item.element.classList.add('diff-file-flash');
  setTimeout(() => item.element.classList.remove('diff-file-flash'), 1200);
}

async function loadPierreDiffs(): Promise<PierreDiffsModule> {
  pierreDiffsModule ??= await import(pierreDiffsUrl) as PierreDiffsModule;
  return pierreDiffsModule;
}

function diffStyle(): 'unified' | 'split' {
  return splitDiffMedia.matches ? 'split' : 'unified';
}

function closeDiff(): void {
  diffRequest++;
  closeDiffView();
  diffScrim.classList.remove('open');
  diffPanel.classList.remove('open');
  diffPanel.setAttribute('aria-hidden', 'true');
  diffPanel.replaceChildren();
}

function closeDiffView(): void {
  unsubscribeDiffScroll?.();
  unsubscribeDiffScroll = undefined;
  diffView?.cleanUp();
  diffView = undefined;
  diffOptions = undefined;
  diffFiles = [];
  diffActiveFile = '';
}

function updateDiffStyle(): void {
  if (!diffView || !diffOptions) return;
  diffView.setOptions({ ...diffOptions, diffStyle: diffStyle() });
}

function stripOwner(label: string): string {
  let index = label.indexOf(':');
  if (index >= 0) return label.slice(index + 1);
  return label;
}

function renderComment(comment: Comment): HTMLElement {
  const post = renderPost(comment.author, comment.avatarUrl, comment.createdAt,
    comment.body || '（无评论内容）', comment.url, commentContext(comment));
  post.dataset.commentUrl = comment.url;
  post.onclick = event => {
    if (event.metaKey || event.ctrlKey) void openUrl(comment.url);
  };
  return post;
}

function commentContext(comment: Comment): string | undefined {
  if (comment.kind == 'review') return reviewStateText(comment.state);
  if (!comment.path) return undefined;
  if (!comment.line) return comment.path;
  const lines = comment.startLine && comment.startLine != comment.line
    ? `${comment.startLine}–${comment.line}`
    : `${comment.line}`;
  return `${comment.path}:${lines}`;
}

function reviewStateText(state: string | undefined): string {
  if (state == 'APPROVED') return '已批准';
  if (state == 'CHANGES_REQUESTED') return '请求修改';
  if (state == 'DISMISSED') return '已驳回';
  if (state == 'PENDING') return '待提交';
  return '审查评论';
}

function renderPost(author: string, avatarUrl: string, createdAt: string, body: string, baseUrl: string,
  context?: string): HTMLElement {
  const post = document.createElement('section');
  post.className = 'post';
  const avatar = document.createElement('img');
  avatar.className = 'avatar';
  avatar.src = avatarUrl;
  avatar.alt = '';
  const byline = document.createElement('div');
  byline.className = 'byline';
  byline.append(element('strong', '', author), element('time', '', fullDate(createdAt)));
  const content = element('div', 'body markdown-body', body);
  content.onclick = event => {
    const link = event.target instanceof Element ? event.target.closest('a') : null;
    if (!link) return;
    event.preventDefault();
    void openUrl(new URL(link.getAttribute('href') ?? '', baseUrl).href);
  };
  post.append(avatar, byline);
  if (context) post.append(element('div', 'comment-context', context));
  post.append(content);
  void renderMarkdown(content, body, baseUrl);
  return post;
}

async function renderMarkdown(container: HTMLElement, markdown: string, baseUrl: string): Promise<void> {
  try {
    const [{ marked }, domPurify] = await markdownModules;
    const html = await marked.parse(markdown, { gfm: true, breaks: true });
    container.innerHTML = domPurify.default.sanitize(html);
    for (const element of container.querySelectorAll<HTMLElement>('[src], [href]')) {
      const attribute = element.hasAttribute('src') ? 'src' : 'href';
      const value = element.getAttribute(attribute);
      if (value) element.setAttribute(attribute, new URL(value, baseUrl).href);
    }
    renderDiffBlocks(container);
    await renderMermaidBlocks(container, domPurify.default);
  } catch (error) {
    console.error('Markdown rendering failed.', error);
  }
}

function renderDiffBlocks(container: HTMLElement): void {
  for (const code of container.querySelectorAll<HTMLElement>('code.language-diff')) {
    const lines = (code.textContent ?? '').split('\n');
    const fragment = document.createDocumentFragment();
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const className = line.startsWith('+') && !line.startsWith('+++') ? 'diff-addition'
        : line.startsWith('-') && !line.startsWith('---') ? 'diff-deletion'
          : line.startsWith('@@') ? 'diff-range' : '';
      fragment.append(element('span', className, line));
      if (index < lines.length - 1) fragment.append('\n');
    }
    code.replaceChildren(fragment);
  }
}

async function renderMermaidBlocks(container: HTMLElement, sanitizer: DOMPurifyModule['default']): Promise<void> {
  const blocks = container.querySelectorAll<HTMLElement>('code.language-mermaid');
  if (!blocks.length) return;
  beautifulMermaidModule ??= import(beautifulMermaidUrl) as Promise<BeautifulMermaidModule>;
  const { renderMermaidSVG } = await beautifulMermaidModule;
  for (const code of blocks) {
    const pre = code.closest('pre');
    if (!pre) continue;
    try {
      const diagram = document.createElement('div');
      diagram.className = 'mermaid-diagram';
      diagram.innerHTML = sanitizer.sanitize(renderMermaidSVG(code.textContent ?? '', {
        bg: 'var(--mermaid-bg)',
        fg: 'var(--mermaid-fg)',
        transparent: true
      }));
      pre.replaceWith(diagram);
    } catch (error) {
      console.error('Mermaid rendering failed.', error);
    }
  }
}

async function squashMerge(detail: SubjectDetail, button: HTMLButtonElement) {
  if (!confirm(`确认以 Squash 方式合并 ${detail.repository}#${detail.number}？`)) return;
  button.disabled = true;
  button.textContent = '正在合并…';
  const [owner, repo] = detail.repository.split('/');
  try {
    const result = await (await clientPromise).squashMerge(owner, repo, detail.number, detail.headSha ?? '');
    showToast(result.message, result.merged ? 'info' : 'error');
    if (result.merged) {
      detail.merged = true;
      detail.state = 'closed';
      const item = items.find(item => item.repository == detail.repository && item.number == detail.number);
      if (item) item.status = 'merged';
      renderDetail(detail);
      renderInbox();
      await (await clientPromise).saveInbox(items);
    } else {
      button.disabled = false;
      button.textContent = 'Squash 合并';
    }
  } catch (error) {
    button.disabled = false;
    button.textContent = 'Squash 合并';
    showToast(errorMessage(error), 'error');
  }
}

async function openUrl(url: string) {
  try {
    await (await clientPromise).openUrl(url);
  } catch (error) {
    showToast(errorMessage(error), 'error');
  }
}

function createStateBadge(detail: SubjectDetail): HTMLSpanElement {
  let state = 'closed';
  let label = '已关闭';
  if (detail.merged) {
    state = 'merged';
    label = '已合并';
  } else if (detail.draft) {
    state = 'draft';
    label = '草稿';
  } else if (detail.state == 'open') {
    state = 'open';
    label = '开启';
  }
  return element('span', `state-badge ${state}`, label);
}

function createCloseIcon(): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('width', '16');
  icon.setAttribute('height', '16');
  icon.setAttribute('viewBox', '0 0 16 16');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.75.75 0 1 1 1.06 1.06L9.06 8l3.22 3.22a.75.75 0 1 1-1.06 1.06L8 9.06l-3.22 3.22a.75.75 0 0 1-1.06-1.06L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z');
  icon.append(path);
  return icon;
}

function closeDetail() {
  closeDiff();
  selectedId = '';
  detailScrim.classList.remove('open');
  detailPanel.classList.remove('open');
  detailPanel.setAttribute('aria-hidden', 'true');
  renderInbox();
}

function createInboxIcon(): SVGSVGElement {
  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('fill', 'currentColor');
  path.setAttribute('d', 'M4.927 3.125A1.75 1.75 0 0 1 6.421 2.25h11.158c.598 0 1.155.305 1.477.81l.019.031 3.228 5.465c.293.474.447 1.02.447 1.578v8.116A2.75 2.75 0 0 1 20 21H4a2.75 2.75 0 0 1-2.75-2.75v-8.116c0-.559.155-1.107.449-1.583ZM6.44 3.75a.25.25 0 0 0-.213.125L3.38 8.75h4.328a.75.75 0 0 1 .704.49 3.826 3.826 0 0 0 7.176 0 .75.75 0 0 1 .704-.49h4.328l-2.824-4.781a.25.25 0 0 0-.217-.219Zm14.81 6.5h-4.459a5.326 5.326 0 0 1-9.582 0H2.75v8c0 .69.56 1.25 1.25 1.25h16c.69 0 1.25-.56 1.25-1.25Z');
  icon.append(path);
  return icon;
}

function fullDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }) : '';
}

function errorMessage(error: unknown): string {
  console.error(error);
  return error instanceof Error ? error.message : String(error);
}

interface UnknownObject {
  [key: PropertyKey]: unknown;
}

function plainObject(value: unknown): UnknownObject | undefined {
  return value != null && typeof value == 'object' && !Array.isArray(value) ? value as UnknownObject : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value == 'string' ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value == 'number' && Number.isFinite(value) ? value : undefined;
}

function subjectStatus(kind: 'Issue' | 'PullRequest', value: SubjectStatusInput): SubjectStatus {
  if (kind == 'PullRequest') {
    if (value.merged == true) return 'merged';
    if (value.state != 'open') return 'closed';
    if (value.draft == true) return 'draft';
    return 'open';
  }
  if (value.state == 'open') return 'open';
  return value.state_reason == 'not_planned' || value.stateReason == 'not_planned' ? 'not-planned' : 'completed';
}

function toStoredNotification(value: unknown): NotificationItem | undefined {
  const item = plainObject(value);
  const id = stringValue(item?.id);
  const kind = stringValue(item?.kind);
  const subjectType = stringValue(item?.subjectType);
  const repository = stringValue(item?.repository);
  const title = stringValue(item?.title);
  const updatedAt = stringValue(item?.updatedAt);
  const url = stringValue(item?.url);
  if (!id || (kind != 'Issue' && kind != 'PullRequest' && kind != 'Other') || subjectType == null
    || repository == null || title == null || updatedAt == null || typeof item?.unread != 'boolean' || url == null) return;
  return {
    id,
    kind,
    subjectType,
    repository,
    title,
    updatedAt,
    unread: item.unread,
    url,
    status: subjectStatusValue(item.status),
    releasePath: stringValue(item.releasePath),
    owner: stringValue(item.owner),
    repo: stringValue(item.repo),
    number: numberValue(item.number)
  };
}

function subjectStatusValue(value: unknown): SubjectStatus | undefined {
  switch (value) {
    case 'open':
    case 'draft':
    case 'merged':
    case 'closed':
    case 'completed':
    case 'not-planned':
      return value;
  }
}

function setCached<V>(cache: Map<string, V>, key: string, value: V): void {
  cache.delete(key);
  cache.set(key, value);
  const oldestKey = cache.keys().next().value;
  if (cache.size > 30 && oldestKey != null) cache.delete(oldestKey);
}

function githubUrl(value: unknown): string {
  const string = stringValue(value);
  if (!string) throw new Error('GitHub 地址无效。');
  const url = new URL(string);
  if (url.protocol != 'https:' || url.hostname != 'github.com') throw new Error('GitHub 地址无效。');
  return url.href;
}

function notificationUrl(repository: string, apiUrl: string): string {
  const match = apiUrl.match(/^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)\/(commits|discussions)\/([^/]+)/);
  if (match) {
    const section = match[3] == 'commits' ? 'commit' : match[3];
    return `https://github.com/${match[1]}/${match[2]}/${section}/${match[4]}`;
  }
  return `https://github.com/${repository}`;
}
