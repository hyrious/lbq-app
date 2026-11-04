import { nativeImage, type NativeImage } from 'electron';
import { join } from 'node:path';
import { withTemporaryDirectory } from '../../../../base/node/fs.ts';
import { execFileAsync } from '../../../../base/node/process.ts';
import { IImageService, type ImageRequest, type ProcessedImage } from '../common/imagePortal.ts';
import { registerMainService } from '../../../../platform/electron-main/ipc.ts';

async function readImage(source: string | Uint8Array): Promise<NativeImage> {
	if (source instanceof Uint8Array) {
		return nativeImage.createFromBuffer(Buffer.from(source));
	}
	if (!/\.hei[cf]$/i.test(source)) return nativeImage.createFromPath(source);
	if (process.platform != 'darwin') throw new Error('当前平台不支持 HEIC 或 HEIF 转换。');

	return withTemporaryDirectory('image-portal-', async directory => {
		const convertedPath = join(directory, 'image.png');
		try {
			await execFileAsync('sips', ['-s', 'format', 'png', source, '--out', convertedPath]);
		} catch (error) {
			throw new Error(`无法使用 sips 转换 HEIC 图片：${String(error)}`);
		}
		return nativeImage.createFromPath(convertedPath);
	});
}

function resizeImage(image: NativeImage, input: ImageRequest): NativeImage {
	if (input.scale == null && input.width == null) return image;

	const { width, height } = image.getSize();
	const targetWidth = Math.round(input.width ?? width * input.scale!);
	const targetHeight = Math.round(height * targetWidth / width);
	if (!Number.isFinite(targetWidth) || !(0 < targetWidth && targetWidth <= 3000
		&& 0 < targetHeight && targetHeight <= 3000)) {
		throw new Error('缩放后的尺寸须在 1 至 3000 像素之间。');
	}
	return image.resize({ width: targetWidth });
}

export class ImageService implements IImageService {
	async process(input: ImageRequest): Promise<ProcessedImage> {
		const source = input?.source;
		if (!(typeof source === 'string' && source.length > 0) && !(source instanceof Uint8Array)) {
			throw new Error('请选择图片文件。');
		}

		const image = await readImage(source);
		if (image.isEmpty()) {
			throw new Error(`图片格式不受支持或文件无法读取：${typeof source === 'string' ? source : ''}`);
		}
		const resized = resizeImage(image, input);
		return { ...resized.getSize(), preview: resized.toPNG() };
	}
}

registerMainService(IImageService, ImageService);
