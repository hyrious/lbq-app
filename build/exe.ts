import { execFileSync, spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { productName } from '../src/product.ts';
import { installElectron, readStamp, syncSources } from './common.ts';

const executableName = productName.replaceAll(' ', '');
const localAppData = process.env.LOCALAPPDATA;
if (process.platform != 'win32') throw new Error('App packaging is supported only on Windows.');
if (!localAppData) throw new Error('LOCALAPPDATA is not defined.');

const destination = join(localAppData, 'Programs', executableName);
const executablePath = join(destination, `${executableName}.exe`);
const appResources = join(destination, 'resources', 'app');

const electronBinary = installElectron();
const electronRoot = join(electronBinary, '..');
const electronVersion = readFileSync(join(electronRoot, 'version'), 'utf8').trim();
const stamp = `electron ${electronVersion}`;

// Rebuild the distribution only when it is missing or was built from another
// Electron version. Either way the sources are refreshed afterwards.
if (needsRebuild()) {
  buildDistribution();
} else {
  console.log('Binary is current, syncing sources.');
}

syncSources(appResources, stamp);

quitRunningApp();
spawn(executablePath, [], { detached: true, stdio: 'ignore' }).unref();

function needsRebuild(): boolean {
  if (!existsSync(executablePath)) return true;
  return readStamp(appResources) != stamp;
}

function buildDistribution() {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  cpSync(electronRoot, destination, { recursive: true });
  renameSync(join(destination, 'electron.exe'), executablePath);
}

function quitRunningApp() {
  try {
    const output = execFileSync('tasklist', ['/FI', `IMAGENAME eq ${executableName}.exe`, '/NH'], { encoding: 'utf8' });
    if (!output.includes(`${executableName}.exe`)) return;
    console.log(`Closing the running ${productName} instance.`);
    execFileSync('taskkill', ['/IM', `${executableName}.exe`, '/F'], { stdio: 'inherit' });
  } catch {
    // tasklist/taskkill failures are not fatal: the app is simply not running.
  }
}
