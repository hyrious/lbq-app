# Flows

## 1. Development

```
npm install        # build/install.ts → node_modules/{electron,@types/node}
npm run dev        # build/electron.ts .  → .electron/v40.1.0/.../Electron .
```

At startup `main.ts`:

1. registers the `fs`→`original-fs` loader,
2. strips `preload.ts` → `userData/preload.js`,
3. registers the `app-file` protocol,
4. loads `index.html` through `app-file://app<abs path>`.

Renderer `<script type="module" src="renderer.ts">` is fetched through the
protocol and stripped on the fly. Editing `renderer.ts` / `index.html` /
`style.css` and reloading the window picks up changes with no build step.
Editing `main.ts` requires restarting `electron .`.

## 2. Build and run the app

```
npm run app    # build/sync ~/Applications/ImagePortal.app and launch it
```

One command builds, updates, signs and opens the app. The first run (or a run
after the pinned Electron version changes) assembles a renamed, re-signed copy
of the stock `Electron.app` into `~/Applications/`; later runs only refresh the
sources and re-sign (~0.5 s). Result: `app.isPackaged === true`, bundle id
`com.hyrious.imageportal`, no `Electron`-named top-level bundle in
LaunchServices, self-contained and relocatable, and discoverable by Raycast and
Spotlight via `lsregister`.

## 3. Lightweight update

```
# edit main.ts / renderer.ts / index.html / style.css / preload.ts
npm run app    # syncs sources, re-signs, relaunches
```

When the stamp matches, the ~200 MB Electron bundle is not re-copied; only
`Contents/Resources/app/` is refreshed. Because the `--deep` signature seals
resources, the app is re-signed afterwards, so the signature stays valid.

## 4. Runtime: image → clipboard

```
renderer                          main
--------                          ----
drop / paste a file
  ↓
webUtils.getPathForFile(file)  ─→ (path string)
  ↓
invoke('process-image', {path, scale?})
                                   sips HEIC→PNG if needed
                                   nativeImage.createFromPath
                                   nativeImage.resize if scale
                                   clipboard.writeImage
  ←── {width, height, preview?} ───
preview = Blob URL (if transformed)
          or app-file://<original path> (otherwise)
renderer updates toolbar / title
```

HEIC handling lives entirely in the main process via macOS `sips`; the renderer
never sees libheif, canvas re-encoding, or `navigator.clipboard`. Preview bytes
are only sent when the image was transformed, so the common case does no extra
encode and no base64 inflation.

## 5. Identity isolation

| Concern | Stock Electron | This app |
|---|---|---|
| main exe basename | `Electron` | `ImagePortal` |
| `app.isPackaged` | false | true |
| bundle id | `com.github.Electron` | `com.hyrious.imageportal` |
| userData dir | shared `com.github.Electron` | `com.hyrious.imageportal` |
| LaunchServices top name | `Electron` | `Image Portal` |
| custom scheme | process-local only | process-local only |

Helper executables keep stock names on purpose; only their bundle ids and
display names are suffixed. The `app-file://` scheme never leaves the app.
