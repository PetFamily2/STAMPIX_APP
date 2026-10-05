import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';

const output = path.resolve(process.argv[2] || 'dist');
const assets = path.join(output, 'scanner-business-assets');
if (existsSync(assets)) rmSync(assets, { recursive: true });
// Assets alone authorize nothing; commands remain off unless a verified DEV and test identities are configured.
if (process.env.EXPO_PUBLIC_APP_ENV !== 'preview') process.exit(0);
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
