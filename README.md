# Image Portal

Image Portal is a macOS app that copies dropped or pasted images as clean PNG image data. This avoids filename compatibility problems when moving images between apps such as Telegram and QQ.

## Requirements

- macOS on Apple silicon or Intel
- Node.js 24 or later
- The macOS command-line tools `sips`, `iconutil`, `plutil`, `ditto`, and `codesign`

## Development

```sh
npm install
npm run dev
```

The install script downloads Electron 40.1.0 and editor type definitions without adding npm runtime dependencies. Development runs TypeScript directly through Electron's bundled Node.js runtime.

Drop an image into the window or paste an image file. Image Portal previews it and writes PNG image data to the native clipboard. The scale control resizes the source and copies the result again. HEIC and HEIF files are converted with macOS `sips` before previewing and copying.

## Package the App

```sh
npm run app
npm run app:open
```

Packaging creates `build/ImagePortal.app` from the stock Electron bundle, generates the app icon, renames only the main executable, and applies an ad-hoc signature. Copy the resulting bundle to `/Applications` if desired.

## Sync Source Changes

```sh
npm run app:sync
npm run app:open
```

Sync updates only the TypeScript, HTML, CSS, and project metadata under the packaged app's `Contents/Resources/app/` directory. It leaves the executable, property lists, and signature unchanged.

## App Identity

The packaged app uses the bundle identifier `com.hyrious.imageportal` and the main executable name `ImagePortal`. Electron's helper executables retain their stock names because Electron uses those names to identify renderer and utility processes. The local `app-file://` protocol is registered only inside the running process and does not create a system URL handler.
