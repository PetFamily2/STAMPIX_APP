import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SEARCH_ROOTS = ['app', 'components'];
const RAW_ROW_DIRECTION = /flexDirection:\s*['"]row['"]/;
const ALLOWED_RAW_ROW_STYLES = new Set([
  'app/(auth)/onboarding-client-otp.tsx:digitsContainer',
  'app/(authenticated)/(business)/scanner.tsx:programDotsTrack',
  'app/(authenticated)/(business)/scanner.tsx:programSliderContent',
  'components/AnimatedActionBanner.tsx:banner',
  'components/business/ProgramCustomerCardPreview.tsx:stampsLine',
  'components/business/ProgramCustomerCardPreview.tsx:walletStampGroup',
  'components/business/ProgramCustomerCardPreview.tsx:walletStampGroups',
  'components/customer/CustomerBrandTitleRow.tsx:brandWrap',
]);

function findStyleName(lines, lineIndex) {
  for (let index = lineIndex; index >= 0; index -= 1) {
    const match = lines[index].match(/^\s*([A-Za-z0-9_]+):\s*\{\s*$/);
    if (match) {
      return match[1];
    }
  }

  return '<unknown>';
}

function findUnexpectedRawRows() {
  const files = execFileSync('git', ['ls-files', ...SEARCH_ROOTS], {
    encoding: 'utf8',
  })
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !file.includes('__tests__'))
    .filter((file) => /\.(tsx?|jsx?)$/.test(file));

  const findings = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      if (!RAW_ROW_DIRECTION.test(line)) {
        return;
      }

      const styleName = findStyleName(lines, index);
      const key = `${file}:${styleName}`;
      if (!ALLOWED_RAW_ROW_STYLES.has(key)) {
        findings.push(`${file}:${index + 1}: ${styleName}`);
      }
    });
  }

  return findings;
}

describe('rtl StyleSheet row direction', () => {
  test('keeps user-facing rows on shared RTL helpers', () => {
    expect(findUnexpectedRawRows()).toEqual([]);
  });
});
