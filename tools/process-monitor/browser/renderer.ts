import { createInvoke, element, formatBytes, getElement, showToast } from 'app-file://shared/renderer.ts';
import { bestScore, highlight } from 'app-file://shared/quick-match.ts';
import type { ProgramGroup, ProcessMonitorRpc, ProcessSnapshot } from '../common/common.ts';

const invoke = createInvoke<ProcessMonitorRpc>();

interface ProgramNode {
  readonly root: HTMLDivElement;
  readonly key: string;
  readonly name: HTMLSpanElement;
  readonly count: HTMLSpanElement;
  readonly memory: HTMLSpanElement;
  readonly fill: HTMLElement;
  program: ProgramGroup;
  scale: number;
  /** Fingerprint of the last rendered contents, so unchanged rows stay put. */
  signature: string;
  children: HTMLDivElement | undefined;
  readonly childNodes: Map<number, ChildNode>;
}

interface ChildNode {
  readonly root: HTMLDivElement;
  readonly name: HTMLSpanElement;
  readonly pid: HTMLSpanElement;
  readonly memory: HTMLSpanElement;
}

/** One visible program row, resolved before any DOM work happens. */
interface ProgramRow {
  readonly program: ProgramGroup;
  readonly expandable: boolean;
  readonly showChildren: boolean;
  readonly signature: string;
}

const list = getElement<HTMLDivElement>('list');
const empty = getElement<HTMLParagraphElement>('empty');
const summary = getElement<HTMLSpanElement>('summary');
const search = getElement<HTMLInputElement>('search');
const expanded = new Set<string>();
const nodes = new Map<string, ProgramNode>();

let snapshot: ProcessSnapshot = { totalMemory: 0, programs: [] };
let renderedView = '';
let refreshTimer: ReturnType<typeof setInterval> | undefined;

search.oninput = () => render(snapshot);
search.onkeydown = event => {
  if (event.key == 'Escape' && search.value) {
    event.preventDefault();
    search.value = '';
    render(snapshot);
  }
};

void refresh();
refreshTimer = setInterval(() => void refresh(), 3000);
window.addEventListener('beforeunload', () => clearInterval(refreshTimer));

async function refresh() {
  try {
    snapshot = await invoke('listProcesses', undefined);
    render(snapshot);
  } catch (error) {
    console.error(error);
    if (!list.childElementCount) empty.textContent = '无法读取进程列表。';
    showToast(error instanceof Error ? error.message : String(error), 'error');
  }
}

/**
 * Reconciles the list against the latest snapshot. The DOM is only touched
 * when the visible text or bar actually changes, so a poll that only nudges
 * memory within the displayed precision stays a no-op, while a keystroke can
 * refresh the list on demand.
 */
function render(snapshot: ProcessSnapshot) {
  const query = search.value.trim();
  const programs = query ? rankPrograms(query, snapshot.programs) : snapshot.programs;
  const scale = Math.max(1, snapshot.programs[0]?.memory ?? 1);

  const rows = programs.map(program => {
    const expandable = program.processCount > 1;
    if (!expandable) expanded.delete(program.key);
    const showChildren = expandable && expanded.has(program.key);
    return { program, expandable, showChildren, signature: rowKey(program, query, scale, showChildren) };
  });

  const summaryText = `共 ${snapshot.programs.length} 个程序 · ${formatBytes(snapshot.totalMemory)}`;
  const view = [summaryText, query, ...rows.map(row => row.signature)].join('\u0001');
  if (view == renderedView) return;
  renderedView = view;

  setText(summary, summaryText);
  const present = new Set(programs.map(program => program.key));
  for (const [key, node] of nodes) {
    if (present.has(key)) continue;
    node.root.remove();
    nodes.delete(key);
    expanded.delete(key);
  }

  // Reconcile in order. Each node must sit directly after the node emitted
  // before it; only nodes that are out of place get moved.
  let previous: HTMLElement | null = null;
  for (const row of rows) {
    const node = patchProgram(row, scale, query);
    const inPlace = previous ? previous.nextElementSibling === node.root : list.firstElementChild === node.root;
    if (!inPlace) list.insertBefore(node.root, previous ? previous.nextElementSibling : list.firstElementChild);
    previous = node.root;
  }

  empty.classList.toggle('hidden', programs.length > 0);
  if (!programs.length) empty.textContent = query ? '没有匹配的程序。' : '没有可显示的进程。';
}

/** Ranks the program names with the shared fuzzy matcher, dropping non-matches. */
function rankPrograms(query: string, programs: readonly ProgramGroup[]): ProgramGroup[] {
  return programs
    .map(program => ({ program, score: bestScore(query, [program.name]) }))
    .filter(({ score }) => score > -Infinity)
    .sort((left, right) => right.score - left.score)
    .map(({ program }) => program);
}

/** Fingerprints one row from the text it renders, not its raw numbers. */
function rowKey(program: ProgramGroup, query: string, scale: number, showChildren: boolean): string {
  const bar = Math.max(2, Math.round(program.memory / scale * 100));
  const children = showChildren
    ? program.processes.map(process_ => `${process_.pid}\u0000${process_.name}\u0000${formatBytes(process_.memory)}`).join('\u0001')
    : '';
  return [
    query,
    program.name,
    program.processCount > 1 ? `${program.processCount} 个进程` : '',
    formatBytes(program.memory),
    bar,
    program.processes[0]?.path ?? '',
    children
  ].join('\u0002');
}

function patchProgram(row: ProgramRow, scale: number, query: string): ProgramNode {
  const { program, expandable, showChildren } = row;
  let node = nodes.get(program.key);
  if (!node) {
    node = createProgram(program);
    nodes.set(program.key, node);
  }
  if (node.signature == row.signature) return node;
  node.signature = row.signature;

  node.name.replaceChildren(...highlight(query, program.name));
  const path = program.processes[0]?.path;
  if (path) node.name.title = path;
  else node.name.removeAttribute('title');

  node.root.classList.toggle('expandable', expandable);
  setText(node.count, expandable ? `${program.processCount} 个进程` : '');
  setText(node.memory, formatBytes(program.memory));
  node.fill.style.width = `${Math.max(2, Math.round(program.memory / scale * 100))}%`;

  node.program = program;
  node.scale = scale;
  patchChildren(node, showChildren);
  return node;
}

function patchChildren(node: ProgramNode, show: boolean) {
  if (!show) {
    if (node.children) {
      node.children.remove();
      node.children = undefined;
      node.childNodes.clear();
    }
    return;
  }

  const program = node.program;
  const children = node.children ??= element('div', 'children');
  if (!node.root.contains(children)) {
    node.root.append(children);
  }

  for (const process_ of program.processes) {
    let child = node.childNodes.get(process_.pid);
    if (!child) {
      child = createChild();
      node.childNodes.set(process_.pid, child);
    }
    setText(child.name, process_.name);
    setText(child.pid, `#${process_.pid}`);
    setText(child.memory, formatBytes(process_.memory));
  }

  const live = new Set(program.processes.map(process_ => process_.pid));
  for (const [pid, child] of node.childNodes) {
    if (live.has(pid)) continue;
    child.root.remove();
    node.childNodes.delete(pid);
  }

  let previous: HTMLElement | null = null;
  for (const process_ of program.processes) {
    const child = node.childNodes.get(process_.pid)!;
    const inPlace = previous ? previous.nextElementSibling === child.root : children.firstElementChild === child.root;
    if (!inPlace) children.insertBefore(child.root, previous ? previous.nextElementSibling : children.firstElementChild);
    previous = child.root;
  }
}

function createProgram(program: ProgramGroup): ProgramNode {
  const root = element('div', 'program');
  const row = element('div', 'row');
  row.setAttribute('role', 'listitem');

  const name = element('span', 'name');
  const count = element('span', 'count');
  const memory = element('span', 'memory');
  const bar = element('span', 'bar');
  const fill = element('i');
  bar.append(fill);
  row.append(name, count, memory, bar);
  root.append(row);

  const node: ProgramNode = {
    root, key: program.key, name, count, memory, fill,
    program, scale: 1, signature: '', children: undefined, childNodes: new Map()
  };

  row.addEventListener('click', () => {
    if (!root.classList.contains('expandable')) return;
    if (expanded.has(node.key)) expanded.delete(node.key);
    else expanded.add(node.key);
    render(snapshot);
  });

  return node;
}

function createChild(): ChildNode {
  const root = element('div', 'child');
  const name = element('span', 'child-name');
  const pid = element('span', 'child-pid');
  const memory = element('span', 'child-memory');
  root.append(name, pid, memory);
  return { root, name, pid, memory };
}

function setText(element: HTMLElement, value: string) {
  if (element.textContent !== value) element.textContent = value;
}
