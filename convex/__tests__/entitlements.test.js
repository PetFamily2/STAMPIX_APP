import { describe, expect, test } from 'bun:test';
import {
  REQUIRED_PLAN_BY_FEATURE,
  assertEntitlement,
  getCurrentMonthKey,
  getRequiredPlanForLimit,
  reserveAiCampaignQuota,
} from '../entitlements';

function buildBusiness(overrides = {}) {
  const now = Date.now();
  return {
    _id: 'business_1',
    _creationTime: now,
    ownerUserId: 'user_1',
    externalId: 'biz-ext-1',
    name: 'Test Business',
    isActive: true,
    createdAt: now,
    updatedAt: now,
    subscriptionPlan: 'starter',
    subscriptionStatus: 'active',
    subscriptionStartAt: now,
    subscriptionEndAt: null,
    billingPeriod: null,
    aiCampaignsUsedThisMonth: 0,
    aiCampaignsMonthKey: getCurrentMonthKey(now),
    ...overrides,
  };
}

function buildCtxWithBusiness(businessDoc) {
  const state = {
    business: { ...businessDoc },
  };

  const ctx = {
    db: {
      get: async (id) => {
        if (id === state.business._id) {
          return state.business;
        }
        return null;
      },
      patch: async (id, patch) => {
        if (id !== state.business._id) {
          throw new Error('UNEXPECTED_PATCH_TARGET');
        }
        state.business = {
          ...state.business,
          ...patch,
        };
      },
    },
  };

  return { ctx, state };
}

async function getConvexErrorData(work) {
  try {
    await work();
  } catch (error) {
    return error?.data ?? null;
  }
  return null;
}

describe('business entitlements', () => {
  test('starter caps block 2nd card, 31st customer and AI at 0', async () => {
    const business = buildBusiness({
      _id: 'starter_business',
      subscriptionPlan: 'starter',
      subscriptionStatus: 'active',
    });
    const { ctx } = buildCtxWithBusiness(business);

    const cardError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCards',
        currentValue: 1,
      })
    );
    expect(cardError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(cardError?.limitKey).toBe('maxCards');
    expect(cardError?.limitValue).toBe(1);
    expect(cardError?.currentValue).toBe(1);

    const customerError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCustomers',
        currentValue: 30,
      })
    );
    expect(customerError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(customerError?.limitKey).toBe('maxCustomers');
    expect(customerError?.limitValue).toBe(30);

    const aiError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxAiCampaignsPerMonth',
        currentValue: 0,
      })
    );
    expect(aiError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(aiError?.limitKey).toBe('maxAiCampaignsPerMonth');
    expect(aiError?.limitValue).toBe(0);
  });

  test('pro allows up to 5 cards and 5 AI campaigns, blocks the next one', async () => {
    const business = buildBusiness({
      _id: 'pro_business',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      billingPeriod: 'monthly',
    });
    const { ctx } = buildCtxWithBusiness(business);

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCards',
        currentValue: 4,
      })
    ).resolves.toBeDefined();

    const cardError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCards',
        currentValue: 5,
      })
    );
    expect(cardError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(cardError?.requiredPlan).toBe('unlimited');

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxAiCampaignsPerMonth',
        currentValue: 4,
      })
    ).resolves.toBeDefined();

    const aiError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxAiCampaignsPerMonth',
        currentValue: 5,
      })
    );
    expect(aiError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(aiError?.limitValue).toBe(5);
    expect(aiError?.requiredPlan).toBe('unlimited');
  });

  test('unlimited has unlimited cards/customers and AI cap at 15', async () => {
    const business = buildBusiness({
      _id: 'unlimited_business',
      subscriptionPlan: 'unlimited',
      subscriptionStatus: 'active',
      billingPeriod: 'monthly',
    });
    const { ctx } = buildCtxWithBusiness(business);

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCards',
        currentValue: 500,
      })
    ).resolves.toBeDefined();

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCustomers',
        currentValue: 5000,
      })
    ).resolves.toBeDefined();

    const aiError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxAiCampaignsPerMonth',
        currentValue: 15,
      })
    );
    expect(aiError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(aiError?.limitValue).toBe(15);
  });

  test('AI monthly reset happens before quota increment', async () => {
    const now = new Date();
    const previousMonthDate = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1)
    );
    const previousMonthKey = `${previousMonthDate.getUTCFullYear()}-${String(
      previousMonthDate.getUTCMonth() + 1
    ).padStart(2, '0')}`;

    const business = buildBusiness({
      _id: 'pro_month_reset',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'active',
      billingPeriod: 'monthly',
      aiCampaignsUsedThisMonth: 5,
      aiCampaignsMonthKey: previousMonthKey,
    });
    const { ctx, state } = buildCtxWithBusiness(business);

    const quota = await reserveAiCampaignQuota(ctx, business._id);
    expect(quota.usedBefore).toBe(0);
    expect(quota.usedAfter).toBe(1);
    expect(state.business.aiCampaignsUsedThisMonth).toBe(1);
    expect(state.business.aiCampaignsMonthKey).toBe(getCurrentMonthKey());
  });

  test('required plan mapping is correct for all feature keys', () => {
    expect(REQUIRED_PLAN_BY_FEATURE.canManageTeam).toBe('pro');
    expect(REQUIRED_PLAN_BY_FEATURE.canSeeAdvancedReports).toBe('pro');
    expect(REQUIRED_PLAN_BY_FEATURE.canUseMarketingHubAI).toBe('pro');
    expect(REQUIRED_PLAN_BY_FEATURE.canUseSmartAnalytics).toBe('pro');
    expect(REQUIRED_PLAN_BY_FEATURE.canUseAdvancedSegmentation).toBe(
      'unlimited'
    );

    expect(getRequiredPlanForLimit('maxCards', 'starter')).toBe('pro');
    expect(getRequiredPlanForLimit('maxCustomers', 'starter')).toBe('pro');
    expect(getRequiredPlanForLimit('maxAiCampaignsPerMonth', 'starter')).toBe(
      'pro'
    );
    expect(getRequiredPlanForLimit('maxCards', 'pro')).toBe('unlimited');
    expect(getRequiredPlanForLimit('maxCustomers', 'pro')).toBeNull();
    expect(getRequiredPlanForLimit('maxAiCampaignsPerMonth', 'pro')).toBe(
      'unlimited'
    );
  });

  test('typed errors include metadata for feature and inactive subscription', async () => {
    const starterBusiness = buildBusiness({
      _id: 'starter_feature',
      subscriptionPlan: 'starter',
      subscriptionStatus: 'active',
    });
    const starterCtx = buildCtxWithBusiness(starterBusiness).ctx;

    const featureError = await getConvexErrorData(() =>
      assertEntitlement(starterCtx, starterBusiness._id, {
        featureKey: 'canManageTeam',
      })
    );
    expect(featureError?.code).toBe('FEATURE_NOT_AVAILABLE');
    expect(featureError?.featureKey).toBe('canManageTeam');
    expect(featureError?.requiredPlan).toBe('pro');
    expect(featureError?.businessId).toBe(starterBusiness._id);

    const inactiveBusiness = buildBusiness({
      _id: 'inactive_pro',
      subscriptionPlan: 'pro',
      subscriptionStatus: 'past_due',
      billingPeriod: 'monthly',
    });
    const inactiveCtx = buildCtxWithBusiness(inactiveBusiness).ctx;

    const inactiveError = await getConvexErrorData(() =>
      assertEntitlement(inactiveCtx, inactiveBusiness._id, {
        featureKey: 'canSeeAdvancedReports',
      })
    );
    expect(inactiveError?.code).toBe('SUBSCRIPTION_INACTIVE');
    expect(inactiveError?.subscriptionStatus).toBe('past_due');
    expect(inactiveError?.requiredPlan).toBe('pro');
    expect(inactiveError?.businessId).toBe(inactiveBusiness._id);
  });
});
