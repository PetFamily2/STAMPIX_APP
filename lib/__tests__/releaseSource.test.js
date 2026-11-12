import { afterAll, afterEach, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { verifyReleaseSource } from '../../scripts/lib/release-source.mjs';

// Disposable repositories isolate history/dirty-state checks from the actual worktree.
mkdirSync('.tmp', { recursive: true });
const repo = process.cwd();
const fixtures = [];
afterEach(() => process.chdir(repo));
afterAll(() => {
  process.chdir(repo);
  // Windows workspace policy protects Git internals; retain these ignored fixtures.
  if (process.platform === 'win32') return;
  for (const cwd of fixtures) rmSync(cwd, { recursive: true, force: true });
});
function fixture() {
  process.chdir(repo);
  const cwd = path.resolve(
    mkdtempSync(path.join(repo, '.tmp/release-source-test-'))
  );
  fixtures.push(cwd);
  const git = (...args) =>
    execFileSync('git', ['-c', `safe.directory=${cwd}`, ...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  git('init', '-b', 'integration/test');
  git(
    '-c',
    'user.name=Release test',
    '-c',
    'user.email=test@example.invalid',
    'commit',
    '--allow-empty',
    '-m',
    'base'
  );
  const revision = git('rev-parse', 'HEAD');
  const policy = {
    branch: 'integration/test',
    requiredAncestors: { base: revision },
  };
  return { cwd, policy, revision, git };
}
test('clean canonical source records its exact revision and ancestors', () => {
  const f = fixture();
  expect(verifyReleaseSource(f).revision).toBe(f.revision);
});
test('another branch cannot publish even at the same revision', () => {
  const f = fixture();
  f.git('switch', '-c', 'old-qa');
  expect(() => verifyReleaseSource(f)).toThrow('RELEASE_BRANCH_MISMATCH');
});

test('unreviewed Cursor UI blocks export while CI can still verify history', () => {
  const f = fixture();
  f.policy.pendingSourceReviews = ['cursor-pending-ui'];
  expect(verifyReleaseSource(f).pendingSourceReviews).toEqual([
    'cursor-pending-ui',
  ]);
  expect(() => verifyReleaseSource({ ...f, forExport: true })).toThrow(
    'RELEASE_PENDING_SOURCE_REVIEW'
  );
});
test('untracked application source cannot silently enter an artifact', () => {
  const f = fixture();
  writeFileSync(
    path.join(f.cwd, 'unexpected.ts'),
    'export const newer = true;'
  );
  expect(() => verifyReleaseSource(f)).toThrow('RELEASE_SOURCE_NOT_COMMITTED');
});
test('staged edits cannot publish', () => {
  const f = fixture();
  writeFileSync(path.join(f.cwd, 'source.ts'), 'one');
  f.git('add', '.');
  expect(() => verifyReleaseSource(f)).toThrow('RELEASE_SOURCE_NOT_COMMITTED');
});

test('unfinished merge is rejected even with no application diff', () => {
  const f = fixture();
  const commit = (message) =>
    f.git(
      '-c',
      'user.name=Release test',
      '-c',
      'user.email=test@example.invalid',
      'commit',
      '--allow-empty',
      '-m',
      message
    );
  f.git('switch', '-c', 'side');
  commit('side');
  f.git('switch', f.policy.branch);
  commit('canonical');
  f.git(
    '-c',
    'user.name=Release test',
    '-c',
    'user.email=test@example.invalid',
    'merge',
    '--no-commit',
    '--no-ff',
    'side'
  );
  expect(() => verifyReleaseSource(f)).toThrow('RELEASE_MERGE_NOT_FINISHED');
});
test('missing integration history is rejected', () => {
  const f = fixture();
  f.policy.requiredAncestors.base = 'a'.repeat(40);
  expect(() => verifyReleaseSource(f)).toThrow(
    'RELEASE_REQUIRED_HISTORY_MISSING'
  );
});
test('detached CI requires the exact canonical PR head from this repository', () => {
  const f = fixture();
  f.git('checkout', '--detach');
  const event = {
    repository: { full_name: 'owner/repo' },
    pull_request: {
      head: {
        ref: f.policy.branch,
        sha: f.revision,
        repo: { full_name: 'owner/repo' },
      },
    },
  };
  expect(verifyReleaseSource({ ...f, event }).revision).toBe(f.revision);
  event.pull_request.head.sha = 'b'.repeat(40);
  expect(() => verifyReleaseSource({ ...f, event })).toThrow(
    'RELEASE_CI_SOURCE_MISMATCH'
  );
  event.pull_request.head.sha = f.revision;
  event.pull_request.head.repo.full_name = 'another/repo';
  expect(() => verifyReleaseSource({ ...f, event })).toThrow(
    'RELEASE_CI_SOURCE_MISMATCH'
  );
});
