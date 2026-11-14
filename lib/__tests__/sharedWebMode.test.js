import { expect, test } from 'bun:test';
import { requireSharedWebMode } from '../../scripts/lib/shared-web-mode.mjs';

const sha = 'a'.repeat(40);
const environment = {
  GITHUB_ACTIONS: 'true',
  GITHUB_EVENT_NAME: 'pull_request',
  GITHUB_REPOSITORY: 'PetFamily2/STAMPIX_APP',
  GITHUB_HEAD_REF: 'integration/release-hardening-20261111',
  VERIFIED_HEAD_SHA: sha,
  SHARED_DRY_RUN_ONLY: 'true',
};

test('integration can validate the existing backend but can never deploy it', () => {
  expect(requireSharedWebMode(environment, sha)).toEqual({
    dryRunOnly: true,
    canDeploy: false,
    diagnosticCli: false,
  });
  expect(
    requireSharedWebMode(
      { ...environment, SHARED_DIAGNOSTIC_CLI: '1.49.0' },
      sha
    ).diagnosticCli
  ).toBe(true);
  for (const value of [undefined, 'false', '', 'TRUE']) {
    expect(() =>
      requireSharedWebMode({ ...environment, SHARED_DRY_RUN_ONLY: value }, sha)
    ).toThrow();
  }
});

test('a different repository, event, branch or revision cannot access deployment credentials', () => {
  for (const patch of [
    { GITHUB_REPOSITORY: 'other/repo' },
    { GITHUB_EVENT_NAME: 'pull_request_target' },
    { GITHUB_EVENT_NAME: 'push' },
    { GITHUB_ACTIONS: undefined },
    { GITHUB_HEAD_REF: 'main' },
    { GITHUB_HEAD_REF: 'agent/game-album-001' },
    { VERIFIED_HEAD_SHA: 'b'.repeat(40) },
  ])
    expect(() =>
      requireSharedWebMode({ ...environment, ...patch }, sha)
    ).toThrow();
});

test('diagnostic CLI selection cannot alter the existing deployment mode', () => {
  const mode = requireSharedWebMode(
    {
      ...environment,
      GITHUB_HEAD_REF: 'agent/launch-completion-20261028',
      SHARED_DRY_RUN_ONLY: 'false',
      SHARED_DIAGNOSTIC_CLI: '1.49.0',
    },
    sha
  );
  expect(mode).toEqual({
    dryRunOnly: false,
    canDeploy: true,
    diagnosticCli: false,
  });
});
