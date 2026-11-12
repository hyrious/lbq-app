import type { ICarbonIcons } from '../../base/common/icon.ts';
import type { IDisposable } from '../../base/common/lifecycle.ts';
import type { IChannelTransport } from './channel.ts';

/** Access from the electron-browser layer through `vscode`. */
export interface Bridge extends IChannelTransport {
	readonly platform: NodeJS.Platform;
	/** {@link Electron.WebUtils.getPathForFile} */
	getPathForFile(file: File): string;
	/** Expose something from the main world to renderer. */
	resolveConfiguration(): Promise<IConfiguration>;
	onDidActivateApp(listener: (id: string) => void): IDisposable;
}

export interface IConfiguration {
	/** `["app-file://src/workbench/browser/style.css"]` */
	readonly cssModules: readonly string[];
	readonly carbonIcons: ICarbonIcons;
}
