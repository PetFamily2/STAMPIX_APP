import { v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { query } from './_generated/server';
import { computeBusinessProfileCompletion } from './business';
import {
  buildDashboardLifecycleCountsFromStampEvents,
  getCustomerExpectedCycleDays,
} from './customerLifecycle';
import { getBusinessEntitlementsForBusinessId } from './entitlements';
import {
  getBusinessStaffStatus,
  requireActorHasBusinessCapability,
} from './guards';
import {
  CAMPAIGN_LIFECYCLE_SOURCE_VERSION,
  classifyCampaignState,
  type CampaignProductState,
} from './lib/campaignState';
import type {
  BusinessCapability,
  BusinessCapabilityMap,
  StaffRole,
} from './lib/staffPermissions';
import { getRetentionThresholdsForBusiness } from './lib/customerIntelligence';
import { resolveProgramLifecycle } from './loyaltyPrograms';

const RECOMMENDATION_FACTS_SCHEMA_VERSION = 1;

export type KnownFact<T> = {
  state: 'known';
  value: T;
  observedAt: number;
};

export type UnknownFact = {
  state: 'unknown';
  reasonCode: string;
};

export type RestrictedFact = {
  state: 'restricted';
  requiredCapability: BusinessCapability;
};

export type RecommendationFact<T> =
  | KnownFact<T>
  | UnknownFact
  | RestrictedFact;

type RecommendationActorAuthorization = {
  staffRole: StaffRole;
  capabilities: BusinessCapabilityMap;
};

type CampaignFactRow = {
  _id: Id<'campaigns'>;
  status?: unknown;
  activationStatus?: unknown;
  schedule?: unknown;
  automationEnabled?: unknown;
  isActive?: unknown;
  archivedAt?: unknown;
  createdAt?: number;
  updatedAt?: number;
};

type CampaignRunFactRow = {
  campaignId: Id<'campaigns'>;
};

export type CampaignLifecycleFactValue = {
  totalNonarchivedCampaigns: number;
  draftCount: number;
  scheduledCount: number;
  recurringCount: number;
  pausedCount: number;
  completedCount: number;
  inconsistentCount: number;
  meaningfullyActiveCount: number;
  firstDraftCampaignId: Id<'campaigns'> | null;
  firstPausedCampaignId: Id<'campaigns'> | null;
  firstScheduledCampaignId: Id<'campaigns'> | null;
  firstRecurringCampaignId: Id<'campaigns'> | null;
  nextScheduled: {
    campaignId: Id<'campaigns'>;
    timestamp: number;
  } | null;
  lifecycleSourceVersion: typeof CAMPAIGN_LIFECYCLE_SOURCE_VERSION;
};

function knownFact<T>(value: T, observedAt: number): KnownFact<T> {
  return {
    state: 'known',
    value,
    observedAt,
  };
}

function unknownFact(reasonCode: string): UnknownFact {
  return {
    state: 'unknown',
    reasonCode,
  };
}

function restrictedFact(
  requiredCapability: BusinessCapability
): RestrictedFact {
  return {
    state: 'restricted',
    requiredCapability,
  };
}

function normalizeText(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function hasCompleteRecommendationAddress(business: Doc<'businesses'>) {
  const latitude = business.location?.lat;
  const longitude = business.location?.lng;
  return (
    normalizeText(business.formattedAddress).length > 0 &&
    normalizeText(business.placeId).length > 0 &&
    Number.isFinite(latitude) &&
    Number(latitude) >= -90 &&
    Number(latitude) <= 90 &&
    Number.isFinite(longitude) &&
    Number(longitude) >= -180 &&
    Number(longitude) <= 180 &&
    normalizeText(business.city).length > 0 &&
    normalizeText(business.street).length > 0 &&
    normalizeText(business.streetNumber).length > 0
  );
}

function hasResolvableBusinessLogo(business: Doc<'businesses'>) {
  const logoUrl = normalizeText(business.logoUrl);
  if (!logoUrl) {
    return false;
  }
  try {
    const parsed = new URL(logoUrl);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
}

function compareCampaignsByRecency(
  left: CampaignFactRow,
  right: CampaignFactRow
) {
  const updatedDelta = Number(right.updatedAt ?? 0) - Number(left.updatedAt ?? 0);
  if (updatedDelta !== 0) {
    return updatedDelta;
  }
  const createdDelta = Number(right.createdAt ?? 0) - Number(left.createdAt ?? 0);
  if (createdDelta !== 0) {
    return createdDelta;
  }
  return String(left._id).localeCompare(String(right._id));
}

export function buildCampaignLifecycleFactValue(args: {
  campaigns: CampaignFactRow[];
  campaignRuns: CampaignRunFactRow[];
  now: number;
}): CampaignLifecycleFactValue {
  const campaignIdsWithRuns = new Set(
    args.campaignRuns.map((run) => String(run.campaignId))
  );
  const classified = [...args.campaigns]
    .sort(compareCampaignsByRecency)
    .map((campaign) => ({
      campaign,
      result: classifyCampaignState(campaign, {
        now: args.now,
        hasPersistedCompletionEvidence: campaignIdsWithRuns.has(
          String(campaign._id)
        ),
      }),
    }));

  const countState = (state: CampaignProductState) =>
    classified.filter((entry) => entry.result.state === state).length;
  const firstIdForState = (state: CampaignProductState) =>
    classified.find((entry) => entry.result.state === state)?.campaign._id ??
    null;
  const scheduled = classified
    .flatMap((entry) =>
      entry.result.state === 'scheduled' &&
      typeof entry.result.scheduledAt === 'number'
        ? [
            {
              campaign: entry.campaign,
              scheduledAt: entry.result.scheduledAt,
            },
          ]
        : []
    )
    .sort(
      (left, right) =>
        left.scheduledAt - right.scheduledAt ||
        String(left.campaign._id).localeCompare(String(right.campaign._id))
    );
  const nextScheduledEntry = scheduled[0] ?? null;

  return {
    totalNonarchivedCampaigns: classified.filter(
      (entry) => entry.result.isExisting
    ).length,
    draftCount: countState('draft'),
    scheduledCount: countState('scheduled'),
    recurringCount: countState('recurring'),
    pausedCount: countState('paused'),
    completedCount: countState('completed'),
    inconsistentCount: countState('inconsistent'),
    meaningfullyActiveCount: classified.filter(
      (entry) => entry.result.isMeaningfullyActive
    ).length,
    firstDraftCampaignId: firstIdForState('draft'),
    firstPausedCampaignId: firstIdForState('paused'),
    firstScheduledCampaignId: nextScheduledEntry?.campaign._id ?? null,
    firstRecurringCampaignId: firstIdForState('recurring'),
    nextScheduled: nextScheduledEntry
      ? {
          campaignId: nextScheduledEntry.campaign._id,
          timestamp: nextScheduledEntry.scheduledAt,
        }
      : null,
    lifecycleSourceVersion: CAMPAIGN_LIFECYCLE_SOURCE_VERSION,
  };
}

function buildOpaqueFingerprint(parts: Array<string | number>) {
  let hash = 0x811c9dc5;
  const input = parts.join('|');
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `v1_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

function buildCustomerSegmentFacts(args: {
  business: Doc<'businesses'>;
  memberships: Doc<'memberships'>[];
  programs: Doc<'loyaltyPrograms'>[];
  events: Doc<'events'>[];
  now: number;
}) {
  const activeProgramById = new Map<string, Doc<'loyaltyPrograms'>>();
  for (const program of args.programs) {
    if (
      program.isActive === true &&
      resolveProgramLifecycle(program) === 'active'
    ) {
      activeProgramById.set(String(program._id), program);
    }
  }

  const activeMemberships = args.memberships.filter(
    (membership) =>
      membership.isActive === true &&
      activeProgramById.has(String(membership.programId))
  );
  const thresholds = getRetentionThresholdsForBusiness(args.business);
  const nearRewardCustomerIds = new Set<string>();
  const nearRewardEvidence: string[] = [];
  for (const membership of activeMemberships) {
    const program = activeProgramById.get(String(membership.programId));
    if (
      !program ||
      !Number.isFinite(program.maxStamps) ||
      program.maxStamps <= 0 ||
      !Number.isFinite(membership.currentStamps)
    ) {
      continue;
    }
    const ratio = membership.currentStamps / program.maxStamps;
    if (
      ratio >= thresholds.closeToRewardRatio &&
      ratio < 1 &&
      membership.currentStamps >= 0
    ) {
      nearRewardCustomerIds.add(String(membership.userId));
      nearRewardEvidence.push(
        `${String(membership._id)}:${membership.currentStamps}:${program.maxStamps}`
      );
    }
  }

  const activeCustomerIds = new Set(
    activeMemberships.map((membership) => String(membership.userId))
  );
  const validStampEvents = args.events.filter(
    (
      event
    ): event is Doc<'events'> & {
      customerUserId: Id<'users'>;
    } =>
      event.type === 'STAMP_ADDED' &&
      event.customerUserId !== undefined &&
      activeCustomerIds.has(String(event.customerUserId)) &&
      Number.isFinite(event.createdAt) &&
      event.createdAt <= args.now
  );
  const stampHistoryByCustomer = new Map<string, number[]>();
  for (const event of validStampEvents) {
    const customerKey = String(event.customerUserId);
    const history = stampHistoryByCustomer.get(customerKey) ?? [];
    history.push(event.createdAt);
    stampHistoryByCustomer.set(customerKey, history);
  }
  const repeatVisitEvidenceCount = [
    ...stampHistoryByCustomer.values(),
  ].filter(
    (stampTimestamps) =>
      getCustomerExpectedCycleDays(stampTimestamps, args.now) !== null
  ).length;
  const inactive =
    repeatVisitEvidenceCount > 0
      ? knownFact(
          {
            count: buildDashboardLifecycleCountsFromStampEvents(
              validStampEvents,
              args.now
            ).atRiskCustomers,
            evidenceFingerprint: buildOpaqueFingerprint([
              repeatVisitEvidenceCount,
              validStampEvents.length,
              ...validStampEvents
                .map(
                  (event) =>
                    `${String(event.customerUserId)}:${event.createdAt}`
                )
                .sort(),
            ]),
          },
          args.now
        )
      : unknownFact('INSUFFICIENT_REPEAT_VISIT_EVIDENCE');

  return {
    nearReward: knownFact(
      {
        count: nearRewardCustomerIds.size,
        evidenceFingerprint: buildOpaqueFingerprint(
          nearRewardEvidence.sort()
        ),
      },
      args.now
    ),
    inactive,
  };
}

function buildProgramFacts(programs: Doc<'loyaltyPrograms'>[]) {
  const currentPrograms = programs
    .filter((program) => program.isActive === true)
    .sort((left, right) => {
      const createdDelta = left.createdAt - right.createdAt;
      return createdDelta !== 0
        ? createdDelta
        : String(left._id).localeCompare(String(right._id));
    });
  const active = currentPrograms.filter(
    (program) => resolveProgramLifecycle(program) === 'active'
  );
  const drafts = currentPrograms.filter(
    (program) => resolveProgramLifecycle(program) === 'draft'
  );
  const archived = currentPrograms.filter(
    (program) => resolveProgramLifecycle(program) === 'archived'
  );

  return {
    activeCount: active.length,
    draftCount: drafts.length,
    archivedCount: archived.length,
    firstActiveProgramId: active[0]?._id ?? null,
    firstDraftProgramId: drafts[0]?._id ?? null,
  };
}

function normalizeSubscriptionStatus(
  value: unknown
): 'active' | 'trialing' | 'past_due' | 'canceled' | 'inactive' | 'unknown' {
  if (
    value === 'active' ||
    value === 'trialing' ||
    value === 'past_due' ||
    value === 'canceled' ||
    value === 'inactive'
  ) {
    return value;
  }
  return 'unknown';
}

export async function loadBusinessRecommendationFacts(
  ctx: any,
  businessId: Id<'businesses'>,
  authorization: RecommendationActorAuthorization,
  generatedAt = Date.now()
) {
  const business = (await ctx.db.get(
    businessId
  )) as Doc<'businesses'> | null;
  if (!business || business.isActive !== true) {
    throw new Error('BUSINESS_INACTIVE');
  }

  const canViewCustomers = authorization.capabilities.access_customers === true;
  const canViewCampaigns = authorization.capabilities.access_campaigns === true;
  const canViewUsageQuota =
    authorization.capabilities.view_usage_quota === true;
  const canManageTeam = authorization.capabilities.manage_team === true;
  const canViewBillingState =
    authorization.capabilities.view_billing_state === true;

  const [
    programs,
    memberships,
    campaigns,
    campaignRuns,
    events,
    staffRows,
    pendingInvites,
    entitlements,
  ] = await Promise.all([
    ctx.db
      .query('loyaltyPrograms')
      .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
      .collect(),
    canViewCustomers
      ? ctx.db
          .query('memberships')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .collect()
      : Promise.resolve(null),
    canViewCampaigns
      ? ctx.db
          .query('campaigns')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .collect()
      : Promise.resolve(null),
    canViewCampaigns
      ? ctx.db
          .query('campaignRuns')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .collect()
      : Promise.resolve(null),
    canViewCustomers
      ? ctx.db
          .query('events')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .collect()
      : Promise.resolve(null),
    canManageTeam
      ? ctx.db
          .query('businessStaff')
          .withIndex('by_businessId', (q: any) =>
            q.eq('businessId', businessId)
          )
          .collect()
      : Promise.resolve(null),
    canManageTeam
      ? ctx.db
          .query('staffInvites')
          .withIndex('by_businessId_status', (q: any) =>
            q.eq('businessId', businessId).eq('status', 'pending')
          )
          .collect()
      : Promise.resolve(null),
    canViewUsageQuota || canViewBillingState
      ? getBusinessEntitlementsForBusinessId(ctx, businessId)
      : Promise.resolve(null),
  ]);

  const profileCompletion = computeBusinessProfileCompletion(business);
  const programFacts = buildProgramFacts(programs);
  const activeMemberships =
    memberships?.filter(
      (membership: Doc<'memberships'>) => membership.isActive === true
    ) ?? null;
  const uniqueActiveCustomerCount =
    activeMemberships === null
      ? null
      : new Set(
          activeMemberships.map((membership: Doc<'memberships'>) =>
            String(membership.userId)
          )
        ).size;
  const campaignFacts =
    campaigns !== null && campaignRuns !== null
      ? buildCampaignLifecycleFactValue({
          campaigns,
          campaignRuns,
          now: generatedAt,
        })
      : null;
  const segmentFacts =
    memberships !== null && events !== null
      ? buildCustomerSegmentFacts({
          business,
          memberships,
          programs,
          events,
          now: generatedAt,
        })
      : null;

  const activeNonOwnerStaffCount =
    staffRows?.filter(
      (staff: Doc<'businessStaff'>) =>
        staff.staffRole !== 'owner' &&
        getBusinessStaffStatus(staff) === 'active'
    ).length ?? null;
  const unexpiredPendingInvitationCount =
    pendingInvites?.filter(
      (invite: Doc<'staffInvites'>) => invite.expiresAt > generatedAt
    ).length ?? null;

  return {
    schemaVersion: RECOMMENDATION_FACTS_SCHEMA_VERSION,
    businessId,
    generatedAt,
    actor: {
      role: authorization.staffRole,
      capabilities: {
        accessDashboard: authorization.capabilities.access_dashboard,
        accessCustomers: authorization.capabilities.access_customers,
        accessCampaigns: authorization.capabilities.access_campaigns,
        createCampaigns: authorization.capabilities.create_campaigns,
        activateSendCampaigns:
          authorization.capabilities.activate_send_campaigns,
        viewUsageQuota: authorization.capabilities.view_usage_quota,
        viewBillingState: authorization.capabilities.view_billing_state,
        manageTeam: authorization.capabilities.manage_team,
        editLoyaltyCards: authorization.capabilities.edit_loyalty_cards,
        editBusinessProfile:
          authorization.capabilities.edit_business_profile,
      },
    },
    facts: {
      businessProfile: knownFact(
        {
          isComplete: profileCompletion.isComplete,
          missingFieldIds: profileCompletion.missingFields,
        },
        generatedAt
      ),
      address: knownFact(
        {
          isComplete: hasCompleteRecommendationAddress(business),
        },
        generatedAt
      ),
      logo: knownFact(
        {
          hasResolvableLogo: hasResolvableBusinessLogo(business),
        },
        generatedAt
      ),
      programs: knownFact(programFacts, generatedAt),
      customers:
        uniqueActiveCustomerCount === null
          ? restrictedFact('access_customers')
          : knownFact(
              { uniqueActiveCustomerCount },
              generatedAt
            ),
      campaigns:
        campaignFacts === null
          ? restrictedFact('access_campaigns')
          : knownFact(campaignFacts, generatedAt),
      campaignQuota:
        !canViewUsageQuota || entitlements === null
          ? restrictedFact('view_usage_quota')
          : knownFact(
              {
                campaignDefinitionUsage:
                  entitlements.usage.activeManagementCampaigns,
                campaignDefinitionLimit: entitlements.limits.maxCampaigns,
                remainingDefinitions: Math.max(
                  0,
                  entitlements.limits.maxCampaigns -
                    entitlements.usage.activeManagementCampaigns
                ),
                isAtOrAboveLimit:
                  entitlements.usage.activeManagementCampaigns >=
                  entitlements.limits.maxCampaigns,
              },
              generatedAt
            ),
      team:
        activeNonOwnerStaffCount === null ||
        unexpiredPendingInvitationCount === null
          ? restrictedFact('manage_team')
          : knownFact(
              {
                activeNonOwnerStaffCount,
                unexpiredPendingInvitationCount,
              },
              generatedAt
            ),
      subscription:
        !canViewBillingState || entitlements === null
          ? restrictedFact('view_billing_state')
          : knownFact(
              {
                plan: entitlements.plan,
                status: normalizeSubscriptionStatus(
                  entitlements.subscriptionStatus
                ),
              },
              generatedAt
            ),
      customerLifecycleSegments:
        segmentFacts === null
          ? {
              nearReward: restrictedFact('access_customers'),
              inactive: restrictedFact('access_customers'),
            }
          : segmentFacts,
    },
  };
}

export const getBusinessRecommendationFacts = query({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    const authorization = await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_dashboard'
    );
    return await loadBusinessRecommendationFacts(
      ctx,
      businessId,
      authorization
    );
  },
});
