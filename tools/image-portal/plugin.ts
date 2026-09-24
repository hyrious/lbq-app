import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { clipboard, ClipboardItem, nativeImage } from 'electron';
import { createServiceIdentifier } from '../../src/platform/instantiation/common/instantiation.ts';
import { toNonEmptyString } from '../../src/base/common/types.ts';
import type { Plugin } from '../../src/runtime/electron-main/plugin.ts';
import type { ImagePortalRpc, ImageRequest, ProcessedImage } from './common.ts';

const execFileAsync = promisify(execFile);
const IImageService = createServiceIdentifier<ImageService>('imagePortal.imageService');

class ImageService {
  async process(input: ImageRequest): Promise<ProcessedImage> {
    const inputPath = toNonEmptyString(input?.path);
    if (!inputPath) throw new Error('请选择本地图片文件。');

    let imagePath = inputPath;
    let temporaryDirectory: string | undefined;
    try {
      if (/\.hei[cf]$/i.test(imagePath)) {
        if (process.platform != 'darwin') throw new Error('当前平台不支持 HEIC 或 HEIF 转换。');
        temporaryDirectory = await mkdtemp(join(tmpdir(), 'image-portal-'));
        const convertedPath = join(temporaryDirectory, 'image.png');
        try {
          await execFileAsync('sips', ['-s', 'format', 'png', imagePath, '--out', convertedPath]);
        } catch (error) {
          throw new Error(`无法使用 sips 转换 HEIC 图片：${String(error)}`);
        }
        imagePath = convertedPath;
      }

      let image = nativeImage.createFromPath(imagePath);
      if (image.isEmpty()) throw new Error(`图片格式不受支持或文件无法读取：${inputPath}`);

      if (input.scale != null || input.width != null) {
        const { width, height } = image.getSize();
        const scale = input.scale ?? Number.NaN;
        const targetWidth = Math.round(input.width ?? width * scale);
        const targetHeight = Math.round(height * targetWidth / width);
        if (!Number.isFinite(targetWidth) || !(0 < targetWidth && targetWidth <= 3000
            && 0 < targetHeight && targetHeight <= 3000)) {
          throw new Error('缩放后的尺寸须在 1 至 3000 像素之间。');
        }
        image = image.resize({ width: targetWidth });
      }

      const png = image.toPNG();
      await clipboard.write([new ClipboardItem({ 'image/png': new Blob([new Uint8Array(png)], { type: 'image/png' }) })]);
      return { ...image.getSize(), preview: png };
    } finally {
      if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
    }
  }
}

export const plugin: Plugin = {
  id: 'image-portal',
  name: 'Image Portal',
  window: {
    entry: 'index.html',
    width: 320,
    height: 320,
    minWidth: 320,
    minHeight: 320,
    hideOnClose: true,
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window'
  },
  activate(context) {
    context.services.register(IImageService, ImageService);
    context.bindIpc<ImagePortalRpc>({
      processImage: input => context.services.get(IImageService).process(input)
    });
  }
};
