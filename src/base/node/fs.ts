import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

export async function withTemporaryDirectory<T>(prefix: string, task: (directory: string) => Promise<T>): Promise<T> {
	const directory = await mkdtemp(join(tmpdir(), prefix));
	try {
		return await task(directory);
	} finally {
		await rm(directory, { recursive: true, force: true });
	}
}
