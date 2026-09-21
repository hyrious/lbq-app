# File responsibilities

Repository layout:

```
image-portal/
├── package.json            # type:module, main:main.ts, scripts, pinned versions
├── tsconfig.json           # erasableSyntaxOnly, noEmit, nodenext
├── .gitignore              # .electron, node_modules, .codex-run
├── icon.png                # app icon source (dev dock icon + packaged icns)
├── main.ts                 # main process entry
├── preload.ts              # ipc bridge (self-contained, no import)
├── index.html              # window document
├── renderer.ts             # drag/drop, preview, controls
├── style.css               # migrated from the reference page
├── docs/                   # this design set
└── build/
    ├── electron.ts         # download + launch the Electron binary
    ├── install.ts          # fetch electron / @types/node into node_modules
    └── app.ts              # build/sync ~/Applications/ImagePortal.app and open it
```

## `main.ts`

Owns: window lifecycle, protocol, native image pipeline, IPC.

- Call `register()` with the data-URL loader that short-circuits `fs` →
  `node:original-fs` (ported from the reference project). Do this before
  `app.whenReady()`.
- `protocol.registerSchemesAsPrivileged([{ scheme: 'app-file', privileges: {
  standard, secure, supportFetchAPI, corsEnabled, codeCache } }])`.
- In `app.whenReady()`: `protocol.handle('app-file', ...)` which maps
  `app-file://app<path>` back to a `file://` URL, calls `net.fetch`, and if the
  path ends with `.ts`, runs `stripTypeScriptTypes(body)` and returns
  `text/javascript; charset=utf-8`. Port verbatim from the reference project.
- Strip `preload.ts` → `join(app.getPath('userData'), 'preload.js')` at startup.
- `requestSingleInstanceLock()`; `window-all-closed` → `app.quit()`.
- Dock / window icon: `icon.png` in dev, bundle icon when `app.isPackaged`.
- Persist window bounds to `userData/window-state.json` (debounced on `moved`
  / `resized`), matching the reference project's pattern.
- `webContents.setWindowOpenHandler` → `shell.openExternal`, deny.
- Open DevTools only when not packaged.

IPC handlers (all `ipcMain.handle`):

- `process-image({ path, scale? })`:
  1. If `path` ends with `.heic`/`.heif` (case-insensitive), convert to a temp
     PNG with `sips -s format png <in> --out <tmp>`.
  2. `nativeImage.createFromPath(...)`; if `scale` is a finite positive number,
     `nativeImage.resize({ width: Math.round(w*scale) })`.
  3. `clipboard.writeImage(image)`.
  4. Return `{ width, height, preview? }`, where `preview` is PNG bytes
     (`image.toPNG()`) **only when a transform happened** (HEIC conversion or
     scaling). Untransformed images are previewed by the renderer directly
     from the original path, so no re-encode is needed.
  Reject with a clear error message on unsupported input.

## `preload.ts`

Self-contained. Only `require('electron')`; the typed annotation pattern is
`: typeof import('electron')` as in the reference project. Expose on
`window.electron`:

- `webUtils.getPathForFile(file): string`
- `ipcRenderer.invoke(channel, ...args): Promise<unknown>`
- `process.platform`, `process.arch`

No `on`/`send` surface unless needed.

## `renderer.ts`

- Drag/drop handlers on the full-window drop area and the preview panel;
  `dragover` preventDefault.
- On drop/paste, take the first file, resolve its path via
  `window.electron.webUtils.getPathForFile`.
- Call `process-image` once; it both writes the clipboard and returns the size
  plus optional preview bytes.
- Preview: when `preview` bytes are present (HEIC or scaled), build a Blob
  object URL (`URL.createObjectURL`); otherwise point `<img>` at the original
  file through `app-file://app<percent-encoded path>`. Revoke the previous
  object URL before replacing it.
- Controls: scale input + "Resize" button → call `process-image` with the parsed
  scale, then refresh preview. Dimensions must be > 0 and ≤ 3000.
- Feedback: a small toast region replaces the window-title flash and the native
  `alert`; errors render as a red toast.
- No `navigator.clipboard`, no libheif, no canvas re-encoding.

## `index.html` / `style.css`

- Full-window drop surface (no description); a centered "Image Portal" title
  sits in the top drag gutter beside the traffic lights, and the dashed outline
  with its centered hint is the rest of the chrome.
- Loads `renderer.ts` via `<script type="module" src="renderer.ts">`.
- A toast region and a floating glass toolbar replace the old bottom bar.
- The `.drop-area` gutter (16px sides/bottom, 44px top) drags the window;
  the inset `.drop-surface` is the drop target (`no-drag`). The top gutter
  also covers the traffic lights.
- macOS look: the window uses `vibrancy: 'under-window'` and
  `titleBarStyle: 'hiddenInset'`, so `body` is transparent and a faint fill
  behind the dashed outline keeps the hint legible over any blurred desktop.

## `build/electron.ts`

Ported from the reference `zero-dep-electron-app/build/electron.ts`.

- `const electronVersion = '40.1.0'` (single source of truth).
- `--path` prints the binary path; `--install` downloads + extracts into
  `.electron/v<version>/`; otherwise it downloads if missing and spawns the
  binary with the remaining argv, forwarding exit code / signal.
- Platform-aware paths and the `unzip` / PowerShell fallback plus curl proxy
  retry, ported as-is.

## `build/install.ts`

Ported from the reference `zero-dep-electron-app/build/install.ts`: fetches
`electron` types and `@types/node` into `node_modules/` (directly from the
registry, not via npm install). Used by `npm install` (the `install` script).

## `build/app.ts`

Builds or updates `~/Applications/ImagePortal.app`, then launches it. One
command does the whole cycle:

1. Ensure `.electron/v40.1.0/.../Electron.app` exists; if not run
   `electron.ts --install`.
2. Decide whether to rebuild, by comparing a stamp
   (`Contents/Resources/app/.electron-version`) against the Electron version of
   the cached binary. Rebuild when the app is missing or the stamp differs.
3. Rebuild only: remove the old bundle, `ditto` the stock `Electron.app` into
   place, `mv Contents/MacOS/Electron Contents/MacOS/ImagePortal`, then
   `plutil -replace` the main plist
   (`CFBundleExecutable` = `ImagePortal`,
   `CFBundleName`/`CFBundleDisplayName` = `Image Portal`,
   `CFBundleIdentifier` = `com.hyrious.imageportal`,
   `NSHumanReadableCopyright`) and, for each of the four helper bundles under
   `Contents/Frameworks/`, the suffixed `CFBundleIdentifier` and `CFBundleName`.
   **Do not rename the helper executables** (see DESIGN fact 3). Build
   `Contents/Resources/icon.icns` from `icon.png` via `sips` (16→1024) +
   `iconutil -c icns`, then set `CFBundleIconFile` = `icon`.
4. Always copy the app sources into `Contents/Resources/app/`: `main.ts`,
   `preload.ts`, `index.html`, `renderer.ts`, `style.css`, `package.json`,
   `tsconfig.json`. Never copy `build/`, `docs/`, `.electron/`, `.git`,
   `node_modules`. Write the stamp file.
5. `codesign --force --deep --sign -` the bundle **last**, so the seal covers
   the copied sources (the `--deep` signature seals resources).
6. `lsregister -f` the bundle so Finder/Raycast see it, then `open` it.

When the stamp matches, steps 3 is skipped, so the ~200 MB Electron bundle is
not re-copied; only the sources change and the app is re-signed (~0.5 s).

## `package.json`

```jsonc
{
  "name": "image-portal",
  "type": "module",
  "main": "main.ts",
  "private": true,
  "scripts": {
    "install":  "node build/install.ts",
    "dev":      "node build/electron.ts .",
    "app":      "node build/app.ts",
    "app:open": "open build/ImagePortal.app"
  }
}
```

No `dependencies`. `devDependencies` may stay empty; types are fetched by
`build/install.ts`.

## `tsconfig.json`

Enable `strict`, `module: nodenext`, `noEmit`, `skipLibCheck`,
`erasableSyntaxOnly`, `allowImportingTsExtensions`, `verbatimModuleSyntax`,
`moduleDetection: force` — matching the reference project so editor type
checking matches what the runtime can actually execute.
