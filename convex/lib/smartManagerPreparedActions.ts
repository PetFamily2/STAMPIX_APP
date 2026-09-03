import type { Doc } from '../_generated/dataModel';
import { buildBusinessEntitlementsFromBusiness } from '../entitlements';
import type {
  SmartManagerAuthorityBlocker,
  SmartManagerDecisionAuthorityResult,
} from './smartManagerAuthority';
import { hashSmartManagerValue } from './smartManagerPolicy';
import type { BusinessCapabilityMap } from './staffPermissions';
import {
  type AiJsonFailureCode,
  OPENROUTER_JSON_MODEL,
} from './aiJsonGeneration';

export const SMART_MANAGER_PREPARED_ACTION_SCHEMA_VERSION = 1 as const;
export const SMART_MANAGER_WINBACK_ACTION_CONTRACT_VERSION =
  'smart-manager-winback-action-v1' as const;
export const SMART_MANAGER_AUDIENCE_DEFINITION_VERSION =
  'smart-manager-at-risk-v1' as const;
export const SMART_MANAGER_CHANNEL_STRATEGY_VERSION =
  'push-with-in-app-fallback-v1' as const;
export const SMART_MANAGER_FALLBACK_GENERATION_VERSION =
  'smart-manager-winback-fallback-v1' as const;
export const SMART_MANAGER_AI_GENERATION_VERSION =
  'smart-manager-winback-copy-v1' as const;
export const SMART_MANAGER_AI_PROMPT_VERSION =
  'smart-manager-winback-prompt-v1' as const;
export const SMART_MANAGER_AI_CACHE_NAMESPACE =
  'smart-manager:winback-copy:cache-v1' as const;
export const SMART_MANAGER_MAX_COPY_REVISION_SLOTS = 10;
export const SMART_MANAGER_AI_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
export const SMART_MANAGER_AI_TITLE_MAX_CHARACTERS = 60;
export const SMART_MANAGER_AI_BODY_MAX_CHARACTERS = 240;

export function getSmartManagerFreshAiMinimumAudience(
  policy: {
    config?: {
      aiGeneration?: {
        minimumAudienceForFreshGeneration?: number;
      };
    };
  } | null | undefined
) {
  const configuredValue =
    policy?.config?.aiGeneration?.minimumAudienceForFreshGeneration;
  if (
    typeof configuredValue !== 'number' ||
    !Number.isFinite(configuredValue) ||
    !Number.isInteger(configuredValue) ||
    configuredValue < 1
  ) {
    return null;
  }
  return configuredValue;
}

export function isBelowSmartManagerFreshAiMinimum(
  audienceCount: number,
  policy: {
    config?: {
      aiGeneration?: {
        minimumAudienceForFreshGeneration?: number;
      };
    };
  } | null | undefined
) {
  const minimum = getSmartManagerFreshAiMinimumAudience(policy);
  if (typeof minimum !== 'number' || !Number.isFinite(minimum)) {
    return true;
  }
  return audienceCount < minimum;
}

export const SMART_MANAGER_WINBACK_FALLBACK_COPY = {
  title: 'נשמח לראות אתכם שוב',
  body: 'עבר זמן מאז הביקור האחרון שלכם. נשמח לראות אתכם שוב בקרוב.',
} as const;

export const SMART_MANAGER_WINBACK_CAMPAIGN_DRAFT = {
  type: 'winback' as const,
  family: 'lifecycle' as const,
  opportunityType: 'winback' as const,
  audienceSource: 'automatic' as const,
  internalTitle: 'קמפיין החזרת לקוחות' as const,
};

export const SMART_MANAGER_WINBACK_CHANNEL_STRATEGY = {
  channelStrategyVersion: SMART_MANAGER_CHANNEL_STRATEGY_VERSION,
  preferredChannels: ['push', 'in_app'] as Array<'push' | 'in_app'>,
  supportedChannels: ['push', 'in_app'] as Array<'push' | 'in_app'>,
  campaignCompatibleChannels: ['push', 'in_app'] as Array<
    'push' | 'in_app'
  >,
  primaryIntent: 'push' as const,
  fallbackIntent: 'in_app' as const,
  reachabilityResolution: 'deferred_to_batch_3' as const,
};

const DAY_MS = 24 * 60 * 60 * 1000;
const HOUR_MS = 60 * 60 * 1000;
export const SMART_MANAGER_PREPARED_ACTION_RETENTION_MS = 90 * DAY_MS;

export type PreparedWinbackAuthorization = {
  staffRole: 'owner' | 'manager' | 'staff';
  capabilities: BusinessCapabilityMap;
};

export type SmartManagerAccessBlocker =
  | 'ACTIVATE_SEND_CAMPAIGNS_REQUIRED'
  | 'CAMPAIGN_LIMIT_REACHED'
  | 'CAMPAIGN_QUOTA_EVIDENCE_INVALID'
  | 'CAMPAIGN_QUOTA_REEVALUATION_PENDING'
  | 'CREATE_CAMPAIGNS_REQUIRED'
  | 'SMART_MANAGER_FEATURE_UNAVAILABLE'
  | 'SUBSCRIPTION_INACTIVE';

export type SmartManagerRegenerationReason =
  | 'AI_ASSIST_NOT_AVAILABLE'
  | 'AI_SUBSCRIPTION_INACTIVE'
  | 'AI_FRESH_AUDIENCE_BELOW_MINIMUM'
  | 'AI_MONTHLY_QUOTA_EXHAUSTED'
  | 'AI_USAGE_EVIDENCE_UNAVAILABLE'
  | 'AI_RATE_LIMITED'
  | 'AI_GENERATION_SCHEDULING_FAILED'
  | 'AI_GENERATION_IN_PROGRESS'
  | 'AI_CACHE_UNAVAILABLE'
  | 'COPY_REVISION_LIMIT_REACHED'
  | 'REEVALUATION_PENDING'
  | 'ACTION_STALE'
  | 'ACTION_EXPIRED';

export type SmartManagerAiFailureCode =
  | AiJsonFailureCode
  | 'AI_ASSIST_NOT_AVAILABLE'
  | 'AI_SUBSCRIPTION_INACTIVE'
  | 'AI_FRESH_AUDIENCE_BELOW_MINIMUM'
  | 'AI_MONTHLY_QUOTA_EXHAUSTED'
  | 'AI_USAGE_EVIDENCE_UNAVAILABLE'
  | 'AI_RATE_LIMITED'
  | 'AI_GENERATION_SCHEDULING_FAILED'
  | 'AI_CACHE_UNAVAILABLE'
  | 'COPY_REVISION_CONFLICT'
  | 'ACTION_STALE'
  | 'ACTION_EXPIRED'
  | 'REEVALUATION_PENDING';

export type SmartManagerAccessCurrentnessBlocker =
  | 'CAMPAIGN_QUOTA_EVIDENCE_INVALID'
  | 'CAMPAIGN_QUOTA_REEVALUATION_PENDING';

export type SmartManagerBoundedAccessContext = {
  blockers: SmartManagerAccessBlocker[];
  campaignQuotaCurrent: boolean;
  campaignUsage: number | null;
  campaignLimit: number | null;
  hasSmartManagerAccess: boolean;
  hasAiAssist: boolean;
  aiAssistReason: Extract<
    SmartManagerRegenerationReason,
    'AI_ASSIST_NOT_AVAILABLE' | 'AI_SUBSCRIPTION_INACTIVE'
  > | null;
  aiMonthlyLimit: number;
  hasPreparationCapabilities: boolean;
  hasApprovalCapabilities: boolean;
  campaignCapacityAvailable: boolean;
};

export type PreparedActionCurrentnessBlocker =
  | SmartManagerAuthorityBlocker
  | 'ACTION_AUDIENCE_BINDING_CHANGED'
  | 'ACTION_AUTHORITY_BINDING_CHANGED'
  | 'ACTION_AUTHORITY_MODE_CHANGED'
  | 'ACTION_CONTRACT_INVALID'
  | 'ACTION_DECISION_BINDING_CHANGED'
  | 'ACTION_EXPIRED'
  | 'ACTION_NOT_REVIEWABLE'
  | 'ACTION_PREPARATION_KEY_CHANGED';

export function selectSmartManagerAccessCurrentnessBlockers(
  blockers: readonly SmartManagerAccessBlocker[]
): SmartManagerAccessCurrentnessBlocker[] {
  return blockers.filter(
    (blocker): blocker is SmartManagerAccessCurrentnessBlocker =>
      blocker === 'CAMPAIGN_QUOTA_EVIDENCE_INVALID' ||
      blocker === 'CAMPAIGN_QUOTA_REEVALUATION_PENDING'
  );
}

function hasExactChannelContract(
  channels: Array<'push' | 'in_app'>
) {
  return (
    channels.length === 2 &&
    channels[0] === 'push' &&
    channels[1] === 'in_app'
  );
}

export function requirePreparedWinbackAuthorization(
  authorization: PreparedWinbackAuthorization
) {
  if (
    (authorization.staffRole !== 'owner' &&
      authorization.staffRole !== 'manager') ||
    authorization.capabilities.access_customers !== true ||
    authorization.capabilities.access_campaigns !== true ||
    authorization.capabilities.create_campaigns !== true
  ) {
    throw new Error('NOT_AUTHORIZED');
  }
  return authorization;
}

export function buildBoundedSmartManagerAccessContext(args: {
  business: Doc<'businesses'>;
  authorization: PreparedWinbackAuthorization;
  authority: SmartManagerDecisionAuthorityResult;
  now: number;
}): SmartManagerBoundedAccessContext {
  const blockers: SmartManagerAccessBlocker[] = [];
  const quotaFact = args.authority.factSnapshot?.facts?.facts?.campaignQuota;
  const knownQuotaFact = quotaFact?.state === 'known' ? quotaFact : null;
  const quotaObservedAt = Number(knownQuotaFact?.observedAt);
  const actionExpiryHours = Number(
    args.authority.policy?.config.actionExpiryHours
  );
  const quotaEvidenceFresh =
    knownQuotaFact !== null &&
    Number.isFinite(quotaObservedAt) &&
    quotaObservedAt <= args.now &&
    Number.isFinite(actionExpiryHours) &&
    actionExpiryHours > 0 &&
    args.now < quotaObservedAt + actionExpiryHours * HOUR_MS;
  const campaignQuotaCurrent =
    args.authority.currentness === 'current' && quotaEvidenceFresh;
  let campaignUsage: number | null = null;
  let campaignLimit: number | null = null;

  if (campaignQuotaCurrent && knownQuotaFact) {
    const usage = Number(knownQuotaFact.value.campaignDefinitionUsage);
    const limit = Number(knownQuotaFact.value.campaignDefinitionLimit);
    const remaining = Number(knownQuotaFact.value.remainingDefinitions);
    if (
      Number.isInteger(usage) &&
      usage >= 0 &&
      Number.isInteger(limit) &&
      limit >= 0 &&
      Number.isInteger(remaining) &&
      remaining === Math.max(0, limit - usage) &&
      knownQuotaFact.value.isAtOrAboveLimit === (usage >= limit)
    ) {
      campaignUsage = usage;
      campaignLimit = limit;
    } else {
      blockers.push('CAMPAIGN_QUOTA_EVIDENCE_INVALID');
    }
  } else {
    blockers.push('CAMPAIGN_QUOTA_REEVALUATION_PENDING');
  }

  const entitlements = buildBusinessEntitlementsFromBusiness(
    args.business,
    args.now,
    {
      activeManagementCampaigns: campaignUsage ?? 0,
    }
  );
  const paidSubscriptionInactive =
    entitlements.plan !== 'starter' && !entitlements.isSubscriptionActive;
  const hasSmartManagerAccess =
    entitlements.features.smartRetentionManager === true &&
    !paidSubscriptionInactive;
  if (!hasSmartManagerAccess) {
    blockers.push(
      paidSubscriptionInactive
        ? 'SUBSCRIPTION_INACTIVE'
        : 'SMART_MANAGER_FEATURE_UNAVAILABLE'
    );
  }
  const hasAiAssist =
    hasSmartManagerAccess &&
    entitlements.features.smartRetentionManagerAiAssist === true &&
    !paidSubscriptionInactive;
  const aiAssistReason = hasAiAssist
    ? null
    : paidSubscriptionInactive
      ? ('AI_SUBSCRIPTION_INACTIVE' as const)
      : ('AI_ASSIST_NOT_AVAILABLE' as const);

  if (
    campaignLimit !== null &&
    campaignLimit !== entitlements.limits.maxCampaigns
  ) {
    blockers.push('CAMPAIGN_QUOTA_EVIDENCE_INVALID');
  }

  const hasPreparationCapabilities =
    (args.authorization.staffRole === 'owner' ||
      args.authorization.staffRole === 'manager') &&
    args.authorization.capabilities.access_customers === true &&
    args.authorization.capabilities.access_campaigns === true &&
    args.authorization.capabilities.create_campaigns === true;
  if (!args.authorization.capabilities.create_campaigns) {
    blockers.push('CREATE_CAMPAIGNS_REQUIRED');
  }
  const hasApprovalCapabilities =
    hasPreparationCapabilities &&
    args.authorization.capabilities.activate_send_campaigns === true;
  if (!args.authorization.capabilities.activate_send_campaigns) {
    blockers.push('ACTIVATE_SEND_CAMPAIGNS_REQUIRED');
  }

  const campaignCapacityAvailable =
    campaignUsage !== null &&
    campaignLimit !== null &&
    campaignUsage < campaignLimit;
  if (
    campaignUsage !== null &&
    campaignLimit !== null &&
    !campaignCapacityAvailable
  ) {
    blockers.push('CAMPAIGN_LIMIT_REACHED');
  }

  return {
    blockers: [...new Set(blockers)].sort(),
    campaignQuotaCurrent:
      campaignQuotaCurrent &&
      !blockers.includes('CAMPAIGN_QUOTA_EVIDENCE_INVALID'),
    campaignUsage,
    campaignLimit,
    hasSmartManagerAccess,
    hasAiAssist,
    aiAssistReason,
    aiMonthlyLimit: entitlements.limits.maxAiExecutionsPerMonth,
    hasPreparationCapabilities,
    hasApprovalCapabilities,
    campaignCapacityAvailable,
  };
}

export type SmartManagerAudienceBucket =
  | '1_4'
  | '5_9'
  | '10_24'
  | '25_49'
  | '50_99'
  | '100_249'
  | '250_499'
  | '500_999'
  | '1000_plus';

export type SmartManagerWinbackStructuredInput = {
  actionType: 'winback_copy';
  locale: 'he-IL';
  language: 'he';
  channelStrategyVersion: typeof SMART_MANAGER_CHANNEL_STRATEGY_VERSION;
  segment: 'at_risk';
  audienceSizeBucket: SmartManagerAudienceBucket;
  tone: 'warm';
  outputConstraints: {
    titleMaxCharacters: typeof SMART_MANAGER_AI_TITLE_MAX_CHARACTERS;
    bodyMaxCharacters: typeof SMART_MANAGER_AI_BODY_MAX_CHARACTERS;
    offersAllowed: false;
    personalizationAllowed: false;
  };
  promptVersion: typeof SMART_MANAGER_AI_PROMPT_VERSION;
  generationVersion: typeof SMART_MANAGER_AI_GENERATION_VERSION;
};

export function bucketSmartManagerAudience(
  audienceCount: number,
  recipientCeiling: number
): SmartManagerAudienceBucket {
  const bounded = Math.max(
    1,
    Math.min(Math.floor(audienceCount), Math.floor(recipientCeiling))
  );
  if (bounded <= 4) {
    return '1_4';
  }
  if (bounded <= 9) {
    return '5_9';
  }
  if (bounded <= 24) {
    return '10_24';
  }
  if (bounded <= 49) {
    return '25_49';
  }
  if (bounded <= 99) {
    return '50_99';
  }
  if (bounded <= 249) {
    return '100_249';
  }
  if (bounded <= 499) {
    return '250_499';
  }
  if (bounded <= 999) {
    return '500_999';
  }
  return '1000_plus';
}

export function buildSmartManagerWinbackStructuredInput(args: {
  audienceCount: number;
  recipientCeiling: number;
}): SmartManagerWinbackStructuredInput {
  return {
    actionType: 'winback_copy',
    locale: 'he-IL',
    language: 'he',
    channelStrategyVersion: SMART_MANAGER_CHANNEL_STRATEGY_VERSION,
    segment: 'at_risk',
    audienceSizeBucket: bucketSmartManagerAudience(
      args.audienceCount,
      args.recipientCeiling
    ),
    tone: 'warm',
    outputConstraints: {
      titleMaxCharacters: SMART_MANAGER_AI_TITLE_MAX_CHARACTERS,
      bodyMaxCharacters: SMART_MANAGER_AI_BODY_MAX_CHARACTERS,
      offersAllowed: false,
      personalizationAllowed: false,
    },
    promptVersion: SMART_MANAGER_AI_PROMPT_VERSION,
    generationVersion: SMART_MANAGER_AI_GENERATION_VERSION,
  };
}

export function buildSmartManagerWinbackPrompt(
  input: SmartManagerWinbackStructuredInput
) {
  return [
    'Draft neutral Hebrew win-back notification copy.',
    'Return JSON only: {"type":"winback_copy","title":"","body":""}.',
    'Use only the closed structured input below.',
    'Do not mention a business or recipient name.',
    'Do not create offers, discounts, coupons, rewards, prices, guarantees, or fabricated customer behavior.',
    'Do not include URLs, contact details, placeholders, percentages, currency, or numbers.',
    `Input: ${JSON.stringify(input)}`,
  ].join('\n');
}

export function buildSmartManagerStructuredInputHash(
  input: SmartManagerWinbackStructuredInput
) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-winback-structured-input-v1',
    input,
  });
}

export function buildSmartManagerAiCacheKey(args: {
  structuredInputHash: string;
  promptVersion?: string;
  generationVersion?: string;
  model?: string;
}) {
  return [
    SMART_MANAGER_AI_CACHE_NAMESPACE,
    `input:${args.structuredInputHash}`,
    `prompt:${args.promptVersion ?? SMART_MANAGER_AI_PROMPT_VERSION}`,
    `generation:${args.generationVersion ?? SMART_MANAGER_AI_GENERATION_VERSION}`,
    `model:${args.model ?? OPENROUTER_JSON_MODEL}`,
  ].join('|');
}

function normalizeGeneratedCopyText(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function isHebrewDominant(value: string) {
  const hebrew = (value.match(/[\u0590-\u05FF]/g) ?? []).length;
  const latin = (value.match(/[A-Za-z]/g) ?? []).length;
  return hebrew >= 4 && hebrew / Math.max(1, hebrew + latin) >= 0.7;
}

const PROHIBITED_SMART_MANAGER_COPY = [
  /https?:\/\//i,
  /www\./i,
  /\b[a-z0-9-]+\.(?:com|net|org|co\.il|il)\b/i,
  /\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/,
  /(?:\+?972|0)[\s().-]*\d(?:[\s().-]*\d){6,}/,
  /%|אחוז/,
  /₪|\$|€|ש["״]?ח|דולר|יורו/i,
  /\d/,
  /הנחה|מבצע|קופון|הטבה|הצעה|discount|coupon|promo\s*code|offer|sale|deal/i,
  /מחיר|בשווי|עלות|price|worth/i,
  /חינם|ללא\s+עלות|free/i,
  /מתנה|פרס|בונוס|נקודות|reward/i,
  /מובטח|אחריות|בטוח\s+ש|guarantee/i,
  /\{[^}]*\}|\[[^\]]*\]|<<|>>|%[A-Z_]+%/i,
  /שם\s+(?:הלקוח|העסק)|לקוח(?:ה)?\s+יקר(?:ה)?/,
  /כי\s+קנית|בעקבות\s+הרכישה|הרכישה\s+האחרונה|because\s+you\s+bought/i,
  /שמנו\s+לב\s+ש|לפי\s+(?:הקניות|הרכישות|הביקורים)/,
  /הקפה\s+הבא\s+עלינו/,
  /המשקה\s+הבא\s+עלינו/,
  /מגיע\s+לכם\s+פינוק/,
  /מחכה\s+לכם\s+הפתעה/,
  /יש\s+לנו\s+משהו\s+מיוחד/,
  /פינוק|הפתעה|משהו\s+מיוחד/,
  /עלינו/,
  /\bgift\b/i,
  /\bon\s+us\b/i,
  /\btreat\b/i,
  /special\s+offer/i,
  /surprise\s+waiting/i,
  /(?:עברו|עבר)\s+(?:כבר\s+)?(?:יום|יומיים|שבוע|שבועיים|חודש|חודשיים|שנה|שנתיים|(?:אחד|אחת|שניים|שתיים|שתי|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש|שישה|שש|שבעה|שבע|שמונה|תשעה|תשע|עשרה|עשר)\s+(?:ימים|שבועות|חודשים|שנים))/,
  /כבר\s+(?:יום|יומיים|שבוע|שבועיים|חודש|חודשיים|שנה|שנתיים|(?:אחד|אחת|שניים|שתיים|שתי|שלושה|שלוש|ארבעה|ארבע|חמישה|חמש|שישה|שש|שבעה|שבע|שמונה|תשעה|תשע|עשרה|עשר)\s+(?:ימים|שבועות|חודשים|שנים))/,
  /לא\s+ביקר(?:תם|תן|ת)?\s+כבר/,
  /שלא\s+ביקר(?:תם|תן|ת)?/,
  /זו\s+הפעם\s+ה(?:ראשונה|שנייה|שניה|שלישית|רביעית)/,
  /בפעם\s+ה(?:ראשונה|שנייה|שניה|שלישית|רביעית)/,
  /על\s+הבית/,
  /הביקור\s+הבא\s+על/,
  /on\s+the\s+house/i,
  /next\s+(?:visit|coffee|drink)\s+on\s+us/i,
  /\b(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+(?:day|days|week|weeks|month|months|year|years)\b/i,
] as const;

export function validateSmartManagerWinbackOutput(parsed: Record<string, unknown>) {
  const keys = Object.keys(parsed).sort();
  if (
    keys.length !== 3 ||
    keys[0] !== 'body' ||
    keys[1] !== 'title' ||
    keys[2] !== 'type' ||
    parsed.type !== 'winback_copy' ||
    typeof parsed.title !== 'string' ||
    typeof parsed.body !== 'string'
  ) {
    return {
      ok: false as const,
      code: 'AI_PROVIDER_SCHEMA_INVALID' as const,
    };
  }
  const title = normalizeGeneratedCopyText(parsed.title);
  const body = normalizeGeneratedCopyText(parsed.body);
  if (
    !title ||
    !body ||
    title.length > SMART_MANAGER_AI_TITLE_MAX_CHARACTERS ||
    body.length > SMART_MANAGER_AI_BODY_MAX_CHARACTERS
  ) {
    return {
      ok: false as const,
      code: 'AI_PROVIDER_SCHEMA_INVALID' as const,
    };
  }
  if (
    PROHIBITED_SMART_MANAGER_COPY.some((pattern) =>
      pattern.test(`${title} ${body}`)
    )
  ) {
    return {
      ok: false as const,
      code: 'AI_PROVIDER_CONTENT_INVALID' as const,
    };
  }
  if (!isHebrewDominant(`${title} ${body}`)) {
    return {
      ok: false as const,
      code: 'AI_PROVIDER_LANGUAGE_INVALID' as const,
    };
  }
  return {
    ok: true as const,
    value: { type: 'winback_copy' as const, title, body },
  };
}

export function buildSmartManagerGenerationRequestBinding(args: {
  preparedActionId: string;
  businessId: string;
  actorUserId: string;
  requestKind: 'initial_prepare' | 'explicit_regeneration';
  authorityMode: string;
  authorityBindingHash: string;
  decisionHash: string;
  evidenceFingerprint: string;
  factHash: string;
  policyVersion: string;
  policyHash: string;
  sourceGeneration: number;
  expectedSelectedCopyId: string;
  expectedSelectedCopyRevision: number;
  requestToken: string;
  reservedResultRevision: number;
  generationVersion: string;
  promptVersion: string;
  structuredInputHash: string;
  requestedAt: number;
  expiresAt: number;
  state: string;
}) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-winback-generation-request-binding-v1',
    ...args,
  });
}

export function buildPreparedWinbackPreparationKey(args: {
  businessId: string;
  authorityMode: string;
  authorityBindingHash: string;
  decisionHash: string;
  policyHash: string;
}) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-prepared-winback',
    businessId: args.businessId,
    stableId: 'retention.reengage_inactive',
    authorityMode: args.authorityMode,
    authorityBindingHash: args.authorityBindingHash,
    decisionHash: args.decisionHash,
    policyHash: args.policyHash,
    actionContractVersion: SMART_MANAGER_WINBACK_ACTION_CONTRACT_VERSION,
  });
}

export function buildPreparedActionCopyContentHash(args: {
  title: string;
  body: string;
}) {
  return hashSmartManagerValue({
    namespace: 'smart-manager-prepared-action-copy-content-v1',
    title: args.title,
    body: args.body,
  });
}

export function buildPreparedWinbackDetectionExplanation(audienceCount: number) {
  return `זוהו ${audienceCount} לקוחות שלא ביקרו לאחרונה ושכדאי להזמין שוב.`;
}

export function evaluatePreparedActionCurrentness(args: {
  action: Doc<'smartManagerPreparedActions'>;
  authority: SmartManagerDecisionAuthorityResult;
  now: number;
}) {
  const blockers: PreparedActionCurrentnessBlocker[] = [
    ...args.authority.blockers,
  ];
  if (args.action.state !== 'reviewable') {
    blockers.push('ACTION_NOT_REVIEWABLE');
  }
  if (args.now >= args.action.expiresAt) {
    blockers.push('ACTION_EXPIRED');
  }
  if (args.action.authorityMode !== args.authority.authorityMode) {
    blockers.push('ACTION_AUTHORITY_MODE_CHANGED');
  }
  if (
    args.action.schemaVersion !== SMART_MANAGER_PREPARED_ACTION_SCHEMA_VERSION ||
    args.action.actionContractVersion !==
      SMART_MANAGER_WINBACK_ACTION_CONTRACT_VERSION ||
    args.action.stableId !== 'retention.reengage_inactive' ||
    args.action.actionKind !== 'winback_campaign' ||
    args.action.audienceDefinitionVersion !==
      SMART_MANAGER_AUDIENCE_DEFINITION_VERSION ||
    args.action.segment !== 'at_risk' ||
    args.action.materializationState !== 'not_materialized' ||
    args.action.copyRevisionLimit !== SMART_MANAGER_MAX_COPY_REVISION_SLOTS ||
    !Number.isInteger(args.action.nextCopyRevision) ||
    args.action.nextCopyRevision < 2 ||
    args.action.nextCopyRevision > SMART_MANAGER_MAX_COPY_REVISION_SLOTS + 1 ||
    args.action.channelStrategy.channelStrategyVersion !==
      SMART_MANAGER_CHANNEL_STRATEGY_VERSION ||
    !hasExactChannelContract(
      args.action.channelStrategy.preferredChannels
    ) ||
    !hasExactChannelContract(
      args.action.channelStrategy.supportedChannels
    ) ||
    !hasExactChannelContract(
      args.action.channelStrategy.campaignCompatibleChannels
    ) ||
    args.action.campaignDraft.internalTitle !==
      SMART_MANAGER_WINBACK_CAMPAIGN_DRAFT.internalTitle
  ) {
    blockers.push('ACTION_CONTRACT_INVALID');
  }
  if (
    !args.authority.authorityBindingHash ||
    args.action.authorityBindingHash !== args.authority.authorityBindingHash
  ) {
    blockers.push('ACTION_AUTHORITY_BINDING_CHANGED');
  }
  const decision = args.authority.decision;
  const comparison = args.authority.comparison;
  if (
    decision &&
    args.authority.authorityBindingHash &&
    args.action.preparationKey !==
      buildPreparedWinbackPreparationKey({
        businessId: String(args.action.businessId),
        authorityMode: args.authority.authorityMode,
        authorityBindingHash: args.authority.authorityBindingHash,
        decisionHash: decision.decisionHash,
        policyHash: decision.policyHash,
      })
  ) {
    blockers.push('ACTION_PREPARATION_KEY_CHANGED');
  }
  if (
    !decision ||
    !comparison ||
    String(args.action.decisionId) !== String(decision._id) ||
    args.action.decisionHash !== decision.decisionHash ||
    args.action.evidenceFingerprint !== decision.evidenceFingerprint ||
    args.action.factHash !== decision.factHash ||
    args.action.sourceGeneration !== decision.sourceGeneration ||
    args.action.policyVersion !== decision.policyVersion ||
    args.action.policyHash !== decision.policyHash ||
    args.action.comparisonHash !== comparison.comparisonHash
  ) {
    blockers.push('ACTION_DECISION_BINDING_CHANGED');
  }
  const lifecycleEvidence = args.authority.lifecycleEvidence;
  if (
    !lifecycleEvidence ||
    args.action.audienceCount !== lifecycleEvidence.audienceCount ||
    args.action.lifecycleSourceFingerprint !==
      lifecycleEvidence.lifecycleSourceFingerprint ||
    args.action.observedAt !== lifecycleEvidence.observedAt ||
    args.action.recipientCeiling !== args.authority.policy?.config.recipientCeiling
  ) {
    blockers.push('ACTION_AUDIENCE_BINDING_CHANGED');
  }

  const uniqueBlockers = [...new Set(blockers)].sort();
  const currentness = uniqueBlockers.includes('REEVALUATION_PENDING')
    ? ('reevaluation_pending' as const)
    : uniqueBlockers.includes('ACTION_EXPIRED') ||
        uniqueBlockers.includes('EVIDENCE_EXPIRED')
      ? ('expired' as const)
      : uniqueBlockers.length > 0
        ? ('stale' as const)
        : ('current' as const);
  return { currentness, blockers: uniqueBlockers };
}
