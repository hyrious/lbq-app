const { contextBridge, ipcRenderer, webUtils }: typeof import('electron') = require('electron');

contextBridge.exposeInMainWorld('portal', {
  platform: process.platform,
  invoke(method: string, input: unknown): Promise<unknown> {
    return ipcRenderer.invoke('runtime:invoke', method, input);
  },
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  }
});

const platform = process.platform;
function applyPlatformAttribute() {
  if (!document.documentElement) return;
  document.documentElement.dataset.platform = platform;
}
if (document.documentElement) applyPlatformAttribute();
else document.addEventListener('DOMContentLoaded', applyPlatformAttribute, { once: true });
