const DEFAULT_PROVIDER_APP_USER_ID = 'ba_testidentitytoken1234';
const DAY_MS = 86_400_000;

export function buildCanonicalBusinessBillingAccount({
  _id = 'billing_1',
  businessId,
  ownerUserId,
  plan = 'starter',
  lastPlan,
  status = 'active',
  billingPeriod = 'monthly',
  hasProviderEvidence = true,
  now = Date.now(),
  currentPeriodEndAt,
  currentPeriodStartAt,
  subscriptionStartAt,
  canceledAt = null,
  gracePeriodEndAt = null,
  entitlementRevokedAt = null,
  provider = 'revenuecat',
  providerAppUserId = DEFAULT_PROVIDER_APP_USER_ID,
  ...overrides
} = {}) {
  if (!businessId) {
    throw new Error('CANONICAL_BILLING_FIXTURE_REQUIRES_BUSINESS_ID');
  }
  if (!ownerUserId) {
    throw new Error('CANONICAL_BILLING_FIXTURE_REQUIRES_OWNER_USER_ID');
  }

  const startAt = subscriptionStartAt ?? now - DAY_MS;
  return {
    _id,
    businessId,
    ownerUserId,
    providerAppUserId,
    plan,
    lastPlan: lastPlan ?? plan,
    status,
    billingPeriod,
    provider,
    hasProviderEvidence,
    subscriptionStartAt: startAt,
    currentPeriodStartAt: currentPeriodStartAt ?? startAt,
    currentPeriodEndAt: currentPeriodEndAt ?? now + DAY_MS,
    gracePeriodEndAt,
    canceledAt,
    entitlementRevokedAt,
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

export function seedCanonicalBusinessBillingAccounts(
  businesses,
  extras = {}
) {
  return businesses.map((business, index) =>
    buildCanonicalBusinessBillingAccount({
      _id: extras._id ?? `billing_${index + 1}`,
      businessId: business._id,
      ownerUserId: business.ownerUserId,
      plan: extras.plan ?? business.subscriptionPlan ?? 'starter',
      status: extras.status ?? 'active',
      now: extras.now,
      ...extras.accountOverrides,
    })
  );
}

export function buildInactiveCanonicalBusinessBillingAccount(args = {}) {
  const now = args.now ?? Date.now();
  return buildCanonicalBusinessBillingAccount({
    ...args,
    status: args.status ?? 'inactive',
    currentPeriodEndAt: args.currentPeriodEndAt ?? now - DAY_MS,
  });
}

export function buildCanceledEffectiveCanonicalBusinessBillingAccount(
  args = {}
) {
  const now = args.now ?? Date.now();
  return buildCanonicalBusinessBillingAccount({
    ...args,
    status: 'canceled',
    canceledAt: args.canceledAt ?? now,
    currentPeriodEndAt: args.currentPeriodEndAt ?? now + DAY_MS,
  });
}
