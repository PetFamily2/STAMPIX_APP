import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const report = JSON.parse(
  readFileSync('phase3c1-preview-evidence.json', 'utf8')
);
if (
  report.status !== 'BACKEND_E2E_PASS_WEB_EXPORT_PENDING' ||
  report.deploymentType !== 'preview' ||
  !report.emptyBeforeAuthAndSeed ||
  !report.commandsEnabled
)
  throw new Error('BACKEND_E2E_NOT_VERIFIED');
let urlFound = false,
  selectorFound = false;
const scan = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    if (entry.isDirectory()) scan(file);
    else if (/\.(js|json|html|map)$/.test(entry.name)) {
      const source = readFileSync(file, 'utf8');
      if (
        /\b(?:preview:[a-z0-9-]+(?::[a-z0-9-]+)?|dev:[a-z0-9-]+|prod:[a-z0-9-]+)\|[A-Za-z0-9+/=_-]+/.test(
          source
        ) ||
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/.test(source)
      )
        throw new Error('PRIVATE_CREDENTIAL_IN_EXPORT');
      // These names can occur in fail-closed denial guards; executable configuration must use exact Preview.
      urlFound ||= source.includes(report.backendUrl);
      selectorFound ||= source.includes('verified-preview');
    }
  }
};
scan(process.argv[2]);
if (!urlFound || !selectorFound)
  throw new Error('EXACT_PREVIEW_CONFIGURATION_NOT_EXPORTED');
