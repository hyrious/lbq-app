import './app.contribution.ts';

import { app, dialog, globalShortcut, Menu } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { Disposable, toDisposable } from '../../base/common/lifecycle.ts';
import { InstantiationService } from '../../platform/common/instantiation.ts';
import { initializeMainServices } from '../../platform/electron-main/ipc.ts';
import { fixMacOSShellPaths } from '../../platform/node/pathFix.ts';
import { appMenu } from '../../workbench/electron-main/menus.ts';
import { TrayService } from '../../workbench/electron-main/tray.ts';
import { WindowService } from '../../workbench/electron-main/windows.ts';

export class Application extends Disposable {
	private readonly services: InstantiationService;
	private readonly windows: WindowService;

	private constructor(preloadPath: string) {
		super();
		this.services = this.register(new InstantiationService());
		this.register(initializeMainServices(this.services));
		this.windows = this.register(new WindowService(preloadPath));
	}

	static async instantiate(): Promise<Application> {
		await fixMacOSShellPaths();

		const preloadSource = stripTypeScriptTypes(await readFile(resolve(import.meta.dirname, '../../preload.ts'), 'utf8'));
		const preloadPath = resolve(app.getPath('userData'), 'preload.js');
		await writeFile(preloadPath, preloadSource);

		return new Application(preloadPath);
	}

	async open(): Promise<void> {
		Menu.setApplicationMenu(Menu.buildFromTemplate(appMenu));
		this.registerGlobalShortcuts();

		const windows = this.windows;
		const hidden = this.isLaunchHidden();
		windows.onReady(() => hidden || windows.mainWindow?.show());
		app.on('activate', () => app.isReady() && windows.reveal());

		const reveal = () => windows.reveal();
		app.on('second-instance', reveal);
		this.register(new TrayService()).onClick(reveal);
	}

	private isLaunchHidden(): boolean {
		if (app.requestSingleInstanceLock()) {
			return process.argv.includes('--hidden');
		} else {
			app.releaseSingleInstanceLock();
			return false;
		}
	}

	private registerGlobalShortcuts() {
		if (process.platform == 'darwin') {
			const shortcut = 'Control+Alt+Command+W';
			if (globalShortcut.register(shortcut, () => {
				this.windows.activateApp('window-mover').catch(error => dialog.showErrorBox('无法打开窗口移动', error.message));
			})) {
				this.register(toDisposable(() => globalShortcut.unregister(shortcut)));
			} else {
				dialog.showErrorBox('窗口快捷键不可用', '⌃⌥⌘W 已被占用。');
			}
		}
	}
}
