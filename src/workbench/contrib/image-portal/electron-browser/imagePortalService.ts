import { IClipboardService } from '../../../../platform/common/clipboard.ts';
import { IImageService, type ProcessedImage } from '../common/imagePortal.ts';
import { IImagePortalService } from '../browser/imagePortalService.ts';

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
