import { app, shell } from 'electron';
import { execFile } from 'node:child_process';
import { readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { toNonEmptyString, toPlainObject } from '../../src/base/common/types.ts';
import type { Plugin } from '../../src/runtime/electron-main/plugin.ts';
import type { GitHubInboxRpc, NotificationItem } from './common/common.ts';

const execFileAsync = promisify(execFile);

class InboxStore {
  private readonly path: string;
  private readonly temporaryPath: string;
  private write = Promise.resolve();

  constructor(path: string) {
    this.path = path;
    this.temporaryPath = `${path}.tmp`;
  }

  async load(): Promise<unknown> {
    try {
      const state = toPlainObject(JSON.parse(await readFile(this.path, 'utf8')));
      return state?.version == 1 && Array.isArray(state.items) ? state.items : [];
    } catch {
      return [];
    }
  }

  save(items: readonly NotificationItem[]): Promise<void> {
    const contents = JSON.stringify({ version: 1, items });
    const nextWrite = this.write.then(async () => {
      await writeFile(this.temporaryPath, contents);
      await rename(this.temporaryPath, this.path);
    });
    this.write = nextWrite.catch(() => {});
    return nextWrite;
  }
}

async function getToken(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('gh', ['auth', 'token'], { encoding: 'utf8' });
    const token = stdout.trim();
    if (!token) throw new Error('empty token');
    return token;
  } catch {
    throw new Error('未找到 GitHub 登录。请先运行 gh auth login。');
  }
}

async function openExternal(value: unknown): Promise<void> {
  const string = toNonEmptyString(value);
  if (!string) throw new Error('GitHub 地址无效。');
  const url = new URL(string);
  if (url.protocol != 'https:' && url.protocol != 'http:') throw new Error('仅可打开网页地址。');
  await shell.openExternal(url.href);
}

export const plugin: Plugin = {
  id: 'github-inbox',
  name: 'GitHub Inbox',
  window: {
    entry: 'browser/index.html',
    width: 544,
    height: 416,
    minWidth: 440,
    minHeight: 320,
    hideOnClose: true,
    vibrancy: 'under-window'
  },
  activate(context) {
    const inbox = new InboxStore(join(app.getPath('userData'), 'github-inbox.json'));
    context.bindIpc<GitHubInboxRpc>({
      getToken: () => getToken(),
      loadInbox: () => inbox.load(),
      openExternal: input => openExternal(input?.url),
      saveInbox: input => inbox.save(input)
    });
  }
};
