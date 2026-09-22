export interface PlainObject {
  [key: PropertyKey]: unknown;
}

export function isObject(value: unknown): value is object {
  return value != null && typeof value == 'object';
}

export function toPlainObject(value: unknown): PlainObject | undefined {
  return isObject(value) && !Array.isArray(value) ? value as PlainObject : undefined;
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

export function toString(value: unknown): string | undefined {
  return typeof value == 'string' ? value : undefined;
}

export function toNonEmptyString(value: unknown): string | undefined {
  const string = toString(value);
  return string ? string : undefined;
}
