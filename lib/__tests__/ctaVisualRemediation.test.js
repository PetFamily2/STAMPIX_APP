import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

const readSource = (path) => readFileSync(path, 'utf8');

const PAINTED_PRESSABLE = 'components/ui/PaintedPressable.tsx';
const ACTION_BUTTON = 'components/ui/ActionButton.tsx';
const SCANNER = 'app/(authenticated)/(business)/scanner.tsx';

function extractNamedStyle(source, styleName) {
  const start = source.indexOf(`  ${styleName}: {`);
  const end = source.indexOf('\n  },', start);
  return start >= 0 && end > start ? source.slice(start, end) : '';
}

describe('native CTA paint contract', () => {
  test('separates Pressable layout from a non-collapsable visual surface', () => {
    const source = readSource(PAINTED_PRESSABLE);
    const pressableStart = source.indexOf('<Pressable');
    const surfaceStart = source.indexOf('<View');

    expect(pressableStart).toBeGreaterThan(-1);
    expect(surfaceStart).toBeGreaterThan(-1);
    expect(source.indexOf('{renderChildren}', pressableStart)).toBeGreaterThan(
      pressableStart
    );
    expect(source).toContain('collapsable={false}');
    expect(source).toContain('pointerEvents="none"');
    expect(source).toContain('resolveStyle(style, state).containerStyle');
    expect(source).toContain('style={[styles.surface, surfaceStyle]}');
    expect(extractNamedStyle(source, 'surface')).toContain('flexShrink: 0');
  });

  test('shared success CTA stays filled, high contrast, and at least 48px tall', () => {
    const source = readSource(ACTION_BUTTON);
    const surface = extractNamedStyle(source, 'surface');
    const success = extractNamedStyle(source, 'success');
    const successLabel = extractNamedStyle(source, 'successLabel');

    expect(source).toContain("| 'success'");
    expect(surface).toContain('minHeight: 48');
    expect(success).toContain("backgroundColor: '#15803D'");
    expect(success).toContain("borderColor: '#15803D'");
    expect(successLabel).toContain("color: '#FFFFFF'");
    expect(source).toContain('collapsable={false}');
    expect(source).toContain('const muted = actionButtonUsesMutedSurface');
  });
});

describe('scanner redemption CTA regression', () => {
  test('renders the green CTA before the secondary not-now action', () => {
    const source = readSource(SCANNER);
    const phaseStart = source.indexOf(
      "if (flow.phase === 'redeem_confirmation' && flow.session)"
    );
    const phaseEnd = source.indexOf(
      "if (flow.phase === 'technical_retry'",
      phaseStart
    );
    const phase = source.slice(phaseStart, phaseEnd);
    const redeemIndex = phase.indexOf('testID="scanner-redeem-reward-cta"');
    const notNowIndex = phase.indexOf('לא עכשיו');

    expect(phaseStart).toBeGreaterThan(-1);
    expect(phase).toContain('<ActionButton');
    expect(phase).toMatch(
      /label=\{\s*flow\.session\.actionMode === 'stamp'\s*\? 'אישור חותמת'\s*: 'מימוש ההטבה'\s*\}/
    );
    expect(phase).toContain('variant="success"');
    expect(phase).toContain('fullWidth={true}');
    expect(phase).toContain('name="gift-outline"');
    expect(phase).toContain('color="#FFFFFF"');
    expect(redeemIndex).toBeGreaterThan(-1);
    expect(notNowIndex).toBeGreaterThan(redeemIndex);
    expect(phase).not.toContain('styles.redeemButton');
  });

  test('lets reward content determine scroll height without clipping', () => {
    const source = readSource(SCANNER);
    const statusContent = extractNamedStyle(source, 'statusContent');
    const statusRail = extractNamedStyle(source, 'statusRail');
    const transactionArea = extractNamedStyle(source, 'transactionArea');

    expect(statusContent).toContain('flexGrow: 1');
    expect(statusContent).toContain('flexShrink: 0');
    expect(statusContent).not.toContain('flex: 1');
    expect(statusRail).toContain("overflow: 'visible'");
    expect(transactionArea).toContain("overflow: 'visible'");
  });

  test('keeps scanner secondary actions at a 48px touch target', () => {
    const source = readSource(SCANNER);

    expect(extractNamedStyle(source, 'secondaryButton')).toContain(
      'minHeight: 48'
    );
    expect(extractNamedStyle(source, 'textButton')).toContain('minHeight: 48');
  });
});

describe('reported native screen CTA coverage', () => {
  test.each([
    'app/(authenticated)/(customer)/wallet.tsx',
    'app/(authenticated)/(customer)/discovery.tsx',
    'screens/SettingsScreen.tsx',
    'app/(authenticated)/(business)/customers.tsx',
    'app/(authenticated)/(customer)/business/[businessId].tsx',
    'app/(authenticated)/(customer)/show-qr.tsx',
    'app/(auth)/name-capture.tsx',
    'app/(auth)/oauth-callback.tsx',
  ])('%s materializes CTA paint on a native View', (path) => {
    expect(readSource(path)).toContain('<PaintedPressable');
  });

  test.each([
    'app/+not-found.tsx',
    'app/r/[code].tsx',
    'app/(authenticated)/join.tsx',
    'app/(authenticated)/merchant/onboarding/business-basics.tsx',
    'components/business-dashboard/BusinessReferralCard.tsx',
    'components/business-settings/AddBusinessCta.tsx',
    'components/customer/BusinessModeCtaCard.tsx',
    'components/help/SupportWhatsAppButton.tsx',
    'components/legal/LegalDocumentScreen.tsx',
    'components/management/ManagementUsageSummary.tsx',
  ])('%s routes painted controls through the shared contract', (path) => {
    expect(readSource(path)).toContain('PaintedPressable as Pressable');
  });

  test('NativeWind invite CTAs use their own stable painted surface', () => {
    const source = readSource('app/(authenticated)/accept-invite.tsx');

    expect(source.match(/collapsable=\{false\}/g)?.length).toBe(2);
    expect(source.match(/pointerEvents="none"/g)?.length).toBe(2);
    expect(source.match(/min-h-12/g)?.length).toBe(2);
    expect(source).toContain('accessibilityState={{ disabled: busy, busy }}');
    expect(source).toContain(
      'accessibilityState={{ disabled: !canAccept, busy }}'
    );
  });

  test('the remediation primitives do not introduce native purchase actions', () => {
    const changedCtaSources = [
      PAINTED_PRESSABLE,
      ACTION_BUTTON,
      SCANNER,
      'app/(authenticated)/(customer)/wallet.tsx',
      'app/(authenticated)/(customer)/discovery.tsx',
      'screens/SettingsScreen.tsx',
    ]
      .map(readSource)
      .join('\n');

    expect(changedCtaSources).not.toContain('purchasePackage');
    expect(changedCtaSources).not.toContain('UpgradeModal');
  });
});
