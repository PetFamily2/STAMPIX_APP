import {
  isApprovedGuideId,
  isApprovedProfileGuideField,
  isApprovedRecommendationStableId,
  recommendationRequiresExactEntity,
  RECOMMENDATION_GUIDE_IDS,
} from './guidance';

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

type RecommendationPathname =
  | '/(authenticated)/(business)/settings-business-address'
  | '/(authenticated)/(business)/settings-business-profile'
  | '/(authenticated)/(business)/programs'
  | '/(authenticated)/(business)/cards/[programId]'
  | '/(authenticated)/(business)/campaigns'
  | '/(authenticated)/(business)/cards/campaign/[campaignId]'
  | '/(authenticated)/(business)/customers'
  | '/(authenticated)/(business)/team'
  | '/(authenticated)/(business)/settings-business-subscription';

export type RecommendationNavigationTarget = {
  pathname: RecommendationPathname;
  params: Record<string, string>;
};

export type RecommendationNavigationResult =
  | {
      ok: true;
      target: RecommendationNavigationTarget;
    }
  | {
      ok: false;
      reason:
        | 'missing_business_id'
        | 'missing_program_id'
        | 'missing_campaign_id'
        | 'invalid_action'
        | 'invalid_action_shape'
        | 'unknown_action_type'
        | 'invalid_customer_segment'
        | 'invalid_subscription_limit_key'
        | 'invalid_profile_field'
        | 'invalid_guide'
        | 'guide_entity_mismatch';
    };

type RuntimeAction = Record<string, unknown>;

function requiredId(value: unknown) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized ? normalized : null;
}

function isRuntimeAction(value: unknown): value is RuntimeAction {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasOnlyKeys(action: RuntimeAction, allowedKeys: string[]) {
  const allowed = new Set(allowedKeys);
  return Object.keys(action).every((key) => allowed.has(key));
}

function hasOwn(action: RuntimeAction, key: string) {
  return Object.prototype.hasOwnProperty.call(action, key);
}

export function getRecommendationNavigationTarget(input: {
  businessId: string | null | undefined;
  action: unknown;
  guideSessionId?: unknown;
  guideId?: unknown;
  stableId?: unknown;
  evidenceFingerprint?: unknown;
  entityId?: unknown;
}): RecommendationNavigationResult {
  const businessId = requiredId(input.businessId);
  if (!businessId) {
    return { ok: false, reason: 'missing_business_id' };
  }

  try {
    if (!isRuntimeAction(input.action)) {
      return { ok: false, reason: 'invalid_action' };
    }

    const actionType = input.action.type;
    if (typeof actionType !== 'string' || !actionType) {
      return { ok: false, reason: 'invalid_action' };
    }

    const hasGuide =
      input.guideSessionId !== undefined ||
      input.guideId !== undefined ||
      input.stableId !== undefined ||
      input.evidenceFingerprint !== undefined;
    let guideParams: Record<string, string> = {};
    if (hasGuide) {
      if (
        !isApprovedGuideId(input.guideId) ||
        !isApprovedRecommendationStableId(input.stableId) ||
        RECOMMENDATION_GUIDE_IDS[input.stableId] !== input.guideId ||
        !requiredId(input.guideSessionId) ||
        !requiredId(input.evidenceFingerprint) ||
        (recommendationRequiresExactEntity(input.stableId) &&
          !requiredId(input.entityId))
      ) {
        return { ok: false, reason: 'invalid_guide' };
      }
      guideParams = {
        guideSessionId: requiredId(input.guideSessionId)!,
        guideId: input.guideId,
        stableId: input.stableId,
        evidenceFingerprint: requiredId(input.evidenceFingerprint)!,
        recommendationBusinessId: businessId,
        ...(requiredId(input.entityId)
          ? { entityId: requiredId(input.entityId)! }
          : {}),
      };
    }
    const baseParams = { businessId, ...guideParams };
    switch (actionType) {
      case 'open_business_address':
        if (!hasOnlyKeys(input.action, ['type'])) {
          return { ok: false, reason: 'invalid_action_shape' };
        }
        return {
          ok: true,
          target: {
            pathname:
              '/(authenticated)/(business)/settings-business-address',
            params: baseParams,
          },
        };
      case 'open_business_profile': {
        if (!hasOnlyKeys(input.action, ['type', 'fieldId'])) {
          return { ok: false, reason: 'invalid_action_shape' };
        }
        const hasFieldId = hasOwn(input.action, 'fieldId');
        const fieldId = hasFieldId
          ? requiredId(input.action.fieldId)
          : null;
        if (
          (hasFieldId && !isApprovedProfileGuideField(fieldId)) ||
          (hasGuide &&
            input.guideId === 'profile-complete' &&
            !isApprovedProfileGuideField(fieldId))
        ) {
          return { ok: false, reason: 'invalid_profile_field' };
        }
        return {
          ok: true,
          target: {
            pathname:
              '/(authenticated)/(business)/settings-business-profile',
            params: {
              ...baseParams,
              ...(fieldId ? { fieldId } : {}),
            },
          },
        };
      }
      case 'open_programs':
        if (!hasOnlyKeys(input.action, ['type'])) {
          return { ok: false, reason: 'invalid_action_shape' };
        }
        return {
          ok: true,
          target: {
            pathname: '/(authenticated)/(business)/programs',
            params: baseParams,
          },
        };
      case 'open_program': {
        if (!hasOnlyKeys(input.action, ['type', 'programId'])) {
          return { ok: false, reason: 'invalid_action_shape' };
        }
        const programId = requiredId(input.action.programId);
        if (!programId) {
          return { ok: false, reason: 'missing_program_id' };
        }
        if (
          hasGuide &&
          requiredId(input.entityId) &&
          requiredId(input.entityId) !== programId
        ) {
          return { ok: false, reason: 'guide_entity_mismatch' };
        }
        return {
          ok: true,
          target: {
            pathname: '/(authenticated)/(business)/cards/[programId]',
            params: { ...baseParams, programId },
          },
        };
      }
      case 'open_campaigns':
        if (!hasOnlyKeys(input.action, ['type'])) {
          return { ok: false, reason: 'invalid_action_shape' };
        }
        return {
          ok: true,
          target: {
            pathname: '/(authenticated)/(business)/campaigns',
            params: baseParams,
          },
        };
      case 'open_campaign': {
        if (!hasOnlyKeys(input.action, ['type', 'campaignId'])) {
          return { ok: false, reason: 'invalid_action_shape' };
        }
        const campaignId = requiredId(input.action.campaignId);
        if (!campaignId) {
          return { ok: false, reason: 'missing_campaign_id' };
        }
        if (
          hasGuide &&
          requiredId(input.entityId) &&
          requiredId(input.entityId) !== campaignId
        ) {
          return { ok: false, reason: 'guide_entity_mismatch' };
        }
        return {
          ok: true,
          target: {
            pathname:
              '/(authenticated)/(business)/cards/campaign/[campaignId]',
            params: { ...baseParams, campaignId },
          },
        };
      }
      case 'open_customers_segment': {
        if (!hasOnlyKeys(input.action, ['type', 'segment'])) {
          return { ok: false, reason: 'invalid_action_shape' };
        }
        const segment = input.action.segment;
        if (segment !== 'at_risk' && segment !== 'near_reward') {
          return { ok: false, reason: 'invalid_customer_segment' };
        }
        return {
          ok: true,
          target: {
            pathname: '/(authenticated)/(business)/customers',
            params: {
              ...baseParams,
              filter: segment,
            },
          },
        };
      }
      case 'open_team_pending':
        if (!hasOnlyKeys(input.action, ['type'])) {
          return { ok: false, reason: 'invalid_action_shape' };
        }
        return {
          ok: true,
          target: {
            pathname: '/(authenticated)/(business)/team',
            params: {
              ...baseParams,
              section: 'pending',
            },
          },
        };
      case 'open_subscription': {
        if (!hasOnlyKeys(input.action, ['type', 'limitKey'])) {
          return { ok: false, reason: 'invalid_action_shape' };
        }
        const hasLimitKey = hasOwn(input.action, 'limitKey');
        if (hasLimitKey && input.action.limitKey !== 'campaigns') {
          return {
            ok: false,
            reason: 'invalid_subscription_limit_key',
          };
        }
        return {
          ok: true,
          target: {
            pathname:
              '/(authenticated)/(business)/settings-business-subscription',
            params: {
              ...baseParams,
              ...(hasLimitKey ? { limitKey: 'campaigns' } : {}),
            },
          },
        };
      }
      default:
        return { ok: false, reason: 'unknown_action_type' };
    }
  } catch {
    return { ok: false, reason: 'invalid_action' };
  }
}
