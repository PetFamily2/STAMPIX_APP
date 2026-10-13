import { describe, expect, test } from 'bun:test';
import {
  assertAuditRpc,
  assertCandidateBundle,
  assertEffectiveDiff,
  assessRuntimeEvidence,
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
  test('direct exposed metadata can establish Node manifest/runtime equality', () =>
    expect(assessRuntimeEvidence(remote, request).sufficient).toBe(true));
  test('Node dependency drift never produces sufficient evidence', () =>
    expect(
      assessRuntimeEvidence(
        { ...remote, nodeDependencies: [{ name: 'jose', version: '6.1.4' }] },
        request
      ).sufficient
    ).toBe(false));
  test('Node runtime drift never produces sufficient evidence', () =>
    expect(
      assessRuntimeEvidence({ ...remote, nodeVersion: '22' }, request)
        .sufficient
    ).toBe(false));
  test('absent Node manifest is recorded without throwing before baseline dry-run', () => {
    const evidence = assessRuntimeEvidence(
      { ...remote, nodeDependencies: undefined },
      request
    );
    expect(evidence.sufficient).toBe(false);
    expect(evidence.missing).toEqual([
      'REMOTE_EXTERNAL_DEPENDENCY_MANIFEST_OR_AUTHORITATIVE_DIFF',
    ]);
    expect(evidence.pinnedFinishDiffCoversNodeConfiguration).toBe(false);
  });
  test('unknown Node manifest shape cannot produce a proof', () => {
    expect(
      assessRuntimeEvidence({ ...remote, nodeDependencies: [{}] }, request)
        .sufficient
    ).toBe(false);
  });
  test('absent Node version cannot be conflated with explicitly exposed null', () => {
    const { nodeVersion: _, ...missing } = remote;
    expect(
      assessRuntimeEvidence(missing, request).nodeVersionMatches
    ).toBeNull();
    expect(assessRuntimeEvidence(missing, request).sufficient).toBe(false);
  });
  test('UDF version drift is insufficient evidence', () =>
    expect(
      assessRuntimeEvidence({ ...remote, udfServerVersion: '1.31.6' }, request)
        .sufficient
    ).toBe(false));
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
  test('default empty dry-run finish is not evidence of a zero effective diff', () => {
    const placeholder = {
      authDiff: { added: [], removed: [] },
      definitionDiffs: {},
      componentDiffs: {},
    };
    expect(() => assertEffectiveDiff(placeholder)).toThrow(
      'DRY_RUN_EFFECTIVE_DIFF_UNAVAILABLE'
    );
    expect(() =>
      assertEffectiveDiff(placeholder, { allowQuery: true })
    ).toThrow('DRY_RUN_EFFECTIVE_DIFF_UNAVAILABLE');
  });
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

describe('Phase 3C-1B audit-only RPC and complete local candidate comparison', () => {
  for (const path of [
    '/api/deploy2/start_push',
    '/api/deploy2/wait_for_schema',
    '/api/deploy2/finish_push',
  ]) {
    test(`${path} allows only explicit dryRun true`, () => {
      expect(() =>
        assertAuditRpc(path, { adminKey: key, dryRun: true }, key)
      ).not.toThrow();
      for (const dryRun of [false, undefined, null, 1, 'true']) {
        expect(() =>
          assertAuditRpc(path, { adminKey: key, dryRun }, key)
        ).toThrow('AUDIT_REQUIRES_DRY_RUN_TRUE');
      }
    });
  }
  test('metadata read is permitted without a dry-run flag', () =>
    expect(() =>
      assertAuditRpc('/api/get_config_hashes', { adminKey: key }, key)
    ).not.toThrow());
  for (const path of [
    '/api/mutation',
    '/api/action',
    '/api/push_config',
    '/api/deploy2/finish_push?dryRun=true',
  ]) {
    test(`rejects unauthorized RPC ${path}`, () =>
      expect(() =>
        assertAuditRpc(path, { adminKey: key, dryRun: true }, key)
      ).toThrow('AUDIT_RPC_NOT_ALLOWED'));
  }
  test('RPC requires the exact guarded key', () =>
    expect(() =>
      assertAuditRpc('/api/get_config_hashes', { adminKey: 'other' }, key)
    ).toThrow());

  const bundle = () => ({
    adminKey: key,
    dryRun: true,
    functions: 'convex',
    appDefinition: {
      definition: null,
      dependencies: ['rateLimiter'],
      schema: { path: 'schema.js', source: 'schema', environment: 'isolate' },
      functions: [
        { path: 'scanner.js', source: 'unchanged', environment: 'isolate' },
      ],
      udfServerVersion: '1.31.5',
    },
    componentDefinitions: [
      { definitionPath: 'rateLimiter', udfServerVersion: '1.31.5' },
    ],
    nodeDependencies: [{ name: 'jose', version: '6.1.3' }],
  });
  const candidate = () => {
    const result = bundle();
    result.appDefinition.functions.push({
      path: 'webScanner.js',
      source: 'query',
      environment: 'isolate',
    });
    return result;
  };
  test('allows exactly the new query, proving existing modules and entire config unchanged locally', () =>
    expect(assertCandidateBundle(bundle(), candidate()).added).toEqual([
      'webScanner.js',
    ]));
  const changes = [
    [
      'Node dependencies',
      (r) => {
        r.nodeDependencies[0].version = '6.1.4';
      },
    ],
    [
      'Node version',
      (r) => {
        r.nodeVersion = '22';
      },
    ],
    [
      'components',
      (r) => {
        r.componentDefinitions[0].udfServerVersion = '1.31.6';
      },
    ],
    [
      'schema',
      (r) => {
        r.appDefinition.schema.source = 'changed';
      },
    ],
    [
      'function directory',
      (r) => {
        r.functions = 'other';
      },
    ],
    [
      'UDF version',
      (r) => {
        r.appDefinition.udfServerVersion = '1.31.6';
      },
    ],
    [
      'component definition',
      (r) => {
        r.appDefinition.definition = { path: 'convex.config.js' };
      },
    ],
    [
      'component dependencies',
      (r) => {
        r.appDefinition.dependencies.push('newComponent');
      },
    ],
    [
      'existing module replacement',
      (r) => {
        r.appDefinition.functions[0].source = 'changed';
      },
    ],
    [
      'existing module removal',
      (r) => {
        r.appDefinition.functions.shift();
      },
    ],
    [
      'existing source map',
      (r) => {
        r.appDefinition.functions[0].sourceMap = 'changed';
      },
    ],
    [
      'query in Node runtime',
      (r) => {
        r.appDefinition.functions[1].environment = 'node';
      },
    ],
    [
      'unknown app configuration',
      (r) => {
        r.appDefinition.futureConfig = {};
      },
    ],
    [
      'unknown request configuration',
      (r) => {
        r.futureConfig = {};
      },
    ],
    [
      'additional module',
      (r) => {
        r.appDefinition.functions.push({
          path: 'other.js',
          source: 'new',
          environment: 'isolate',
        });
      },
    ],
    [
      'duplicate module path',
      (r) => {
        r.appDefinition.functions.push(r.appDefinition.functions[0]);
      },
    ],
    [
      'activation',
      (r) => {
        r.dryRun = false;
      },
    ],
  ];
  for (const [name, change] of changes) {
    test(`blocks local ${name}`, () => {
      const r = candidate();
      change(r);
      expect(() => assertCandidateBundle(bundle(), r)).toThrow();
    });
  }
  test('a baseline already containing the query is not valid for this phase', () =>
    expect(() => assertCandidateBundle(candidate(), candidate())).toThrow(
      'LOCAL_QUERY_ADDITION_NOT_EXACT'
    ));
});
