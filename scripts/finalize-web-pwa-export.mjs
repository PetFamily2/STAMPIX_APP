import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const directory = process.argv[2];
if (!directory) throw new Error('EXPORT_DIRECTORY_REQUIRED');
const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
if (!/^[a-f0-9]{40}$/.test(sha)) throw new Error('INVALID_EXPORT_REVISION');
const html = readFileSync(join(directory, 'index.html'), 'utf8');
const manifest = JSON.parse(
  readFileSync(join(directory, 'manifest.webmanifest'), 'utf8')
);
if (
  !html.includes('lang="he"') ||
  !html.includes('dir="rtl"') ||
  !html.includes('href="/manifest.webmanifest"') ||
  !html.includes('href="/pwa/leaflet.css"')
)
  throw new Error('SPA_PWA_HTML_MISSING');
if (
  manifest.scope !== '/' ||
  manifest.start_url !== '/' ||
  manifest.display !== 'standalone' ||
  !manifest.icons.some((icon) => icon.src === '/pwa/icon.png')
)
  throw new Error('PWA_MANIFEST_INVALID');
for (const path of ['pwa/icon.png', 'pwa/offline.html', 'pwa/leaflet.css'])
  if (!existsSync(join(directory, path))) throw new Error('PWA_ASSET_MISSING');
const workerPath = join(directory, 'service-worker.js');
const worker = readFileSync(workerPath, 'utf8');
if (!worker.includes("const CACHE = 'stampaix-public-rc-v1';"))
  throw new Error('WORKER_VERSION_SHAPE_CHANGED');
writeFileSync(
  workerPath,
  worker.replace(
    "const CACHE = 'stampaix-public-rc-v1';",
    `const CACHE = 'stampaix-public-${sha}';`
  )
);
writeFileSync(
  join(directory, 'pwa/release.json'),
  JSON.stringify({
    revision: sha,
    scannerRollout: 'preview-allowlist-device-gated',
    offlineWrites: false,
  }) + '\n'
);
// biome-ignore lint/suspicious/noConsole: public build identity, no user data or secrets.
console.log(
  'PWA exported assets verified; cache namespace matches exact source revision.'
);
