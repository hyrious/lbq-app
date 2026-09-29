import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

export class AvatarCache {
  private readonly directory: string;
  private readonly download: (url: string) => Promise<Response>;
  private readonly entries = new Map<string, Promise<string>>();

  constructor(directory: string, download: (url: string) => Promise<Response>) {
    this.directory = directory;
    this.download = download;
  }

  get(owner: string): Promise<string> {
    if (typeof owner != 'string' || !/^[a-z\d][a-z\d-]{0,38}$/i.test(owner)) {
      return Promise.reject(new Error('GitHub owner 无效'));
    }
    owner = owner.toLowerCase();
    let entry = this.entries.get(owner);
    if (!entry) {
      entry = this.load(owner);
      this.entries.set(owner, entry);
      entry.catch(() => this.entries.delete(owner));
    }
    return entry;
  }

  private async load(owner: string): Promise<string> {
    const file = join(this.directory, `${owner}.txt`);
    try {
      const cached = await readFile(file, 'utf8');
      if (/^data:image\/(png|jpeg|webp|gif);base64,/.test(cached)) return cached;
    } catch (error) {
      if (error.code != 'ENOENT') throw error;
    }
    const response = await this.download(`https://github.com/${owner}.png?size=40`);
    if (!response.ok) throw new Error(`GitHub avatar: HTTP ${response.status}`);
    const type = response.headers.get('content-type')?.split(';')[0];
    if (!type || !/^image\/(png|jpeg|webp|gif)$/.test(type)) throw new Error('头像格式无效');
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 1024 * 1024) throw new Error('头像大小无效');
    const image = `data:${type};base64,${bytes.toString('base64')}`;
    await mkdir(this.directory, { recursive: true });
    await writeFile(`${file}.tmp`, image);
    await rename(`${file}.tmp`, file);
    return image;
  }
}
