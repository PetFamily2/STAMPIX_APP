import { describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const SEARCH_ROOTS = ['app', 'components', 'lib', 'constants', 'index.js'];
const RTL_SOURCE_FILE = 'lib/rtl.ts';
const RTL_BOOT_FILES = new Set([
  'index.js',
  'app/_layout.tsx',
  RTL_SOURCE_FILE,
]);

const FORBIDDEN_GLOBALS = [
  { label: 'NEEDS_MANUAL_RTL', pattern: /\bNEEDS_MANUAL_RTL\b/ },
  { label: 'IS_NATIVE_RTL', pattern: /\bIS_NATIVE_RTL\b/ },
];

const RAW_STYLE_PATTERNS = [
  {
    label: 'raw flexDirection row',
    pattern: /\bflexDirection:\s*['"]row['"]/,
  },
  {
    label: 'raw flexDirection row-reverse',
    pattern: /\bflexDirection:\s*['"]row-reverse['"]/,
  },
  {
    label: 'raw alignItems flex-start/end',
    pattern: /\balignItems:\s*['"]flex-(?:start|end)['"]/,
  },
  {
    label: 'raw justifyContent flex-start/end',
    pattern: /\bjustifyContent:\s*['"]flex-(?:start|end)['"]/,
  },
];

const RAW_NATIVEWIND_TOKENS = [
  'flex-row',
  'items-start',
  'items-end',
  'justify-start',
  'justify-end',
];

const END_ALIGNMENT_PATTERNS = [
  {
    label: 'alignItems.end',
    pattern: /\balignItems:\s*alignItems\.end\b/,
  },
  {
    label: 'justifyContent.end',
    pattern: /\bjustifyContent:\s*justifyContent\.end\b/,
  },
  {
    label: 'alignSelf flex-end',
    pattern: /\balignSelf:\s*['"]flex-end['"]/,
  },
  {
    label: 'tw.itemsEnd',
    pattern: /\btw\.itemsEnd\b/,
  },
  {
    label: 'tw.justifyEnd',
    pattern: /\btw\.justifyEnd\b/,
  },
];

const ALLOWED_END_ALIGNMENT_STYLES = new Set([
  'app/(auth)/onboarding-client-otp.tsx:footer',
  'components/business-dashboard/BusinessReferralCard.tsx:modalOverlay',
  'components/business-ui/BarComparisonChart.tsx:columnTrack',
  'components/business-ui/BarComparisonChart.tsx:plotArea',
  'components/subscription/UpgradeModal.tsx:overlay',
]);

const ALLOWED_LTR_STYLES = new Set([
  'app/+not-found.tsx:debugValue',
  'app/(auth)/onboarding-client-otp.tsx:digitInput',
  'app/(auth)/onboarding-client-otp.tsx:digitsContainer',
  'app/(auth)/sign-up-email.tsx:input',
  'app/(authenticated)/(business)/scanner.tsx:programSlider',
  'app/(authenticated)/(business)/scanner.tsx:programSliderContent',
  'app/(authenticated)/(business)/scanner.tsx:programSliderViewport',
  'components/business-dashboard/CompactActivitySummaryRow.tsx:time',
  'components/business-dashboard/CompactActivitySummaryRow.tsx:timeWrap',
  'components/business-dashboard/DashboardHeader.tsx:brandLine',
  'components/business-dashboard/LifetimeMetricsRow.tsx:helperAmount',
  'components/business-ui/ActivityTimeline.tsx:time',
  'components/business-ui/HorizontalRankingChart.tsx:rowValue',
  'components/customer/CustomerBrandTitleRow.tsx:brandWrap',
  'components/legal/LegalDocumentScreen.tsx:urlText',
  'lib/rtl.ts:ltrBaseText',
  'lib/rtl.ts:ltrIslandView',
]);

const LTR_STYLE_PATTERN =
  /\b(?:textAlign:\s*['"]left['"]|writingDirection:\s*['"]ltr['"]|direction:\s*['"]ltr['"])/;

function listSourceFiles() {
  return execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard', ...SEARCH_ROOTS],
    { encoding: 'utf8' }
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => !file.includes('__tests__'))
    .filter((file) => /\.(tsx?|jsx?|json)$/.test(file));
}

function findStyleName(lines, lineIndex) {
  for (let index = lineIndex; index >= 0; index -= 1) {
    const objectStyle = lines[index].match(/^\s*([A-Za-z0-9_]+):\s*\{\s*$/);
    if (objectStyle) {
      return objectStyle[1];
    }

    const constStyle = lines[index].match(
      /^\s*(?:export\s+)?const\s+([A-Za-z0-9_]+)[^=]*=\s*\{\s*$/
    );
    if (constStyle) {
      return constStyle[1];
    }
  }

  return '<unknown>';
}

function findForbiddenRtlPatterns() {
  const findings = [];

  for (const file of listSourceFiles()) {
    const source = readFileSync(file, 'utf8');
    const lines = source.split(/\r?\n/);

    lines.forEach((line, index) => {
      for (const { label, pattern } of FORBIDDEN_GLOBALS) {
        if (pattern.test(line)) {
          findings.push(`${file}:${index + 1}: ${label}`);
        }
      }

      if (/\bIS_RTL\b/.test(line) && file !== RTL_SOURCE_FILE) {
        findings.push(`${file}:${index + 1}: IS_RTL outside rtl source`);
      }

      if (/\bI18nManager\b/.test(line) && !RTL_BOOT_FILES.has(file)) {
        findings.push(`${file}:${index + 1}: I18nManager outside RTL boot`);
      }

      if (file !== RTL_SOURCE_FILE) {
        for (const { label, pattern } of RAW_STYLE_PATTERNS) {
          if (pattern.test(line)) {
            findings.push(`${file}:${index + 1}: ${label}`);
          }
        }
      }

      if (file.startsWith('app/') || file.startsWith('components/')) {
        for (const token of RAW_NATIVEWIND_TOKENS) {
          if (line.includes(token)) {
            findings.push(`${file}:${index + 1}: raw NativeWind ${token}`);
          }
        }

        for (const { label, pattern } of END_ALIGNMENT_PATTERNS) {
          if (pattern.test(line)) {
            const styleName = findStyleName(lines, index);
            const key = `${file}:${styleName}`;
            if (!ALLOWED_END_ALIGNMENT_STYLES.has(key)) {
              findings.push(
                `${file}:${index + 1}: unlisted ${label} in ${styleName}`
              );
            }
          }
        }
      }

      if (LTR_STYLE_PATTERN.test(line)) {
        const styleName = findStyleName(lines, index);
        const key = `${file}:${styleName}`;
        if (!ALLOWED_LTR_STYLES.has(key)) {
          findings.push(
            `${file}:${index + 1}: unlisted LTR island ${styleName}`
          );
        }
      }
    });
  }

  return findings;
}

describe('rtl source-of-truth styles', () => {
  test('keeps app layout on native RTL helpers with explicit LTR islands only', () => {
    expect(findForbiddenRtlPatterns()).toEqual([]);
  });

  test('keeps Hebrew UI helpers anchored to the physical right edge', () => {
    const rtlSource = readFileSync('lib/rtl.ts', 'utf8');
    expect(rtlSource).toContain("row: 'row'");
    expect(rtlSource).toContain("start: 'flex-end' as FlexStyle['alignItems']");
    expect(rtlSource).toContain(
      "start: 'flex-end' as FlexStyle['justifyContent']"
    );
    expect(rtlSource).toContain(
      "export const selfStart = 'flex-end' as ViewStyle['alignSelf']"
    );
    expect(rtlSource).toContain("flexRow: 'flex-row'");
    expect(rtlSource).toContain("itemsStart: 'items-end'");
    expect(rtlSource).toContain("justifyStart: 'justify-end'");
  });

  test('keeps known Android screenshot regressions anchored to Hebrew right', () => {
    const referralCard = readFileSync(
      'components/business-dashboard/BusinessReferralCard.tsx',
      'utf8'
    );
    expect(referralCard).toContain(
      'ctaRow: {\n    alignItems: alignItems.start'
    );
    expect(referralCard).toContain('alignSelf: selfStart');

    const activityRow = readFileSync(
      'components/business-dashboard/CompactActivitySummaryRow.tsx',
      'utf8'
    );
    expect(activityRow).toContain(
      'textWrap: {\n    flex: 1,\n    alignItems: alignItems.start'
    );
    expect(activityRow).toContain("direction: 'ltr'");

    const welcome = readFileSync('app/(auth)/welcome.tsx', 'utf8');
    expect(welcome).toContain('${tw.flexRow} ${tw.itemsStart} gap-4');
    expect(welcome).not.toContain('flex-row gap-4');
  });

  test('keeps Expo Router navigators on explicit RTL containers', () => {
    const authenticatedLayout = readFileSync(
      'app/(authenticated)/_layout.tsx',
      'utf8'
    );
    expect(authenticatedLayout).toContain(
      'contentStyle: rtlScreenContentStyle'
    );

    const cardsLayout = readFileSync(
      'app/(authenticated)/(business)/cards/_layout.tsx',
      'utf8'
    );
    expect(cardsLayout).toContain('contentStyle: rtlScreenContentStyle');

    for (const layout of [
      'app/(authenticated)/(business)/_layout.tsx',
      'app/(authenticated)/(customer)/_layout.tsx',
      'app/(authenticated)/(staff)/_layout.tsx',
    ]) {
      const source = readFileSync(layout, 'utf8');
      expect(source).toContain('sceneStyle: rtlTabSceneStyle');
      expect(source).toContain('...rtlTabBarStyle');
      expect(source).toContain('...rtlTabBarItemStyle');
    }

    for (const layout of [
      'app/_layout.tsx',
      'app/(auth)/_layout.tsx',
      'app/(authenticated)/admin/_layout.tsx',
      'app/(authenticated)/merchant/_layout.tsx',
      'app/(authenticated)/merchant/onboarding/_layout.tsx',
    ]) {
      expect(readFileSync(layout, 'utf8')).toContain('rtlRouteContainerStyle');
    }
  });

  test('keeps a stable marker for verifying Android build artifacts', () => {
    const rtlSource = readFileSync('lib/rtl.ts', 'utf8');
    const rootLayout = readFileSync('app/_layout.tsx', 'utf8');

    expect(rtlSource).toContain(
      "RTL_ARCHITECTURE_MARKER =\n  'stampaix-rtl-native-row-right-v4'"
    );
    expect(rootLayout).toContain('testID={RTL_ARCHITECTURE_MARKER}');
  });
});
