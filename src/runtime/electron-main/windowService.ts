import { app, BrowserWindow, shell } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { DisposableStore, toDisposable, type IDisposable } from '../../base/common/lifecycle.ts';
import { toNumber, toPlainObject } from '../../base/common/types.ts';
import type { IpcRouter } from '../../platform/ipc/electron-main/ipcRouter.ts';
import type { Plugin, PluginWindowOptions } from './plugin.ts';

interface WindowState {
  x?: number;
  y?: number;
  width: number;
  height: number;
}

export interface PluginWindow extends IDisposable {
  readonly browserWindow: BrowserWindow;
}

export class WindowService {
  private readonly userDataPath: string;
  private readonly preloadPath: string;
  private readonly ipcRouter: IpcRouter;

  constructor(userDataPath: string, preloadPath: string, ipcRouter: IpcRouter) {
    this.userDataPath = userDataPath;
    this.preloadPath = preloadPath;
    this.ipcRouter = ipcRouter;
  }

  async open(plugin: Plugin, onClosed: () => void): Promise<PluginWindow> {
    const store = new DisposableStore();
    const statePath = join(this.userDataPath, `window-state-${plugin.id}.json`);
    const state = await this.readState(statePath, plugin.window);
    const window = new BrowserWindow({
      autoHideMenuBar: true,
      ...state,
      minWidth: plugin.window.minWidth,
      minHeight: plugin.window.minHeight,
      backgroundColor: '#00000000',
      titleBarStyle: plugin.window.titleBarStyle,
      vibrancy: process.platform == 'darwin' ? plugin.window.vibrancy : undefined,
      visualEffectState: process.platform == 'darwin' && plugin.window.vibrancy ? 'active' : undefined,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    store.add(this.ipcRouter.registerWebContents(plugin.id, window.webContents));
    let saveTimeout: NodeJS.Timeout | undefined;
    const saveState = () => {
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => void writeFile(statePath, JSON.stringify(window.getBounds())), 500);
    };
    window.on('moved', saveState);
    window.on('resized', saveState);
    store.add(toDisposable(() => {
      clearTimeout(saveTimeout);
      window.removeListener('moved', saveState);
      window.removeListener('resized', saveState);
    }));
    window.webContents.setWindowOpenHandler(details => {
      void shell.openExternal(details.url);
      return { action: 'deny' };
    });
    if (plugin.window.hideOnClose) {
      window.on('close', event => {
        event.preventDefault();
        window.hide();
      });
    }

    const closed = () => {
      store.dispose();
      onClosed();
    };
    window.once('closed', closed);
    store.add(toDisposable(() => window.removeListener('closed', closed)));

    if (!app.isPackaged) window.webContents.openDevTools({ mode: 'detach' });
    try {
      await window.loadURL(`app-file://${plugin.id}/${encodeURI(plugin.window.entry)}`);
    } catch (error) {
      window.destroy();
      throw error;
    }

    return {
      browserWindow: window,
      dispose() {
        if (!window.isDestroyed()) window.destroy();
        store.dispose();
      }
    };
  }

  private async readState(path: string, options: PluginWindowOptions): Promise<WindowState> {
    try {
      const value = toPlainObject(JSON.parse(await readFile(path, 'utf8')));
      const width = toNumber(value?.width);
      const height = toNumber(value?.height);
      if (width != null && height != null) return { x: toNumber(value?.x), y: toNumber(value?.y), width, height };
    } catch {}
    return { width: options.width, height: options.height };
  }
}
