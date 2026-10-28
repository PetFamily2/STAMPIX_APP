import { lstatSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export const CLOUDFLARE_PREVIEW_BACKEND =
  'https://utmost-fennec-280.convex.cloud';
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data:",
  "connect-src 'self' https://*.convex.cloud wss://*.convex.cloud https://*.convex.site https://maps.googleapis.com",
  "media-src 'self' blob:",
  "worker-src 'self' blob:",
  'frame-src https://www.google.com https://maps.google.com',
  "frame-ancestors 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self' https://pay.sumit.co.il",
  'upgrade-insecure-requests',
].join('; ');

export function prepareCloudflarePreview(directory, { revision, backendUrl }) {
  if (
    !/^[a-f0-9]{40}$/.test(revision) ||
    backendUrl !== CLOUDFLARE_PREVIEW_BACKEND
  ) {
    throw new Error('CLOUDFLARE_PREVIEW_SCOPE_INVALID');
  }
  const root = path.resolve(directory);
  let files = 0;
  let bytes = 0;
  function inspect(folder) {
    for (const entry of readdirSync(folder, { withFileTypes: true })) {
      const file = path.join(folder, entry.name);
      if (
        entry.name.startsWith('.') ||
        entry.isSymbolicLink() ||
        lstatSync(file).isSymbolicLink()
      ) {
        throw new Error('CLOUDFLARE_UNEXPECTED_ARTIFACT');
      }
      if (entry.isDirectory()) inspect(file);
      else {
        files += 1;
        const size = lstatSync(file).size;
        bytes += size;
        if (size > 25 * 1024 * 1024 || files > 19990) {
          throw new Error('CLOUDFLARE_FREE_ASSET_LIMIT');
        }
      }
    }
  }
  inspect(root);
  if (readdirSync(root).includes('404.html')) {
    throw new Error('CLOUDFLARE_SPA_FALLBACK_DISABLED');
  }
  const pwa = JSON.parse(
    readFileSync(path.join(root, 'pwa/release.json'), 'utf8')
  );
  if (pwa.revision !== revision || pwa.offlineWrites !== false) {
    throw new Error('CLOUDFLARE_EXPORT_REVISION_MISMATCH');
  }
  const headers = `/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(self), geolocation=(self), microphone=(), usb=(), payment=()\n  Content-Security-Policy: ${CSP}\n  X-Robots-Tag: noindex, nofollow\n  X-StampAix-Revision: ${revision}\n\n/service-worker.js\n  Cache-Control: no-store\n  Service-Worker-Allowed: /\n\n/manifest.webmanifest\n  Cache-Control: no-store\n\n/index.html\n  Cache-Control: no-store\n\n/welcome.html\n  Cache-Control: no-store\n\n/_expo/static/*\n  Cache-Control: public, max-age=31536000, immutable\n`;
  writeFileSync(path.join(root, '_headers'), headers);
  writeFileSync(
    path.join(root, '_redirects'),
    // Pages serves matching .html routes and supplies the SPA fallback itself.
    // Rewriting /welcome to welcome.html loops through its canonical redirect.
    '# Native Pages HTML matching and SPA fallback; no HTML rewrite rules.\n'
  );
  writeFileSync(
    path.join(root, 'pwa/hosting.json'),
    JSON.stringify({
      revision,
      environment: 'preview',
      backendUrl,
      host: 'cloudflare-pages',
      offlineWrites: false,
    }) + '\n'
  );
  return { directory: root, files, bytes, revision, backendUrl };
}
