import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const repoRoot = join(import.meta.dirname, '..');

// Copied verbatim into the packaged app. Adding or deleting a tool does not
// require updating this list.
export const sourceEntries = ['main.ts', 'package.json', 'tsconfig.json', 'icon.png', 'src', 'tools'];

/**
 * Ensures the Electron cache is populated. `electron.ts --install` prints the
 * binary path as its last line.
 */
export function installElectron(): string {
  const output = execFileSync(process.execPath, [join(import.meta.dirname, 'electron.ts'), '--install'], { encoding: 'utf8' });
  const binary = output.trim().split(/\r?\n/).at(-1);
  if (!binary || !existsSync(binary)) throw new Error('Electron installation did not produce a binary.');
  return binary;
}

/** Reads the version stamp written by {@link syncSources}, if any. */
export function readStamp(appResources: string): string | undefined {
  try {
    return readFileSync(join(appResources, '.electron-version'), 'utf8').trim();
  } catch {
    return undefined;
  }
}

/**
 * Replaces the packaged sources and writes the version stamp, which records
 * which binary the sources were packaged for.
 */
export function syncSources(appResources: string, stamp: string): void {
  rmSync(appResources, { recursive: true, force: true });
  mkdirSync(appResources, { recursive: true });
  for (const entry of sourceEntries) cpSync(join(repoRoot, entry), join(appResources, entry), { recursive: true });
  writeFileSync(join(appResources, '.electron-version'), stamp);
}

export function exec(file: string, args: string[]): void {
  execFileSync(file, args, { stdio: 'inherit' });
}
