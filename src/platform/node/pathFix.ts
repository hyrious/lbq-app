import { userInfo } from 'node:os';
import { execFileAsync } from '../../base/node/process.ts';

export async function fixMacOSShellPaths(): Promise<void> {
	if (process.platform !== 'darwin') return;
	try {
		const shell = process.env.SHELL || userInfo().shell || '/bin/zsh';
		const { stdout } = await execFileAsync(shell, ['-ilc', 'printf "\\0%s\\0" "$PATH"'], {
			encoding: 'utf8',
			timeout: 10_000
		});
		const path = stdout.split('\0')[1];
		if (path) process.env.PATH = path;
	} catch (e) {
		console.warn('Failed to read the login shell PATH.');
		console.warn(e);
	}
}
