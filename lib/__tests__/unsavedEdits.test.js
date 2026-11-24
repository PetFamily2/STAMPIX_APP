import { expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { hasUnsavedEdits, registerUnsavedEdits } from '../network/unsavedEdits';

test('unsaved registrations remain active until every form releases them', () => {
  expect(hasUnsavedEdits()).toBe(false);
  const releaseFirst = registerUnsavedEdits();
  const releaseSecond = registerUnsavedEdits();
  expect(hasUnsavedEdits()).toBe(true);
  releaseFirst();
  releaseFirst();
  expect(hasUnsavedEdits()).toBe(true);
  releaseSecond();
  expect(hasUnsavedEdits()).toBe(false);
});

test('PWA activation and controller reload both respect unsaved edits', () => {
  const source = readFileSync('components/PwaRuntime.web.tsx', 'utf8');
  const safety = source.slice(
    source.indexOf('safeNow.current ='),
    source.indexOf('  useEffect(')
  );
  const controller = source.slice(
    source.indexOf('const changed ='),
    source.indexOf("window.addEventListener('online'")
  );
  expect(safety).toContain('!hasUnsavedEdits()');
  expect(controller).toContain('hasUnsavedEdits()');
  expect(controller).toContain('serverBusy.current');
});
