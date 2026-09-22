export interface IDisposable {
  dispose(): void;
}

export function isDisposable(value: unknown): value is IDisposable {
  return isFunction(toPlainObject(value)?.dispose);
}

export function toDisposable(dispose: () => void): IDisposable {
  let disposed = false;
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      dispose();
    }
  };
}

export class DisposableStore implements IDisposable {
  private readonly values = new Set<IDisposable>();
  private disposed = false;

  add<T extends IDisposable>(value: T): T {
    if (this.disposed) {
      value.dispose();
    } else {
      this.values.add(value);
    }
    return value;
  }

  delete(value: IDisposable): void {
    if (!this.values.delete(value)) return;
    value.dispose();
  }

  clear(): void {
    const values = [...this.values];
    this.values.clear();
    const errors: unknown[] = [];
    for (const value of values) {
      try {
        value.dispose();
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Errors occurred while disposing resources.');
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clear();
  }
}

export abstract class Disposable implements IDisposable {
  private readonly store = new DisposableStore();

  protected register<T extends IDisposable>(value: T): T {
    return this.store.add(value);
  }

  dispose(): void {
    this.store.dispose();
  }
}

export class MutableDisposable<T extends IDisposable> implements IDisposable {
  private current: T | undefined;
  private disposed = false;

  get value(): T | undefined {
    return this.current;
  }

  set value(value: T | undefined) {
    if (this.disposed) {
      value?.dispose();
      return;
    }
    if (value === this.current) return;
    this.current?.dispose();
    this.current = value;
  }

  clear(): void {
    this.value = undefined;
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.current?.dispose();
    this.current = undefined;
  }
}
import { isFunction, toPlainObject } from './types.ts';
