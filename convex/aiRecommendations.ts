import { v } from 'convex/values';
import { internal } from './_generated/api';
import type { Doc, Id } from './_generated/dataModel';
import {
  internalAction,
  internalMutation,
  internalQuery,
  mutation,
  query,
} from './_generated/server';
import { getBusinessEntitlementsForBusinessId } from './entitlements';
import {
  requireActorIsBusinessOwnerOrManager,
  requireActorIsStaffForBusiness,
} from './guards';
import {
  DAY_MS,
  hashString,
  monthKeyFromTimestamp,
  slugify,
  startOfUtcDay,
} from './lib/recommendationUtils';

const MODEL_NAME = 'google/gemini-2.5-flash-lite';
const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';
const OPENROUTER_TITLE = 'STAMPAIX AI Recommendations';
const DEFAULT_OPENROUTER_REFERER = 'https://stampaix.app';

const MIN_CUSTOMERS = 20;
const MIN_ACTIVITY_DAYS = 30;
const MIN_VISITS_LAST_30D = 10;

const CARD_CHANGE_COOLDOWN_DAYS = 10;
const CAMPAIGN_COOLDOWN_DAYS = 14;
const REPEATED_EVENT_COOLDOWN_DAYS = 14;
const MAX_RECOMMENDATIONS_PER_WEEK = 3;
const MAX_AI_EXECUTIONS_PER_DAY = 2;

const CACHE_TTL_MS = 30 * DAY_MS;
const SNAPSHOT_RETENTION_DAYS = 45;

const MAX_INPUT_TOKENS = 800;
const MAX_OUTPUT_TOKENS = 120;

const AI_COST_INPUT_PER_1M_USD = 0.1;
const AI_COST_OUTPUT_PER_1M_USD = 0.4;

const AI_MONTHLY_QUOTA_BY_PLAN = {
  starter: 0,
  pro: 100,
  premium: 300,
} as const;

const GOAL_UNION = v.union(
  v.literal('bring_back_customers'),
  v.literal('push_to_reward'),
  v.literal('general_engagement'),
  v.literal('campaign_summary'),
  v.literal('business_insight')
);

const RECOMMENDATION_TYPE_UNION = v.union(
  v.literal('campaign_message'),
  v.literal('business_insight'),
  v.literal('campaign_summary'),
  v.literal('recommendation_explanation')
);

const CTA_TYPE_UNION = v.union(
  v.literal('open_draft'),
  v.literal('view_insight'),
  v.literal('view_summary'),
  v.literal('view_reason'),
  v.literal('none')
);

type Goal =
  | 'bring_back_customers'
  | 'push_to_reward'
  | 'general_engagement'
  | 'campaign_summary'
  | 'business_insight';

type RecommendationType =
  | 'campaign_message'
  | 'business_insight'
  | 'campaign_summary'
  | 'recommendation_explanation';

type CtaType =
  | 'open_draft'
  | 'view_insight'
  | 'view_summary'
  | 'view_reason'
  | 'none';

type BusinessState =
  | 'BUSINESS_TOO_NEW'
  | 'ACTIVITY_NORMAL'
  | 'ACTIVITY_DROP_MILD'
  | 'ACTIVITY_DROP_SHARP'
  | 'INACTIVE_CUSTOMERS_HIGH'
  | 'CUSTOMERS_CLOSE_TO_REWARD_HIGH'
  | 'REDEMPTION_RATE_LOW'
  | 'NO_RECENT_CAMPAIGN'
  | 'CAMPAIGN_COMPLETED'
  | 'CARD_RECENTLY_CHANGED'
  | 'CARD_CHANGE_NO_IMPROVEMENT'
  | 'LOW_PRODUCT_USAGE'
  | 'WAIT_BEFORE_NEXT_ACTION';

type DecisionGuardrailReason =
  | 'NO_ACTIVE_PROGRAM'
  | 'NOT_ENOUGH_DATA'
  | 'NO_ACTION_NEEDED'
  | 'WAIT_CARD_CHANGE'
  | 'WAIT_COOLDOWN'
  | 'PLAN_NOT_ELIGIBLE'
  | 'QUOTA_EXHAUSTED'
  | 'DAILY_AI_LIMIT_REACHED'
  | 'QUOTA_NEAR_LIMIT'
  | 'CAMPAIGN_COOLDOWN_ACTIVE'
  | 'REPEATED_EVENT_COOLDOWN'
  | 'WEEKLY_RECOMMENDATION_LIMIT'
  | 'AI_REQUEST_FAILED'
  | 'SUPPRESSED_BY_RULE';

type PromptTemplateKind =
  | 'campaign_recommendation'
  | 'business_insight'
  | 'campaign_summary'
  | 'recommendation_explanation';

type Language = 'he' | 'en';
type BrandStyle =
  | 'friendly'
  | 'professional'
  | 'premium'
  | 'playful'
  | 'minimal';
type RewardType =
  | 'free_item'
  | 'free_service'
  | 'discount'
  | 'upgrade'
  | 'bonus';
type BusinessModel = 'service' | 'product' | 'mixed';

type ProgramCandidate = Doc<'loyaltyPrograms'>;

type NormalizedBusinessProfile = {
  business_type: string;
  service_category: string;
  service_name: string;
  reward_threshold: number;
  reward_name: string;
  reward_type: RewardType;
  visit_frequency: string;
  customer_cycle_days: number;
  price_range: 'low' | 'mid' | 'high' | 'unknown';
  brand_style: BrandStyle;
  language: Language;
  business_model: BusinessModel;
};

type CoreMetrics = {
  total_customers: number;
  active_customers_30d: number;
  inactive_customers_60d: number;
  new_customers_30d: number;
  visits_7d: number;
  visits_30d: number;
  visits_prev_30d: number;
  customers_close_to_reward: number;
  reward_redemptions_30d: number;
  avg_days_between_visits: number;
  campaigns_30d: number;
  inactive_customers_dynamic: number;
  inactive_rate_dynamic: number;
  close_to_reward_rate: number;
  redemption_rate_30d: number;
  activity_drop_pct_30d: number;
  joined_never_returned: number;
  previously_active_now_inactive: number;
};

type TrackedDates = {
  business_created_at: number;
  loyalty_card_created_at: number | null;
  loyalty_card_updated_at: number | null;
  last_campaign_at: number | null;
  last_ai_recommendation_at: number | null;
  last_event_detected_at: number | null;
  last_reward_redeemed_at: number | null;
};

type BusinessHealthSnapshot = {
  package_plan: 'starter' | 'pro' | 'premium';
  normalized_business_profile: NormalizedBusinessProfile;
  key_performance_metrics: CoreMetrics;
  customer_state: {
    total_customers: number;
    active_customers_30d: number;
    inactive_customers_60d: number;
    new_customers_30d: number;
    joined_never_returned: number;
    previously_active_now_inactive: number;
  };
  product_usage_state: {
    has_active_loyalty_card: boolean;
    active_program_count: number;
    card_recently_changed: boolean;
    changed_card_days_ago: number | null;
    campaigns_30d: number;
    has_recent_campaign: boolean;
    recommendation_usage_30d: number;
  };
  cooldown_quota_state: {
    card_change_cooldown_days: number;
    campaign_cooldown_days: number;
    repeated_event_cooldown_days: number;
    max_recommendations_per_week: number;
    max_ai_executions_per_day: number;
    ai_plan_quota_monthly: number;
    ai_quota_used_monthly: number;
    ai_quota_remaining_monthly: number;
    ai_executions_today: number;
    recommendations_this_week: number;
    plan_eligible_for_ai: boolean;
    quota_near_limit: boolean;
  };
  detected_states: BusinessState[];
  top_priority_state: BusinessState;
  enough_data: boolean;
  enough_data_reasons: string[];
  required_dates: TrackedDates;
  state_signal: string;
  state_hash: string;
};

type RecommendationSpec = {
  goal: Goal;
  outputType: RecommendationType;
  template: PromptTemplateKind;
  aiPreferred: boolean;
};

type SweepDecision =
  | {
      action: 'show_fixed';
      reason: DecisionGuardrailReason;
      goal: Goal;
      outputType: RecommendationType;
      template: PromptTemplateKind;
      ctaType: CtaType;
      ctaLabel: string;
      title: string;
      message: string;
      guardrailReason?: string;
    }
  | {
      action: 'defer' | 'suppress';
      reason: DecisionGuardrailReason;
      goal: Goal;
      outputType: RecommendationType;
      template: PromptTemplateKind;
      ctaType: CtaType;
      ctaLabel: string;
      title: string;
      message: string;
      guardrailReason?: string;
    }
  | {
      action: 'call_ai';
      reason: 'AI_REQUIRED';
      goal: Goal;
      outputType: RecommendationType;
      template: PromptTemplateKind;
      ctaType: CtaType;
      ctaLabel: string;
    };

type CachedGeneration = Doc<'aiGenerationCache'>;

type EvaluationResult =
  | {
      status: 'skipped';
      reason: string;
    }
  | {
      status: 'completed';
      outcome: 'fixed' | 'cache' | 'defer' | 'suppress';
      businessId: Id<'businesses'>;
      topState: BusinessState;
      snapshotId: Id<'aiBusinessSnapshots'>;
      recommendationId?: Id<'aiRecommendations'>;
    }
  | {
      status: 'needs_ai';
      businessId: Id<'businesses'>;
      snapshotId: Id<'aiBusinessSnapshots'>;
      topState: BusinessState;
      goal: Goal;
      outputType: RecommendationType;
      ctaType: CtaType;
      ctaLabel: string;
      dedupeKey: string;
      prompt: string;
      promptHash: string;
      cacheKey: string;
      inputSignature: string;
      guardrailReason?: string;
      relatedCampaignRunId?: Id<'campaignRuns'>;
    };

type ServiceDefaults = {
  serviceCategory: string;
  businessType: string;
  defaultServiceName: string;
  defaultCycleDays: number;
  businessModel: BusinessModel;
};

const SERVICE_DEFAULTS_BY_TYPE: Record<string, ServiceDefaults> = {
  food_drink: {
    serviceCategory: 'cafe_restaurant',
    businessType: 'cafe_or_restaurant',
    defaultServiceName: 'purchase',
    defaultCycleDays: 3,
    businessModel: 'product',
  },
  beauty: {
    serviceCategory: 'salon',
    businessType: 'beauty_salon',
    defaultServiceName: 'visit',
    defaultCycleDays: 35,
    businessModel: 'service',
  },
  health_wellness: {
    serviceCategory: 'massage_therapy',
    businessType: 'massage_therapist',
    defaultServiceName: 'session',
    defaultCycleDays: 21,
    businessModel: 'service',
  },
  fitness: {
    serviceCategory: 'personal_training',
    businessType: 'personal_trainer',
    defaultServiceName: 'training_session',
    defaultCycleDays: 7,
    businessModel: 'service',
  },
  retail: {
    serviceCategory: 'retail',
    businessType: 'retail_shop',
    defaultServiceName: 'purchase',
    defaultCycleDays: 28,
    businessModel: 'product',
  },
  professional_services: {
    serviceCategory: 'professional_service',
    businessType: 'professional_service',
    defaultServiceName: 'service_visit',
    defaultCycleDays: 45,
    businessModel: 'service',
  },
  education: {
    serviceCategory: 'education',
    businessType: 'education_center',
    defaultServiceName: 'lesson',
    defaultCycleDays: 14,
    businessModel: 'service',
  },
  hospitality: {
    serviceCategory: 'hospitality',
    businessType: 'hospitality',
    defaultServiceName: 'visit',
    defaultCycleDays: 30,
    businessModel: 'mixed',
  },
  other: {
    serviceCategory: 'other',
    businessType: 'local_business',
    defaultServiceName: 'visit',
    defaultCycleDays: 30,
    businessModel: 'mixed',
  },
};

const PRIORITY_ORDER: BusinessState[] = [
  'ACTIVITY_DROP_SHARP',
  'INACTIVE_CUSTOMERS_HIGH',
  'CUSTOMERS_CLOSE_TO_REWARD_HIGH',
  'CARD_CHANGE_NO_IMPROVEMENT',
  'NO_RECENT_CAMPAIGN',
  'CAMPAIGN_COMPLETED',
  'ACTIVITY_DROP_MILD',
  'REDEMPTION_RATE_LOW',
  'LOW_PRODUCT_USAGE',
  'CARD_RECENTLY_CHANGED',
  'WAIT_BEFORE_NEXT_ACTION',
  'BUSINESS_TOO_NEW',
  'ACTIVITY_NORMAL',
];

const HIGH_PRIORITY_AI_STATES = new Set<BusinessState>([
  'ACTIVITY_DROP_SHARP',
  'INACTIVE_CUSTOMERS_HIGH',
  'CUSTOMERS_CLOSE_TO_REWARD_HIGH',
  'CAMPAIGN_COMPLETED',
]);

const CAMPAIGN_MESSAGE_STATES = new Set<BusinessState>([
  'ACTIVITY_DROP_SHARP',
  'INACTIVE_CUSTOMERS_HIGH',
  'CUSTOMERS_CLOSE_TO_REWARD_HIGH',
  'NO_RECENT_CAMPAIGN',
]);

const MAX_WORDS_BY_OUTPUT_TYPE: Record<RecommendationType, number> = {
  campaign_message: 25,
  business_insight: 20,
  campaign_summary: 40,
  recommendation_explanation: 35,
};

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function safeNumber(value: unknown, fallback = 0) {
  if (!Number.isFinite(value)) {
    return fallback;
  }
  return Number(value);
}

function toPercent(value: number) {
  return Math.round(value * 100);
}

function truncateWords(value: string, maxWords: number) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return '';
  }
  const parts = normalized.split(' ');
  if (parts.length <= maxWords) {
    return normalized;
  }
  return parts.slice(0, maxWords).join(' ');
}

function normalizePlan(plan: unknown): 'starter' | 'pro' | 'premium' {
  if (plan === 'premium') return 'premium';
  if (plan === 'pro') return 'pro';
  return 'starter';
}

function inferRewardType(
  rewardName: string,
  businessModel: BusinessModel
): RewardType {
  const normalized = rewardName.toLowerCase();
  if (
    normalized.includes('discount') ||
    normalized.includes('%') ||
    normalized.includes('save')
  ) {
    return 'discount';
  }
  if (normalized.includes('upgrade')) {
    return 'upgrade';
  }
  if (normalized.includes('bonus')) {
    return 'bonus';
  }
  if (
    normalized.includes('free') ||
    normalized.includes('complimentary') ||
    normalized.includes('gift')
  ) {
    return businessModel === 'service' ? 'free_service' : 'free_item';
  }
  return businessModel === 'service' ? 'free_service' : 'free_item';
}

function visitFrequencyFromCycleDays(days: number) {
  if (days <= 3) return 'very_frequent';
  if (days <= 10) return 'weekly';
  if (days <= 25) return 'biweekly';
  if (days <= 45) return 'monthly';
  return 'occasional';
}

function getPrimaryServiceType(business: Doc<'businesses'>) {
  const first = business.serviceTypes?.[0];
  if (!first || !SERVICE_DEFAULTS_BY_TYPE[first]) {
    return 'other';
  }
  return first;
}

function selectPrimaryProgram(
  programs: ProgramCandidate[],
  activeMemberships: Doc<'memberships'>[],
  stampEvents30d: Doc<'events'>[]
) {
  if (programs.length === 0) {
    return null;
  }

  const activeMembersByProgram = new Map<string, number>();
  for (const membership of activeMemberships) {
    const key = String(membership.programId);
    activeMembersByProgram.set(key, (activeMembersByProgram.get(key) ?? 0) + 1);
  }

  const visitsByProgram = new Map<string, number>();
  for (const event of stampEvents30d) {
    const key = String(event.programId);
    visitsByProgram.set(key, (visitsByProgram.get(key) ?? 0) + 1);
  }

  const sorted = [...programs].sort((left, right) => {
    const leftMembers = activeMembersByProgram.get(String(left._id)) ?? 0;
    const rightMembers = activeMembersByProgram.get(String(right._id)) ?? 0;
    if (leftMembers !== rightMembers) {
      return rightMembers - leftMembers;
    }

    const leftVisits = visitsByProgram.get(String(left._id)) ?? 0;
    const rightVisits = visitsByProgram.get(String(right._id)) ?? 0;
    if (leftVisits !== rightVisits) {
      return rightVisits - leftVisits;
    }

    if (left.updatedAt !== right.updatedAt) {
      return right.updatedAt - left.updatedAt;
    }

    if (left.createdAt !== right.createdAt) {
      return left.createdAt - right.createdAt;
    }

    return String(left._id).localeCompare(String(right._id));
  });

  return sorted[0] ?? null;
}

function normalizeBusinessProfile(input: {
  business: Doc<'businesses'>;
  primaryProgram: ProgramCandidate | null;
  avgDaysBetweenVisits: number;
}): NormalizedBusinessProfile {
  const { business, primaryProgram, avgDaysBetweenVisits } = input;
  const primaryServiceType = getPrimaryServiceType(business);
  const defaults = SERVICE_DEFAULTS_BY_TYPE[primaryServiceType];
  const aiProfile = business.aiProfile;

  const language: Language = aiProfile?.language === 'en' ? 'en' : 'he';
  const brandStyle: BrandStyle =
    aiProfile?.brandStyle === 'professional' ||
    aiProfile?.brandStyle === 'premium' ||
    aiProfile?.brandStyle === 'playful' ||
    aiProfile?.brandStyle === 'minimal'
      ? aiProfile.brandStyle
      : 'friendly';
  const priceRange =
    aiProfile?.priceRange === 'low' ||
    aiProfile?.priceRange === 'mid' ||
    aiProfile?.priceRange === 'high'
      ? aiProfile.priceRange
      : 'unknown';
  const businessModel: BusinessModel =
    aiProfile?.businessModel === 'service' ||
    aiProfile?.businessModel === 'product' ||
    aiProfile?.businessModel === 'mixed'
      ? aiProfile.businessModel
      : defaults.businessModel;

  const cycleBase =
    safeNumber(aiProfile?.customerCycleDays, 0) > 0
      ? safeNumber(aiProfile?.customerCycleDays, defaults.defaultCycleDays)
      : avgDaysBetweenVisits > 0
        ? avgDaysBetweenVisits
        : defaults.defaultCycleDays;
  const customerCycleDays = clamp(Math.round(cycleBase), 1, 180);

  const rewardThreshold = clamp(
    Math.floor(safeNumber(primaryProgram?.maxStamps, 0)),
    0,
    999
  );
  const rewardName = normalizeWhitespace(
    primaryProgram?.rewardName ?? 'reward'
  );
  const rewardType: RewardType =
    aiProfile?.rewardTypeOverride === 'free_item' ||
    aiProfile?.rewardTypeOverride === 'free_service' ||
    aiProfile?.rewardTypeOverride === 'discount' ||
    aiProfile?.rewardTypeOverride === 'upgrade' ||
    aiProfile?.rewardTypeOverride === 'bonus'
      ? aiProfile.rewardTypeOverride
      : inferRewardType(rewardName, businessModel);

  const businessTypeOverride = normalizeWhitespace(
    aiProfile?.businessTypeOverride ?? ''
  );
  const serviceNameOverride = normalizeWhitespace(
    aiProfile?.serviceNameOverride ?? ''
  );

  return {
    business_type: businessTypeOverride || defaults.businessType,
    service_category: defaults.serviceCategory,
    service_name:
      serviceNameOverride ||
      normalizeWhitespace(primaryProgram?.title ?? '') ||
      defaults.defaultServiceName,
    reward_threshold: rewardThreshold,
    reward_name: rewardName,
    reward_type: rewardType,
    visit_frequency: visitFrequencyFromCycleDays(customerCycleDays),
    customer_cycle_days: customerCycleDays,
    price_range: priceRange,
    brand_style: brandStyle,
    language,
    business_model: businessModel,
  };
}

function stateSpecForState(state: BusinessState): RecommendationSpec {
  switch (state) {
    case 'ACTIVITY_DROP_SHARP':
    case 'INACTIVE_CUSTOMERS_HIGH':
      return {
        goal: 'bring_back_customers',
        outputType: 'campaign_message',
        template: 'campaign_recommendation',
        aiPreferred: true,
      };
    case 'CUSTOMERS_CLOSE_TO_REWARD_HIGH':
      return {
        goal: 'push_to_reward',
        outputType: 'campaign_message',
        template: 'campaign_recommendation',
        aiPreferred: true,
      };
    case 'NO_RECENT_CAMPAIGN':
      return {
        goal: 'general_engagement',
        outputType: 'campaign_message',
        template: 'campaign_recommendation',
        aiPreferred: true,
      };
    case 'CAMPAIGN_COMPLETED':
      return {
        goal: 'campaign_summary',
        outputType: 'campaign_summary',
        template: 'campaign_summary',
        aiPreferred: true,
      };
    case 'CARD_CHANGE_NO_IMPROVEMENT':
    case 'REDEMPTION_RATE_LOW':
      return {
        goal: 'business_insight',
        outputType: 'business_insight',
        template: 'business_insight',
        aiPreferred: true,
      };
    case 'LOW_PRODUCT_USAGE':
      return {
        goal: 'business_insight',
        outputType: 'recommendation_explanation',
        template: 'recommendation_explanation',
        aiPreferred: false,
      };
    case 'ACTIVITY_DROP_MILD':
      return {
        goal: 'general_engagement',
        outputType: 'business_insight',
        template: 'business_insight',
        aiPreferred: false,
      };
    case 'BUSINESS_TOO_NEW':
    case 'CARD_RECENTLY_CHANGED':
    case 'WAIT_BEFORE_NEXT_ACTION':
    case 'ACTIVITY_NORMAL':
    default:
      return {
        goal: 'business_insight',
        outputType: 'recommendation_explanation',
        template: 'recommendation_explanation',
        aiPreferred: false,
      };
  }
}

function ctaForRecommendationType(
  type: RecommendationType,
  state: BusinessState
): { ctaType: CtaType; ctaLabel: string } {
  if (type === 'campaign_message') {
    return { ctaType: 'open_draft', ctaLabel: 'Create editable draft' };
  }
  if (type === 'business_insight') {
    return { ctaType: 'view_insight', ctaLabel: 'View insight' };
  }
  if (type === 'campaign_summary') {
    return { ctaType: 'view_summary', ctaLabel: 'View summary' };
  }
  if (
    state === 'ACTIVITY_NORMAL' ||
    state === 'CARD_RECENTLY_CHANGED' ||
    state === 'WAIT_BEFORE_NEXT_ACTION' ||
    state === 'BUSINESS_TOO_NEW'
  ) {
    return { ctaType: 'none', ctaLabel: 'No action needed' };
  }
  return { ctaType: 'view_reason', ctaLabel: 'View reason' };
}

function topStateFromDetectedStates(detected: BusinessState[]) {
  const detectedSet = new Set<BusinessState>(detected);
  for (const state of PRIORITY_ORDER) {
    if (detectedSet.has(state)) {
      return state;
    }
  }
  return 'ACTIVITY_NORMAL' as const;
}

function buildStateSignal(input: {
  topState: BusinessState;
  metrics: CoreMetrics;
  profile: NormalizedBusinessProfile;
  campaignRunId: string | null;
}) {
  const { topState, metrics, profile, campaignRunId } = input;
  if (topState === 'ACTIVITY_DROP_SHARP' || topState === 'ACTIVITY_DROP_MILD') {
    return `drop_${toPercent(metrics.activity_drop_pct_30d)}_v30_${metrics.visits_30d}_vp30_${metrics.visits_prev_30d}`;
  }
  if (topState === 'INACTIVE_CUSTOMERS_HIGH') {
    return `inactive_${toPercent(metrics.inactive_rate_dynamic)}_${metrics.inactive_customers_dynamic}`;
  }
  if (topState === 'CUSTOMERS_CLOSE_TO_REWARD_HIGH') {
    return `near_reward_${metrics.customers_close_to_reward}_${toPercent(metrics.close_to_reward_rate)}`;
  }
  if (topState === 'CAMPAIGN_COMPLETED' && campaignRunId) {
    return `campaign_completed_${campaignRunId}`;
  }
  if (topState === 'CARD_CHANGE_NO_IMPROVEMENT') {
    return `card_change_no_improvement_${toPercent(metrics.activity_drop_pct_30d)}`;
  }
  if (topState === 'REDEMPTION_RATE_LOW') {
    return `redemption_low_${toPercent(metrics.redemption_rate_30d)}`;
  }
  if (topState === 'NO_RECENT_CAMPAIGN') {
    return `no_recent_campaign_${profile.customer_cycle_days}_${metrics.campaigns_30d}`;
  }
  if (topState === 'LOW_PRODUCT_USAGE') {
    return `low_usage_${metrics.visits_30d}_${metrics.campaigns_30d}`;
  }
  if (topState === 'CARD_RECENTLY_CHANGED') {
    return `card_recently_changed`;
  }
  if (topState === 'WAIT_BEFORE_NEXT_ACTION') {
    return `wait_before_next_action`;
  }
  if (topState === 'BUSINESS_TOO_NEW') {
    return `business_too_new`;
  }
  return `activity_normal`;
}

function buildStateHash(input: {
  businessId: Id<'businesses'>;
  topState: BusinessState;
  stateSignal: string;
  metrics: CoreMetrics;
  profile: NormalizedBusinessProfile;
  trackedDates: TrackedDates;
  primaryProgramId: Id<'loyaltyPrograms'> | null;
}) {
  return hashString(
    JSON.stringify({
      businessId: String(input.businessId),
      topState: input.topState,
      stateSignal: input.stateSignal,
      metrics: {
        visits_30d: input.metrics.visits_30d,
        visits_prev_30d: input.metrics.visits_prev_30d,
        inactive_dynamic: input.metrics.inactive_customers_dynamic,
        close_to_reward: input.metrics.customers_close_to_reward,
        campaigns_30d: input.metrics.campaigns_30d,
      },
      profile: {
        business_type: input.profile.business_type,
        service_name: input.profile.service_name,
        reward_threshold: input.profile.reward_threshold,
        reward_type: input.profile.reward_type,
        language: input.profile.language,
        brand_style: input.profile.brand_style,
      },
      trackedDates: {
        last_campaign_at: input.trackedDates.last_campaign_at,
        loyalty_card_updated_at: input.trackedDates.loyalty_card_updated_at,
        last_ai_recommendation_at: input.trackedDates.last_ai_recommendation_at,
      },
      primaryProgramId: input.primaryProgramId
        ? String(input.primaryProgramId)
        : null,
    })
  );
}

function fixedMessageForReason(input: {
  reason: DecisionGuardrailReason;
  topState: BusinessState;
  metrics: CoreMetrics;
}): { title: string; message: string } {
  const { reason, topState, metrics } = input;
  if (reason === 'NO_ACTIVE_PROGRAM') {
    return {
      title: 'Activate one loyalty card first',
      message:
        'Recommendations run on one primary active loyalty card. No active card was found.',
    };
  }
  if (reason === 'NOT_ENOUGH_DATA') {
    return {
      title: 'Not enough data yet',
      message:
        'We need at least 20 customers, 30 active days, and 10 visits in the last 30 days.',
    };
  }
  if (reason === 'PLAN_NOT_ELIGIBLE') {
    return {
      title: 'Business issue detected, AI unavailable',
      message: `State: ${topState}. Your current plan does not include AI recommendations.`,
    };
  }
  if (reason === 'QUOTA_EXHAUSTED') {
    return {
      title: 'Business issue detected, AI quota exhausted',
      message: `State: ${topState}. Monthly AI quota is exhausted. You can still act manually.`,
    };
  }
  if (reason === 'DAILY_AI_LIMIT_REACHED') {
    return {
      title: 'AI limit reached for today',
      message:
        'Two AI executions already ran today. The recommendation was deferred to the next scan.',
    };
  }
  if (reason === 'QUOTA_NEAR_LIMIT') {
    return {
      title: 'AI budget preserved for higher urgency',
      message: `State: ${topState}. AI quota is near limit, so this recommendation is shown as fixed text.`,
    };
  }
  if (reason === 'WAIT_CARD_CHANGE') {
    return {
      title: 'Wait before another campaign',
      message:
        'The loyalty card was changed recently. Wait a few more days before taking new action.',
    };
  }
  if (reason === 'CAMPAIGN_COOLDOWN_ACTIVE') {
    return {
      title: 'Wait between campaigns',
      message:
        'A campaign was sent recently. Wait for the cooldown window before sending another one.',
    };
  }
  if (reason === 'WAIT_COOLDOWN') {
    return {
      title: 'No action recommended right now',
      message:
        'A recent recommendation already covered this situation. Wait for new movement in customer behavior.',
    };
  }
  if (reason === 'NO_ACTION_NEEDED') {
    return {
      title: 'No action recommended right now',
      message:
        'Activity looks stable. Keep monitoring and avoid over-messaging customers.',
    };
  }
  if (reason === 'WEEKLY_RECOMMENDATION_LIMIT') {
    return {
      title: 'Weekly recommendation limit reached',
      message:
        'You already received the weekly recommendation limit. New items will resume next week.',
    };
  }
  if (reason === 'REPEATED_EVENT_COOLDOWN') {
    return {
      title: 'Repeated event suppressed',
      message:
        'The same business event was already handled recently and has not materially changed.',
    };
  }
  if (reason === 'AI_REQUEST_FAILED') {
    return {
      title: 'AI response unavailable',
      message:
        'A deterministic fallback was shown because the AI request failed.',
    };
  }
  if (topState === 'CAMPAIGN_COMPLETED') {
    return {
      title: 'Campaign outcome is ready',
      message: `Last campaign reached ${metrics.visits_30d} visits in 30 days. Review outcome before sending another campaign.`,
    };
  }
  return {
    title: 'Recommendation deferred',
    message: 'The engine decided to defer this recommendation in this cycle.',
  };
}

function recommendationPromptTemplateCampaign(input: {
  goal: Goal;
  profile: NormalizedBusinessProfile;
  state: BusinessState;
  metrics: CoreMetrics;
}) {
  const facts = {
    goal: input.goal,
    state: input.state,
    business_type: input.profile.business_type,
    service_category: input.profile.service_category,
    service_name: input.profile.service_name,
    reward_threshold: input.profile.reward_threshold,
    reward_name: input.profile.reward_name,
    reward_type: input.profile.reward_type,
    visit_frequency: input.profile.visit_frequency,
    language: input.profile.language,
    brand_style: input.profile.brand_style,
    metrics: {
      visits_30d: input.metrics.visits_30d,
      visits_prev_30d: input.metrics.visits_prev_30d,
      activity_drop_pct_30d: toPercent(input.metrics.activity_drop_pct_30d),
      inactive_customers_dynamic: input.metrics.inactive_customers_dynamic,
      customers_close_to_reward: input.metrics.customers_close_to_reward,
      campaigns_30d: input.metrics.campaigns_30d,
    },
  };

  return [
    'Task: generate a short campaign recommendation message.',
    'Allowed output: JSON only with keys type,title,message.',
    'Schema: {"type":"campaign_message","title":"","message":""}.',
    'Rules:',
    '- Do not invent numbers or outcomes.',
    '- Use only provided facts.',
    '- Message max 25 words.',
    '- Keep neutral, business-safe, no medical/legal/financial claims.',
    '- Language must match facts.language.',
    `Facts: ${JSON.stringify(facts)}`,
  ].join('\n');
}

function recommendationPromptTemplateInsight(input: {
  state: BusinessState;
  profile: NormalizedBusinessProfile;
  metrics: CoreMetrics;
}) {
  const facts = {
    state: input.state,
    language: input.profile.language,
    brand_style: input.profile.brand_style,
    service_name: input.profile.service_name,
    metrics: {
      visits_30d: input.metrics.visits_30d,
      visits_prev_30d: input.metrics.visits_prev_30d,
      redemption_rate_30d: toPercent(input.metrics.redemption_rate_30d),
      inactive_rate_dynamic: toPercent(input.metrics.inactive_rate_dynamic),
      customers_close_to_reward: input.metrics.customers_close_to_reward,
    },
  };

  return [
    'Task: explain one detected business insight in plain language.',
    'Allowed output: JSON only with keys type,title,message.',
    'Schema: {"type":"business_insight","title":"","message":""}.',
    'Rules:',
    '- No invented numbers.',
    '- Message max 20 words.',
    '- Keep neutral and practical.',
    '- Language must match facts.language.',
    `Facts: ${JSON.stringify(facts)}`,
  ].join('\n');
}

function recommendationPromptTemplateSummary(input: {
  profile: NormalizedBusinessProfile;
  campaignRun: Doc<'campaignRuns'>;
}) {
  const facts = {
    language: input.profile.language,
    brand_style: input.profile.brand_style,
    service_name: input.profile.service_name,
    campaign_type: input.campaignRun.campaignType,
    targeted_count: input.campaignRun.targetedCount,
    delivered_count: input.campaignRun.deliveredCount,
    returned_customers_14d: input.campaignRun.returnedCustomers14d ?? 0,
    reward_redemptions_14d: input.campaignRun.rewardRedemptions14d ?? 0,
  };

  return [
    'Task: summarize campaign outcome for a business owner.',
    'Allowed output: JSON only with keys type,title,message.',
    'Schema: {"type":"campaign_summary","title":"","message":""}.',
    'Rules:',
    '- Use only provided facts.',
    '- No extra metrics.',
    '- Message max 40 words.',
    '- Language must match facts.language.',
    `Facts: ${JSON.stringify(facts)}`,
  ].join('\n');
}

function recommendationPromptTemplateExplanation(input: {
  state: BusinessState;
  profile: NormalizedBusinessProfile;
  reason: string;
  metrics: CoreMetrics;
}) {
  const facts = {
    state: input.state,
    reason: input.reason,
    language: input.profile.language,
    service_name: input.profile.service_name,
    metrics: {
      visits_30d: input.metrics.visits_30d,
      visits_prev_30d: input.metrics.visits_prev_30d,
      campaigns_30d: input.metrics.campaigns_30d,
    },
  };

  return [
    'Task: explain recommendation logic or why action is deferred.',
    'Allowed output: JSON only with keys type,title,message.',
    'Schema: {"type":"recommendation_explanation","title":"","message":""}.',
    'Rules:',
    '- Explain briefly in business language.',
    '- Message max 35 words.',
    '- No invented facts.',
    '- Language must match facts.language.',
    `Facts: ${JSON.stringify(facts)}`,
  ].join('\n');
}

function buildPromptFromTemplate(input: {
  template: PromptTemplateKind;
  goal: Goal;
  state: BusinessState;
  profile: NormalizedBusinessProfile;
  metrics: CoreMetrics;
  campaignRun: Doc<'campaignRuns'> | null;
  reason: string;
}) {
  if (input.template === 'campaign_recommendation') {
    return recommendationPromptTemplateCampaign({
      goal: input.goal,
      profile: input.profile,
      state: input.state,
      metrics: input.metrics,
    });
  }
  if (input.template === 'business_insight') {
    return recommendationPromptTemplateInsight({
      state: input.state,
      profile: input.profile,
      metrics: input.metrics,
    });
  }
  if (input.template === 'campaign_summary' && input.campaignRun) {
    return recommendationPromptTemplateSummary({
      profile: input.profile,
      campaignRun: input.campaignRun,
    });
  }
  return recommendationPromptTemplateExplanation({
    state: input.state,
    profile: input.profile,
    reason: input.reason,
    metrics: input.metrics,
  });
}

function parseJsonFromModelText(raw: string) {
  const trimmed = raw.trim();
  const withoutFence = trimmed
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/\s*```$/, '')
    .trim();

  const firstBrace = withoutFence.indexOf('{');
  const lastBrace = withoutFence.lastIndexOf('}');
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const candidate = withoutFence.slice(firstBrace, lastBrace + 1);
    return JSON.parse(candidate) as Record<string, unknown>;
  }
  return JSON.parse(withoutFence) as Record<string, unknown>;
}

function sanitizeModelOutput(input: {
  parsed: Record<string, unknown>;
  expectedType: RecommendationType;
}): { type: RecommendationType; title: string; message: string } | null {
  const rawTitle =
    typeof input.parsed.title === 'string' ? input.parsed.title : '';
  const rawMessage =
    typeof input.parsed.message === 'string' ? input.parsed.message : '';

  const title = truncateWords(normalizeWhitespace(rawTitle), 8).slice(0, 80);
  if (!title) {
    return null;
  }

  const message = truncateWords(
    normalizeWhitespace(rawMessage),
    MAX_WORDS_BY_OUTPUT_TYPE[input.expectedType]
  );
  if (!message) {
    return null;
  }

  return {
    type: input.expectedType,
    title,
    message,
  };
}

function estimateCostUsd(inputTokens: number, outputTokens: number) {
  const inputCost = (inputTokens / 1_000_000) * AI_COST_INPUT_PER_1M_USD;
  const outputCost = (outputTokens / 1_000_000) * AI_COST_OUTPUT_PER_1M_USD;
  return Number((inputCost + outputCost).toFixed(8));
}

function buildCacheKey(input: {
  businessId: Id<'businesses'>;
  profile: NormalizedBusinessProfile;
  goal: Goal;
  outputType: RecommendationType;
  topState: BusinessState;
  stateSignal: string;
  stateHash: string;
  structureSignature: string | null;
}) {
  if (input.outputType === 'campaign_message') {
    return [
      'v1',
      `goal:${input.goal}`,
      `state:${input.topState}`,
      `sig:${slugify(input.stateSignal)}`,
      `lang:${input.profile.language}`,
      `brand:${input.profile.brand_style}`,
      `btype:${slugify(input.profile.business_type)}`,
      `svc:${slugify(input.profile.service_name)}`,
      `cat:${slugify(input.profile.service_category)}`,
      `rt:${input.profile.reward_type}`,
      `thr:${input.profile.reward_threshold}`,
      `card:${input.structureSignature ?? 'none'}`,
    ].join('|');
  }

  return [
    'v1',
    `biz:${String(input.businessId)}`,
    `goal:${input.goal}`,
    `type:${input.outputType}`,
    `state:${input.topState}`,
    `hash:${input.stateHash}`,
  ].join('|');
}

function shouldIgnoreCacheForCardChange(input: {
  topState: BusinessState;
  changedCardDaysAgo: number | null;
}) {
  return (
    input.topState === 'CARD_RECENTLY_CHANGED' ||
    (input.changedCardDaysAgo !== null &&
      input.changedCardDaysAgo <= CARD_CHANGE_COOLDOWN_DAYS)
  );
}

function extractMessageContent(raw: unknown): string {
  if (typeof raw === 'string') {
    return raw;
  }
  if (Array.isArray(raw)) {
    const joined = raw
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part === 'object' && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .join(' ');
    return normalizeWhitespace(joined);
  }
  return '';
}

async function callGeminiJson(input: {
  prompt: string;
  expectedType: RecommendationType;
}) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return {
      ok: false as const,
      reason: 'MISSING_OPENROUTER_API_KEY',
      inputTokens: 0,
      outputTokens: 0,
      costEstimate: 0,
    };
  }

  const response = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer':
        process.env.OPENROUTER_SITE_URL ?? DEFAULT_OPENROUTER_REFERER,
      'X-Title': OPENROUTER_TITLE,
    },
    body: JSON.stringify({
      model: MODEL_NAME,
      temperature: 0.2,
      max_tokens: MAX_OUTPUT_TOKENS,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: input.prompt }],
    }),
  });

  const payload = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;

  const usage =
    payload && typeof payload === 'object' && 'usage' in payload
      ? (payload.usage as Record<string, unknown>)
      : null;
  const inputTokens = safeNumber(usage?.prompt_tokens, 0);
  const outputTokens = safeNumber(usage?.completion_tokens, 0);
  const costEstimate = estimateCostUsd(inputTokens, outputTokens);

  if (!response.ok || !payload) {
    return {
      ok: false as const,
      reason: response.ok ? 'EMPTY_AI_PAYLOAD' : `AI_HTTP_${response.status}`,
      inputTokens,
      outputTokens,
      costEstimate,
    };
  }

  const choices = Array.isArray(payload.choices)
    ? (payload.choices as Array<Record<string, unknown>>)
    : [];
  const firstChoice = choices[0] ?? null;
  const message =
    firstChoice &&
    typeof firstChoice === 'object' &&
    'message' in firstChoice &&
    firstChoice.message &&
    typeof firstChoice.message === 'object'
      ? (firstChoice.message as Record<string, unknown>)
      : null;

  const rawContent = extractMessageContent(message?.content);
  if (!rawContent) {
    return {
      ok: false as const,
      reason: 'EMPTY_AI_CONTENT',
      inputTokens,
      outputTokens,
      costEstimate,
    };
  }

  try {
    const parsed = parseJsonFromModelText(rawContent);
    const sanitized = sanitizeModelOutput({
      parsed,
      expectedType: input.expectedType,
    });
    if (!sanitized) {
      return {
        ok: false as const,
        reason: 'INVALID_AI_SCHEMA',
        inputTokens,
        outputTokens,
        costEstimate,
      };
    }

    return {
      ok: true as const,
      output: sanitized,
      inputTokens,
      outputTokens,
      costEstimate,
    };
  } catch (error) {
    return {
      ok: false as const,
      reason:
        error instanceof Error
          ? `AI_PARSE_ERROR:${error.message}`
          : 'AI_PARSE_ERROR',
      inputTokens,
      outputTokens,
      costEstimate,
    };
  }
}

function detectStates(input: {
  businessAgeDays: number;
  metrics: CoreMetrics;
  profile: NormalizedBusinessProfile;
  daysSinceCardChange: number | null;
  daysSinceLastCampaign: number | null;
  daysSinceLastRecommendation: number | null;
  hasReadyCampaignSummary: boolean;
  recommendationUsage30d: number;
}) {
  const states: BusinessState[] = [];
  const { metrics, profile } = input;

  const activityDropSharp =
    metrics.visits_prev_30d >= 10 &&
    metrics.activity_drop_pct_30d >= 0.35 &&
    metrics.visits_30d <= metrics.visits_prev_30d - 5;
  const activityDropMild =
    metrics.visits_prev_30d >= 10 &&
    metrics.activity_drop_pct_30d >= 0.15 &&
    metrics.activity_drop_pct_30d < 0.35;

  if (input.businessAgeDays < MIN_ACTIVITY_DAYS) {
    states.push('BUSINESS_TOO_NEW');
  }
  if (activityDropSharp) {
    states.push('ACTIVITY_DROP_SHARP');
  } else if (activityDropMild) {
    states.push('ACTIVITY_DROP_MILD');
  }

  if (
    metrics.inactive_customers_dynamic >=
      Math.max(8, Math.round(metrics.total_customers * 0.25)) &&
    metrics.inactive_rate_dynamic >= 0.4
  ) {
    states.push('INACTIVE_CUSTOMERS_HIGH');
  }

  if (
    metrics.customers_close_to_reward >=
      Math.max(5, Math.round(metrics.total_customers * 0.12)) &&
    metrics.close_to_reward_rate >= 0.2
  ) {
    states.push('CUSTOMERS_CLOSE_TO_REWARD_HIGH');
  }

  if (
    metrics.visits_30d >= 20 &&
    metrics.redemption_rate_30d <= 0.02 &&
    metrics.customers_close_to_reward > 0
  ) {
    states.push('REDEMPTION_RATE_LOW');
  }

  const noCampaignThresholdDays = clamp(
    profile.customer_cycle_days * 2,
    21,
    60
  );
  if (
    (input.daysSinceLastCampaign === null ||
      input.daysSinceLastCampaign >= noCampaignThresholdDays) &&
    metrics.total_customers >= MIN_CUSTOMERS
  ) {
    states.push('NO_RECENT_CAMPAIGN');
  }

  if (input.hasReadyCampaignSummary) {
    states.push('CAMPAIGN_COMPLETED');
  }

  if (
    input.daysSinceCardChange !== null &&
    input.daysSinceCardChange <= CARD_CHANGE_COOLDOWN_DAYS
  ) {
    states.push('CARD_RECENTLY_CHANGED');
  }

  if (
    input.daysSinceCardChange !== null &&
    input.daysSinceCardChange > CARD_CHANGE_COOLDOWN_DAYS &&
    input.daysSinceCardChange <= 30 &&
    metrics.visits_prev_30d >= 10 &&
    metrics.visits_30d <= Math.round(metrics.visits_prev_30d * 1.05)
  ) {
    states.push('CARD_CHANGE_NO_IMPROVEMENT');
  }

  if (
    metrics.campaigns_30d === 0 &&
    metrics.visits_30d > 0 &&
    input.recommendationUsage30d === 0 &&
    metrics.active_customers_30d <= Math.round(metrics.total_customers * 0.35)
  ) {
    states.push('LOW_PRODUCT_USAGE');
  }

  if (
    (input.daysSinceLastRecommendation !== null &&
      input.daysSinceLastRecommendation < REPEATED_EVENT_COOLDOWN_DAYS) ||
    (input.daysSinceLastCampaign !== null &&
      input.daysSinceLastCampaign < CAMPAIGN_COOLDOWN_DAYS)
  ) {
    states.push('WAIT_BEFORE_NEXT_ACTION');
  }

  if (states.length === 0) {
    states.push('ACTIVITY_NORMAL');
  }

  return states;
}

async function refreshReadyCampaignRuns(input: {
  ctx: any;
  businessId: Id<'businesses'>;
  runs: Doc<'campaignRuns'>[];
  events: Doc<'events'>[];
  now: number;
}) {
  const nextRuns: Doc<'campaignRuns'>[] = [];
  for (const run of input.runs) {
    if (
      run.summaryStatus === 'pending' &&
      (run.summaryReadyAt ?? run.sentAt + 3 * DAY_MS) <= input.now
    ) {
      const summaryWindowEnd = Math.min(
        run.summaryWindowEndsAt ?? run.sentAt + 14 * DAY_MS,
        input.now
      );
      const eventsInWindow = input.events.filter(
        (event) =>
          event.createdAt >= run.sentAt &&
          event.createdAt <= summaryWindowEnd &&
          (event.type === 'STAMP_ADDED' || event.type === 'REWARD_REDEEMED')
      );
      const returnedCustomers = new Set<string>();
      let rewardRedemptions14d = 0;
      for (const event of eventsInWindow) {
        if (event.type === 'STAMP_ADDED') {
          returnedCustomers.add(String(event.customerUserId));
        } else if (event.type === 'REWARD_REDEEMED') {
          rewardRedemptions14d += 1;
        }
      }
      await input.ctx.db.patch(run._id, {
        returnedCustomers14d: returnedCustomers.size,
        rewardRedemptions14d,
        summaryStatus: 'ready',
        updatedAt: input.now,
      });
      nextRuns.push({
        ...run,
        returnedCustomers14d: returnedCustomers.size,
        rewardRedemptions14d,
        summaryStatus: 'ready',
        updatedAt: input.now,
      });
      continue;
    }
    nextRuns.push(run);
  }
  return nextRuns;
}

function computeCoreMetrics(input: {
  memberships: Doc<'memberships'>[];
  events: Doc<'events'>[];
  campaignRuns: Doc<'campaignRuns'>[];
  primaryProgram: ProgramCandidate | null;
  now: number;
  customerCycleDays: number;
}) {
  const thirtyDaysAgo = input.now - 30 * DAY_MS;
  const sixtyDaysAgo = input.now - 60 * DAY_MS;
  const sevenDaysAgo = input.now - 7 * DAY_MS;
  const dynamicInactiveWindowDays = clamp(
    Math.round(input.customerCycleDays * 2.5),
    14,
    120
  );
  const dynamicInactiveThreshold =
    input.now - dynamicInactiveWindowDays * DAY_MS;

  const activeMemberships = input.memberships.filter(
    (membership) => membership.isActive === true
  );
  const totalCustomerSet = new Set<string>();
  const newCustomerSet = new Set<string>();
  for (const membership of input.memberships) {
    totalCustomerSet.add(String(membership.userId));
    if (membership.createdAt >= thirtyDaysAgo) {
      newCustomerSet.add(String(membership.userId));
    }
  }

  const activityEvents = input.events.filter(
    (event) => event.type === 'STAMP_ADDED' || event.type === 'REWARD_REDEEMED'
  );
  const stampEvents = input.events.filter(
    (event) => event.type === 'STAMP_ADDED'
  );
  const rewardEvents = input.events.filter(
    (event) => event.type === 'REWARD_REDEEMED'
  );

  const lastActivityByCustomer = new Map<string, number>();
  const stampTimestampsByCustomer = new Map<string, number[]>();
  const customersWithStamp = new Set<string>();
  let lastRewardRedeemedAt: number | null = null;
  for (const event of activityEvents) {
    const key = String(event.customerUserId);
    const current = lastActivityByCustomer.get(key) ?? 0;
    if (event.createdAt > current) {
      lastActivityByCustomer.set(key, event.createdAt);
    }
    if (event.type === 'STAMP_ADDED') {
      customersWithStamp.add(key);
      const list = stampTimestampsByCustomer.get(key) ?? [];
      list.push(event.createdAt);
      stampTimestampsByCustomer.set(key, list);
    }
    if (event.type === 'REWARD_REDEEMED') {
      if (
        lastRewardRedeemedAt === null ||
        event.createdAt > lastRewardRedeemedAt
      ) {
        lastRewardRedeemedAt = event.createdAt;
      }
    }
  }

  let activeCustomers30d = 0;
  let inactiveCustomers60d = 0;
  let inactiveCustomersDynamic = 0;
  let joinedNeverReturned = 0;
  let previouslyActiveNowInactive = 0;
  for (const customerId of totalCustomerSet) {
    const lastActivity = lastActivityByCustomer.get(customerId) ?? null;
    if (lastActivity !== null && lastActivity >= thirtyDaysAgo) {
      activeCustomers30d += 1;
    }
    if (lastActivity === null || lastActivity < sixtyDaysAgo) {
      inactiveCustomers60d += 1;
    }
    if (lastActivity === null || lastActivity < dynamicInactiveThreshold) {
      inactiveCustomersDynamic += 1;
    }
    if (!customersWithStamp.has(customerId)) {
      joinedNeverReturned += 1;
    }
    if (
      lastActivity !== null &&
      lastActivity < dynamicInactiveThreshold &&
      customersWithStamp.has(customerId)
    ) {
      previouslyActiveNowInactive += 1;
    }
  }

  const visits7d = stampEvents.filter(
    (event) => event.createdAt >= sevenDaysAgo
  ).length;
  const visits30d = stampEvents.filter(
    (event) => event.createdAt >= thirtyDaysAgo
  ).length;
  const visitsPrev30d = stampEvents.filter(
    (event) =>
      event.createdAt >= sixtyDaysAgo && event.createdAt < thirtyDaysAgo
  ).length;
  const rewardRedemptions30d = rewardEvents.filter(
    (event) => event.createdAt >= thirtyDaysAgo
  ).length;

  let totalGapDays = 0;
  let totalGapCount = 0;
  for (const timestamps of stampTimestampsByCustomer.values()) {
    if (timestamps.length < 2) {
      continue;
    }
    const sorted = [...timestamps].sort((left, right) => left - right);
    for (let index = 1; index < sorted.length; index += 1) {
      const gapMs = sorted[index] - sorted[index - 1];
      totalGapDays += gapMs / DAY_MS;
      totalGapCount += 1;
    }
  }
  const avgDaysBetweenVisits =
    totalGapCount > 0 ? Number((totalGapDays / totalGapCount).toFixed(2)) : 0;

  let customersCloseToReward = 0;
  let activePrimaryMembers = 0;
  if (input.primaryProgram) {
    const nearRewardRemaining = Math.max(
      1,
      Math.round(input.primaryProgram.maxStamps * 0.2)
    );
    const primaryMembers = activeMemberships.filter(
      (membership) =>
        String(membership.programId) === String(input.primaryProgram?._id)
    );
    activePrimaryMembers = primaryMembers.length;
    for (const membership of primaryMembers) {
      const remaining =
        input.primaryProgram.maxStamps - membership.currentStamps;
      if (remaining > 0 && remaining <= nearRewardRemaining) {
        customersCloseToReward += 1;
      }
    }
  }

  const campaigns30d = input.campaignRuns.filter(
    (run) => run.sentAt >= thirtyDaysAgo
  ).length;
  const activityDropPct30d =
    visitsPrev30d > 0 ? (visitsPrev30d - visits30d) / visitsPrev30d : 0;
  const closeToRewardRate =
    activePrimaryMembers > 0
      ? customersCloseToReward / activePrimaryMembers
      : 0;
  const redemptionRate30d =
    visits30d > 0 ? rewardRedemptions30d / visits30d : 0;

  return {
    metrics: {
      total_customers: totalCustomerSet.size,
      active_customers_30d: activeCustomers30d,
      inactive_customers_60d: inactiveCustomers60d,
      new_customers_30d: newCustomerSet.size,
      visits_7d: visits7d,
      visits_30d: visits30d,
      visits_prev_30d: visitsPrev30d,
      customers_close_to_reward: customersCloseToReward,
      reward_redemptions_30d: rewardRedemptions30d,
      avg_days_between_visits: avgDaysBetweenVisits,
      campaigns_30d: campaigns30d,
      inactive_customers_dynamic: inactiveCustomersDynamic,
      inactive_rate_dynamic:
        totalCustomerSet.size > 0
          ? inactiveCustomersDynamic / totalCustomerSet.size
          : 0,
      close_to_reward_rate: closeToRewardRate,
      redemption_rate_30d: redemptionRate30d,
      activity_drop_pct_30d: activityDropPct30d,
      joined_never_returned: joinedNeverReturned,
      previously_active_now_inactive: previouslyActiveNowInactive,
    } satisfies CoreMetrics,
    lastEventDetectedAt:
      activityEvents.length > 0
        ? Math.max(...activityEvents.map((event) => event.createdAt))
        : null,
    lastRewardRedeemedAt,
  };
}

async function createRecommendationRecord(input: {
  ctx: any;
  businessId: Id<'businesses'>;
  snapshotId: Id<'aiBusinessSnapshots'>;
  stateKey: BusinessState;
  goal: Goal;
  source: 'fixed' | 'cache' | 'ai';
  action: 'show_fixed' | 'call_ai' | 'defer' | 'suppress';
  outputType: RecommendationType;
  title: string;
  message: string;
  ctaType: CtaType;
  ctaLabel: string;
  dedupeKey: string;
  promptHash?: string;
  cacheKey?: string;
  relatedCampaignRunId?: Id<'campaignRuns'>;
  guardrailReason?: string;
  now: number;
}) {
  const recommendationId = await input.ctx.db.insert('aiRecommendations', {
    businessId: input.businessId,
    snapshotId: input.snapshotId,
    stateKey: input.stateKey,
    goal: input.goal,
    source: input.source,
    action: input.action,
    type: input.outputType,
    title: input.title,
    message: input.message,
    ctaType: input.ctaType,
    ctaLabel: input.ctaLabel,
    dedupeKey: input.dedupeKey,
    promptHash: input.promptHash,
    cacheKey: input.cacheKey,
    relatedCampaignRunId: input.relatedCampaignRunId,
    guardrailReason: input.guardrailReason,
    createdAt: input.now,
    shownAt: input.now,
    expiresAt: input.now + CACHE_TTL_MS,
  });

  if (input.relatedCampaignRunId && input.stateKey === 'CAMPAIGN_COMPLETED') {
    await input.ctx.db.patch(input.relatedCampaignRunId, {
      summaryStatus: 'summarized',
      summaryGeneratedAt: input.now,
      updatedAt: input.now,
    });
  }

  return recommendationId as Id<'aiRecommendations'>;
}

async function writeUsageLedger(input: {
  ctx: any;
  businessId: Id<'businesses'>;
  requestType: RecommendationType;
  cacheHit: boolean;
  status: 'success' | 'failed';
  inputTokens: number;
  outputTokens: number;
  costEstimate: number;
  recommendationId?: Id<'aiRecommendations'>;
  createdAt: number;
}) {
  await input.ctx.db.insert('aiUsageLedger', {
    businessId: input.businessId,
    monthKey: monthKeyFromTimestamp(input.createdAt),
    requestType: input.requestType,
    model: MODEL_NAME,
    cacheHit: input.cacheHit,
    status: input.status,
    inputTokens: input.inputTokens,
    outputTokens: input.outputTokens,
    costEstimate: input.costEstimate,
    recommendationId: input.recommendationId,
    createdAt: input.createdAt,
  });
}

function buildDecision(input: {
  topState: BusinessState;
  spec: RecommendationSpec;
  ctaType: CtaType;
  ctaLabel: string;
  enoughData: boolean;
  hasPrimaryProgram: boolean;
  planEligibleForAi: boolean;
  aiQuotaLimit: number;
  aiQuotaUsedMonthly: number;
  aiExecutionsToday: number;
  recommendationsThisWeek: number;
  repeatedEventCooldownActive: boolean;
  campaignCooldownActive: boolean;
  cardChangeCooldownActive: boolean;
  quotaNearLimit: boolean;
  metrics: CoreMetrics;
}): SweepDecision {
  if (!input.hasPrimaryProgram) {
    const fixed = fixedMessageForReason({
      reason: 'NO_ACTIVE_PROGRAM',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'show_fixed',
      reason: 'NO_ACTIVE_PROGRAM',
      goal: 'business_insight',
      outputType: 'recommendation_explanation',
      template: 'recommendation_explanation',
      ctaType: 'none',
      ctaLabel: 'No action needed',
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'NO_ACTIVE_PROGRAM',
    };
  }

  if (!input.enoughData) {
    const fixed = fixedMessageForReason({
      reason: 'NOT_ENOUGH_DATA',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'show_fixed',
      reason: 'NOT_ENOUGH_DATA',
      goal: 'business_insight',
      outputType: 'recommendation_explanation',
      template: 'recommendation_explanation',
      ctaType: 'none',
      ctaLabel: 'No action needed',
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'NOT_ENOUGH_DATA',
    };
  }

  if (input.topState === 'ACTIVITY_NORMAL') {
    const fixed = fixedMessageForReason({
      reason: 'NO_ACTION_NEEDED',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'show_fixed',
      reason: 'NO_ACTION_NEEDED',
      goal: input.spec.goal,
      outputType: input.spec.outputType,
      template: input.spec.template,
      ctaType: 'none',
      ctaLabel: 'No action needed',
      title: fixed.title,
      message: fixed.message,
    };
  }

  if (
    input.topState === 'CARD_RECENTLY_CHANGED' ||
    input.cardChangeCooldownActive
  ) {
    const fixed = fixedMessageForReason({
      reason: 'WAIT_CARD_CHANGE',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'show_fixed',
      reason: 'WAIT_CARD_CHANGE',
      goal: input.spec.goal,
      outputType: 'recommendation_explanation',
      template: 'recommendation_explanation',
      ctaType: 'none',
      ctaLabel: 'No action needed',
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'WAIT_CARD_CHANGE',
    };
  }

  if (input.topState === 'WAIT_BEFORE_NEXT_ACTION') {
    const fixed = fixedMessageForReason({
      reason: 'WAIT_COOLDOWN',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'defer',
      reason: 'WAIT_COOLDOWN',
      goal: input.spec.goal,
      outputType: 'recommendation_explanation',
      template: 'recommendation_explanation',
      ctaType: 'none',
      ctaLabel: 'No action needed',
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'WAIT_COOLDOWN',
    };
  }

  if (input.repeatedEventCooldownActive) {
    const fixed = fixedMessageForReason({
      reason: 'REPEATED_EVENT_COOLDOWN',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'suppress',
      reason: 'REPEATED_EVENT_COOLDOWN',
      goal: input.spec.goal,
      outputType: input.spec.outputType,
      template: input.spec.template,
      ctaType: input.ctaType,
      ctaLabel: input.ctaLabel,
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'REPEATED_EVENT_COOLDOWN',
    };
  }

  if (input.recommendationsThisWeek >= MAX_RECOMMENDATIONS_PER_WEEK) {
    const fixed = fixedMessageForReason({
      reason: 'WEEKLY_RECOMMENDATION_LIMIT',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'defer',
      reason: 'WEEKLY_RECOMMENDATION_LIMIT',
      goal: input.spec.goal,
      outputType: 'recommendation_explanation',
      template: 'recommendation_explanation',
      ctaType: 'none',
      ctaLabel: 'No action needed',
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'WEEKLY_RECOMMENDATION_LIMIT',
    };
  }

  if (
    input.campaignCooldownActive &&
    CAMPAIGN_MESSAGE_STATES.has(input.topState)
  ) {
    const fixed = fixedMessageForReason({
      reason: 'CAMPAIGN_COOLDOWN_ACTIVE',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'show_fixed',
      reason: 'CAMPAIGN_COOLDOWN_ACTIVE',
      goal: 'business_insight',
      outputType: 'recommendation_explanation',
      template: 'recommendation_explanation',
      ctaType: 'none',
      ctaLabel: 'No action needed',
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'CAMPAIGN_COOLDOWN_ACTIVE',
    };
  }

  if (!input.spec.aiPreferred) {
    const fixed = fixedMessageForReason({
      reason: 'SUPPRESSED_BY_RULE',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'show_fixed',
      reason: 'SUPPRESSED_BY_RULE',
      goal: input.spec.goal,
      outputType: input.spec.outputType,
      template: input.spec.template,
      ctaType: input.ctaType,
      ctaLabel: input.ctaLabel,
      title: fixed.title,
      message: fixed.message,
    };
  }

  if (!input.planEligibleForAi || input.aiQuotaLimit <= 0) {
    const fixed = fixedMessageForReason({
      reason: 'PLAN_NOT_ELIGIBLE',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'show_fixed',
      reason: 'PLAN_NOT_ELIGIBLE',
      goal: input.spec.goal,
      outputType: 'recommendation_explanation',
      template: 'recommendation_explanation',
      ctaType: 'view_reason',
      ctaLabel: 'View reason',
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'PLAN_NOT_ELIGIBLE',
    };
  }

  if (input.aiQuotaUsedMonthly >= input.aiQuotaLimit) {
    const fixed = fixedMessageForReason({
      reason: 'QUOTA_EXHAUSTED',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'show_fixed',
      reason: 'QUOTA_EXHAUSTED',
      goal: input.spec.goal,
      outputType: 'recommendation_explanation',
      template: 'recommendation_explanation',
      ctaType: 'view_reason',
      ctaLabel: 'View reason',
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'QUOTA_EXHAUSTED',
    };
  }

  if (input.aiExecutionsToday >= MAX_AI_EXECUTIONS_PER_DAY) {
    const fixed = fixedMessageForReason({
      reason: 'DAILY_AI_LIMIT_REACHED',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'defer',
      reason: 'DAILY_AI_LIMIT_REACHED',
      goal: input.spec.goal,
      outputType: 'recommendation_explanation',
      template: 'recommendation_explanation',
      ctaType: 'none',
      ctaLabel: 'No action needed',
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'DAILY_AI_LIMIT_REACHED',
    };
  }

  if (input.quotaNearLimit && !HIGH_PRIORITY_AI_STATES.has(input.topState)) {
    const fixed = fixedMessageForReason({
      reason: 'QUOTA_NEAR_LIMIT',
      topState: input.topState,
      metrics: input.metrics,
    });
    return {
      action: 'show_fixed',
      reason: 'QUOTA_NEAR_LIMIT',
      goal: input.spec.goal,
      outputType: 'recommendation_explanation',
      template: 'recommendation_explanation',
      ctaType: 'view_reason',
      ctaLabel: 'View reason',
      title: fixed.title,
      message: fixed.message,
      guardrailReason: 'QUOTA_NEAR_LIMIT',
    };
  }

  return {
    action: 'call_ai',
    reason: 'AI_REQUIRED',
    goal: input.spec.goal,
    outputType: input.spec.outputType,
    template: input.spec.template,
    ctaType: input.ctaType,
    ctaLabel: input.ctaLabel,
  };
}

export const listActiveBusinessesForRecommendationSweepInternal = internalQuery(
  {
    args: {},
    handler: async (ctx) => {
      const businesses = await ctx.db
        .query('businesses')
        .withIndex('by_isActive', (q: any) => q.eq('isActive', true))
        .collect();
      return businesses.map((business) => business._id);
    },
  }
);

export const evaluateBusinessRecommendationInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    now: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, now: nowArg }) => {
    const now = nowArg ?? Date.now();
    const business = await ctx.db.get(businessId);
    if (!business || business.isActive !== true) {
      return { status: 'skipped', reason: 'BUSINESS_INACTIVE' as const };
    }

    const monthKey = monthKeyFromTimestamp(now);
    const thirtyDaysAgo = now - 30 * DAY_MS;
    const ninetyDaysAgo = now - 90 * DAY_MS;

    const [
      entitlements,
      programs,
      memberships,
      events,
      campaignRunsRaw,
      aiHistory,
      usageMonth,
    ] = await Promise.all([
      getBusinessEntitlementsForBusinessId(ctx, businessId),
      ctx.db
        .query('loyaltyPrograms')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .filter((q: any) =>
          q.and(
            q.eq(q.field('isActive'), true),
            q.neq(q.field('isArchived'), true)
          )
        )
        .collect(),
      ctx.db
        .query('memberships')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .collect(),
      ctx.db
        .query('events')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .collect(),
      ctx.db
        .query('campaignRuns')
        .withIndex('by_businessId_sentAt', (q: any) =>
          q.eq('businessId', businessId).gte('sentAt', now - 180 * DAY_MS)
        )
        .collect(),
      ctx.db
        .query('aiRecommendations')
        .withIndex('by_businessId_createdAt', (q: any) =>
          q.eq('businessId', businessId).gte('createdAt', ninetyDaysAgo)
        )
        .collect(),
      ctx.db
        .query('aiUsageLedger')
        .withIndex('by_businessId_monthKey', (q: any) =>
          q.eq('businessId', businessId).eq('monthKey', monthKey)
        )
        .collect(),
    ]);

    const campaignRuns = await refreshReadyCampaignRuns({
      ctx,
      businessId,
      runs: campaignRunsRaw,
      events,
      now,
    });

    const stampEvents30d = events.filter(
      (event) =>
        event.type === 'STAMP_ADDED' && event.createdAt >= thirtyDaysAgo
    );
    const activeMemberships = memberships.filter(
      (membership) => membership.isActive === true
    );
    const primaryProgram = selectPrimaryProgram(
      programs,
      activeMemberships,
      stampEvents30d
    );

    const provisionalProfile = normalizeBusinessProfile({
      business,
      primaryProgram,
      avgDaysBetweenVisits: 0,
    });
    const firstMetricsPass = computeCoreMetrics({
      memberships,
      events,
      campaignRuns,
      primaryProgram,
      now,
      customerCycleDays: provisionalProfile.customer_cycle_days,
    });
    const profile = normalizeBusinessProfile({
      business,
      primaryProgram,
      avgDaysBetweenVisits: firstMetricsPass.metrics.avg_days_between_visits,
    });
    const secondMetricsPass = computeCoreMetrics({
      memberships,
      events,
      campaignRuns,
      primaryProgram,
      now,
      customerCycleDays: profile.customer_cycle_days,
    });
    const metrics = secondMetricsPass.metrics;

    const plan = normalizePlan(entitlements.plan);
    const aiQuotaLimit = AI_MONTHLY_QUOTA_BY_PLAN[plan];
    const aiQuotaUsedMonthly = usageMonth.filter(
      (row) => row.status === 'success' && row.cacheHit !== true
    ).length;
    const aiExecutionsToday = usageMonth.filter(
      (row) =>
        row.status === 'success' &&
        row.cacheHit !== true &&
        row.createdAt >= startOfUtcDay(now)
    ).length;
    const quotaNearLimit =
      aiQuotaLimit > 0 && aiQuotaUsedMonthly / aiQuotaLimit >= 0.9;
    const planEligibleForAi =
      entitlements.features.marketingHub === true &&
      entitlements.isSubscriptionActive === true &&
      aiQuotaLimit > 0;

    const sortedCampaignRuns = [...campaignRuns].sort(
      (left, right) => right.sentAt - left.sentAt
    );
    const lastCampaign = sortedCampaignRuns[0] ?? null;
    const readyCampaignRun =
      sortedCampaignRuns.find((run) => run.summaryStatus === 'ready') ?? null;
    const latestRecommendation =
      [...aiHistory].sort(
        (left, right) => right.createdAt - left.createdAt
      )[0] ?? null;

    const trackedDates: TrackedDates = {
      business_created_at: business.createdAt,
      loyalty_card_created_at: primaryProgram?.createdAt ?? null,
      loyalty_card_updated_at:
        primaryProgram?.lastStructureChangedAt ??
        primaryProgram?.updatedAt ??
        null,
      last_campaign_at: lastCampaign?.sentAt ?? null,
      last_ai_recommendation_at: latestRecommendation?.createdAt ?? null,
      last_event_detected_at: secondMetricsPass.lastEventDetectedAt,
      last_reward_redeemed_at: secondMetricsPass.lastRewardRedeemedAt,
    };

    const businessAgeDays = Math.floor((now - business.createdAt) / DAY_MS);
    const enoughDataReasons: string[] = [];
    if (metrics.total_customers < MIN_CUSTOMERS) {
      enoughDataReasons.push('min_customers');
    }
    if (businessAgeDays < MIN_ACTIVITY_DAYS) {
      enoughDataReasons.push('min_activity_days');
    }
    if (metrics.visits_30d < MIN_VISITS_LAST_30D) {
      enoughDataReasons.push('min_visits_last_30d');
    }
    const enoughData = enoughDataReasons.length === 0;

    const daysSinceCardChange =
      trackedDates.loyalty_card_updated_at !== null
        ? Math.floor((now - trackedDates.loyalty_card_updated_at) / DAY_MS)
        : null;
    const daysSinceLastCampaign =
      trackedDates.last_campaign_at !== null
        ? Math.floor((now - trackedDates.last_campaign_at) / DAY_MS)
        : null;
    const daysSinceLastRecommendation =
      trackedDates.last_ai_recommendation_at !== null
        ? Math.floor((now - trackedDates.last_ai_recommendation_at) / DAY_MS)
        : null;
    const recommendationUsage30d = aiHistory.filter(
      (row) => row.createdAt >= thirtyDaysAgo && row.action !== 'suppress'
    ).length;

    const detectedStates = detectStates({
      businessAgeDays,
      metrics,
      profile,
      daysSinceCardChange,
      daysSinceLastCampaign,
      daysSinceLastRecommendation,
      hasReadyCampaignSummary: readyCampaignRun !== null,
      recommendationUsage30d,
    });
    const topState = topStateFromDetectedStates(detectedStates);
    const stateSignal = buildStateSignal({
      topState,
      metrics,
      profile,
      campaignRunId: readyCampaignRun ? String(readyCampaignRun._id) : null,
    });
    const stateHash = buildStateHash({
      businessId,
      topState,
      stateSignal,
      metrics,
      profile,
      trackedDates,
      primaryProgramId: primaryProgram?._id ?? null,
    });

    const snapshot = {
      package_plan: plan,
      normalized_business_profile: profile,
      key_performance_metrics: metrics,
      customer_state: {
        total_customers: metrics.total_customers,
        active_customers_30d: metrics.active_customers_30d,
        inactive_customers_60d: metrics.inactive_customers_60d,
        new_customers_30d: metrics.new_customers_30d,
        joined_never_returned: metrics.joined_never_returned,
        previously_active_now_inactive: metrics.previously_active_now_inactive,
      },
      product_usage_state: {
        has_active_loyalty_card: primaryProgram !== null,
        active_program_count: programs.length,
        card_recently_changed:
          daysSinceCardChange !== null &&
          daysSinceCardChange <= CARD_CHANGE_COOLDOWN_DAYS,
        changed_card_days_ago: daysSinceCardChange,
        campaigns_30d: metrics.campaigns_30d,
        has_recent_campaign:
          daysSinceLastCampaign !== null &&
          daysSinceLastCampaign < CAMPAIGN_COOLDOWN_DAYS,
        recommendation_usage_30d: recommendationUsage30d,
      },
      cooldown_quota_state: {
        card_change_cooldown_days: CARD_CHANGE_COOLDOWN_DAYS,
        campaign_cooldown_days: CAMPAIGN_COOLDOWN_DAYS,
        repeated_event_cooldown_days: REPEATED_EVENT_COOLDOWN_DAYS,
        max_recommendations_per_week: MAX_RECOMMENDATIONS_PER_WEEK,
        max_ai_executions_per_day: MAX_AI_EXECUTIONS_PER_DAY,
        ai_plan_quota_monthly: aiQuotaLimit,
        ai_quota_used_monthly: aiQuotaUsedMonthly,
        ai_quota_remaining_monthly: Math.max(
          0,
          aiQuotaLimit - aiQuotaUsedMonthly
        ),
        ai_executions_today: aiExecutionsToday,
        recommendations_this_week: aiHistory.filter(
          (row) =>
            row.createdAt >= now - 7 * DAY_MS &&
            row.action !== 'suppress' &&
            row.action !== 'defer'
        ).length,
        plan_eligible_for_ai: planEligibleForAi,
        quota_near_limit: quotaNearLimit,
      },
      detected_states: detectedStates,
      top_priority_state: topState,
      enough_data: enoughData,
      enough_data_reasons: enoughDataReasons,
      required_dates: trackedDates,
      state_signal: stateSignal,
      state_hash: stateHash,
    } satisfies BusinessHealthSnapshot;

    const snapshotId = await ctx.db.insert('aiBusinessSnapshots', {
      businessId,
      scannedAt: now,
      enoughData,
      enoughDataReasons,
      topBusinessState: topState,
      primaryProgramId: primaryProgram?._id ?? undefined,
      stateHash,
      snapshot,
      createdAt: now,
    });

    const snapshotRetentionThreshold = now - SNAPSHOT_RETENTION_DAYS * DAY_MS;
    const oldSnapshots = await ctx.db
      .query('aiBusinessSnapshots')
      .withIndex('by_businessId_createdAt', (q: any) =>
        q.eq('businessId', businessId)
      )
      .collect();
    await Promise.all(
      oldSnapshots
        .filter((row) => row.createdAt < snapshotRetentionThreshold)
        .map((row) => ctx.db.delete(row._id))
    );

    const spec = stateSpecForState(topState);
    const cta = ctaForRecommendationType(spec.outputType, topState);
    const dedupeKey = `${topState}:${hashString(`${topState}|${stateSignal}`)}`;
    const dedupeHistory = await ctx.db
      .query('aiRecommendations')
      .withIndex('by_businessId_dedupeKey', (q: any) =>
        q.eq('businessId', businessId).eq('dedupeKey', dedupeKey)
      )
      .collect();
    const repeatedEventCooldownActive = dedupeHistory.some(
      (row) =>
        row.createdAt >= now - REPEATED_EVENT_COOLDOWN_DAYS * DAY_MS &&
        row.action !== 'suppress'
    );

    const recommendationsThisWeek = aiHistory.filter(
      (row) =>
        row.createdAt >= now - 7 * DAY_MS &&
        row.action !== 'suppress' &&
        row.action !== 'defer'
    ).length;
    const campaignCooldownActive =
      daysSinceLastCampaign !== null &&
      daysSinceLastCampaign < CAMPAIGN_COOLDOWN_DAYS;
    const cardChangeCooldownActive =
      daysSinceCardChange !== null &&
      daysSinceCardChange <= CARD_CHANGE_COOLDOWN_DAYS;

    const decision = buildDecision({
      topState,
      spec,
      ctaType: cta.ctaType,
      ctaLabel: cta.ctaLabel,
      enoughData,
      hasPrimaryProgram: primaryProgram !== null,
      planEligibleForAi,
      aiQuotaLimit,
      aiQuotaUsedMonthly,
      aiExecutionsToday,
      recommendationsThisWeek,
      repeatedEventCooldownActive,
      campaignCooldownActive,
      cardChangeCooldownActive,
      quotaNearLimit,
      metrics,
    });

    if (decision.action !== 'call_ai') {
      if (decision.action === 'suppress') {
        return {
          status: 'completed',
          outcome: 'suppress',
          businessId,
          topState,
          snapshotId,
        } as const;
      }

      const recommendationId = await createRecommendationRecord({
        ctx,
        businessId,
        snapshotId,
        stateKey: topState,
        goal: decision.goal,
        source: 'fixed',
        action: decision.action,
        outputType: decision.outputType,
        title: decision.title,
        message: decision.message,
        ctaType: decision.ctaType,
        ctaLabel: decision.ctaLabel,
        dedupeKey,
        relatedCampaignRunId:
          topState === 'CAMPAIGN_COMPLETED' && readyCampaignRun
            ? readyCampaignRun._id
            : undefined,
        guardrailReason: decision.guardrailReason,
        now,
      });

      return {
        status: 'completed',
        outcome: decision.action === 'defer' ? 'defer' : 'fixed',
        businessId,
        topState,
        snapshotId,
        recommendationId,
      } as const;
    }

    const prompt = buildPromptFromTemplate({
      template: decision.template,
      goal: decision.goal,
      state: topState,
      profile,
      metrics,
      campaignRun: readyCampaignRun,
      reason: decision.reason,
    });
    const promptHash = hashString(prompt);
    const inputSignature = hashString(
      JSON.stringify({
        topState,
        goal: decision.goal,
        outputType: decision.outputType,
        profile,
        metrics: {
          visits_30d: metrics.visits_30d,
          visits_prev_30d: metrics.visits_prev_30d,
          inactive_customers_dynamic: metrics.inactive_customers_dynamic,
          customers_close_to_reward: metrics.customers_close_to_reward,
          reward_redemptions_30d: metrics.reward_redemptions_30d,
          campaigns_30d: metrics.campaigns_30d,
        },
        campaignRunId: readyCampaignRun ? String(readyCampaignRun._id) : null,
      })
    );
    const cacheKey = buildCacheKey({
      businessId,
      profile,
      goal: decision.goal,
      outputType: decision.outputType,
      topState,
      stateSignal,
      stateHash,
      structureSignature: primaryProgram?.structureSignature ?? null,
    });

    const useCache = !shouldIgnoreCacheForCardChange({
      topState,
      changedCardDaysAgo: daysSinceCardChange,
    });
    if (useCache) {
      const cacheRows = await ctx.db
        .query('aiGenerationCache')
        .withIndex('by_cacheKey', (q: any) => q.eq('cacheKey', cacheKey))
        .collect();
      const validCache = cacheRows
        .filter(
          (row) =>
            row.expiresAt > now &&
            row.promptHash === promptHash &&
            row.goal === decision.goal
        )
        .sort((left, right) => right.createdAt - left.createdAt)[0] as
        | CachedGeneration
        | undefined;

      if (validCache) {
        const recommendationId = await createRecommendationRecord({
          ctx,
          businessId,
          snapshotId,
          stateKey: topState,
          goal: decision.goal,
          source: 'cache',
          action: 'call_ai',
          outputType: decision.outputType,
          title: validCache.responseJson.title,
          message: truncateWords(
            validCache.responseJson.message,
            MAX_WORDS_BY_OUTPUT_TYPE[decision.outputType]
          ),
          ctaType: decision.ctaType,
          ctaLabel: decision.ctaLabel,
          dedupeKey,
          promptHash,
          cacheKey,
          relatedCampaignRunId:
            topState === 'CAMPAIGN_COMPLETED' && readyCampaignRun
              ? readyCampaignRun._id
              : undefined,
          now,
        });

        await writeUsageLedger({
          ctx,
          businessId,
          requestType: decision.outputType,
          cacheHit: true,
          status: 'success',
          inputTokens: 0,
          outputTokens: 0,
          costEstimate: 0,
          recommendationId,
          createdAt: now,
        });

        await ctx.db.patch(validCache._id, { lastUsedAt: now });
        return {
          status: 'completed',
          outcome: 'cache',
          businessId,
          topState,
          snapshotId,
          recommendationId,
        } as const;
      }
    }

    return {
      status: 'needs_ai',
      businessId,
      snapshotId,
      topState,
      goal: decision.goal,
      outputType: decision.outputType,
      ctaType: decision.ctaType,
      ctaLabel: decision.ctaLabel,
      dedupeKey,
      prompt,
      promptHash,
      cacheKey,
      inputSignature,
      guardrailReason: undefined,
      relatedCampaignRunId:
        topState === 'CAMPAIGN_COMPLETED' && readyCampaignRun
          ? readyCampaignRun._id
          : undefined,
    } as const;
  },
});

export const finalizeAiRecommendationSuccessInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    snapshotId: v.id('aiBusinessSnapshots'),
    stateKey: v.string(),
    goal: GOAL_UNION,
    outputType: RECOMMENDATION_TYPE_UNION,
    ctaType: CTA_TYPE_UNION,
    ctaLabel: v.string(),
    dedupeKey: v.string(),
    promptHash: v.string(),
    cacheKey: v.string(),
    inputSignature: v.string(),
    title: v.string(),
    message: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costEstimate: v.number(),
    relatedCampaignRunId: v.optional(v.id('campaignRuns')),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const recommendationId = await createRecommendationRecord({
      ctx,
      businessId: args.businessId,
      snapshotId: args.snapshotId,
      stateKey: args.stateKey as BusinessState,
      goal: args.goal,
      source: 'ai',
      action: 'call_ai',
      outputType: args.outputType,
      title: truncateWords(normalizeWhitespace(args.title), 8).slice(0, 80),
      message: truncateWords(
        normalizeWhitespace(args.message),
        MAX_WORDS_BY_OUTPUT_TYPE[args.outputType]
      ),
      ctaType: args.ctaType,
      ctaLabel: normalizeWhitespace(args.ctaLabel) || 'View',
      dedupeKey: args.dedupeKey,
      promptHash: args.promptHash,
      cacheKey: args.cacheKey,
      relatedCampaignRunId: args.relatedCampaignRunId,
      now: args.now,
    });

    await ctx.db.insert('aiGenerationCache', {
      cacheKey: args.cacheKey,
      promptHash: args.promptHash,
      goal: args.goal,
      model: MODEL_NAME,
      responseJson: {
        type: args.outputType,
        title: truncateWords(normalizeWhitespace(args.title), 8).slice(0, 80),
        message: truncateWords(
          normalizeWhitespace(args.message),
          MAX_WORDS_BY_OUTPUT_TYPE[args.outputType]
        ),
      },
      inputSignature: args.inputSignature,
      createdAt: args.now,
      expiresAt: args.now + CACHE_TTL_MS,
      lastUsedAt: args.now,
    });

    await writeUsageLedger({
      ctx,
      businessId: args.businessId,
      requestType: args.outputType,
      cacheHit: false,
      status: 'success',
      inputTokens: Math.max(0, Math.floor(args.inputTokens)),
      outputTokens: Math.max(0, Math.floor(args.outputTokens)),
      costEstimate: Math.max(0, args.costEstimate),
      recommendationId,
      createdAt: args.now,
    });

    return {
      ok: true,
      recommendationId,
    };
  },
});

export const finalizeAiRecommendationFailureInternal = internalMutation({
  args: {
    businessId: v.id('businesses'),
    snapshotId: v.id('aiBusinessSnapshots'),
    stateKey: v.string(),
    goal: GOAL_UNION,
    outputType: RECOMMENDATION_TYPE_UNION,
    dedupeKey: v.string(),
    reason: v.string(),
    inputTokens: v.number(),
    outputTokens: v.number(),
    costEstimate: v.number(),
    relatedCampaignRunId: v.optional(v.id('campaignRuns')),
    now: v.number(),
  },
  handler: async (ctx, args) => {
    const fixed = fixedMessageForReason({
      reason: 'AI_REQUEST_FAILED',
      topState: args.stateKey as BusinessState,
      metrics: {
        total_customers: 0,
        active_customers_30d: 0,
        inactive_customers_60d: 0,
        new_customers_30d: 0,
        visits_7d: 0,
        visits_30d: 0,
        visits_prev_30d: 0,
        customers_close_to_reward: 0,
        reward_redemptions_30d: 0,
        avg_days_between_visits: 0,
        campaigns_30d: 0,
        inactive_customers_dynamic: 0,
        inactive_rate_dynamic: 0,
        close_to_reward_rate: 0,
        redemption_rate_30d: 0,
        activity_drop_pct_30d: 0,
        joined_never_returned: 0,
        previously_active_now_inactive: 0,
      },
    });

    const recommendationId = await createRecommendationRecord({
      ctx,
      businessId: args.businessId,
      snapshotId: args.snapshotId,
      stateKey: args.stateKey as BusinessState,
      goal: args.goal,
      source: 'fixed',
      action: 'show_fixed',
      outputType: 'recommendation_explanation',
      title: fixed.title,
      message: `${fixed.message} (${args.reason.slice(0, 80)})`,
      ctaType: 'view_reason',
      ctaLabel: 'View reason',
      dedupeKey: args.dedupeKey,
      relatedCampaignRunId: args.relatedCampaignRunId,
      guardrailReason: 'AI_REQUEST_FAILED',
      now: args.now,
    });

    await writeUsageLedger({
      ctx,
      businessId: args.businessId,
      requestType: args.outputType,
      cacheHit: false,
      status: 'failed',
      inputTokens: Math.max(0, Math.floor(args.inputTokens)),
      outputTokens: Math.max(0, Math.floor(args.outputTokens)),
      costEstimate: Math.max(0, args.costEstimate),
      recommendationId,
      createdAt: args.now,
    });

    return { ok: true, recommendationId };
  },
});

export const runRecommendationSweepInternal = internalAction({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    const businessIds = await ctx.runQuery(
      internal.aiRecommendations
        .listActiveBusinessesForRecommendationSweepInternal,
      {}
    );

    let processedBusinesses = 0;
    let fixedCount = 0;
    let cacheCount = 0;
    let aiSuccessCount = 0;
    let aiFailureCount = 0;
    let deferCount = 0;
    let suppressCount = 0;

    for (const businessId of businessIds) {
      const evaluation = (await ctx.runMutation(
        internal.aiRecommendations.evaluateBusinessRecommendationInternal,
        {
          businessId,
          now,
        }
      )) as EvaluationResult;

      if (!evaluation || evaluation.status === 'skipped') {
        continue;
      }

      processedBusinesses += 1;

      if (evaluation.status === 'completed') {
        if (evaluation.outcome === 'fixed') {
          fixedCount += 1;
        } else if (evaluation.outcome === 'cache') {
          cacheCount += 1;
        } else if (evaluation.outcome === 'defer') {
          deferCount += 1;
        } else if (evaluation.outcome === 'suppress') {
          suppressCount += 1;
        }
        continue;
      }

      if (evaluation.status !== 'needs_ai') {
        continue;
      }

      const aiResult = await callGeminiJson({
        prompt: evaluation.prompt,
        expectedType: evaluation.outputType,
      });

      if (aiResult.ok) {
        await ctx.runMutation(
          internal.aiRecommendations.finalizeAiRecommendationSuccessInternal,
          {
            businessId: evaluation.businessId,
            snapshotId: evaluation.snapshotId,
            stateKey: evaluation.topState,
            goal: evaluation.goal,
            outputType: evaluation.outputType,
            ctaType: evaluation.ctaType,
            ctaLabel: evaluation.ctaLabel,
            dedupeKey: evaluation.dedupeKey,
            promptHash: evaluation.promptHash,
            cacheKey: evaluation.cacheKey,
            inputSignature: evaluation.inputSignature,
            title: aiResult.output.title,
            message: aiResult.output.message,
            inputTokens: aiResult.inputTokens,
            outputTokens: aiResult.outputTokens,
            costEstimate: aiResult.costEstimate,
            relatedCampaignRunId: evaluation.relatedCampaignRunId,
            now,
          }
        );
        aiSuccessCount += 1;
      } else {
        await ctx.runMutation(
          internal.aiRecommendations.finalizeAiRecommendationFailureInternal,
          {
            businessId: evaluation.businessId,
            snapshotId: evaluation.snapshotId,
            stateKey: evaluation.topState,
            goal: evaluation.goal,
            outputType: evaluation.outputType,
            dedupeKey: evaluation.dedupeKey,
            reason: aiResult.reason,
            inputTokens: aiResult.inputTokens,
            outputTokens: aiResult.outputTokens,
            costEstimate: aiResult.costEstimate,
            relatedCampaignRunId: evaluation.relatedCampaignRunId,
            now,
          }
        );
        aiFailureCount += 1;
      }
    }

    return {
      processedBusinesses,
      fixedCount,
      cacheCount,
      aiSuccessCount,
      aiFailureCount,
      deferCount,
      suppressCount,
      model: MODEL_NAME,
      limits: {
        maxInputTokens: MAX_INPUT_TOKENS,
        maxOutputTokens: MAX_OUTPUT_TOKENS,
        maxAiExecutionsPerDay: MAX_AI_EXECUTIONS_PER_DAY,
        maxRecommendationsPerWeek: MAX_RECOMMENDATIONS_PER_WEEK,
      },
    };
  },
});

export const getLatestRecommendationForBusiness = query({
  args: {
    businessId: v.optional(v.id('businesses')),
  },
  handler: async (ctx, { businessId }) => {
    if (!businessId) {
      return null;
    }
    await requireActorIsStaffForBusiness(ctx, businessId);

    const now = Date.now();
    const rows = await ctx.db
      .query('aiRecommendations')
      .withIndex('by_businessId_createdAt', (q: any) =>
        q.eq('businessId', businessId)
      )
      .collect();

    const sorted = rows
      .filter(
        (row) =>
          row.action !== 'suppress' &&
          row.action !== 'defer' &&
          (row.expiresAt === undefined || row.expiresAt > now) &&
          (row.consumedAt === undefined || row.ctaType === 'none')
      )
      .sort((left, right) => right.createdAt - left.createdAt);

    const recommendation = sorted[0];
    if (!recommendation) {
      return null;
    }

    return {
      recommendationId: recommendation._id,
      stateKey: recommendation.stateKey,
      goal: recommendation.goal,
      type: recommendation.type,
      source: recommendation.source,
      title: recommendation.title,
      message: recommendation.message,
      ctaType: recommendation.ctaType,
      ctaLabel: recommendation.ctaLabel,
      guardrailReason: recommendation.guardrailReason ?? null,
      createdAt: recommendation.createdAt,
      relatedCampaignRunId: recommendation.relatedCampaignRunId ?? null,
    };
  },
});

export const executeRecommendationPrimaryCta = mutation({
  args: {
    businessId: v.id('businesses'),
    recommendationId: v.id('aiRecommendations'),
  },
  handler: async (ctx, { businessId, recommendationId }) => {
    await requireActorIsStaffForBusiness(ctx, businessId);
    const recommendation = await ctx.db.get(recommendationId);
    if (!recommendation || recommendation.businessId !== businessId) {
      throw new Error('RECOMMENDATION_NOT_FOUND');
    }

    const now = Date.now();
    if (recommendation.ctaType === 'open_draft') {
      await requireActorIsBusinessOwnerOrManager(ctx, businessId);
      const snapshot = recommendation.snapshotId
        ? await ctx.db.get(recommendation.snapshotId)
        : null;
      const defaultProgramId = snapshot?.primaryProgramId;

      const campaignId = await ctx.db.insert('campaigns', {
        businessId,
        type: 'promo',
        title: recommendation.title || 'Campaign draft',
        messageTitle: recommendation.title || 'Campaign draft',
        messageBody: recommendation.message,
        rules: { audience: 'all_active_members' as const },
        channels: ['in_app'],
        programId: defaultProgramId ?? undefined,
        status: 'draft',
        automationEnabled: false,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });

      await ctx.db.patch(recommendationId, { consumedAt: now });
      return {
        kind: 'open_draft' as const,
        campaignId,
      };
    }

    await ctx.db.patch(recommendationId, { consumedAt: now });
    if (recommendation.ctaType === 'view_insight') {
      return { kind: 'view_insight' as const };
    }
    if (recommendation.ctaType === 'view_summary') {
      return { kind: 'view_summary' as const };
    }
    if (recommendation.ctaType === 'view_reason') {
      return { kind: 'view_reason' as const };
    }

    return { kind: 'none' as const };
  },
});

export const getAiRecommendationAnalytics = query({
  args: {
    businessId: v.optional(v.id('businesses')),
    days: v.optional(v.number()),
  },
  handler: async (ctx, { businessId, days }) => {
    if (!businessId) {
      return null;
    }
    await requireActorIsStaffForBusiness(ctx, businessId);

    const now = Date.now();
    const windowDays = clamp(Math.floor(safeNumber(days, 30)), 7, 180);
    const windowStart = now - windowDays * DAY_MS;

    const [usageRows, recommendationRows, entitlements] = await Promise.all([
      ctx.db
        .query('aiUsageLedger')
        .withIndex('by_businessId', (q: any) => q.eq('businessId', businessId))
        .collect(),
      ctx.db
        .query('aiRecommendations')
        .withIndex('by_businessId_createdAt', (q: any) =>
          q.eq('businessId', businessId).gte('createdAt', windowStart)
        )
        .collect(),
      getBusinessEntitlementsForBusinessId(ctx, businessId),
    ]);

    const scopedUsage = usageRows.filter((row) => row.createdAt >= windowStart);
    const aiCalls = scopedUsage.filter(
      (row) => row.status === 'success' && row.cacheHit !== true
    ).length;
    const cacheHits = scopedUsage.filter(
      (row) => row.status === 'success' && row.cacheHit === true
    ).length;
    const aiFailures = scopedUsage.filter(
      (row) => row.status === 'failed'
    ).length;

    const aiTokensInput = scopedUsage.reduce(
      (sum, row) => sum + Math.max(0, row.inputTokens),
      0
    );
    const aiTokensOutput = scopedUsage.reduce(
      (sum, row) => sum + Math.max(0, row.outputTokens),
      0
    );
    const aiCostEstimate = Number(
      scopedUsage
        .reduce((sum, row) => sum + Math.max(0, row.costEstimate), 0)
        .toFixed(6)
    );

    const recommendationShownCount = recommendationRows.filter(
      (row) =>
        row.shownAt !== undefined ||
        row.action === 'show_fixed' ||
        row.action === 'call_ai'
    ).length;
    const recommendationIgnoredCount = recommendationRows.filter(
      (row) =>
        row.ctaType !== 'none' &&
        row.consumedAt === undefined &&
        row.createdAt < now - 7 * DAY_MS
    ).length;

    const plan = normalizePlan(entitlements.plan);
    const monthKey = monthKeyFromTimestamp(now);
    const monthUsage = usageRows.filter(
      (row) =>
        row.monthKey === monthKey &&
        row.status === 'success' &&
        row.cacheHit !== true
    ).length;
    const monthlyQuota = AI_MONTHLY_QUOTA_BY_PLAN[plan];

    return {
      windowDays,
      ai_calls: aiCalls,
      ai_tokens_input: aiTokensInput,
      ai_tokens_output: aiTokensOutput,
      ai_cost_estimate: aiCostEstimate,
      ai_failures: aiFailures,
      recommendation_shown_count: recommendationShownCount,
      recommendation_ignored_count: recommendationIgnoredCount,
      cache_hit_rate:
        aiCalls + cacheHits > 0
          ? Number((cacheHits / (aiCalls + cacheHits)).toFixed(4))
          : 0,
      quota_usage_per_business: {
        monthKey,
        used: monthUsage,
        limit: monthlyQuota,
        remaining: Math.max(0, monthlyQuota - monthUsage),
      },
    };
  },
});
