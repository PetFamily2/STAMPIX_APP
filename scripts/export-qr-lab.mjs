import { createHash } from 'node:crypto';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { build as bundle } from 'bun';

const output = path.resolve(process.argv[2] || 'dist');
const lab = path.join(output, 'scanner-lab');
// Avoid leaving a Preview lab in a reused Production export directory.
if (existsSync(lab)) {
  rmSync(lab, { recursive: true });
}
if (
  process.env.EXPO_PUBLIC_APP_ENV !== 'preview' ||
  process.env.EXPO_PUBLIC_WEB_QR_LAB !== 'true'
) {
  process.exit(0);
}
const decoder = 'vendor/jsqr/jsqr-1.4.0.js';
const provenance = JSON.parse(
  readFileSync('docs/qr-decoder-provenance.json', 'utf8')
);
if (
  createHash('sha256').update(readFileSync(decoder)).digest('hex') !==
  provenance.sha256
) {
  throw new Error('Pinned local QR decoder integrity check failed');
}
mkdirSync(lab, { recursive: true });
const build = await bundle({
  entrypoints: ['web/scanner-lab/index.tsx'],
  outdir: lab,
  naming: 'lab.js',
  target: 'browser',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
});
if (!build.success) {
  throw new Error('Scanner lab bundle failed');
}
copyFileSync(decoder, path.join(lab, 'jsqr-1.4.0.js'));
copyFileSync(
  'vendor/jsqr/JSQR-LICENSE.txt',
  path.join(lab, 'JSQR-LICENSE.txt')
);
copyFileSync('web/scanner-lab/qr-worker.js', path.join(lab, 'qr-worker.js'));
copyFileSync('web/scanner-lab/lab.css', path.join(lab, 'lab.css'));
writeFileSync(
  path.join(lab, 'index.html'),
  `<!doctype html>
<html lang="he" dir="rtl"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; worker-src 'self'; connect-src 'none'; img-src 'self' data:; style-src 'self'; media-src 'self' blob:; object-src 'none'; base-uri 'none'; form-action 'none'">
<meta name="referrer" content="no-referrer"><title>StampAix · מעבדת QR</title>
<link rel="stylesheet" href="./lab.css"></head><body><div id="root"></div>
<script src="./lab.js" defer></script></body></html>\n`
);
// biome-ignore lint/suspicious/noConsole: build status only, no scan data.
console.log('Preview-only scanner lab exported; no business API connection.');
