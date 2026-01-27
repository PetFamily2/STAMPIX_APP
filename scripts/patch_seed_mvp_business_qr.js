const fs = require('fs');

const p = 'convex/seed.ts';
let s = fs.readFileSync(p, 'utf8');

if (!s.includes('export const seedMvp')) {
  console.error('FAIL: seedMvp not found in convex/seed.ts');
  process.exit(1);
}

// If already patched, skip
if (s.includes('businessQrData')) {
  console.log('SKIP: seedMvp already includes businessQrData');
  process.exit(0);
}

// We know seedMvp creates business with externalId `biz:${now}`
// Add businessExternalId + businessQrData into howToUse return block
const needle = 'qrData: `externalId:${demoExternalId}`,';
if (!s.includes(needle)) {
  console.error('FAIL: cannot find expected qrData line to patch');
  process.exit(1);
}

s = s.replace(
  needle,
  needle +
    '\n        businessExternalId: `biz:${now}`,\n        businessQrData: `businessExternalId:biz:${now}`,'
);

fs.writeFileSync(p, s, 'utf8');
console.log('OK: patched', p);
