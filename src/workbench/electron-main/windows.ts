import carbonIcons from '@iconify-json/carbon/icons.json' with { type: 'json' };
import { app, BrowserWindow, ipcMain, net, protocol, shell } from 'electron';
import { glob, readFile, writeFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Emitter, type Event } from '../../base/common/event.ts';
import { Disposable } from '../../base/common/lifecycle.ts';
import { toNumber, toPlainObject } from '../../base/common/types.ts';
import { type IConfiguration } from '../../platform/common/ipc.ts';
import { fixWindowsDevToolsFonts } from '../../platform/electron-main/fontFix.ts';
import { iconPath, srcPath } from '../node/resources.ts';

interface IWindowState {
	readonly x?: number;
	readonly y?: number;
	readonly width: number;
	readonly height: number;
}

export class WindowService extends Disposable {
	private readonly statePath = resolve(app.getPath('userData'), 'window-state.json');
	private readonly preloadPath: string;

	private workbenchReady = false;
	private pendingApp: string | undefined;

	private readonly _onReady = new Emitter<void>();
	readonly onReady: Event<void> = this._onReady.event;

	private _mainWindow: Electron.BrowserWindow | undefined;
	get mainWindow(): Electron.BrowserWindow | undefined { return this._mainWindow; }

	constructor(preloadPath: string) {
		super();
		this.preloadPath = preloadPath;
		this.setupIPC();
		this.setupProtocol();
		this.openMainWindow();
	}

	private setupIPC() {
		ipcMain.on('vscode:workbench-ready', () => {
			this.workbenchReady = true;
			this.sendPendingApp();
		});
		ipcMain.handle('vscode:config', async (): Promise<IConfiguration> => ({
			cssModules: await this.cssModules(),
			carbonIcons
		}));
	}

	private async cssModules(): Promise<readonly string[]> {
		const result: string[] = [];
		for await (const path of glob('**/*.css', { cwd: srcPath })) {
			result.push(new URL(path.replaceAll('\\', '/'), 'app-file://src').href);
		}
		return result;
	}

	private setupProtocol() {
		protocol.handle('app-file', async (request: Request): Promise<Response> => {
			const url = new URL(request.url);
			if (url.hostname === 'src') {
				const file = resolve(srcPath, `.${decodeURIComponent(url.pathname)}`);
				const relativePath = relative(srcPath, file);
				if (isAbsolute(relativePath) || relativePath.startsWith('..')) {
					return new Response('Path is outside the source directory.', { status: 403 });
				}
				if (file.endsWith('.ts')) {
					return await this.handleTypeScriptFile(file);
				}
				return await this.handleDefault(request, file);
			}
			return new Response(null, { status: 404 });
		});
	}

	private async handleDefault(request: Request, file: string): Promise<Response> {
		const response = await net.fetch(pathToFileURL(file).href, { method: request.method, headers: request.headers });
		if (app.isPackaged) {
			return response;
		} else {
			const headers = new Headers(response.headers);
			headers.set('cache-control', 'no-store');
			return new Response(response.body, { ...response, headers });
		}
	}

	private async handleTypeScriptFile(file: string): Promise<Response> {
		return await this.handleTransformFile(file, stripTypeScriptTypes);
	}

	private async handleTransformFile(file: string, cb: (content: string) => string): Promise<Response> {
		try {
			const source = await readFile(file, 'utf8');
			const js = cb(source);
			const headers = { 'content-type': 'text/javascript; charset=utf-8' };
			if (app.isPackaged) {
				return new Response(js, { headers });
			} else {
				return new Response(js, { headers: { ...headers, 'cache-control': 'no-store' } });
			}
		} catch {
			return new Response(null, { status: 404 });
		}
	}

	async openMainWindow(): Promise<BrowserWindow> {
		if (this._mainWindow) return this._mainWindow;
		return this.createMainWindow();
	}

	async reveal(): Promise<void> {
		const window = await this.openMainWindow();
		if (window.isMinimized()) window.restore();
		window.show();
		window.focus();
	}

	private async createMainWindow(): Promise<BrowserWindow> {
		let state: IWindowState = { width: 32 * 17, height: 32 * 13 };
		try {
			const value = toPlainObject(JSON.parse(await readFile(this.statePath, 'utf8')));
			const x = toNumber(value?.x);
			const y = toNumber(value?.y);
			const width = toNumber(value?.width);
			const height = toNumber(value?.height);
			if (width && height) state = { x, y, width, height };
		} catch { }

		const mac = process.platform === 'darwin';
		const window = new BrowserWindow({
			autoHideMenuBar: true,
			icon: iconPath,
			show: false,
			...state,
			minWidth: 32 * 6,
			minHeight: 32 * 2,
			backgroundColor: '#00000000',
			// acrylic / mica NOT use, looks weird on my Windows 11.
			titleBarStyle: mac ? 'hiddenInset' : undefined,
			vibrancy: mac ? 'under-window' : undefined,
			webPreferences: {
				preload: this.preloadPath,
				sandbox: false,
				defaultFontFamily: {
					standard: 'Noto Sans SC',
					serif: 'Noto Serif SC',
					sansSerif: 'Noto Sans SC',
					monospace: 'Cascadia Mono'
				}
			}
		});
		this._mainWindow = window;
		this.workbenchReady = false;
		window.webContents.on('did-start-loading', () => { this.workbenchReady = false; });

		window.webContents.on('before-input-event', (event, input) => {
			if (input.type === 'keyDown' && input.key === 'F12') {
				event.preventDefault();
				window.webContents.toggleDevTools();
			}
		});

		window.webContents.setWindowOpenHandler(details => {
			shell.openExternal(details.url);
			return { action: 'deny' };
		});

		let saving: NodeJS.Timeout | undefined;
		const saveState = () => {
			clearTimeout(saving);
			saving = setTimeout(() => writeFile(this.statePath, JSON.stringify(window.getBounds())), 500);
		};
		window.on('moved', saveState);
		window.on('resized', saveState);

		fixWindowsDevToolsFonts(window);

		if (!app.isPackaged) window.webContents.openDevTools({ mode: 'detach' });

		try {
			await window.loadURL(`app-file://src/index.html`);
		} catch (error) {
			window.destroy();
			this._mainWindow = undefined;
			throw error;
		}

		window.on('unresponsive', () => {
			clearTimeout(saving);
			window.destroy();
			this._mainWindow = undefined;
		});

		window.on('closed', () => {
			clearTimeout(saving);
			this._mainWindow?.removeAllListeners();
			this._mainWindow = undefined;
		});

		this._onReady.fire();

		return window;
	}

	async activateApp(id: string): Promise<void> {
		this.pendingApp = id;
		await this.reveal();
		this.sendPendingApp();
	}

	private sendPendingApp(): void {
		if (!this.workbenchReady || !this.pendingApp) return;
		this._mainWindow?.webContents.send('vscode:activate-app', this.pendingApp);
		this.pendingApp = undefined;
	}
}
