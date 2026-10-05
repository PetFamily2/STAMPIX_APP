import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  PHASE3_BRANCH,
  PREVIEW_NAME,
  previewPublicEnvironment,
  requireActionsRevision,
  requirePreviewTarget,
  requireProjectPreviewKey,
} from '../../scripts/lib/phase3c1-preview-guard.mjs';

describe('Phase 3C-1C isolated Preview guards', () => {
  test('pinned SDK accepts only project Preview keys', () => {
    expect(requireProjectPreviewKey('preview:team:project|synthetic')).toEqual({
      kind: 'teamAndProjectSlugs',
      teamSlug: 'team',
      projectSlug: 'project',
    });
    for (const key of [
      '',
      undefined,
      'dev:target|test',
      'prod:target|test',
      'preview:target|test',
      'preview:team:project|',
      'preview:team:project|test|extra',
      'preview:team:project|test\n',
    ])
      expect(() => requireProjectPreviewKey(key)).toThrow(
        'PROJECT_PREVIEW_KEY_REQUIRED'
      );
  });
  const claim = {
    deploymentName: 'synthetic-preview',
    instanceUrl: 'https://synthetic-preview.convex.cloud',
    adminKey: 'preview:synthetic-preview|synthetic',
  };
  const auth = {
    deploymentName: claim.deploymentName,
    url: claim.instanceUrl,
    adminKey: claim.adminKey,
    deploymentType: 'preview',
  };
  test('type, key, name and canonical URL must agree before any deploy', () => {
    expect(requirePreviewTarget(claim, auth).url).toBe(claim.instanceUrl);
    for (const change of [
      { deploymentType: 'dev' },
      { deploymentType: 'prod' },
      { url: 'http://synthetic-preview.convex.cloud' },
      { deploymentName: 'different' },
      { adminKey: 'prod:synthetic-preview|synthetic' },
    ])
      expect(() =>
        requirePreviewTarget(claim, { ...auth, ...change })
      ).toThrow();
    for (const name of ['utmost-fennec-280', 'aware-llama-850'])
      expect(() =>
        requirePreviewTarget(
          {
            deploymentName: name,
            instanceUrl: `https://${name}.convex.cloud`,
            adminKey: `preview:${name}|synthetic`,
          },
          {
            deploymentName: name,
            url: `https://${name}.convex.cloud`,
            adminKey: `preview:${name}|synthetic`,
            deploymentType: 'preview',
          }
        )
      ).toThrow();
  });
  const sha = 'a'.repeat(40);
  const env = {
    GITHUB_ACTIONS: 'true',
    GITHUB_REPOSITORY: 'PetFamily2/STAMPIX_APP',
    GITHUB_EVENT_NAME: 'workflow_dispatch',
    GITHUB_REF: `refs/heads/${PHASE3_BRANCH}`,
    VERIFIED_HEAD_SHA: sha,
    GITHUB_SHA: sha,
    PHASE3_PREVIEW_NAME: PREVIEW_NAME,
  };
  test('exact verified manual revision only; local invocation cannot provision', () => {
    expect(() => requireActionsRevision(env, sha, '1.31.5')).not.toThrow();
    for (const [k, v] of Object.entries(env))
      expect(() =>
        requireActionsRevision({ ...env, [k]: `${v}-wrong` }, sha, '1.31.5')
      ).toThrow();
    expect(() => requireActionsRevision(env, sha, '1.31.6')).toThrow();
  });
  test('client env receives only isolated public selectors, never deploy/auth credentials or Production', () => {
    const value = previewPublicEnvironment(
      {
        CONVEX_DEPLOY_KEY: 'secret',
        JWT_PRIVATE_KEY: 'secret',
        EXPO_PUBLIC_CONVEX_URL_DEV: 'https://utmost-fennec-280.convex.cloud',
        EXPO_PUBLIC_CONVEX_URL_PROD: 'https://aware-llama-850.convex.cloud',
        EXPO_PUBLIC_RC_API_KEY: 'prod',
        EXPO_PUBLIC_SENTRY_DSN: 'prod',
      },
      { url: claim.instanceUrl },
      ['synthetic-actor'],
      ['synthetic-business']
    );
    expect(value.EXPO_PUBLIC_CONVEX_URL_DEV).toBe(claim.instanceUrl);
    expect(value.EXPO_PUBLIC_WEB_SCANNER_PREVIEW_URL).toBe(claim.instanceUrl);
    expect(value.EXPO_PUBLIC_WEB_SCANNER_BACKEND).toBe('verified-preview');
    expect(value.EXPO_PUBLIC_APP_ENV).toBe('preview');
    expect(
      Object.keys(value).every(
        (k) => k.startsWith('EXPO_PUBLIC_') && !/PROD|RC_|SENTRY/.test(k)
      )
    ).toBe(true);
  });
  test('fixtures are internal, fail closed, generated outside ordinary Convex source', () => {
    const template = readFileSync(
      'scripts/phase3-preview/fixtures.ts.template',
      'utf8'
    );
    expect(template).toContain('internalMutation');
    expect(template).toContain('PHASE3_FIXTURE_SECRET');
    expect(template).toContain('CONVEX_CLOUD_URL');
    expect(template).toContain('example.invalid');
    expect(template).not.toMatch(
      /export const \w+ = (mutation|query|action)\(/
    );
    const workflow = readFileSync(
      '.github/workflows/business-web-preview-deploy.yml',
      'utf8'
    );
    expect(workflow).toContain('secrets.CONVEX_PREVIEW_DEPLOY_KEY');
    expect(workflow).not.toContain('CONVEX_DEV_DEPLOY_KEY');
    expect(workflow).not.toMatch(/^\s+(push|pull_request|schedule):/m);
    expect(workflow).toContain('expected_sha');
    expect(workflow).toContain('successful verify job');
  });
});
