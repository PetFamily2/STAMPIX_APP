import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CARD_THEMES } from '../../constants/cardThemes';
import { DEFAULT_LOYALTY_REWARD_CONDITIONS } from '../loyalty/cardTerms';
import { classicPrintedRewardLine } from '../loyalty/classicPrintedCopy';
import { resolveClassicStampPalette } from '../loyalty/classicStampPalette';

describe('loyalty ux completion', () => {
  test('management rows stay compact and expose edit and details', () => {
    const list = readFileSync(
      'components/business-web/BusinessWebLoyalty.tsx',
      'utf8'
    );
    const row = readFileSync(
      'components/business-web/LoyaltyManagementEntry.tsx',
      'utf8'
    );

    expect(list).toContain("kind: 'none'");
    expect(list).toContain('LoyaltyManagementEntry');
    expect(list).not.toContain('LoyaltyCardClassic');
    expect(row).toContain('label="עריכה"');
    expect(row).toContain('label="פרטים"');
    expect(row).toContain('canEdit');
    expect(row).toContain('height: 88');
    expect(row).not.toContain('Array.from');
  });

  test('six-month redemption is the default and saved terms stay untouched', () => {
    expect(DEFAULT_LOYALTY_REWARD_CONDITIONS).toBe(
      'מימוש בהצגת הכרטיסייה בסניף, עד חצי שנה מהשלמת הכרטיסייה.'
    );
    expect(DEFAULT_LOYALTY_REWARD_CONDITIONS).not.toContain('30 יום');
    const editor = readFileSync(
      'app/(authenticated)/(business)/cards/[programId].tsx',
      'utf8'
    );
    expect(editor).toContain('setRewardConditions(details.rewardConditions');
    expect(editor).toContain('DEFAULT_LOYALTY_REWARD_CONDITIONS');
  });

  test('identical card and reward names print once', () => {
    expect(classicPrintedRewardLine('כרטיס הבוקר', 'כרטיס הבוקר')).toBeNull();
    expect(
      classicPrintedRewardLine('כרטיס הבוקר', '  כרטיס   הבוקר ')
    ).toBeNull();
    expect(classicPrintedRewardLine('כרטיס הבוקר', 'קפה עשירי במתנה')).toBe(
      'קפה עשירי במתנה'
    );
  });

  test('web theme swatches use printed paper and the two blues differ', () => {
    const palette = readFileSync(
      'components/loyalty/LoyaltyThemePalette.tsx',
      'utf8'
    );
    expect(palette).toContain("Platform.OS === 'web'");
    expect(palette).toContain('resolveClassicStampPalette');
    expect(palette).toContain('LinearGradient');
    const midnight = resolveClassicStampPalette('midnight-luxe');
    const ocean = resolveClassicStampPalette('ocean-deep');
    expect(midnight.paper).not.toBe(ocean.paper);
    expect(midnight.ink).not.toBe(ocean.ink);
    expect(CARD_THEMES).toHaveLength(10);
  });

  test('web editor distinguishes the printed card from the customer demo', () => {
    const editor = readFileSync(
      'app/(authenticated)/(business)/cards/[programId].tsx',
      'utf8'
    );
    expect(editor).toContain('כרטיסייה');
    expect(editor).toContain('כפי שהלקוח רואה');
    expect(editor).toContain("kind: 'sample'");
    expect(editor).toContain("kind: 'none'");
    expect(editor).toContain("Platform.OS === 'web' ? null : (");
  });
});
