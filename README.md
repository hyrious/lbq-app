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

Drop an image anywhere in the window or paste an image file. Image Portal
previews it and writes PNG image data to the native clipboard. In the resize
control, values below 20 are scale factors and values of 20 or more are target
widths; the height follows the source aspect ratio. Resizing copies the result
again. HEIC and HEIF files are converted
with macOS `sips` before previewing and copying. A toast reports the result
instead of a modal alert.

The window uses macOS vibrancy (`under-window`) with an inset native title bar,
so the background is a translucent blur rather than a flat fill.

## Build and Run the App

```sh
npm run app
```

One command builds or updates `~/Applications/ImagePortal.app` and launches it.
The first run assembles the bundle from the stock Electron release, generates the
app icon, renames only the main executable, and applies an ad-hoc signature.
Later runs detect that the binary is current and only refresh the sources, then
re-sign and relaunch, so iteration takes well under a second. Because the app
lives in `~/Applications`, Raycast and Spotlight find it.

## App Identity

The packaged app uses the bundle identifier `com.hyrious.imageportal` and the main executable name `ImagePortal`. Electron's helper executables retain their stock names because Electron uses those names to identify renderer and utility processes. The local `app-file://` protocol is registered only inside the running process and does not create a system URL handler.
