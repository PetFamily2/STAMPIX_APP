import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { CARD_THEMES } from '../../constants/cardThemes';
import { hasLoyaltyThemeConflict } from '../../convex/loyaltyPrograms';
import {
  classicStampColumns,
  classicStampRotation,
} from '../loyalty/classicStampLayout';
import { resolveClassicStampPalette } from '../loyalty/classicStampPalette';
import {
  classicWizardCanSave,
  classicWizardIssues,
} from '../loyalty/classicWizard';

function channel(hex, offset) {
  return Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
}

function luminance(hex) {
  const linear = [1, 3, 5].map((offset) => {
    const value = channel(hex, offset);
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

function contrast(foreground, background) {
  const lighter = Math.max(luminance(foreground), luminance(background));
  const darker = Math.min(luminance(foreground), luminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

const wizardDraft = {
  title: 'כרטיס בוקר',
  rewardName: 'קפה פילטר על הבית',
  maxStamps: 10,
  cardThemeId: 'golden-hour',
  stampIcon: 'coffee',
  stampShape: 'circle',
};

describe('classic stamp layout', () => {
  test('keeps every supported count visible in a stable grid', () => {
    expect(classicStampColumns(5)).toBe(5);
    expect(classicStampColumns(8)).toBe(4);
    expect(classicStampColumns(10)).toBe(5);
    expect(classicStampColumns(12)).toBe(4);
    expect(classicStampColumns(14)).toBe(5);
    expect(classicStampColumns(20)).toBe(5);
  });

  test('uses the same rotation for the same stamp index', () => {
    expect(classicStampRotation(0)).toBe(-6);
    expect(classicStampRotation(1)).toBe(4);
    expect(classicStampRotation(0)).toBe(classicStampRotation(0));
    expect(classicStampRotation(20)).toBe(classicStampRotation(0));
  });
});

describe('classic stamp palette', () => {
  test('keeps ink readable and empty stamps visible for every theme', () => {
    for (const theme of CARD_THEMES) {
      const palette = resolveClassicStampPalette(theme.id);
      expect(contrast(palette.ink, palette.paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.soft, palette.paper)).toBeGreaterThanOrEqual(4.5);
      expect(contrast(palette.mute, palette.paper)).toBeGreaterThanOrEqual(3);
    }
  });

  test('falls back for a missing theme and maps a legacy id', () => {
    expect(resolveClassicStampPalette(null)).toEqual(
      resolveClassicStampPalette('midnight-luxe')
    );
    expect(resolveClassicStampPalette('blue')).toEqual(
      resolveClassicStampPalette('midnight-luxe')
    );
    expect(resolveClassicStampPalette('not-a-theme')).toEqual(
      resolveClassicStampPalette('midnight-luxe')
    );
  });
});

describe('classic card wizard', () => {
  test('asks for the missing details without reserving a theme on a draft', () => {
    expect(
      classicWizardIssues({
        ...wizardDraft,
        title: '  ',
        rewardName: '',
        maxStamps: 7,
      }).map((issue) => issue.field)
    ).toEqual(['title', 'rewardName', 'maxStamps']);
    expect(
      classicWizardCanSave({
        ...wizardDraft,
        cardThemeId: 'golden-hour',
      })
    ).toBe(true);
  });

  test('accepts a complete draft and rejects a non-canonical icon', () => {
    expect(classicWizardCanSave(wizardDraft)).toBe(true);
    expect(classicWizardCanSave({ ...wizardDraft, stampIcon: 'cafe' })).toBe(
      false
    );
    expect(classicWizardCanSave({ ...wizardDraft, stampShape: 'blob' })).toBe(
      false
    );
  });
});

describe('classic stamp data boundaries', () => {
  test('does not treat another business theme as a reservation conflict', () => {
    expect(
      hasLoyaltyThemeConflict(
        [
          {
            _id: 'program_other',
            businessId: 'business_other',
            isActive: true,
            status: 'active',
            cardThemeId: 'golden-hour',
          },
        ],
        'business_current',
        'golden-hour'
      )
    ).toBe(false);
    expect(
      hasLoyaltyThemeConflict(
        [
          {
            _id: 'program_same',
            businessId: 'business_current',
            isActive: true,
            status: 'active',
            cardThemeId: 'golden-hour',
          },
        ],
        'business_current',
        'golden-hour'
      )
    ).toBe(true);
  });

  test('keeps the native card and uses the classic card on web', () => {
    const wallet = readFileSync(
      'app/(authenticated)/(customer)/wallet.tsx',
      'utf8'
    );
    const walletWeb = readFileSync(
      'app/(authenticated)/(customer)/wallet.web.tsx',
      'utf8'
    );
    const cardDetail = readFileSync(
      'app/(authenticated)/card/[membershipId].tsx',
      'utf8'
    );
    const nativeCard = readFileSync(
      'components/loyalty/LoyaltyCard.tsx',
      'utf8'
    );
    const editor = readFileSync(
      'app/(authenticated)/(business)/cards/[programId].tsx',
      'utf8'
    );
    const wizard = readFileSync(
      'components/business-web/ClassicCardWizard.tsx',
      'utf8'
    );
    const businessList = readFileSync(
      'components/business-web/BusinessWebLoyalty.tsx',
      'utf8'
    );
    const memberships = readFileSync('convex/memberships.ts', 'utf8');

    expect(wallet).toContain('LoyaltyCard');
    expect(wallet).not.toContain('LoyaltyCardClassic');
    expect(walletWeb).toContain('LoyaltyCardClassic');
    expect(walletWeb).toContain('previewStampIcon');
    expect(walletWeb).toContain("kind: 'actual'");
    expect(cardDetail).toContain("Platform.OS === 'web'");
    expect(cardDetail).toContain('<LoyaltyCard\n');
    expect(cardDetail).toContain('<LoyaltyCardClassic');
    expect(nativeCard).not.toContain('LoyaltyCardClassic');
    expect(editor).toContain("kind: 'sample'");
    expect(editor).toContain("Platform.OS === 'web'");
    expect(wizard).toContain('createLoyaltyProgram');
    expect(wizard).not.toContain('disabledThemeIds');
    expect(wizard).not.toContain('listThemeReservationsByBusiness');
    expect(editor).toContain("lifecycle === 'active' ? usedThemeIds : []");
    expect(wizard).toContain("kind: 'sample'");
    expect(wizard).toContain('שמירת טיוטה');
    expect(businessList).toContain("kind: 'none'");
    expect(businessList).not.toContain('previewCurrentStamps');
    expect(memberships).toContain('previewStampIcon: program.stampIcon');
  });
});
