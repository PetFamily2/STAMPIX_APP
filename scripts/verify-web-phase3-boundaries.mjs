import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const base = '9afcfac8b5b68d3f72212f7866e0aad9c897b094';
execFileSync('git', ['merge-base', '--is-ancestor', base, 'HEAD']);
const files = new Set(
  [
    ...execFileSync('git', ['diff', '--name-only', base], { encoding: 'utf8' })
      .trim()
      .split('\n'),
    ...execFileSync('git', ['ls-files', '--others', '--exclude-standard'], {
      encoding: 'utf8',
    })
      .trim()
      .split('\n'),
  ].filter(Boolean)
);
// Release Candidate scope is authorized. Preserve the Native camera and billing/RTL contracts.
for (const file of [
  'components/QrScanner.tsx',
  'app/(authenticated)/(staff)/scanner.tsx',
  'convex/scanner.ts',
  'convex/referrals.ts',
  'app.json',
  'config/appConfig.ts',
  'lib/subscription/billingGuards.ts',
]) {
  const before = execFileSync('git', ['show', `${base}:${file}`]);
  if (!before.equals(readFileSync(file))) {
    throw new Error(`Protected camera/billing/backend source changed: ${file}`);
  }
}
// Freeze the already approved RC Native maps/location/push implementation as well.
for (const file of [
  'components/customer/DiscoveryMap.tsx',
  'hooks/useCurrentLocation.ts',
  'contexts/PushNotificationsContext.tsx',
]) {
  const approved = execFileSync('git', [
    'show',
    `119c3c58bb7ed085da5ba875f939585edc312ab1:${file}`,
  ]);
  if (!approved.equals(readFileSync(file)))
    throw new Error(`Protected Native maps/location/push changed: ${file}`);
}
// Preserve existing table fields and indexes. The 2026-10-28 full Web launch
// adds exactly two public-discovery read indexes; no field or data migration.
function tableSources(source) {
  const ast = ts.createSourceFile(
    'schema.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const tables = new Map();
  function walk(node) {
    if (
      ts.isCallExpression(node) &&
      node.expression.getText(ast) === 'defineSchema'
    ) {
      const object = node.arguments[0];
      if (!ts.isObjectLiteralExpression(object))
        throw new Error('Unknown schema shape');
      for (const property of object.properties) {
        if (
          ts.isSpreadAssignment(property) &&
          property.expression.getText(ast) === 'authTables'
        ) {
          tables.set('...authTables', property.getText(ast));
          continue;
        }
        if (!ts.isPropertyAssignment(property))
          throw new Error('Unknown table shape');
        tables.set(
          property.name.getText(ast),
          property.initializer.getText(ast)
        );
      }
    }
    ts.forEachChild(node, walk);
  }
  walk(ast);
  if (!tables.size) throw new Error('Missing schema tables');
  return tables;
}
const oldTables = tableSources(
  execFileSync('git', ['show', `${base}:convex/schema.ts`], {
    encoding: 'utf8',
  })
);
const newTables = tableSources(readFileSync('convex/schema.ts', 'utf8'));
function withoutApprovedDiscoveryIndexes(source) {
  const ast = ts.createSourceFile(
    'table.ts',
    `const table = ${source};`,
    ts.ScriptTarget.Latest,
    true
  );
  let node = ast.statements[0].declarationList.declarations[0].initializer;
  const literalIs = (value, expected) =>
    !!value && ts.isStringLiteral(value) && value.text === expected;
  const arrayIs = (value, expected) =>
    !!value &&
    ts.isArrayLiteralExpression(value) &&
    value.elements.length === 1 &&
    literalIs(value.elements[0], expected);
  while (
    ts.isCallExpression(node) &&
    ts.isPropertyAccessExpression(node.expression)
  ) {
    const method = node.expression.name.text;
    const [name, options] = node.arguments;
    const placeIndex =
      method === 'index' &&
      node.arguments.length === 2 &&
      literalIs(name, 'by_placeId') &&
      arrayIs(options, 'placeId');
    const searchProperties =
      options && ts.isObjectLiteralExpression(options)
        ? options.properties
        : [];
    const nameIndex =
      method === 'searchIndex' &&
      node.arguments.length === 2 &&
      literalIs(name, 'search_public_name') &&
      searchProperties.length === 2 &&
      searchProperties.every(
        (property) =>
          ts.isPropertyAssignment(property) &&
          ((property.name.getText(ast) === 'searchField' &&
            literalIs(property.initializer, 'name')) ||
            (property.name.getText(ast) === 'filterFields' &&
              arrayIs(property.initializer, 'isActive')))
      );
    if (!placeIndex && !nameIndex) break;
    node = node.expression.expression;
  }
  return node.getText(ast);
}
for (const [name, source] of oldTables)
  if (
    !newTables.has(name) ||
    (name === 'businesses'
      ? withoutApprovedDiscoveryIndexes(newTables.get(name)) !== source
      : newTables.get(name) !== source)
  )
    throw new Error(`Existing schema table changed: ${name}`);
const priorPackage = JSON.parse(
  execFileSync('git', ['show', `${base}:package.json`], { encoding: 'utf8' })
);
const nextPackage = JSON.parse(readFileSync('package.json', 'utf8'));
for (const [name, version] of Object.entries(priorPackage.dependencies))
  if (nextPackage.dependencies[name] !== version)
    throw new Error(`Existing Native dependency changed: ${name}`);
const backend = readFileSync('convex/webScanner.ts', 'utf8');
if (
  /\b(mutation|action|internalMutation|internalAction)\s*\(|ctx\.db\.(patch|insert|delete|replace)|ctx\.scheduler|\.collect\s*\(/.test(
    backend
  )
) {
  throw new Error('Only additive bounded read-only queries are approved');
}
if (
  !backend.includes('requireActorHasBusinessCapability') ||
  !backend.includes('returns:')
) {
  throw new Error('Query auth/validators missing');
}
for (const file of files) {
  if (
    !/^(lib\/web-scanner|components\/web-scanner|web\/scanner-business)\//.test(
      file
    )
  ) {
    continue;
  }
  const source = readFileSync(file, 'utf8');
  if (
    /useMutation|console\.|AsyncStorage|localStorage|CacheStorage|indexedDB|analytics|errorReporting|navigator\.serviceWorker|\.sync\.register|WebSocket/.test(
      source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    )
  ) {
    throw new Error(`Disallowed business scanner dependency: ${file}`);
  }
}
const workflow = readFileSync('.github/workflows/branch-verify.yml', 'utf8');
if (
  !workflow.includes('shared-web:') ||
  !workflow.includes('needs: verify') ||
  !workflow.includes("needs.verify.result == 'success'") ||
  !workflow.includes('cancel-in-progress: true') ||
  !workflow.includes('EXPECTED_HEAD:') ||
  workflow.includes('phase3c1-preview-e2e.mjs') ||
  workflow.includes('product-preview.mjs') ||
  workflow.includes('seed synthetic') ||
  /^\s+(push|schedule|workflow_dispatch):/m.test(workflow)
)
  throw new Error(
    'Verified exact-head shared backend workflow required; no fixtures'
  );
const audit = readFileSync('scripts/phase3c1-dev-audit.mjs', 'utf8');
if (
  audit.includes('--sync') ||
  audit.includes('dryRun: false') ||
  !audit.includes('assertAuditRpc(path, body')
) {
  throw new Error('Audit must have no activation path and guard every RPC');
}
// biome-ignore lint/suspicious/noConsole: safe verification summary only.
console.log(
  'Phase 3 boundaries pass: Native camera/billing/RTL and existing business mutations unchanged; existing shared backend selected only after exact-head verification; no fixtures.'
);

const seedTemplate = readFileSync(
  'scripts/phase3-preview/fixtures.ts.template',
  'utf8'
);
if (
  seedTemplate.includes('export const seed = mutation(') ||
  !seedTemplate.includes('internalMutation') ||
  !seedTemplate.includes('PHASE3_FIXTURE_SECRET') ||
  !seedTemplate.includes('CONVEX_CLOUD_URL') ||
  execFileSync('git', ['ls-files', 'convex/*phase3Fixtures*'], {
    encoding: 'utf8',
  }).trim()
) {
  throw new Error(
    'Synthetic seed must exist only in isolated Preview staging, never regular backend'
  );
}
