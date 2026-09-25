import { createInvoke, element, getElement, showToast } from 'app-file://shared/renderer.ts';
import type { ImagePortalRpc, ProcessedImage } from '../common/common.ts';

const invoke = createInvoke<ImagePortalRpc>();

const dropSurface = getElement<HTMLDivElement>('drop-surface');
const previewPanel = getElement<HTMLDivElement>('preview-panel');
const preview = getElement<HTMLImageElement>('preview');
const dimension = getElement<HTMLSpanElement>('dimension');
const scaleInput = getElement<HTMLInputElement>('scale');
const resizeButton = getElement<HTMLButtonElement>('resize');
const closeButton = getElement<HTMLButtonElement>('close');
let currentPath = '';
let originalSize: ProcessedImage | undefined;
let previewURL = '';

dropSurface.ondragover = previewPanel.ondragover = event => {
  event.preventDefault();
  dropSurface.classList.add('active');
};
dropSurface.ondragleave = previewPanel.ondragleave = () => dropSurface.classList.remove('active');
dropSurface.ondrop = previewPanel.ondrop = event => {
  event.preventDefault();
  dropSurface.classList.remove('active');
  void load(event.dataTransfer?.files[0]);
};
document.onpaste = event => void load(event.clipboardData?.files[0]);
closeButton.onclick = () => previewPanel.classList.add('hidden');
resizeButton.onclick = () => void resize();
scaleInput.onkeydown = event => {
  if (event.key == 'Enter') void resize();
};

async function load(file?: File) {
  if (!file) return;
  const path = window.portal.getPathForFile(file);
  if (!path) return showToast('此项目没有本地文件路径。', 'error');

  try {
    const result = await invoke('processImage', { path });
    currentPath = path;
    originalSize = result;
    showPreview(result);
    scaleInput.value = '';
    showToast('已复制到剪贴板');
  } catch (error) {
    reportError(error);
  }
}

async function resize() {
  if (!currentPath || !originalSize) return;
  const value = Number(scaleInput.value);
  const width = value < 20 ? Math.round(originalSize.width * value) : Math.round(value);
  const height = Math.round(originalSize.height * width / originalSize.width);
  if (!Number.isFinite(value) || !(0 < width && width <= 3000 && 0 < height && height <= 3000)) {
    return showToast('缩放后的尺寸须在 1 至 3000 像素之间。', 'error');
  }

  try {
    const request = value < 20 ? { path: currentPath, scale: value } : { path: currentPath, width };
    const result = await invoke('processImage', request);
    showPreview(result);
    showToast('已复制到剪贴板');
  } catch (error) {
    reportError(error);
  }
}

function showPreview(result: ProcessedImage) {
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = URL.createObjectURL(new Blob([result.preview as BlobPart], { type: 'image/png' }));
  preview.src = previewURL;
  dimension.textContent = `${result.width} × ${result.height}`;
  previewPanel.classList.remove('hidden');
}

function reportError(error: unknown) {
  console.error(error);
  showToast(error instanceof Error ? error.message : String(error), 'error');
}
