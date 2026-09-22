import assert from 'node:assert/strict';
import test from 'node:test';
import { Emitter } from '../src/base/common/event.ts';
import { DisposableStore, toDisposable } from '../src/base/common/lifecycle.ts';
import { createServiceIdentifier, InstantiationService } from '../src/platform/instantiation/common/instantiation.ts';

test('DisposableStore owns each resource once', () => {
  const store = new DisposableStore();
  let disposed = 0;
  store.add(toDisposable(() => disposed++));
  store.dispose();
  store.dispose();
  store.add(toDisposable(() => disposed++));
  assert.equal(disposed, 2);
});

test('Emitter subscriptions follow their disposable store', () => {
  const emitter = new Emitter<number>();
  const store = new DisposableStore();
  const values: number[] = [];
  emitter.event(value => values.push(value), store);
  emitter.fire(1);
  store.dispose();
  emitter.fire(2);
  assert.deepEqual(values, [1]);
});

test('InstantiationService inherits and lazily creates scoped services', () => {
  const root = new InstantiationService();
  const child = root.createChild();
  const IRoot = createServiceIdentifier<number>('root');
  const IScoped = createServiceIdentifier<{ root: number }>('scoped');
  const IConstructed = createServiceIdentifier<ConstructedService>('constructed');
  let created = 0;
  root.set(IRoot, 42);
  child.register(IScoped, accessor => {
    created++;
    return { root: accessor.get(IRoot) };
  });
  child.register(IConstructed, ConstructedService);

  assert.equal(created, 0);
  assert.equal(child.get(IScoped).root, 42);
  assert.equal(child.get(IScoped).root, 42);
  assert.equal(created, 1);
  assert.ok(child.get(IConstructed) instanceof ConstructedService);
  child.dispose();
  root.dispose();
});

class ConstructedService {}
