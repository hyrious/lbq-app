import { ipcMain, type IpcMainInvokeEvent, type WebContents } from 'electron';
import { toDisposable, type IDisposable } from '../../../base/common/lifecycle.ts';
import { toNonEmptyString } from '../../../base/common/types.ts';
import type { RpcRequest, RpcResponse } from '../common/ipc.ts';

type Handler = (input: unknown) => unknown | Promise<unknown>;

export interface TypedIpcServer<S extends object> {
  handle<K extends Extract<keyof S, string>>(
    method: K,
    handler: (input: RpcRequest<S[K]>) => RpcResponse<S[K]> | Promise<RpcResponse<S[K]>>
  ): IDisposable;
}

export class IpcRouter implements IDisposable {
  private readonly pluginsByWebContents = new Map<number, string>();
  private readonly handlers = new Map<string, Map<string, Handler>>();

  constructor() {
    ipcMain.handle('runtime:invoke', (event, method, input) => this.invoke(event, method, input));
  }

  bind<S extends object>(pluginId: string): TypedIpcServer<S> {
    return {
      handle: (method, handler) => this.registerHandler(pluginId, method, handler as Handler)
    };
  }

  registerWebContents(pluginId: string, webContents: WebContents): IDisposable {
    if (this.pluginsByWebContents.has(webContents.id)) throw new Error(`WebContents ${webContents.id} is already registered.`);
    this.pluginsByWebContents.set(webContents.id, pluginId);
    const forget = () => this.pluginsByWebContents.delete(webContents.id);
    webContents.once('destroyed', forget);
    return toDisposable(() => {
      webContents.removeListener('destroyed', forget);
      forget();
    });
  }

  dispose(): void {
    ipcMain.removeHandler('runtime:invoke');
    this.pluginsByWebContents.clear();
    this.handlers.clear();
  }

  private registerHandler(pluginId: string, method: string, handler: Handler): IDisposable {
    let handlers = this.handlers.get(pluginId);
    if (!handlers) {
      handlers = new Map();
      this.handlers.set(pluginId, handlers);
    }
    if (handlers.has(method)) throw new Error(`IPC handler is already registered: ${pluginId}/${method}`);
    handlers.set(method, handler);
    return toDisposable(() => {
      handlers.delete(method);
      if (!handlers.size) this.handlers.delete(pluginId);
    });
  }

  private invoke(event: IpcMainInvokeEvent, method: unknown, input: unknown): unknown | Promise<unknown> {
    const pluginId = this.pluginsByWebContents.get(event.sender.id);
    if (!pluginId) throw new Error('The calling window is not associated with a plugin.');
    const methodName = toNonEmptyString(method);
    if (!methodName) throw new Error('IPC method must be a non-empty string.');
    const handler = this.handlers.get(pluginId)?.get(methodName);
    if (!handler) throw new Error(`Unknown IPC method: ${pluginId}/${methodName}`);
    return handler(input);
  }
}
