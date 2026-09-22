import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { DisposableStore, type IDisposable } from '../../base/common/lifecycle.ts';
import { Emitter, type Event } from '../../base/common/event.ts';
import { isFunction, toNonEmptyString, toNumber, toPlainObject, toString } from '../../base/common/types.ts';
import type { InstantiationService } from '../../platform/instantiation/common/instantiation.ts';
import type { IpcHandlers, IpcRouter } from '../../platform/ipc/electron-main/ipcRouter.ts';
import type { Plugin, PluginContext } from './plugin.ts';
import type { PluginWindow, WindowService } from './windowService.ts';

interface PluginModule {
  plugin?: unknown;
}

interface PluginRecord {
  readonly plugin: Plugin;
  activation?: Promise<PluginSession>;
  window?: PluginWindow;
}

interface PluginSession extends IDisposable {
}

export interface PluginInfo {
  readonly id: string;
  readonly name: string;
}

export class PluginService implements IDisposable {
  private readonly records = new Map<string, PluginRecord>();
  private readonly onDidChangePluginsEmitter = new Emitter<readonly PluginInfo[]>();
  private readonly toolsRoot: string;
  private readonly rootServices: InstantiationService;
  private readonly ipcRouter: IpcRouter;
  private readonly windowService: WindowService;
  readonly onDidChangePlugins: Event<readonly PluginInfo[]> = this.onDidChangePluginsEmitter.event;

  constructor(toolsRoot: string, rootServices: InstantiationService, ipcRouter: IpcRouter, windowService: WindowService) {
    this.toolsRoot = toolsRoot;
    this.rootServices = rootServices;
    this.ipcRouter = ipcRouter;
    this.windowService = windowService;
  }

  async discover(): Promise<void> {
    const entries = await readdir(this.toolsRoot, { withFileTypes: true });
    for (const entry of entries.filter(entry => entry.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      const module = await import(pathToFileURL(join(this.toolsRoot, entry.name, 'plugin.ts')).href) as PluginModule;
      const plugin = this.assertPlugin(module.plugin, entry.name);
      if (this.records.has(plugin.id)) throw new Error(`Duplicate plugin identifier: ${plugin.id}`);
      this.records.set(plugin.id, { plugin });
    }
    this.onDidChangePluginsEmitter.fire(this.getPlugins());
  }

  getPlugins(): readonly PluginInfo[] {
    return [...this.records.values()].map(record => ({ id: record.plugin.id, name: record.plugin.name }));
  }

  async open(id: string): Promise<void> {
    const record = this.records.get(id);
    if (!record) throw new Error(`Unknown plugin: ${id}`);
    if (record.window && !record.window.browserWindow.isDestroyed()) {
      if (record.window.browserWindow.isMinimized()) record.window.browserWindow.restore();
      record.window.browserWindow.show();
      record.window.browserWindow.focus();
      return;
    }

    const session = await this.activate(record);
    try {
      record.window = await this.windowService.open(record.plugin, () => {
        record.window = undefined;
        this.deactivate(record);
      });
    } catch (error) {
      session.dispose();
      record.activation = undefined;
      throw error;
    }
  }

  dispose(): void {
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
      window: {
        entry,
        width,
        height,
        minWidth: toNumber(window?.minWidth),
        minHeight: toNumber(window?.minHeight),
        titleBarStyle: toTitleBarStyle(window?.titleBarStyle),
        vibrancy: toVibrancy(window?.vibrancy)
      },
      activate: context => activate(context)
    };
  }
}

function toTitleBarStyle(value: unknown): Plugin['window']['titleBarStyle'] {
  const string = toString(value);
  return string == 'default' || string == 'hidden' || string == 'hiddenInset' ? string : undefined;
}

function toVibrancy(value: unknown): Plugin['window']['vibrancy'] {
  const string = toString(value);
  return string == 'under-window' || string == 'sidebar' || string == 'menu' || string == 'popover' ? string : undefined;
}
