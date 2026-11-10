import { IAppDataService } from '../common/appData.ts';
import { registerRemoteService } from './ipc.ts';

registerRemoteService(IAppDataService);
