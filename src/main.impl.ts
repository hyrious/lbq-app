import { app, Menu } from 'electron';
import { readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { resolve } from 'node:path';
import { DisposableStore } from './base/common/lifecycle.ts';
import { InstantiationService } from './platform/common/instantiation.ts';
import { initializeMainServices } from './platform/electron-main/ipc.ts';
import { fixMacOSShellPaths } from './platform/node/pathFix.ts';
import { appMenu } from './workbench/electron-main/menus.ts';
import { TrayService } from './workbench/electron-main/tray.ts';
import { WindowService } from './workbench/electron-main/windows.ts';

import './platform/electron-main/clipboard.ts';
import './workbench/contrib/image-portal/electron-main/imagePortal.ts';

await fixMacOSShellPaths();
const store = new DisposableStore();
app.on('before-quit', () => store.dispose());

Menu.setApplicationMenu(Menu.buildFromTemplate(appMenu));

const preloadSource = stripTypeScriptTypes(await readFile(resolve(import.meta.dirname, 'preload.ts'), 'utf8'));
const preloadPath = resolve(app.getPath('userData'), 'preload.js');
await writeFile(preloadPath, preloadSource);

const services = store.add(new InstantiationService());
store.add(initializeMainServices(services));

const windows = store.add(new WindowService(preloadPath));

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
store.add(new TrayService()).onClick(reveal);
