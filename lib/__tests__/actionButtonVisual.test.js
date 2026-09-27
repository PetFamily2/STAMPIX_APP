import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  actionButtonUsesMutedSurface,
  readableCtaIconColor,
} from '../ui/actionButtonVisual';

const actionButtonSource = readFileSync(
  'components/ui/ActionButton.tsx',
  'utf8'
);
const dashboardSource = readFileSync(
  'app/(authenticated)/(business)/dashboard.tsx',
  'utf8'
);

describe('action button loading surface', () => {
  test('loading keeps the variant surface and disabled stays muted', () => {
    expect(actionButtonUsesMutedSurface(true, true)).toBe(false);
    expect(actionButtonUsesMutedSurface(false, true)).toBe(false);
    expect(actionButtonUsesMutedSurface(true, false)).toBe(true);
    expect(actionButtonUsesMutedSurface(false, false)).toBe(false);
    expect(actionButtonSource).toContain(
      'const muted = actionButtonUsesMutedSurface(disabled, loading)'
    );
    expect(actionButtonSource).toContain('muted ? styles[');
    expect(actionButtonSource).not.toContain('disabled ? styles[');
    expect(actionButtonSource).toContain("primary: '#FFFFFF'");
    expect(actionButtonSource).toContain("secondary: '#1D4ED8'");
    expect(actionButtonSource).toContain("lifecycle: '#9F1239'");
    expect(actionButtonSource).toContain("backgroundColor: '#2F6BFF'");
    expect(actionButtonSource).toContain("color: '#FFFFFF'");
    expect(actionButtonSource).toContain('disabled={isDisabled}');
  });
});

describe('dashboard referral icon contrast', () => {
  test('uses a dark icon only while the CTA is disabled', () => {
    expect(readableCtaIconColor(true)).toBe('#334155');
    expect(readableCtaIconColor(false)).toBe('#FFFFFF');
    expect(dashboardSource).toContain(
      'color={readableCtaIconColor(isSwitchingBusiness)}'
    );
  });
});
