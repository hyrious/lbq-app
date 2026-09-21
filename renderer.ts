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
  if (!path) return showToast('This item has no local file path.', 'error');

  try {
    const result = assertProcessedImage(await window.electron.ipcRenderer.invoke('process-image', { path }));
    currentPath = path;
    originalSize = result;
    showPreview(result, path);
    scaleInput.value = '';
    showToast('Copied to clipboard');
  } catch (error) {
    reportError(error);
  }
}

async function resize() {
  if (!currentPath || !originalSize) return;
  const scale = Number(scaleInput.value);
  const width = Math.round(originalSize.width * scale);
  const height = Math.round(originalSize.height * scale);
  if (!Number.isFinite(scale) || !(0 < width && width <= 3000 && 0 < height && height <= 3000)) {
    return showToast('Scaled dimensions must be between 1 and 3000 pixels.', 'error');
  }

  try {
    const request = { path: currentPath, scale };
    const result = assertProcessedImage(await window.electron.ipcRenderer.invoke('process-image', request));
    originalSize = result;
    showPreview(result, currentPath);
    showToast('Copied to clipboard');
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
    throw new Error('The image response was invalid.');
  }
  const preview = 'preview' in value && value.preview instanceof Uint8Array ? value.preview : undefined;
  return { width: value.width, height: value.height, preview };
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}
