import { expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

test('rendered route gates handle roles, loading, logout, query bypass and Native companion routes', () => {
  // Separate process keeps React/module fixtures out of the rest of the suite.
  const result = spawnSync(
    process.execPath,
    [path.resolve(import.meta.dir, '../../scripts/test-web-route-gates.jsx')],
    { encoding: 'utf8', cwd: process.cwd() }
  );
  expect(result.stderr.slice(-2500)).not.toContain('AssertionError');
  expect(result.status).toBe(0);
  expect(result.stdout).toContain('Rendered Web route gates passed');
});
