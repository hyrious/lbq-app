import { app, Menu, nativeImage, Tray } from 'electron';
import { Emitter } from '../../base/common/event.ts';
import { Disposable } from '../../base/common/lifecycle.ts';
import { productName, trayGuid } from '../../product.ts';
import { iconPath } from '../node/resources.ts';
import { trayMenu } from './menus.ts';

export class TrayService extends Disposable {
	readonly tray: Tray | null;

	private readonly _onClick = new Emitter<void>();
	readonly onClick = this._onClick.event;

	constructor() {
		super();
		if (process.platform === 'win32') {
			const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
			this.tray = new Tray(icon, trayGuid);
			this.tray.setToolTip(productName);
			this.tray.on('click', () => this._onClick.fire());
			this.tray.setContextMenu(Menu.buildFromTemplate(trayMenu({
				reveal: () => this._onClick.fire(),
				quit: () => app.quit()
			})));
		} else {
			// macOS go to Dock
			this.tray = null;
		}
	}
}
