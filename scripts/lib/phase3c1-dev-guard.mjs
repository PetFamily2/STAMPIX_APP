import { createHash } from 'node:crypto';

export const PHASE3_BASE = '9afcfac8b5b68d3f72212f7866e0aad9c897b094';
export const APPROVED_DEV = 'utmost-fennec-280';
export const KNOWN_PRODUCTION = 'aware-llama-850';

const fail = (code) => {
  throw new Error(code);
};
export const digest = (value) =>
  createHash('sha256')
    .update(JSON.stringify(value) ?? 'undefined')
    .digest('hex');

export function canonicalDeploymentUrl(raw) {
  if (
    typeof raw !== 'string' ||
    !/^https:\/\/[a-z0-9]+(?:-[a-z0-9]+)*\.convex\.cloud\/?$/.test(raw)
  ) {
    fail('NON_CANONICAL_CONVEX_URL');
  }
  const url = new URL(raw);
  return {
    url: url.origin,
    slug: url.hostname.slice(0, -'.convex.cloud'.length),
  };
}

export function verifyDevTarget(pulled, key) {
  const target = canonicalDeploymentUrl(pulled.EXPO_PUBLIC_CONVEX_URL_DEV);
  const production = pulled.EXPO_PUBLIC_CONVEX_URL_PROD
    ? canonicalDeploymentUrl(pulled.EXPO_PUBLIC_CONVEX_URL_PROD)
    : null;
  if (target.slug === KNOWN_PRODUCTION || target.url === production?.url) {
    fail('PRODUCTION_TARGET_REJECTED');
  }
  if (target.slug !== APPROVED_DEV) {
    fail('UNAPPROVED_DEV_TARGET');
  }
  const deployment = `dev:${target.slug}`;
  if (pulled.CONVEX_DEPLOYMENT && pulled.CONVEX_DEPLOYMENT !== deployment) {
    fail('EAS_DEPLOYMENT_MISMATCH');
  }
  if (
    typeof key !== 'string' ||
    !key.startsWith(`${deployment}|`) ||
    key.length <= deployment.length + 1 ||
    /\s/.test(key)
  ) {
    fail('DEV_KEY_MISSING_OR_MISMATCHED');
  }
  return {
    ...target,
    deployment,
    productionCompared: !!production,
    knownProductionRejected: true,
  };
}

const empty = (value) => Array.isArray(value) && value.length === 0;
const exactKeys = (value, required, optional = []) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  required.every((k) => Object.hasOwn(value, k)) &&
  Object.keys(value).every((k) => required.includes(k) || optional.includes(k));
const safeModule = (p) =>
  typeof p === 'string' && /^[a-zA-Z0-9_./-]+\.js$/.test(p);

export function summarizeEffectiveDiff(diff) {
  const count = (items) => (Array.isArray(items) ? items.length : null);
  const names = (items) =>
    Array.isArray(items) ? items.filter(safeModule) : [];
  return {
    topLevelFields: Object.keys(diff ?? {}).filter((k) =>
      /^[a-zA-Z_]+$/.test(k)
    ),
    authAdded: count(diff?.authDiff?.added),
    authRemoved: count(diff?.authDiff?.removed),
    components: Object.entries(diff?.componentDiffs ?? {})
      .filter(([p]) => /^[a-zA-Z0-9_/-]*$/.test(p))
      .map(([path, item]) => ({
        path,
        addedModules: names(item.moduleDiff?.added),
        removedModules: names(item.moduleDiff?.removed),
        schemaChanged: item.schemaDiff !== null,
        runtimeChanged: item.udfConfigDiff !== null,
        indexChanges: Object.values(item.indexDiff ?? {}).reduce(
          (n, v) => n + (count(v) ?? 1),
          0
        ),
        cronChanges: Object.values(item.cronDiff ?? {}).reduce(
          (n, v) => n + (count(v) ?? 1),
          0
        ),
        fieldNames: Object.keys(item).filter((k) => /^[a-zA-Z_]+$/.test(k)),
      })),
  };
}

/** Fail closed on unknown RPC shapes or ANY existing code/configuration change. */
export function assertEffectiveDiff(diff, { allowQuery = false } = {}) {
  if (!exactKeys(diff, ['authDiff', 'definitionDiffs', 'componentDiffs'])) {
    fail('UNKNOWN_DIFF_SHAPE');
  }
  if (
    !exactKeys(diff.authDiff, ['added', 'removed']) ||
    !empty(diff.authDiff.added) ||
    !empty(diff.authDiff.removed)
  ) {
    fail('AUTH_DRIFT');
  }
  if (
    !exactKeys(
      diff.definitionDiffs,
      [],
      Object.keys(diff.definitionDiffs ?? {})
    )
  ) {
    fail('UNKNOWN_DEFINITION_DIFF');
  }
  for (const item of Object.values(diff.definitionDiffs)) {
    if (!exactKeys(item, [])) {
      fail('COMPONENT_DEFINITION_DRIFT');
    }
  }
  if (
    !exactKeys(diff.componentDiffs, [], Object.keys(diff.componentDiffs ?? {}))
  ) {
    fail('UNKNOWN_COMPONENT_DIFF');
  }
  const additions = [];
  for (const [component, item] of Object.entries(diff.componentDiffs)) {
    if (
      !exactKeys(item, [
        'diffType',
        'moduleDiff',
        'udfConfigDiff',
        'cronDiff',
        'indexDiff',
        'schemaDiff',
      ])
    ) {
      fail('UNKNOWN_COMPONENT_DIFF');
    }
    if (
      !exactKeys(item.diffType, ['type']) ||
      item.diffType.type !== 'modify'
    ) {
      fail('COMPONENT_TOPOLOGY_DRIFT');
    }
    if (item.udfConfigDiff !== null) {
      fail('UDF_VERSION_DRIFT');
    }
    if (item.schemaDiff !== null) {
      fail('SCHEMA_DRIFT');
    }
    if (
      !exactKeys(item.cronDiff, ['added', 'updated', 'deleted']) ||
      !Object.values(item.cronDiff).every(empty)
    ) {
      fail('CRON_DRIFT');
    }
    if (
      !exactKeys(
        item.indexDiff,
        ['added_indexes', 'removed_indexes'],
        ['enabled_indexes', 'disabled_indexes']
      ) ||
      !Object.values(item.indexDiff).every(empty)
    ) {
      fail('INDEX_DRIFT');
    }
    if (
      !exactKeys(item.moduleDiff, ['added', 'removed']) ||
      !empty(item.moduleDiff.removed) ||
      !Array.isArray(item.moduleDiff.added) ||
      !item.moduleDiff.added.every(safeModule)
    ) {
      fail('MODULE_DRIFT');
    }
    for (const name of item.moduleDiff.added) {
      if (!allowQuery || component !== '' || name !== 'webScanner.js') {
        fail('EXISTING_MODULE_DRIFT');
      }
      additions.push(name);
    }
  }
  if (
    allowQuery &&
    (additions.length !== 1 || additions[0] !== 'webScanner.js')
  ) {
    fail('QUERY_ADDITION_NOT_EXACT');
  }
  return {
    added: additions,
    existingBackendChanges: 0,
    schemaChanges: 0,
    authChanges: 0,
    indexChanges: 0,
  };
}

/** Only paths, environments and hashes; never raw config, credentials or user data. */
export function safeRemoteModules(config) {
  if (
    !Array.isArray(config.moduleHashes) ||
    typeof config.udfServerVersion !== 'string'
  ) {
    fail('REMOTE_CONFIG_METADATA_UNAVAILABLE');
  }
  return config.moduleHashes
    .map((m) => {
      if (
        !safeModule(m.path) ||
        !['isolate', 'node'].includes(m.environment) ||
        typeof m.hash !== 'string' ||
        !/^[a-zA-Z0-9+/=_-]{20,128}$/.test(m.hash)
      ) {
        fail('UNKNOWN_REMOTE_MODULE_METADATA');
      }
      return { path: m.path, environment: m.environment, hash: m.hash };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}
