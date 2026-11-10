import { app, shell } from 'electron';
import { IAppDataService } from '../common/appData.ts';
import { registerMainService } from './ipc.ts';

class AppDataService implements IAppDataService {
	async openFolder(): Promise<void> {
		const error = await shell.openPath(app.getPath('userData'));
		if (error) throw new Error(error);
	}
}

registerMainService(IAppDataService, AppDataService);
