import { readFileSync, writeFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

const pulled = parseEnv(readFileSync('.env.preview-pulled', 'utf8'));
const devUrl = pulled.EXPO_PUBLIC_CONVEX_URL_DEV;
const prodUrl = pulled.EXPO_PUBLIC_CONVEX_URL_PROD;
let parsedUrl;
let parsedProdUrl;
try {
  parsedUrl = new URL(devUrl);
  parsedProdUrl = prodUrl ? new URL(prodUrl) : null;
} catch {
  throw new Error(
    'Preview requires a configured public Convex DEV URL. No backend sync was attempted.'
  );
}
if (
  parsedUrl.protocol !== 'https:' ||
  !/^[a-z0-9-]+\.convex\.cloud$/.test(parsedUrl.hostname) ||
  parsedUrl.href === parsedProdUrl?.href
) {
  throw new Error(
    'Preview DEV URL must be canonical and isolated from the configured Production URL.'
  );
}

// Only public client variables reach the exporter. Never propagate deploy keys.
const publicVariables = Object.fromEntries(
  Object.entries(pulled).filter(([name]) => name.startsWith('EXPO_PUBLIC_'))
);
publicVariables.EXPO_PUBLIC_APP_ENV = 'preview';
publicVariables.EXPO_PUBLIC_WEB_ROLE_ROUTING = 'true';
writeFileSync(
  '.env.local',
  `${Object.entries(publicVariables)
    .map(([name, value]) => `${name}=${JSON.stringify(value)}`)
    .join('\n')}\n`,
  { mode: 0o600 }
);
