import { mainWindow } from '../../base/browser/window.ts';
import { registerService } from '../common/extensions.ts';
import { IStorageService } from '../common/storage.ts';

export class StorageService implements IStorageService {
	get(key: string): string | undefined {
		try {
			return mainWindow.localStorage.getItem(key) ?? undefined;
		} catch {
			return undefined;
		}
	}

	store(key: string, value: string): void {
		try {
			mainWindow.localStorage.setItem(key, value);
		} catch { }
	}

	remove(key: string): void {
		try {
			mainWindow.localStorage.removeItem(key);
		} catch { }
	}
}

registerService(IStorageService, StorageService);
