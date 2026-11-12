import type { ServicesAccessor } from '../../platform/common/instantiation.ts';

import { Emitter } from '../../base/common/event.ts';
import { Disposable } from '../../base/common/lifecycle.ts';
import { isFunction } from '../../base/common/types.ts';
import { Registry } from '../../platform/common/registry.ts';

export abstract class AppView extends Disposable {
	protected readonly container: HTMLElement;

	private readonly _onDidRequestClose = this.register(new Emitter<void>());
	readonly onDidRequestClose = this._onDidRequestClose.event;

	constructor(accessor: ServicesAccessor, container: HTMLElement) {
		super();
		this.container = container;
		this.container.classList.add('view');
	}

	activate(): void { }
	deactivate(): void { }

	protected requestClose(): void {
		this._onDidRequestClose.fire();
	}
}

export interface IAppDescriptor {
	readonly id: string;
	readonly title: string;
	/** Carbon icon name, e.g. 'document'. */
	readonly icon: string;
	/** Display order, ascending. Defaults to 0. */
	readonly order?: number;
	/** Global entries appear below the app list and do not receive numbered shortcuts. */
	readonly group?: 'apps' | 'global';
	/** Key combined with the platform primary modifier. */
	readonly primaryKey?: string;
	/** Only shown in the activity bar while active. Not restored on startup. */
	readonly hidden?: boolean;
	readonly factory: (accessor: ServicesAccessor, container: HTMLElement) => AppView;
}

export interface IAppRegistry {
	register(descriptor: IAppDescriptor): void;
	getApps(): readonly IAppDescriptor[];
}

class AppRegistry implements IAppRegistry {
	private readonly apps = new Map<string, IAppDescriptor>();

	register(descriptor: IAppDescriptor): void {
		if (this.apps.has(descriptor.id)) {
			throw new Error(`App already registered '${descriptor.id}'`);
		}
		this.apps.set(descriptor.id, Object.freeze({ ...descriptor }));
	}

	getApps(): readonly IAppDescriptor[] {
		return Array.from(this.apps.values()).sort((a, b) => Number(a.group == 'global') - Number(b.group == 'global')
			|| (a.order ?? 0) - (b.order ?? 0) || a.id.localeCompare(b.id));
	}
}

const Extensions = {
	apps: 'workbench.apps'
};

Registry.add(Extensions.apps, new AppRegistry());

export const appRegistry: IAppRegistry = Registry.as<IAppRegistry>(Extensions.apps);

export interface IAppConstructor extends Omit<IAppDescriptor, 'factory'> {
	new(accessor: ServicesAccessor, container: HTMLElement): AppView;
}

/**
 * @example
 * registerApp(class extends AppView {
 * 	static readonly id = 'app1';
 * 	static readonly title = 'App1';
 * 	static readonly icon = 'document';
 * 	constructor(accessor: ServicesAccessor, container: HTMLElement) {
 * 		super(accessor, container);
 * 	}
 * })
 */
export function registerApp(app: IAppDescriptor | IAppConstructor): void {
	let descriptor: IAppDescriptor;
	if (isFunction(app)) {
		descriptor = {
			id: app.id,
			title: app.title,
			icon: app.icon,
			order: app.order,
			group: app.group,
			primaryKey: app.primaryKey,
			hidden: app.hidden,
			factory: (accessor, container) => new app(accessor, container)
		};
	} else {
		descriptor = app;
	}

	appRegistry.register(descriptor);
}
