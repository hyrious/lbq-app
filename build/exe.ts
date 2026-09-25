import { execFileSync, spawn } from 'node:child_process';
import { hash } from 'node:crypto';
import { cpSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { productName } from '../src/product.ts';
import { exec, installElectron, readStamp, repoRoot, syncSources } from './common.ts';

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
const iconHash = hash('sha256', readFileSync(join(repoRoot, 'icon.png')));
const stamp = `electron ${electronVersion}\nicon ${iconHash}`;

// The running app holds the executable and its icon open, so it must be
// stopped before the distribution can be rebuilt.
quitRunningApp();

// Rebuild the distribution only when it is missing or was built from another
// Electron version or icon. Either way the sources are refreshed afterwards.
if (needsRebuild()) {
  buildDistribution();
} else {
  console.log('Binary is current, syncing sources.');
}

syncSources(appResources, stamp);

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

  const iconPath = join(destination, 'icon.ico');
  makeIcon(iconPath);
  exec('rcedit', [executablePath, '--set-icon', iconPath]);
}

/** Renders icon.png into a multi-size .ico using Pillow from the local Python. */
function makeIcon(destinationPath: string) {
  const script = `import sys\nfrom PIL import Image\nsizes = [(n, n) for n in (16, 24, 32, 48, 64, 128, 256)]\nImage.open(sys.argv[1]).convert('RGBA').save(sys.argv[2], format='ICO', sizes=sizes)`;
  exec('python', ['-c', script, join(repoRoot, 'icon.png'), destinationPath]);
  if (!existsSync(destinationPath)) throw new Error(`Failed to create ${destinationPath}`);
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
