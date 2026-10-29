export function noop() { }

export interface PlainObject {
	[key: PropertyKey]: unknown;
}

export function toPlainObject(value: unknown): PlainObject | undefined {
	if (value != null && typeof value == 'object' && !Array.isArray(value)) return value as PlainObject;
}

export function isFunction(value: unknown): value is Function {
	return typeof value == 'function';
}

export function isClass(value: Function): boolean {
	return /^class(?:\s|\{)/.test(Function.prototype.toString.call(value));
}

export function toNumber(value: unknown): number | undefined {
	return typeof value == 'number' && Number.isFinite(value) ? value : undefined;
}

export interface Thenable<T> extends PromiseLike<T> { }
