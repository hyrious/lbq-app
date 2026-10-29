import type { ServiceConstructor, ServiceFactory, ServiceIdentifier } from './instantiation.ts';

import { IIInstantiationService, InstantiationService } from './instantiation.ts';

export const Eager = 0, Delayed = 1;

type ServiceProvider<T> = ServiceConstructor<T> | ServiceFactory<T>;
const _registry: [ServiceIdentifier<any>, ServiceProvider<any>, number][] = [];

export function registerService<T>(id: ServiceIdentifier<T>, provider: ServiceFactory<NoInfer<T>>, delay?: boolean): void;
export function registerService<T>(id: ServiceIdentifier<T>, provider: ServiceConstructor<NoInfer<T>>, delay?: boolean): void;
export function registerService<T>(id: ServiceIdentifier<T>, provider: ServiceProvider<T>, delay?: boolean): void {
	_registry.push([id, provider, delay ? Delayed : Eager]);
}

export function getServiceRegistry(): readonly [ServiceIdentifier<any>, ServiceProvider<any>, number][] {
	return _registry;
}

export function initializeServices(services: InstantiationService): void {
	services.set(IIInstantiationService, services);
	for (const [id, provider] of _registry) {
		services.register(id, provider as ServiceFactory<any>);
	}
	for (const [id, _, timing] of _registry) {
		if (timing === Eager) services.get(id);
	}
}
