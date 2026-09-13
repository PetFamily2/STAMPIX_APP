import { describe, expect, test } from 'bun:test';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION,
  assertPreviewTargetIsolation,
  assertProductionTargetIsolation,
  assertSchemaCompatibility,
  buildFunctionSpecArgs,
  classifyDeploymentKind,
  collectClientConsumedFunctions,
  collectLocalPublicFunctions,
  compareFunctionContracts,
  envPresence,
  matchUrlToDeploymentSlug,
  parseRemotePublicFunctions,
  redactSecrets,
  resolveBuildAppEnv,
  resolveConvexEnvFromProject,
  resolveProfileConvexUrl,
} from '../../scripts/lib/convex-deployment-contract.mjs';
import { resolveAppEnv, resolveConvexUrl } from '../../config/appEnvironment.ts';

const SCRIPT_PATH = 'scripts/verify-convex-deployment-contract.mjs';
const SCHEMA_SOURCE = readFileSync('convex/schema.ts', 'utf8');
const PACKAGE_JSON = readFileSync('package.json', 'utf8');
const EAS_RUN = readFileSync('scripts/eas-run.ps1', 'utf8');
const BILLING_GATES = readFileSync('scripts/prebuild-billing-gates.mjs', 'utf8');
const CONVEX_CONFIG = readFileSync('utils/convexConfig.ts', 'utf8');
const DEV_SLUG = 'canonical-dev-deployment';
const DEV_URL = `https://${DEV_SLUG}.convex.cloud`;
const PROD_SLUG = 'canonical-prod-deployment';
const PROD_URL = `https://${PROD_SLUG}.convex.cloud`;
const LEGACY_URL = 'https://legacy-deployment.convex.cloud';
const SECRET_URL = 'https://secret-target.example.invalid/convex';

function schemaFixture() {
  return [
    'capabilityAvailability:',
    '      persistedSmartManagerCapabilityAvailabilityValidator',
    'cardThemeId: v.optional(v.string())',
    'businessBillingAccounts: defineTable({',
    'businessReferralRewards: defineTable({',
  ].join('\n');
}

function specWithFunctions(names) {
  return {
    url: SECRET_URL,
    functions: names.map((identifier) => ({
      identifier,
      functionType: 'Query',
      visibility: { kind: 'public' },
    })),
  };
}

function createProjectFixture({
  devUrl = DEV_URL,
  prodUrl,
  legacyUrl,
  deployment = `dev:${DEV_SLUG}`,
  publicFunctions = [REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION],
  clientFunctions = [REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION],
} = {}) {
  const root = mkdtempSync(join(tmpdir(), 'stampaix-convex-contract-'));
  mkdirSync(join(root, 'convex'), { recursive: true });
  mkdirSync(join(root, 'app'), { recursive: true });
  const envLines = [];
  if (deployment != null) envLines.push(`CONVEX_DEPLOYMENT=${deployment}`);
  if (devUrl != null) envLines.push(`EXPO_PUBLIC_CONVEX_URL_DEV=${devUrl}`);
  if (prodUrl != null) envLines.push(`EXPO_PUBLIC_CONVEX_URL_PROD=${prodUrl}`);
  if (legacyUrl != null) envLines.push(`EXPO_PUBLIC_CONVEX_URL=${legacyUrl}`);
  writeFileSync(join(root, '.env.local'), `${envLines.join('\n')}\n`);
  writeFileSync(join(root, 'convex/schema.ts'), schemaFixture());
  writeFileSync(
    join(root, 'convex/loyaltyPrograms.ts'),
    publicFunctions
      .map(
        (name) =>
          `export const ${name.split(':')[1]} = query({\n  args: {},\n  handler: async () => [],\n});\n`
      )
      .join('\n')
  );
  writeFileSync(
    join(root, 'app/screen.tsx'),
    clientFunctions
      .map((name) => {
        const [mod, fn] = name.split(':');
        return `useQuery(api.${mod}.${fn}, {});\n`;
      })
      .join('')
  );
  return root;
}

function runVerifier(args, { cwd, env = {}, spec }) {
  const specPath = spec
    ? join(cwd, 'injected-function-spec.json')
    : undefined;
  if (specPath) {
    writeFileSync(specPath, JSON.stringify(spec));
  }
  return spawnSync('bun', [join(process.cwd(), SCRIPT_PATH), ...args], {
    cwd,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...env,
      ...(specPath
        ? { STAMPAIX_CONVEX_CONTRACT_SPEC_FILE: specPath }
        : {}),
    },
  });
}

describe('canonical Convex environment mapping', () => {
  test('preview maps to DEV/non-production Convex', () => {
    expect(
      resolveAppEnv({
        expoPublicAppEnv: 'preview',
        isDevRuntime: false,
      })
    ).toBe('dev');
    expect(resolveBuildAppEnv('preview')).toBe('dev');
    expect(
      resolveConvexUrl({
        appEnv: 'dev',
        devUrl: DEV_URL,
        prodUrl: PROD_URL,
        legacyUrl: LEGACY_URL,
      })
    ).toBe(DEV_URL);
    expect(
      resolveProfileConvexUrl('preview', {
        EXPO_PUBLIC_CONVEX_URL_DEV: DEV_URL,
        EXPO_PUBLIC_CONVEX_URL_PROD: PROD_URL,
      }).url
    ).toBe(DEV_URL);
  });

  test('preview may fall back to the legacy URL only when DEV is missing', () => {
    expect(
      resolveConvexUrl({
        appEnv: 'dev',
        prodUrl: PROD_URL,
        legacyUrl: LEGACY_URL,
      })
    ).toBe(LEGACY_URL);
  });

  test('production maps only to production Convex', () => {
    expect(
      resolveAppEnv({
        expoPublicAppEnv: 'production',
        isDevRuntime: true,
      })
    ).toBe('prod');
    expect(resolveBuildAppEnv('production')).toBe('prod');
    expect(
      resolveConvexUrl({
        appEnv: 'prod',
        devUrl: DEV_URL,
        prodUrl: PROD_URL,
        legacyUrl: LEGACY_URL,
      })
    ).toBe(PROD_URL);
  });

  test('production cannot fall back to DEV or legacy URLs', () => {
    expect(() =>
      resolveConvexUrl({
        appEnv: 'prod',
        devUrl: DEV_URL,
        legacyUrl: LEGACY_URL,
      })
    ).toThrow(/EXPO_PUBLIC_CONVEX_URL_PROD/);
    expect(CONVEX_CONFIG).toContain("if (APP_ENV === 'prod')");
    expect(CONVEX_CONFIG).toContain(
      'Production requires EXPO_PUBLIC_CONVEX_URL_PROD'
    );
  });

  test('missing Convex URL fails closed', () => {
    expect(() =>
      resolveConvexUrl({
        appEnv: 'dev',
      })
    ).toThrow();
    expect(() =>
      resolveProfileConvexUrl('production', {
        EXPO_PUBLIC_CONVEX_URL_DEV: DEV_URL,
      })
    ).toThrow(/EXPO_PUBLIC_CONVEX_URL_PROD/);
  });
});

describe('deployment isolation', () => {
  test('preview verifier cannot select Production', () => {
    expect(classifyDeploymentKind('prod:anything')).toBe('PRODUCTION');
    expect(() =>
      assertPreviewTargetIsolation({
        appEnv: 'dev',
        deploymentKind: 'PRODUCTION',
        convexUrl: DEV_URL,
        deploymentSlugValue: DEV_SLUG,
      })
    ).toThrow(/cannot select Production/);
    expect(buildFunctionSpecArgs({
      profile: 'preview',
      deploymentSlugValue: DEV_SLUG,
    })).not.toContain('--prod');
  });

  test('production verifier cannot select DEV', () => {
    expect(() =>
      assertProductionTargetIsolation({
        appEnv: 'prod',
        convexUrl: DEV_URL,
        devUrl: DEV_URL,
        legacyUrl: LEGACY_URL,
        deploymentKind: 'DEV',
        deploymentSlugValue: DEV_SLUG,
      })
    ).toThrow(/cannot select DEV/);
    expect(
      buildFunctionSpecArgs({
        profile: 'production',
        deploymentSlugValue: DEV_SLUG,
      })
    ).toEqual(['function-spec', '--prod', '--file']);
    expect(
      buildFunctionSpecArgs({
        profile: 'production',
        deploymentSlugValue: DEV_SLUG,
      })
    ).not.toContain('--deployment-name');
  });

  test('preview URL must match the canonical DEV deployment slug', () => {
    expect(matchUrlToDeploymentSlug(DEV_URL, DEV_SLUG)).toBe('MATCH');
    expect(matchUrlToDeploymentSlug(PROD_URL, DEV_SLUG)).toBe('MISMATCH');
  });
});

describe('remote public function contract', () => {
  test('missing required remote public function makes prebuild fail', () => {
    const comparison = compareFunctionContracts({
      localPublic: [REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION],
      clientConsumed: [REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION],
      remotePublic: ['users:getCurrentUser'],
    });
    expect(comparison.pass).toBe(false);
    expect(comparison.missingClientConsumed).toContain(
      REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION
    );
  });

  test('present required remote contract passes', () => {
    const comparison = compareFunctionContracts({
      localPublic: [REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION, 'users:getCurrentUser'],
      clientConsumed: [REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION],
      remotePublic: [
        REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION,
        'users:getCurrentUser',
      ],
    });
    expect(comparison.pass).toBe(true);
  });

  test('current required loyalty function is part of the verified contract', () => {
    const localPublic = collectLocalPublicFunctions(process.cwd());
    const consumed = collectClientConsumedFunctions(process.cwd(), {
      localPublic,
    });
    expect(consumed).toContain(REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION);
    expect(consumed).not.toContain('resend:com');
    expect(consumed).not.toContain('revenuecat:com');
  });

  test('function-spec parser ignores internal functions and keeps public identifiers', () => {
    const remote = parseRemotePublicFunctions({
      url: SECRET_URL,
      functions: [
        {
          identifier: 'loyaltyPrograms.js:listThemeReservationsByBusiness',
          visibility: { kind: 'public' },
        },
        {
          identifier: 'crons.js:tick',
          visibility: { kind: 'internal' },
        },
      ],
    });
    expect(remote).toEqual([REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION]);
  });
});

describe('schema compatibility gate', () => {
  test('schema compatibility gate remains active', () => {
    expect(() => assertSchemaCompatibility(SCHEMA_SOURCE)).not.toThrow();
    expect(() =>
      assertSchemaCompatibility('businessBillingAccounts: defineTable')
    ).toThrow(/Smart Manager/);
  });
});

describe('secret-safe output', () => {
  test('secret values/URLs are not emitted in normal error output', () => {
    const redacted = redactSecrets(
      `Failed ${SECRET_URL} token eyJabc.def CONVEX_DEPLOYMENT=dev:${DEV_SLUG}`
    );
    expect(redacted).not.toContain(SECRET_URL);
    expect(redacted).not.toContain('eyJabc.def');
    expect(redacted).not.toContain(`dev:${DEV_SLUG}`);
    expect(redacted).toContain('[REDACTED_URL]');
  });
});

describe('prebuild and EAS wiring', () => {
  test('existing Billing/Referral prebuild checks still execute', () => {
    expect(PACKAGE_JSON).toContain(
      'bun scripts/prebuild-billing-gates.mjs --preview'
    );
    expect(PACKAGE_JSON).toContain(
      'bun scripts/prebuild-billing-gates.mjs --production'
    );
    expect(BILLING_GATES).toContain('assertFrozenPlanContract()');
  });

  test('existing RTL checks still execute', () => {
    expect(PACKAGE_JSON).toContain('verify:rtl-native-config');
    expect(PACKAGE_JSON).toContain('verify:rtl-build-source');
    expect(EAS_RUN).toContain('prebuild:preview');
    expect(EAS_RUN).toContain('prebuild:production');
    expect(EAS_RUN).toContain('Assert-CleanGit');
  });

  test('EAS wrapper cannot bypass the Convex contract gate', () => {
    expect(EAS_RUN).toContain('Invoke-PrebuildGate');
    expect(EAS_RUN).not.toContain('convex deploy');
    expect(PACKAGE_JSON).toContain(
      'bun scripts/verify-convex-deployment-contract.mjs --preview'
    );
    expect(PACKAGE_JSON).toContain(
      'bun scripts/verify-convex-deployment-contract.mjs --production'
    );
  });
});

describe('verify-convex-deployment-contract CLI', () => {
  test('preview passes when the remote public contract is present', () => {
    const cwd = createProjectFixture();
    const result = runVerifier(['--preview'], {
      cwd,
      spec: specWithFunctions([REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION]),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Convex environment: preview');
    expect(result.stdout).toContain('Convex target: resolved');
    expect(result.stdout).toContain('Remote function contract: PASS');
    expect(result.stdout).not.toContain(DEV_URL);
    expect(result.stdout).not.toContain(SECRET_URL);
  });

  test('missing remote public function fails closed', () => {
    const cwd = createProjectFixture();
    const result = runVerifier(['--preview'], {
      cwd,
      spec: specWithFunctions(['users:getCurrentUser']),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PREBUILD FAIL');
    expect(result.stderr).toContain(REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION);
    expect(result.stderr).not.toContain(DEV_URL);
    expect(result.stderr).not.toContain(SECRET_URL);
  });

  test('remote verification failure makes build fail', () => {
    const cwd = createProjectFixture();
    const result = runVerifier(['--preview'], {
      cwd,
      env: { STAMPAIX_CONVEX_CONTRACT_FORCE_SPEC_ERROR: '1' },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('Remote verification failure');
  });

  test('missing Convex URL fails closed without printing values', () => {
    const cwd = createProjectFixture({
      devUrl: null,
      prodUrl: null,
      legacyUrl: null,
    });
    const result = runVerifier(['--preview'], {
      cwd,
      spec: specWithFunctions([REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION]),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('PREBUILD FAIL');
    expect(result.stderr).not.toContain(SECRET_URL);
  });

  test('production CLI uses --prod isolation and cannot fall back to DEV', () => {
    const cwd = createProjectFixture({
      prodUrl: PROD_URL,
      deployment: `dev:${DEV_SLUG}`,
    });
    const result = runVerifier(['--production'], {
      cwd,
      spec: specWithFunctions([REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION]),
    });
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Convex environment: production');
    expect(result.stdout).not.toContain(PROD_URL);
    expect(result.stdout).not.toContain('--deployment-name');
  });

  test('preview CLI rejects a Production deployment selector', () => {
    const cwd = createProjectFixture({
      deployment: `prod:${PROD_SLUG}`,
      devUrl: PROD_URL,
    });
    const result = runVerifier(['--preview'], {
      cwd,
      spec: specWithFunctions([REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION]),
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain('cannot select Production');
  });

  test('project env files win over inherited process env', () => {
    const env = resolveConvexEnvFromProject(
      createProjectFixture({
        devUrl: DEV_URL,
        prodUrl: null,
      }),
      {
        EXPO_PUBLIC_CONVEX_URL_DEV: SECRET_URL,
        EXPO_PUBLIC_CONVEX_URL_PROD: PROD_URL,
      }
    );
    expect(env.EXPO_PUBLIC_CONVEX_URL_DEV).toBe(DEV_URL);
    expect(envPresence(env.EXPO_PUBLIC_CONVEX_URL_PROD)).toBe('MISSING');
  });
});
