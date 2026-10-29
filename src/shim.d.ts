declare module '*.css';

/** Only exist in electron-browser layer. */
declare const vscode: import('./platform/common/ipc.ts').Bridge;
