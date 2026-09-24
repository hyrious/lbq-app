import type { BrowserWindow } from 'electron';

const monospaceFont = 'Cascadia Mono, consolas, monospace';

// Work around the broken DevTools fonts on Windows: https://github.com/electron/electron/issues/42055
const devToolsStyle = `
  :root {
    --sys-color-base: var(--ref-palette-neutral100);
    --source-code-font-family: ${monospaceFont} !important;
    --source-code-font-size: 12px;
    --monospace-font-family: ${monospaceFont} !important;
    --monospace-font-size: 12px;
    --default-font-family: system-ui, sans-serif;
    --default-font-size: 12px;
    --ref-palette-neutral99: #ffffffff;
  }
  .theme-with-dark-background {
    --sys-color-base: var(--ref-palette-secondary25);
  }
  body {
    --default-font-family: system-ui,sans-serif;
  }
`.replaceAll(/\s+/g, ' ').trim();

/**
 * Electron ships the DevTools frontend with a `platform-windows` class and no
 * usable font stack on Windows, which makes the source code and autocomplete
 * list fall back to a poorly rendered bitmap font. Re-apply a sane monospace
 * stack whenever the DevTools window opens.
 */
export function fixWindowsDevToolsFonts(window: BrowserWindow): void {
  if (process.platform != 'win32') return;
  window.webContents.on('devtools-opened', () => {
    const devToolsWebContents = window.webContents.devToolsWebContents;
    if (!devToolsWebContents) return;
    void devToolsWebContents.executeJavaScript(`
      document.body.appendChild(document.createElement('style')).textContent = '${devToolsStyle}';
      document.querySelectorAll('.platform-windows').forEach(el => el.classList.remove('platform-windows'));
      addStyleToAutoComplete();
      new MutationObserver(mutationList => {
        for (const mutation of mutationList) if (mutation.type === 'childList') {
          mutation.addedNodes.forEach(item => {
            if (item.classList.contains('editor-tooltip-host')) {
              addStyleToAutoComplete();
            }
          });
        }
      }).observe(document.body, { childList: true });
      function addStyleToAutoComplete() {
        document.querySelectorAll('.editor-tooltip-host').forEach(element => {
          if (!element.shadowRoot.querySelector('[data-key="overridden-dev-tools-font"]')) {
            const overriddenStyle = element.shadowRoot.appendChild(document.createElement('style'));
            overriddenStyle.setAttribute('data-key', 'overridden-dev-tools-font');
            overriddenStyle.textContent = '.cm-tooltip-autocomplete ul[role=listbox] {font-family: ${monospaceFont} !important;}';
          }
        });
      }
    `);
  });
}
