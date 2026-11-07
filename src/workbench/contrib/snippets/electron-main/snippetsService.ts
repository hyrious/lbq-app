import { app, BrowserWindow, dialog } from 'electron';
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { registerMainService } from '../../../../platform/electron-main/ipc.ts';
import { ISnippetsService, type Snippet } from '../common/snippets.ts';

export class SnippetsService implements ISnippetsService {
	private get file(): string { return join(app.getPath('userData'), 'snippets.json'); }

	async read(): Promise<Snippet[]> {
		try {
			const items: unknown = JSON.parse(readFileSync(this.file, 'utf8'));
			this.validate(items);
			return items;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code == 'ENOENT') return [];
			throw error;
		}
	}

	async write(items: Snippet[]): Promise<void> {
		this.validate(items);
		mkdirSync(app.getPath('userData'), { recursive: true });
		writeFileSync(`${this.file}.tmp`, JSON.stringify(items), 'utf8');
		renameSync(`${this.file}.tmp`, this.file);
	}

	async confirmClear(): Promise<boolean> {
		const options = {
			type: 'question' as const,
			message: '删除全部片段？',
			buttons: ['取消', '全部删除'],
			defaultId: 0,
			cancelId: 0,
			noLink: true
		};
		const window = BrowserWindow.getFocusedWindow();
		const result = await (window ? dialog.showMessageBox(window, options) : dialog.showMessageBox(options));
		return result.response == 1;
	}

	private validate(items: unknown): asserts items is Snippet[] {
		if (!Array.isArray(items) || items.some(item => !item || typeof item.id != 'string'
			|| typeof item.text != 'string')
			|| new Set(items.map(item => item.id)).size != items.length) {
			throw new Error('片段数据格式有误');
		}
	}
}

registerMainService(ISnippetsService, SnippetsService);
