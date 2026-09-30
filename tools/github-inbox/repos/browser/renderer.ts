import { createInvoke, element, getElement } from 'app-file://shared/renderer.ts';
import { initialCommand, type Action, type Repository, type ReposRpc } from '../common/common.ts';
import { OpenItemsPanel } from './openItems.ts';
import { RepoSorting } from './sorting.ts';
import { Tooltips } from './tooltips.ts';

const root = getElement('repos');
const tooltips = new Tooltips(root);
const openItems = new OpenItemsPanel(root);

const invoke = createInvoke<ReposRpc>();
const home = await invoke('reposHome', undefined);
const homePattern = new RegExp(home.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?=$|[/\\\\\\s\'":])', 'g');

function displayPath(value: string): string {
  return value.replace(homePattern, '~');
}

const list = getElement('repos-list');
const empty = getElement('repos-empty');
const add = getElement<HTMLButtonElement>('repos-add');
const resultToggle = getElement<HTMLButtonElement>('repos-result-toggle');
const resultPanel = getElement('repos-result-panel');
const copy = getElement<HTMLButtonElement>('repos-copy');
const busy = new Set<string>();
const avatars = new Map<string, Promise<string | undefined>>();
let latestRun = 0;
let repos: Repository[] = [];
let refreshing = false;
let refreshPending = false;
let rendered = '';
let alternateEditor = false;
let copying = false;
let resultVersion = 0;
let copyTimer: ReturnType<typeof setTimeout> | undefined;
let rawOutput = '';
let draggedPath = '';
let savingOrder = false;
let orderVersion = 0;

interface RepoRow {
  element: HTMLElement;
  signature: string;
  update(repo: Repository): void;
}

interface GitAction {
  id: 'pull' | 'clean';
  label: string;
  icon: string;
  command: string;
}

const gitActions: readonly GitAction[] = [
  { id: 'pull', label: 'Pull', icon: 'arrow-down', command: 'git pull --prune' },
  { id: 'clean', label: '同步并清理分支', icon: 'clean', command: 'gfa → git mm → gsw main → 强制删除 main 以外的本地分支' }
];

const rows = new Map<string, RepoRow>();

function placeRow(row: HTMLElement, index: number) {
  const next = list.children[index] ?? null;
  if (next == row) return;
  if (row.parentElement == list) list.moveBefore(row, next);
  else list.insertBefore(row, next);
}

new RepoSorting(list, {
  begin(path) {
    if (savingOrder || busy.has(path)) return false;
    tooltips.hide();
    draggedPath = path;
    return true;
  },
  end(paths) {
    draggedPath = '';
    if (paths) void reorder(paths);
    else {
      render();
      void refresh();
    }
  }
});

async function reorder(paths: string[]) {
  const previous = repos;
  const byPath = new Map(repos.map(repo => [repo.path, repo]));
  const ordered = paths.map(path => byPath.get(path)!);
  savingOrder = true;
  orderVersion++;
  repos = ordered;
  render();
  try {
    await invoke('reposReorder', ordered.map(repo => repo.path));
  } catch (error) {
    repos = previous;
    render();
    result('排序失败', String(error), true);
  } finally {
    savingOrder = false;
    void refresh();
  }
}

function resetCopy() {
  clearTimeout(copyTimer);
  delete copy.dataset.copied;
  copy.dataset.tooltip = '复制';
  copy.setAttribute('aria-label', '复制执行结果');
  getElement('repos-copy-status').textContent = '';
}

function updateEditor(button: HTMLButtonElement) {
  const label = alternateEditor ? 'code' : 'subl';
  button.dataset.tooltip = alternateEditor ? 'code <dir>' : 'subl <dir>\nAlt/Option: code <dir>';
  button.setAttribute('aria-label', label);
  button.querySelector('iconify-icon')?.setAttribute('icon', alternateEditor ? 'codicon:vscode' : 'simple-icons:sublimetext');
}

function setAlternateEditor(value: boolean) {
  if (alternateEditor == value) return;
  alternateEditor = value;
  for (const button of list.querySelectorAll<HTMLButtonElement>('.editor')) updateEditor(button);
}

window.addEventListener('keydown', event => setAlternateEditor(event.altKey));
window.addEventListener('keyup', event => setAlternateEditor(event.altKey));
window.addEventListener('pointermove', event => setAlternateEditor(event.altKey));
window.addEventListener('blur', () => setAlternateEditor(false));

function result(title: string, value: string, failed = false) {
  resultVersion++;
  getElement('repos-result-title').textContent = displayPath(title);
  resultToggle.dataset.tooltip = displayPath(title);
  resultToggle.disabled = false;
  resultToggle.classList.toggle('error', failed);
  rawOutput = value;
  getElement('repos-output').textContent = displayPath(value);
  copy.hidden = false;
  resetCopy();
}

copy.onclick = async () => {
  if (copying) return;
  copying = true;
  clearTimeout(copyTimer);
  const version = resultVersion;
  const output = rawOutput;
  try {
    await invoke('reposCopy', output);
    if (resultVersion == version) {
      copy.dataset.tooltip = '已复制';
      copy.setAttribute('aria-label', '已复制');
      copy.dataset.copied = '';
      getElement('repos-copy-status').textContent = '已复制';
      copyTimer = setTimeout(resetCopy, 1000);
    }
  } catch {
    if (resultVersion == version) {
      delete copy.dataset.copied;
      copy.dataset.tooltip = '复制失败，点击重试';
      copy.setAttribute('aria-label', copy.dataset.tooltip);
      getElement('repos-copy-status').textContent = '复制失败';
      copyTimer = setTimeout(resetCopy, 2000);
    }
  } finally {
    copying = false;
  }
};

function toggleResult(open: boolean) {
  resultPanel.hidden = !open;
  resultToggle.setAttribute('aria-expanded', String(open));
  if (open) fitResultPanel();
}

function fitResultPanel() {
  if (resultPanel.hidden) return;
  resultPanel.style.maxHeight = `${Math.max(60, innerHeight - resultPanel.getBoundingClientRect().top - 8)}px`;
}

window.addEventListener('resize', fitResultPanel);

resultToggle.onclick = () => toggleResult(resultPanel.hidden == true);
document.addEventListener('pointerdown', event => {
  if (event.target instanceof Node && !getElement('repos-result').contains(event.target)) toggleResult(false);
});
document.addEventListener('keydown', event => {
  if (event.key == 'Escape' && !resultPanel.hidden) {
    toggleResult(false);
    resultToggle.focus();
  }
});

async function refresh() {
  if (draggedPath || savingOrder) return;
  if (refreshing) {
    refreshPending = true;
    return;
  }
  refreshing = true;
  const version = orderVersion;
  try {
    const snapshot = await invoke('reposList', undefined);
    if (draggedPath || savingOrder || version != orderVersion) return;
    repos = snapshot;
    render();
  } catch (error) {
    result('读取失败', String(error), true);
    empty.textContent = '无法读取项目列表';
  } finally {
    refreshing = false;
    if (refreshPending) {
      refreshPending = false;
      void refresh();
    }
  }
}

add.onclick = async () => {
  add.disabled = true;
  try {
    const path = await invoke('reposAdd', undefined);
    if (path) {
      await refresh();
    }
  } catch (error) {
    result('所选文件夹无法作为 Git 项目添加', String(error), true);
  } finally {
    add.disabled = false;
  }
};
window.addEventListener('focus', () => void refresh());
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState == 'visible') void refresh();
});
void refresh();
const refreshTimer = setInterval(() => {
  if (document.visibilityState == 'visible') void refresh();
}, 5000);
window.addEventListener('beforeunload', () => {
  clearInterval(refreshTimer);
  clearTimeout(copyTimer);
});

function syncText(repo: Repository): string {
  if (repo.branch == '(detached)') return '分离';
  if (!repo.upstream) return '';
  if (repo.ahead && repo.behind) return `↓${repo.behind} ↑${repo.ahead}`;
  if (repo.ahead) return `↑${repo.ahead}`;
  if (repo.behind) return `↓${repo.behind}`;
  return '';
}

async function run(repo: Repository, action: Action) {
  const runId = ++latestRun;
  busy.add(repo.path);
  render();
  const command = initialCommand(action, repo.path);
  if (command) {
    result(command, command);
    resultToggle.dataset.tooltip = displayPath(`${command}\n${repo.path}`);
  }
  try {
    const response = await invoke('reposRun', { path: repo.path, action });
    if (runId == latestRun) {
      result(response.command || command, response.output, response.failed);
      resultToggle.dataset.tooltip = displayPath(`${response.command || command}\n${repo.path}`);
    }
  } catch (error) {
    if (runId == latestRun) result(command, String(error), true);
  } finally {
    busy.delete(repo.path);
    render();
    await refresh();
  }
}

function iconButton(icon: string, label: string): HTMLButtonElement {
  const button = element('button', 'icon-button');
  button.type = 'button';
  button.dataset.tooltip = label;
  button.setAttribute('aria-label', label);
  const image = document.createElement('iconify-icon');
  image.setAttribute('icon', icon.includes(':') ? icon : `carbon:${icon}`);
  image.setAttribute('aria-hidden', 'true');
  button.append(image);
  return button;
}

function render() {
  if (draggedPath) return;
  const signature = JSON.stringify([repos, [...busy]]);
  if (signature == rendered) return;
  rendered = signature;
  const paths = new Set(repos.map(repo => repo.path));
  for (const [path, row] of rows) {
    if (paths.has(path)) continue;
    row.element.remove();
    rows.delete(path);
  }
  empty.hidden = repos.length > 0;
  empty.textContent = '点击 + 添加项目';
  for (const [index, repo] of repos.entries()) {
    const signature = JSON.stringify([repo, busy.has(repo.path)]);
    const existing = rows.get(repo.path);
    if (existing?.signature == signature) {
      placeRow(existing.element, index);
      continue;
    }
    const row = existing ?? createRepoRow(repo);
    row.update(repo);
    row.signature = signature;
    rows.set(repo.path, row);
    placeRow(row.element, index);
  }
}

function createRepoRow(repo: Repository): RepoRow {
  const row = element('section', 'repo');
  row.dataset.path = repo.path;
  const dragHandle = iconButton('draggable', '拖动调整顺序');
  dragHandle.classList.add('drag-handle');
  const name = element('button', 'name');
  name.type = 'button';
  name.onclick = () => void run(repo, 'open');
  const dirty = element('span', 'workspace');
  const sync = element('span', 'sync');
  const editor = iconButton('simple-icons:sublimetext', 'subl <dir>');
  editor.classList.add('editor');
  updateEditor(editor);
  editor.onclick = event => void run(repo, event.altKey ? 'vscode' : 'sublime');
  const terminal = iconButton('terminal', window.portal.platform == 'win32' ? 'Windows Terminal' : 'iTerm2');
  terminal.onclick = () => void run(repo, 'terminal');
  const identity = element('div', 'identity');
  const states = element('div', 'states');
  states.append(dirty, sync);
  const actions = element('div', 'actions');
  const prButton = iconButton('octicon:git-pull-request-16', 'PR');
  prButton.onclick = async () => {
    if (!repo.pullRequest) return;
    try {
      await invoke('reposOpenItem', repo.pullRequest.url);
    } catch (error) {
      result('无法打开 PR', String(error), true);
    }
  };
  const openButton = iconButton('octicon:inbox-16', 'PR / Issue');
  openButton.classList.add('open-items-button');
  openButton.setAttribute('aria-haspopup', 'dialog');
  const badge = element('span', 'open-items-badge');
  openButton.append(badge);
  openButton.onclick = () => openItems.open(repo);
  identity.append(dragHandle, name, openButton, prButton);
  actions.append(editor, terminal);
  const actionButtons = gitActions.map(action => {
    const button = iconButton(action.icon, action.label);
    button.onclick = () => void run(repo, action.id);
    actions.append(button);
    return button;
  });
  const remove = iconButton('close', '移除项目');
  remove.classList.add('remove');
  remove.dataset.tooltip = '只从列表移除，保留本地项目';
  remove.onclick = async () => {
    remove.disabled = true;
    try {
      await invoke('reposRemove', repo.path);
      await refresh();
    } catch (error) {
      result('移除失败', String(error), true);
      remove.disabled = false;
    }
  };
  actions.append(remove);
  row.append(identity, states, actions);
  let avatarOwner = '';

  function updateAvatar(owner: string) {
    if (owner == avatarOwner) return;
    avatarOwner = owner;
    dragHandle.querySelector('img')?.remove();
    dragHandle.classList.remove('has-avatar');
    if (!owner) return;
    const avatar = element('img', 'avatar');
    avatar.alt = '';
    avatar.width = 18;
    avatar.height = 18;
    avatar.draggable = false;
    avatar.decoding = 'async';
    avatar.referrerPolicy = 'no-referrer';
    avatar.onerror = () => { avatar.style.visibility = 'hidden'; };
    let image = avatars.get(owner);
    if (!image) {
      image = invoke('reposAvatar', owner).catch(() => undefined);
      avatars.set(owner, image);
    }
    avatar.style.visibility = 'hidden';
    void image.then(source => {
      if (source && avatar.parentElement == dragHandle) {
        avatar.onload = () => {
          if (avatar.parentElement != dragHandle) return;
          avatar.style.visibility = '';
          dragHandle.classList.add('has-avatar');
        };
        avatar.src = source;
      }
    });
    dragHandle.append(avatar);
  }

  function update(next: Repository) {
    repo = next;
    const pending = busy.has(repo.path);
    if (pending) row.setAttribute('aria-busy', 'true');
    else row.removeAttribute('aria-busy');
    name.textContent = repo.name;
    name.disabled = pending;
    name.classList.toggle('error', !!repo.error);
    name.classList.toggle('dirty', !repo.error && !!repo.branch && repo.branch != 'main' && repo.branch != 'master');
    name.setAttribute('aria-label', `smerge ${repo.name}`);
    const fetched = repo.fetchedAt ? new Date(repo.fetchedAt).toLocaleString() : '无记录';
    name.dataset.tooltip = displayPath(`smerge ${repo.path}\n分支：${repo.branch || '未知'}\n最近 fetch：${fetched}`);
    if (repo.error) name.dataset.tooltip += `\n${displayPath(repo.error)}`;
    dirty.textContent = repo.error ? '读取失败' : repo.changed ? `${repo.changed} 文件` : '';
    dirty.className = repo.error ? 'workspace error' : 'workspace dirty';
    dirty.dataset.tooltip = repo.error ? displayPath(repo.error) : repo.changed ? '包含暂存、未暂存和未跟踪文件' : '干净';
    dirty.setAttribute('aria-label', repo.error ? '读取失败' : repo.changed ? `${repo.changed} 个文件有变更` : '干净');
    dirty.hidden = !dirty.textContent;
    const tone = repo.ahead && repo.behind ? 'error' : repo.behind ? 'dirty' : repo.ahead ? 'ahead' : 'muted';
    sync.className = `sync ${tone}`;
    sync.textContent = repo.error ? '' : syncText(repo);
    const state = repo.ahead && repo.behind ? '已分叉' : repo.ahead ? '可推送' : repo.behind ? '待拉取' : '已同步';
    sync.dataset.tooltip = repo.upstream ? `${state}\n${repo.upstream}\n基于最近 fetch` : sync.textContent;
    sync.setAttribute('aria-label', sync.dataset.tooltip);
    sync.hidden = !sync.textContent;
    states.hidden = dirty.hidden && sync.hidden;
    editor.disabled = terminal.disabled = remove.disabled = pending;
    updateAvatar(repo.name.includes('/') ? repo.name.split('/')[0].toLowerCase() : '');
    const counts = repo.openCounts;
    const pulls = counts?.pulls ?? 0;
    const issues = counts?.issues ?? 0;
    openButton.hidden = !pulls && !issues;
    badge.textContent = pulls && issues ? `${pulls}/${issues}` : String(pulls || issues);
    badge.className = `open-items-badge ${pulls && issues ? 'mixed' : pulls ? 'pulls' : 'issues'}`;
    openButton.dataset.tooltip = pulls && issues ? `${pulls} PR / ${issues} Issue` : pulls ? `${pulls} PR` : `${issues} Issue`;
    openButton.setAttribute('aria-label', `${repo.name}: ${pulls} Open PR, ${issues} Open Issue`);
    const pr = repo.pullRequest;
    prButton.hidden = !pr;
    if (pr) prButton.dataset.prUrl = pr.url.toLowerCase().replace(/\/$/, '');
    else delete prButton.dataset.prUrl;
    if (pr) {
      prButton.className = `icon-button ${pr.isDraft ? 'muted' : 'ahead'}`;
      prButton.querySelector('iconify-icon')!.setAttribute('icon', pr.isDraft ? 'octicon:git-pull-request-draft-16' : 'octicon:git-pull-request-16');
      prButton.setAttribute('aria-label', `#${pr.number} ${pr.title}`);
      prButton.dataset.tooltip = `${pr.isDraft ? 'Draft PR' : 'PR'} #${pr.number}\n${pr.title}`;
    }
    for (const [index, action] of gitActions.entries()) {
      const button = actionButtons[index];
      button.disabled = pending || repo.changed > 0 || !!repo.error;
      button.dataset.tooltip = `${action.label}\n${repo.changed > 0 ? '有未提交文件，请先提交或暂存到 stash' : repo.error ? '无法读取仓库状态' : action.command}`;
    }
  }

  return { element: row, signature: '', update };
}
