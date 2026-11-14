import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { classifyHostingFailure } from '../lib/preview-hosting.mjs';

const reportPath = '../phase3c1-preview-evidence.json';
const report = JSON.parse(readFileSync(reportPath, 'utf8'));
const sha = execFileSync('git', ['rev-parse', 'HEAD'], {
  encoding: 'utf8',
}).trim();
if (
  sha !== process.env.VERIFIED_HEAD_SHA ||
  report.sha !== sha ||
  report.status !== 'BACKEND_E2E_PASS_WEB_EXPORT_PENDING' ||
  report.deploymentType !== 'preview' ||
  report.previewName !== 'stampaix-pwa-phase3-e2e' ||
  report.productionTouched !== false ||
  report.devTouched !== false ||
  process.env.EXPO_PUBLIC_APP_ENV !== 'preview'
)
  throw new Error('PREVIEW_HOSTING_GUARD');
report.hosting = { attempts: [], status: 'RUNNING' };
for (let attempt = 1; attempt <= 3; attempt++) {
  const result = spawnSync(
    'eas',
    [
      'deploy',
      '--environment',
      'preview',
      '--non-interactive',
      '--dev-domain',
      'stampaix-business',
      '--json',
    ],
    { encoding: 'utf8', timeout: 180000, maxBuffer: 8_000_000 }
  );
  const text = `${result.stdout ?? ''}\n${result.stderr ?? ''}`;
  writeFileSync(
    join(process.env.RUNNER_TEMP ?? '/tmp', `phase3-eas-deploy-${attempt}.log`),
    text,
    { mode: 0o600 }
  );
  const diagnosis = classifyHostingFailure(text, result.error?.code);
  report.hosting.attempts.push({ attempt, exit: result.status, ...diagnosis });
  if (result.status === 0) {
    JSON.parse(result.stdout);
    writeFileSync('../eas-deploy.json', result.stdout, { mode: 0o600 });
    report.hosting.status = 'PASS';
    writeFileSync(reportPath, JSON.stringify(report, null, 2));
    process.exit(0);
  }
  report.hosting.status = 'FAIL';
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.info(
    `Preview hosting attempt ${attempt}: ${diagnosis.families.join(',') || 'UNCLASSIFIED'}`
  );
  if (!diagnosis.transient || attempt === 3) break;
  await new Promise((resolve) => setTimeout(resolve, attempt * 3000));
}
throw new Error('PREVIEW_HOSTING_FAILED_SANITIZED_EVIDENCE_AVAILABLE');
