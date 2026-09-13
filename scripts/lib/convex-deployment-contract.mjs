import { existsSync, readdirSync, readFileSync, unlinkSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

import {
  resolveAppEnv,
  resolveConvexUrl,
} from '../../config/appEnvironment.ts';
import {
  persistedSmartManagerCapabilityAvailabilityValidator,
  smartManagerCapabilityAvailabilityValidator,
} from '../../convex/lib/smartManagerValidators.ts';

export const PREVIEW_EXPO_APP_ENV = 'preview';
export const PRODUCTION_EXPO_APP_ENV = 'production';
export const REQUIRED_CLIENT_LOYALTY_THEME_FUNCTION =
  'loyaltyPrograms:listThemeReservationsByBusiness';

const PUBLIC_FUNCTION_EXPORT =
  /^export const ([A-Za-z_][A-Za-z0-9_]*) = (query|mutation|action)\(/gm;
const CLIENT_API_REFERENCE =
  /(?<!https:\/\/)(?<!http:\/\/)\bapi\.([A-Za-z_][A-Za-z0-9_]*)\.([A-Za-z_][A-Za-z0-9_]*)\b/g;
const IGNORED_DIRECTORY_NAMES = new Set([
  '.git',
  '.tools',
  '.expo',
  'node_modules',
  '_generated',
  '__tests__',
  'dist',
]);

export class ConvexContractError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ConvexContractError';
  }
}

export function redactSecrets(text) {
  return String(text ?? '')
    .replace(/https?:\/\/[^\s"'\\]+/gi, '[REDACTED_URL]')
    .replace(/\b[a-z0-9_-]+\.convex\.(cloud|site)\b/gi, '[REDACTED_HOST]')
    .replace(/\b(dev|prod|preview):[A-Za-z0-9_-]+\b/gi, '[REDACTED_DEPLOYMENT]')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED_EMAIL]')
    .replace(/\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9._-]+/g, '[REDACTED_JWT]');
}

export function parseDotEnv(text) {
  const parsed = {};
  for (const rawLine of String(text ?? '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    parsed[key] = value;
  }
  return parsed;
}

export function loadEnvFiles(projectRoot, { readFile = readFileSync } = {}) {
  const merged = {};
  for (const name of ['.env', '.env.local']) {
    const filePath = join(projectRoot, name);
    try {
      Object.assign(merged, parseDotEnv(readFile(filePath, 'utf8')));
    } catch (error) {
      if (error && error.code !== 'ENOENT') {
        throw new ConvexContractError(`Cannot read ${name}`);
      }
    }
  }
  return merged;
}

export function resolveConvexEnvFromProject(projectRoot, processEnv = process.env, { readFile = readFileSync, exists = existsSync } = {}) {
  const hasEnvFiles =
    exists(join(projectRoot, '.env')) || exists(join(projectRoot, '.env.local'));
  const fileEnv = loadEnvFiles(projectRoot, { readFile });
  const source = hasEnvFiles ? fileEnv : processEnv;
  return {
    EXPO_PUBLIC_CONVEX_URL_DEV: source.EXPO_PUBLIC_CONVEX_URL_DEV,
    EXPO_PUBLIC_CONVEX_URL_PROD: source.EXPO_PUBLIC_CONVEX_URL_PROD,
    EXPO_PUBLIC_CONVEX_URL: source.EXPO_PUBLIC_CONVEX_URL,
    CONVEX_DEPLOYMENT: source.CONVEX_DEPLOYMENT,
  };
}

export function classifyDeploymentKind(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return 'MISSING';
  if (normalized.startsWith('dev:')) return 'DEV';
  if (normalized.startsWith('prod:')) return 'PRODUCTION';
  if (normalized.startsWith('preview:')) return 'PREVIEW';
  return 'OTHER';
}

export function deploymentSlug(value) {
  const text = String(value ?? '').trim();
  const separator = text.indexOf(':');
  if (separator <= 0) return '';
  return text.slice(separator + 1).trim();
}

export function envPresence(value) {
  if (value == null) return 'MISSING';
  if (String(value).trim() === '') return 'EMPTY';
  return 'PRESENT';
}

export function classifyUrlKind(value) {
  if (envPresence(value) !== 'PRESENT') return 'MISSING';
  try {
    const host = new URL(String(value).trim()).hostname.toLowerCase();
    if (host.endsWith('.convex.cloud') || host.endsWith('.convex.site')) {
      return 'CONVEX_HOST';
    }
    return 'NON_CONVEX_HOST';
  } catch {
    return 'INVALID';
  }
}

export function matchUrlToDeploymentSlug(url, slug) {
  if (envPresence(url) !== 'PRESENT' || !slug) return 'UNVERIFIED';
  try {
    const host = new URL(String(url).trim()).hostname.toLowerCase();
    const normalizedSlug = String(slug).trim().toLowerCase();
    if (
      host === `${normalizedSlug}.convex.cloud` ||
      host === `${normalizedSlug}.convex.site`
    ) {
      return 'MATCH';
    }
    return 'MISMATCH';
  } catch {
    return 'UNVERIFIED';
  }
}

export function resolveBuildAppEnv(profile) {
  if (profile === 'preview') {
    return resolveAppEnv({
      expoPublicAppEnv: PREVIEW_EXPO_APP_ENV,
      forceProdMode: false,
      isDevRuntime: false,
    });
  }
  if (profile === 'production') {
    return resolveAppEnv({
      expoPublicAppEnv: PRODUCTION_EXPO_APP_ENV,
      forceProdMode: false,
      isDevRuntime: false,
    });
  }
  throw new ConvexContractError(`Unknown Convex contract profile: ${profile}`);
}

export function resolveProfileConvexUrl(profile, env) {
  const appEnv = resolveBuildAppEnv(profile);
  try {
    return {
      appEnv,
      url: resolveConvexUrl({
        appEnv,
        devUrl: env.EXPO_PUBLIC_CONVEX_URL_DEV,
        prodUrl: env.EXPO_PUBLIC_CONVEX_URL_PROD,
        legacyUrl: env.EXPO_PUBLIC_CONVEX_URL,
      }),
    };
  } catch (error) {
    throw new ConvexContractError(
      redactSecrets(error instanceof Error ? error.message : String(error))
    );
  }
}

export function assertPreviewTargetIsolation({
  appEnv,
  deploymentKind,
  convexUrl,
  deploymentSlugValue,
}) {
  if (appEnv !== 'dev') {
    throw new ConvexContractError(
      'Preview must map to the non-production Convex environment'
    );
  }
  if (deploymentKind === 'PRODUCTION') {
    throw new ConvexContractError(
      'Preview verifier cannot select Production'
    );
  }
  if (deploymentKind !== 'DEV') {
    throw new ConvexContractError(
      `Preview Convex deployment kind is ${deploymentKind}`
    );
  }
  const match = matchUrlToDeploymentSlug(convexUrl, deploymentSlugValue);
  if (match !== 'MATCH') {
    throw new ConvexContractError(
      `Preview Convex target ${match} versus canonical DEV deployment`
    );
  }
}

export function assertProductionTargetIsolation({
  appEnv,
  convexUrl,
  devUrl,
  legacyUrl,
  deploymentKind,
  deploymentSlugValue,
}) {
  if (appEnv !== 'prod') {
    throw new ConvexContractError(
      'Production must map only to production Convex'
    );
  }
  if (envPresence(devUrl) === 'PRESENT') {
    const usesDev = matchUrlToDeploymentSlug(convexUrl, deploymentSlugValue);
    if (deploymentKind === 'DEV' && usesDev === 'MATCH') {
      throw new ConvexContractError(
        'Production verifier cannot select DEV'
      );
    }
  }
  if (envPresence(legacyUrl) === 'PRESENT' && convexUrl === legacyUrl) {
    throw new ConvexContractError(
      'Production cannot fall back to the legacy Convex URL'
    );
  }
  if (
    deploymentKind === 'DEV' &&
    matchUrlToDeploymentSlug(convexUrl, deploymentSlugValue) === 'MATCH'
  ) {
    throw new ConvexContractError('Production verifier cannot select DEV');
  }
}

export function buildFunctionSpecArgs({ profile, deploymentSlugValue }) {
  if (profile === 'preview') {
    if (!deploymentSlugValue) {
      throw new ConvexContractError('Preview Convex deployment slug is MISSING');
    }
    return ['function-spec', '--deployment-name', deploymentSlugValue, '--file'];
  }
  if (profile === 'production') {
    return ['function-spec', '--prod', '--file'];
  }
  throw new ConvexContractError(`Unknown Convex contract profile: ${profile}`);
}

export function assertFunctionSpecArgsSafe(profile, args) {
  const joined = args.join(' ');
  if (profile === 'preview' && args.includes('--prod')) {
    throw new ConvexContractError('Preview verifier cannot select Production');
  }
  if (profile === 'production' && args.includes('--deployment-name')) {
    throw new ConvexContractError(
      'Production verifier cannot select a non-production deployment name'
    );
  }
  if (profile === 'production' && !args.includes('--prod')) {
    throw new ConvexContractError(
      'Production verifier must use the explicit Production selector'
    );
  }
  return joined;
}

export function normalizeFunctionIdentifier(value) {
  return String(value ?? '')
    .replaceAll('\\', '/')
    .replace(/\.js:/, ':')
    .replace(/^\//, '');
}

function collectIdentifiers(node, acc = []) {
  if (!node) return acc;
  if (Array.isArray(node)) {
    for (const item of node) collectIdentifiers(item, acc);
    return acc;
  }
  if (typeof node !== 'object') return acc;
  const identifier =
    node.identifier ||
    node.udfPath ||
    node.canonicalUdfPath ||
    node.name ||
    node.path ||
    null;
  if (typeof identifier === 'string' && identifier.includes(':')) {
    const visibility = node.visibility?.kind || node.visibility || 'public';
    acc.push({
      identifier: normalizeFunctionIdentifier(identifier),
      visibility: String(visibility).toLowerCase(),
    });
  }
  for (const value of Object.values(node)) {
    if (value && typeof value === 'object') {
      collectIdentifiers(value, acc);
    }
  }
  return acc;
}

export function parseRemotePublicFunctions(spec) {
  const collected = collectIdentifiers(spec);
  return [
    ...new Set(
      collected
        .filter((entry) => entry.visibility !== 'internal')
        .map((entry) => entry.identifier)
    ),
  ].sort();
}

function walkFiles(root, extensions) {
  const files = [];
  if (!existsSync(root)) return files;
  const stack = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    let entries = [];
    try {
      entries = readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = join(current, entry.name);
      if (entry.isDirectory()) {
        if (!IGNORED_DIRECTORY_NAMES.has(entry.name)) {
          stack.push(fullPath);
        }
        continue;
      }
      if (extensions.some((extension) => entry.name.endsWith(extension))) {
        files.push(fullPath);
      }
    }
  }
  return files;
}

export function collectLocalPublicFunctions(projectRoot, { readFile = readFileSync } = {}) {
  const convexRoot = join(projectRoot, 'convex');
  const files = walkFiles(convexRoot, ['.ts']).filter((filePath) => {
    const base = filePath.replaceAll('\\', '/');
    return (
      !base.endsWith('/schema.ts') &&
      !base.endsWith('/convex.config.ts') &&
      !base.endsWith('.d.ts')
    );
  });
  const functions = new Set();
  for (const filePath of files) {
    const source = readFile(filePath, 'utf8');
    const relativePath = relative(convexRoot, filePath).replaceAll(sep, '/');
    const moduleName = relativePath.replace(/\.ts$/, '');
    PUBLIC_FUNCTION_EXPORT.lastIndex = 0;
    for (const match of source.matchAll(PUBLIC_FUNCTION_EXPORT)) {
      functions.add(`${moduleName}:${match[1]}`);
    }
  }
  return [...functions].sort();
}

export function collectClientConsumedFunctions(
  projectRoot,
  { readFile = readFileSync, localPublic = null } = {}
) {
  const roots = [
    'app',
    'components',
    'hooks',
    'lib',
    'screens',
    'contexts',
    'utils',
    'convex',
  ];
  const consumed = new Set();
  const localModules = localPublic
    ? new Set(localPublic.map((name) => name.split(':')[0]))
    : null;
  for (const rootName of roots) {
    const files = walkFiles(join(projectRoot, rootName), [
      '.ts',
      '.tsx',
      '.js',
      '.jsx',
    ]);
    for (const filePath of files) {
      if (filePath.replaceAll('\\', '/').includes('/_generated/')) continue;
      const source = readFile(filePath, 'utf8');
      CLIENT_API_REFERENCE.lastIndex = 0;
      for (const match of source.matchAll(CLIENT_API_REFERENCE)) {
        const identifier = `${match[1]}:${match[2]}`;
        if (localModules && !localModules.has(match[1])) {
          continue;
        }
        consumed.add(identifier);
      }
    }
  }
  return [...consumed].sort();
}

export function compareFunctionContracts({
  localPublic,
  clientConsumed,
  remotePublic,
}) {
  const remote = new Set(remotePublic);
  const missingLocalPublic = localPublic.filter((name) => !remote.has(name));
  const missingClientConsumed = clientConsumed.filter((name) => !remote.has(name));

  return {
    missingLocalPublic,
    missingClientConsumed,
    pass:
      missingLocalPublic.length === 0 && missingClientConsumed.length === 0,
  };
}

export function assertSchemaCompatibility(schemaSource) {
  const source = String(schemaSource ?? '');
  if (
    !source.includes(
      'capabilityAvailability:\n      persistedSmartManagerCapabilityAvailabilityValidator'
    )
  ) {
    throw new ConvexContractError(
      'Schema compatibility FAIL: persisted Smart Manager snapshots must keep historical documents valid'
    );
  }
  if (
    source.includes(
      'capabilityAvailability: smartManagerCapabilityAvailabilityValidator'
    )
  ) {
    throw new ConvexContractError(
      'Schema compatibility FAIL: current Smart Manager capability maps cannot be required on historical snapshots'
    );
  }
  if (!source.includes('cardThemeId: v.optional(v.string())')) {
    throw new ConvexContractError(
      'Schema compatibility FAIL: loyalty theme reservations must not require new persisted theme fields'
    );
  }
  if (!source.includes('businessBillingAccounts: defineTable')) {
    throw new ConvexContractError(
      'Schema compatibility FAIL: billing records must remain isolated in additive tables'
    );
  }
  if (!source.includes('businessReferralRewards: defineTable')) {
    throw new ConvexContractError(
      'Schema compatibility FAIL: referral records must remain isolated in additive tables'
    );
  }

  const persistedInvite =
    persistedSmartManagerCapabilityAvailabilityValidator.fields
      .ownerCapabilities.fields.invite_businesses;
  const currentInvite =
    smartManagerCapabilityAvailabilityValidator.fields.ownerCapabilities.fields
      .invite_businesses;
  if (currentInvite.isOptional !== 'required') {
    throw new ConvexContractError(
      'Schema compatibility FAIL: current owner capability maps must require invite_businesses'
    );
  }
  if (persistedInvite.isOptional !== 'optional') {
    throw new ConvexContractError(
      'Schema compatibility FAIL: persisted owner capability maps must keep invite_businesses optional'
    );
  }
}

export function formatContractReport({
  profile,
  targetResolved,
  remoteReachable,
  contract,
  schemaStatus,
}) {
  const lines = [
    `Convex environment: ${profile}`,
    `Convex target: ${targetResolved ? 'resolved' : 'unresolved'}`,
    `Remote deployment reachable: ${remoteReachable ? 'PASS' : 'FAIL'}`,
    `Remote function contract: ${contract ? 'PASS' : 'FAIL'}`,
    `Schema/deployment compatibility check: ${schemaStatus ? 'PASS' : 'FAIL'}`,
  ];
  return lines.join('\n');
}

export function deleteGeneratedSpecFiles(projectRoot, fileNames) {
  for (const name of fileNames) {
    const filePath = join(projectRoot, name);
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

export function listFunctionSpecFiles(projectRoot) {
  return readdirSync(projectRoot).filter((name) =>
    /^function_spec_\d+\.json$/.test(name)
  );
}
