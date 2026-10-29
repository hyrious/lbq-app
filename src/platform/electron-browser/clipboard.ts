import { IClipboardService } from '../common/clipboard.ts';
import { registerRemoteService } from './ipc.ts';

registerRemoteService(IClipboardService);
