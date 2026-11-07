import { registerRemoteService } from '../../../../platform/electron-browser/ipc.ts';
import { ISnippetsService } from '../common/snippets.ts';

registerRemoteService(ISnippetsService);
