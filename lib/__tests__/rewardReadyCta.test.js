import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';
import {
  hasUsableCustomerScanToken,
  isVisibleWalletPreviewRedeemable,
  shouldRefreshScanTokenForReveal,
} from '../customer/rewardReadyCta';
import { customerCardRoute } from '../navigation/customerRoutes';

const WALLET = 'app/(authenticated)/(customer)/wallet.tsx';
const REWARDS = 'app/(authenticated)/(customer)/rewards.tsx';
const BUSINESS = 'app/(authenticated)/(customer)/business/[businessId].tsx';
const CARD = 'app/(authenticated)/card/[membershipId].tsx';
const LOYALTY_CARD = 'components/loyalty/LoyaltyCard.tsx';
const CARD_PRESENTATION = 'lib/loyalty/cardPresentation.ts';
const SCANNER = 'app/(authenticated)/(business)/scanner.tsx';
const STAMP_CELEBRATION = 'lib/customer/customerStampCelebration.ts';
const REDEMPTION_HOST = 'components/customer/RedemptionCelebrationHost.tsx';

const PREVIEW_ROUTE = customerCardRoute('membership_ready');

function readSource(path) {
  return readFileSync(path, 'utf8');
}

function firstSelfClosingTag(source, tagName) {
  const match = source.match(new RegExp(`<${tagName}\\b[\\s\\S]*?\\/>`));
  return match?.[0] ?? '';
}

describe('wallet preview redemption CTA', () => {
  test('a completed visible preview is redeemable on its own card route', () => {
    expect(
      isVisibleWalletPreviewRedeemable({
        previewProgramLifecycle: 'active',
        previewCurrentStamps: 10,
        previewMaxStamps: 10,
        previewCardRoute: PREVIEW_ROUTE,
      })
    ).toBe(true);
  });

  test('an incomplete visible preview is not redeemable when another reward is ready', () => {
    expect(
      isVisibleWalletPreviewRedeemable({
        previewProgramLifecycle: 'active',
        previewCurrentStamps: 3,
        previewMaxStamps: 10,
        previewCardRoute: PREVIEW_ROUTE,
      })
    ).toBe(false);
    expect(
      isVisibleWalletPreviewRedeemable({
        previewProgramLifecycle: 'active',
        previewCurrentStamps: 10,
        previewMaxStamps: 10,
        previewCardRoute: null,
      })
    ).toBe(false);
    expect(
      isVisibleWalletPreviewRedeemable({
        previewProgramLifecycle: 'archived',
        previewCurrentStamps: 10,
        previewMaxStamps: 10,
        previewCardRoute: PREVIEW_ROUTE,
      })
    ).toBe(false);
    expect(
      isVisibleWalletPreviewRedeemable({
        previewProgramLifecycle: 'active',
        previewCurrentStamps: 0,
        previewMaxStamps: 0,
        previewCardRoute: PREVIEW_ROUTE,
      })
    ).toBe(false);
  });

  test('wallet renders the sibling CTA only from the visible preview route', () => {
    const wallet = readSource(WALLET);
    const cardCall = firstSelfClosingTag(wallet, 'LoyaltyCard');
    const gateStart = wallet.indexOf('isVisibleWalletPreviewRedeemable({');
    const gateEnd = wallet.indexOf('});', gateStart);
    const gate = wallet.slice(gateStart, gateEnd);

    expect(wallet).toContain("showForRedemption: 'הצג למימוש'");
    expect(wallet).toContain("openBusiness: 'פתח את העסק'");
    expect(wallet).toContain('<ActionButton');
    expect(wallet).toContain('router.push(previewCardRoute as Href)');
    expect(gate).toContain(
      'previewCurrentStamps: business.previewCurrentStamps'
    );
    expect(gate).toContain('previewMaxStamps: business.previewMaxStamps');
    expect(gate).toContain(
      'previewProgramLifecycle: business.previewProgramLifecycle'
    );
    expect(gate).toContain('previewCardRoute');
    expect(gate).not.toContain('redeemableCount');
    expect(cardCall).not.toContain('ActionButton');
    expect(cardCall).not.toContain('הצג למימוש');
    expect(wallet.indexOf('<ActionButton')).toBeGreaterThan(
      wallet.indexOf('<LoyaltyCard')
    );
  });
});

describe('rewards redemption CTA', () => {
  test('each ready card keeps a sibling CTA on the canonical membership route', () => {
    const rewards = readSource(REWARDS);
    const cardCall = firstSelfClosingTag(rewards, 'LoyaltyCard');
    const afterCard = rewards.slice(
      rewards.indexOf(cardCall) + cardCall.length
    );

    expect(rewards).toContain("showForRedemption: 'הצג למימוש'");
    expect(cardCall).toContain('customerCardRoute(reward.membershipId)');
    expect(cardCall).not.toContain('ActionButton');
    expect(cardCall).not.toContain('הצג למימוש');
    expect(afterCard).toContain('<ActionButton');
    expect(afterCard).toContain('customerCardRoute(reward.membershipId)');
    expect(rewards).not.toContain('`/customer-card/');
  });
});

describe('business joined-card action label', () => {
  test('ready joined cards say show for redemption and other cards stay open-card', () => {
    const business = readSource(BUSINESS);

    expect(business).toContain("openCard: 'פתח כרטיסיה'");
    expect(business).toContain("showForRedemption: 'הצג למימוש'");
    expect(business).toMatch(
      /program\.canRedeem\s*\?\s*TEXT\.showForRedemption\s*:\s*TEXT\.openCard/
    );
    expect(business).toContain('openJoinedCard(program.membershipId)');
    expect(business).toContain('customerCardRoute(String(membershipId))');
    const joinedCard = business.slice(business.indexOf('joinedPrograms.map'));
    expect(firstSelfClosingTag(joinedCard, 'LoyaltyCard')).not.toContain(
      'הצג למימוש'
    );
  });
});

describe('card detail ready presentation', () => {
  test('uses the ready copy contract and drops the next-visit-only line', () => {
    const card = readSource(CARD);

    expect(card).toContain("cardReadyTitle: 'ההטבה מוכנה למימוש'");
    expect(card).toContain(
      "cardReadySubtitle: 'אפשר לממש עכשיו בקופה או בביקור הבא'"
    );
    expect(card).toContain('הציגו את הקוד בקופה. בעסק מאשרים את המימוש.');
    expect(card).toContain("redeemButtonReady: 'הצג למימוש'");
    expect(card).not.toContain('המימוש מתבצע בביקור הבא בעסקה נפרדת');
    expect(card).not.toContain('בביזנס');
    expect(card).not.toContain('המתנה שלך מוכנה למימוש');
  });

  test('reveal scrolls the existing QR and does not redeem or rotate a usable token', () => {
    const card = readSource(CARD);

    expect(card).toContain('revealQrForRedemption');
    expect(card).toContain('scrollQrIntoView');
    expect(card).toContain('measureLayout');
    expect(card).toContain('scrollTo');
    expect(card).toContain('innerViewRef={scrollContentRef');
    expect(card).toContain('qrSectionRef');
    expect(card).toContain('stickyHeaderHeightRef.current');
    expect(card).toContain('shouldRefreshScanTokenForReveal');
    expect(card).not.toContain('commitRedeem');
    expect(card).not.toContain('commitCompletedStampRedeem');
    expect(card).not.toContain('createRedemptionCelebrationReceipt');
    expect(card).not.toMatch(/scrollTo\(\{\s*y:\s*\d+/);
    expect(card.indexOf('scrollQrIntoView()')).toBeLessThan(
      card.indexOf('shouldRefreshScanTokenForReveal({')
    );
  });
});

describe('customer scan token reveal refresh', () => {
  const now = 1_000_000;

  test('a valid token is usable and is not refreshed', () => {
    const input = {
      scanTokenPayload: 'scanToken:ready',
      tokenExpiresAt: now + 1,
      now,
    };
    expect(hasUsableCustomerScanToken(input)).toBe(true);
    expect(
      shouldRefreshScanTokenForReveal({ ...input, isTokenLoading: false })
    ).toBe(false);
  });

  test('a missing, empty, or expired token is refreshed once loading has finished', () => {
    expect(
      shouldRefreshScanTokenForReveal({
        scanTokenPayload: null,
        tokenExpiresAt: null,
        isTokenLoading: false,
        now,
      })
    ).toBe(true);
    expect(
      shouldRefreshScanTokenForReveal({
        scanTokenPayload: '',
        tokenExpiresAt: now + 1_000,
        isTokenLoading: false,
        now,
      })
    ).toBe(true);
    expect(
      shouldRefreshScanTokenForReveal({
        scanTokenPayload: 'scanToken:stale',
        tokenExpiresAt: now,
        isTokenLoading: false,
        now,
      })
    ).toBe(true);
  });

  test('an in-flight token request is not started again', () => {
    expect(
      shouldRefreshScanTokenForReveal({
        scanTokenPayload: null,
        tokenExpiresAt: null,
        isTokenLoading: true,
        now,
      })
    ).toBe(false);
  });
});

describe('untouched redemption surfaces', () => {
  test('LoyaltyCard, presentation, scanner, and celebrations stay on their current contracts', () => {
    const loyaltyCard = readSource(LOYALTY_CARD);
    expect(loyaltyCard).not.toContain('הצג למימוש');
    expect(loyaltyCard).not.toContain('ActionButton');

    expect(readSource(CARD_PRESENTATION)).toContain(
      "return 'ההטבה מוכנה למימוש'"
    );
    expect(readSource(SCANNER)).toContain(
      "commitTarget: 'completed_stamp_redemption'"
    );
    expect(readSource(SCANNER)).not.toContain(
      'אפשר לממש עכשיו בקופה או בביקור הבא'
    );
    expect(readSource(STAMP_CELEBRATION)).toContain(
      "export const CUSTOMER_CARD_COMPLETED_SUBTITLE = 'המתנה שלך מוכנה למימוש'"
    );
    expect(readSource(REDEMPTION_HOST)).toContain(
      'hasPendingRedemptionCelebration'
    );
    expect(readSource(REDEMPTION_HOST)).not.toContain('הצג למימוש');
  });
});
