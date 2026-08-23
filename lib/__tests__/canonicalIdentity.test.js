import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const appConfig = JSON.parse(readFileSync('app.json', 'utf8')).expo;
const PROVIDER_CREDENTIALS_PATH = 'convex/providerCredentials.ts';
const HISTORICAL_IDENTITY_STEM = ['stamp', 'ix'].join('');
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
  assert.equal(appConfig.slug, 'stampaix');
  assert.equal(appConfig.scheme, 'stampaix');
  assert.equal(appConfig.version, '1.0.0');
  assert.equal(appConfig.android.package, 'com.stampaix.app');
  assert.equal(appConfig.ios.bundleIdentifier, 'com.stampaix.app');
  assert.deepEqual(appConfig.ios.associatedDomains, ['applinks:stampaix.app']);
  assert.equal(appConfig.android.intentFilters[0].data[0].host, 'stampaix.app');
  assert.equal(appConfig.extra.eas.projectId, '74e10cc1-aece-4da6-8049-e62cc8adf17d');
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
