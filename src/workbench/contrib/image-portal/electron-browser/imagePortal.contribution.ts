import { IClipboardService } from '../../../../platform/common/clipboard.ts';
import { IImageService } from '../common/imagePortal.ts';
import { IImagePortalService } from '../browser/imagePortalService.ts';
import { ImagePortalService } from './imagePortalService.ts';
import { registerService } from '../../../../platform/common/extensions.ts';
import { registerRemoteService } from '../../../../platform/electron-browser/ipc.ts';

registerRemoteService(IImageService);
registerService(IImagePortalService, accessor => new ImagePortalService(
	accessor.get(IImageService),
	accessor.get(IClipboardService)
), true);
