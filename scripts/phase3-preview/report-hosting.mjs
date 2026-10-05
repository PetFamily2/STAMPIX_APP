import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';

const report = JSON.parse(
  readFileSync('phase3c1-preview-evidence.json', 'utf8')
);
const payload = JSON.parse(readFileSync('eas-deploy.json', 'utf8'));
const records = Array.isArray(payload) ? payload : [payload];
const candidates = records.flatMap((r) => [
  r?.url,
  r?.deploymentUrl,
  r?.previewUrl,
  r?.deployment?.url,
  r?.deployment?.previewUrl,
  r?.metadata?.url,
]);
const url = candidates.find(
  (value) =>
    typeof value === 'string' &&
    /^https:\/\/stampaix-business--[a-z0-9]+\.expo\.app\/?$/.test(value)
);
if (
  !url ||
  report.status !== 'BACKEND_E2E_PASS_WEB_EXPORT_PENDING' ||
  report.sha !== process.env.VERIFIED_HEAD_SHA
)
  throw new Error('CORRESPONDING_HOSTING_NOT_PROVEN');
const response = await fetch(`${url}/business/scanner-preview`, {
  redirect: 'error',
});
if (!response.ok) throw new Error('PREVIEW_ROUTE_SMOKE_FAILED');
report.webPreviewUrl = url;
report.webRouteHttpSmoke = 'PASS';
report.status = 'LIVE_E2E_AND_WEB_PREVIEW_PASS';
report.phase3FullyClosed = false; // Physical devices and the documented refresh/referral limitations remain.
writeFileSync(
  'phase3c1-preview-evidence.json',
  JSON.stringify(report, null, 2)
);
if (process.env.GITHUB_STEP_SUMMARY)
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `\nPhase 3C-1C isolated Preview\n\nRevision: ${report.sha}\n\nBackend: ${report.backendUrl} (${report.deploymentType})\n\nWeb: ${url}\n\nLive six-action E2E: passed. DEVICE VERIFY and refresh/eventless-referral limits remain.\n`
  );
// biome-ignore lint/suspicious/noConsole: public Preview URL only.
console.log(`Web Preview URL: ${url}`);
