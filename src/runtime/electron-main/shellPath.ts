import { execFile } from 'node:child_process';
import { userInfo } from 'node:os';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function restoreShellPath(): Promise<void> {
  if (process.platform != 'darwin') return;
  try {
    const shell = process.env.SHELL || userInfo().shell || '/bin/zsh';
    const { stdout } = await execFileAsync(shell, ['-ilc', 'printf "\\0%s\\0" "$PATH"'], {
      encoding: 'utf8',
      timeout: 10_000
    });
    // Ignore output from shell startup files.
    const path = stdout.split('\0')[1];
    if (path) process.env.PATH = path;
  } catch {
    console.warn('Failed to read the login shell PATH; using the inherited PATH.');
  }
}
