import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

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
const exact = new Set([
  '.github/workflows/branch-verify.yml',
  '.github/workflows/business-web-preview-deploy.yml',
  'scripts/phase3c1-dev-audit.mjs',
  'scripts/lib/phase3c1-dev-guard.mjs',
  'lib/__tests__/phase3c1DevGuard.test.js',
  'convex/webScanner.ts',
  'convex/__tests__/scannerFlow.test.js',
  'convex/__tests__/helpers/scannerFixtures.js',
  'convex/__tests__/webScannerOutcome.test.js',
  'docs/qr-decoder-provenance.json',
  'vendor/jsqr/jsqr-1.4.0.js',
  'vendor/jsqr/CHANGES.md',
  'lib/__tests__/webQrFoundation.test.js',
  'lib/__tests__/webScannerCommands.test.js',
  'lib/__tests__/webScannerExport.test.js',
  'scripts/export-web-scanner-business.mjs',
  'scripts/verify-web-phase3-boundaries.mjs',
  'docs/PWA_PHASE3.md',
  'components/web-scanner/BusinessScanner.web.tsx',
  'components/web-scanner/BusinessScanner.tsx',
  'lib/web-scanner/command.ts',
  'lib/web-scanner/httpTransport.ts',
  'lib/web-scanner/recovery.ts',
  'lib/web-scanner/previewGate.ts',
  'web/scanner-business/qr-worker.js',
  'app/(web-business)/business/scanner-preview.tsx',
  'app/(web-business)/business/scanner-preview.web.tsx',
  'app/(web-staff)/staff/scanner-preview.tsx',
  'app/(web-staff)/staff/scanner-preview.web.tsx',
]);
for (const file of files)
  if (!exact.has(file)) throw new Error(`Outside Phase 3 boundary: ${file}`);
for (const file of [
  'components/QrScanner.tsx',
  'app/(authenticated)/(business)/scanner.tsx',
  'app/(authenticated)/(staff)/scanner.tsx',
  'convex/scanner.ts',
  'convex/referrals.ts',
  'convex/schema.ts',
  'package.json',
  'bun.lock',
  'app.json',
  'config/appConfig.ts',
  'lib/subscription/billingGuards.ts',
]) {
  const before = execFileSync('git', ['show', `${base}:${file}`]);
  if (!before.equals(readFileSync(file)))
    throw new Error(`Protected Native/schema/backend source changed: ${file}`);
}
const backend = readFileSync('convex/webScanner.ts', 'utf8');
if (
  /\b(mutation|action|internalMutation|internalAction)\s*\(|ctx\.db\.(patch|insert|delete|replace)|ctx\.scheduler|\.collect\s*\(/.test(
    backend
  )
)
  throw new Error('Only additive bounded read-only queries are approved');
if (
  !backend.includes('requireActorHasBusinessCapability') ||
  !backend.includes('returns:')
)
  throw new Error('Query auth/validators missing');
for (const file of files) {
  if (
    !/^(lib\/web-scanner|components\/web-scanner|web\/scanner-business)\//.test(
      file
    )
  )
    continue;
  const source = readFileSync(file, 'utf8');
  if (
    /useMutation|console\.|AsyncStorage|localStorage|CacheStorage|indexedDB|analytics|errorReporting|navigator\.serviceWorker|\.sync\.register|WebSocket/.test(
      source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*/g, '')
    )
  )
    throw new Error(`Disallowed business scanner dependency: ${file}`);
}
const workflow = readFileSync('.github/workflows/branch-verify.yml', 'utf8');
if (
  /^\s+push:|convex\s+(?:dev|deploy)/m.test(workflow) ||
  !workflow.includes('needs: verify') ||
  !workflow.includes('cancel-in-progress: true') ||
  !workflow.includes("EXPO_PUBLIC_WEB_SCANNER_COMMANDS: 'false'")
)
  throw new Error(
    'CI must be single verify then disabled-command Preview, no backend deployment'
  );
if (
  !workflow.includes('github.run_attempt > 1') ||
  !workflow.includes('node scripts/phase3c1-dev-audit.mjs --audit') ||
  workflow.includes('phase3c1-dev-audit.mjs --sync')
)
  throw new Error(
    'Regular CI may only perform read-only audit on manual re-run'
  );
const manual = readFileSync(
  '.github/workflows/business-web-preview-deploy.yml',
  'utf8'
);
if (
  !manual.includes('workflow_dispatch:') ||
  /^\s+(push|pull_request|workflow_run|schedule):/m.test(manual)
)
  throw new Error(
    'Backend synchronization must only use explicit manual dispatch'
  );
// biome-ignore lint/suspicious/noConsole: safe verification summary only.
console.log(
  'Phase 3 boundaries pass: original Native/mutations/schema unchanged; backend deployment disabled.'
);
