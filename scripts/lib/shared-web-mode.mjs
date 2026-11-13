const deploymentBranches = new Set([
  'pwa/phase-3-scanner-commands-20261005',
  'agent/launch-completion-20261028',
]);

export function requireSharedWebMode(env, sha) {
  const dryRunOnly = env.SHARED_DRY_RUN_ONLY === 'true';
  const deploymentBranch = deploymentBranches.has(env.GITHUB_HEAD_REF);
  const integrationBranch = env.GITHUB_HEAD_REF?.startsWith(
    'integration/release-hardening-'
  );
  if (
    env.GITHUB_ACTIONS !== 'true' ||
    env.GITHUB_EVENT_NAME !== 'pull_request' ||
    env.GITHUB_REPOSITORY !== 'PetFamily2/STAMPIX_APP' ||
    !/^[a-f0-9]{40}$/.test(sha) ||
    env.VERIFIED_HEAD_SHA !== sha ||
    !(deploymentBranch || (dryRunOnly && integrationBranch))
  ) {
    throw new Error('SHARED_VERIFIED_REVISION_REQUIRED');
  }
  return {
    dryRunOnly,
    canDeploy: deploymentBranch && !dryRunOnly,
    diagnosticCli: dryRunOnly && env.SHARED_DIAGNOSTIC_CLI === '1.49.0',
  };
}
