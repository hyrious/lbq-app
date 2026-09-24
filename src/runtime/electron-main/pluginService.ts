import { readFile, readdir, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app } from 'electron';
import { DisposableStore, type IDisposable } from '../../base/common/lifecycle.ts';
import { Emitter, type Event } from '../../base/common/event.ts';
import { isFunction, toBoolean, toNonEmptyString, toNumber, toPlainObject, toString } from '../../base/common/types.ts';
import type { InstantiationService } from '../../platform/instantiation/common/instantiation.ts';
import type { IpcHandlers, IpcRouter } from '../../platform/ipc/electron-main/ipcRouter.ts';
import type { Plugin, PluginContext, PluginPlatform } from './plugin.ts';
import type { PluginWindow, WindowService } from './windowService.ts';

interface PluginModule {
  plugin?: unknown;
}

interface PluginRecord {
  readonly plugin: Plugin;
  activation?: Promise<PluginSession>;
  opening?: Promise<void>;
  window?: PluginWindow;
}

interface PluginSession extends IDisposable {
}

export interface PluginInfo {
  readonly id: string;
  readonly name: string;
  readonly alive: boolean;
}

export class PluginService implements IDisposable {
  private readonly records = new Map<string, PluginRecord>();
  private readonly onDidChangePluginsEmitter = new Emitter<readonly PluginInfo[]>();
  private readonly toolsRoot: string;
  private readonly rootServices: InstantiationService;
  private readonly ipcRouter: IpcRouter;
  private readonly windowService: WindowService;
  private readonly windowStatePath: string;
  private readonly temporaryWindowStatePath: string;
  private readonly restorableIds = new Set<string>();
  private stateWrite = Promise.resolve();
  private disposing = false;
  readonly onDidChangePlugins: Event<readonly PluginInfo[]> = this.onDidChangePluginsEmitter.event;

  constructor(toolsRoot: string, rootServices: InstantiationService, ipcRouter: IpcRouter, windowService: WindowService) {
    this.toolsRoot = toolsRoot;
    this.rootServices = rootServices;
    this.ipcRouter = ipcRouter;
    this.windowService = windowService;
    this.windowStatePath = join(app.getPath('userData'), 'open-plugin-windows.json');
    this.temporaryWindowStatePath = `${this.windowStatePath}.tmp`;
  }

  async discover(): Promise<void> {
    const storedIds = await this.readRestorableIds();
    const entries = await readdir(this.toolsRoot, { withFileTypes: true });
    for (const entry of entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const module = await import(pathToFileURL(join(this.toolsRoot, entry.name, 'plugin.ts')).href) as PluginModule;
      const plugin = this.assertPlugin(module.plugin, entry.name);
      if (plugin.platform && !plugin.platform.includes(process.platform as PluginPlatform)) continue;
      if (this.records.has(plugin.id)) throw new Error(`Duplicate plugin identifier: ${plugin.id}`);
      this.records.set(plugin.id, { plugin });
    }
    for (const id of storedIds) if (this.records.has(id)) this.restorableIds.add(id);
    if (this.restorableIds.size != storedIds.size) this.saveRestorableIds();
    this.fireDidChangePlugins();
    await Promise.all([...this.restorableIds].map(id => this.open(id).catch(error => {
      this.setRestorable(id, false);
      console.error(`Failed to restore plugin window: ${id}`, error);
    })));
  }

  getPlugins(): readonly PluginInfo[] {
    return [...this.records.values()].map(record => ({
      id: record.plugin.id,
      name: record.plugin.name,
      alive: record.window != null && !record.window.browserWindow.isDestroyed()
    }));
  }

  async open(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown plugin: ${id}`);
    if (record.window && !record.window.browserWindow.isDestroyed()) {
      if (record.window.browserWindow.isMinimized()) record.window.browserWindow.restore();
      record.window.browserWindow.show();
      record.window.browserWindow.focus();
      this.setRestorable(id, true);
      return;
    }

    if (!record.opening) {
      const opening = this.openWindow(record).finally(() => {
        if (record.opening == opening) record.opening = undefined;
      });
      record.opening = opening;
    }
    await record.opening;
  }

  private async openWindow(record: PluginRecord): Promise<void> {
    const session = await this.activate(record);
    try {
      record.window = await this.windowService.open(record.plugin, () => {
        record.window = undefined;
        this.setRestorable(record.plugin.id, false);
        this.deactivate(record);
        this.fireDidChangePlugins();
      });
      record.window.browserWindow.on('hide', () => this.setRestorable(record.plugin.id, false));
      this.setRestorable(record.plugin.id, true);
      this.fireDidChangePlugins();
    } catch (error) {
      session.dispose();
      record.activation = undefined;
      throw error;
    }
  }

  dispose(): void {
    this.disposing = true;
    for (const record of this.records.values()) {
      record.window?.dispose();
      this.deactivate(record);
    }
    this.records.clear();
    this.onDidChangePluginsEmitter.dispose();
  }

  private activate(record: PluginRecord): Promise<PluginSession> {
    if (record.activation) return record.activation;
    const store = new DisposableStore();
    const services = this.rootServices.createChild();
    store.add(services);
    const context: PluginContext = {
      services,
      subscriptions: store,
      bindIpc: <S extends object>(handlers: IpcHandlers<S>) => store.add(this.ipcRouter.bind<S>(record.plugin.id, handlers))
    };
    record.activation = Promise.resolve(record.plugin.activate(context)).then(() => ({ dispose: () => store.dispose() }));
    record.activation.catch(() => {
      store.dispose();
      record.activation = undefined;
    });
    return record.activation;
  }

  private deactivate(record: PluginRecord): void {
    const activation = record.activation;
    record.activation = undefined;
    void activation?.then(session => session.dispose());
  }

  private fireDidChangePlugins(): void {
    this.onDidChangePluginsEmitter.fire(this.getPlugins());
  }

  private async readRestorableIds(): Promise<Set<string>> {
    try {
      const value = toPlainObject(JSON.parse(await readFile(this.windowStatePath, 'utf8')));
      if (value?.version != 1 || !Array.isArray(value.ids)) return new Set();
      return new Set(value.ids.map(toNonEmptyString).filter((id): id is string => id != null));
    } catch {
      return new Set();
    }
  }

  private setRestorable(id: string, restorable: boolean): void {
    if (this.disposing || this.restorableIds.has(id) == restorable) return;
    if (restorable) this.restorableIds.add(id);
    else this.restorableIds.delete(id);
    this.saveRestorableIds();
  }

  private saveRestorableIds(): void {
    const contents = JSON.stringify({ version: 1, ids: [...this.restorableIds] });
    const nextWrite = this.stateWrite.then(async () => {
      await writeFile(this.temporaryWindowStatePath, contents);
      await rename(this.temporaryWindowStatePath, this.windowStatePath);
    });
    this.stateWrite = nextWrite.catch(error => console.error('Failed to save restorable plugin windows.', error));
  }

  private assertPlugin(value: unknown, directory: string): Plugin {
    const plugin = toPlainObject(value);
    const window = toPlainObject(plugin?.window);
    const id = toNonEmptyString(plugin?.id);
    const name = toNonEmptyString(plugin?.name);
    const entry = toNonEmptyString(window?.entry);
    const width = toNumber(window?.width);
    const height = toNumber(window?.height);
    const activate = plugin?.activate;
    if (id != directory || !name || !entry || width == null || height == null || !isFunction(activate)) {
      throw new Error(`Invalid plugin definition in tools/${directory}/plugin.ts.`);
    }
    return {
      id,
      name,
      platform: toPlatform(plugin?.platform),
      window: {
        entry,
        width,
        height,
        minWidth: toNumber(window?.minWidth),
        minHeight: toNumber(window?.minHeight),
        hideOnClose: toBoolean(window?.hideOnClose),
        titleBarStyle: toTitleBarStyle(window?.titleBarStyle),
        vibrancy: toVibrancy(window?.vibrancy)
      },
      activate: context => activate(context)
    };
  }
}

function toPlatform(value: unknown): readonly PluginPlatform[] | undefined {
  const platforms = (Array.isArray(value) ? value : [value])
    .map(item => toString(item))
    .filter((item): item is PluginPlatform => item == 'darwin' || item == 'win32' || item == 'linux');
  return platforms.length > 0 ? platforms : undefined;
}

function toTitleBarStyle(value: unknown): Plugin['window']['titleBarStyle'] {
  const string = toString(value);
  return string == 'default' || string == 'hidden' || string == 'hiddenInset' ? string : undefined;
}

function toVibrancy(value: unknown): Plugin['window']['vibrancy'] {
  const string = toString(value);
  return string == 'under-window' || string == 'sidebar' || string == 'menu' || string == 'popover' ? string : undefined;
}
