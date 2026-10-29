import type { ServiceIdentifier } from './instantiation.ts';

export type AsyncService<T> = { [K in keyof T]: T[K] extends (...args: any[]) => Promise<unknown> ? T[K] : never };

export interface IChannelTransport {
	invoke(channel: string, method: string, args: unknown[]): Promise<unknown>;
}

function isServiceMethod(name: string): boolean {
	return name !== 'then' && name !== 'dispose' && !Object.hasOwn(Object.prototype, name);
}

export class ChannelServer implements IChannelTransport {
	private readonly services = new Map<string, object>();

	register<T extends AsyncService<T>>(id: ServiceIdentifier<T>, service: NoInfer<T>): void {
		if (this.services.has(id.id)) throw new Error(`Channel already registered: ${id.id}`);
		this.services.set(id.id, service);
	}

	async invoke(channel: string, method: string, args: unknown[]): Promise<unknown> {
		if (typeof channel !== 'string' || typeof method !== 'string' || !Array.isArray(args)) {
			throw new Error('Invalid channel arguments');
		}
		const service = this.services.get(channel);
		if (service && isServiceMethod(method)) {
			const handler = Reflect.get(service, method);
			if (typeof handler === 'function') return await handler.apply(service, args);
		}
		throw new Error(`Unknown channel method: ${channel}.${method}`);
	}
}

export function createServiceProxy<T extends AsyncService<T>>(id: ServiceIdentifier<T>, transport: IChannelTransport): T {
	return new Proxy(Object.create(null), {
		get(_target, key) {
			if (typeof key !== 'string' || !isServiceMethod(key)) return undefined;
			return async (...args: unknown[]) => transport.invoke(id.id, key, args);
		}
	}) as T;
}
