import type { IInstantiationService, ServicesAccessor } from '../../platform/common/instantiation.ts';
import type { IAppDescriptor } from './apps.ts';

import './workbench.css';
import { $, listen } from '../../base/browser/dom.ts';
import { i } from '../../base/browser/icon.ts';
import { Tooltip } from '../../base/browser/tooltip.ts';
import { mainWindow } from '../../base/browser/window.ts';
import { Disposable, toDisposable } from '../../base/common/lifecycle.ts';
import { IIInstantiationService } from '../../platform/common/instantiation.ts';
import { appRegistry } from './apps.ts';

export class Workbench extends Disposable {
	readonly mainContainer = mainWindow.document.body;

	initialize(accessor: ServicesAccessor): void {
		const services = accessor.get(IIInstantiationService);

		const titlebar = this.mainContainer.classList.contains('mac') ? $('header.window-titlebar') : undefined;
		if (titlebar) {
			this.mainContainer.prepend(titlebar);
			this.register(toDisposable(() => titlebar.remove()));
		}

		const activityBar = $('nav.activity-bar', { 'aria-label': 'Apps' });
		const appArea = $('main.app-area');
		const content = $('.workbench-content', undefined, activityBar, appArea);
		this.mainContainer.append(content);
		this.register(toDisposable(() => content.remove()));

		let activeContainer: HTMLElement | undefined;
		let activeButton: HTMLButtonElement | undefined;
		for (const app of appRegistry.getApps()) {
			const button = this.createAppButton(app);
			activityBar.append(button);
			this.register(new Tooltip(button, app.title));

			let container: HTMLDivElement | undefined;
			const activate = () => {
				if (activeButton == button) return;
				container ??= this.createAppContainer(app, appArea, services);

				if (activeContainer) {
					for (const popover of activeContainer.querySelectorAll<HTMLElement>(':popover-open')) popover.hidePopover();
					activeContainer.style.display = 'none';
				}
				activeButton?.setAttribute('aria-pressed', 'false');
				container.style.display = '';
				button.setAttribute('aria-pressed', 'true');
				activeContainer = container;
				activeButton = button;
				mainWindow.document.title = app.title;
				if (titlebar) titlebar.textContent = app.title;
			};
			this.register(listen(button, 'click', activate));
		}

		activityBar.querySelector('button')?.click();
	}

	private createAppButton(app: IAppDescriptor): HTMLButtonElement {
		const button = $('button.activity-bar-button', {
			type: 'button',
			'aria-label': app.title,
			'aria-pressed': 'false',
		});
		const icon = i(app.icon);
		icon.classList.add('activity-bar-icon');
		button.append(icon);
		return button;
	}

	private createAppContainer(app: IAppDescriptor, appArea: HTMLElement, services: IInstantiationService): HTMLDivElement {
		const container = $('.app-container', { 'aria-label': app.title });
		appArea.append(container);
		try {
			this.register(services.run(accessor => app.factory(accessor, container)));
			return container;
		} catch (error) {
			container.remove();
			throw error;
		}
	}
}
