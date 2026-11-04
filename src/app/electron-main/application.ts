import './app.contribution.ts';

import { app, Menu } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { Disposable } from '../../base/common/lifecycle.ts';
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
		return new Application(await writePreload());
	}

	async open(): Promise<void> {
		Menu.setApplicationMenu(Menu.buildFromTemplate(appMenu));

		const windows = this.windows;
		app.on('activate', () => {
			if (!app.isReady()) return;
			if (!windows.mainWindow) windows.openMainWindow();
		});

		const reveal = () => {
			if (windows.mainWindow) {
				if (windows.mainWindow.isMinimized()) windows.mainWindow.restore();
				windows.mainWindow.focus();
			} else {
				windows.openMainWindow();
			}
		};

		app.on('second-instance', reveal);
		this.register(new TrayService()).onClick(reveal);
	}
}

async function writePreload(): Promise<string> {
	const preloadSource = stripTypeScriptTypes(await readFile(resolve(import.meta.dirname, '../../preload.ts'), 'utf8'));
	const preloadPath = resolve(app.getPath('userData'), 'preload.js');
	await writeFile(preloadPath, preloadSource);
	return preloadPath;
}
