const { contextBridge, ipcRenderer, webUtils }: typeof import('electron') = require('electron');

contextBridge.exposeInMainWorld('electron', {
  webUtils: {
    getPathForFile(file: File): string {
      return webUtils.getPathForFile(file);
    }
  },
  ipcRenderer: {
    invoke(channel: string, ...args: unknown[]): Promise<unknown> {
      return ipcRenderer.invoke(channel, ...args);
    }
  },
  process: {
    platform: process.platform,
    arch: process.arch
  }
});
