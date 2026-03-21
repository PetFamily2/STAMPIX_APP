import { describe, expect, test } from 'bun:test';
import {
  assertEntitlement,
  getRequiredPlanForLimit,
  REQUIRED_PLAN_BY_FEATURE,
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
    ...overrides,
  };
}

function buildCtxWithBusiness(businessDoc) {
  const state = {
    business: { ...businessDoc },
    campaigns: [],
    aiUsageLedger: [],
  };

  const buildCampaignQuery = () => {
    const chain = {
      withIndex: () => chain,
      filter: () => chain,
      collect: async () => state.campaigns,
      first: async () => state.campaigns[0] ?? null,
    };
    return chain;
  };

  const buildAiUsageLedgerQuery = () => {
    const chain = {
      withIndex: () => chain,
      filter: () => chain,
      collect: async () => state.aiUsageLedger,
      first: async () => state.aiUsageLedger[0] ?? null,
    };
    return chain;
  };

  const ctx = {
    db: {
      get: async (id) => {
        if (id === state.business._id) {
          return state.business;
        }
        return null;
      },
      query: (tableName) => {
        if (tableName === 'campaigns') {
          return buildCampaignQuery();
        }
        if (tableName === 'aiUsageLedger') {
          return buildAiUsageLedgerQuery();
        }
        throw new Error(`UNSUPPORTED_QUERY_TABLE:${tableName}`);
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
  test('starter caps block cards, customers, campaigns, retention and AI monthly usage', async () => {
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

    const retentionError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxActiveRetentionActions',
        currentValue: 0,
      })
    );
    expect(retentionError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(retentionError?.limitKey).toBe('maxActiveRetentionActions');
    expect(retentionError?.limitValue).toBe(0);
    expect(retentionError?.limitType).toBe('active_retention_actions');

    const campaignError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCampaigns',
        currentValue: 1,
      })
    );
    expect(campaignError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(campaignError?.limitKey).toBe('maxCampaigns');
    expect(campaignError?.limitValue).toBe(1);

    const aiMonthlyError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxAiExecutionsPerMonth',
        currentValue: 0,
      })
    );
    expect(aiMonthlyError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(aiMonthlyError?.limitKey).toBe('maxAiExecutionsPerMonth');
    expect(aiMonthlyError?.limitValue).toBe(0);
    expect(aiMonthlyError?.limitType).toBe('ai_executions_monthly');
  });

  test('pro enforces cards, campaigns, retention and monthly AI limits', async () => {
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
    expect(cardError?.requiredPlan).toBe('premium');

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxActiveRetentionActions',
        currentValue: 4,
      })
    ).resolves.toBeDefined();

    const retentionError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxActiveRetentionActions',
        currentValue: 5,
      })
    );
    expect(retentionError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(retentionError?.limitValue).toBe(5);
    expect(retentionError?.requiredPlan).toBe('premium');
    expect(retentionError?.limitType).toBe('active_retention_actions');

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCampaigns',
        currentValue: 4,
      })
    ).resolves.toBeDefined();

    const campaignError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCampaigns',
        currentValue: 5,
      })
    );
    expect(campaignError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(campaignError?.limitValue).toBe(5);
    expect(campaignError?.requiredPlan).toBe('premium');

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxAiExecutionsPerMonth',
        currentValue: 99,
      })
    ).resolves.toBeDefined();

    const aiMonthlyError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxAiExecutionsPerMonth',
        currentValue: 100,
      })
    );
    expect(aiMonthlyError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(aiMonthlyError?.limitValue).toBe(100);
    expect(aiMonthlyError?.requiredPlan).toBe('premium');
    expect(aiMonthlyError?.limitType).toBe('ai_executions_monthly');
  });

  test('premium enforces higher numeric caps (no unlimited values)', async () => {
    const business = buildBusiness({
      _id: 'premium_business',
      subscriptionPlan: 'premium',
      subscriptionStatus: 'active',
      billingPeriod: 'monthly',
    });
    const { ctx } = buildCtxWithBusiness(business);

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCards',
        currentValue: 9,
      })
    ).resolves.toBeDefined();

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCustomers',
        currentValue: 9999,
      })
    ).resolves.toBeDefined();

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxActiveRetentionActions',
        currentValue: 14,
      })
    ).resolves.toBeDefined();

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCampaigns',
        currentValue: 9,
      })
    ).resolves.toBeDefined();

    await expect(
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxAiExecutionsPerMonth',
        currentValue: 299,
      })
    ).resolves.toBeDefined();

    const cardsError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCards',
        currentValue: 10,
      })
    );
    expect(cardsError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(cardsError?.limitValue).toBe(10);

    const customersError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCustomers',
        currentValue: 10000,
      })
    );
    expect(customersError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(customersError?.limitValue).toBe(10000);

    const retentionError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxActiveRetentionActions',
        currentValue: 15,
      })
    );
    expect(retentionError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(retentionError?.limitValue).toBe(15);

    const campaignError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxCampaigns',
        currentValue: 10,
      })
    );
    expect(campaignError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(campaignError?.limitValue).toBe(10);

    const aiMonthlyError = await getConvexErrorData(() =>
      assertEntitlement(ctx, business._id, {
        limitKey: 'maxAiExecutionsPerMonth',
        currentValue: 300,
      })
    );
    expect(aiMonthlyError?.code).toBe('PLAN_LIMIT_REACHED');
    expect(aiMonthlyError?.limitValue).toBe(300);
    expect(aiMonthlyError?.limitType).toBe('ai_executions_monthly');
  });

  test('required plan mapping is correct for all feature keys', () => {
    expect(REQUIRED_PLAN_BY_FEATURE.canManageTeam).toBe('pro');
    expect(REQUIRED_PLAN_BY_FEATURE.canSeeAdvancedReports).toBe('pro');
    expect(REQUIRED_PLAN_BY_FEATURE.canUseMarketingHubAI).toBe('starter');
    expect(REQUIRED_PLAN_BY_FEATURE.canUseSmartAnalytics).toBe('starter');

    expect(getRequiredPlanForLimit('maxCards', 'starter')).toBe('pro');
    expect(getRequiredPlanForLimit('maxCustomers', 'starter')).toBe('pro');
    expect(
      getRequiredPlanForLimit('maxActiveRetentionActions', 'starter')
    ).toBe('pro');
    expect(getRequiredPlanForLimit('maxCampaigns', 'starter')).toBe('pro');
    expect(getRequiredPlanForLimit('maxAiExecutionsPerMonth', 'starter')).toBe(
      'pro'
    );
    expect(getRequiredPlanForLimit('maxCards', 'pro')).toBe('premium');
    expect(getRequiredPlanForLimit('maxCustomers', 'pro')).toBe('premium');
    expect(getRequiredPlanForLimit('maxActiveRetentionActions', 'pro')).toBe(
      'premium'
    );
    expect(getRequiredPlanForLimit('maxCampaigns', 'pro')).toBe('premium');
    expect(getRequiredPlanForLimit('maxAiExecutionsPerMonth', 'pro')).toBe(
      'premium'
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
