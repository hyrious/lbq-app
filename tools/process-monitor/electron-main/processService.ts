import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { toNonEmptyString, toNumber } from '../../../src/base/common/types.ts';
import type { ProcessEntry, ProgramGroup, ProcessSnapshot } from '../common/common.ts';

const execFileAsync = promisify(execFile);

interface RawProcess {
  pid: number;
  ppid: number;
  memory: number;
  /** Raw executable name as reported by the OS (often a file name). */
  name: string;
  path?: string;
  /** Friendly product/app name (e.g. "Windows PowerShell"), when known. */
  displayName?: string;
}

/** Upper bound so a runaway enumeration never blocks the window. */
const MAX_BUFFER = 32 * 1024 * 1024;

/** `plist` scalars are tiny; keep their buffer small and predictable. */
const PLIST_BUFFER = 1024 * 1024;

/**
 * Forces PowerShell's stdout/stderr to UTF-8. Values coming from native
 * Windows APIs (version info, process names, paths) are otherwise encoded
 * using the console's ANSI code page, which mangles non-ASCII text (e.g.
 * Chinese app names) when Node decodes the pipe as UTF-8.
 */
const UTF8_PREAMBLE = '[Console]::OutputEncoding = [System.Text.Encoding]::UTF8; $OutputEncoding = [System.Text.Encoding]::UTF8;';

const WINDOWS_PROCESS_SCRIPT = `${UTF8_PREAMBLE}
Get-CimInstance Win32_Process |
  Select-Object ProcessId,ParentProcessId,WorkingSetSize,Name,ExecutablePath |
  ConvertTo-Json -Compress`;

/**
 * Reads `FileDescription` (falling back to `ProductName`) for each executable
 * passed as a JSON array on stdin, so the friendly names come from one
 * PowerShell invocation instead of one process per file.
 */
const WINDOWS_VERSION_SCRIPT = `${UTF8_PREAMBLE}
$ErrorActionPreference = 'SilentlyContinue'
$paths = [Console]::In.ReadToEnd() | ConvertFrom-Json
$result = @{}
foreach ($path in $paths) {
  $info = [System.Diagnostics.FileVersionInfo]::GetVersionInfo($path)
  $name = if ($info.FileDescription) { $info.FileDescription } elseif ($info.ProductName) { $info.ProductName } else { $null }
  if ($name) { $result[$path] = $name }
}
$result | ConvertTo-Json -Compress`;

/**
 * Collects every visible process and folds related processes into logical
 * programs. Aggregation is platform-agnostic: the strongest signal is the
 * executable location (a macOS `.app` bundle, or the install directory on
 * Windows/Linux), with an ancestor-chain fallback so helpers spawned outside
 * that location still join their launcher.
 */
export class ProcessService {
  async snapshot(): Promise<ProcessSnapshot> {
    return aggregate(await collectProcesses());
  }
}

async function collectProcesses(): Promise<RawProcess[]> {
  switch (process.platform) {
    case 'darwin': return await collectPosix(['-axo', 'pid=,ppid=,rss=,comm=']);
    case 'linux': return await collectPosix(['-eo', 'pid=,ppid=,rss=,comm=']);
    case 'win32': return await collectWindows();
    default: return [];
  }
}

async function collectPosix(args: string[]): Promise<RawProcess[]> {
  const { stdout } = await execFileAsync('ps', args, { maxBuffer: MAX_BUFFER });
  const processes: RawProcess[] = [];
  for (const line of stdout.split('\n')) {
    const match = /^\s*(\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s*$/.exec(line);
    if (!match) continue;
    const path = match[4];
    processes.push({
      pid: Number(match[1]),
      ppid: Number(match[2]),
      memory: Number(match[3]) * 1024,
      name: baseName(path),
      path
    });
  }
  await applyMacDisplayNames(processes);
  return processes;
}

async function collectWindows(): Promise<RawProcess[]> {
  const { stdout } = await execFileAsync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-Command', WINDOWS_PROCESS_SCRIPT
  ], { maxBuffer: MAX_BUFFER });

  const output = stdout.trim();
  if (!output) return [];
  const parsed = JSON.parse(output) as unknown;
  const rows = Array.isArray(parsed) ? parsed : [parsed];
  const processes: RawProcess[] = [];
  for (const row of rows) {
    if (row == null || typeof row != 'object') continue;
    const record = row as Record<string, unknown>;
    const pid = toInteger(record.ProcessId);
    const ppid = toInteger(record.ParentProcessId);
    const memory = toInteger(record.WorkingSetSize);
    if (pid == null || ppid == null || memory == null) continue;
    processes.push({
      pid,
      ppid,
      memory,
      name: stripExecutableSuffix(toNonEmptyString(record.Name) ?? `PID ${pid}`),
      path: toNonEmptyString(record.ExecutablePath)
    });
  }
  await applyWindowsDisplayNames(processes);
  return processes;
}

/**
 * Resolves friendly names for macOS processes by reading the owning `.app`
 * bundle's `Info.plist` (`CFBundleDisplayName`, falling back to
 * `CFBundleName`). Bundles are resolved once and cached, so the periodic
 * refresh only pays the cost for newly seen apps.
 */
const macBundleNames = new Map<string, string>();

async function applyMacDisplayNames(processes: RawProcess[]): Promise<void> {
  const bundles = new Set<string>();
  for (const process_ of processes) {
    if (!process_.path) continue;
    const bundle = appBundle(process_.path);
    if (bundle && !macBundleNames.has(bundle)) bundles.add(bundle);
  }

  await Promise.all([...bundles].map(async bundle => {
    const name = await readBundleName(bundle);
    if (name) macBundleNames.set(bundle, name);
  }));

  for (const process_ of processes) {
    if (!process_.path) continue;
    const bundle = appBundle(process_.path);
    if (!bundle) continue;
    const name = macBundleNames.get(bundle);
    if (name) process_.displayName = name;
  }
}

/** Reads `CFBundleDisplayName`/`CFBundleName` from `<bundle>/Contents/Info.plist`. */
async function readBundleName(bundle: string): Promise<string | undefined> {
  const plist = `${bundle}/Contents/Info.plist`;
  try {
    // `defaults read` prints a plain scalar for a top-level string key.
    const { stdout: display } = await execFileAsync('defaults', ['read', plist, 'CFBundleDisplayName'], { maxBuffer: PLIST_BUFFER });
    const trimmed = display.trim();
    if (trimmed) return trimmed;
  } catch {
    // Key missing or plist unreadable; fall through to the bundle name.
  }
  try {
    const { stdout: name } = await execFileAsync('defaults', ['read', plist, 'CFBundleName'], { maxBuffer: PLIST_BUFFER });
    const trimmed = name.trim();
    if (trimmed) return trimmed;
  } catch {
    // Neither key is available; the caller keeps the executable name.
  }
  return undefined;
}

/**
 * Resolves friendly names for Windows processes from each executable's
 * version info (`FileDescription`, falling back to `ProductName`). The lookup
 * is batched into a single PowerShell invocation and cached per path, because
 * the per-file version query is comparatively expensive.
 */
const windowsFileNames = new Map<string, string>();

async function applyWindowsDisplayNames(processes: RawProcess[]): Promise<void> {
  const missing = new Set<string>();
  for (const process_ of processes) {
    if (process_.path && !windowsFileNames.has(process_.path)) missing.add(process_.path);
  }
  if (missing.size) {
    const resolved = await readWindowsFileNames([...missing]);
    for (const [path, name] of resolved) windowsFileNames.set(path, name);
    // Remember misses too, so unresolvable paths are not retried every tick.
    for (const path of missing) if (!windowsFileNames.has(path)) windowsFileNames.set(path, '');
  }
  for (const process_ of processes) {
    const name = process_.path ? windowsFileNames.get(process_.path) : undefined;
    if (name) process_.displayName = name;
  }
}

/** Returns a path → friendly-name map for the given executables. */
async function readWindowsFileNames(paths: readonly string[]): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  try {
    const stdout = await execFileWithInput(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', WINDOWS_VERSION_SCRIPT],
      JSON.stringify(paths)
    );
    const output = stdout.trim();
    if (!output) return result;
    const parsed = JSON.parse(output) as unknown;
    if (parsed == null || typeof parsed != 'object') return result;
    for (const [path, name] of Object.entries(parsed as Record<string, unknown>)) {
      const value = toNonEmptyString(name);
      if (value) result.set(path, value);
    }
  } catch {
    // Version info is best-effort; fall back to executable names.
  }
  return result;
}

/** Runs a command with `input` written to its stdin and returns its stdout. */
function execFileWithInput(file: string, args: readonly string[], input: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = execFile(file, args, { maxBuffer: MAX_BUFFER }, (error, stdout) => {
      if (error) reject(error);
      else resolve(stdout);
    });
    child.stdin?.end(input);
  });
}

function toInteger(value: unknown): number | undefined {
  const number = toNumber(value);
  return number == null ? undefined : Math.trunc(number);
}

/** Drops sub-64 KiB noise so the display stays readable without false precision. */
function roundMemory(bytes: number): number {
  return Math.round(bytes / (64 * 1024)) * (64 * 1024);
}

function aggregate(processes: readonly RawProcess[]): ProcessSnapshot {
  const byPid = new Map<number, RawProcess>();
  for (const process_ of processes) byPid.set(process_.pid, process_);

  const keys = new Map<number, string>();
  for (const process_ of processes) keys.set(process_.pid, programKey(process_));

  // Disjoint set over PIDs; every process starts as its own group.
  const parent = new Map<number, number>();
  const find = (pid: number): number => {
    let root = pid;
    while (parent.get(root) != null && parent.get(root) != root) root = parent.get(root)!;
    let current = pid;
    while (parent.get(current) != null && parent.get(current) != root) {
      const next = parent.get(current)!;
      parent.set(current, root);
      current = next;
    }
    return root;
  };
  const union = (left: number, right: number): void => {
    const leftRoot = find(left);
    const rightRoot = find(right);
    if (leftRoot != rightRoot) parent.set(rightRoot, leftRoot);
  };

  // Pass 1: fold processes that resolve to the same executable location.
  const ownerByKey = new Map<string, number>();
  for (const process_ of processes) {
    const key = keys.get(process_.pid)!;
    const owner = ownerByKey.get(key);
    if (owner == null) ownerByKey.set(key, process_.pid);
    else union(owner, process_.pid);
  }

  // Pass 2: adopt a process into an ancestor's group only when they already
  // resolve to the same program (same bundle or install location). This catches
  // helpers whose own executable lives elsewhere but are named after their
  // launcher, without letting a shared service host swallow unrelated children.
  for (const process_ of processes) {
    const seen = new Set<number>([process_.pid]);
    let ancestor = byPid.get(process_.ppid);
    while (ancestor && !seen.has(ancestor.pid)) {
      seen.add(ancestor.pid);
      if (keys.get(ancestor.pid) == keys.get(process_.pid)) {
        union(process_.pid, ancestor.pid);
        break;
      }
      ancestor = byPid.get(ancestor.ppid);
    }
  }

  const buckets = new Map<number, RawProcess[]>();
  for (const process_ of processes) {
    const root = find(process_.pid);
    const bucket = buckets.get(root);
    if (bucket) bucket.push(process_);
    else buckets.set(root, [process_]);
  }

  let totalMemory = 0;
  const programs: ProgramGroup[] = [];
  for (const [root, members] of buckets) {
    let memory = 0;
    for (const member of members) memory += member.memory;
    totalMemory += memory;

    // Prefer the member whose key matches the group key so the display name
    // reflects the launcher rather than an arbitrary helper.
    const key = keys.get(root)!;
    const representative = members.find(member => keys.get(member.pid) == key) ?? members[0];
    const entries: ProcessEntry[] = members
      .map(member => ({
        pid: member.pid,
        memory: roundMemory(member.memory),
        name: member.displayName ?? member.name,
        path: member.path
      }))
      .sort((left, right) => right.memory - left.memory);
    programs.push({
      key,
      name: displayName(key, representative),
      memory: roundMemory(memory),
      processCount: members.length,
      processes: entries
    });
  }
  programs.sort((left, right) => right.memory - left.memory || left.name.localeCompare(right.name));
  return { totalMemory: roundMemory(totalMemory), programs };
}

/**
 * Produces the grouping key for one process. macOS apps collapse to their
 * `.app` bundle; everywhere else the install directory plus a normalized
 * executable name is used when an executable path is available.
 *
 * Paths are treated separator-agnostically so the key does not depend on
 * which platform computes it.
 */
function programKey(process_: RawProcess): string {
  const path = process_.path;
  if (path) {
    const bundle = appBundle(path);
    if (bundle) return bundle;
    const directory = directoryOf(path);
    if (directory) return `${directory}/${normalizeName(baseName(path))}`;
  }
  return normalizeName(process_.name);
}

/** Returns the outermost macOS `.app` bundle path, if any. */
function appBundle(path: string): string | undefined {
  const suffix = '.app';
  const index = path.indexOf(`${suffix}/`);
  if (index >= 0) return path.slice(0, index + suffix.length);
  return path.endsWith(suffix) ? path : undefined;
}

function baseName(path: string): string {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index >= 0 ? path.slice(index + 1) : path;
}

function directoryOf(path: string): string | undefined {
  const index = Math.max(path.lastIndexOf('/'), path.lastIndexOf('\\'));
  return index > 0 ? path.slice(0, index) : undefined;
}

/** Strips the Windows executable suffix so names read as applications. */
function stripExecutableSuffix(name: string): string {
  return name.replace(/\.exe$/i, '');
}

/** Strips helper/version suffixes so sibling binaries collapse together. */
function normalizeName(name: string): string {
  const stripped = stripExecutableSuffix(name)
    .replace(/[-_. ]?(helper|renderer|gpu|utility|crashpad|service)(?: \(\w+\))?$/i, '')
    .replace(/[-_. ]?\d+(?:\.\d+)*$/, '')
    .trim();
  return (stripped || name).toLowerCase();
}

function displayName(key: string, representative: RawProcess): string {
  const base = baseName(key);
  if (base.endsWith('.app')) return base.slice(0, -'.app'.length);
  // Prefer the OS-provided product name so the group reads like an application
  // ("Visual Studio Code") instead of a file name ("Code").
  if (representative.displayName) return representative.displayName;
  const name = representative.path ? baseName(representative.path) : representative.name;
  const cleaned = stripExecutableSuffix(name)
    .replace(/[-_. ]?(helper|renderer|gpu|utility|crashpad|service)(?: \(\w+\))?$/i, '')
    .trim();
  return cleaned || base;
}
