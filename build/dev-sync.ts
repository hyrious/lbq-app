import { cpSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const repoRoot = join(import.meta.dirname, '..');
const app = join(import.meta.dirname, 'ImagePortal.app');
const destination = join(app, 'Contents', 'Resources', 'app');
const sourceFiles = ['main.ts', 'preload.ts', 'index.html', 'renderer.ts', 'style.css', 'package.json', 'tsconfig.json'];

if (!existsSync(app)) {
  console.error('build/ImagePortal.app is missing. Run `npm run app` first.');
  process.exit(1);
}

for (const file of sourceFiles) cpSync(join(repoRoot, file), join(destination, file));
console.log(`Synced ${sourceFiles.length} source files to ${destination}`);
