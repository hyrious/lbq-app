import { app, dialog, Menu, nativeImage, Tray } from 'electron';
import { Disposable } from '../../base/common/lifecycle.ts';
import { productName, trayGuid } from '../../product.ts';
import type { PluginInfo, PluginService } from './pluginService.ts';

export class TrayService extends Disposable {
  private readonly tray: Tray;
  private readonly plugins: PluginService;

  constructor(iconPath: string, plugins: PluginService) {
    super();
    this.plugins = plugins;
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    if (process.platform == 'darwin') icon.setTemplateImage(true);
    this.tray = new Tray(icon, process.platform == 'darwin' ? trayGuid : undefined);
    this.tray.setToolTip(productName);
    this.tray.on('click', () => this.tray.popUpContextMenu());
    // Do not destroy the app-lifetime Tray during shutdown. On macOS,
    // removing its NSStatusItem also deletes the persisted menu bar position.
    this.register(this.plugins.onDidChangePlugins(items => this.updateMenu(items)));
    this.updateMenu(this.plugins.getPlugins());
  }

  private updateMenu(plugins: readonly PluginInfo[]): void {
    const template: Electron.MenuItemConstructorOptions[] = plugins.map(plugin => ({
      label: plugin.alive ? `${plugin.name}*` : plugin.name,
      click: () => void this.plugins.open(plugin.id).catch(error => this.reportError(error))
    }));
    if (template.length) template.push({ type: 'separator' });
    template.push({ label: `退出 ${productName}`, click: () => app.quit() });
    this.tray.setContextMenu(Menu.buildFromTemplate(template));
  }

  private reportError(error: unknown): void {
    console.error(error);
    dialog.showErrorBox(`${productName} 无法打开工具`, error instanceof Error ? error.message : String(error));
  }
}
