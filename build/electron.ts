import { createWriteStream, existsSync, mkdirSync, rmSync } from 'node:fs';
import { chmod, rename } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import { execFileSync, spawn } from 'node:child_process';

// Remove warning on `shell: true` usage on Windows.
process.removeAllListeners('warning');

const electronVersion = '40.1.0';
const repoRoot = join(import.meta.dirname, '..');
const cacheRoot = join(repoRoot, '.electron');
const binaryPath = getBinaryPath();
const proxy = process.env.HTTPS_PROXY ?? process.env.https_proxy ?? process.env.HTTP_PROXY ?? process.env.http_proxy;

if (process.argv[2] === '--path') {
  console.log(binaryPath);
} else if (process.argv[2] === '--install') {
  await installElectron();
  console.log(binaryPath);
} else {
  await installElectron();
  const child = spawn(binaryPath, process.argv.slice(2), { stdio: 'inherit' });
  child.on('exit', (code, signal) => {
    if (signal) process.kill(process.pid, signal);
    process.exit(code ?? 0);
  });
}

async function installElectron() {
  if (existsSync(binaryPath)) return;

  const zipName = getZipName();
  const downloadURL = `https://github.com/electron/electron/releases/download/v${electronVersion}/${zipName}`;
  const zipPath = join(cacheRoot, zipName);
  const extractPath = join(cacheRoot, `v${electronVersion}`);
  const tempZipPath = zipPath + '.tmp';
  const tempExtractPath = extractPath + '.tmp';

  mkdirSync(cacheRoot, { recursive: true });

  console.error(`Downloading ${downloadURL}`);
  rmSync(tempZipPath, { force: true });
  await downloadFile(downloadURL, tempZipPath);
  await rename(tempZipPath, zipPath);

  rmSync(tempExtractPath, { recursive: true, force: true });
  mkdirSync(tempExtractPath, { recursive: true });
  execFileSync(getUnzipCommand(), getUnzipArgs(zipPath, tempExtractPath), { stdio: 'inherit' });
  rmSync(extractPath, { recursive: true, force: true });
  await rename(tempExtractPath, extractPath);

  if (process.platform !== 'win32') await chmod(binaryPath, 0o755);
}

function getBinaryPath() {
  if (process.platform === 'darwin') {
    return join(cacheRoot, `v${electronVersion}`, 'Electron.app', 'Contents', 'MacOS', 'Electron');
  }
  if (process.platform === 'win32') {
    return join(cacheRoot, `v${electronVersion}`, 'electron.exe');
  }
  return join(cacheRoot, `v${electronVersion}`, 'electron');
}

function getZipName() {
  const platform = process.platform === 'win32' ? 'win32' : process.platform;
  const arch = process.arch === 'arm64' ? 'arm64' : process.arch === 'ia32' ? 'ia32' : 'x64';
  return `electron-v${electronVersion}-${platform}-${arch}.zip`;
}

function getUnzipCommand() {
  return process.platform === 'win32' ? 'powershell.exe' : 'unzip';
}

function getUnzipArgs(zipPath: string, extractPath: string) {
  if (process.platform === 'win32') {
    return ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', `Expand-Archive -LiteralPath ${quote(zipPath)} -DestinationPath ${quote(extractPath)}`];
  }
  return ['-q', zipPath, '-d', extractPath];
}

function quote(value: string) {
  return `'${value.replaceAll("'", "''")}'`;
}

async function downloadFile(url: string, file: string) {
  if (!proxy) {
    try {
      const response = await fetch(url);
      if (!response.ok || !response.body) throw new Error(`${response.status} ${response.statusText}`);
      await pipeline(response.body, createWriteStream(file));
      return;
    } catch (error) {
      console.warn(`fetch failed, retrying with curl: ${String(error)}`);
    }
  }

  const proxies = proxy ? [proxy] : [undefined, 'http://localhost:7890'];
  for (const item of proxies) {
    try {
      const args = ['-L', '--fail', '--connect-timeout', '10', '--output', file];
      if (item) args.push('-x', item);
      args.push(url);
      execFileSync('curl', args, { stdio: 'inherit' });
      return;
    } catch (error) {
      if (item !== proxies.at(-1)) console.warn(`curl failed, retrying with ${proxies.at(-1)}: ${String(error)}`);
      else throw error;
    }
  }
}
