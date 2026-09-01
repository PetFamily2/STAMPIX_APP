import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const appConfig = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const APP_CONFIG_PATH = 'app.json';
const GOOGLE_SERVICES_PATH = 'google-services.json';
const PROVIDER_CREDENTIALS_PATH = 'convex/providerCredentials.ts';
const HISTORICAL_IDENTITY_STEM = ['stamp', 'ix'].join('');
const EAS_COMPATIBILITY_SLUG = HISTORICAL_IDENTITY_STEM;
const EAS_PROJECT_ID = '74e10cc1-aece-4da6-8049-e62cc8adf17d';
const GOOGLE_PROJECT_ID = `${HISTORICAL_IDENTITY_STEM}-487416`;
const GOOGLE_STORAGE_BUCKET = `${GOOGLE_PROJECT_ID}.firebasestorage.app`;
// These exact values are frozen external Google Cloud/Firebase compatibility
// identifiers, not public StampAix branding. Do not broaden this into a general allowlist.
const APPROVED_GOOGLE_COMPATIBILITY_VALUES = new Set([
  GOOGLE_PROJECT_ID,
  GOOGLE_STORAGE_BUCKET,
]);
const EAS_SLUG_COMPATIBILITY_NOTE = [
  `Existing EAS project ${EAS_PROJECT_ID} is already bound to remote slug "${EAS_COMPATIBILITY_SLUG}".`,
  'The Expo slug is an internal EAS infrastructure identifier intentionally frozen for compatibility.',
  'It must never be used as user-facing/public StampAix branding; changing it requires a deliberate EAS project migration.',
].join(' ');
const APPROVED_PROVIDER_COMPATIBILITY_LITERALS = [
  `${HISTORICAL_IDENTITY_STEM}-provider-revocation`,
  `${HISTORICAL_IDENTITY_STEM}-provider-identity-fingerprint:key:v1`,
  `${HISTORICAL_IDENTITY_STEM}-provider-identity-fingerprint:input:v1`,
  `__${HISTORICAL_IDENTITY_STEM}EncryptedProviderCredential`,
  `__${HISTORICAL_IDENTITY_STEM}OAuthIssuedAt`,
];
const PROVIDER_COMPATIBILITY_COMMENT = [
  '// Compatibility-critical internal protocol/storage identifiers. The historical',
  `// "${HISTORICAL_IDENTITY_STEM}" spelling is intentional, is not public branding, and must not be`,
  '// renamed without an explicit data and protocol migration.',
].join('\n');

function countOccurrences(source, value) {
  return source.split(value).length - 1;
}

function prepareProviderCredentialsForLegacySweep(source) {
  const normalizedSource = source.replace(/\r\n/g, '\n');
  assert.equal(
    countOccurrences(normalizedSource, PROVIDER_COMPATIBILITY_COMMENT),
    1,
    `${PROVIDER_CREDENTIALS_PATH} must contain the compatibility comment exactly once`
  );
  let activeSource = normalizedSource.replace(PROVIDER_COMPATIBILITY_COMMENT, '');

  for (const literal of APPROVED_PROVIDER_COMPATIBILITY_LITERALS) {
    const quotedLiteral = `'${literal}'`;
    assert.equal(
      countOccurrences(normalizedSource, quotedLiteral),
      1,
      `${PROVIDER_CREDENTIALS_PATH} must contain ${quotedLiteral} exactly once`
    );
    activeSource = activeSource.replace(quotedLiteral, "''");
  }

  return activeSource;
}

function prepareAppConfigForLegacySweep(source) {
  const approvedSlugProperty = `"slug": "${EAS_COMPATIBILITY_SLUG}"`;
  assert.equal(
    countOccurrences(source, approvedSlugProperty),
    1,
    `${APP_CONFIG_PATH} must contain exactly one approved internal EAS slug exception`
  );
  return source.replace(approvedSlugProperty, '"slug": ""');
}

function prepareGoogleServicesForLegacySweep(source) {
  const googleServices = JSON.parse(source);

  assert.equal(
    googleServices.project_info?.project_id,
    GOOGLE_PROJECT_ID,
    `${GOOGLE_SERVICES_PATH} must use the approved Google project ID`
  );
  assert.equal(
    googleServices.project_info?.storage_bucket,
    GOOGLE_STORAGE_BUCKET,
    `${GOOGLE_SERVICES_PATH} must use the approved Firebase storage bucket`
  );
  assert.ok(
    Array.isArray(googleServices.client) &&
      googleServices.client.some(
        (client) =>
          client.client_info?.android_client_info?.package_name ===
          'com.stampaix.app'
      ),
    `${GOOGLE_SERVICES_PATH} must contain the canonical Android client`
  );

  return JSON.stringify(googleServices, (_key, value) =>
    APPROVED_GOOGLE_COMPATIBILITY_VALUES.has(value) ? '' : value
  );
}

function extractBracedBlock(source, marker, fromIndex = 0) {
  const markerIndex = source.indexOf(marker, fromIndex);
  assert.notEqual(markerIndex, -1, `missing source marker: ${marker}`);

  const openingBraceIndex = source.indexOf('{', markerIndex + marker.length);
  assert.notEqual(openingBraceIndex, -1, `missing block for source marker: ${marker}`);

  let depth = 0;
  for (let index = openingBraceIndex; index < source.length; index += 1) {
    if (source[index] === '{') depth += 1;
    if (source[index] !== '}') continue;

    depth -= 1;
    if (depth === 0) {
      return {
        body: source.slice(openingBraceIndex + 1, index),
        endIndex: index + 1,
      };
    }
  }

  assert.fail(`unterminated block for source marker: ${marker}`);
}

test('canonical launch identity stays aligned across Expo platforms', () => {
  assert.equal(appConfig.name, 'StampAix');
  assert.equal(appConfig.slug, EAS_COMPATIBILITY_SLUG, EAS_SLUG_COMPATIBILITY_NOTE);
  assert.equal(appConfig.scheme, 'stampaix');
  assert.equal(appConfig.version, '1.0.0');
  assert.equal(appConfig.android.package, 'com.stampaix.app');
  assert.equal(appConfig.ios.bundleIdentifier, 'com.stampaix.app');
  assert.equal(appConfig.ios.usesAppleSignIn, true);
  assert.deepEqual(appConfig.ios.entitlements['com.apple.developer.applesignin'], [
    'Default',
  ]);
  assert.deepEqual(appConfig.ios.associatedDomains, ['applinks:stampaix.com']);
  assert.equal(appConfig.android.intentFilters[0].data[0].host, 'stampaix.com');
  assert.equal(appConfig.extra.eas.projectId, EAS_PROJECT_ID);
});

test('active tracked source contains no deprecated public identity', () => {
  const deprecatedStem = ['stamp', 'ix'].join('');
  const deprecatedPatterns = [
    new RegExp(`${deprecatedStem}:\\/\\/`, 'i'),
    new RegExp(`https:\\/\\/${deprecatedStem}\\.app`, 'i'),
    new RegExp(`com\\.${deprecatedStem}\\.${deprecatedStem}`, 'i'),
    new RegExp(`\\b${['STAM', 'PIX'].join('')}\\b`),
    new RegExp(`\\b${['STAM', 'PAIX'].join('')}\\b`),
    new RegExp(`\\b${['Stamp', 'ix'].join('')}\\b`),
    new RegExp(`\\b${deprecatedStem}\\b`),
  ];
  const trackedFiles = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
    { encoding: 'utf8' }
  )
    .split('\0')
    .filter(Boolean)
    .filter((file) => existsSync(file))
    .filter(
      (file) =>
        !file.startsWith('_tmp/') &&
        !file.startsWith('docs/archive/')
    );

  for (const file of trackedFiles) {
    assert.equal(
      file.toLowerCase().includes(deprecatedStem),
      false,
      `deprecated identity remains in tracked path: ${file}`
    );
    const bytes = readFileSync(file);
    if (bytes.includes(0)) {
      continue;
    }
    const source = bytes.toString('utf8');
    const sourceToScan =
      file === PROVIDER_CREDENTIALS_PATH
        ? prepareProviderCredentialsForLegacySweep(source)
        : file === APP_CONFIG_PATH
          ? prepareAppConfigForLegacySweep(source)
          : file === GOOGLE_SERVICES_PATH
            ? prepareGoogleServicesForLegacySweep(source)
            : source;
    if (file === PROVIDER_CREDENTIALS_PATH) {
      assert.doesNotMatch(
        sourceToScan,
        new RegExp(deprecatedStem, 'i'),
        `${file} contains an unapproved historical identifier`
      );
    }
    for (const pattern of deprecatedPatterns) {
      assert.doesNotMatch(sourceToScan, pattern, `${file} contains ${pattern}`);
    }
  }
});

test('production configuration does not use legacy client fallbacks', () => {
  const convexSource = readFileSync('utils/convexConfig.ts', 'utf8');
  const convexProductionBranch = extractBracedBlock(
    convexSource,
    "if (APP_ENV === 'prod')"
  );
  assert.match(
    convexSource,
    /const\s+prodUrl\s*=\s*process\.env\.EXPO_PUBLIC_CONVEX_URL_PROD\s*;/
  );
  const configuredProdUrlBranch = extractBracedBlock(
    convexProductionBranch.body,
    'if (prodUrl?.trim())'
  );
  assert.match(configuredProdUrlBranch.body, /return\s+prodUrl\s*;/);
  assert.match(
    convexProductionBranch.body.slice(configuredProdUrlBranch.endIndex),
    /^\s*throw\s+new\s+Error\s*\(/
  );
  assert.doesNotMatch(
    convexProductionBranch.body,
    /return\s+(?:devUrl|legacyUrl)\b|\bEXPO_PUBLIC_CONVEX_URL_DEV\b|\bEXPO_PUBLIC_CONVEX_URL\b/
  );

  const developmentFallbackIndex = convexSource.search(
    /if\s*\(\s*APP_ENV\s*===\s*['"]dev['"][^)]*\)\s*\{/
  );
  const legacyFallbackIndex = convexSource.indexOf(
    'if (legacyUrl)',
    convexProductionBranch.endIndex
  );
  assert.ok(developmentFallbackIndex >= convexProductionBranch.endIndex);
  assert.ok(legacyFallbackIndex >= convexProductionBranch.endIndex);

  const revenueCatSource = readFileSync('utils/revenueCatConfig.ts', 'utf8');
  const firstProductionBranch = extractBracedBlock(
    revenueCatSource,
    "if (APP_ENV === 'prod')"
  );
  const secondProductionBranch = extractBracedBlock(
    revenueCatSource,
    "if (APP_ENV === 'prod')",
    firstProductionBranch.endIndex
  );
  assert.equal(
    revenueCatSource.indexOf("if (APP_ENV === 'prod')", secondProductionBranch.endIndex),
    -1
  );
  const productionBranches = [firstProductionBranch.body, secondProductionBranch.body];
  for (const branch of productionBranches) {
    assert.match(branch, /prodKey/);
    assert.doesNotMatch(branch, /devKey|legacyKey/);
  }
});
