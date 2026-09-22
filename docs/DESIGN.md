# LBQ Design

LBQ is a single Electron runtime for trusted, built-in tools. Tools are structurally independent but are not security-sandboxed third-party extensions.

## Principles

- A tool is added by creating `tools/<id>/plugin.ts`; no shared registry changes.
- The host owns Electron lifecycle, Tray, windows, protocol routing, and IPC routing.
- A tool owns its business services, RPC schema, renderer, and assets.
- Root services live for the application. Plugin services and registrations live for one activation.
- Closing a tool window disposes its activation. Reopening it creates a fresh scope.
- TypeScript must satisfy `erasableSyntaxOnly`; no bundler or transform step exists.

## Plugin Contract

Each plugin exports `plugin: Plugin`. Its directory name must equal `plugin.id`. Metadata is loaded at startup to build the Tray menu, while `activate()` runs only when the tool is opened.

`PluginContext` contains:

- `services`: a child `InstantiationService` that inherits host services.
- `subscriptions`: the activation's `DisposableStore`.
- `bindIpc<S>(handlers)`: typed RPC handlers scoped to the plugin and disposed with its activation.

An activation registers everything it owns in `subscriptions`. The store also owns the child service container, whose disposable services are released with the plugin.

## IPC Boundary

The preload exposes only `portal.invoke(method, input)` and `portal.getPathForFile(file)`. It never accepts a plugin identifier.

`IpcRouter` records the plugin that owns each `WebContents`. For every invocation it derives the namespace from `event.sender`, then resolves the method within that plugin. Closing the window removes the association and disposing the activation removes its handlers.

RPC schemas provide compile-time request and response types. Main-process handlers still validate renderer input at runtime.

## Resources

The process-local `app-file://<plugin-id>/<path>` protocol serves only files below that plugin's directory. TypeScript renderer modules are stripped when requested. Files outside `tools/<plugin-id>/` are not addressable through the protocol; image previews travel as PNG bytes over IPC.

## Discovery and Packaging

At startup `PluginService` scans directories immediately below `tools/` and imports each `plugin.ts`. Electron 40.1.0's bundled Node runtime supports direct dynamic imports of these TypeScript files.

The packaging script copies `main.ts`, `src/`, and `tools/` recursively into `LBQ.app`. Consequently, adding or deleting a tool does not require updating a source-file list.

## Platform Scope

The host lifecycle and Tray model are cross-platform. Packaging currently targets macOS, and Image Portal uses macOS `sips` for HEIC conversion. Other supported image formats use Electron's `nativeImage` on every platform.
