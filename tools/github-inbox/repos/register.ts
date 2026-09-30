import { app, BrowserWindow, clipboard, dialog, net, shell } from 'electron';
import { join } from 'node:path';
import type { PluginContext } from '../../../src/runtime/electron-main/plugin.ts';
import type { ReposRpc } from './common/common.ts';
import { AvatarCache } from './electron-main/avatars.ts';
import { Repos } from './electron-main/repos.ts';

export function registerRepos(context: PluginContext): void {
  const repos = new Repos(join(app.getPath('userData'), 'repos.json'));
  const avatars = new AvatarCache(join(app.getPath('userData'), 'repos-avatars'), url =>
    net.fetch(url, { signal: AbortSignal.timeout(15000) }));
  context.bindIpc<ReposRpc>({
    reposOpenItems: input => repos.listOpenItems(input),
    reposHome: () => app.getPath('home'),
    reposList: () => repos.list(),
    reposAvatar: owner => avatars.get(owner),
    reposAdd: async () => {
      const options: Electron.OpenDialogOptions = {
        title: '添加 Git 项目',
        properties: ['openDirectory'],
        defaultPath: await repos.lastDirectory()
      };
      const window = BrowserWindow.getFocusedWindow();
      const selection = await (window ? dialog.showOpenDialog(window, options) : dialog.showOpenDialog(options));
      if (selection.canceled || !selection.filePaths.length) return undefined;
      const path = selection.filePaths[0];
      await repos.add(path);
      return path;
    },
    reposRemove: input => repos.remove(input),
    reposReorder: input => repos.reorder(input),
    reposOpenItem: async input => {
      const url = new URL(input);
      if (url.protocol != 'https:' || url.hostname != 'github.com' || !/^\/[^/]+\/[^/]+\/(pull|issues)\/\d+$/.test(url.pathname)) {
        throw new Error('GitHub 地址无效');
      }
      await shell.openExternal(url.href);
    },
    reposRun: input => repos.run(input.path, input.action),
    reposCopy: input => {
      if (typeof input != 'string') throw new Error('复制内容无效');
      return clipboard.writeText(input);
    }
  });
}
