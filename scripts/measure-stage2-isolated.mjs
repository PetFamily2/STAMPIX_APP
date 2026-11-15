import { readFileSync } from 'node:fs';
import { performance } from 'node:perf_hooks';
import { ConvexHttpClient } from 'convex/browser';
import { makeFunctionReference } from 'convex/server';

const url = process.env.STAGE2_ISOLATED_CONVEX_URL;
if (!url || process.env.STAGE2_ALLOW_ISOLATED_READS !== 'yes')
  throw new Error(
    'Set an explicitly approved existing isolated URL and STAGE2_ALLOW_ISOLATED_READS=yes. No request sent.'
  );
const host = new URL(url).hostname;
if (
  !['localhost', '127.0.0.1', process.env.STAGE2_APPROVED_ISOLATED_HOST]
    .filter(Boolean)
    .includes(host)
)
  throw new Error('Host is not explicitly approved for isolated reads.');
const targets = JSON.parse(readFileSync(process.argv[2], 'utf8'));
const client = new ConvexHttpClient(url);
if (process.env.STAGE2_ISOLATED_AUTH_TOKEN)
  client.setAuth(process.env.STAGE2_ISOLATED_AUTH_TOKEN);
const report = [];
for (const target of targets) {
  const samples = [];
  for (let i = 0; i < 10; i++) {
    const start = performance.now();
    await client.query(makeFunctionReference(target.query), target.args);
    samples.push(performance.now() - start);
  }
  const sorted = [...samples].sort((a, b) => a - b);
  report.push({
    query: target.query,
    samplesMs: samples,
    medianMs: sorted[5],
    p95Ms: sorted[9],
    measurement:
      'client request wall time including network; not server execution time',
  });
}
console.log(JSON.stringify(report, null, 2));
