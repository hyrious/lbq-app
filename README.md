# LBQ

LBQ is a small Electron host for built-in desktop tools. It runs from the macOS menu bar or Windows system tray and discovers tools from `tools/*/plugin.ts`; adding a tool does not require editing a shared registry.

The first tool is Image Portal. It copies dropped or pasted images as clean PNG clipboard data, supports resizing, and converts HEIC or HEIF files with macOS `sips`.

## Development

Requirements: Node.js 24 or later. Building the macOS app also requires `sips`, `iconutil`, `plutil`, `ditto`, and `codesign`.

```sh
npm install
npm run typecheck
npm run dev
```

`npm install` downloads Electron 40.1.0 and editor types without adding runtime dependencies. LBQ executes erasable TypeScript directly through Electron's bundled Node.js runtime.

LBQ stays in the menu bar after all tool windows close. Choose Image Portal from the menu, then drop or paste an image. Values below 20 in the resize control are scale factors; values of 20 or more are target widths.

## Build

```sh
npm run app
```

This builds or updates `~/Applications/LBQ.app`, applies an ad-hoc signature, and launches it. Later runs replace only the application sources before signing again.

## Adding a Tool

Create a directory under `tools/` containing at least a `plugin.ts` entry and its renderer assets. The entry exports its metadata and `activate(context)` function. LBQ discovers it automatically and adds it to the tray menu.

Plugins receive a scoped service container, disposable store, and IPC binding function. IPC calls are associated with the caller's `WebContents`, so a renderer cannot select another plugin's namespace.

See [docs/DESIGN.md](docs/DESIGN.md) for the runtime contracts and lifecycle.
