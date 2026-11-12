import { execFileSync } from 'node:child_process';

/** Reject incomplete/stale sources before producing an artifact. No deployment. */
export function verifyReleaseSource({
  cwd,
  policy,
  event = null,
  forExport = false,
}) {
  if (forExport && policy.pendingSourceReviews?.length) {
    throw new Error('RELEASE_PENDING_SOURCE_REVIEW');
  }
  const git = (...args) =>
    execFileSync('git', args, {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  const revision = git('rev-parse', 'HEAD');
  const branch = git('branch', '--show-current');
  let merging = false;
  try {
    git('rev-parse', '--verify', 'MERGE_HEAD');
    merging = true;
  } catch {}
  if (merging) throw new Error('RELEASE_MERGE_NOT_FINISHED');
  if (event) {
    const head = event.pull_request?.head;
    if (
      head?.ref !== policy.branch ||
      head.sha !== revision ||
      head.repo?.full_name !== event.repository?.full_name
    ) {
      throw new Error('RELEASE_CI_SOURCE_MISMATCH');
    }
  } else if (branch !== policy.branch) {
    throw new Error('RELEASE_BRANCH_MISMATCH');
  }
  if (git('status', '--porcelain', '--untracked-files=all')) {
    throw new Error('RELEASE_SOURCE_NOT_COMMITTED');
  }
  for (const sha of Object.values(policy.requiredAncestors)) {
    if (!/^[a-f0-9]{40}$/.test(sha))
      throw new Error('RELEASE_SOURCE_POLICY_INVALID');
    try {
      git('merge-base', '--is-ancestor', sha, revision);
    } catch {
      throw new Error('RELEASE_REQUIRED_HISTORY_MISSING');
    }
  }
  return {
    branch: policy.branch,
    revision,
    requiredAncestors: policy.requiredAncestors,
    pendingSourceReviews: policy.pendingSourceReviews ?? [],
  };
}
