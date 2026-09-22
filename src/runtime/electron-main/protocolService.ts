import { net, protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { isAbsolute, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IDisposable } from '../../base/common/lifecycle.ts';

export class ProtocolService implements IDisposable {
  private readonly toolsRoot: string;
  private readonly development: boolean;

  constructor(toolsRoot: string, development: boolean) {
    this.toolsRoot = toolsRoot;
    this.development = development;
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
        return this.createResponse(stripTypeScriptTypes(source), {
          headers: { 'content-type': 'text/javascript; charset=utf-8' }
        });
      } catch {
        return new Response('File not found.', { status: 404 });
      }
    }
    const response = await net.fetch(pathToFileURL(file).href, { method: request.method, headers: request.headers });
    return this.development ? this.createResponse(response.body, response) : response;
  }

  private createResponse(body: BodyInit | null, init?: ResponseInit): Response {
    if (!this.development) return new Response(body, init);
    const headers = new Headers(init?.headers);
    headers.set('cache-control', 'no-store');
    return new Response(body, { ...init, headers });
  }
}
