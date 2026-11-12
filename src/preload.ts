// This file is evaluated in a special script in the browser.
// Do not import anything here. It can only use require(electron).
import type { IDisposable } from './base/common/lifecycle.ts';
import type { Bridge, IConfiguration } from './platform/common/ipc.ts';
const { contextBridge, webUtils, ipcRenderer }: typeof import('electron') = require('electron');

contextBridge.exposeInMainWorld('vscode', defineBridge({
	platform: process.platform,
	getPathForFile(file: File): string {
		return webUtils.getPathForFile(file);
	},
	invoke(channel: string, method: string, args: unknown[]): Promise<unknown> {
		return ipcRenderer.invoke('vscode:invoke', channel, method, args);
	},
	resolveConfiguration(): Promise<IConfiguration> {
		return resolveConfiguration;
	},
	onDidActivateApp(listener: (id: string) => void): IDisposable {
		const handler = (_event: Electron.IpcRendererEvent, id: string) => listener(id);
		ipcRenderer.on('vscode:activate-app', handler);
		ipcRenderer.send('vscode:workbench-ready');
		return { dispose() { ipcRenderer.removeListener('vscode:activate-app', handler); } };
	}
}));

const resolveConfiguration: Promise<IConfiguration> = (async () => {
	return await ipcRenderer.invoke('vscode:config');
})();

function defineBridge(bridge: Bridge): Bridge {
	return bridge;
}

function applyPlatform() {
	if (!document.body) return;
	const mac = process.platform === 'darwin';
	const windows = process.platform === 'win32';
	document.body.classList.add('monaco-workbench', mac ? 'mac' : windows ? 'windows' : 'linux');
	if (windows && Number(process.getSystemVersion().split('.')[2]) < 22000) {
		document.body.classList.add('windows-10');
	}
	if (mac && Number.parseInt(process.getSystemVersion(), 10) >= 26) {
		document.body.classList.add('macos-tahoe');
	}
}
if (document.body) applyPlatform();
else document.addEventListener('DOMContentLoaded', applyPlatform, { once: true });
