import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import {
  CLOUDFLARE_PREVIEW_BACKEND,
  prepareCloudflarePreview,
} from './lib/cloudflare-web-export.mjs';
import { verifyReleaseSource } from './lib/release-source.mjs';

const repo = process.cwd();
const source = verifyReleaseSource({
  cwd: repo,
  policy: JSON.parse(
    readFileSync(
      new URL('../config/release-source.json', import.meta.url),
      'utf8'
    )
  ),
});
execFileSync(
  'git',
  [
    'diff',
    '--quiet',
    'HEAD',
    '--',
    'app',
    'components',
    'contexts',
    'convex',
    'hooks',
    'lib',
    'screens',
    'utils',
    'config',
    'public',
    'assets',
  ],
  { stdio: 'inherit' }
);
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
const temporary = path.join(repo, '.tmp');
mkdirSync(temporary, { recursive: true });
const output = mkdtempSync(path.join(temporary, 'cloudflare-preview-'));
const env = { ...process.env };
for (const name of Object.keys(env)) {
  if (
    name.startsWith('EXPO_PUBLIC_') ||
    /(?:SECRET|TOKEN|API_KEY|DEPLOY_KEY|PRIVATE_KEY|JWT|JWKS)/i.test(name)
  )
    delete env[name];
}
Object.assign(env, {
  EXPO_NO_DOTENV: '1',
  EXPO_PUBLIC_APP_ENV: 'preview',
  EXPO_PUBLIC_CONVEX_URL: CLOUDFLARE_PREVIEW_BACKEND,
  EXPO_PUBLIC_CONVEX_URL_DEV: CLOUDFLARE_PREVIEW_BACKEND,
  EXPO_PUBLIC_STAMPAIX_SHARED_BACKEND: 'true',
  EXPO_PUBLIC_PWA_ENABLED: 'true',
  EXPO_PUBLIC_WEB_ROLE_ROUTING: 'true',
  EXPO_PUBLIC_MANUAL_QA_ENABLED: 'false',
  EXPO_PUBLIC_WEB_QR_LAB: 'false',
  EXPO_PUBLIC_SCANNER_RECEIPTS: 'true',
  EXPO_PUBLIC_WEB_SCANNER_COMMANDS: 'true',
  EXPO_PUBLIC_WEB_SCANNER_BACKEND: 'existing-shared',
  EXPO_PUBLIC_PAYMENT_SYSTEM_ENABLED: 'false',
  EXPO_PUBLIC_MOCK_PAYMENTS: 'false',
});
execFileSync(
  process.execPath,
  [
    'node_modules/expo/bin/cli',
    'export',
    '--platform',
    'web',
    '--output-dir',
    output,
    '--max-workers',
    '2',
  ],
  { env, stdio: 'inherit' }
);
execFileSync('bun', ['scripts/export-web-scanner-business.mjs', output], {
  env,
  stdio: 'inherit',
});
execFileSync(
  process.execPath,
  ['scripts/finalize-web-pwa-export.mjs', output],
  { env, stdio: 'inherit' }
);
execFileSync(
  process.execPath,
  ['scripts/verify-client-secret-patterns.mjs', output],
  { env, stdio: 'inherit' }
);
const result = prepareCloudflarePreview(output, {
  revision,
  backendUrl: CLOUDFLARE_PREVIEW_BACKEND,
});
const afterBuild = verifyReleaseSource({
  cwd: repo,
  policy: {
    branch: source.branch,
    requiredAncestors: source.requiredAncestors,
  },
});
if (afterBuild.revision !== source.revision) {
  throw new Error('RELEASE_SOURCE_CHANGED_DURING_BUILD');
}
writeFileSync(
  path.join(output, 'pwa/source.json'),
  JSON.stringify(source) + '\n'
);
// biome-ignore lint/suspicious/noConsole: public build identity and artifact path only.
console.log('CLOUDFLARE_PREVIEW_EXPORT ' + JSON.stringify(result));
