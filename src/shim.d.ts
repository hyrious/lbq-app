declare module '*.css';

declare module '*.jxa' {
	const source: string;
	export default source;
}

/** Only exist in electron-browser layer. */
declare const vscode: import('./platform/common/ipc.ts').Bridge;
