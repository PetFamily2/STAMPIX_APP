import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const base = '3d8d01ad6a506e4ca4f49ba1dc470203aa49c270';
const changed = execFileSync('git', ['diff', '--name-only', base], {
  encoding: 'utf8',
})
  .trim()
  .split('\n')
  .filter(Boolean);
const protectedPaths = [
  'convex/',
  'app.json',
  'app.config.ts',
  'eas.json',
  'babel.config.js',
  'metro.config.js',
  'package.json',
  'bun.lock',
  'plugins/',
  'lib/rtl.ts',
  'components/QrScanner.tsx',
  'components/customer/DiscoveryMap',
  'lib/scanner/',
  'lib/auth/authStorage',
  'contexts/AppModeContext',
  'contexts/RevenueCatContext.tsx',
  'contexts/PushNotificationsContext.tsx',
  'lib/subscription/billingGuards.ts',
  'lib/feedback',
  'app/(authenticated)/(business)/',
  'app/(authenticated)/(staff)/',
  'app/(authenticated)/(customer)/',
];
for (const file of changed) {
  if (
    /(?:^|\/)(?:manifest(?:\.webmanifest|\.json)|(?:service[-.]worker|sw)\.[cm]?js)$/.test(
      file
    )
  ) {
    throw new Error(`PWA install/offline files are outside Phase 1: ${file}`);
  }
  if (
    protectedPaths.some((prefix) => file === prefix || file.startsWith(prefix))
  ) {
    throw new Error(`Phase 1 protected Native/backend file changed: ${file}`);
  }
}

function functionText(source, name) {
  const parsed = ts.createSourceFile(
    'routing.ts',
    source,
    ts.ScriptTarget.Latest,
    true
  );
  const declaration = parsed.statements.find(
    (node) => ts.isFunctionDeclaration(node) && node.name?.text === name
  );
  if (!declaration) {
    throw new Error(`Missing routing contract: ${name}`);
  }
  return declaration.getText(parsed).replace(/\s+/g, '');
}
const file = 'lib/auth/postAuthRouting.ts';
const previous = execFileSync('git', ['show', `${base}:${file}`], {
  encoding: 'utf8',
});
const current = readFileSync(file, 'utf8');
for (const name of [
  'resolvePostAuthRoute',
  'resolveAuthGroupDisposition',
  'isPostAuthTransitionPending',
]) {
  if (functionText(previous, name) !== functionText(current, name)) {
    throw new Error(
      `Native/shared authoritative routing algorithm changed: ${name}`
    );
  }
}
const billing = readFileSync('lib/subscription/billingGuards.ts', 'utf8');
if (
  !/export const NATIVE_REVENUECAT_PURCHASES_ENABLED = false;/.test(billing)
) {
  throw new Error('Native purchases must remain disabled.');
}
// biome-ignore lint/suspicious/noConsole: reports source contracts, not physical QA.
console.log(
  `Phase 1 boundaries passed against ${base}: backend/Native files and routing algorithms preserved; Native billing disabled.`
);
