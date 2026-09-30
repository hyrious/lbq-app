import { execFile } from 'node:child_process';
import { readFile, realpath, rename, stat, writeFile } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { promisify } from 'node:util';
import { commandText, type Action, type CommandResult, type Repository } from '../common/common.ts';
import { OpenItems } from './openItems.ts';
import { PullRequests } from './pullRequests.ts';

const exec = promisify(execFile);

async function git(path: string, ...args: string[]): Promise<string> {
  const result = await exec('git', args, {
    cwd: path, encoding: 'utf8', timeout: 120000, maxBuffer: 8 * 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
  });
  return result.stdout;
}

export async function snapshot(path: string): Promise<Repository> {
  const repo: Repository = {
    path,
    name: basename(path),
    remote: '',
    branch: '',
    changed: 0,
    upstream: '',
    ahead: 0,
    behind: 0,
    fetchedAt: 0,
    error: '',
    pullRequest: undefined,
    openCounts: undefined
  };
  try {
    const remotes = (await git(path, 'remote')).trim().split('\n').filter(Boolean);
    const remote = remotes.includes('origin') ? 'origin' : remotes[0];
    if (remote) {
      const address = (await git(path, 'remote', 'get-url', remote)).trim();
      repo.remote = address;
      repo.name = repositoryName(address) || repo.name;
    }
    const output = await git(path, 'status', '--porcelain=v2', '--branch', '-z', '--untracked-files=all');
    const records = output.split('\0');
    for (let i = 0; i < records.length; i++) {
      const record = records[i];
      if (record.startsWith('# branch.head ')) repo.branch = record.slice(14);
      else if (record.startsWith('# branch.upstream ')) repo.upstream = record.slice(18);
      else if (record.startsWith('# branch.ab ')) {
        const match = /\+(\d+) -(\d+)/.exec(record);
        if (match) {
          repo.ahead = Number(match[1]);
          repo.behind = Number(match[2]);
        }
      } else if (/^[12u?] /.test(record)) {
        repo.changed++;
        if (record.startsWith('2 ')) i++;
      }
    }
    const fetchPath = (await git(path, 'rev-parse', '--git-path', 'FETCH_HEAD')).trim();
    repo.fetchedAt = await stat(resolve(path, fetchPath)).then(value => value.mtimeMs, () => 0);
  } catch (error) {
    repo.error = error.message;
  }
  return repo;
}

export function repositoryName(address: string): string {
  let path = '';
  if (address.includes('://')) {
    try {
      const url = new URL(address);
      if (url.protocol != 'file:') path = url.pathname;
    } catch {}
  } else {
    path = /^(?:[^@/]+@)?[^:/]+:(.+)$/.exec(address)?.[1] ?? '';
  }
  const parts = path.replace(/\.git\/?$/, '').split('/').filter(Boolean);
  return parts.length >= 2 ? parts.slice(-2).join('/') : '';
}

interface ReposData {
  version: number;
  paths: string[];
  lastDirectory?: string;
}

export class Repos {
  private readonly openItems = new OpenItems();
  private readonly pullRequests = new PullRequests();
  private readonly busy = new Set<string>();
  private write = Promise.resolve();
  private readonly file: string;

  constructor(file: string) {
    this.file = file;
  }

  private async read(): Promise<ReposData> {
    try {
      const data = JSON.parse(await readFile(this.file, 'utf8'));
      if (data.version != 1 || !Array.isArray(data.paths) || !data.paths.every((path: unknown) => typeof path == 'string')) {
        throw new Error('repos.json 格式无效');
      }
      return { version: 1, paths: data.paths, lastDirectory: typeof data.lastDirectory == 'string' ? data.lastDirectory : undefined };
    } catch (error) {
      if (error.code == 'ENOENT') return { version: 1, paths: [], lastDirectory: undefined };
      throw error;
    }
  }

  private async paths(): Promise<string[]> {
    return (await this.read()).paths;
  }

  async lastDirectory(): Promise<string | undefined> {
    await this.write;
    return (await this.read()).lastDirectory;
  }

  async list(): Promise<Repository[]> {
    await this.write;
    const repos = await Promise.all((await this.paths()).map(snapshot));
    for (const repo of repos) {
      repo.pullRequest = this.pullRequests.get(repo);
      repo.openCounts = this.openItems.get(repo);
    }
    return repos;
  }

  async listOpenItems(path: string) {
    if (!(await this.paths()).includes(path)) throw new Error('项目不在列表中');
    return this.openItems.list(await snapshot(path));
  }

  private update(change: (paths: string[]) => string[], lastDirectory?: string): Promise<void> {
    const next = this.write.then(async () => {
      const data = await this.read();
      data.paths = change(data.paths);
      if (lastDirectory != undefined) data.lastDirectory = lastDirectory;
      await writeFile(`${this.file}.tmp`, JSON.stringify(data, null, 2) + '\n');
      await rename(`${this.file}.tmp`, this.file);
    });
    this.write = next.catch(() => {});
    return next;
  }

  async add(path: string): Promise<void> {
    let root: string;
    try {
      root = await realpath((await git(path, 'rev-parse', '--show-toplevel')).trim());
    } catch (error) {
      throw new Error(`无法添加：所选文件夹不是可访问的 Git 项目。\n${path}\n\n${error.message}`);
    }
    await this.update(paths => paths.includes(root) ? paths : [...paths, root], dirname(path));
  }

  async remove(path: string): Promise<void> {
    if (this.busy.has(path)) throw new Error('项目正在执行命令');
    await this.update(paths => paths.filter(item => item != path));
  }

  reorder(order: string[]): Promise<void> {
    return this.update(paths => {
      if (!Array.isArray(order) || order.length != paths.length || new Set(order).size != paths.length
          || !order.every(path => paths.includes(path))) {
        throw new Error('项目列表已变化，请重试排序');
      }
      return order;
    });
  }

  async run(path: string, action: Action): Promise<CommandResult> {
    if (!(await this.paths()).includes(path)) throw new Error('项目不在列表中');
    if (this.busy.has(path)) throw new Error('项目正在执行命令');
    this.busy.add(path);
    let output = '';
    const commands: string[] = [];
    const step = async (file: string, ...args: string[]) => {
      const command = commandText(file, args);
      commands.push(command);
      output += `${command}\n`;
      const result = await exec(file, args, {
        cwd: path, encoding: 'utf8', timeout: file == 'smerge' ? 15000 : 120000,
        maxBuffer: 8 * 1024 * 1024, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' }
      });
      output += result.stdout + result.stderr;
      if (!output.endsWith('\n')) output += '\n';
    };
    try {
      if (action == 'pull' || action == 'clean') {
        const repo = await snapshot(path);
        if (repo.error) throw new Error(`无法读取仓库状态：${repo.error}`);
        if (repo.changed > 0) throw new Error('有未提交文件，请先提交或暂存到 stash');
      }
      switch (action) {
        case 'open':
          await step('smerge', path);
          break;
        case 'sublime':
          await step(process.platform == 'win32' ? 'subl.exe' : 'subl', path);
          break;
        case 'vscode': {
          let executable = 'code';
          if (process.platform == 'win32') {
            const { stdout } = await exec('where.exe', ['code.cmd'], { encoding: 'utf8', timeout: 15000 });
            executable = join(dirname(dirname(stdout.trim().split(/\r?\n/)[0])), 'Code.exe');
          }
          await step(executable, path);
          break;
        }
        case 'terminal':
          if (process.platform == 'darwin') {
            await step('osascript', join(import.meta.dirname, 'iterm.applescript'), path);
          } else if (process.platform == 'win32') {
            const executable = process.env.LOCALAPPDATA
              ? join(process.env.LOCALAPPDATA, 'Microsoft', 'WindowsApps', 'wt.exe')
              : 'wt.exe';
            await step(executable, '-d', path);
          } else {
            await step('x-terminal-emulator', '--working-directory', path);
          }
          break;
        case 'pull':
          await step('git', 'pull', '--prune');
          break;
        case 'clean': {
          await step('git', 'fetch', '--all', '--tags', '--prune', '--jobs=10');
          await step('git', 'branch', '-f', 'main', 'origin/main');
          await step('git', 'switch', 'main');
          const output = await git(path, 'for-each-ref', '--format=%(refname:short)', 'refs/heads/');
          const branches = output.trim().split('\n').filter(branch => branch && branch != 'main');
          if (branches.length) await step('git', 'branch', '-D', '--', ...branches);
          break;
        }
        default:
          throw new Error('未知操作');
      }
      return { command: commands.join(' && '), output, failed: false };
    } catch (error) {
      return { command: commands.join(' && '), output: output + (error.stdout || '') + (error.stderr || error.message), failed: true };
    } finally {
      this.busy.delete(path);
    }
  }
}
