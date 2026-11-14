import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const base = 'fca2febbcec1598491854c8ab751561684308d7a';
execFileSync('git', ['merge-base', '--is-ancestor', base, 'HEAD']);
const changed = execFileSync('git', ['diff', '--name-only', base], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
const untracked = execFileSync(
  'git',
  ['ls-files', '--others', '--exclude-standard'],
  { encoding: 'utf8' }
)
  .trim()
  .split('\n')
  .filter(Boolean);
const allowed = [
  '.github/workflows/branch-verify.yml',
  'biome.json',
  'components/web-scanner/',
  'lib/web-scanner/',
  'web/scanner-lab/',
  'vendor/jsqr/',
  'docs/PWA_PHASE2',
  'docs/qr-decoder-provenance.json',
  'lib/__tests__/webQr',
  'scripts/export-qr-lab.mjs',
  'scripts/verify-web-phase2-boundaries.mjs',
];
for (const file of new Set([...changed, ...untracked])) {
  if (!allowed.some((prefix) => file === prefix || file.startsWith(prefix))) {
    throw new Error(`File outside Phase 2: ${file}`);
  }
}
for (const file of [...changed, ...untracked].filter(
  (name) =>
    /^(components\/web-scanner|lib\/web-scanner|web\/scanner-lab)\//.test(
      name
    ) && /\.[jt]sx?$/.test(name)
)) {
  const source = readFileSync(file, 'utf8').replace(
    /\/\*[\s\S]*?\*\/|\/\/[^\n]*/g,
    ''
  );
  if (
    /convex|commitStamp|commitRedeem|resolveScan|referral|useMutation|localStorage|sessionStorage|indexedDB|analytics|fetch\s*\(|XMLHttpRequest|WebSocket|console\./i.test(
      source
    )
  ) {
    throw new Error(
      `Forbidden business/network/storage/logging dependency: ${file}`
    );
  }
}
const workflow = readFileSync('.github/workflows/branch-verify.yml', 'utf8');
if (/convex\s+(?:dev|deploy)|CONVEX_DEPLOY_KEY|^\s+push:/m.test(workflow)) {
  throw new Error('Phase 2 must not sync backend or add duplicate push runs');
}
if (
  !workflow.includes('needs: verify') ||
  !workflow.includes('cancel-in-progress: true')
) {
  throw new Error('Preview must follow verify with cancellation');
}
const billing = readFileSync('lib/subscription/billingGuards.ts', 'utf8');
if (!billing.includes('NATIVE_REVENUECAT_PURCHASES_ENABLED = false')) {
  throw new Error('Native billing must remain disabled');
}
// All original Native/source/config/backend files are outside the strict allowlist.
// biome-ignore lint/suspicious/noConsole: CI contract status only.
console.log(
  `Phase 2 isolated decode-only / unchanged Native contracts pass at base ${base}.`
);
