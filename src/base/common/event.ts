import { DisposableStore, toDisposable, type IDisposable } from './lifecycle.ts';

export interface Event<T> {
  (listener: (event: T) => void, disposables?: DisposableStore): IDisposable;
}

interface Listener<T> {
  callback: (event: T) => void;
}

export class Emitter<T> implements IDisposable {
  private readonly listeners = new Set<Listener<T>>();
  private disposed = false;

  readonly event: Event<T> = (callback, disposables) => {
    if (this.disposed) return toDisposable(() => {});
    const listener: Listener<T> = { callback };
    this.listeners.add(listener);
    const disposable = toDisposable(() => this.listeners.delete(listener));
    return disposables?.add(disposable) ?? disposable;
  };

  fire(event: T): void {
    if (this.disposed) return;
    const errors: unknown[] = [];
    for (const listener of [...this.listeners]) {
      try {
        listener.callback(event);
      } catch (error) {
        errors.push(error);
      }
    }
    if (errors.length) throw new AggregateError(errors, 'Errors occurred while delivering an event.');
  }

  dispose(): void {
    this.disposed = true;
    this.listeners.clear();
  }
}

export const Event = {
  once<T>(event: Event<T>): Event<T> {
    return (listener, disposables) => {
      let subscription: IDisposable | undefined;
      subscription = event(value => {
        subscription?.dispose();
        listener(value);
      });
      return disposables?.add(subscription) ?? subscription;
    };
  },

  map<T, R>(event: Event<T>, mapper: (value: T) => R): Event<R> {
    return (listener, disposables) => event(value => listener(mapper(value)), disposables);
  },

  filter<T>(event: Event<T>, predicate: (value: T) => boolean): Event<T> {
    return (listener, disposables) => event(value => {
      if (predicate(value)) listener(value);
    }, disposables);
  }
};
