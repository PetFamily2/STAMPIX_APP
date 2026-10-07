import { expect, test } from 'bun:test';
import { isUnavailableBrowserPushDiagnostic } from '../../scripts/lib/browser-runtime-evidence.mjs';

test('unavailable browser Push is retained separately only with independent capability evidence', () => {
  const browser = {
    sourceKind: 'BROWSER',
    sourceLine: 0,
    arguments: [],
    kind: 'CONSOLE_ERROR',
    vocabulary: ['Push'],
  };
  expect(isUnavailableBrowserPushDiagnostic(browser, true)).toBe(true);
  expect(isUnavailableBrowserPushDiagnostic(browser, false)).toBe(false);
  for (const change of [
    { sourceKind: 'APPLICATION' },
    { sourceKind: 'OTHER' },
    { sourceLine: 1 },
    { arguments: [{ type: 'error' }] },
    { kind: 'TypeError' },
    { vocabulary: [] },
  ])
    expect(
      isUnavailableBrowserPushDiagnostic({ ...browser, ...change }, true)
    ).toBe(false);
});
