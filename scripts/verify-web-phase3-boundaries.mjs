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
// Preserve every existing schema table exactly; new tables are additive.
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
for (const [name, source] of oldTables)
  if (newTables.get(name) !== source)
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
  /^\s+push:|convex\s+(?:dev|deploy)/m.test(workflow) ||
  !workflow.includes('needs: verify') ||
  !workflow.includes('cancel-in-progress: true') ||
  !workflow.includes("EXPO_PUBLIC_WEB_SCANNER_COMMANDS: 'false'")
) {
  throw new Error(
    'CI must be single verify then disabled-command Preview, no backend deployment'
  );
}
if (
  workflow.includes('phase3c1-manual-dispatch') ||
  workflow.includes('createWorkflowDispatch') ||
  !workflow.includes(
    "github.head_ref != 'pwa/phase-3-scanner-commands-20261005'"
  ) ||
  workflow.includes('CONVEX_DEV_DEPLOY_KEY') ||
  workflow.includes('phase3c1-dev-audit.mjs --sync')
) {
  throw new Error(
    'Phase 3 ordinary CI must not dispatch a launcher or use DEV credentials'
  );
}
if (
  !workflow.includes('isolated-preview-e2e:') ||
  !workflow.includes('119c3c58bb7ed085da5ba875f939585edc312ab1') ||
  !workflow.includes('secrets.CONVEX_PREVIEW_DEPLOY_KEY') ||
  !workflow.includes("needs.verify.result == 'success'")
)
  throw new Error('Pinned PR Preview guards missing');
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
  'Phase 3 boundaries pass: Native camera/billing/RTL and existing business mutations unchanged; backend creation restricted to exact-source PR verified isolated Preview.'
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
