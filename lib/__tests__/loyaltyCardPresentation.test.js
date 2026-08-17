import { describe, expect, test } from 'bun:test';

import {
  buildLoyaltyCardAccessibilityLabel,
  resolveLoyaltyCardPresentation,
  resolveProgressStrategy,
  sanitizeCurrent,
  sanitizeTarget,
} from '../loyalty/cardPresentation';

function presentation(overrides = {}) {
  return resolveLoyaltyCardPresentation({
    variant: 'wallet',
    lifecycle: 'active',
    membershipStatus: 'joined',
    progress: { kind: 'actual', currentStamps: 0 },
    maxStamps: 10,
    rewardName: 'קפה במתנה',
    ...overrides,
  });
}

describe('loyalty card presentation', () => {
  test('sanitizes invalid, negative, fractional, and overflowing values', () => {
    expect(sanitizeTarget(Number.NaN)).toBe(1);
    expect(sanitizeTarget(-8)).toBe(1);
    expect(sanitizeTarget(10.9)).toBe(10);
    expect(sanitizeCurrent(Number.NaN, 10)).toBe(0);
    expect(sanitizeCurrent(-2, 10)).toBe(0);
    expect(sanitizeCurrent(14, 10)).toBe(10);
  });

  test('keeps invalid targets non-authoritative even with positive progress', () => {
    for (const maxStamps of [0, -5, Number.NaN, Number.POSITIVE_INFINITY]) {
      const invalid = presentation({
        maxStamps,
        progress: { kind: 'actual', currentStamps: 10 },
      });

      expect(invalid.targetIsValid).toBe(false);
      expect(invalid.hasProgressData).toBe(false);
      expect(invalid.current).toBe(0);
      expect(invalid.remaining).toBe(0);
      expect(invalid.state).toBe('zero');
      expect(['rewardReady', 'nearReward', 'partial']).not.toContain(
        invalid.state
      );
      expect(invalid.statusText).toBe(
        'נתוני ההתקדמות אינם זמינים כרגע'
      );
      expect(invalid.statusText).not.toContain('עוד 1');

      const label = buildLoyaltyCardAccessibilityLabel({
        businessName: 'Coffee & Co',
        programTitle: 'כרטיס בוקר',
        rewardName: 'קפה במתנה',
        presentation: invalid,
      });
      expect(label).toContain('נתוני ההתקדמות אינם זמינים כרגע');
      expect(label).not.toContain('1 מתוך 1');
      expect(label).not.toContain('ההטבה מוכנה למימוש');
    }

    const validReady = presentation({
      maxStamps: 10,
      progress: { kind: 'actual', currentStamps: 10 },
    });
    expect(validReady.targetIsValid).toBe(true);
    expect(validReady.state).toBe('rewardReady');
  });

  test('resolves zero, partial, near, and reward-ready states', () => {
    expect(presentation().state).toBe('zero');
    expect(
      presentation({ progress: { kind: 'actual', currentStamps: 4 } }).state
    ).toBe('partial');
    expect(
      presentation({ progress: { kind: 'actual', currentStamps: 8 } }).state
    ).toBe('nearReward');
    expect(
      presentation({ progress: { kind: 'actual', currentStamps: 10 } }).state
    ).toBe('rewardReady');
  });

  test('available and archived states take precedence over progress', () => {
    expect(
      presentation({
        membershipStatus: 'available',
        progress: { kind: 'actual', currentStamps: 10 },
      }).state
    ).toBe('available');
    const archived = presentation({
      lifecycle: 'archived',
      membershipStatus: 'available',
      progress: { kind: 'actual', currentStamps: 10 },
    });
    expect(archived.state).toBe('archived');
    expect(archived.statusText).toContain('אינו זמין');
  });

  test('keeps actual, sample, and absent progress explicit', () => {
    const actual = presentation({
      progress: { kind: 'actual', currentStamps: 3 },
    });
    const sample = presentation({
      variant: 'preview',
      progress: { kind: 'sample', currentStamps: 3 },
    });
    const none = presentation({ progress: { kind: 'none' } });

    expect(actual.isSample).toBe(false);
    expect(actual.hasProgressData).toBe(true);
    expect(sample.isSample).toBe(true);
    expect(sample.current).toBe(3);
    expect(none.hasProgressData).toBe(false);
    expect(none.current).toBe(0);
    expect(none.statusText).toContain('יעד הכרטיס');
  });

  test('calculates remaining count and state-specific copy', () => {
    const partial = presentation({
      maxStamps: 10,
      progress: { kind: 'actual', currentStamps: 4 },
    });
    expect(partial.remaining).toBe(6);
    expect(partial.statusText).toContain('עוד 6');

    const near = presentation({
      maxStamps: 10,
      progress: { kind: 'actual', currentStamps: 9 },
    });
    expect(near.remaining).toBe(1);
    expect(near.statusText).toContain('כמעט שם');
  });

  test('uses bounded discrete and hybrid strategies for supported targets', () => {
    for (const target of [5, 6, 8, 10]) {
      expect(resolveProgressStrategy('wallet', target)).toBe('discrete');
      expect(resolveProgressStrategy('management', target)).toBe('discrete');
    }
    for (const target of [12, 14, 20, 31]) {
      expect(resolveProgressStrategy('wallet', target)).toBe('hybrid');
      expect(resolveProgressStrategy('management', target)).toBe('hybrid');
    }
    expect(resolveProgressStrategy('full', 12)).toBe('discrete');
    expect(resolveProgressStrategy('preview', 12)).toBe('discrete');
    expect(resolveProgressStrategy('full', 14)).toBe('hybrid');
    expect(resolveProgressStrategy('preview', 20)).toBe('hybrid');
  });

  test('builds one useful accessible summary and labels sample data', () => {
    const sample = presentation({
      variant: 'preview',
      progress: { kind: 'sample', currentStamps: 3 },
    });
    const label = buildLoyaltyCardAccessibilityLabel({
      businessName: 'Coffee & Co',
      programTitle: 'כרטיס בוקר',
      rewardName: 'קפה במתנה',
      presentation: sample,
    });

    expect(label).toContain('תצוגה לדוגמה');
    expect(label).toContain('Coffee & Co');
    expect(label).toContain('3 מתוך 10 ניקובים');
    expect(label).toContain('קפה במתנה');
  });
});
