import { domContentLoaded } from '../../base/browser/dom.ts';
import { setCarbonIcons } from '../../base/browser/icon.ts';
import { mainWindow } from '../../base/browser/window.ts';
import { Disposable } from '../../base/common/lifecycle.ts';
import { initializeServices } from '../../platform/common/extensions.ts';
import { InstantiationService } from '../../platform/common/instantiation.ts';
import { Workbench } from '../browser/workbench.ts';

class DesktopMain extends Disposable {
	async open(): Promise<void> {
		await domContentLoaded(mainWindow);
		const { carbonIcons } = await vscode.resolveConfiguration();
		setCarbonIcons(carbonIcons);
		const services = await this.initServices();
		const workbench = this.register(new Workbench());
		services.run(accessor => workbench.initialize(accessor));
		this.register(vscode.onDidActivateApp(id => workbench.activateApp(id)));
	}

	private async initServices(): Promise<InstantiationService> {
		const services = this.register(new InstantiationService());
		initializeServices(services);
		return services;
	}
}

export async function main(): Promise<void> {
	await new DesktopMain().open();
}
