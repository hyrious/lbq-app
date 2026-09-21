# Implementation tasks

Ordered checklist for the executor (codex). Each task states the deliverable
and its acceptance check. Keep the design constraints in `docs/DESIGN.md` in
mind; do not introduce npm runtime dependencies, a bundler, or asar.

## T0 — Scaffolding

- [ ] `package.json` exactly as specified in FILES.md (no `dependencies`).
- [ ] `tsconfig.json` matching the reference project's compiler options.
- [ ] `.gitignore` with `.electron`, `node_modules`, `build/ImagePortal.app`.
- [ ] `icon.png` present (reuse `../../hyrious/tool/` artwork or a placeholder).
  Acceptance: `node -e "require('./package.json')"` parses; `npx tsc -p .`
  reports no config errors (type errors from missing files are expected until
  later tasks land).

## T1 — Bootstrap scripts

- [ ] `build/electron.ts`: ported from
  `../zero-dep-electron-app/build/electron.ts`, with
  `const electronVersion = '40.1.0'` as the only version literal. Supports
  `--path`, `--install`, and default spawn-and-forward.
- [ ] `build/install.ts`: ported from the reference project.
  Acceptance: `npm run install` populates `node_modules/electron/electron.d.ts`
  and `node_modules/@types/node`; `node build/electron.ts --path` prints the
  binary path; `npm run dev` (after T2/T3) launches a window.

## T2 — Main process

- [ ] `main.ts` implementing everything in FILES.md → `main.ts`:
  `fs`→`original-fs` registration, `app-file` privileged scheme + handler with
  on-the-fly TS stripping, runtime preload stripping, single-instance lock,
  window state persistence, external-link handler, dev-only DevTools,
  `copy-image` and `read-image` IPC handlers using `sips` / `nativeImage` /
  `clipboard`.
  Acceptance: `npm run dev` opens a window that loads `index.html` through
  `app-file://`; DevTools shows no CSP/loading errors; `renderer.ts` executes.

## T3 — Preload + renderer + UI

- [ ] `preload.ts`: self-contained, `typeof import('electron')` annotation,
  exposes `webUtils.getPathForFile`, `ipcRenderer.invoke`, `process.platform`,
  `process.arch`.
- [ ] `index.html`, `style.css`, `renderer.ts` migrated from
  `hyrious/tool/image-portal.html`, with HEIC/canvas/libheif logic removed and
  replaced by `read-image` / `copy-image` IPC calls.
  Acceptance: dropping a PNG shows a preview and copies it to the clipboard;
  dropping a HEIC copies a PNG; the scale control resizes and re-copies; the
  window title briefly shows "Copied to clipboard".

## T4 — Packaging

- [ ] `build/app.ts` implementing FILES.md → `build/app.ts` steps 1–10 using
  `ditto`, `plutil`, `mv`, `sips`, `iconutil`, `codesign`.
  Acceptance:
  - `npm run app` produces `build/ImagePortal.app`;
  - `Contents/MacOS/ImagePortal` exists and `Contents/MacOS/Electron` does not;
  - main plist has the new exec name / bundle id / display name;
  - helper executables are still named `Electron Helper*`;
  - `codesign --verify --deep --strict build/ImagePortal.app` succeeds;
  - launching it shows `app.isPackaged === true` (log it once) and the app
    works as in T3.

## T5 — Sync

- [ ] `build/dev-sync.ts` copying the source set into
  `Contents/Resources/app/`, failing with a hint if the `.app` is absent.
  Acceptance: after `npm run app`, edit `renderer.ts`, run `npm run app:sync`,
  `npm run app:open` → the change is visible; `codesign --verify` still passes;
  the binary's mtime is unchanged.

## T6 — Verification pass

- [ ] `npx tsc -p . --noEmit` clean (or documented, justified exceptions).
- [ ] Confirm no `dependencies` in `package.json`.
- [ ] Confirm `Resources/app/` contains no `build/`, `docs/`, `.electron/`,
  `node_modules/`.
- [ ] Write `README.md` summarizing setup, dev, package, sync, and the
  HEIC/native-clipboard behavior, plus the identity-isolation note from
  DESIGN.md.

## Notes for the executor

- Do not add special-case compatibility code; port the reference scripts as
  faithfully as possible.
- Prefer absolute, `import.meta.dirname`-relative paths; the code runs from
  `Resources/app/` when packaged.
- The `.ts` extension in imports is required
  (`allowImportingTsExtensions`); the runtime strips types but does not rewrite
  specifiers.
- When unsure whether something is a system tool, verify with `which` before
  using it.
