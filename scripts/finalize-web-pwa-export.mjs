import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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
for (const path of [
  'pwa/icon.png',
  'pwa/offline.html',
  'pwa/leaflet.css',
  'pwa/fonts/Heebo-Variable.ttf',
  'pwa/fonts/Heebo-OFL.txt',
])
  if (!existsSync(join(directory, path))) throw new Error('PWA_ASSET_MISSING');
if (
  !html.includes('/pwa/fonts/Heebo-Variable.ttf') ||
  createHash('sha256')
    .update(readFileSync(join(directory, 'pwa/fonts/Heebo-Variable.ttf')))
    .digest('hex') !==
    '18f930b583fa8fe6b40b2f8263b7ac6afbac07adc91a12467874e7467d3ace30'
)
  throw new Error('UPSTREAM_WEB_FONT_NOT_PROVEN');
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
