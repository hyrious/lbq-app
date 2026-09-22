import { net, protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IDisposable } from '../../base/common/lifecycle.ts';

export class ProtocolService implements IDisposable {
  private readonly toolsRoot: string;

  constructor(toolsRoot: string) {
    this.toolsRoot = toolsRoot;
  }

  register(): void {
    protocol.handle('app-file', request => this.handle(request));
  }

  dispose(): void {
    protocol.unhandle('app-file');
  }

  private async handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (!/^[a-z0-9-]+$/.test(url.hostname)) return new Response('Invalid plugin identifier.', { status: 400 });

    const pluginRoot = resolve(this.toolsRoot, url.hostname);
    const file = resolve(pluginRoot, `.${decodeURIComponent(url.pathname)}`);
    const relativePath = relative(pluginRoot, file);
    if (isAbsolute(relativePath) || relativePath.startsWith('..')) return new Response('Path is outside the plugin.', { status: 403 });

    if (file.endsWith('.ts')) {
      try {
        const source = await readFile(file, 'utf8');
        return new Response(stripTypeScriptTypes(source), {
          headers: { 'content-type': 'text/javascript; charset=utf-8' }
        });
      } catch {
        return new Response('File not found.', { status: 404 });
      }
    }
    return net.fetch(pathToFileURL(file).href, { method: request.method, headers: request.headers });
  }
}
