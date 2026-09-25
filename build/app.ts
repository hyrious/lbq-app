import { execFileSync } from 'node:child_process';
import { hash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { basename, dirname, join } from 'node:path';
import { bundleIdentifier, productName } from '../src/product.ts';
import { exec, installElectron, readStamp, repoRoot, syncSources } from './common.ts';

interface HelperBundle {
  bundle: string;
  suffix: string;
  name: string;
}

const executableName = productName.replaceAll(' ', '');
const destination = join(homedir(), 'Applications', `${executableName}.app`);
const appResources = join(destination, 'Contents', 'Resources', 'app');
const helperBundles: HelperBundle[] = [
  { bundle: 'Electron Helper.app', suffix: 'helper', name: `${productName} Helper` },
  { bundle: 'Electron Helper (Renderer).app', suffix: 'helper.Renderer', name: `${productName} Helper (Renderer)` },
  { bundle: 'Electron Helper (GPU).app', suffix: 'helper.GPU', name: `${productName} Helper (GPU)` },
  { bundle: 'Electron Helper (Plugin).app', suffix: 'helper.Plugin', name: `${productName} Helper (Plugin)` }
];

if (process.platform != 'darwin') throw new Error('App packaging is supported only on macOS.');

const electronBinary = installElectron();
const electronApp = join(electronBinary, '..', '..', '..');
const electronVersion = execFileSync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', join(electronApp, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();
const iconHash = hash('sha256', readFileSync(join(repoRoot, 'icon.png')));
const stamp = `electron ${electronVersion}\nicon ${iconHash}`;

// The signature seals the resources, so re-signing must happen after the copy.
const rebuilt = needsRebuild();
if (rebuilt) {
  buildBundle();
} else {
  console.log('Binary is current, syncing sources.');
}

syncSources(appResources, stamp);

exec('codesign', ['--force', '--deep', '--sign', '-', destination]);
refreshLaunchServices();
quitRunningApp();
exec('open', [destination]);

function needsRebuild(): boolean {
  if (!existsSync(join(destination, 'Contents', 'MacOS', executableName))) return true;
  return readStamp(appResources) != stamp;
}

function buildBundle() {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  exec('ditto', [electronApp, destination]);
  exec('mv', [join(destination, 'Contents', 'MacOS', 'Electron'), join(destination, 'Contents', 'MacOS', executableName)]);

  const mainPlist = join(destination, 'Contents', 'Info.plist');
  replacePlist(mainPlist, 'CFBundleExecutable', executableName);
  replacePlist(mainPlist, 'CFBundleName', productName);
  replacePlist(mainPlist, 'CFBundleDisplayName', productName);
  replacePlist(mainPlist, 'CFBundleIdentifier', bundleIdentifier);
  replacePlist(mainPlist, 'NSHumanReadableCopyright', 'Copyright © 2026 hyrious');

  for (const helper of helperBundles) {
    const plist = join(destination, 'Contents', 'Frameworks', helper.bundle, 'Contents', 'Info.plist');
    replacePlist(plist, 'CFBundleIdentifier', `${bundleIdentifier}.${helper.suffix}`);
    replacePlist(plist, 'CFBundleName', helper.name);
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'lbq-icon-'));
  try {
    const iconset = join(temporaryDirectory, 'icon.iconset');
    mkdirSync(iconset);
    for (const size of [16, 32, 128, 256, 512]) {
      makeIcon(size, join(iconset, `icon_${size}x${size}.png`));
      makeIcon(size * 2, join(iconset, `icon_${size}x${size}@2x.png`));
    }
    exec('iconutil', ['-c', 'icns', iconset, '-o', join(destination, 'Contents', 'Resources', 'icon.icns')]);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
  replacePlist(mainPlist, 'CFBundleIconFile', 'icon');
}

function refreshLaunchServices() {
  const lsregister = '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister';
  exec(lsregister, ['-f', destination]);
}

function quitRunningApp() {
  const application = `application id "${bundleIdentifier}"`;
  if (execFileSync('osascript', ['-e', `${application} is running`], { encoding: 'utf8' }).trim() != 'true') return;

  console.log(`Closing the running ${productName} instance.`);
  exec('osascript', ['-e', `tell ${application} to quit`]);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (execFileSync('osascript', ['-e', `${application} is running`], { encoding: 'utf8' }).trim() != 'true') return;
    execFileSync('sleep', ['0.1']);
  }
  throw new Error('Image Portal did not quit within 5 seconds.');
}

function replacePlist(plist: string, key: string, value: string) {
  exec('plutil', ['-replace', key, '-string', value, plist]);
}

function makeIcon(size: number, destinationPath: string) {
  exec('sips', ['-z', String(size), String(size), join(repoRoot, 'icon.png'), '--out', destinationPath]);
  if (!existsSync(destinationPath)) throw new Error(`Failed to create ${basename(destinationPath)} in ${dirname(destinationPath)}`);
}
