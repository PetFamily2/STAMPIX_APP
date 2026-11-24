import { readFileSync } from 'node:fs';
import { verifyReleaseSource } from './lib/release-source.mjs';

const policy = JSON.parse(
  readFileSync(
    new URL('../config/release-source.json', import.meta.url),
    'utf8'
  )
);
const event = process.env.CI
  ? JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'))
  : null;
const result = verifyReleaseSource({ cwd: process.cwd(), policy, event });
// biome-ignore lint/suspicious/noConsole: public revision identity only.
console.log('RELEASE_SOURCE_VERIFIED ' + JSON.stringify(result));
