import { app, dialog, Menu, protocol } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { register, stripTypeScriptTypes } from 'node:module';
import { join, resolve } from 'node:path';
import { DisposableStore } from '../../base/common/lifecycle.ts';
import { InstantiationService } from '../../platform/instantiation/common/instantiation.ts';
import { IpcRouter } from '../../platform/ipc/electron-main/ipcRouter.ts';
import { productName } from '../../product.ts';
import { PluginService } from './pluginService.ts';
import { ProtocolService } from './protocolService.ts';
import { TrayService } from './trayService.ts';
import { WindowService } from './windowService.ts';

const applicationRoot = resolve(import.meta.dirname, '../../..');
const toolsRoot = join(applicationRoot, 'tools');
let pluginService: PluginService | undefined;

register('data:text/javascript,export async function resolve(r,t,n){if(r==="fs"){return{format:"builtin",shortCircuit:true,url:"node:original-fs"}}return n(r,t)}', import.meta.url);
protocol.registerSchemesAsPrivileged([{
  scheme: 'app-file',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: app.isPackaged }
}]);

export function runApplication(): void {
  app.setName(productName);
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }

  app.on('second-instance', () => {
    const first = pluginService?.getPlugins()[0];
    if (first) void pluginService?.open(first.id);
  });
  app.on('window-all-closed', () => {});
  void app.whenReady().then(start).catch(error => {
    console.error(error);
    dialog.showErrorBox(`${productName} failed to start`, error instanceof Error ? error.message : String(error));
    app.quit();
  });
}

async function start(): Promise<void> {
  const disposables = new DisposableStore();
  app.on('before-quit', () => disposables.dispose());
  Menu.setApplicationMenu(null);
  app.dock?.hide();

  const preloadSource = stripTypeScriptTypes(await readFile(join(applicationRoot, 'src/runtime/electron-preload/preload.ts'), 'utf8'));
  const preloadPath = join(app.getPath('userData'), 'preload.js');
  await writeFile(preloadPath, preloadSource);

  const protocolService = disposables.add(new ProtocolService(toolsRoot, !app.isPackaged));
  protocolService.register();
  const ipcRouter = disposables.add(new IpcRouter());
  const rootServices = disposables.add(new InstantiationService());
  const windowService = new WindowService(app.getPath('userData'), preloadPath, ipcRouter);
  pluginService = disposables.add(new PluginService(toolsRoot, rootServices, ipcRouter, windowService));
  disposables.add(new TrayService(join(applicationRoot, 'icon.png'), pluginService));
  await pluginService.discover();
}
