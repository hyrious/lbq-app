import { app, BrowserWindow, shell } from 'electron';
import { readFileSync } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { DisposableStore, toDisposable, type IDisposable } from '../../base/common/lifecycle.ts';
import { toNumber, toPlainObject } from '../../base/common/types.ts';
import type { IpcRouter } from '../../platform/ipc/electron-main/ipcRouter.ts';
import { fixWindowsDevToolsFonts } from './devToolsFontFix.ts';
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
  private chromeCssCache: string | undefined;

  constructor(userDataPath: string, preloadPath: string, ipcRouter: IpcRouter) {
    this.userDataPath = userDataPath;
    this.preloadPath = preloadPath;
    this.ipcRouter = ipcRouter;
  }

  async open(plugin: Plugin, onClosed: () => void): Promise<PluginWindow> {
    const store = new DisposableStore();
    const statePath = join(this.userDataPath, `window-state-${plugin.id}.json`);
    const state = await this.readState(statePath, plugin.window);
    const inset = process.platform == 'darwin';
    const window = new BrowserWindow({
      autoHideMenuBar: true,
      icon: join(resolve(import.meta.dirname, '../../..'), 'icon.png'),
      ...state,
      minWidth: plugin.window.minWidth,
      minHeight: plugin.window.minHeight,
      backgroundColor: '#00000000',
      titleBarStyle: inset ? 'hiddenInset' : undefined,
      vibrancy: inset ? plugin.window.vibrancy : undefined,
      visualEffectState: inset && plugin.window.vibrancy ? 'active' : undefined,
      webPreferences: {
        preload: this.preloadPath,
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        defaultFontFamily: {
          standard: 'Noto Sans SC',
          serif: 'Noto Serif SC',
          sansSerif: 'Noto Sans SC',
          monospace: 'Cascadia Mono'
        }
      }
    });

    store.add(this.ipcRouter.registerWebContents(plugin.id, window.webContents));
    fixWindowsDevToolsFonts(window);
    const injectChrome = () => void window.webContents.insertCSS(this.chromeCss());
    window.webContents.on('dom-ready', injectChrome);
    store.add(toDisposable(() => window.webContents.removeListener('dom-ready', injectChrome)));

    window.webContents.on('before-input-event', (event, input) => {
      if (input.type == 'keyDown') {
        if (input.key == 'F12') {
          event.preventDefault();
          window.webContents.toggleDevTools();
        }
      }
    });

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
      // `destroy()` emits 'closed' synchronously; dispose defensively so a
      // failure while tearing down resources cannot escape into Electron's
      // event loop and crash the main process.
      try {
        store.dispose();
      } catch (error) {
        console.error(`Failed to dispose window resources for plugin: ${plugin.id}`, error);
      }
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
        window.removeListener('closed', closed);
        if (!window.isDestroyed()) window.destroy();
        try {
          store.dispose();
        } catch (error) {
          console.error(`Failed to dispose window resources for plugin: ${plugin.id}`, error);
        }
      }
    };
  }

  private chromeCss(): string {
    return this.chromeCssCache ??= readFileSync(join(resolve(import.meta.dirname, '../../..'), 'tools/shared/window-chrome.css'), 'utf8');
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
