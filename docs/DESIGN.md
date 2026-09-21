# Image Portal — Design

A macOS desktop app that turns a dropped / pasted image into a clean clipboard
image (PNG), so it can be pasted into apps that refuse filenames containing
`/` (e.g. Telegram → QQ on macOS).

Built with **zero runtime npm dependencies**: TypeScript everywhere, executed by
Node's built-in type stripping, front end served over a local `app-file://`
protocol, packaged into a self-contained `.app` by renaming and re-signing the
stock Electron bundle.

## Scope

- Development: run directly with `electron .` (no build step).
- Distribution: produce `build/ImagePortal.app`, ad-hoc signed, self-contained,
  movable to `/Applications`.
- Lightweight update: re-sync only the TypeScript/HTML/CSS sources into the
  already-built `.app`; never re-copy or re-sign the binary.

Out of scope: Windows/Linux packaging, asar, auto-update, code signing with a
real certificate.

## Hard facts this design relies on

All verified on Electron `40.1.0` (bundles Node `24.11.1`) on macOS arm64.

1. **Native TS execution.** Electron's bundled Node runs `.ts` directly
   (`erasableSyntaxOnly` semantics). `module.stripTypeScriptTypes` is a stable
   function. No `--experimental-strip-types` flag needed.
2. **`app-file://` is process-local.** `protocol.registerSchemesAsPrivileged`
   and `protocol.handle` never touch `Info.plist` or LaunchServices. The
   downloaded stock Electron has **no** `CFBundleURLTypes`. Therefore using a
   custom protocol pollutes nothing; it is safe and identical in dev and
   packaged builds.
3. **`app.isPackaged` is decided solely by the main executable's basename.**
   From `shell/browser/api/electron_api_app.cc`:
   - main process: `base_name != "electron"`
   - renderer process: `base_name != "electron helper (renderer)"`
   - utility process: `base_name != "electron helper" && != "electron helper (plugin)"`

   So renaming `Contents/MacOS/Electron` to `ImagePortal` flips
   `app.isPackaged` to `true`. **Helper executables must keep their stock
   names** (`Electron Helper`, `Electron Helper (Renderer)`, `Electron Helper
   (GPU)`, `Electron Helper (Plugin)`), or child-process detection breaks.
4. **Stock Electron is ad-hoc / linker-signed**, `Sealed Resources=none`, no
   team identifier. After renaming the binary and editing plists it must be
   re-signed with `codesign --force --deep --sign -`. No certificate required.
   Because resources are not sealed, editing files under
   `Contents/Resources/app/` afterwards does **not** require re-signing.
5. **Native clipboard + image pipeline.** Main process has
   `clipboard.writeImage(nativeImage)`, `nativeImage.createFromPath(path)`,
   `nativeImage.resize(...)`, and `webUtils.getPathForFile(file)` in preload.
6. **macOS `sips` decodes HEIC and writes PNG natively**, so there is no need
   for `libheif-js`, esm.sh, or any CDN dependency.

## Trust boundary / design decisions

- D1: Development uses `electron .`; the packaged app is kept current via
  `app:sync`. (Both share the same `app-file://` loading logic.)
- D2: `preload.ts` is stripped at runtime into
  `app.getPath('userData')/preload.js`. No preload build step exists on disk.
- D3: All image decoding / clipboard writing happens in the **main process**
  through native APIs. The renderer is reduced to drag/drop, preview and
  controls.
- D4: No bundler, no electron-builder. Packaging uses `ditto`, `plutil`,
  `codesign`, `sips`, `iconutil` — all system tools.
- D5: Electron version is pinned to `40.1.0` in a single constant.
- D6: The renderer receives PNG **bytes** (not a base64 data URL) for previews,
  and only when the image was transformed. Base64 inflates by ~33% and forces a
  string copy across IPC; bytes ride the structured clone as a `Uint8Array` and
  become a Blob object URL.
- D7: The window uses macOS `vibrancy: 'under-window'` with
  `titleBarStyle: 'hiddenInset'` and a transparent renderer background. This
  gives the frosted background and native traffic lights without a custom
  titlebar implementation.
- D8: UI feedback is drawn in-page (a toast region and a floating tool bar);
  no CDN libraries, so the app stays offline-capable and dependency-free.

## Anti-goals / rejected alternatives

- Pre-stripping renderer `.ts` to `.js` for packaging — unnecessary, because
  the custom scheme is not a system-level concern (fact 2).
- asar packaging — would seal resources and break the `app:sync` update flow.
- `libheif-js` / `esm.sh` for HEIC — superseded by native `sips` (fact 6).
- CDN front-end libraries (React, shadcn, sonner, …) — a toast + toolbar is a few
  dozen lines of CSS; a CDN dependency would break the offline, zero-dependency
  premise and require loosening the CSP (D8).

## See also

- `docs/FILES.md` — file-by-file responsibilities.
- `docs/FLOWS.md` — dev, package, sync, and runtime data flows.
- `docs/TASKS.md` — the ordered implementation checklist for the executor.
