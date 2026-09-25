# File Responsibilities

```text
main.ts                                  Application entry
src/product.ts                           Product identity
src/base/common/lifecycle.ts             Disposable primitives
src/base/common/event.ts                 Typed events
src/base/common/                        Shared layers are served to renderers via app-file://src/
src/platform/instantiation/common/       Scoped service container
src/platform/ipc/common/                 Shared RPC types
src/platform/ipc/electron-main/          Sender-scoped IPC router
src/runtime/electron-main/               Host lifecycle, discovery, windows, Tray
src/runtime/electron-preload/preload.ts  Minimal renderer bridge
tools/<id>/plugin.ts                     Tool metadata and activation (must stay at the root)
tools/<id>/common/                       RPC schema and pure logic shared by both sides
tools/<id>/electron-main/                Tool services that use Node or Electron
tools/<id>/browser/                      Renderer entry, assets, and page-only code
tools/shared/*                           Assets and renderer helpers shared by tools
build/electron.ts                        Pinned Electron download and launcher
build/install.ts                         Editor type installer
build/app.ts                             macOS bundle assembly and source sync
```
