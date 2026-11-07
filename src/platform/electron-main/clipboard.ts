import { clipboard, ClipboardItem, nativeImage } from 'electron';
import { IClipboardService } from '../common/clipboard.ts';
import { registerMainService } from './ipc.ts';

class ClipboardService implements IClipboardService {
	async writeText(text: string): Promise<void> {
		await clipboard.writeText(text);
	}

	async writeImage(png: Uint8Array): Promise<void> {
		if (!(png instanceof Uint8Array) || nativeImage.createFromBuffer(Buffer.from(png)).isEmpty()) {
			throw new Error('无法复制无效的图片。');
		}
		await clipboard.write([new ClipboardItem({
			'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' })
		})]);
	}
}

registerMainService(IClipboardService, ClipboardService);
