import { registerRemoteService } from '../../../../platform/electron-browser/ipc.ts';
import { registerApp } from '../../../browser/apps.ts';
import { WindowMoverView } from '../browser/windowMoverView.ts';
import { IWindowMoverService } from '../common/windowMover.ts';

registerRemoteService(IWindowMoverService);
registerApp(WindowMoverView);
