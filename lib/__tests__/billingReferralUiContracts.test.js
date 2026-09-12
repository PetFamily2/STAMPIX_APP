import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import {
  FORBIDDEN_STARTER_COPY_PATTERNS,
  FORBIDDEN_V2_PLAN_COPY_PATTERNS,
  MVP_FEATURE_FLAGS,
  planConfig,
} from '../../convex/lib/billing/productionContract';
import { REFERRAL_COPY } from '../../convex/lib/referrals/copy';

describe('billing and referral UI contracts', () => {
  test('referral hub copy is human and uses the 12-month benefit', () => {
    expect(REFERRAL_COPY.hubHeading).toContain('הזמינו עסקים');
    expect(REFERRAL_COPY.paywallBenefitNote).toContain(
      'חודש מתנה לאחר 12 חודשי מנוי בתשלום'
    );
    expect(REFERRAL_COPY.shareMessage).not.toContain('30 ימים');
  });

  test('active subscription UI does not advertise V2 or free Starter', () => {
    expect(planConfig.starter.pricing.monthly).toBe(149);
    expect(planConfig.starter.pricing.yearly).toBe(1490);
    const sources = [
      'lib/subscription/planComparison.ts',
      'components/subscription/SubscriptionSalesPanel.tsx',
      'components/subscription/UpgradeModal.tsx',
    ];
    const blob = sources.map((path) => readFileSync(path, 'utf8')).join('\n');
    for (const pattern of FORBIDDEN_STARTER_COPY_PATTERNS) {
      expect(blob).not.toContain(pattern);
    }
    for (const pattern of FORBIDDEN_V2_PLAN_COPY_PATTERNS) {
      expect(blob).not.toContain(pattern);
    }
  });

  test('settings keeps הזמנת עסקים visible and hides extra-business creation', () => {
    const settings = readFileSync('screens/BusinessSettingsScreen.tsx', 'utf8');
    expect(settings).toContain('title="הזמנת עסקים"');
    expect(MVP_FEATURE_FLAGS.additionalBusinessCreationEnabled).toBe(false);
  });

  test('referral hub, wallet and share surfaces exist', () => {
    const hub = readFileSync(
      'app/(authenticated)/(business)/settings-business-invite-businesses.tsx',
      'utf8'
    );
    expect(hub).toContain('REFERRAL_COPY.hubHeading');
    expect(hub).toContain('ארנק הטבות');
    expect(hub).toContain('העתקת קישור');
    expect(hub).toContain('ReferralShareCreative');
    const paywall = readFileSync('app/(auth)/paywall/index.tsx', 'utf8');
    expect(paywall).toContain('haveInviteCode');
    expect(paywall).toContain('paywallBenefitNote');
    expect(paywall).toContain('SERVER_SYNC_PENDING_MESSAGE_HE');
  });
});

describe('schema compatibility', () => {
  test('new billing fields are optional or isolated in new tables', () => {
    const schema = readFileSync('convex/schema.ts', 'utf8');
    expect(schema).toContain('businessBillingAccounts');
    expect(schema).toContain('businessReferralRewards');
    expect(schema).toContain('providerAppUserId');
  });
});
