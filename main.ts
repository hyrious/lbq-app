import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { register, stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { app, BrowserWindow, clipboard, ipcMain, nativeImage, net, protocol, shell } from 'electron';

interface ImageRequest {
  path?: string;
  scale?: number;
  width?: number;
}

interface WindowState {
  x: number;
  y: number;
  width: number;
  height: number;
}

const execFileAsync = promisify(execFile);
let mainWindow: BrowserWindow | undefined;

process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = '1';
process.removeAllListeners('warning');

register('data:text/javascript,export async function resolve(r,t,n){if(r==="fs"){return{format:"builtin",shortCircuit:true,url:"node:original-fs"}}return n(r,t)}', import.meta.url);

protocol.registerSchemesAsPrivileged([{
  scheme: 'app-file',
  privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, codeCache: true }
}]);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow?.isMinimized()) mainWindow.restore();
    mainWindow?.focus();
  });
  app.whenReady().then(onReady);
}

app.on('window-all-closed', () => app.quit());

async function onReady() {
  protocol.handle('app-file', async request => {
    const url = request.url.replace('app-file://app', 'file://');
    const fsPath = fileURLToPath(url);
    const response = await net.fetch(url, { method: request.method, headers: request.headers });
    if (response.ok && fsPath.endsWith('.ts')) {
      const body = await response.text();
      return new Response(stripTypeScriptTypes(body), {
        status: response.status,
        statusText: response.statusText,
        headers: { 'content-type': 'text/javascript; charset=utf-8' }
      });
    }
    return response;
  });

  let preloadSource = await readFile(join(import.meta.dirname, 'preload.ts'), 'utf8');
  preloadSource = stripTypeScriptTypes(preloadSource);
  const preloadPath = join(app.getPath('userData'), 'preload.js');
  await writeFile(preloadPath, preloadSource);

  ipcMain.handle('process-image', async (_event, input: ImageRequest) => {
    const { image, transformed } = await loadImage(input);
    clipboard.writeImage(image);
    return {
      ...image.getSize(),
      preview: transformed ? image.toPNG() : undefined
    };
  });

  if (!app.isPackaged) app.dock?.setIcon(join(import.meta.dirname, 'icon.png'));
  console.log(`app.isPackaged = ${app.isPackaged}`);

  const windowStatePath = join(app.getPath('userData'), 'window-state.json');
  let windowState: WindowState;
  try {
    windowState = JSON.parse(await readFile(windowStatePath, 'utf8'));
  } catch {
    windowState = { x: 200, y: 200, width: 320, height: 320 };
  }

  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    ...windowState,
    minWidth: 320,
    minHeight: 320,
    icon: app.isPackaged ? undefined : join(import.meta.dirname, 'icon.png'),
    backgroundColor: '#00000000',
    titleBarStyle: 'hiddenInset',
    vibrancy: 'under-window',
    visualEffectState: 'active',
    webPreferences: { preload: preloadPath }
  });

  let saveWindowStateTimeout: NodeJS.Timeout | undefined;
  const scheduleWindowStateSave = () => {
    clearTimeout(saveWindowStateTimeout);
    saveWindowStateTimeout = setTimeout(() => {
      if (!mainWindow) return;
      windowState = mainWindow.getBounds();
      void writeFile(windowStatePath, JSON.stringify(windowState));
    }, 500);
  };
  mainWindow.on('moved', scheduleWindowStateSave);
  mainWindow.on('resized', scheduleWindowStateSave);
  mainWindow.webContents.setWindowOpenHandler(details => {
    void shell.openExternal(details.url);
    return { action: 'deny' };
  });

  if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: 'detach' });
  const file = new URL('index.html', import.meta.url);
  await mainWindow.loadURL(file.toString().replace('file://', 'app-file://app'));
}

async function loadImage(input: ImageRequest) {
  if (typeof input?.path != 'string' || input.path.length == 0) {
    throw new Error('请选择本地图片文件。');
  }

  let imagePath = input.path;
  let transformed = false;
  let temporaryDirectory: string | undefined;
  try {
    if (/\.hei[cf]$/i.test(imagePath)) {
      temporaryDirectory = await mkdtemp(join(tmpdir(), 'image-portal-'));
      const convertedPath = join(temporaryDirectory, 'image.png');
      try {
        await execFileAsync('sips', ['-s', 'format', 'png', imagePath, '--out', convertedPath]);
      } catch (error) {
        throw new Error(`无法使用 sips 转换 HEIC 图片：${String(error)}`);
      }
      imagePath = convertedPath;
      transformed = true;
    }

    let image = nativeImage.createFromPath(imagePath);
    if (image.isEmpty()) throw new Error(`图片格式不受支持或文件无法读取：${input.path}`);

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
      transformed = true;
    }
    return { image, transformed };
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
