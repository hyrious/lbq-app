import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { shell } from 'electron';
import { toNonEmptyString } from '../../src/base/common/types.ts';
import type { Plugin } from '../../src/runtime/electron-main/plugin.ts';
import type { GitHubInboxRpc } from './common.ts';

const execFileAsync = promisify(execFile);

async function getToken(): Promise<string> {
  try {
    const { stdout } = await execFileAsync('/bin/zsh', ['-lc', 'gh auth token --hostname github.com'], { encoding: 'utf8' });
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
    entry: 'index.html',
    width: 544,
    height: 416,
    minWidth: 440,
    minHeight: 320,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window'
  },
  activate(context) {
    context.bindIpc<GitHubInboxRpc>({
      getToken: () => getToken(),
      openExternal: input => openExternal(input?.url)
    });
  }
};
