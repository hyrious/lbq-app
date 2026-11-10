import type { Tooltip } from '../../base/browser/tooltip.ts';
import type { IKeybindingService } from '../../platform/browser/keybinding.ts';

import { $, listen } from '../../base/browser/dom.ts';
import { getModifiers, getPrimaryKey, Primary, resolveModifiers } from '../../base/browser/keyboard.ts';
import { mainWindow } from '../../base/browser/window.ts';
import { Disposable } from '../../base/common/lifecycle.ts';

export interface AppShortcut {
	readonly key: string | undefined;
	readonly button: HTMLButtonElement;
	readonly title: string;
	readonly tooltip: Tooltip;
	readonly activate: () => void;
}

export class AppShortcuts extends Disposable {
	private readonly apps: readonly (AppShortcut & { readonly key: string })[];
	private readonly primaryKey = getPrimaryKey();
	private timer: ReturnType<typeof setTimeout> | undefined;
	private held = false;

	constructor(service: IKeybindingService, activityBar: HTMLElement, apps: readonly AppShortcut[]) {
		super();
		this.apps = apps.filter((app): app is AppShortcut & { readonly key: string } => app.key != null);
		this.registerNavigation(service, activityBar, apps);
		for (const app of this.apps) {
			this.register(service.registerKeybinding({
				key: app.key,
				modifiers: Primary,
				scope: mainWindow.document.body,
				handler: event => {
					this.hide();
					if (!event.repeat) app.activate();
				}
			}));
		}
		this.register(listen(mainWindow, 'keydown', event => {
			if (event.key != this.primaryKey || event.isComposing || getModifiers(event) != resolveModifiers(Primary)) {
				this.hide();
				return;
			}
			if (this.held || event.repeat) return;
			this.held = true;
			this.timer = setTimeout(() => {
				this.timer = undefined;
				for (const app of this.apps) {
					const key = $('kbd', undefined, app.key);
					app.tooltip.pin($('span', undefined, app.title, key));
				}
			}, 1000);
		}));
		this.register(listen(mainWindow, 'keyup', event => {
			if (!event.getModifierState(this.primaryKey)) this.reset();
		}));
		this.register(listen(mainWindow, 'blur', () => this.reset()));
		this.register(listen(mainWindow.document, 'visibilitychange', () => {
			if (mainWindow.document.hidden) this.reset();
		}));
	}

	private registerNavigation(service: IKeybindingService, activityBar: HTMLElement, apps: readonly AppShortcut[]): void {
		const buttons = apps.map(app => app.button);
		for (const direction of [-1, 1]) {
			this.register(service.registerKeybinding({
				key: direction < 0 ? 'ArrowUp' : 'ArrowDown',
				scope: activityBar,
				when: event => buttons.some(button => button == event.target),
				handler: event => {
					const index = buttons.findIndex(button => button == event.target);
					const next = buttons[index + direction];
					next?.focus();
					next?.click();
				}
			}));
		}
	}

	private hide(): void {
		clearTimeout(this.timer);
		this.timer = undefined;
		for (const app of this.apps) app.tooltip.unpin();
	}

	private reset(): void {
		this.held = false;
		this.hide();
	}

	override dispose(): void {
		this.reset();
		super.dispose();
	}
}
