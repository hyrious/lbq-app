import type { IInstantiationService, ServicesAccessor } from '../../platform/common/instantiation.ts';
import type { IAppDescriptor } from './apps.ts';

import './workbench.css';
import { $, listen } from '../../base/browser/dom.ts';
import { i } from '../../base/browser/icon.ts';
import { Tooltip } from '../../base/browser/tooltip.ts';
import { mainWindow } from '../../base/browser/window.ts';
import { Disposable, toDisposable } from '../../base/common/lifecycle.ts';
import { IIInstantiationService } from '../../platform/common/instantiation.ts';
import { IStorageService } from '../../platform/common/storage.ts';
import { IKeybindingService } from '../../platform/browser/keybinding.ts';
import { appRegistry, type AppView } from './apps.ts';
import { AppShortcuts, type AppShortcut } from './appShortcuts.ts';

interface AppEntry {
	readonly app: IAppDescriptor;
	readonly button: HTMLButtonElement;
	instance: AppViewEntry | undefined;
}

interface AppViewEntry {
	readonly container: HTMLDivElement;
	readonly view: AppView;
}

export class Workbench extends Disposable {
	private static readonly ACTIVE_APP_STORAGE_KEY = 'workbench.activeApp';

	readonly mainContainer = mainWindow.document.body;

	private readonly apps = new Map<string, AppEntry>();
	private activeApp: AppEntry | undefined;
	private lastVisibleAppId: string | undefined;

	private instantiationService!: IInstantiationService;
	private storageService!: IStorageService;
	private appArea!: HTMLElement;
	private titlebar: HTMLElement | undefined;

	initialize(accessor: ServicesAccessor): void {
		this.instantiationService = accessor.get(IIInstantiationService);
		this.storageService = accessor.get(IStorageService);
		const keybindingService = accessor.get(IKeybindingService);

		this.register(toDisposable(() => {
			this.apps.clear();
			this.activeApp = undefined;
			this.lastVisibleAppId = undefined;
		}));

		this.createLayout(keybindingService);
		this.restoreActiveApp();
	}

	activateApp(id: string): void {
		const entry = this.apps.get(id);
		if (!entry) return;

		if (this.activeApp == entry) {
			entry.instance?.view.activate();
			return;
		}

		const instance = entry.instance ??= this.createAppView(entry);
		this.deactivateActiveApp();

		instance.container.style.display = '';
		entry.button.hidden = false;
		entry.button.setAttribute('aria-pressed', 'true');
		this.activeApp = entry;
		mainWindow.document.title = entry.app.title;
		if (this.titlebar) this.titlebar.textContent = entry.app.title;
		if (!entry.app.hidden) {
			this.lastVisibleAppId = id;
			this.storageService.store(Workbench.ACTIVE_APP_STORAGE_KEY, id);
		}
		instance.view.activate();
	}

	private createLayout(keybindingService: IKeybindingService): void {
		if (this.mainContainer.classList.contains('mac')) {
			const titlebar = this.titlebar = $('header.window-titlebar');
			this.mainContainer.prepend(titlebar);
			this.register(toDisposable(() => titlebar.remove()));
		}

		const appBar = $('.activity-bar-apps');
		const globalBar = $('.activity-bar-global');
		const activityBar = $('nav.activity-bar', { 'aria-label': 'Apps' }, appBar, globalBar);
		this.appArea = $('main.app-area');
		const content = $('.workbench-content', undefined, activityBar, this.appArea);
		this.mainContainer.append(content);
		this.register(toDisposable(() => content.remove()));

		const shortcuts = this.createApps(appBar, globalBar);
		this.register(new AppShortcuts(keybindingService, activityBar, shortcuts));
	}

	private createApps(appBar: HTMLElement, globalBar: HTMLElement): AppShortcut[] {
		const shortcuts: AppShortcut[] = [];
		let numberedApps = 0;
		for (const app of appRegistry.getApps()) {
			const button = this.createAppButton(app);
			button.hidden = app.hidden ?? false;
			const bar = app.group == 'global' ? globalBar : appBar;
			bar.append(button);
			const tooltip = this.register(new Tooltip(button, app.title));
			this.apps.set(app.id, { app, button, instance: undefined });
			this.register(listen(button, 'click', () => this.activateApp(app.id)));

			const number = !app.hidden && app.group != 'global' ? ++numberedApps : undefined;
			shortcuts.push({
				key: app.primaryKey ?? (number && number <= 9 ? String(number) : undefined),
				button,
				title: app.title,
				tooltip,
				activate: () => this.activateAppFromShortcut(app.id)
			});
		}
		return shortcuts;
	}

	private createAppView(entry: AppEntry): AppViewEntry {
		const container = $('.app-container', { 'aria-label': entry.app.title });
		this.appArea.append(container);
		try {
			const view = this.register(this.instantiationService.run(accessor => entry.app.factory(accessor, container)));
			this.register(view.onDidRequestClose(() => {
				if (this.activeApp == entry && entry.app.hidden && this.lastVisibleAppId) {
					this.activateApp(this.lastVisibleAppId);
				}
			}));
			return { container, view };
		} catch (error) {
			container.remove();
			throw error;
		}
	}

	private deactivateActiveApp(): void {
		const entry = this.activeApp;
		if (!entry?.instance) return;

		entry.instance.view.deactivate();
		for (const popover of entry.instance.container.querySelectorAll<HTMLElement>(':popover-open')) {
			popover.hidePopover();
		}
		entry.instance.container.style.display = 'none';
		entry.button.setAttribute('aria-pressed', 'false');
		if (entry.app.hidden) entry.button.hidden = true;
	}

	private activateAppFromShortcut(id: string): void {
		if (this.activeApp?.app.id == id) return;

		const focused = mainWindow.document.activeElement;
		if (focused instanceof HTMLElement) focused.blur();
		this.activateApp(id);
	}

	private restoreActiveApp(): void {
		const lastAppId = this.storageService.get(Workbench.ACTIVE_APP_STORAGE_KEY);
		let initialApp: AppEntry | undefined;
		for (const entry of this.apps.values()) {
			if (!entry.app.hidden && (!initialApp || entry.app.id == lastAppId)) {
				initialApp = entry;
			}
		}
		if (initialApp) this.activateApp(initialApp.app.id);
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
}
