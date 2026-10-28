import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';

const root = process.argv[2];
if (!root) {
  throw new Error('Pass the client export directory.');
}
const patterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\\n"'+]*[A-Za-z0-9+/=]{32,}/,
  /\bgh[pousr]_[A-Za-z0-9]{36,}\b/,
  /\bgithub_pat_[A-Za-z0-9_]{40,}\b/,
  /\b(?:sk|rk)_live_[A-Za-z0-9]{20,}\b/,
];
let count = 0;
function scan(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      scan(file);
    } else if (/\.(js|json|hbc|map)$/.test(entry.name)) {
      count += 1;
      const source = readFileSync(file, 'utf8');
      if (patterns.some((pattern) => pattern.test(source))) {
        throw new Error(
          `Known private credential pattern in client artifact: ${path.relative(root, file)}. Value withheld.`
        );
      }
    }
  }
}
scan(root);
if (count === 0) {
  throw new Error('No client artifacts were scanned.');
}
// biome-ignore lint/suspicious/noConsole: bounded build check; no credential values.
console.log(
  `Known client-secret pattern check passed (${count} files). This is not a full secret audit.`
);
