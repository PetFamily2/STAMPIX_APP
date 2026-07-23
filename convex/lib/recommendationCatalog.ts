export type RecommendationPriority = 0 | 1 | 2 | 3;

export type RecommendationCategory =
  | 'operational'
  | 'setup'
  | 'retention'
  | 'growth'
  | 'informational';

export type RecommendationTone =
  | 'blocker'
  | 'setup'
  | 'growth'
  | 'retention'
  | 'operational'
  | 'informational';

export type RecommendationAction =
  | { type: 'open_business_address' }
  | { type: 'open_business_profile'; fieldId?: string }
  | { type: 'open_programs' }
  | { type: 'open_program'; programId: string }
  | { type: 'open_campaigns' }
  | { type: 'open_campaign'; campaignId: string }
  | {
      type: 'open_customers_segment';
      segment: 'at_risk' | 'near_reward';
    }
  | { type: 'open_team_pending' }
  | { type: 'open_subscription'; limitKey?: 'campaigns' };

export type RecommendationStableId =
  | 'subscription.action_required'
  | 'setup.address.resolve'
  | 'setup.profile.complete'
  | 'program.publish_first'
  | 'program.publish_draft'
  | 'campaign.create_first'
  | 'campaign.publish_draft'
  | 'campaign.resume_paused'
  | 'campaign.next_scheduled'
  | 'retention.reengage_inactive'
  | 'growth.near_reward'
  | 'team.pending_invitations'
  | 'subscription.quota_near';

export type BusinessRecommendation = {
  stableId: RecommendationStableId;
  category: RecommendationCategory;
  priority: RecommendationPriority;
  placement: 'primary' | 'secondary';
  title: string;
  reason: string;
  ctaLabel: string;
  action: RecommendationAction;
  evidenceFingerprint: string;
  evidenceObservedAt: number;
  entityId?: string;
  count?: number;
  tone: RecommendationTone;
  guideId: RecommendationGuideId;
};

export type RecommendationGuideId =
  | 'subscription-recover'
  | 'address-resolve'
  | 'profile-complete'
  | 'program-create'
  | 'program-publish'
  | 'campaign-create'
  | 'campaign-publish'
  | 'campaign-resume'
  | 'campaign-schedule-review'
  | 'inactive-review'
  | 'near-reward'
  | 'team-pending'
  | 'quota-review';

type KnownFact<T> = {
  state: 'known';
  value: T;
  observedAt: number;
};

type UnavailableFact = {
  state: 'unknown' | 'restricted';
};

type Fact<T> = KnownFact<T> | UnavailableFact;

export type RecommendationCatalogInput = {
  schemaVersion: number;
  businessId: string;
  generatedAt: number;
  actor: {
    capabilities: {
      accessCustomers: boolean;
      accessCampaigns: boolean;
      createCampaigns: boolean;
      editCampaigns: boolean;
      activateSendCampaigns: boolean;
      manageSubscription: boolean;
      manageTeam: boolean;
      editLoyaltyCards: boolean;
      editBusinessProfile: boolean;
    };
  };
  facts: {
    businessProfile: Fact<{
      isComplete: boolean;
      missingFieldIds: string[];
    }>;
    address: Fact<{ isComplete: boolean }>;
    programs: Fact<{
      activeCount: number;
      draftCount: number;
      firstDraftProgramId: unknown | null;
    }>;
    customers: Fact<{ uniqueActiveCustomerCount: number }>;
    campaigns: Fact<{
      totalNonarchivedCampaigns: number;
      draftCount: number;
      scheduledCount: number;
      recurringCount: number;
      pausedCount: number;
      inconsistentCount: number;
      meaningfullyActiveCount: number;
      firstDraftCampaignId: unknown | null;
      firstPausedCampaignId: unknown | null;
      nextScheduled: {
        campaignId: unknown;
        timestamp: number;
      } | null;
      lifecycleSourceVersion: string;
    }>;
    campaignQuota: Fact<{
      campaignDefinitionUsage: number;
      campaignDefinitionLimit: number;
      isAtOrAboveLimit: boolean;
    }>;
    team: Fact<{ unexpiredPendingInvitationCount: number }>;
    subscription: Fact<{
      status:
        | 'active'
        | 'trialing'
        | 'past_due'
        | 'canceled'
        | 'inactive'
        | 'unknown';
    }>;
    customerLifecycleSegments: {
      nearReward: Fact<{
        count: number;
        evidenceFingerprint: string;
      }>;
      inactive: Fact<{
        count: number;
        evidenceFingerprint: string;
      }>;
    };
  };
};

type Candidate = Omit<BusinessRecommendation, 'placement'> & {
  secondaryOnly?: boolean;
};

export const RECOMMENDATION_GUIDE_IDS: Record<
  RecommendationStableId,
  RecommendationGuideId
> = {
  'subscription.action_required': 'subscription-recover',
  'setup.address.resolve': 'address-resolve',
  'setup.profile.complete': 'profile-complete',
  'program.publish_first': 'program-create',
  'program.publish_draft': 'program-publish',
  'campaign.create_first': 'campaign-create',
  'campaign.publish_draft': 'campaign-publish',
  'campaign.resume_paused': 'campaign-resume',
  'campaign.next_scheduled': 'campaign-schedule-review',
  'retention.reengage_inactive': 'inactive-review',
  'growth.near_reward': 'near-reward',
  'team.pending_invitations': 'team-pending',
  'subscription.quota_near': 'quota-review',
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;
const MIN_MEANINGFUL_SEGMENT_COUNT = 1;
const ADDRESS_FIELD_ID = 'address';

const CATEGORY_SEVERITY: Record<RecommendationCategory, number> = {
  operational: 0,
  setup: 1,
  retention: 2,
  growth: 3,
  informational: 4,
};

const SCHEDULE_FORMATTER = new Intl.DateTimeFormat('he-IL', {
  timeZone: 'Asia/Jerusalem',
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

function isKnown<T>(fact: Fact<T>): fact is KnownFact<T> {
  return fact.state === 'known';
}

export type RecommendationAccessDecision =
  | { state: 'allowed' }
  | {
      state: 'restricted';
      reasonCode: 'CAPABILITY_REQUIRED' | 'ENTITLEMENT_REQUIRED';
    }
  | { state: 'unavailable'; reasonCode: 'FACT_UNAVAILABLE' };

function unavailableFactDecision(
  fact: Fact<unknown>
): RecommendationAccessDecision | null {
  if (fact.state === 'restricted') {
    return { state: 'restricted', reasonCode: 'CAPABILITY_REQUIRED' };
  }
  if (fact.state === 'unknown') {
    return { state: 'unavailable', reasonCode: 'FACT_UNAVAILABLE' };
  }
  return null;
}

export function getRecommendationAccessDecision(
  input: RecommendationCatalogInput,
  stableId: RecommendationStableId
): RecommendationAccessDecision {
  const { capabilities } = input.actor;
  const { facts } = input;
  let hasRequiredCapabilities = false;
  let requiredFacts: Fact<unknown>[] = [];

  switch (stableId) {
    case 'subscription.action_required':
      hasRequiredCapabilities = capabilities.manageSubscription;
      requiredFacts = [facts.subscription];
      break;
    case 'subscription.quota_near':
      hasRequiredCapabilities = capabilities.manageSubscription;
      requiredFacts = [facts.campaignQuota];
      break;
    case 'setup.address.resolve':
      hasRequiredCapabilities = capabilities.editBusinessProfile;
      requiredFacts = [facts.address];
      break;
    case 'setup.profile.complete':
      hasRequiredCapabilities = capabilities.editBusinessProfile;
      requiredFacts = [facts.businessProfile];
      break;
    case 'program.publish_first':
    case 'program.publish_draft':
      hasRequiredCapabilities = capabilities.editLoyaltyCards;
      requiredFacts = [facts.programs];
      break;
    case 'campaign.create_first':
      hasRequiredCapabilities =
        capabilities.accessCampaigns && capabilities.createCampaigns;
      requiredFacts = [facts.campaigns, facts.customers];
      break;
    case 'campaign.publish_draft':
      hasRequiredCapabilities =
        capabilities.accessCampaigns &&
        capabilities.editCampaigns &&
        capabilities.activateSendCampaigns;
      requiredFacts = [facts.campaigns];
      break;
    case 'campaign.resume_paused':
      hasRequiredCapabilities =
        capabilities.accessCampaigns &&
        capabilities.activateSendCampaigns;
      requiredFacts = [facts.campaigns];
      break;
    case 'campaign.next_scheduled':
      hasRequiredCapabilities = capabilities.accessCampaigns;
      requiredFacts = [facts.campaigns];
      break;
    case 'retention.reengage_inactive':
      hasRequiredCapabilities = capabilities.accessCustomers;
      requiredFacts = [facts.customerLifecycleSegments.inactive];
      break;
    case 'growth.near_reward':
      hasRequiredCapabilities = capabilities.accessCustomers;
      requiredFacts = [facts.customerLifecycleSegments.nearReward];
      break;
    case 'team.pending_invitations':
      hasRequiredCapabilities = capabilities.manageTeam;
      requiredFacts = [facts.team];
      break;
  }

  if (!hasRequiredCapabilities) {
    return { state: 'restricted', reasonCode: 'CAPABILITY_REQUIRED' };
  }
  for (const fact of requiredFacts) {
    const unavailable = unavailableFactDecision(fact);
    if (unavailable) {
      return unavailable;
    }
  }
  if (
    stableId === 'campaign.create_first' &&
    isKnown(facts.campaignQuota) &&
    facts.campaignQuota.value.isAtOrAboveLimit
  ) {
    return { state: 'restricted', reasonCode: 'ENTITLEMENT_REQUIRED' };
  }
  return { state: 'allowed' };
}

function hasRecommendationAccess(
  input: RecommendationCatalogInput,
  stableId: RecommendationStableId
) {
  return getRecommendationAccessDecision(input, stableId).state === 'allowed';
}

function safeCount(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
}

function buildEvidenceFingerprint(parts: Array<string | number | boolean>) {
  let hash = 0x811c9dc5;
  const input = parts.join('|');
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `rec_v1_${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function buildRecommendationEvidenceFingerprint(
  stableId: RecommendationStableId,
  ...safeParts: Array<string | number | boolean>
) {
  return buildEvidenceFingerprint([stableId, ...safeParts]);
}

function evidence(
  stableId: RecommendationStableId,
  observedAt: number,
  ...safeParts: Array<string | number | boolean>
) {
  return {
    evidenceFingerprint: buildRecommendationEvidenceFingerprint(
      stableId,
      ...safeParts,
    ),
    evidenceObservedAt: observedAt,
  };
}

function compareCandidates(left: Candidate, right: Candidate) {
  return (
    left.priority - right.priority ||
    CATEGORY_SEVERITY[left.category] - CATEGORY_SEVERITY[right.category] ||
    right.evidenceObservedAt - left.evidenceObservedAt ||
    left.stableId.localeCompare(right.stableId)
  );
}

function addCandidate(
  candidates: Map<string, Candidate>,
  candidate: Omit<Candidate, 'guideId'>
) {
  if (!candidates.has(candidate.stableId)) {
    const guideId = RECOMMENDATION_GUIDE_IDS[candidate.stableId];
    if (guideId) {
      candidates.set(candidate.stableId, { ...candidate, guideId });
    }
  }
}

function withPlacement(
  candidate: Candidate,
  placement: 'primary' | 'secondary'
): BusinessRecommendation {
  const { secondaryOnly: _secondaryOnly, ...recommendation } = candidate;
  return {
    ...recommendation,
    placement,
  };
}

export function buildBusinessRecommendationCatalog(
  input: RecommendationCatalogInput,
  options?: {
    suppressEvidence?: ReadonlySet<string>;
    includeAllEligible?: boolean;
  }
) {
  const candidates = new Map<string, Candidate>();
  const { facts } = input;

  if (
    isKnown(facts.subscription) &&
    hasRecommendationAccess(input, 'subscription.action_required') &&
    (facts.subscription.value.status === 'past_due' ||
      facts.subscription.value.status === 'canceled' ||
      facts.subscription.value.status === 'inactive')
  ) {
    addCandidate(candidates, {
      stableId: 'subscription.action_required',
      category: 'operational',
      priority: 0,
      title: 'נדרשת פעולה במנוי',
      reason: 'מצב המנוי דורש בדיקה לפני המשך שימוש מלא.',
      ctaLabel: 'לבדיקת המנוי',
      action: { type: 'open_subscription' },
      tone: 'blocker',
      ...evidence(
        'subscription.action_required',
        facts.subscription.observedAt,
        input.schemaVersion,
        facts.subscription.value.status
      ),
    });
  }

  if (
    isKnown(facts.address) &&
    !facts.address.value.isComplete &&
    hasRecommendationAccess(input, 'setup.address.resolve')
  ) {
    addCandidate(candidates, {
      stableId: 'setup.address.resolve',
      category: 'setup',
      priority: 1,
      title: 'אמתו את כתובת העסק',
      reason: 'לא נשמרה כתובת מלאה ומאומתת.',
      ctaLabel: 'להשלמת הכתובת',
      action: { type: 'open_business_address' },
      tone: 'setup',
      ...evidence(
        'setup.address.resolve',
        facts.address.observedAt,
        input.schemaVersion,
        false
      ),
    });
  }

  if (
    isKnown(facts.businessProfile) &&
    !facts.businessProfile.value.isComplete &&
    hasRecommendationAccess(input, 'setup.profile.complete')
  ) {
    const remainingMissingFields =
      facts.businessProfile.value.missingFieldIds.filter(
        (fieldId) => fieldId !== ADDRESS_FIELD_ID
      );
    if (remainingMissingFields.length > 0) {
      const count = remainingMissingFields.length;
      const firstFieldId = remainingMissingFields[0];
      addCandidate(candidates, {
        stableId: 'setup.profile.complete',
        category: 'setup',
        priority: 1,
        title: 'השלימו את פרטי העסק',
        reason:
          count === 1
            ? 'חסר פרט אחד בפרופיל העסק.'
            : `חסרים ${count} פרטים בפרופיל העסק.`,
        ctaLabel: 'להשלמת הפרופיל',
        action: {
          type: 'open_business_profile',
          ...(firstFieldId ? { fieldId: firstFieldId } : {}),
        },
        count,
        tone: 'setup',
        ...evidence(
          'setup.profile.complete',
          facts.businessProfile.observedAt,
          input.schemaVersion,
          count,
          ...remainingMissingFields.slice().sort()
        ),
      });
    }
  }

  const programs = isKnown(facts.programs) ? facts.programs : null;
  const hasActiveProgram =
    programs !== null && safeCount(programs.value.activeCount) > 0;

  if (
    programs &&
    !hasActiveProgram &&
    hasRecommendationAccess(input, 'program.publish_first')
  ) {
    const draftCount = safeCount(programs.value.draftCount);
    const firstDraftProgramId = programs.value.firstDraftProgramId;
    if (draftCount === 0) {
      addCandidate(candidates, {
        stableId: 'program.publish_first',
        category: 'setup',
        priority: 1,
        title: 'פרסמו תוכנית נאמנות',
        reason: 'אין עדיין תוכנית פעילה ללקוחות.',
        ctaLabel: 'ליצירת תוכנית',
        action: { type: 'open_programs' },
        tone: 'setup',
        ...evidence(
          'program.publish_first',
          programs.observedAt,
          input.schemaVersion,
          0,
          0
        ),
      });
    } else if (firstDraftProgramId != null) {
      const programId = String(firstDraftProgramId);
      addCandidate(candidates, {
        stableId: 'program.publish_draft',
        category: 'setup',
        priority: 1,
        title: 'סיימו לפרסם את הכרטיסייה',
        reason:
          draftCount === 1
            ? 'יש כרטיסייה שממתינה לפרסום.'
            : `יש ${draftCount} כרטיסיות שממתינות לפרסום.`,
        ctaLabel: 'להמשך עריכה',
        action: { type: 'open_program', programId },
        entityId: programId,
        count: draftCount,
        tone: 'setup',
        ...evidence(
          'program.publish_draft',
          programs.observedAt,
          input.schemaVersion,
          draftCount,
          programId
        ),
      });
    }
  }

  const campaigns = isKnown(facts.campaigns) ? facts.campaigns : null;
  const quota = isKnown(facts.campaignQuota)
    ? facts.campaignQuota
    : null;
  if (hasActiveProgram && campaigns) {
    const hasScheduledOrRecurringPosture =
      safeCount(campaigns.value.scheduledCount) > 0 ||
      safeCount(campaigns.value.recurringCount) > 0;

    if (hasScheduledOrRecurringPosture) {
      const nextScheduled = campaigns.value.nextScheduled;
      if (
        nextScheduled &&
        hasRecommendationAccess(input, 'campaign.next_scheduled') &&
        Number.isFinite(nextScheduled.timestamp) &&
        nextScheduled.timestamp > input.generatedAt &&
        nextScheduled.timestamp <= input.generatedAt + SEVEN_DAYS_MS
      ) {
        const campaignId = String(nextScheduled.campaignId);
        addCandidate(candidates, {
          stableId: 'campaign.next_scheduled',
          category: 'informational',
          priority: 3,
          title: 'המבצע הבא כבר מתוזמן',
          reason: `המבצע מתוזמן ל-${SCHEDULE_FORMATTER.format(
            new Date(nextScheduled.timestamp)
          )}.`,
          ctaLabel: 'לבדיקת המבצע',
          action: { type: 'open_campaign', campaignId },
          entityId: campaignId,
          tone: 'informational',
          secondaryOnly: true,
          ...evidence(
            'campaign.next_scheduled',
            campaigns.observedAt,
            input.schemaVersion,
            campaigns.value.lifecycleSourceVersion,
            campaignId,
            nextScheduled.timestamp
          ),
        });
      }
    } else if (
      safeCount(campaigns.value.pausedCount) > 0 &&
      campaigns.value.firstPausedCampaignId != null &&
      hasRecommendationAccess(input, 'campaign.resume_paused')
    ) {
      const campaignId = String(campaigns.value.firstPausedCampaignId);
      addCandidate(candidates, {
        stableId: 'campaign.resume_paused',
        category: 'operational',
        priority: 2,
        title: 'יש מבצע מושהה',
        reason: 'אפשר לבדוק אותו ולהפעיל מחדש.',
        ctaLabel: 'לפתיחת המבצע',
        action: { type: 'open_campaign', campaignId },
        entityId: campaignId,
        count: safeCount(campaigns.value.pausedCount),
        tone: 'operational',
        ...evidence(
          'campaign.resume_paused',
          campaigns.observedAt,
          input.schemaVersion,
          campaigns.value.lifecycleSourceVersion,
          safeCount(campaigns.value.pausedCount),
          campaignId
        ),
      });
    } else if (
      safeCount(campaigns.value.draftCount) > 0 &&
      campaigns.value.firstDraftCampaignId != null &&
      hasRecommendationAccess(input, 'campaign.publish_draft')
    ) {
      const draftCount = safeCount(campaigns.value.draftCount);
      const campaignId = String(campaigns.value.firstDraftCampaignId);
      addCandidate(candidates, {
        stableId: 'campaign.publish_draft',
        category: 'operational',
        priority: 2,
        title: 'מבצע ממתין לפרסום',
        reason:
          draftCount === 1
            ? 'יש טיוטה שממתינה להפעלה.'
            : `יש ${draftCount} טיוטות שממתינות להפעלה.`,
        ctaLabel: 'לפתיחת המבצע',
        action: { type: 'open_campaign', campaignId },
        entityId: campaignId,
        count: draftCount,
        tone: 'operational',
        ...evidence(
          'campaign.publish_draft',
          campaigns.observedAt,
          input.schemaVersion,
          campaigns.value.lifecycleSourceVersion,
          draftCount,
          campaignId
        ),
      });
    } else if (
      safeCount(campaigns.value.totalNonarchivedCampaigns) === 0 &&
      safeCount(campaigns.value.inconsistentCount) === 0 &&
      isKnown(facts.customers) &&
      safeCount(facts.customers.value.uniqueActiveCustomerCount) > 0 &&
      hasRecommendationAccess(input, 'campaign.create_first')
    ) {
      addCandidate(candidates, {
        stableId: 'campaign.create_first',
        category: 'growth',
        priority: 2,
        title: 'צרו מבצע ראשון',
        reason: 'עדיין לא נוצרו מבצעים לעסק.',
        ctaLabel: 'ליצירת מבצע',
        action: { type: 'open_campaigns' },
        tone: 'growth',
        ...evidence(
          'campaign.create_first',
          campaigns.observedAt,
          input.schemaVersion,
          campaigns.value.lifecycleSourceVersion,
          0,
          safeCount(facts.customers.value.uniqueActiveCustomerCount)
        ),
      });
    }
  }

  if (hasActiveProgram) {
    const inactive = facts.customerLifecycleSegments.inactive;
    if (
      isKnown(inactive) &&
      hasRecommendationAccess(input, 'retention.reengage_inactive') &&
      safeCount(inactive.value.count) >= MIN_MEANINGFUL_SEGMENT_COUNT
    ) {
      const count = safeCount(inactive.value.count);
      addCandidate(candidates, {
        stableId: 'retention.reengage_inactive',
        category: 'retention',
        priority: 2,
        title: 'יש לקוחות שכדאי להזמין שוב',
        reason: `${count} לקוחות לא ביקרו לאחרונה.`,
        ctaLabel: 'לצפייה בלקוחות',
        action: {
          type: 'open_customers_segment',
          segment: 'at_risk',
        },
        count,
        tone: 'retention',
        ...evidence(
          'retention.reengage_inactive',
          inactive.observedAt,
          input.schemaVersion,
          count,
          inactive.value.evidenceFingerprint
        ),
      });
    }

    const nearReward = facts.customerLifecycleSegments.nearReward;
    if (
      isKnown(nearReward) &&
      hasRecommendationAccess(input, 'growth.near_reward') &&
      safeCount(nearReward.value.count) >= MIN_MEANINGFUL_SEGMENT_COUNT
    ) {
      const count = safeCount(nearReward.value.count);
      addCandidate(candidates, {
        stableId: 'growth.near_reward',
        category: 'growth',
        priority: 3,
        title: 'לקוחות קרובים להטבה',
        reason: `${count} לקוחות קרובים להשלמת הכרטיסייה.`,
        ctaLabel: 'לצפייה בלקוחות',
        action: {
          type: 'open_customers_segment',
          segment: 'near_reward',
        },
        count,
        tone: 'growth',
        secondaryOnly: true,
        ...evidence(
          'growth.near_reward',
          nearReward.observedAt,
          input.schemaVersion,
          count,
          nearReward.value.evidenceFingerprint
        ),
      });
    }
  }

  if (
    isKnown(facts.team) &&
    hasRecommendationAccess(input, 'team.pending_invitations') &&
    safeCount(facts.team.value.unexpiredPendingInvitationCount) > 0
  ) {
    const count = safeCount(
      facts.team.value.unexpiredPendingInvitationCount
    );
    addCandidate(candidates, {
      stableId: 'team.pending_invitations',
      category: 'informational',
      priority: 3,
      title: 'הזמנות לצוות עדיין ממתינות',
      reason:
        count === 1
          ? 'הזמנה אחת עדיין ממתינה לאישור.'
          : `${count} הזמנות עדיין ממתינות לאישור.`,
      ctaLabel: 'לצפייה בהזמנות',
      action: { type: 'open_team_pending' },
      count,
      tone: 'informational',
      secondaryOnly: true,
      ...evidence(
        'team.pending_invitations',
        facts.team.observedAt,
        input.schemaVersion,
        count
      ),
    });
  }

  if (
    quota &&
    hasRecommendationAccess(input, 'subscription.quota_near') &&
    Number.isFinite(quota.value.campaignDefinitionLimit) &&
    quota.value.campaignDefinitionLimit > 0
  ) {
    const usage = safeCount(quota.value.campaignDefinitionUsage);
    const limit = safeCount(quota.value.campaignDefinitionLimit);
    const ratio = usage / limit;
    if (ratio >= 0.8) {
      const isAtLimit =
        quota.value.isAtOrAboveLimit || usage >= limit;
      addCandidate(candidates, {
        stableId: 'subscription.quota_near',
        category: 'operational',
        priority: isAtLimit ? 2 : 3,
        title: isAtLimit
          ? 'מכסת המבצעים נוצלה'
          : 'מתקרבים למכסת המבצעים',
        reason: `${usage} מתוך ${limit} מבצעים במכסה נמצאים בשימוש.`,
        ctaLabel: 'לבדיקת המסלול',
        action: {
          type: 'open_subscription',
          limitKey: 'campaigns',
        },
        count: usage,
        tone: isAtLimit ? 'blocker' : 'operational',
        ...evidence(
          'subscription.quota_near',
          quota.observedAt,
          input.schemaVersion,
          usage,
          limit,
          isAtLimit
        ),
      });
    }
  }

  const eligible = [...candidates.values()];
  const ranked = eligible
    .filter(
      (candidate) =>
        !options?.suppressEvidence?.has(
          `${candidate.stableId}|${candidate.evidenceFingerprint}`
        )
    )
    .sort(compareCandidates);
  const primaryIndex = ranked.findIndex(
    (candidate) => candidate.secondaryOnly !== true
  );
  const primaryCandidate =
    primaryIndex >= 0 ? ranked[primaryIndex] : null;
  const secondaryCandidates = ranked
    .filter((_, index) => index !== primaryIndex)
    .slice(0, 2);

  const primary: BusinessRecommendation | null = primaryCandidate
    ? withPlacement(primaryCandidate, 'primary')
    : null;
  const secondary: BusinessRecommendation[] = secondaryCandidates.map(
    (candidate) => withPlacement(candidate, 'secondary')
  );

  const response = {
    schemaVersion: 1,
    businessId: input.businessId,
    generatedAt: input.generatedAt,
    primary,
    secondary,
    totalEligibleCount: ranked.length,
  };
  if (options?.includeAllEligible === true) {
    return {
      ...response,
      allEligible: eligible.map((candidate) =>
        withPlacement(candidate, 'secondary')
      ),
    };
  }
  return response;
}
