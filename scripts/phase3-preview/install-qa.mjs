import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

if (process.env.GITHUB_ACTIONS !== 'true' || !process.env.RUNNER_TEMP)
  throw new Error('ACTIONS_ONLY');
const dir = join(process.env.RUNNER_TEMP, 'stampaix-rc-tools');
mkdirSync(dir, { recursive: true });
writeFileSync(
  join(dir, 'package.json'),
  JSON.stringify({
    private: true,
    dependencies: {
      playwright: '1.56.1',
      '@axe-core/playwright': '4.10.2',
      lighthouse: '12.8.2',
      'chrome-launcher': '1.0.0',
    },
  })
);
for (const [command, args] of [
  ['bun', ['install', '--cwd', dir]],
  [
    'node',
    [
      join(dir, 'node_modules/playwright/cli.js'),
      'install',
      '--with-deps',
      'chromium',
    ],
  ],
]) {
  const r = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 240000,
    maxBuffer: 16 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error('BROWSER_TOOL_INSTALL_FAILED');
}
console.info('Isolated browser QA tools installed');
