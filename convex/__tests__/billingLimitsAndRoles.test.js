import { describe, expect, test } from 'bun:test';
import { readFileSync } from 'node:fs';

import { countNonArchivedPrograms } from '../loyaltyPrograms';
import { countsTowardCampaignDefinitions } from '../entitlements';
import { getRoleCapabilities } from '../lib/staffPermissions';

describe('max cards contract', () => {
  test('draft counts and archived does not', () => {
    expect(
      countNonArchivedPrograms([
        { status: 'draft' },
        { status: 'active' },
        { status: 'archived' },
      ])
    ).toBe(2);
  });
});

describe('campaign vs B2B referral quota', () => {
  test('customer campaigns count while B2B referrals are a separate domain', () => {
    expect(
      countsTowardCampaignDefinitions({
        isActive: true,
        activationStatus: 'active',
      })
    ).toBe(true);
    const engine = readFileSync('convex/businessReferralEngine.ts', 'utf8');
    expect(engine).not.toContain('countActiveCampaignsForBusiness');
    expect(engine).not.toContain('maxCampaigns');
  });
});

describe('role billing security', () => {
  test('manager cannot view billing or manage subscription but can invite', () => {
    const manager = getRoleCapabilities('manager');
    expect(manager.view_billing_state).toBe(false);
    expect(manager.manage_subscription).toBe(false);
    expect(manager.invite_businesses).toBe(true);
    const staff = getRoleCapabilities('staff');
    expect(staff.invite_businesses).toBe(false);
    expect(staff.manage_subscription).toBe(false);
  });

  test('claiming a referral requires billing-owner authority for the target business', () => {
    const engine = readFileSync('convex/businessReferralEngine.ts', 'utf8');
    const claimStart = engine.indexOf(
      'export const claimBusinessReferralCode = mutation'
    );
    const claimEnd = engine.indexOf(
      'export const getBusinessReferralHub = query',
      claimStart
    );
    const claimSource = engine.slice(claimStart, claimEnd);
    expect(claimSource).toContain('requireActorHasBusinessCapability');
    expect(claimSource).toContain("'manage_subscription'");
    expect(claimSource).not.toContain('requireCurrentUser(ctx)');
  });
});

describe('no fake Convex referral extension', () => {
  test('new referral engine does not patch subscriptionEndAt', () => {
    const engine = readFileSync('convex/businessReferralEngine.ts', 'utf8');
    expect(engine).not.toContain('subscriptionEndAt');
  });
});
