interface ElectronBridge {
  webUtils: { getPathForFile(file: File): string };
  ipcRenderer: { invoke(channel: string, ...args: unknown[]): Promise<unknown> };
  process: { platform: NodeJS.Platform; arch: string };
}

interface ImageSize {
  width: number;
  height: number;
}

declare global {
  interface Window {
    electron: ElectronBridge;
  }
}

const dropArea = getElement<HTMLDivElement>('drop-area');
const previewPanel = getElement<HTMLDivElement>('preview-panel');
const preview = getElement<HTMLImageElement>('preview');
const dimension = getElement<HTMLSpanElement>('dimension');
const scaleInput = getElement<HTMLInputElement>('scale');
const resizeButton = getElement<HTMLButtonElement>('resize');
const closeButton = getElement<HTMLButtonElement>('close');
const defaultTitle = document.title;
let currentPath = '';
let originalSize: ImageSize | undefined;
let titleTimer = 0;
let titleVersion = 0;

dropArea.ondragover = previewPanel.ondragover = event => {
  event.preventDefault();
  dropArea.classList.add('active');
};
dropArea.ondragleave = previewPanel.ondragleave = () => dropArea.classList.remove('active');
dropArea.ondrop = previewPanel.ondrop = event => {
  event.preventDefault();
  dropArea.classList.remove('active');
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
  if (!path) return showError(new Error('The pasted item has no local file path.'));

  try {
    currentPath = path;
    const [dataURL, size] = await Promise.all([
      window.electron.ipcRenderer.invoke('read-image', path),
      window.electron.ipcRenderer.invoke('copy-image', { path })
    ]);
    preview.src = assertString(dataURL);
    originalSize = assertImageSize(size);
    updateHint(originalSize);
    previewPanel.classList.remove('hidden');
    scaleInput.value = '';
    setPortalTitle('Copied to clipboard', 1500);
  } catch (error) {
    showError(error);
  }
}

async function resize() {
  if (!currentPath || !originalSize) return;
  const scale = Number(scaleInput.value);
  const width = Math.round(originalSize.width * scale);
  const height = Math.round(originalSize.height * scale);
  if (!Number.isFinite(scale) || !(0 < width && width <= 3000 && 0 < height && height <= 3000)) {
    window.alert('Scaled dimensions must be between 1 and 3000 pixels.');
    return;
  }

  try {
    const request = { path: currentPath, scale };
    const [dataURL, size] = await Promise.all([
      window.electron.ipcRenderer.invoke('read-image', request),
      window.electron.ipcRenderer.invoke('copy-image', request)
    ]);
    preview.src = assertString(dataURL);
    updateHint(assertImageSize(size));
    setPortalTitle('Copied to clipboard', 1500);
  } catch (error) {
    showError(error);
  }
}

function updateHint(size: ImageSize) {
  dimension.textContent = `${size.width} × ${size.height}`;
}

function setPortalTitle(title: string, restoreAfter = 0) {
  const version = ++titleVersion;
  clearTimeout(titleTimer);
  document.title = title;
  if (restoreAfter) {
    titleTimer = window.setTimeout(() => {
      if (version == titleVersion) document.title = defaultTitle;
    }, restoreAfter);
  }
}

function showError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(error);
  setPortalTitle('Image Portal', 1500);
  window.alert(message);
}

function assertString(value: unknown): string {
  if (typeof value != 'string') throw new Error('The image preview response was invalid.');
  return value;
}

function assertImageSize(value: unknown): ImageSize {
  if (!value || typeof value != 'object' || !('width' in value) || !('height' in value)
      || typeof value.width != 'number' || typeof value.height != 'number') {
    throw new Error('The image size response was invalid.');
  }
  return { width: value.width, height: value.height };
}

function getElement<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing #${id}`);
  return element as T;
}
