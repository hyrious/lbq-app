import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { register, stripTypeScriptTypes } from 'node:module';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { app, BrowserWindow, clipboard, ipcMain, nativeImage, nativeTheme, net, protocol, shell } from 'electron';

interface ImageRequest {
  path?: string;
  scale?: number;
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

  ipcMain.handle('copy-image', async (_event, input: ImageRequest) => {
    const image = await loadImage(input);
    clipboard.writeImage(image);
    return image.getSize();
  });
  ipcMain.handle('read-image', async (_event, input: string | ImageRequest) => {
    const image = await loadImage(typeof input == 'string' ? { path: input } : input);
    return image.toDataURL();
  });

  if (!app.isPackaged) app.dock?.setIcon(join(import.meta.dirname, 'icon.png'));
  console.log(`app.isPackaged = ${app.isPackaged}`);

  const windowStatePath = join(app.getPath('userData'), 'window-state.json');
  let windowState: WindowState;
  try {
    windowState = JSON.parse(await readFile(windowStatePath, 'utf8'));
  } catch {
    windowState = { x: 200, y: 200, width: 720, height: 620 };
  }

  mainWindow = new BrowserWindow({
    autoHideMenuBar: true,
    ...windowState,
    icon: app.isPackaged ? undefined : join(import.meta.dirname, 'icon.png'),
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#1f1f1f' : '#ffffff',
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
    throw new Error('An image file path is required.');
  }

  let imagePath = input.path;
  let temporaryDirectory: string | undefined;
  try {
    if (/\.hei[cf]$/i.test(imagePath)) {
      temporaryDirectory = await mkdtemp(join(tmpdir(), 'image-portal-'));
      const convertedPath = join(temporaryDirectory, 'image.png');
      try {
        await execFileAsync('sips', ['-s', 'format', 'png', imagePath, '--out', convertedPath]);
      } catch (error) {
        throw new Error(`Unable to convert HEIC image with sips: ${String(error)}`);
      }
      imagePath = convertedPath;
    }

    let image = nativeImage.createFromPath(imagePath);
    if (image.isEmpty()) throw new Error(`Unsupported or unreadable image: ${input.path}`);

    if (input.scale != null) {
      if (!Number.isFinite(input.scale) || input.scale <= 0) throw new Error('Scale must be a positive number.');
      const { width, height } = image.getSize();
      const scaledWidth = Math.round(width * input.scale);
      const scaledHeight = Math.round(height * input.scale);
      if (!(0 < scaledWidth && scaledWidth <= 3000 && 0 < scaledHeight && scaledHeight <= 3000)) {
        throw new Error('Scaled dimensions must be between 1 and 3000 pixels.');
      }
      image = image.resize({ width: scaledWidth });
    }
    return image;
  } finally {
    if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true });
  }
}
