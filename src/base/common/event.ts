import { toDisposable, type IDisposable } from './lifecycle.ts';
import { noop } from './types.ts';

export interface Event<T> {
	(listener: (event: T) => void): IDisposable;
}

interface Listener<T> {
	callback: (event: T) => void;
}

export interface EmitterOptions<T> {
	readonly onWillAddFirstListener?: (emitter: Emitter<T>) => void;
	readonly onDidRemoveLastListener?: (emitter: Emitter<T>) => void;
}

export class Emitter<T> implements IDisposable {
	private readonly listeners = new Set<Listener<T>>();
	private disposed = false;

	private readonly _options?: EmitterOptions<T>;

	constructor(options?: EmitterOptions<T>) {
		this._options = options;
	}

	readonly event: Event<T> = (callback) => {
		if (this.disposed) return toDisposable(noop);
		const listener: Listener<T> = { callback };
		if (this.listeners.size === 0) this._options?.onWillAddFirstListener?.(this);
		this.listeners.add(listener);
		return toDisposable(() => {
			this.listeners.delete(listener);
			if (this.listeners.size === 0) this._options?.onDidRemoveLastListener?.(this);
		});
	};

	fire(event: T): void {
		if (this.disposed) return;
		let errors: unknown[] | undefined;
		for (const listener of this.listeners) {
			try {
				listener.callback(event);
			} catch (error) {
				(errors ||= []).push(error);
			}
		}
		if (errors) throw new AggregateError(errors, 'Errors occurred while delivering an event.');
	}

	dispose(): void {
		this.disposed = true;
		this.listeners.clear();
		this._options?.onDidRemoveLastListener?.(this);
	}
}

export interface NodeEventEmitter {
	on(event: string | symbol, listener: Function): unknown;
	removeListener(event: string | symbol, listener: Function): unknown;
}

export function fromNodeEventEmitter<T>(emitter: NodeEventEmitter, eventName: string, map: (...args: any[]) => T = id => id): Event<T> {
	const fn = (...args: unknown[]) => result.fire(map(...args));
	const result = new Emitter<T>({
		onWillAddFirstListener: () => emitter.on(eventName, fn),
		onDidRemoveLastListener: () => emitter.removeListener(eventName, fn)
	});

	return result.event;
}

export interface DOMEventEmitter {
	addEventListener(event: string | symbol, listener: Function): void;
	removeEventListener(event: string | symbol, listener: Function): void;
}

export function fromDOMEventEmitter<T>(emitter: DOMEventEmitter, eventName: string, map: (...args: any[]) => T = id => id): Event<T> {
	const fn = (...args: unknown[]) => result.fire(map(...args));
	const result = new Emitter<T>({
		onWillAddFirstListener: () => emitter.addEventListener(eventName, fn),
		onDidRemoveLastListener: () => emitter.removeEventListener(eventName, fn)
	});

	return result.event;
}
