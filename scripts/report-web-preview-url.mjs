import { appendFileSync, readFileSync } from 'node:fs';

const payload = JSON.parse(readFileSync('eas-deploy.json', 'utf8'));
const records = Array.isArray(payload) ? payload : [payload];
const candidates = records.flatMap((record) => [
  record?.url,
  record?.deploymentUrl,
  record?.previewUrl,
  record?.deployment?.url,
  record?.deployment?.previewUrl,
  record?.metadata?.url,
]);
const previewUrl = candidates.find((candidate) => {
  if (typeof candidate !== 'string') {
    return false;
  }
  try {
    const url = new URL(candidate);
    return (
      url.protocol === 'https:' &&
      /^stampaix-business--[a-z0-9]+\.expo\.app$/.test(url.hostname)
    );
  } catch {
    return false;
  }
});
if (!previewUrl) {
  throw new Error(
    'Deployment returned no verified unique Preview URL. Production was not requested.'
  );
}
if (process.env.GITHUB_STEP_SUMMARY) {
  appendFileSync(
    process.env.GITHUB_STEP_SUMMARY,
    `\n### Phase 1 Web Preview\n\n- Revision: ${process.env.VERIFIED_HEAD_SHA}\n- URL: ${previewUrl}\n- Staff landing: ${previewUrl}/staff\n- Backend: existing DEV; no sync or deploy\n`
  );
}
// biome-ignore lint/suspicious/noConsole: only the public Preview URL is reported.
console.log(`Web Preview URL: ${previewUrl}`);
