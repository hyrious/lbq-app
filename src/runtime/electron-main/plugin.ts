import type { DisposableStore } from '../../base/common/lifecycle.ts';
import type { InstantiationService } from '../../platform/instantiation/common/instantiation.ts';
import type { IpcHandlers } from '../../platform/ipc/electron-main/ipcRouter.ts';

export interface PluginWindowOptions {
  readonly entry: string;
  readonly width: number;
  readonly height: number;
  readonly minWidth?: number;
  readonly minHeight?: number;
  readonly hideOnClose?: boolean;
  readonly vibrancy?: 'under-window' | 'sidebar' | 'menu' | 'popover';
}

export interface PluginContext {
  readonly services: InstantiationService;
  readonly subscriptions: DisposableStore;
  bindIpc<S extends object>(handlers: IpcHandlers<S>): void;
}

export type PluginPlatform = 'darwin' | 'win32' | 'linux';

export interface Plugin {
  readonly id: string;
  readonly name: string;
  readonly platform?: PluginPlatform | readonly PluginPlatform[];
  readonly window: PluginWindowOptions;
  activate(context: PluginContext): void | Promise<void>;
}
