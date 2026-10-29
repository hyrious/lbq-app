import { DisposableStore, isDisposable, type IDisposable } from '../../base/common/lifecycle.ts';
import { isClass } from '../../base/common/types.ts';

export interface ServiceIdentifier<T> {
	readonly id: string;
	readonly _serviceBrand: T | undefined;
}

export function createServiceIdentifier<T>(id: string): ServiceIdentifier<T> {
	return Object.freeze({ id }) as ServiceIdentifier<T>;
}

export interface ServicesAccessor {
	get<T>(id: ServiceIdentifier<T>): T;
}

export interface ServiceConstructor<T> {
	new(): T;
}

export interface ServiceFactory<T> {
	(accessor: ServicesAccessor): T;
}

interface ServiceEntry<T> {
	value?: T;
	factory?: (accessor: ServicesAccessor) => T;
}

export const IIInstantiationService = createServiceIdentifier<IInstantiationService>('instantiationService');

export interface IInstantiationService extends IDisposable {
	set<T>(id: ServiceIdentifier<T>, value: T): T;
	register<T>(id: ServiceIdentifier<T>, factory: ServiceFactory<T>): void;
	register<T>(id: ServiceIdentifier<T>, constructor: ServiceConstructor<T>): void;
	createChild(): IInstantiationService;
	run<R, TS extends any[]>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R;
}

export class InstantiationService implements ServicesAccessor, IInstantiationService {
	private readonly services = new Map<ServiceIdentifier<unknown>, ServiceEntry<unknown>>();
	private readonly creating = new Set<ServiceIdentifier<unknown>>();
	private readonly disposables = new DisposableStore();
	private readonly parent: InstantiationService | undefined;

	constructor(parent?: InstantiationService) {
		this.parent = parent;
	}

	set<T>(id: ServiceIdentifier<T>, value: T): T {
		if (this.services.has(id)) throw new Error(`Service is already registered: ${id.id}`);
		this.services.set(id, { value });
		if (isDisposable(value)) this.disposables.add(value);
		return value;
	}

	register<T>(id: ServiceIdentifier<T>, factory: ServiceFactory<T>): void;
	register<T>(id: ServiceIdentifier<T>, constructor: ServiceConstructor<T>): void;
	register<T>(id: ServiceIdentifier<T>, provider: ServiceConstructor<T> | ServiceFactory<T>): void {
		if (this.services.has(id)) throw new Error(`Service is already registered: ${id.id}`);
		const factory: ServiceFactory<T> = isClass(provider)
			? () => new (provider as ServiceConstructor<T>)()
			: provider as ServiceFactory<T>;
		this.services.set(id, { factory });
	}

	get<T>(id: ServiceIdentifier<T>): T {
		const entry = this.services.get(id) as ServiceEntry<T> | undefined;
		if (entry) {
			if (entry.factory) {
				if (this.creating.has(id)) throw new Error(`Cyclic service dependency: ${id.id}`);
				this.creating.add(id);
				try {
					entry.value = entry.factory(this);
					entry.factory = undefined;
					if (isDisposable(entry.value)) this.disposables.add(entry.value);
				} finally {
					this.creating.delete(id);
				}
			}
			return entry.value as T;
		}
		if (this.parent) return this.parent.get(id);
		throw new Error(`Unknown service: ${id.id}`);
	}

	createChild(): InstantiationService {
		return new InstantiationService(this);
	}

	run<R, TS extends any[] = []>(fn: (accessor: ServicesAccessor, ...args: TS) => R, ...args: TS): R {
		let done = false;
		try {
			const accessor: ServicesAccessor = {
				get: <T>(id: ServiceIdentifier<T>) => {
					if (done) {
						throw new Error('Service accessor can only be accessed in sync execution.');
					}
					return this.get(id);
				}
			};
			return fn(accessor, ...args);
		} finally {
			done = true;
		}
	}

	dispose(): void {
		this.services.clear();
		this.creating.clear();
		this.disposables.dispose();
	}
}
