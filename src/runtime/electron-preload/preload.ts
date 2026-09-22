const { contextBridge, ipcRenderer, webUtils }: typeof import('electron') = require('electron');

contextBridge.exposeInMainWorld('portal', {
  invoke(method: string, input: unknown): Promise<unknown> {
    return ipcRenderer.invoke('runtime:invoke', method, input);
  },
  getPathForFile(file: File): string {
    return webUtils.getPathForFile(file);
  }
});
