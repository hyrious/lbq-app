import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { homedir, tmpdir } from 'node:os';

interface HelperBundle {
  bundle: string;
  suffix: string;
  name: string;
}

const repoRoot = join(import.meta.dirname, '..');
const destination = join(homedir(), 'Applications', 'ImagePortal.app');
const appResources = join(destination, 'Contents', 'Resources', 'app');
const stampPath = join(appResources, '.electron-version');
const bundleIdentifier = 'com.hyrious.imageportal';
const sourceFiles = ['main.ts', 'preload.ts', 'index.html', 'renderer.ts', 'style.css', 'package.json', 'tsconfig.json'];
const requiredTools = ['ditto', 'plutil', 'mv', 'sips', 'iconutil', 'codesign', 'osascript', 'sleep'];
const helperBundles: HelperBundle[] = [
  { bundle: 'Electron Helper.app', suffix: 'helper', name: 'Image Portal Helper' },
  { bundle: 'Electron Helper (Renderer).app', suffix: 'helper.Renderer', name: 'Image Portal Helper (Renderer)' },
  { bundle: 'Electron Helper (GPU).app', suffix: 'helper.GPU', name: 'Image Portal Helper (GPU)' },
  { bundle: 'Electron Helper (Plugin).app', suffix: 'helper.Plugin', name: 'Image Portal Helper (Plugin)' }
];

if (process.platform != 'darwin') throw new Error('App packaging is supported only on macOS.');
for (const tool of requiredTools) requireTool(tool);

const electronBinary = execFileSync(process.execPath, [join(import.meta.dirname, 'electron.ts'), '--install'], { encoding: 'utf8' }).trim().split(/\r?\n/).at(-1);
if (!electronBinary || !existsSync(electronBinary)) throw new Error('Electron installation did not produce a binary.');
const electronApp = join(electronBinary, '..', '..', '..');
const electronVersion = execFileSync('plutil', ['-extract', 'CFBundleShortVersionString', 'raw', join(electronApp, 'Contents', 'Info.plist')], { encoding: 'utf8' }).trim();
const stamp = `electron ${electronVersion}`;

// Rebuild the bundle only when it is missing or was built from another Electron
// version. Either way the sources are refreshed and the app is re-signed; the
// signature seals the resources, so it must happen after the copy.
const rebuilt = needsRebuild();
if (rebuilt) {
  buildBundle();
} else {
  console.log('Binary is current, syncing sources.');
}

mkdirSync(appResources, { recursive: true });
for (const file of sourceFiles) cpSync(join(repoRoot, file), join(appResources, file));
writeFileSync(stampPath, stamp);

exec('codesign', ['--force', '--deep', '--sign', '-', destination]);
refreshLaunchServices();
quitRunningApp();
exec('open', [destination]);

function needsRebuild(): boolean {
  if (!existsSync(join(destination, 'Contents', 'MacOS', 'ImagePortal'))) return true;
  try {
    return readFileSync(stampPath, 'utf8').trim() != stamp;
  } catch {
    return true;
  }
}

function buildBundle() {
  rmSync(destination, { recursive: true, force: true });
  mkdirSync(dirname(destination), { recursive: true });
  exec('ditto', [electronApp, destination]);
  exec('mv', [join(destination, 'Contents', 'MacOS', 'Electron'), join(destination, 'Contents', 'MacOS', 'ImagePortal')]);

  const mainPlist = join(destination, 'Contents', 'Info.plist');
  replacePlist(mainPlist, 'CFBundleExecutable', 'ImagePortal');
  replacePlist(mainPlist, 'CFBundleName', 'Image Portal');
  replacePlist(mainPlist, 'CFBundleDisplayName', 'Image Portal');
  replacePlist(mainPlist, 'CFBundleIdentifier', bundleIdentifier);
  replacePlist(mainPlist, 'NSHumanReadableCopyright', 'Copyright © 2026 hyrious');

  for (const helper of helperBundles) {
    const plist = join(destination, 'Contents', 'Frameworks', helper.bundle, 'Contents', 'Info.plist');
    replacePlist(plist, 'CFBundleIdentifier', `${bundleIdentifier}.${helper.suffix}`);
    replacePlist(plist, 'CFBundleName', helper.name);
  }

  const temporaryDirectory = mkdtempSync(join(tmpdir(), 'image-portal-icon-'));
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

  console.log('Closing the running Image Portal instance.');
  exec('osascript', ['-e', `tell ${application} to quit`]);
  for (let attempt = 0; attempt < 50; attempt++) {
    if (execFileSync('osascript', ['-e', `${application} is running`], { encoding: 'utf8' }).trim() != 'true') return;
    execFileSync('sleep', ['0.1']);
  }
  throw new Error('Image Portal did not quit within 5 seconds.');
}

function requireTool(tool: string) {
  try {
    execFileSync('which', [tool], { stdio: 'ignore' });
  } catch {
    throw new Error(`Required system tool not found: ${tool}`);
  }
}

function exec(file: string, args: string[]) {
  execFileSync(file, args, { stdio: 'inherit' });
}

function replacePlist(plist: string, key: string, value: string) {
  exec('plutil', ['-replace', key, '-string', value, plist]);
}

function makeIcon(size: number, destinationPath: string) {
  exec('sips', ['-z', String(size), String(size), join(repoRoot, 'icon.png'), '--out', destinationPath]);
  if (!existsSync(destinationPath)) throw new Error(`Failed to create ${basename(destinationPath)} in ${dirname(destinationPath)}`);
}
