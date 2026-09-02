import { ConvexError, v } from 'convex/values';
import type { Doc, Id } from './_generated/dataModel';
import { mutation, query } from './_generated/server';
import { computeBusinessProfileCompletion } from './business';
import {
  buildDashboardLifecycleCountsFromStampEvents,
  getCustomerExpectedCycleDays,
} from './customerLifecycle';
import {
  getBusinessEntitlementsForBusinessId,
  type BusinessEntitlements,
} from './entitlements';
import {
  getBusinessStaffStatus,
  requireActorHasBusinessCapability,
} from './guards';
import {
  CAMPAIGN_LIFECYCLE_SOURCE_VERSION,
  classifyCampaignState,
  type CampaignProductState,
} from './lib/campaignState';
import {
  buildBusinessRecommendationCatalog,
  buildRecommendationEvidenceFingerprint,
  getRecommendationAccessDecision,
  RECOMMENDATION_GUIDE_IDS,
} from './lib/recommendationCatalog';
import { isRecommendationCompletionSatisfied } from './lib/recommendationGuideCompletion';
import type {
  BusinessRecommendation,
  RecommendationCatalogInput,
  RecommendationGuideId,
  RecommendationStableId,
} from './lib/recommendationCatalog';
import type {
  BusinessCapability,
  BusinessCapabilityMap,
  StaffRole,
} from './lib/staffPermissions';
import { getRetentionThresholdsForBusiness } from './lib/customerIntelligence';
import { resolveProgramLifecycle } from './loyaltyPrograms';
import {
  getSmartManagerInteractionPolicy,
  loadActiveSmartManagerPolicy,
  type SmartManagerPolicyConfig,
} from './lib/smartManagerPolicy';

const RECOMMENDATION_FACTS_SCHEMA_VERSION = 1;
const DAY_MS = 24 * 60 * 60 * 1000;
const GUIDE_SESSION_TTL_MS = DAY_MS;

const recommendationStableIdValidator = v.union(
  v.literal('subscription.action_required'),
  v.literal('setup.address.resolve'),
  v.literal('setup.profile.complete'),
  v.literal('program.publish_first'),
  v.literal('program.publish_draft'),
  v.literal('campaign.create_first'),
  v.literal('campaign.publish_draft'),
  v.literal('campaign.resume_paused'),
  v.literal('campaign.next_scheduled'),
  v.literal('retention.reengage_inactive'),
  v.literal('growth.near_reward'),
  v.literal('team.pending_invitations'),
  v.literal('subscription.quota_near')
);

const recommendationGuideIdValidator = v.union(
  v.literal('subscription-recover'),
  v.literal('address-resolve'),
  v.literal('profile-complete'),
  v.literal('program-create'),
  v.literal('program-publish'),
  v.literal('campaign-create'),
  v.literal('campaign-publish'),
  v.literal('campaign-resume'),
  v.literal('campaign-schedule-review'),
  v.literal('inactive-review'),
  v.literal('near-reward'),
  v.literal('team-pending'),
  v.literal('quota-review')
);

type InteractionState =
  | 'dismissed'
  | 'snoozed'
  | 'completed'
  | 'invalidated';

type GuideStatusState = 'active' | 'completed' | 'invalidated';

export function getRecommendationInteractionPolicy(
  stableId: RecommendationStableId,
  action: 'dismiss' | 'snooze',
  now: number,
  policy?: SmartManagerPolicyConfig
) {
  return getSmartManagerInteractionPolicy(stableId, action, now, policy);
}

function publicRecommendationError(): never {
  throw new ConvexError({
    code: 'RECOMMENDATION_NOT_ACTIONABLE',
  });
}

function requireValidRecommendationGuide(
  stableId: RecommendationStableId,
  guideId: RecommendationGuideId
) {
  if (RECOMMENDATION_GUIDE_IDS[stableId] !== guideId) {
    publicRecommendationError();
  }
}

function candidateKey(recommendation: {
  stableId: string;
  evidenceFingerprint: string;
}) {
  return `${recommendation.stableId}|${recommendation.evidenceFingerprint}`;
}

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

type RecommendationGuideAuthorization = RecommendationActorAuthorization & {
  actor: { _id: Id<'users'> };
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

export type BusinessRecommendationFactSourceBundle = {
  business: Doc<'businesses'>;
  programs: Doc<'loyaltyPrograms'>[] | null;
  memberships: Doc<'memberships'>[] | null;
  campaigns: Doc<'campaigns'>[] | null;
  campaignRuns: Doc<'campaignRuns'>[] | null;
  events: Doc<'events'>[] | null;
  staffRows: Doc<'businessStaff'>[] | null;
  pendingInvites: Doc<'staffInvites'>[] | null;
  entitlements: {
    plan: BusinessEntitlements['plan'];
    subscriptionStatus: BusinessEntitlements['subscriptionStatus'];
    limits: Pick<BusinessEntitlements['limits'], 'maxCampaigns'>;
    usage: Pick<
      BusinessEntitlements['usage'],
      'activeManagementCampaigns'
    >;
  } | null;
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

export function isCanonicalRecommendationEventEffective(event: {
  revertsEventId?: unknown;
  reversalEventId?: unknown;
}) {
  return event.revertsEventId === undefined && event.reversalEventId === undefined;
}

export function buildCustomerSegmentFacts(args: {
  business: Doc<'businesses'>;
  memberships: Doc<'memberships'>[];
  programs: Doc<'loyaltyPrograms'>[];
  events: Doc<'events'>[];
  now: number;
  excludeReversedEvents?: boolean;
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
      (!args.excludeReversedEvents ||
        isCanonicalRecommendationEventEffective(event)) &&
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
  generatedAt = Date.now(),
  options?: {
    excludeReversedEvents?: boolean;
    programsSourceAvailable?: boolean;
    sourceBundle?: BusinessRecommendationFactSourceBundle;
  }
) {
  const business =
    options?.sourceBundle?.business ??
    ((await ctx.db.get(businessId)) as Doc<'businesses'> | null);
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

  const sourceBundle = options?.sourceBundle;
  const loadedSources: Omit<BusinessRecommendationFactSourceBundle, 'business'> =
    sourceBundle
      ? {
          programs: sourceBundle.programs,
          memberships: canViewCustomers ? sourceBundle.memberships : null,
          campaigns: canViewCampaigns ? sourceBundle.campaigns : null,
          campaignRuns: canViewCampaigns ? sourceBundle.campaignRuns : null,
          events: canViewCustomers ? sourceBundle.events : null,
          staffRows: canManageTeam ? sourceBundle.staffRows : null,
          pendingInvites: canManageTeam ? sourceBundle.pendingInvites : null,
          entitlements:
            canViewUsageQuota || canViewBillingState
              ? sourceBundle.entitlements
              : null,
        }
      : await (async () => {
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
            options?.programsSourceAvailable === false
              ? Promise.resolve(null)
              : ctx.db
                  .query('loyaltyPrograms')
                  .withIndex('by_businessId', (q: any) =>
                    q.eq('businessId', businessId)
                  )
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
          return {
            programs,
            memberships,
            campaigns,
            campaignRuns,
            events,
            staffRows,
            pendingInvites,
            entitlements,
          };
        })();
  const {
    programs,
    memberships,
    campaigns,
    campaignRuns,
    events,
    staffRows,
    pendingInvites,
    entitlements,
  } = loadedSources;

  const profileCompletion = computeBusinessProfileCompletion(business);
  const programFacts = programs === null ? null : buildProgramFacts(programs);
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
    programs !== null && memberships !== null && events !== null
      ? buildCustomerSegmentFacts({
          business,
          memberships,
          programs,
          events,
          now: generatedAt,
          excludeReversedEvents: options?.excludeReversedEvents,
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
        editCampaigns: authorization.capabilities.edit_campaigns,
        activateSendCampaigns:
          authorization.capabilities.activate_send_campaigns,
        viewUsageQuota: authorization.capabilities.view_usage_quota,
        viewBillingState: authorization.capabilities.view_billing_state,
        manageSubscription:
          authorization.capabilities.manage_subscription,
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
      programs:
        programFacts === null
          ? {
              state: 'unknown' as const,
              reasonCode: 'BOUNDED_SOURCE_LIMIT_EXCEEDED',
            }
          : knownFact(programFacts, generatedAt),
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

async function loadEligibleRecommendations(
  ctx: any,
  businessId: Id<'businesses'>,
  authorization: RecommendationActorAuthorization,
  generatedAt: number
) {
  const facts = await loadBusinessRecommendationFacts(
    ctx,
    businessId,
    authorization,
    generatedAt
  );
  const catalogInput: RecommendationCatalogInput = {
    ...facts,
    businessId: String(facts.businessId),
  };
  const catalog = buildBusinessRecommendationCatalog(catalogInput, {
    includeAllEligible: true,
  });
  return {
    facts,
    catalogInput,
    catalog,
    allEligible:
      'allEligible' in catalog
        ? (catalog.allEligible as BusinessRecommendation[])
        : [],
  };
}

async function loadVisibleRecommendationResponse(
  ctx: any,
  businessId: Id<'businesses'>,
  authorization: RecommendationGuideAuthorization,
  generatedAt: number
) {
  const facts = await loadBusinessRecommendationFacts(
    ctx,
    businessId,
    authorization,
    generatedAt
  );
  const interactions = await ctx.db
    .query('recommendationInteractions')
    .withIndex('by_actor_business', (q: any) =>
      q
        .eq('actorUserId', authorization.actor._id)
        .eq('businessId', businessId)
    )
    .collect();
  const suppressEvidence = new Set<string>();
  for (const interaction of interactions) {
    if (
      interaction.hiddenUntil !== undefined &&
      interaction.hiddenUntil <= generatedAt
    ) {
      continue;
    }
    suppressEvidence.add(candidateKey(interaction));
  }
  return buildBusinessRecommendationCatalog(
    {
      ...facts,
      businessId: String(facts.businessId),
    },
    { suppressEvidence }
  );
}

async function upsertRecommendationInteraction(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    actorUserId: Id<'users'>;
    stableId: RecommendationStableId;
    evidenceFingerprint: string;
    interactionState: InteractionState;
    hiddenUntil?: number;
    reasonCode:
      | 'USER_DISMISSED'
      | 'USER_SNOOZED'
      | 'SERVER_COMPLETED'
      | 'EVIDENCE_CHANGED'
      | 'TARGET_MISSING'
      | 'TARGET_INCONSISTENT'
      | 'BUSINESS_MISMATCH'
      | 'PERMISSION_CHANGED'
      | 'NO_LONGER_APPLICABLE';
    policyVersion?: string;
    policyHash?: string;
    now: number;
  }
) {
  const existing = await ctx.db
    .query('recommendationInteractions')
    .withIndex('by_actor_business_stableId_fingerprint', (q: any) =>
      q
        .eq('actorUserId', args.actorUserId)
        .eq('businessId', args.businessId)
        .eq('stableId', args.stableId)
        .eq('evidenceFingerprint', args.evidenceFingerprint)
    )
    .first();
  const values = {
    interactionState: args.interactionState,
    hiddenUntil: args.hiddenUntil,
    reasonCode: args.reasonCode,
    ...(args.policyVersion !== undefined && args.policyHash !== undefined
      ? {
          policyVersion: args.policyVersion,
          policyHash: args.policyHash,
        }
      : {}),
    updatedAt: args.now,
    completedAt:
      args.interactionState === 'completed' ? args.now : undefined,
    invalidatedAt:
      args.interactionState === 'invalidated' ? args.now : undefined,
  };
  if (existing) {
    await ctx.db.patch(existing._id, values);
    return existing._id;
  }
  return await ctx.db.insert('recommendationInteractions', {
    businessId: args.businessId,
    actorUserId: args.actorUserId,
    stableId: args.stableId,
    evidenceFingerprint: args.evidenceFingerprint,
    createdAt: args.now,
    ...values,
  });
}

async function persistUserInteraction(
  ctx: any,
  args: {
    businessId: Id<'businesses'>;
    stableId: RecommendationStableId;
    evidenceFingerprint: string;
    action: 'dismiss' | 'snooze';
  }
) {
  const authorization = await requireActorHasBusinessCapability(
    ctx,
    args.businessId,
    'access_dashboard'
  );
  const now = Date.now();
  const { allEligible } = await loadEligibleRecommendations(
    ctx,
    args.businessId,
    authorization,
    now
  );
  const current = allEligible.find(
    (recommendation) =>
      recommendation.stableId === args.stableId &&
      recommendation.evidenceFingerprint === args.evidenceFingerprint
  );
  if (!current) {
    publicRecommendationError();
  }
  const activePolicy = await loadActiveSmartManagerPolicy(ctx, now);
  const policy = getRecommendationInteractionPolicy(
    args.stableId,
    args.action,
    now,
    activePolicy.config
  );
  await upsertRecommendationInteraction(ctx, {
    businessId: args.businessId,
    actorUserId: authorization.actor._id,
    stableId: args.stableId,
    evidenceFingerprint: args.evidenceFingerprint,
    interactionState:
      args.action === 'dismiss' ? 'dismissed' : 'snoozed',
    hiddenUntil: policy.hiddenUntil,
    reasonCode: policy.reasonCode,
    policyVersion: activePolicy.version,
    policyHash: activePolicy.policyHash,
    now,
  });
  return {
    ok: true as const,
    reasonCode: policy.reasonCode,
    hiddenUntil: policy.hiddenUntil ?? null,
  };
}

export const dismissBusinessRecommendation = mutation({
  args: {
    businessId: v.id('businesses'),
    stableId: recommendationStableIdValidator,
    evidenceFingerprint: v.string(),
  },
  handler: async (ctx, args) =>
    await persistUserInteraction(ctx, { ...args, action: 'dismiss' }),
});

export const snoozeBusinessRecommendation = mutation({
  args: {
    businessId: v.id('businesses'),
    stableId: recommendationStableIdValidator,
    evidenceFingerprint: v.string(),
  },
  handler: async (ctx, args) =>
    await persistUserInteraction(ctx, { ...args, action: 'snooze' }),
});

type RecommendationGuideEntityKind = 'program' | 'campaign';

function getRecommendationGuideEntityKind(
  stableId: RecommendationStableId
): RecommendationGuideEntityKind | undefined {
  if (stableId === 'program.publish_draft') {
    return 'program';
  }
  if (
    stableId === 'campaign.publish_draft' ||
    stableId === 'campaign.resume_paused' ||
    stableId === 'campaign.next_scheduled'
  ) {
    return 'campaign';
  }
  return undefined;
}

function deriveServerRecommendationEntityBinding(
  recommendation: BusinessRecommendation
) {
  const entityKind = getRecommendationGuideEntityKind(
    recommendation.stableId
  );
  if (!entityKind) {
    return {};
  }
  const entityId =
    typeof recommendation.entityId === 'string'
      ? recommendation.entityId.trim()
      : '';
  if (!entityId) {
    publicRecommendationError();
  }
  if (
    (entityKind === 'program' &&
      (recommendation.action.type !== 'open_program' ||
        String(recommendation.action.programId) !== entityId)) ||
    (entityKind === 'campaign' &&
      (recommendation.action.type !== 'open_campaign' ||
        String(recommendation.action.campaignId) !== entityId))
  ) {
    publicRecommendationError();
  }
  return { entityId, entityKind };
}

function publicGuideSessionResult(session: {
  _id: Id<'recommendationGuideSessions'>;
  businessId: Id<'businesses'>;
  stableId: RecommendationStableId;
  guideId: RecommendationGuideId;
  evidenceFingerprint: string;
  entityId?: string;
  expiresAt: number;
}) {
  return {
    guideSessionId: session._id,
    businessId: session.businessId,
    stableId: session.stableId,
    guideId: session.guideId,
    evidenceFingerprint: session.evidenceFingerprint,
    ...(session.entityId ? { entityId: session.entityId } : {}),
    expiresAt: session.expiresAt,
  };
}

export const startBusinessRecommendationGuide = mutation({
  args: {
    businessId: v.id('businesses'),
    stableId: recommendationStableIdValidator,
    guideId: recommendationGuideIdValidator,
  },
  handler: async (ctx, args) => {
    const authorization = await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'access_dashboard'
    );
    requireValidRecommendationGuide(args.stableId, args.guideId);
    const now = Date.now();
    const response = await loadVisibleRecommendationResponse(
      ctx,
      args.businessId,
      authorization,
      now
    );
    const recommendation = [response.primary, ...response.secondary].find(
      (candidate) =>
        candidate?.stableId === args.stableId &&
        candidate.guideId === args.guideId
    );
    if (!recommendation) {
      publicRecommendationError();
    }
    const entityBinding =
      deriveServerRecommendationEntityBinding(recommendation);
    const sessions = await ctx.db
      .query('recommendationGuideSessions')
      .withIndex('by_actor_business_stableId', (q: any) =>
        q
          .eq('actorUserId', authorization.actor._id)
          .eq('businessId', args.businessId)
          .eq('stableId', args.stableId)
      )
      .collect();
    const reusable = sessions.find(
      (session: any) =>
        session.expiresAt > now &&
        session.guideId === args.guideId &&
        session.evidenceFingerprint ===
          recommendation.evidenceFingerprint &&
        (session.entityId ?? undefined) ===
          (entityBinding.entityId ?? undefined) &&
        (session.entityKind ?? undefined) ===
          (entityBinding.entityKind ?? undefined)
    );
    if (reusable) {
      return publicGuideSessionResult(reusable);
    }
    const expiresAt = now + GUIDE_SESSION_TTL_MS;
    const guideSessionId = await ctx.db.insert(
      'recommendationGuideSessions',
      {
        businessId: args.businessId,
        actorUserId: authorization.actor._id,
        stableId: recommendation.stableId,
        guideId: recommendation.guideId,
        evidenceFingerprint: recommendation.evidenceFingerprint,
        ...entityBinding,
        issuedAt: now,
        expiresAt,
      }
    );
    return publicGuideSessionResult({
      _id: guideSessionId,
      businessId: args.businessId,
      stableId: recommendation.stableId,
      guideId: recommendation.guideId,
      evidenceFingerprint: recommendation.evidenceFingerprint,
      ...entityBinding,
      expiresAt,
    });
  },
});

async function loadBoundProgram(
  ctx: any,
  businessId: Id<'businesses'>,
  entityId?: string
) {
  if (!entityId) {
    return { state: 'missing' as const };
  }
  const programId = ctx.db.normalizeId('loyaltyPrograms', entityId);
  if (!programId) {
    return { state: 'missing' as const };
  }
  const program = await ctx.db.get(programId);
  if (!program) {
    return { state: 'missing' as const };
  }
  if (String(program.businessId) !== String(businessId)) {
    return { state: 'foreign' as const };
  }
  return { state: 'valid' as const, value: program };
}

async function loadBoundCampaign(
  ctx: any,
  businessId: Id<'businesses'>,
  entityId?: string
) {
  if (!entityId) {
    return { state: 'missing' as const };
  }
  const campaignId = ctx.db.normalizeId('campaigns', entityId);
  if (!campaignId) {
    return { state: 'missing' as const };
  }
  const campaign = await ctx.db.get(campaignId);
  if (!campaign) {
    return { state: 'missing' as const };
  }
  if (String(campaign.businessId) !== String(businessId)) {
    return { state: 'foreign' as const };
  }
  return { state: 'valid' as const, value: campaign };
}

type GuideEvaluation =
  | {
      state: GuideStatusState;
      reasonCode:
        | 'ACTIONABLE'
        | 'SERVER_COMPLETED'
        | 'EVIDENCE_CHANGED'
        | 'TARGET_MISSING'
        | 'TARGET_INCONSISTENT'
        | 'BUSINESS_MISMATCH'
        | 'NO_LONGER_APPLICABLE';
      observedAt: number;
    }
  | {
      state: 'restricted';
      reasonCode: 'PERMISSION_CHANGED';
      observedAt: number;
    };

type SessionBackedGuideArgs = {
  guideSessionId: Id<'recommendationGuideSessions'>;
  businessId: Id<'businesses'>;
  stableId?: RecommendationStableId;
  guideId?: RecommendationGuideId;
  evidenceFingerprint?: string;
  entityId?: string;
};

type ValidatedGuideSession = {
  session: {
    _id: Id<'recommendationGuideSessions'>;
    businessId: Id<'businesses'>;
    actorUserId: Id<'users'>;
    stableId: RecommendationStableId;
    guideId: RecommendationGuideId;
    evidenceFingerprint: string;
    entityId?: string;
    entityKind?: RecommendationGuideEntityKind;
    issuedAt: number;
    expiresAt: number;
  };
  exactEntity?:
    | { kind: 'program'; value: any }
    | { kind: 'campaign'; value: any };
  entityEvaluation?: GuideEvaluation;
};

function optionalBindingConflicts(
  supplied: string | undefined,
  authoritative: string | undefined
) {
  return supplied !== undefined && supplied !== authoritative;
}

async function loadValidatedGuideSession(
  ctx: any,
  args: SessionBackedGuideArgs,
  authorization: RecommendationGuideAuthorization,
  now: number
): Promise<ValidatedGuideSession> {
  const rawSession = await ctx.db.get(args.guideSessionId);
  if (
    !rawSession ||
    String(rawSession._id) !== String(args.guideSessionId) ||
    String(rawSession.actorUserId) !== String(authorization.actor._id) ||
    String(rawSession.businessId) !== String(args.businessId) ||
    !Number.isFinite(rawSession.expiresAt) ||
    rawSession.expiresAt <= now
  ) {
    publicRecommendationError();
  }
  const session = rawSession as ValidatedGuideSession['session'];
  requireValidRecommendationGuide(session.stableId, session.guideId);
  if (
    optionalBindingConflicts(args.stableId, session.stableId) ||
    optionalBindingConflicts(args.guideId, session.guideId) ||
    optionalBindingConflicts(
      args.evidenceFingerprint,
      session.evidenceFingerprint
    ) ||
    optionalBindingConflicts(args.entityId, session.entityId)
  ) {
    publicRecommendationError();
  }
  const expectedEntityKind = getRecommendationGuideEntityKind(
    session.stableId
  );
  if (!expectedEntityKind) {
    if (session.entityId !== undefined || session.entityKind !== undefined) {
      publicRecommendationError();
    }
    return { session };
  }
  if (session.entityKind !== expectedEntityKind) {
    publicRecommendationError();
  }
  if (typeof session.entityId !== 'string' || !session.entityId.trim()) {
    return {
      session,
      entityEvaluation: {
        state: 'invalidated',
        reasonCode: 'TARGET_MISSING',
        observedAt: now,
      },
    };
  }
  const loaded =
    expectedEntityKind === 'program'
      ? await loadBoundProgram(ctx, args.businessId, session.entityId)
      : await loadBoundCampaign(ctx, args.businessId, session.entityId);
  if (loaded.state === 'missing') {
    return {
      session,
      entityEvaluation: {
        state: 'invalidated',
        reasonCode: 'TARGET_MISSING',
        observedAt: now,
      },
    };
  }
  if (loaded.state === 'foreign') {
    return {
      session,
      entityEvaluation: {
        state: 'invalidated',
        reasonCode: 'BUSINESS_MISMATCH',
        observedAt: now,
      },
    };
  }
  return {
    session,
    exactEntity: {
      kind: expectedEntityKind,
      value: loaded.value,
    } as ValidatedGuideSession['exactEntity'],
  };
}

async function evaluateRecommendationGuide(
  ctx: any,
  binding: ValidatedGuideSession,
  authorization: RecommendationActorAuthorization,
  now: number
): Promise<GuideEvaluation> {
  if (binding.entityEvaluation) {
    return binding.entityEvaluation;
  }
  const args = binding.session;
  const {
    facts,
    catalogInput,
    allEligible,
  } = await loadEligibleRecommendations(
    ctx,
    args.businessId,
    authorization,
    now
  );
  const access = getRecommendationAccessDecision(
    catalogInput,
    args.stableId
  );
  if (access.state === 'restricted') {
    return {
      state: 'restricted',
      reasonCode: 'PERMISSION_CHANGED',
      observedAt: now,
    };
  }
  const currentForStableId = allEligible.find(
    (recommendation) => recommendation.stableId === args.stableId
  );
  if (
    currentForStableId?.evidenceFingerprint === args.evidenceFingerprint
  ) {
    const expectedEntityKind = getRecommendationGuideEntityKind(
      args.stableId
    );
    if (
      expectedEntityKind &&
      String(currentForStableId.entityId ?? '') !==
        String(args.entityId ?? '')
    ) {
      return {
        state: 'invalidated',
        reasonCode: 'TARGET_INCONSISTENT',
        observedAt: now,
      };
    }
    return { state: 'active', reasonCode: 'ACTIONABLE', observedAt: now };
  }

  const values = facts.facts;
  const completionSnapshot = {
    subscriptionStatus:
      values.subscription.state === 'known'
        ? values.subscription.value.status
        : undefined,
    addressComplete:
      values.address.state === 'known'
        ? values.address.value.isComplete
        : undefined,
    profileComplete:
      values.businessProfile.state === 'known'
        ? values.businessProfile.value.isComplete
        : undefined,
    activeProgramCount:
      values.programs.state === 'known'
        ? values.programs.value.activeCount
        : undefined,
    totalNonarchivedCampaigns:
      values.campaigns.state === 'known'
        ? values.campaigns.value.totalNonarchivedCampaigns
        : undefined,
    inactiveCustomerCount:
      values.customerLifecycleSegments.inactive.state === 'known'
        ? values.customerLifecycleSegments.inactive.value.count
        : undefined,
    nearRewardCustomerCount:
      values.customerLifecycleSegments.nearReward.state === 'known'
        ? values.customerLifecycleSegments.nearReward.value.count
        : undefined,
    pendingInvitationCount:
      values.team.state === 'known'
        ? values.team.value.unexpiredPendingInvitationCount
        : undefined,
    campaignQuotaUsage:
      values.campaignQuota.state === 'known'
        ? values.campaignQuota.value.campaignDefinitionUsage
        : undefined,
    campaignQuotaLimit:
      values.campaignQuota.state === 'known'
        ? values.campaignQuota.value.campaignDefinitionLimit
        : undefined,
  };
  if (
    isRecommendationCompletionSatisfied(
      args.stableId,
      completionSnapshot
    )
  ) {
    return {
      state: 'completed',
      reasonCode: 'SERVER_COMPLETED',
      observedAt: now,
    };
  }
  switch (args.stableId) {
    case 'subscription.action_required':
    case 'setup.address.resolve':
    case 'setup.profile.complete':
    case 'program.publish_first':
    case 'campaign.create_first':
    case 'retention.reengage_inactive':
    case 'growth.near_reward':
    case 'team.pending_invitations':
    case 'subscription.quota_near':
      break;
    case 'program.publish_draft': {
      if (binding.exactEntity?.kind !== 'program') {
        return {
          state: 'invalidated',
          reasonCode: 'TARGET_MISSING',
          observedAt: now,
        };
      }
      const program = binding.exactEntity.value;
      const programLifecycle = resolveProgramLifecycle(program);
      if (
        program.isActive === true &&
        program.isArchived !== true &&
        programLifecycle === 'active'
      ) {
        return {
          state: 'completed',
          reasonCode: 'SERVER_COMPLETED',
          observedAt: now,
        };
      }
      return {
        state: 'invalidated',
        reasonCode: 'TARGET_INCONSISTENT',
        observedAt: now,
      };
    }
    case 'campaign.publish_draft':
    case 'campaign.resume_paused':
    case 'campaign.next_scheduled': {
      if (binding.exactEntity?.kind !== 'campaign') {
        return {
          state: 'invalidated',
          reasonCode: 'TARGET_MISSING',
          observedAt: now,
        };
      }
      const campaign = binding.exactEntity.value;
      const run = await ctx.db
        .query('campaignRuns')
        .withIndex('by_campaignId', (q: any) =>
          q.eq('campaignId', campaign._id)
        )
        .first();
      const campaignClassification = classifyCampaignState(campaign, {
        now,
        hasPersistedCompletionEvidence: Boolean(run),
      });
      const state = campaignClassification.state;
      const exactScheduledFingerprint =
        args.stableId === 'campaign.next_scheduled' &&
        state === 'scheduled' &&
        typeof campaignClassification.scheduledAt === 'number'
          ? buildRecommendationEvidenceFingerprint(
              'campaign.next_scheduled',
              facts.schemaVersion,
              campaignClassification.sourceVersion,
              String(campaign._id),
              campaignClassification.scheduledAt
            )
          : null;
      if (
        args.stableId === 'campaign.next_scheduled' &&
        exactScheduledFingerprint === args.evidenceFingerprint
      ) {
        return {
          state: 'active',
          reasonCode: 'ACTIONABLE',
          observedAt: now,
        };
      }
      const scheduledEvidenceChanged =
        args.stableId === 'campaign.next_scheduled' &&
        exactScheduledFingerprint !== null &&
        exactScheduledFingerprint !== args.evidenceFingerprint;
      if (
        isRecommendationCompletionSatisfied(args.stableId, {
          campaignLifecycle: state,
          scheduledEvidenceChanged,
        })
      ) {
        return {
          state: 'completed',
          reasonCode: scheduledEvidenceChanged
            ? 'EVIDENCE_CHANGED'
            : 'SERVER_COMPLETED',
          observedAt: now,
        };
      }
      if (state === 'inconsistent') {
        return {
          state: 'invalidated',
          reasonCode: 'TARGET_INCONSISTENT',
          observedAt: now,
        };
      }
      break;
    }
  }
  return {
    state: 'invalidated',
    reasonCode:
      currentForStableId &&
      currentForStableId.evidenceFingerprint !== args.evidenceFingerprint
        ? 'EVIDENCE_CHANGED'
        : 'NO_LONGER_APPLICABLE',
    observedAt: now,
  };
}

export const getBusinessRecommendationGuideStatus = query({
  args: {
    guideSessionId: v.id('recommendationGuideSessions'),
    businessId: v.id('businesses'),
    stableId: v.optional(recommendationStableIdValidator),
    guideId: v.optional(recommendationGuideIdValidator),
    evidenceFingerprint: v.optional(v.string()),
    entityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const now = Date.now();
    const authorization = await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'access_dashboard'
    );
    const binding = await loadValidatedGuideSession(
      ctx,
      args,
      authorization,
      now
    );
    try {
      return await evaluateRecommendationGuide(
        ctx,
        binding,
        authorization,
        now
      );
    } catch {
      return {
        state: 'invalidated' as const,
        reasonCode: 'NO_LONGER_APPLICABLE' as const,
        observedAt: now,
      };
    }
  },
});

export const acknowledgeBusinessRecommendationGuideStatus = mutation({
  args: {
    guideSessionId: v.id('recommendationGuideSessions'),
    businessId: v.id('businesses'),
    stableId: v.optional(recommendationStableIdValidator),
    guideId: v.optional(recommendationGuideIdValidator),
    evidenceFingerprint: v.optional(v.string()),
    entityId: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const authorization = await requireActorHasBusinessCapability(
      ctx,
      args.businessId,
      'access_dashboard'
    );
    const now = Date.now();
    const binding = await loadValidatedGuideSession(
      ctx,
      args,
      authorization,
      now
    );
    let evaluation: GuideEvaluation;
    try {
      evaluation = await evaluateRecommendationGuide(
        ctx,
        binding,
        authorization,
        now
      );
    } catch {
      publicRecommendationError();
    }
    if (
      evaluation.state !== 'completed' &&
      evaluation.state !== 'invalidated'
    ) {
      publicRecommendationError();
    }
    const reasonCode =
      evaluation.reasonCode === 'SERVER_COMPLETED'
        ? 'SERVER_COMPLETED'
        : evaluation.reasonCode === 'EVIDENCE_CHANGED'
          ? 'EVIDENCE_CHANGED'
          : evaluation.reasonCode === 'TARGET_MISSING'
            ? 'TARGET_MISSING'
            : evaluation.reasonCode === 'TARGET_INCONSISTENT'
              ? 'TARGET_INCONSISTENT'
              : evaluation.reasonCode === 'BUSINESS_MISMATCH'
                ? 'BUSINESS_MISMATCH'
                : 'NO_LONGER_APPLICABLE';
    await upsertRecommendationInteraction(ctx, {
      businessId: binding.session.businessId,
      actorUserId: authorization.actor._id,
      stableId: binding.session.stableId,
      evidenceFingerprint: binding.session.evidenceFingerprint,
      interactionState: evaluation.state,
      reasonCode,
      now,
    });
    return {
      ok: true as const,
      state: evaluation.state,
      reasonCode,
      acknowledgedAt: now,
    };
  },
});

export const getBusinessRecommendations = query({
  args: {
    businessId: v.id('businesses'),
  },
  handler: async (ctx, { businessId }) => {
    const authorization = await requireActorHasBusinessCapability(
      ctx,
      businessId,
      'access_dashboard'
    );
    const generatedAt = Date.now();
    return await loadVisibleRecommendationResponse(
      ctx,
      businessId,
      authorization,
      generatedAt
    );
  },
});
