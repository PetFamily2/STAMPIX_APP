import { describe, expect, test } from 'bun:test';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { extname, join } from 'node:path';

import { isReadyLoyaltyMembership } from '../domain/customerMemberships';

const LEGACY_COMPONENT =
  'components/business/ProgramCustomerCardPreview.tsx';
const REWARDS_SOURCE = 'app/(authenticated)/(customer)/rewards.tsx';
const QR_SOURCE = 'app/(authenticated)/(customer)/show-qr.tsx';
const PROGRAM_MANAGEMENT_SOURCE =
  'app/(authenticated)/(business)/cards/index.tsx';
const CUSTOMER_MANAGEMENT_SOURCE =
  'components/business/BusinessCustomerCardScreen.tsx';
const CUSTOMER_CARD_QUERY_SOURCE = 'convex/customerCards.ts';
const INTENTIONAL_PREVIEW_SOURCES = [
  'app/(authenticated)/merchant/onboarding/preview-card.tsx',
  'app/(authenticated)/(business)/cards/[programId].tsx',
];
const SCANNER_POS_SOURCES = [
  'app/(authenticated)/(business)/scanner.tsx',
  'app/(authenticated)/(staff)/scanner.tsx',
  'components/QrScanner.tsx',
];
const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx']);

function readSource(relativePath) {
  return readFileSync(relativePath, 'utf8');
}

function collectProductionSources(directory) {
  return readdirSync(directory).flatMap((entry) => {
    if (entry === '__tests__') {
      return [];
    }

    const path = join(directory, entry);
    if (statSync(path).isDirectory()) {
      return collectProductionSources(path);
    }

    return SOURCE_EXTENSIONS.has(extname(path)) ? [path] : [];
  });
}

function firstLoyaltyCardCall(source) {
  const match = source.match(/<LoyaltyCard\b[\s\S]*?\/>/);
  expect(match).not.toBeNull();
  return match?.[0] ?? '';
}

describe('canonical loyalty card integrations', () => {
  test('removes the legacy component and all production callers', () => {
    expect(existsSync(LEGACY_COMPONENT)).toBe(false);

    for (const root of ['app', 'components']) {
      for (const sourcePath of collectProductionSources(root)) {
        expect(readSource(sourcePath)).not.toContain(
          'ProgramCustomerCardPreview'
        );
      }
    }
  });

  test('renders only active redeemable memberships in rewards with real progress', () => {
    const source = readSource(REWARDS_SOURCE);
    const cardCall = firstLoyaltyCardCall(source);

    expect(source).toContain('memberships.filter(isReadyLoyaltyMembership)');
    expect(
      isReadyLoyaltyMembership({
        programLifecycle: 'active',
        maxStamps: 10,
        canRedeem: true,
      })
    ).toBe(true);
    for (const maxStamps of [0, -4, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(
        isReadyLoyaltyMembership({
          programLifecycle: 'active',
          maxStamps,
          canRedeem: true,
        })
      ).toBe(false);
    }
    expect(
      isReadyLoyaltyMembership({
        programLifecycle: 'archived',
        maxStamps: 10,
        canRedeem: true,
      })
    ).toBe(false);
    expect(cardCall).toContain('variant="wallet"');
    expect(cardCall).toContain("kind: 'actual'");
    expect(cardCall).toContain('currentStamps: reward.currentStamps');
    expect(cardCall).toContain('lifecycle={reward.programLifecycle}');
    expect(cardCall).toContain(
      "'/(authenticated)/(customer)/customer-card/[membershipId]'"
    );
    expect(cardCall).toContain('membershipId: reward.membershipId');
  });

  test('keeps program management cards explicitly progress-free', () => {
    const source = readSource(PROGRAM_MANAGEMENT_SOURCE);
    const cardCall = firstLoyaltyCardCall(source);

    expect(cardCall).toContain('variant="management"');
    expect(cardCall).toContain("progress={{ kind: 'none' }}");
    expect(cardCall).toContain('lifecycle={program.lifecycle}');
    expect(cardCall).toContain('onPress={() => onOpenProgram(program)}');
    expect(cardCall).not.toContain("kind: 'actual'");
    expect(cardCall).not.toContain("kind: 'sample'");
    expect(cardCall).not.toContain('currentStamps');
    expect(source).not.toContain('previewCurrentStamps');
    expect(source).not.toContain('fallbackCurrent');
  });

  test('uses actual customer progress and lifecycle in the shared business and staff screen', () => {
    const source = readSource(CUSTOMER_MANAGEMENT_SOURCE);
    const querySource = readSource(CUSTOMER_CARD_QUERY_SOURCE);
    const cardCall = firstLoyaltyCardCall(source);

    expect(cardCall).toContain('variant="management"');
    expect(cardCall).toContain("kind: 'actual'");
    expect(cardCall).toContain('currentStamps: program.currentStamps');
    expect(cardCall).toContain('lifecycle={program.programLifecycle}');
    expect(cardCall).toMatch(
      /maxStamps=\{\s*program\.targetIsValid\s*\?\s*program\.maxStamps\s*:\s*0\s*\}/
    );
    expect(cardCall).toContain('businessName={activeBusiness?.name?.trim()');
    expect(cardCall).toContain('businessLogoUrl={activeBusiness?.logoUrl');
    expect(cardCall).not.toContain('program.canRedeem');
    expect(source).not.toContain('previewCurrentStamps');
    expect(source).not.toContain('fallbackCurrent');
    expect(querySource).toContain(
      'const programLifecycle = resolveProgramLifecycle(program)'
    );
    expect(querySource).toContain('programLifecycle,');
  });

  test('keeps the customer stamp acknowledgement restrained', () => {
    const source = readSource(QR_SOURCE);

    expect(source).toContain("stampSuccessBanner: '✅ קיבלת ניקוב!'");
    expect(source).toContain('showFireworks={false}');
    expect(source).toContain('showConfetti={false}');
    expect(source).toContain('placement="top"');
    expect(source).toContain('emphasis="default"');
    expect(source).toContain('fullScreenCelebration={false}');
    expect(source).toContain('CUSTOMER_STAMP_BANNER_DURATION_MS = 5000');
  });

  test('keeps intentional previews explicit and free of legacy implicit progress', () => {
    for (const sourcePath of INTENTIONAL_PREVIEW_SOURCES) {
      const source = readSource(sourcePath);
      const cardCall = firstLoyaltyCardCall(source);

      expect(cardCall).toContain('variant="preview"');
      expect(cardCall).toContain("kind: 'sample'");
      expect(source).not.toContain('previewCurrentStamps');
      expect(source).not.toContain('fallbackCurrent');
      expect(source).not.toMatch(/previewCurrentStamps\s*\?\?\s*[24]/);
    }
  });

  test('keeps scanner and POS source boundaries free of loyalty card UI', () => {
    for (const sourcePath of SCANNER_POS_SOURCES) {
      const source = readSource(sourcePath);

      expect(source).not.toContain('LoyaltyCard');
      expect(source).not.toContain('ProgramCustomerCardPreview');
    }
  });
});
