# Runtime Flows

## Startup

```text
main.ts
  → register app-file protocol
  → acquire single-instance lock
  → create root services and IPC router
  → create Tray
  → scan tools/*/plugin.ts
  → rebuild Tray menu from discovered metadata
```

No tool is activated during discovery.

## Open and Close

```text
Tray selection
  → create child service scope
  → plugin.activate(context)
  → register scoped IPC handlers
  → create BrowserWindow
  → bind WebContents to plugin id
  → load app-file://<plugin-id>/<entry>

Window closed
  → unbind WebContents
  → dispose plugin subscriptions
  → dispose plugin services and IPC handlers
```

With `window.hideOnClose`, the close action hides the existing window instead. The window, WebContents, and plugin activation remain alive until the runtime exits.
The Tray marks tools with a live window as running, including windows hidden by this option.

Closing the last window does not terminate LBQ. Choosing Quit from the Tray disposes the runtime and exits.

## RPC

```text
renderer portal.invoke(method, input)
  → runtime:invoke
  → identify plugin from event.sender
  → find handler in that plugin's method map
  → return structured-clone result
```

The renderer cannot supply or override the plugin namespace.

## Development and Build

`npm run dev` launches the repository through the pinned Electron runtime. Renderer TypeScript is stripped by the local protocol when loaded, and renderer responses disable caching so HTML, CSS, and TypeScript changes take effect after a page reload.

`npm run app` creates or refreshes `~/Applications/LBQ.app`, copies `src/` and `tools/` recursively, signs the result, refreshes LaunchServices, closes an existing LBQ process, and launches the new bundle.
