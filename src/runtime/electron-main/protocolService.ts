import { net, protocol } from 'electron';
import { readFile } from 'node:fs/promises';
import { stripTypeScriptTypes } from 'node:module';
import { isAbsolute, join, relative, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IDisposable } from '../../base/common/lifecycle.ts';

export const SHARED_DIRECTORY = 'shared';
export const SOURCE_DIRECTORY = 'src';

const applicationRoot = resolve(import.meta.dirname, '../../..');

/**
 * Layers below `src/` that are safe to serve to a renderer. They must not
 * reach for Node or Electron APIs, which is what makes them runnable both in
 * the main process and in a page.
 */
const RENDERER_LAYERS = new Set(['common', 'browser', 'electron-browser']);

/** Matches `src/**\/{common,browser,electron-browser}/**`, separator-agnostic. */
function isRendererLayer(relativePath: string): boolean {
  return relativePath.split(/[\\/]/).some(segment => RENDERER_LAYERS.has(segment));
}

export class ProtocolService implements IDisposable {
  private readonly toolsRoot = join(applicationRoot, 'tools');
  private readonly sourceRoot = join(applicationRoot, 'src');
  private readonly development: boolean;

  constructor(development: boolean) {
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

    // `app-file://shared/<file>` serves the assets every plugin may import,
    // so a tool can reuse code without reaching outside its own directory.
    if (url.hostname == SHARED_DIRECTORY) {
      return this.serveWithin(resolve(this.toolsRoot, SHARED_DIRECTORY), url.pathname, request, 'shared directory');
    }

    // `app-file://src/<path>` exposes the host's shared layers to plugin
    // renderers, which cannot reach `src/` by relative import.
    if (url.hostname == SOURCE_DIRECTORY) {
      return this.serveWithin(this.sourceRoot, url.pathname, request, 'source directory', relativePath =>
        isRendererLayer(relativePath)
          ? undefined
          : 'Only common, browser, and electron-browser sources are available.');
    }

    if (!/^[a-z0-9-]+$/.test(url.hostname)) return new Response('Invalid plugin identifier.', { status: 400 });

    return this.serveWithin(resolve(this.toolsRoot, url.hostname), url.pathname, request, 'plugin');
  }

  /**
   * Resolves `pathname` below `root`, refusing anything that escapes it. The
   * optional `validate` returns a rejection message for paths that stay inside
   * `root` but are still off limits.
   */
  private async serveWithin(root: string, pathname: string, request: Request, label: string, validate?: (relativePath: string) => string | undefined): Promise<Response> {
    const file = resolve(root, `.${decodeURIComponent(pathname)}`);
    const relativePath = relative(root, file);
    if (isAbsolute(relativePath) || relativePath.startsWith('..')) {
      return new Response(`Path is outside the ${label}.`, { status: 403 });
    }
    const rejection = validate?.(relativePath);
    if (rejection) return new Response(rejection, { status: 403 });
    return this.serve(file, request);
  }

  private async serve(file: string, request: Request): Promise<Response> {
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
