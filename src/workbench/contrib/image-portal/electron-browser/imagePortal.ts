import { IClipboardService } from '../../../../platform/common/clipboard.ts';
import { IImageService, type ProcessedImage } from '../common/imagePortal.ts';
import { IImagePortalService } from '../browser/imagePortal.ts';
import { registerService } from '../../../../platform/common/extensions.ts';
import { registerRemoteService } from '../../../../platform/electron-browser/ipc.ts';

export class ImagePortalService implements IImagePortalService {
	private readonly images: IImageService;
	private readonly clipboard: IClipboardService;

	constructor(images: IImageService, clipboard: IClipboardService) {
		this.images = images;
		this.clipboard = clipboard;
	}

	async copy(file: File, size?: number): Promise<ProcessedImage> {
		const source = vscode.getPathForFile(file) || new Uint8Array(await file.arrayBuffer());
		const result = await this.images.process({
			source,
			scale: size != null && size < 20 ? size : undefined,
			width: size != null && size >= 20 ? size : undefined
		});
		await this.clipboard.writeImage(result.preview);
		return result;
	}
}

registerRemoteService(IImageService);
registerService(IImagePortalService, accessor => new ImagePortalService(
	accessor.get(IImageService),
	accessor.get(IClipboardService)
), true);
