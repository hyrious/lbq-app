export interface IRegistry {
	add<T extends object>(id: string, value: T): void;
	as<T extends object>(id: string): T;
}

class RegistryImpl implements IRegistry {
	private readonly entries = new Map<string, object>();

	add<T extends object>(id: string, value: T): void {
		if (this.entries.has(id)) {
			throw new Error(`Registry already has '${id}'`);
		}
		this.entries.set(id, value);
	}

	as<T extends object>(id: string): T {
		const value = this.entries.get(id);
		if (!value) {
			throw new Error(`Unknonwn registry '${id}'`);
		}
		return value as T;
	}
}

/**
 * Common practice for extension point.
 * @example
 * const apps = new AppRegistry();
 * Registry.add('workbench.apps', apps);
 * // Code below does not know AppRegistry, only knows the interface.
 * Registry.as<IAppRegistry>('workbench.apps').register(appDescriptor);
 * // Everything happens later.
 * renderApps(apps.getAll());
 */
export const Registry: IRegistry = new RegistryImpl();
