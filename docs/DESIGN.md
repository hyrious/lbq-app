# LBQ Design

LBQ is a single Electron runtime for trusted, built-in tools. Tools are structurally independent but are not security-sandboxed third-party extensions.

## Principles

- A tool is added by creating `tools/<id>/plugin.ts`; no shared registry changes.
- The host owns Electron lifecycle, Tray, windows, protocol routing, and IPC routing.
- A tool owns its business services, RPC schema, renderer, and assets.
- Root services live for the application. Plugin services and registrations live for one activation.
- Closing a tool window disposes its activation unless `window.hideOnClose` keeps both alive for reuse.
- TypeScript must satisfy `erasableSyntaxOnly`; no bundler or transform step exists.

## Tool Layers

A tool splits its files by which side may load them, mirroring the host's `common`/`browser`/`electron-main` split:

```text
tools/<id>/plugin.ts         Tool metadata and activation
                             imported by the host over file://; must stay at the root
tools/<id>/common/           RPC schema and pure logic; no Node or Electron imports,
                             so both the main process and the page may use it
tools/<id>/electron-main/    Services that use Node or Electron; main process only
tools/<id>/browser/          The renderer entry, its assets, and page-only code
                             served over app-file://<id>/browser/...
```

Because `plugin.ts` is the discovery anchor and must sit directly below the tool directory, everything else lives one level down. The `window.entry` value is resolved against the tool root, so it names the layer: `browser/index.html`.

A renderer reaches its `common/` modules with a relative import (`../common/common.ts`). It cannot reach `electron-main/`, nor `src/` by a relative path, because the protocol confines requests to the tool directory. The host's own shared layers arrive through `app-file://src/` instead.

## Plugin Contract

Each plugin exports `plugin: Plugin`. Its directory name must equal `plugin.id`. Metadata is loaded at startup to build the Tray menu, while `activate()` runs only when the tool is opened.

The optional `platform` field restricts where the plugin loads. When set, `PluginService` skips the plugin on any other platform: it is not imported into the records, does not appear in the Tray menu, and cannot be opened.

Setting `window.hideOnClose` hides the window on close. Opening the tool again shows the existing window without recreating its activation.

The window chrome is fixed. On macOS the host hides the native title bar and draws traffic lights over the page; on every other platform the native bar is kept. The host injects `tools/shared/window-chrome.css` into every plugin page, so a tool only writes `<header class="titlebar">Name</header>` and insets its own content with `padding-top: var(--titlebar-height)` when it needs to sit below the bar. `window.vibrancy` selects the macOS material drawn behind the page and is ignored elsewhere.

An activation registers everything it owns in `subscriptions`. The store also owns the child service container, whose disposable services are released with the plugin.

## IPC Boundary

The preload exposes only `portal.invoke(method, input)` and `portal.getPathForFile(file)`. It never accepts a plugin identifier.

`IpcRouter` records the plugin that owns each `WebContents`. For every invocation it derives the namespace from `event.sender`, then resolves the method within that plugin. Closing the window removes the association and disposing the activation removes its handlers.

RPC schemas provide compile-time request and response types. Main-process handlers still validate renderer input at runtime.

## Resources

The process-local `app-file://<plugin-id>/<path>` protocol serves only files below that plugin's directory. TypeScript renderer modules are stripped when requested. Files outside `tools/<plugin-id>/` are not addressable through the protocol; image previews travel as PNG bytes over IPC.

The reserved host `app-file://shared/<path>` serves `tools/shared/` for assets shared by every plugin. Reference them by absolute URL (`app-file://shared/...`) because a relative path would resolve under the plugin's own host. The window chrome stylesheet is injected by the host, so tools do not link it themselves.

The reserved host `app-file://src/<path>` serves the host's `common`, `browser`, and `electron-browser` layers (for example `app-file://src/base/common/types.ts`). A renderer cannot reach `src/` by relative import, because the protocol refuses any path outside the plugin directory. Only those three layers are addressable: they must stay free of Node and Electron APIs so the same module runs in the main process and in a page. Import them by absolute URL, the same way as `shared`.

## Discovery and Packaging

At startup `PluginService` scans directories immediately below `tools/` and imports the `plugin.ts` of each directory that has one. Electron's bundled Node runtime supports direct dynamic imports of these TypeScript files.

The packaging script copies the application sources recursively. Consequently, adding or deleting a tool does not require updating a source-file list.

## Platform Scope

The host lifecycle and Tray model are cross-platform. Packaging currently targets macOS, and Image Portal uses macOS `sips` for HEIC conversion. Other supported image formats use Electron's `nativeImage` on every platform.
