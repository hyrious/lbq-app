# File Responsibilities

```text
main.ts                                  Application entry
src/product.ts                           Product identity
src/base/common/lifecycle.ts             Disposable primitives
src/base/common/event.ts                 Typed events
src/platform/instantiation/common/       Scoped service container
src/platform/ipc/common/                 Shared RPC types
src/platform/ipc/electron-main/          Sender-scoped IPC router
src/runtime/electron-main/               Host lifecycle, discovery, windows, Tray
src/runtime/electron-preload/preload.ts  Minimal renderer bridge
tools/<id>/plugin.ts                     Tool metadata and activation
tools/<id>/common.ts                     Tool RPC schema
tools/<id>/*                             Tool renderer and assets
build/electron.ts                        Pinned Electron download and launcher
build/install.ts                         Editor type installer
build/app.ts                             macOS bundle assembly and source sync
```

Only `src/product.ts` owns the host's source-level name, bundle identifier, and stable Tray identity. `build/app.ts` imports the product values when assembling the bundle.
