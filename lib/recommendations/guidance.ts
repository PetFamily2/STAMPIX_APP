export const RECOMMENDATION_GUIDE_IDS = {
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
} as const;

export type RecommendationStableId = keyof typeof RECOMMENDATION_GUIDE_IDS;
export type RecommendationGuideId =
  (typeof RECOMMENDATION_GUIDE_IDS)[RecommendationStableId];
export type RecommendationGuideEntityKind = 'program' | 'campaign';

export const GUIDE_INSTRUCTIONS: Record<RecommendationGuideId, string> = {
  'subscription-recover':
    'בדקו מה נדרש כדי להחזיר את המנוי לפעילות.',
  'address-resolve': 'השלימו ובחרו כתובת מאומתת.',
  'profile-complete': 'השלימו את הפרטים החסרים ושמרו.',
  'program-create': 'צרו כרטיסייה ראשונה ללקוחות.',
  'program-publish': 'בדקו את הכרטיסייה ופרסמו אותה.',
  'campaign-create': 'צרו מבצע חדש לעסק.',
  'campaign-publish': 'השלימו את המבצע והפעילו אותו.',
  'campaign-resume': 'בדקו את ההגדרות והפעילו מחדש.',
  'campaign-schedule-review': 'בדקו את מועד השליחה המתוכנן.',
  'inactive-review': 'עברו על הלקוחות שלא ביקרו לאחרונה.',
  'near-reward': 'עברו על הלקוחות שקרובים להטבה.',
  'team-pending': 'בדקו את ההזמנות שממתינות לאישור.',
  'quota-review': 'בדקו את מכסת המבצעים במסלול.',
};

export const GUIDE_ROUTE_KEYS: Record<RecommendationGuideId, string> = {
  'subscription-recover': 'business-subscription',
  'address-resolve': 'business-address',
  'profile-complete': 'business-profile',
  'program-create': 'programs',
  'program-publish': 'program-detail',
  'campaign-create': 'campaigns',
  'campaign-publish': 'campaign-detail',
  'campaign-resume': 'campaign-detail',
  'campaign-schedule-review': 'campaign-detail',
  'inactive-review': 'customers',
  'near-reward': 'customers',
  'team-pending': 'team',
  'quota-review': 'business-subscription',
};

export const RECOMMENDATION_GUIDE_ENTITY_KINDS: Partial<
  Record<RecommendationStableId, RecommendationGuideEntityKind>
> = {
  'program.publish_draft': 'program',
  'campaign.publish_draft': 'campaign',
  'campaign.resume_paused': 'campaign',
  'campaign.next_scheduled': 'campaign',
};

export function isApprovedGuideId(
  value: unknown
): value is RecommendationGuideId {
  return (
    typeof value === 'string' &&
    Object.values(RECOMMENDATION_GUIDE_IDS).includes(
      value as RecommendationGuideId
    )
  );
}

export function isApprovedRecommendationStableId(
  value: unknown
): value is RecommendationStableId {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(RECOMMENDATION_GUIDE_IDS, value)
  );
}

export function recommendationRequiresExactEntity(
  stableId: RecommendationStableId
) {
  return RECOMMENDATION_GUIDE_ENTITY_KINDS[stableId] !== undefined;
}

function validBoundId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value === value.trim()
  );
}

export type GuidedTargetServerStatus =
  | 'loading'
  | 'unavailable'
  | 'error'
  | 'active'
  | 'completed'
  | 'invalidated'
  | 'restricted';

export type GuidedTargetActivationInput = {
  bindingValid?: boolean;
  guideSessionId?: unknown;
  serverStatus?: GuidedTargetServerStatus | null;
  businessMatches?: boolean;
  isSwitchingBusiness?: boolean;
  isClosed?: boolean;
  routeAndEntityMatch?: boolean;
};

export function canActivateGuidedTarget(
  input: GuidedTargetActivationInput = {}
) {
  return (
    input.bindingValid === true &&
    validBoundId(input.guideSessionId) &&
    input.serverStatus === 'active' &&
    input.businessMatches === true &&
    input.isSwitchingBusiness === false &&
    input.isClosed === false &&
    input.routeAndEntityMatch === true
  );
}

type GuidedTargetActivationEffects = {
  activate: () => void | (() => void);
  deactivate?: () => void;
};

export function createGuidedTargetActivationOrchestrator() {
  let activeKey: string | null = null;
  let cleanup: (() => void) | null = null;
  let deactivateEffect: (() => void) | null = null;

  const deactivate = () => {
    if (activeKey === null) {
      return false;
    }
    activeKey = null;
    cleanup?.();
    cleanup = null;
    deactivateEffect?.();
    deactivateEffect = null;
    return true;
  };

  return {
    update(
      input: GuidedTargetActivationInput,
      activationKey: string,
      effects: GuidedTargetActivationEffects
    ) {
      if (!canActivateGuidedTarget(input)) {
        deactivate();
        return false;
      }
      if (activeKey === activationKey) {
        return true;
      }
      deactivate();
      activeKey = activationKey;
      deactivateEffect = effects.deactivate ?? null;
      cleanup = effects.activate() ?? null;
      return true;
    },
    deactivate,
    isActive() {
      return activeKey !== null;
    },
  };
}

export function validateGuideBinding(input: {
  guideSessionId: unknown;
  guideId: unknown;
  stableId: unknown;
  routeBusinessId: unknown;
  recommendationBusinessId: unknown;
  activeBusinessId: unknown;
  currentRouteKey: unknown;
  guideEntityId?: unknown;
  routeEntityId?: unknown;
  routeEntityKind?: unknown;
}) {
  if (
    !isApprovedGuideId(input.guideId) ||
    !isApprovedRecommendationStableId(input.stableId)
  ) {
    return { ok: false as const, reasonCode: 'INVALID_GUIDE' as const };
  }
  if (RECOMMENDATION_GUIDE_IDS[input.stableId] !== input.guideId) {
    return { ok: false as const, reasonCode: 'GUIDE_MISMATCH' as const };
  }
  if (!validBoundId(input.guideSessionId)) {
    return {
      ok: false as const,
      reasonCode: 'INVALID_SESSION' as const,
    };
  }
  if (
    typeof input.currentRouteKey !== 'string' ||
    GUIDE_ROUTE_KEYS[input.guideId] !== input.currentRouteKey
  ) {
    return { ok: false as const, reasonCode: 'ROUTE_MISMATCH' as const };
  }
  const expectedEntityKind =
    RECOMMENDATION_GUIDE_ENTITY_KINDS[input.stableId];
  if (expectedEntityKind) {
    if (
      !validBoundId(input.guideEntityId) ||
      !validBoundId(input.routeEntityId)
    ) {
      return {
        ok: false as const,
        reasonCode: 'MISSING_ENTITY' as const,
      };
    }
    if (
      input.routeEntityKind !== expectedEntityKind ||
      input.guideEntityId !== input.routeEntityId
    ) {
      return {
        ok: false as const,
        reasonCode: 'ENTITY_MISMATCH' as const,
      };
    }
  }
  const routeBusinessId = String(input.routeBusinessId ?? '');
  const recommendationBusinessId = String(
    input.recommendationBusinessId ?? ''
  );
  const activeBusinessId = String(input.activeBusinessId ?? '');
  if (
    !routeBusinessId ||
    routeBusinessId !== recommendationBusinessId ||
    routeBusinessId !== activeBusinessId
  ) {
    return { ok: false as const, reasonCode: 'BUSINESS_MISMATCH' as const };
  }
  return {
    ok: true as const,
    guideSessionId: input.guideSessionId,
    guideId: input.guideId,
    stableId: input.stableId,
    businessId: routeBusinessId,
    ...(expectedEntityKind
      ? {
          entityId: input.guideEntityId as string,
          entityKind: expectedEntityKind,
        }
      : {}),
  };
}

export function clampGuideSteps(stepCount: number) {
  return Math.max(1, Math.min(4, Math.floor(stepCount)));
}

export function getGuidePulseIterations(reducedMotion: boolean) {
  return reducedMotion ? 0 : 2;
}

export function getGuideBottomInset(
  safeAreaBottom: number,
  keyboardHeight: number
) {
  return (
    Math.max(Number.isFinite(safeAreaBottom) ? safeAreaBottom : 0, 12) +
    Math.max(Number.isFinite(keyboardHeight) ? keyboardHeight : 0, 0)
  );
}
