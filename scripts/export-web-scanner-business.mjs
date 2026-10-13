import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';
import { productionPilotEnabled } from '../lib/pwa/releaseGate.js';

const output = path.resolve(process.argv[2] || 'dist');
if (existsSync(path.join(output, 'index.html'))) {
  const { exportPublicWelcome } = await import(
    './lib/public-welcome-export.jsx'
  );
  exportPublicWelcome(output, process.env.EXPO_PUBLIC_PWA_ENABLED === 'true');
}
const assets = path.join(output, 'scanner-business-assets');
if (existsSync(assets)) rmSync(assets, { recursive: true });
// Assets alone authorize nothing; commands remain off unless the verified isolated Preview and test identities are configured.
const productionPilot =
  productionPilotEnabled(
    process.env.EXPO_PUBLIC_APP_ENV,
    process.env.EXPO_PUBLIC_PWA_RELEASE_GATE
  ) &&
  process.env.EXPO_PUBLIC_WEB_SCANNER_COMMANDS === 'true' &&
  process.env.EXPO_PUBLIC_WEB_SCANNER_BACKEND === 'verified-production' &&
  /^https:\/\/[a-z0-9-]+\.convex\.cloud$/.test(
    process.env.EXPO_PUBLIC_CONVEX_URL_PROD ?? ''
  ) &&
  process.env.EXPO_PUBLIC_CONVEX_URL_PROD !==
    'https://utmost-fennec-280.convex.cloud' &&
  process.env.EXPO_PUBLIC_CONVEX_URL_PROD !==
    process.env.EXPO_PUBLIC_WEB_SCANNER_PREVIEW_URL &&
  !!process.env.EXPO_PUBLIC_WEB_SCANNER_PILOT_ACTORS?.trim() &&
  !!process.env.EXPO_PUBLIC_WEB_SCANNER_PILOT_BUSINESSES?.trim();
if (process.env.EXPO_PUBLIC_APP_ENV !== 'preview' && !productionPilot)
  process.exit(0);
const decoder = 'vendor/jsqr/jsqr-1.4.0.js';
const provenance = JSON.parse(
  readFileSync('docs/qr-decoder-provenance.json', 'utf8')
);
const hash = createHash('sha256').update(readFileSync(decoder)).digest('hex');
if (
  hash !== provenance.sha256 ||
  hash !== provenance.upstreamSha256 ||
  provenance.localPatch !== null
)
  throw new Error('Upstream decoder integrity failed');
mkdirSync(assets, { recursive: true });
copyFileSync(decoder, path.join(assets, 'jsqr-1.4.0.js'));
copyFileSync(
  'vendor/jsqr/JSQR-LICENSE.txt',
  path.join(assets, 'JSQR-LICENSE.txt')
);
copyFileSync(
  'web/scanner-business/qr-worker.js',
  path.join(assets, 'qr-worker.js')
);
