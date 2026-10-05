import { describe, expect, test } from 'bun:test';
import {
  assertEffectiveDiff,
  assertRemoteRuntimeConfig,
  canonicalDeploymentUrl,
  digest,
  safeRemoteModules,
  verifyDevTarget,
} from '../../scripts/lib/phase3c1-dev-guard.mjs';

const env = {
  EXPO_PUBLIC_CONVEX_URL_DEV: 'https://utmost-fennec-280.convex.cloud',
  EXPO_PUBLIC_CONVEX_URL_PROD: 'https://aware-llama-850.convex.cloud',
};
const key = 'dev:utmost-fennec-280|synthetic-not-a-real-key';
const diff = () => ({
  authDiff: { added: [], removed: [] },
  definitionDiffs: {},
  componentDiffs: {
    '': {
      diffType: { type: 'modify' },
      moduleDiff: { added: [], removed: [] },
      udfConfigDiff: null,
      cronDiff: { added: [], updated: [], deleted: [] },
      indexDiff: { added_indexes: [], removed_indexes: [] },
      schemaDiff: null,
    },
  },
});

describe('Phase 3C-1 DEV identity and effective remote diff', () => {
  const request = {
    appDefinition: { udfServerVersion: '1.31.5' },
    nodeDependencies: [{ name: 'jose', version: '6.1.3' }],
  };
  const remote = {
    udfServerVersion: '1.31.5',
    nodeDependencies: [{ name: 'jose', version: '6.1.3' }],
    nodeVersion: null,
  };
  test('Node runtime and dependency configuration matches remote baseline', () =>
    expect(assertRemoteRuntimeConfig(remote, request).nodeVersion).toBeNull());
  test('Node dependency drift stops before sync', () =>
    expect(() =>
      assertRemoteRuntimeConfig(
        { ...remote, nodeDependencies: [{ name: 'jose', version: '6.1.4' }] },
        request
      )
    ).toThrow('NODE_DEPENDENCY_DRIFT'));
  test('Node runtime drift stops before sync', () =>
    expect(() =>
      assertRemoteRuntimeConfig({ ...remote, nodeVersion: '22' }, request)
    ).toThrow('NODE_RUNTIME_VERSION_DRIFT'));
  test('missing Node metadata stops before sync', () =>
    expect(() =>
      assertRemoteRuntimeConfig(
        { ...remote, nodeDependencies: undefined },
        request
      )
    ).toThrow('NODE_DEPENDENCY_METADATA_UNAVAILABLE'));
  test('optional absent Node version can be compared without conflating null', () => {
    expect(digest(undefined)).toBe(digest(undefined));
    expect(digest(undefined)).not.toBe(digest(null));
  });
  test('exact known DEV URL/key pair succeeds without returning key', () => {
    const result = verifyDevTarget(env, key);
    expect(result.deployment).toBe('dev:utmost-fennec-280');
    expect(JSON.stringify(result)).not.toContain('synthetic');
  });
  for (const url of [
    'http://utmost-fennec-280.convex.cloud',
    'https://user:password@utmost-fennec-280.convex.cloud',
    'https://utmost-fennec-280.convex.cloud:443',
    'https://utmost-fennec-280.convex.cloud/api',
    'https://utmost-fennec-280.convex.cloud?target=dev',
    'https://utmost-fennec-280.convex.cloud#dev',
    'https://utmost-fennec-280.convex.cloud.evil.test',
    'https://a.b.convex.cloud',
    'https://-bad.convex.cloud',
    'https://bad-.convex.cloud',
    'https://bad--slug.convex.cloud',
    'https://UTMOST-fennec-280.convex.cloud',
    '',
    undefined,
  ]) {
    test(`reject malformed or ambiguous URL ${String(url)}`, () =>
      expect(() => canonicalDeploymentUrl(url)).toThrow());
  }
  test('canonical trailing slash is accepted', () =>
    expect(
      canonicalDeploymentUrl(`${env.EXPO_PUBLIC_CONVEX_URL_DEV}/`).url
    ).toBe(env.EXPO_PUBLIC_CONVEX_URL_DEV));
  for (const badKey of [
    '',
    undefined,
    'prod:utmost-fennec-280|secret',
    'dev:another-deployment|secret',
    'dev:utmost-fennec-280|',
    `${key}\n`,
  ]) {
    test(`reject nonmatching key ${String(badKey).slice(0, 12)}`, () =>
      expect(() => verifyDevTarget(env, badKey)).toThrow());
  }
  test('reject known Production even when EAS omits Production variable', () =>
    expect(() =>
      verifyDevTarget(
        { EXPO_PUBLIC_CONVEX_URL_DEV: env.EXPO_PUBLIC_CONVEX_URL_PROD },
        'prod:aware-llama-850|secret'
      )
    ).toThrow('PRODUCTION_TARGET_REJECTED'));
  test('reject DEV equal to configured Production URL', () =>
    expect(() =>
      verifyDevTarget(
        { ...env, EXPO_PUBLIC_CONVEX_URL_PROD: env.EXPO_PUBLIC_CONVEX_URL_DEV },
        key
      )
    ).toThrow('PRODUCTION_TARGET_REJECTED'));
  test('reject other DEV deployment', () =>
    expect(() =>
      verifyDevTarget(
        { EXPO_PUBLIC_CONVEX_URL_DEV: 'https://another-dev-123.convex.cloud' },
        'dev:another-dev-123|secret'
      )
    ).toThrow('UNAPPROVED_DEV_TARGET'));
  test('reject stale EAS deployment selector', () =>
    expect(() =>
      verifyDevTarget(
        { ...env, CONVEX_DEPLOYMENT: 'prod:aware-llama-850' },
        key
      )
    ).toThrow('EAS_DEPLOYMENT_MISMATCH'));
  test('baseline requires zero effective changes', () =>
    expect(assertEffectiveDiff(diff()).existingBackendChanges).toBe(0));
  test('candidate allows exactly one new root query module', () => {
    const d = diff();
    d.componentDiffs[''].moduleDiff.added = ['webScanner.js'];
    expect(assertEffectiveDiff(d, { allowQuery: true }).added).toEqual([
      'webScanner.js',
    ]);
    expect(() => assertEffectiveDiff(d)).toThrow();
  });
  const cases = [
    [
      'schema',
      (d) => {
        d.componentDiffs[''].schemaDiff = {
          previous_schema: '{}',
          next_schema: '{}',
        };
      },
    ],
    [
      'mutation module',
      (d) => {
        d.componentDiffs[''].moduleDiff.added = ['scanner.js'];
      },
    ],
    [
      'referral module',
      (d) => {
        d.componentDiffs[''].moduleDiff.added = ['referrals.js'];
      },
    ],
    [
      'removed module',
      (d) => {
        d.componentDiffs[''].moduleDiff.removed = ['scanner.js'];
      },
    ],
    [
      'replaced query module',
      (d) => {
        d.componentDiffs[''].moduleDiff.added = ['webScanner.js'];
        d.componentDiffs[''].moduleDiff.removed = ['webScanner.js'];
      },
    ],
    [
      'auth',
      (d) => {
        d.authDiff.added = ['https://invalid.test'];
      },
    ],
    [
      'index addition',
      (d) => {
        d.componentDiffs[''].indexDiff.added_indexes = [{}];
      },
    ],
    [
      'index removal',
      (d) => {
        d.componentDiffs[''].indexDiff.removed_indexes = [{}];
      },
    ],
    [
      'index enable',
      (d) => {
        d.componentDiffs[''].indexDiff.enabled_indexes = [{}];
      },
    ],
    [
      'index disable',
      (d) => {
        d.componentDiffs[''].indexDiff.disabled_indexes = [{}];
      },
    ],
    [
      'cron',
      (d) => {
        d.componentDiffs[''].cronDiff.updated = ['billing'];
      },
    ],
    [
      'runtime version',
      (d) => {
        d.componentDiffs[''].udfConfigDiff = {
          previous_version: '1.31.5',
          next_version: '1.31.5',
        };
      },
    ],
    [
      'component mount',
      (d) => {
        d.componentDiffs[''].diffType.type = 'create';
      },
    ],
    [
      'component definition',
      (d) => {
        d.definitionDiffs.rateLimiter = { modified: true };
      },
    ],
    [
      'unknown top field',
      (d) => {
        d.futureField = {};
      },
    ],
    [
      'unknown component field',
      (d) => {
        d.componentDiffs[''].futureField = {};
      },
    ],
    [
      'wrong added type',
      (d) => {
        d.componentDiffs[''].moduleDiff.added = 'webScanner.js';
      },
    ],
    [
      'missing module field',
      (d) => {
        delete d.componentDiffs[''].moduleDiff.removed;
      },
    ],
  ];
  for (const [name, change] of cases) {
    test(`blocks ${name} before sync`, () => {
      const d = diff();
      change(d);
      expect(() => assertEffectiveDiff(d, { allowQuery: true })).toThrow();
    });
  }
  test('missing expected query is blocked', () =>
    expect(() => assertEffectiveDiff(diff(), { allowQuery: true })).toThrow(
      'QUERY_ADDITION_NOT_EXACT'
    ));
  test('query addition in component is blocked', () => {
    const d = diff();
    d.componentDiffs.rateLimiter = d.componentDiffs[''];
    delete d.componentDiffs[''];
    d.componentDiffs.rateLimiter.moduleDiff.added = ['webScanner.js'];
    expect(() => assertEffectiveDiff(d, { allowQuery: true })).toThrow();
  });
  test('remote metadata strips raw private config', () => {
    const modules = safeRemoteModules({
      udfServerVersion: '1.31.5',
      private: 'not-returned',
      moduleHashes: [
        {
          path: 'scanner.js',
          environment: 'isolate',
          hash: 'a'.repeat(64),
          source: 'not-returned',
        },
      ],
    });
    expect(JSON.stringify(modules)).not.toContain('not-returned');
  });
  test('unrecognized remote metadata fails closed', () =>
    expect(() => safeRemoteModules({ moduleHashes: [] })).toThrow());
});
