import { expect, test } from 'bun:test';
import { classifyHostingFailure } from '../../scripts/lib/preview-hosting.mjs';

test('only transient hosting failures retry; authentication and quota stop', () => {
  for (const text of [
    'fetch failed ECONNRESET',
    'HTTP 503 service unavailable',
    '429 too many requests',
  ])
    expect(classifyHostingFailure(text).transient).toBe(true);
  for (const text of [
    '401 unauthorized',
    'quota exceeded: upgrade your plan',
    'unknown failure',
  ])
    expect(classifyHostingFailure(text).transient).toBe(false);
  expect(
    classifyHostingFailure('429: deployment limit reached').transient
  ).toBe(false);
});
test('untrusted provider output is reduced to fixed families and byte counts', () => {
  const value =
    'fetch failed synthetic-password synthetic-token private.example.invalid';
  const result = classifyHostingFailure(value);
  expect(result).toEqual({
    families: ['NETWORK'],
    diagnosticBytes: Buffer.byteLength(value),
    transient: true,
  });
  expect(JSON.stringify(result)).not.toContain('synthetic-password');
  expect(classifyHostingFailure('', 'ETIMEDOUT').families).toEqual(['NETWORK']);
});
