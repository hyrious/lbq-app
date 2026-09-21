interface ElectronBridge {
  webUtils: { getPathForFile(file: File): string };
  ipcRenderer: { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
  process: { platform: NodeJS.Platform; arch: string };
}

interface ImageSize {
  width: number;
  height: number;
}

interface ProcessedImage extends ImageSize {
  preview?: Uint8Array;
}

declare global {
  interface Window {
    electron: ElectronBridge;
  }
}

const dropSurface = getElement<HTMLDivElement>('drop-surface');
const previewPanel = getElement<HTMLDivElement>('preview-panel');
const preview = getElement<HTMLImageElement>('preview');
const dimension = getElement<HTMLSpanElement>('dimension');
const scaleInput = getElement<HTMLInputElement>('scale');
const resizeButton = getElement<HTMLButtonElement>('resize');
const closeButton = getElement<HTMLButtonElement>('close');
const toastRegion = getElement<HTMLDivElement>('toasts');
let currentPath = '';
let originalSize: ImageSize | undefined;
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
  const path = window.electron.webUtils.getPathForFile(file);
  if (!path) return showToast('此项目没有本地文件路径。', 'error');

  try {
    const result = assertProcessedImage(await window.electron.ipcRenderer.invoke('process-image', { path }));
    currentPath = path;
    originalSize = result;
    showPreview(result, path);
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
    const result = assertProcessedImage(await window.electron.ipcRenderer.invoke('process-image', request));
    showPreview(result, currentPath);
    showToast('已复制到剪贴板');
  } catch (error) {
    reportError(error);
  }
}

function showPreview(result: ProcessedImage, path: string) {
  if (previewURL) URL.revokeObjectURL(previewURL);
  previewURL = result.preview
    ? URL.createObjectURL(new Blob([result.preview as BlobPart], { type: 'image/png' }))
    : `app-file://app${path.split('/').map(encodeURIComponent).join('/')}`;
  preview.src = previewURL;
  dimension.textContent = `${result.width} × ${result.height}`;
  previewPanel.classList.remove('hidden');
}

function showToast(message: string, tone: 'info' | 'error' = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast ${tone}`;
  toast.textContent = message;
  toastRegion.append(toast);
  setTimeout(() => {
    toast.classList.add('leaving');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 1600);
}

function reportError(error: unknown) {
  console.error(error);
  showToast(error instanceof Error ? error.message : String(error), 'error');
}

function assertProcessedImage(value: unknown): ProcessedImage {
  if (!value || typeof value != 'object' || !('width' in value) || !('height' in value)
      || typeof value.width != 'number' || typeof value.height != 'number') {
    throw new Error('图片处理结果无效。');
  }
  const preview = 'preview' in value && value.preview instanceof Uint8Array ? value.preview : undefined;
  return { width: value.width, height: value.height, preview };
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`缺少 #${id}`);
  return element as T;
}
