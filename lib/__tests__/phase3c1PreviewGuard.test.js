import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import { Transpiler } from 'bun';
import {
  PHASE3_BRANCH,
  PREVIEW_NAME,
  previewPublicEnvironment,
  requireActionsRevision,
  requireControlDelta,
  requirePreviewTarget,
  requireProjectPreviewKey,
  SOURCE_SHA,
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
    expect(
      requirePreviewTarget(claim, {
        ...auth,
        adminKey: 'preview:synthetic-preview|independently-issued',
      }).url
    ).toBe(claim.instanceUrl);
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
    GITHUB_EVENT_NAME: 'pull_request',
    GITHUB_HEAD_REF: PHASE3_BRANCH,
    PHASE3_SOURCE_SHA: SOURCE_SHA,
    PHASE3_PR_HEAD: sha,
    VERIFIED_HEAD_SHA: sha,
    PHASE3_PREVIEW_NAME: PREVIEW_NAME,
  };
  test('exact verified PR control revision and immutable source only; local invocation cannot provision', () => {
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
      '.github/workflows/branch-verify.yml',
      'utf8'
    );
    expect(workflow).toContain('secrets.CONVEX_PREVIEW_DEPLOY_KEY');
    expect(workflow).not.toContain('CONVEX_DEV_DEPLOY_KEY');
    expect(workflow).not.toMatch(/^\s+(push|schedule|workflow_dispatch):/m);
    expect(workflow).toContain(SOURCE_SHA);
    expect(workflow).toContain("needs.verify.result == 'success'");
    expect(workflow).toContain('needs: verify');
    expect(workflow).not.toContain('createWorkflowDispatch');
  });
});

test('control changes cannot alter the immutable application or backend', () => {
  expect(() =>
    requireControlDelta(['.github/workflows/branch-verify.yml'])
  ).not.toThrow();
  for (const path of [
    'convex/scanner.ts',
    'convex/schema.ts',
    'package.json',
    'app/_layout.tsx',
    'components/QrScanner.tsx',
  ])
    expect(() => requireControlDelta([path])).toThrow();
  expect(() => requireControlDelta([])).toThrow();
});

const resetSource = readFileSync(
  'scripts/phase3-preview/fixtures.ts.template',
  'utf8'
)
  .split('export const reset = internalMutation({')[1]
  .split('const fixtureValidator')[0];
const makeReset = () => {
  const transpiler = new Transpiler({ loader: 'ts' });
  const code = transpiler.transformSync(
    'const reset = internalMutation({' + resetSource + ';'
  );
  return new Function(
    'internalMutation',
    'v',
    'schema',
    'guard',
    code + '; return reset;'
  )(
    (value) => value,
    {
      string: () => ({}),
      boolean: () => ({}),
      number: () => ({}),
      object: () => ({}),
    },
    { tables: { users: {}, businesses: {}, events: {} } },
    () => {}
  );
};
function resetContext(rows) {
  const deleted = [];
  return {
    deleted,
    db: {
      query: (table) => ({
        take: async (n) => (rows[table] ?? []).slice(0, n),
      }),
      delete: async (id) => deleted.push(id),
    },
  };
}
test('synthetic reset is atomic: rogue actor or business prevents every deletion', async () => {
  const reset = makeReset();
  for (const rows of [
    { users: [{ _id: 'u', email: 'real@example.com' }] },
    {
      users: [{ _id: 'u', email: 'phase3-owner@example.invalid' }],
      businesses: [{ _id: 'b', externalId: 'unknown', ownerUserId: 'u' }],
    },
    {
      users: [{ _id: 'u', email: 'phase3-owner@example.invalid' }],
      events: [{ _id: 'e', actorUserId: 'other' }],
    },
  ]) {
    const ctx = resetContext(rows);
    await expect(reset.handler(ctx, { secret: 'test' })).rejects.toThrow();
    expect(ctx.deleted).toEqual([]);
  }
});
test('synthetic reset clears only bounded verified fixtures', async () => {
  const reset = makeReset();
  const ctx = resetContext({
    users: [{ _id: 'u', email: 'phase3-owner@example.invalid' }],
    businesses: [{ _id: 'b', externalId: 'phase3-primary', ownerUserId: 'u' }],
    events: [{ _id: 'e', actorUserId: 'u', businessId: 'b' }],
  });
  expect(await reset.handler(ctx, { secret: 'test' })).toEqual({
    syntheticOnly: true,
    deleted: 3,
  });
  expect(ctx.deleted).toEqual(['u', 'b', 'e']);
  const oversized = resetContext({
    users: Array.from({ length: 201 }, () => ({
      _id: 'u',
      email: 'phase3-owner@example.invalid',
    })),
  });
  await expect(reset.handler(oversized, { secret: 'test' })).rejects.toThrow(
    'SYNTHETIC_RESET_LIMIT'
  );
  expect(oversized.deleted).toEqual([]);
});
