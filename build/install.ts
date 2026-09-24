// This file fetches electron and node types for better development experience.
// The electron binary and its types always come from the same version pinned in
// build/electron.ts, so `node_modules/electron` cannot drift from the runtime.
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { unzipSync } from 'node:zlib';

// Remove warning on `shell: true` usage on Windows.
process.removeAllListeners('warning');

const electron = join(import.meta.dirname, 'electron.ts');
const electronBinaryPath = execFileSync(process.execPath, [electron, '--install'], { encoding: 'utf8' }).trimEnd().split(/\r?\n/).at(-1)!;

const repoRoot = join(import.meta.dirname, '..');
const electronPackagePath = electronBinaryPath.includes('MacOS')
  ? join(electronBinaryPath, '..', '..', '..', '..', '..', 'package.json')
  : join(electronBinaryPath, '..', '..', 'package.json');

if (existsSync(electronPackagePath)) {
  // Electron was installed by npm, it has types we can copy over.
  const electronTypesPath = join(electronPackagePath, '..', 'electron.d.ts');
  const nodeTypesPath = join(electronPackagePath, '..', 'node_modules', '@types', 'node');

  const { name, version, types } = JSON.parse(readFileSync(electronPackagePath, 'utf8'));
  mkdirSync(join(repoRoot, 'node_modules', 'electron'), { recursive: true });
  writeFileSync(join(repoRoot, 'node_modules', 'electron', 'package.json'), JSON.stringify({ name, version, types }, null, 2) + '\n');
  writeFileSync(join(repoRoot, 'node_modules', 'electron', types), readFileSync(electronTypesPath));

  mkdirSync(join(repoRoot, 'node_modules', '@types', 'node'), { recursive: true });
  cpSync(nodeTypesPath, join(repoRoot, 'node_modules', '@types', 'node'), { recursive: true });
  const { dependencies } = JSON.parse(readFileSync(join(nodeTypesPath, 'package.json'), 'utf8'));
  for (const depName in dependencies) {
    const depPath = join(nodeTypesPath, '..', '..', depName);
    cpSync(depPath, join(repoRoot, 'node_modules', depName), { recursive: true });
  }
} else {
  const versions = JSON.parse(execFileSync(electronBinaryPath, ['-p', 'JSON.stringify(process.versions)'], {
    shell: process.platform === 'win32',
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
    encoding: 'utf8'
  }));

  mkdirSync(join(repoRoot, 'node_modules', 'electron'), { recursive: true });
  writeFileSync(join(repoRoot, 'node_modules', 'electron', 'package.json'), JSON.stringify({ name: 'electron', version: versions.electron, types: 'electron.d.ts' }, null, 2) + '\n');
  await downloadNodeModules('electron', versions.electron, ['electron.d.ts'], false);
  await downloadNodeModules('@types/node', versions.node.split('.').shift(), undefined, true);
}

console.log('Done.');

async function downloadNodeModules(name: string, version: string, files?: string[], recursive?: boolean) {
  if (files ? files.every(file => existsSync(join(repoRoot, 'node_modules', name, file))) : existsSync(join(repoRoot, 'node_modules', name))) {
    console.info(`node_modules/${name} already exists, skipping download.`);
    return;
  }
  if (!/^\d+\.\d+\.\d+$/.test(version)) {
    version = await fetch(`https://data.jsdelivr.com/v1/packages/npm/${name}/resolved?specifier=${version}`).then(r => r.json()).then(e => e.version);
  }
  const corgi = 'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*';
  const tarballUrl = await fetch(`https://registry.npmjs.org/${name}/${version}`, { headers: { 'content-type': corgi } }).then(r => r.json()).then(e => e.dist.tarball);

  let buffer = await fetch(tarballUrl).then(r => r.arrayBuffer()).then(b => Buffer.from(b));
  buffer = unzipSync(buffer);

  const str = (i: number, n: number) => String.fromCharCode(...buffer.subarray(i, i + n)).replace(/\0.*$/g, '');
  let offset = 0;
  while (offset < buffer.length) {
    const fullPath = str(offset, 100);
    const size = parseInt(str(offset + 124, 12), 8);
    offset += 512;
    if (!isNaN(size)) {
      const subpath = fullPath.replace(/^[^\/]+\//, '');
      if (subpath && !subpath.endsWith('/') && (!files || files.includes(subpath))) {
        const file = join(repoRoot, 'node_modules', name, subpath);
        mkdirSync(dirname(file), { recursive: true });
        const content = buffer.subarray(offset, offset + size);
        writeFileSync(file, content);
        if (recursive && subpath === 'package.json') {
          const { dependencies } = JSON.parse(content.toString('utf8'));
          for (const depName in dependencies) {
            await downloadNodeModules(depName, dependencies[depName], undefined, true);
          }
        }
      }
      offset += size + 511 & ~511;
    }
  }
}
