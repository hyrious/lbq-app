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

## 2. Packaged build

```
npm run app        # build/app.ts
npm run app:open   # open build/ImagePortal.app
cp -R build/ImagePortal.app /Applications/
```

`build/app.ts` assembles a renamed, re-signed copy of the stock `Electron.app`
(see FILES.md for the exact steps). Result: `app.isPackaged === true`, bundle
id `com.hyrious.imageportal`, no `Electron`-named top-level bundle in
LaunchServices, self-contained and relocatable.

## 3. Lightweight update

```
# edit main.ts / renderer.ts / index.html / style.css / preload.ts
npm run app:sync   # copies sources into the built .app
npm run app:open
```

`app:sync` overwrites files under `Contents/Resources/app/` only. Because the
ad-hoc signature seals no resources, the app launches without re-signing. The
binary is never re-downloaded, re-copied or re-signed.

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
