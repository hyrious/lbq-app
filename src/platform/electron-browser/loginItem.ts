import { ILoginItemService } from '../common/loginItem.ts';
import { registerRemoteService } from './ipc.ts';

registerRemoteService(ILoginItemService);
