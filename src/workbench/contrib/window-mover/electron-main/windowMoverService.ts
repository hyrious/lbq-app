import { BrowserWindow, screen, systemPreferences } from 'electron';
import { resolve } from 'node:path';
import { Disposable } from '../../../../base/common/lifecycle.ts';
import { execFileAsync } from '../../../../base/node/process.ts';
import { registerMainService } from '../../../../platform/electron-main/ipc.ts';
import { IWindowMoverService, windowPosition, type WindowTarget } from '../common/windowMover.ts';

const script = resolve(import.meta.dirname, '../node/windows.jxa');

export class WindowMoverService extends Disposable implements IWindowMoverService {
	private windows: readonly WindowTarget[] = [];
	private target: WindowTarget | undefined;
	private execution: AbortController | undefined;
	private busy = false;

	private get mainWindow(): BrowserWindow | undefined {
		return BrowserWindow.getAllWindows().find(window => window.webContents.getURL() == 'app-file://src/index.html');
	}

	async list(): Promise<readonly WindowTarget[]> {
		return this.exclusive(async () => {
			if (!systemPreferences.isTrustedAccessibilityClient(true)) {
				throw new Error('请在系统设置的“隐私与安全性 → 辅助功能”中允许 LBQ，然后重试。开发模式下需允许 Electron。');
			}
			this.windows = await this.run<WindowTarget[]>({ action: 'list', pid: process.pid });
			this.target = undefined;
			return this.windows;
		});
	}

	async select(index: number): Promise<void> {
		await this.exclusive(async () => {
			const target = Number.isInteger(index) ? this.windows[index] : undefined;
			if (!target) throw new Error('请重新选择窗口');
			try {
				await this.run({ action: 'focus', target });
				this.target = target;
			} finally {
				this.mainWindow?.show();
			}
		});
	}

	async finish(direction?: number): Promise<void> {
		await this.exclusive(async () => {
			const target = this.target;
			if (direction != null && !target) throw new Error('请先选择窗口');
			const position = direction == null || !target ? undefined : windowPosition(target, screen.getPrimaryDisplay().workArea, direction);
			try {
				if (target) await this.run({ action: position ? 'move' : 'focus', target, position });
				this.windows = [];
				this.target = undefined;
			} catch (error) {
				this.mainWindow?.show();
				throw error;
			}
		});
	}

	private async exclusive<T>(action: () => Promise<T>): Promise<T> {
		if (this.busy) throw new Error('窗口菜单正在处理，请稍后重试');
		this.busy = true;
		try { return await action(); }
		finally { this.busy = false; }
	}

	private async run<T = null>(request: object): Promise<T> {
		const execution = new AbortController();
		this.execution = execution;
		try {
			const { stdout } = await execFileAsync('/usr/bin/osascript', ['-l', 'JavaScript', script, JSON.stringify(request)], {
				timeout: 15000,
				signal: execution.signal,
				maxBuffer: 2 * 1024 * 1024
			});
			return JSON.parse(stdout);
		} catch (error) {
			if (error.killed) throw new Error('读取或操作窗口超时，请关闭无响应的应用后重试。');
			if (String(error.stderr).includes('-1743')) throw new Error('请在系统设置的“隐私与安全性 → 自动化”中允许 LBQ 控制 System Events，然后重试。');
			throw new Error(String(error.stderr || error.message).trim());
		} finally {
			this.execution = undefined;
		}
	}

	override dispose(): void {
		this.execution?.abort();
		super.dispose();
	}
}

registerMainService(IWindowMoverService, WindowMoverService);
