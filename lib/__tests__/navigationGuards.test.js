import { expect, test } from 'bun:test';
import { createNavigationGuardRegistry } from '../network/navigationGuards';

test('cleaning up one form cannot release another unsaved form', () => {
  let current = null;
  const changes = [];
  const set = createNavigationGuardRegistry((guard) => {
    current = guard;
  });
  const first = Symbol('first');
  const second = Symbol('second');
  set(first, { isDirty: true, onDiscard: () => changes.push('first') });
  set(second, { isDirty: false });
  expect(current?.isDirty).toBe(true);
  set(second, { isDirty: true, onDiscard: () => changes.push('second') });
  set(first, null);
  expect(current?.isDirty).toBe(true);
  current?.onDiscard();
  expect(changes).toEqual(['second']);
  set(second, null);
  expect(current).toBeNull();
});

test('confirming discard reaches each registered dirty form', () => {
  let current = null;
  const discarded = [];
  const set = createNavigationGuardRegistry((guard) => {
    current = guard;
  });
  set(Symbol(), { isDirty: true, onDiscard: () => discarded.push(1) });
  set(Symbol(), { isDirty: true, onDiscard: () => discarded.push(2) });
  current?.onDiscard();
  expect(discarded).toEqual([1, 2]);
});
