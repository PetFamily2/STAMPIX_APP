import { expect, test } from 'bun:test';
import { assertPreservedDependencies } from '../../scripts/lib/release-dependency-policy.mjs';

test('release dependency freeze permits only the two exact reviewed security transitions', () => {
  const before = {
    '@auth/core': '^0.37.0',
    '@convex-dev/auth': '^0.0.90',
    expo: '54.0.13',
    'react-native': '0.81.5',
  };
  const after = {
    ...before,
    '@auth/core': '0.41.3',
    '@convex-dev/auth': '0.0.98',
  };
  expect(() => assertPreservedDependencies(before, before)).not.toThrow();
  expect(() => assertPreservedDependencies(before, after)).not.toThrow();
  for (const [name, version] of [
    ['@auth/core', '^0.41.3'],
    ['@auth/core', '0.41.4'],
    ['@convex-dev/auth', '0.0.99'],
    ['expo', '55.0.0'],
    ['react-native', '0.82.0'],
  ]) {
    expect(() =>
      assertPreservedDependencies(before, { ...after, [name]: version })
    ).toThrow(`Existing Native dependency changed: ${name}`);
  }
  expect(() => assertPreservedDependencies(before, {})).toThrow();
  expect(() =>
    assertPreservedDependencies({ '@auth/core': '0.37.0' }, after)
  ).toThrow();
});
