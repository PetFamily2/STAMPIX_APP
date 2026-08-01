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

export const PROFILE_GUIDE_FIELDS = [
  'name',
  'shortDescription',
  'businessPhone',
  'serviceTypes',
  'serviceTags',
  'discoverySource',
  'reason',
  'usageAreas',
  'ownerAgeRange',
  'businessExample',
  'birthdayCampaignRelevant',
  'joinAnniversaryCampaignRelevant',
  'weakTimePromosRelevant',
] as const;

export type ProfileGuideField = (typeof PROFILE_GUIDE_FIELDS)[number];

export const GUIDE_TARGET_IDS: Record<RecommendationGuideId, string> = {
  'subscription-recover': 'subscription-recover-target',
  'address-resolve': 'address-resolve-target',
  'profile-complete': 'profile-complete-target',
  'program-create': 'program-create-target',
  'program-publish': 'program-publish-target',
  'campaign-create': 'campaign-create-target',
  'campaign-publish': 'campaign-publish-target',
  'campaign-resume': 'campaign-resume-target',
  'campaign-schedule-review': 'campaign-schedule-review-target',
  'inactive-review': 'inactive-review-target',
  'near-reward': 'near-reward-target',
  'team-pending': 'team-pending-target',
  'quota-review': 'quota-review-target',
};

export const GUIDE_TARGET_SEMANTICS: Record<
  RecommendationGuideId,
  {
    semantic: string;
    excludes: readonly string[];
  }
> = {
  'subscription-recover': {
    semantic: 'interrupted-subscription-status-and-direct-restore-action',
    excludes: ['plan-comparison', 'upgrade-marketing', 'quota-row'],
  },
  'address-resolve': {
    semantic: 'first-unresolved-address-control-or-confirmation',
    excludes: ['whole-screen', 'save-action'],
  },
  'profile-complete': {
    semantic: 'exact-missing-profile-field',
    excludes: ['unrelated-profile-field', 'fallback-field'],
  },
  'program-create': {
    semantic: 'primary-create-program-action',
    excludes: ['program-list', 'screen-header'],
  },
  'program-publish': {
    semantic: 'exact-program-publication-action',
    excludes: ['save', 'archive', 'delete', 'conflict'],
  },
  'campaign-create': {
    semantic: 'primary-create-campaign-action',
    excludes: ['campaign-list', 'screen-header'],
  },
  'campaign-publish': {
    semantic: 'exact-campaign-publish-or-send-enabling-action',
    excludes: ['save-only', 'archive', 'conflict', 'resume'],
  },
  'campaign-resume': {
    semantic: 'exact-campaign-resume-action-row',
    excludes: ['publish-draft', 'schedule-review', 'archive'],
  },
  'campaign-schedule-review': {
    semantic: 'exact-campaign-schedule-summary-and-edit-section',
    excludes: ['publish-draft', 'resume', 'archive'],
  },
  'inactive-review': {
    semantic: 'active-at-risk-filter-and-list-context',
    excludes: ['customer-card', 'unfiltered-list'],
  },
  'near-reward': {
    semantic: 'active-near-reward-filter-and-list-context',
    excludes: ['customer-card', 'unfiltered-list'],
  },
  'team-pending': {
    semantic: 'expanded-pending-invitations-action-section',
    excludes: ['active-team', 'removed-team'],
  },
  'quota-review': {
    semantic: 'campaigns-quota-row',
    excludes: ['subscription-recovery', 'plan-comparison', 'other-limit'],
  },
};

export function isApprovedProfileGuideField(
  value: unknown
): value is ProfileGuideField {
  return (
    typeof value === 'string' &&
    PROFILE_GUIDE_FIELDS.includes(value as ProfileGuideField)
  );
}

export function resolveProfileGuideField(value: unknown) {
  return isApprovedProfileGuideField(value) ? value : null;
}

export function resolveExactMissingProfileGuideField(
  requestedField: unknown,
  missingFields: readonly unknown[]
) {
  const requested = resolveProfileGuideField(requestedField);
  const firstMissing =
    missingFields.find(isApprovedProfileGuideField) ?? null;
  return requested !== null && requested === firstMissing
    ? requested
    : null;
}

export const TEXT_PROFILE_GUIDE_FIELDS = [
  'name',
  'shortDescription',
  'businessPhone',
] as const;

export type TextProfileGuideField = (typeof TEXT_PROFILE_GUIDE_FIELDS)[number];

export function isTextProfileGuideField(
  field: unknown
): field is TextProfileGuideField {
  return (
    field === 'name' ||
    field === 'shortDescription' ||
    field === 'businessPhone'
  );
}

export type ProfileGuideTarget = {
  fieldId: ProfileGuideField;
  focus: (() => void) | null;
};

export function resolveProfileGuideTarget(input: {
  requestedFieldId: unknown;
  missingFields: readonly unknown[];
  focus?: (() => void) | null;
}): ProfileGuideTarget | null {
  const fieldId = resolveExactMissingProfileGuideField(
    input.requestedFieldId,
    input.missingFields
  );
  if (!fieldId) {
    return null;
  }
  return {
    fieldId,
    focus: isTextProfileGuideField(fieldId) ? (input.focus ?? null) : null,
  };
}

export const GUIDE_INSTRUCTIONS: Record<RecommendationGuideId, string> = {
  'subscription-recover':
    'בדקו מה נדרש כדי להחזיר את המנוי לפעילות.',
  'address-resolve': 'השלימו ובחרו כתובת מאומתת.',
  'profile-complete': 'השלימו את הפרטים החסרים ושמרו.',
  'program-create': 'צרו כרטיסייה ראשונה ללקוחות.',
  'program-publish': 'בדקו את הכרטיסייה ופרסמו אותה.',
  'campaign-create': 'צרו קמפיין חדש לעסק.',
  'campaign-publish': 'השלימו את הקמפיין והפעילו אותו.',
  'campaign-resume': 'בדקו את ההגדרות והפעילו מחדש.',
  'campaign-schedule-review': 'בדקו את מועד השליחה המתוכנן.',
  'inactive-review': 'עברו על הלקוחות שלא ביקרו לאחרונה.',
  'near-reward': 'עברו על הלקוחות שקרובים להטבה.',
  'team-pending': 'בדקו את ההזמנות שממתינות לאישור.',
  'quota-review': 'בדקו את מכסת הקמפיינים במסלול.',
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
  | 'rejected'
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
  activate: (
    context: GuidedActivationTransitionContext
  ) => void | (() => void);
  deactivate?: () => void;
};

export type GuidedActivationTransitionContext = {
  identity: string;
  generation: number;
  isCurrent: () => boolean;
};

export function createGuidedActivationTransitionController() {
  let activeKey: string | null = null;
  let generation = 0;
  let cleanup: (() => void) | null = null;
  let deactivateEffect: (() => void) | null = null;

  const deactivate = () => {
    if (activeKey === null) {
      return false;
    }
    activeKey = null;
    generation += 1;
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

      if (activeKey !== null) {
        activeKey = null;
        generation += 1;
        cleanup?.();
        cleanup = null;
        deactivateEffect = null;
      }

      activeKey = activationKey;
      generation += 1;
      const activationGeneration = generation;
      deactivateEffect = effects.deactivate ?? null;
      cleanup =
        effects.activate({
          identity: activationKey,
          generation: activationGeneration,
          isCurrent: () =>
            activeKey === activationKey &&
            generation === activationGeneration,
        }) ?? null;
      return true;
    },
    deactivate,
    isActive() {
      return activeKey !== null;
    },
    getGeneration() {
      return generation;
    },
  };
}

export function createGuidedTargetActivationOrchestrator() {
  return createGuidedActivationTransitionController();
}

export type ObservableGuidedTargetRef<T> = {
  current: T | null;
  subscribe: (listener: (node: T | null) => void) => () => void;
  getGeneration: () => number;
  isCurrent: (node: T | null, candidateGeneration: number) => boolean;
};

export function createObservableGuidedTargetRef<T>(): ObservableGuidedTargetRef<T> {
  let current: T | null = null;
  let generation = 0;
  const listeners = new Set<(node: T | null) => void>();

  return {
    get current() {
      return current;
    },
    set current(node: T | null) {
      if (current === node) {
        return;
      }
      generation += 1;
      current = node;
      for (const listener of listeners) {
        listener(node);
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getGeneration() {
      return generation;
    },
    isCurrent(node, candidateGeneration) {
      return current === node && generation === candidateGeneration;
    },
  };
}

export function createGuidedFocusController() {
  let focusedIdentity: string | null = null;

  return {
    focusOnce(identity: string, focus: (() => void) | null | undefined) {
      if (!focus || focusedIdentity === identity) {
        return false;
      }
      focusedIdentity = identity;
      focus();
      return true;
    },
    reset() {
      focusedIdentity = null;
    },
    getFocusedIdentity() {
      return focusedIdentity;
    },
  };
}

export function createBoundedRetryController(input?: {
  maxAttempts?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
  delayMs?: number;
}) {
  const maxAttempts = Math.max(
    1,
    Math.min(5, Math.floor(input?.maxAttempts ?? 4))
  );
  const delayMs = Math.max(0, Math.floor(input?.delayMs ?? 80));
  const schedule =
    input?.schedule ??
    ((callback: () => void, delay: number) => setTimeout(callback, delay));
  const cancel =
    input?.cancel ?? ((handle: unknown) => clearTimeout(handle as number));
  let generation = 0;
  let handle: unknown = null;

  const stop = () => {
    generation += 1;
    if (handle !== null) {
      cancel(handle);
      handle = null;
    }
  };

  return {
    start(runAttempt: (attempt: number, retry: () => void) => void) {
      stop();
      const runGeneration = generation;
      let attempts = 0;
      const run = () => {
        handle = null;
        if (generation !== runGeneration || attempts >= maxAttempts) {
          return;
        }
        attempts += 1;
        runAttempt(attempts, () => {
          if (
            generation !== runGeneration ||
            attempts >= maxAttempts ||
            handle !== null
          ) {
            return;
          }
          handle = schedule(run, delayMs);
        });
      };
      run();
      return runGeneration;
    },
    stop,
    getMaxAttempts() {
      return maxAttempts;
    },
  };
}

export type GuidedStatusRetryToken = {
  identity: string;
  generation: number;
  attempt: number;
};

export type GuidedTargetPreparationContext = {
  identity: string;
  generation: number;
  isCurrent: () => boolean;
};

export function createGuidedTargetPreparationController() {
  let identity: string | null = null;
  let generation = 0;
  let prepared = false;

  const cancel = () => {
    generation += 1;
    identity = null;
    prepared = false;
  };

  return {
    begin(
      nextIdentity: string,
      force = false
    ): GuidedTargetPreparationContext | null {
      if (identity !== nextIdentity) {
        generation += 1;
        identity = nextIdentity;
        prepared = false;
      }
      if (prepared && !force) {
        return null;
      }
      generation += 1;
      prepared = true;
      const preparationGeneration = generation;
      return {
        identity: nextIdentity,
        generation: preparationGeneration,
        isCurrent: () =>
          identity === nextIdentity &&
          generation === preparationGeneration &&
          prepared,
      };
    },
    fail(context: GuidedTargetPreparationContext) {
      if (!context.isCurrent()) {
        return false;
      }
      prepared = false;
      return true;
    },
    cancel,
    isPrepared(nextIdentity: string) {
      return identity === nextIdentity && prepared;
    },
  };
}

export function createGuidedStatusRetryController(maxAttempts = 3) {
  const boundedMaxAttempts = Math.max(
    1,
    Math.min(5, Math.floor(maxAttempts))
  );
  let identity: string | null = null;
  let generation = 0;
  let attempts = 0;
  let inFlight = false;

  const reset = (nextIdentity: string | null = null) => {
    generation += 1;
    identity = nextIdentity;
    attempts = 0;
    inFlight = false;
  };

  return {
    begin(nextIdentity: string): GuidedStatusRetryToken | null {
      if (identity !== nextIdentity) {
        reset(nextIdentity);
      }
      if (inFlight || attempts >= boundedMaxAttempts) {
        return null;
      }
      attempts += 1;
      inFlight = true;
      return {
        identity: nextIdentity,
        generation,
        attempt: attempts,
      };
    },
    settle(token: GuidedStatusRetryToken, successful = false) {
      if (
        identity !== token.identity ||
        generation !== token.generation ||
        !inFlight
      ) {
        return false;
      }
      inFlight = false;
      if (successful) {
        attempts = 0;
      }
      return true;
    },
    isCurrent(token: GuidedStatusRetryToken) {
      return (
        identity === token.identity &&
        generation === token.generation &&
        inFlight
      );
    },
    reset,
    cancel() {
      reset(null);
    },
    getState() {
      return {
        identity,
        attempts,
        inFlight,
        exhausted: attempts >= boundedMaxAttempts && !inFlight,
        maxAttempts: boundedMaxAttempts,
      };
    },
  };
}

export function createGuidedMeasurementSequence(input?: {
  canScroll?: boolean;
}) {
  let scrollRequested = input?.canScroll !== true;

  return {
    next(measurement?: {
      available: boolean;
      visible?: boolean;
    }) {
      if (!measurement?.available) {
        return ['retry'] as const;
      }
      if (!scrollRequested && measurement.visible === false) {
        scrollRequested = true;
        return ['scroll', 'retry'] as const;
      }
      if (measurement.visible === false) {
        return ['retry'] as const;
      }
      return ['spotlight', 'focus'] as const;
    },
  };
}

export function createBoundedKeySet(maxEntries = 48) {
  const boundedMax = Math.max(1, Math.min(64, Math.floor(maxEntries)));
  const values = new Set<string>();

  return {
    add(value: string) {
      if (values.has(value)) {
        return false;
      }
      values.add(value);
      while (values.size > boundedMax) {
        const oldest = values.values().next().value;
        if (typeof oldest !== 'string') {
          break;
        }
        values.delete(oldest);
      }
      return true;
    },
    has(value: string) {
      return values.has(value);
    },
    delete(value: string) {
      return values.delete(value);
    },
    clear() {
      values.clear();
    },
    size() {
      return values.size;
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

export type GuideWindowRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type GuideViewport = {
  width: number;
  height: number;
  safeTop?: number;
  safeBottom?: number;
  keyboardHeight?: number;
  overlayX?: number;
  overlayY?: number;
};

function finiteNonNegative(value: number | undefined) {
  return Number.isFinite(value) ? Math.max(0, Number(value)) : 0;
}

export function getGuidedSpotlightGeometry(
  rect: GuideWindowRect,
  viewport: GuideViewport,
  visualPadding = 6
) {
  const viewportWidth = finiteNonNegative(viewport.width);
  const viewportHeight = finiteNonNegative(viewport.height);
  const safeBottom = finiteNonNegative(viewport.safeBottom);
  const keyboardHeight = finiteNonNegative(viewport.keyboardHeight);
  const overlayX = finiteNonNegative(viewport.overlayX);
  const overlayY = finiteNonNegative(viewport.overlayY);
  const localViewportWidth = Math.max(0, viewportWidth - overlayX);
  const localViewportHeight = Math.max(0, viewportHeight - overlayY);
  const safeTop = Math.max(
    0,
    finiteNonNegative(viewport.safeTop) - overlayY
  );
  const padding = Math.max(0, Math.min(12, finiteNonNegative(visualPadding)));
  const usableBottom = Math.max(
    safeTop,
    localViewportHeight - safeBottom - keyboardHeight
  );
  const rawLeft = finiteNonNegative(rect.x) - overlayX - padding;
  const rawTop = finiteNonNegative(rect.y) - overlayY - padding;
  const rawRight =
    finiteNonNegative(rect.x) -
    overlayX +
    finiteNonNegative(rect.width) +
    padding;
  const rawBottom =
    finiteNonNegative(rect.y) -
    overlayY +
    finiteNonNegative(rect.height) +
    padding;
  const left = Math.min(localViewportWidth, Math.max(0, rawLeft));
  const top = Math.min(usableBottom, Math.max(safeTop, rawTop));
  const right = Math.min(
    localViewportWidth,
    Math.max(left, rawRight)
  );
  const bottom = Math.min(usableBottom, Math.max(top, rawBottom));

  return {
    left,
    top,
    width: Math.max(0, right - left),
    height: Math.max(0, bottom - top),
  };
}

export function isGuideRectVisible(
  rect: GuideWindowRect,
  viewport: GuideViewport,
  margin = 12
) {
  const safeTop = finiteNonNegative(viewport.safeTop) + margin;
  const visibleBottom =
    finiteNonNegative(viewport.height) -
    finiteNonNegative(viewport.safeBottom) -
    finiteNonNegative(viewport.keyboardHeight) -
    margin;
  const availableHeight = Math.max(0, visibleBottom - safeTop);
  const targetIsTallerThanViewport = rect.height > availableHeight;
  return (
    rect.width > 0 &&
    rect.height > 0 &&
    (targetIsTallerThanViewport
      ? rect.y < visibleBottom && rect.y + rect.height > safeTop
      : rect.y >= safeTop && rect.y + rect.height <= visibleBottom)
  );
}

export function getGuideOverlayLayout(viewport: GuideViewport) {
  const height = finiteNonNegative(viewport.height);
  const safeTop = finiteNonNegative(viewport.safeTop);
  const safeBottom = finiteNonNegative(viewport.safeBottom);
  const keyboardHeight = finiteNonNegative(viewport.keyboardHeight);
  const availableHeight = Math.max(
    0,
    height - safeTop - safeBottom - keyboardHeight - 24
  );
  return {
    maxWidth: Math.min(620, Math.max(0, finiteNonNegative(viewport.width) - 24)),
    maxHeight: Math.min(420, availableHeight),
    bottom: Math.max(safeBottom, 12) + keyboardHeight,
  };
}

type GuideStatusQueryValue = {
  state: 'active' | 'completed' | 'invalidated' | 'restricted';
};

const PERMANENT_GUIDE_PUBLIC_ERROR_CODES = [
  'RECOMMENDATION_NOT_ACTIONABLE',
  'NOT_AUTHORIZED',
  'NOT_AUTHENTICATED',
] as const;

export type PermanentGuidePublicErrorCode =
  (typeof PERMANENT_GUIDE_PUBLIC_ERROR_CODES)[number];

const PERMANENT_GUIDE_QUERY_ERROR_CODES = new Set<string>(
  PERMANENT_GUIDE_PUBLIC_ERROR_CODES
);

function readBoundedObjectCode(value: unknown): string | null {
  if (!value || typeof value !== 'object' || !('code' in value)) {
    return null;
  }
  const code = value.code;
  return typeof code === 'string' ? code : null;
}

function extractAllowlistedCodeFromMessage(message: unknown): string | null {
  if (typeof message !== 'string') {
    return null;
  }
  const trimmed = message.trim();
  if (!trimmed) {
    return null;
  }
  if (PERMANENT_GUIDE_QUERY_ERROR_CODES.has(trimmed)) {
    return trimmed;
  }
  const uncaughtSuffix = trimmed.includes('Uncaught Error: ')
    ? trimmed.split('Uncaught Error: ').pop()?.trim()
    : null;
  const candidate = (uncaughtSuffix ?? trimmed).split(/\r?\n/, 1)[0]?.trim();
  if (candidate && PERMANENT_GUIDE_QUERY_ERROR_CODES.has(candidate)) {
    return candidate;
  }
  const tokens = trimmed.split(/[^A-Z0-9_]+/);
  for (const token of tokens) {
    if (PERMANENT_GUIDE_QUERY_ERROR_CODES.has(token)) {
      return token;
    }
  }
  return null;
}

/**
 * Safe public-code extraction for guide status errors.
 * Inspects only data.code, bounded cause.data.code, message, and cause.message.
 */
export function extractBoundedGuidePublicErrorCode(
  error: unknown
): PermanentGuidePublicErrorCode | null {
  if (!error || typeof error !== 'object') {
    return null;
  }
  const directCode = readBoundedObjectCode(
    'data' in error ? error.data : null
  );
  if (
    directCode &&
    PERMANENT_GUIDE_QUERY_ERROR_CODES.has(directCode)
  ) {
    return directCode as PermanentGuidePublicErrorCode;
  }
  const cause =
    'cause' in error && error.cause && typeof error.cause === 'object'
      ? error.cause
      : null;
  const nestedCode = readBoundedObjectCode(
    cause && 'data' in cause ? cause.data : null
  );
  if (
    nestedCode &&
    PERMANENT_GUIDE_QUERY_ERROR_CODES.has(nestedCode)
  ) {
    return nestedCode as PermanentGuidePublicErrorCode;
  }
  const messageCode = extractAllowlistedCodeFromMessage(
    'message' in error ? error.message : null
  );
  if (messageCode) {
    return messageCode as PermanentGuidePublicErrorCode;
  }
  const causeMessageCode = extractAllowlistedCodeFromMessage(
    cause && 'message' in cause ? cause.message : null
  );
  if (causeMessageCode) {
    return causeMessageCode as PermanentGuidePublicErrorCode;
  }
  return null;
}

export function getGuideQueryErrorCode(error: unknown) {
  return extractBoundedGuidePublicErrorCode(error);
}

export function isPermanentGuideQueryError(error: unknown) {
  return extractBoundedGuidePublicErrorCode(error) !== null;
}

export function hasGuideLikeRouteMetadata(input: {
  guideSessionId?: unknown;
  guideId?: unknown;
  stableId?: unknown;
  evidenceFingerprint?: unknown;
  recommendationBusinessId?: unknown;
}) {
  return [
    input.guideSessionId,
    input.guideId,
    input.stableId,
    input.evidenceFingerprint,
    input.recommendationBusinessId,
  ].some(
    (value) => typeof value === 'string' && value.trim().length > 0
  );
}

/**
 * Destination-only route params must never be treated as guide metadata.
 * Ordinary business navigation may include these without activating guidance.
 */
export const ORDINARY_DESTINATION_ROUTE_KEYS = [
  'businessId',
  'programId',
  'campaignId',
  'entityId',
  'filter',
  'section',
  'fieldId',
  'limitKey',
] as const;

export type GuidedClientPresence = {
  hasGuideMetadata: boolean;
  isInert: boolean;
};

export function resolveGuidedClientPresence(input: {
  guideSessionId?: unknown;
  guideId?: unknown;
  stableId?: unknown;
  evidenceFingerprint?: unknown;
  recommendationBusinessId?: unknown;
  businessId?: unknown;
  programId?: unknown;
  campaignId?: unknown;
  entityId?: unknown;
  filter?: unknown;
  section?: unknown;
  fieldId?: unknown;
  limitKey?: unknown;
}): GuidedClientPresence {
  const hasGuideMetadata = hasGuideLikeRouteMetadata({
    guideSessionId: input.guideSessionId,
    guideId: input.guideId,
    stableId: input.stableId,
    evidenceFingerprint: input.evidenceFingerprint,
    recommendationBusinessId: input.recommendationBusinessId,
  });
  return {
    hasGuideMetadata,
    isInert: !hasGuideMetadata,
  };
}

/**
 * Stable empty request for Convex `useQueries`.
 * Passing a fresh `{}` every render causes useSubscription to setState during
 * render and infinite-loop ("Too many re-renders").
 */
export const EMPTY_GUIDED_STATUS_QUERIES: Record<string, never> =
  Object.freeze({});

export type GuidedStatusQueryRequestArgs = {
  guideSessionId: string;
  businessId: string;
  stableId: string;
  guideId: string;
  evidenceFingerprint: string;
  entityId?: string;
};

export function buildGuidedStatusQueriesRequest<TQuery>(input: {
  enabled: boolean;
  query: TQuery;
  args: GuidedStatusQueryRequestArgs | null;
}):
  | typeof EMPTY_GUIDED_STATUS_QUERIES
  | {
      guideStatus: {
        query: TQuery;
        args: GuidedStatusQueryRequestArgs;
      };
    } {
  if (!input.enabled || !input.args) {
    return EMPTY_GUIDED_STATUS_QUERIES;
  }
  return {
    guideStatus: {
      query: input.query,
      args: input.args,
    },
  };
}

export function buildBusinessMismatchCleanupKey(input: {
  activeBusinessId: unknown;
  guideId: unknown;
  guideSessionId?: unknown;
  stableId?: unknown;
  recommendationBusinessId?: unknown;
}) {
  return [
    String(input.activeBusinessId ?? ''),
    String(input.guideId ?? ''),
    String(input.guideSessionId ?? ''),
    String(input.stableId ?? ''),
    String(input.recommendationBusinessId ?? ''),
  ].join('|');
}

export function shouldAutoClearBusinessMismatchGuide(input: {
  activeBusinessId: unknown;
  guideId: unknown;
  bindingOk: boolean;
  reasonCode: unknown;
  cleanupKey: string;
  alreadyClearedKey: string | null;
}) {
  if (
    !input.activeBusinessId ||
    typeof input.guideId !== 'string' ||
    input.guideId.trim().length === 0 ||
    input.bindingOk ||
    input.reasonCode !== 'BUSINESS_MISMATCH'
  ) {
    return false;
  }
  return input.alreadyClearedKey !== input.cleanupKey;
}

export function shouldResetGuidedStatusRetryAfterSuccess(input: {
  identity: string | null;
  retryIdentity: string | null;
  attempts: number;
  inFlight: boolean;
  exhausted: boolean;
}) {
  return (
    typeof input.identity === 'string' &&
    input.identity.length > 0 &&
    input.retryIdentity === input.identity &&
    (input.attempts > 0 || input.inFlight || input.exhausted)
  );
}

export function shouldClearRejectedGuideRouteParams(input: {
  hasGuideMetadata: boolean;
  userRequestedClose: boolean;
}) {
  return input.hasGuideMetadata === true && input.userRequestedClose === true;
}

export type GuidedRuntimeTransitionDecision =
  | { kind: 'inert'; mutated: false }
  | { kind: 'activation'; mutated: boolean; identity: string }
  | { kind: 'deactivation'; mutated: boolean };

/**
 * Pure decision helper used by the client runtime coordinator path.
 * Same activation identity is a no-op; inert presence never mutates.
 */
export function decideGuidedRuntimeTransition(input: {
  isInert: boolean;
  canActivate: boolean;
  activationIdentity: string;
  activeIdentity: string | null;
}): GuidedRuntimeTransitionDecision {
  if (input.isInert || !input.canActivate) {
    return {
      kind: 'deactivation',
      mutated: input.activeIdentity !== null,
    };
  }
  if (input.activeIdentity === input.activationIdentity) {
    return {
      kind: 'activation',
      mutated: false,
      identity: input.activationIdentity,
    };
  }
  return {
    kind: 'activation',
    mutated: true,
    identity: input.activationIdentity,
  };
}

export type GuidedStatusPanelMode =
  | 'none'
  | 'guided'
  | 'lifecycle'
  | 'rejected_cleanup';

export const REJECTED_GUIDE_CLEANUP_MESSAGE =
  'ההדרכה הזו אינה זמינה יותר';

export function shouldRenderGuidedStatusPanel(input: {
  hasGuideMetadata: boolean;
  isClosed?: boolean;
  isBindingValid: boolean;
  canActivateTarget: boolean;
  status: GuidedTargetServerStatus;
  feedback?: string | null;
}): GuidedStatusPanelMode {
  if (!input.hasGuideMetadata || input.isClosed === true) {
    return 'none';
  }
  if (input.canActivateTarget) {
    return 'guided';
  }
  if (input.status === 'rejected') {
    return 'rejected_cleanup';
  }
  if (
    input.status === 'restricted' ||
    input.status === 'completed' ||
    input.status === 'invalidated' ||
    input.status === 'error' ||
    input.status === 'unavailable'
  ) {
    return 'lifecycle';
  }
  if (input.status === 'loading' && input.isBindingValid) {
    return input.feedback ? 'lifecycle' : 'none';
  }
  return 'none';
}

export function buildGuidedStatusRetryIdentity(input: {
  businessId?: unknown;
  guideSessionId?: unknown;
  stableId?: unknown;
  guideId?: unknown;
  routeKey?: unknown;
  entityId?: unknown;
  stepIndex?: unknown;
}) {
  const stepIndex =
    typeof input.stepIndex === 'number' && Number.isFinite(input.stepIndex)
      ? Math.max(0, Math.floor(input.stepIndex))
      : 0;
  return [
    String(input.businessId ?? ''),
    String(input.guideSessionId ?? ''),
    String(input.stableId ?? ''),
    String(input.guideId ?? ''),
    String(input.routeKey ?? ''),
    String(input.entityId ?? ''),
    String(stepIndex),
  ].join('|');
}

export function resolveGuidedActionStatus(input: {
  bindingValid: boolean;
  requiredMetadataValid: boolean;
  connected: boolean;
  queryResult: GuideStatusQueryValue | Error | undefined;
}): GuidedTargetServerStatus {
  if (!input.bindingValid || !input.requiredMetadataValid) {
    return 'rejected';
  }
  if (
    input.queryResult instanceof Error &&
    isPermanentGuideQueryError(input.queryResult)
  ) {
    return 'rejected';
  }
  if (!input.connected) {
    return 'unavailable';
  }
  if (input.queryResult instanceof Error) {
    return 'error';
  }
  if (input.queryResult === undefined) {
    return 'loading';
  }
  return input.queryResult.state;
}

export function isGuideRetryableState(input: {
  status: GuidedTargetServerStatus;
  targetUnavailable?: boolean;
  retryExhausted?: boolean;
}) {
  if (input.retryExhausted === true) {
    return false;
  }
  return (
    input.status === 'error' ||
    input.status === 'unavailable' ||
    (input.status === 'active' && input.targetUnavailable === true)
  );
}

export type SubscriptionGuideTarget =
  | {
      targetId: 'subscription-recover-target';
      action: 'restore_purchases';
    }
  | {
      targetId: 'quota-review-target';
      action: 'review_campaigns_quota';
    };

export function isSubscriptionRecoveryStatus(status: unknown) {
  return (
    status === 'past_due' ||
    status === 'canceled' ||
    status === 'inactive'
  );
}

export function resolveSubscriptionGuideTarget(input: {
  guideId: unknown;
  subscriptionStatus: unknown;
  limitKey?: unknown;
}): SubscriptionGuideTarget | null {
  if (
    input.guideId === 'subscription-recover' &&
    isSubscriptionRecoveryStatus(input.subscriptionStatus)
  ) {
    return {
      targetId: 'subscription-recover-target',
      action: 'restore_purchases',
    };
  }
  if (
    input.guideId === 'quota-review' &&
    input.limitKey === 'campaigns'
  ) {
    return {
      targetId: 'quota-review-target',
      action: 'review_campaigns_quota',
    };
  }
  return null;
}

export type CampaignDetailGuideTarget =
  | 'publish-action'
  | 'resume-action'
  | 'schedule-summary';

export function resolveCampaignDetailGuideTarget(
  guideId: unknown
): CampaignDetailGuideTarget | null {
  if (guideId === 'campaign-publish') {
    return 'publish-action';
  }
  if (guideId === 'campaign-resume') {
    return 'resume-action';
  }
  if (guideId === 'campaign-schedule-review') {
    return 'schedule-summary';
  }
  return null;
}

export function getClearedGuideRouteParams() {
  return {
    guideSessionId: undefined,
    guideId: undefined,
    stableId: undefined,
    evidenceFingerprint: undefined,
    recommendationBusinessId: undefined,
    entityId: undefined,
    fieldId: undefined,
    limitKey: undefined,
  };
}

export type GuidedFreshStatusQueryResult = {
  state: 'active' | 'completed' | 'invalidated' | 'restricted';
  reasonCode?: string;
};

export type GuidedRuntimeMeasurement = {
  available: boolean;
  visible?: boolean;
  rect?: GuideWindowRect;
};

export type GuidedActionRuntimeCoordinator = ReturnType<
  typeof createGuidedActionRuntimeCoordinator
>;

export function createGuidedActionRuntimeCoordinator(options?: {
  maxStatusRetries?: number;
  maxMeasurementAttempts?: number;
  schedule?: (callback: () => void, delayMs: number) => unknown;
  cancel?: (handle: unknown) => void;
  delayMs?: number;
}) {
  const activationController = createGuidedActivationTransitionController();
  const preparationController = createGuidedTargetPreparationController();
  const statusRetryController = createGuidedStatusRetryController(
    options?.maxStatusRetries ?? 3
  );
  const focusController = createGuidedFocusController();
  const measurementRetryController = createBoundedRetryController({
    maxAttempts: options?.maxMeasurementAttempts ?? 4,
    schedule: options?.schedule,
    cancel: options?.cancel,
    delayMs: options?.delayMs ?? 80,
  });
  let identity: string | null = null;
  let disposed = false;
  let targetCleanup: (() => void) | null = null;

  const assertNotDisposed = () => !disposed;

  const invalidateIdentityWork = () => {
    preparationController.cancel();
    measurementRetryController.stop();
    focusController.reset();
    activationController.deactivate();
    targetCleanup?.();
    targetCleanup = null;
  };

  return {
    setIdentity(nextIdentity: string | null) {
      if (!assertNotDisposed()) {
        return false;
      }
      if (identity === nextIdentity) {
        return false;
      }
      identity = nextIdentity;
      invalidateIdentityWork();
      statusRetryController.reset(nextIdentity);
      return true;
    },
    getIdentity() {
      return identity;
    },
    canActivate(input: GuidedTargetActivationInput) {
      return canActivateGuidedTarget(input);
    },
    prepareTarget(input: {
      activation: GuidedTargetActivationInput;
      identity: string;
      prepareTarget?: () => void | Promise<void>;
      force?: boolean;
      onFailure?: () => void;
    }) {
      if (!assertNotDisposed()) {
        return { ran: false as const, reason: 'disposed' as const };
      }
      if (!canActivateGuidedTarget(input.activation)) {
        return { ran: false as const, reason: 'inactive' as const };
      }
      if (typeof input.prepareTarget !== 'function') {
        return { ran: false as const, reason: 'missing_prepare' as const };
      }
      const preparation = preparationController.begin(
        input.identity,
        input.force === true
      );
      if (!preparation) {
        return { ran: false as const, reason: 'already_prepared' as const };
      }
      try {
        const pending = input.prepareTarget();
        if (pending && typeof pending.then === 'function') {
          void pending.catch(() => {
            if (!preparation.isCurrent()) {
              return;
            }
            preparationController.fail(preparation);
            input.onFailure?.();
          });
        }
        return {
          ran: true as const,
          context: preparation,
        };
      } catch {
        if (preparation.isCurrent()) {
          preparationController.fail(preparation);
          input.onFailure?.();
        }
        return { ran: false as const, reason: 'prepare_failed' as const };
      }
    },
    bindObservableTarget(input: {
      activation: GuidedTargetActivationInput;
      identity: string;
      getCurrent: () => unknown | null;
      subscribe: (listener: (node: unknown | null) => void) => () => void;
      register: (node: unknown) => (() => void) | void;
      onDeactivate?: () => void;
    }) {
      if (!assertNotDisposed()) {
        return false;
      }
      return activationController.update(input.activation, input.identity, {
        activate: (activationContext) => {
          let unregister: (() => void) | null = null;
          const syncRegistration = (node: unknown | null) => {
            unregister?.();
            unregister = null;
            if (
              !node ||
              !activationContext.isCurrent() ||
              !canActivateGuidedTarget(input.activation)
            ) {
              return;
            }
            const cleanup = input.register(node);
            unregister = typeof cleanup === 'function' ? cleanup : null;
          };
          const unsubscribe = input.subscribe(syncRegistration);
          syncRegistration(input.getCurrent());
          targetCleanup = () => {
            unsubscribe();
            unregister?.();
          };
          return () => {
            unsubscribe();
            unregister?.();
            if (targetCleanup) {
              targetCleanup = null;
            }
          };
        },
        deactivate: () => {
          measurementRetryController.stop();
          focusController.reset();
          input.onDeactivate?.();
        },
      });
    },
    runMeasurementSequence(input: {
      identity: string;
      isCurrent: () => boolean;
      canScroll?: boolean;
      measure: () => GuidedRuntimeMeasurement | null | Promise<GuidedRuntimeMeasurement | null>;
      scroll?: () => void;
      focus?: () => void;
      onSpotlight?: (rect: GuideWindowRect) => void;
      onUnavailable?: () => void;
    }) {
      if (!assertNotDisposed()) {
        return false;
      }
      const sequence = createGuidedMeasurementSequence({
        canScroll: input.canScroll === true,
      });
      measurementRetryController.start((attempt, retry) => {
        if (!assertNotDisposed() || !input.isCurrent()) {
          return;
        }
        void Promise.resolve(input.measure()).then((measurement) => {
          if (!assertNotDisposed() || !input.isCurrent()) {
            return;
          }
          if (!measurement?.available) {
            if (attempt >= measurementRetryController.getMaxAttempts()) {
              input.onUnavailable?.();
              return;
            }
            retry();
            return;
          }
          const actions = sequence.next({
            available: true,
            visible: measurement.visible,
          });
          if (actions[0] === 'scroll') {
            input.scroll?.();
            retry();
            return;
          }
          if (actions[0] === 'retry') {
            if (attempt >= measurementRetryController.getMaxAttempts()) {
              input.onUnavailable?.();
              return;
            }
            retry();
            return;
          }
          if (measurement.rect) {
            input.onSpotlight?.(measurement.rect);
          }
          focusController.focusOnce(input.identity, input.focus);
        });
      });
      return true;
    },
    async runAuthoritativeTargetPipeline(input: {
      activation: GuidedTargetActivationInput;
      identity: string;
      prepareTarget?: () => void | Promise<void>;
      sectionExpanded?: boolean;
      getCurrent: () => unknown | null;
      subscribe: (listener: (node: unknown | null) => void) => () => void;
      register: (node: unknown) => (() => void) | void;
      measure: (node: unknown) => GuidedRuntimeMeasurement | null | Promise<GuidedRuntimeMeasurement | null>;
      scroll?: () => void;
      focus?: () => void;
      onSpotlight?: (rect: GuideWindowRect) => void;
      onUnavailable?: () => void;
      onPrepareFailure?: () => void;
      trackStarted?: () => void;
    }) {
      if (!assertNotDisposed()) {
        return { ok: false as const, reason: 'disposed' as const };
      }
      if (!canActivateGuidedTarget(input.activation)) {
        return { ok: false as const, reason: 'inactive' as const };
      }
      this.setIdentity(input.identity);
      if (
        typeof input.prepareTarget === 'function' &&
        input.sectionExpanded !== true
      ) {
        const prepared = this.prepareTarget({
          activation: input.activation,
          identity: input.identity,
          prepareTarget: input.prepareTarget,
          onFailure: input.onPrepareFailure,
        });
        if (!prepared.ran && prepared.reason === 'prepare_failed') {
          return { ok: false as const, reason: 'prepare_failed' as const };
        }
      } else if (
        typeof input.prepareTarget === 'function' &&
        input.sectionExpanded === true
      ) {
        preparationController.begin(input.identity);
      }
      try {
        input.trackStarted?.();
      } catch {
        // Analytics failure must not block preparation/measurement.
      }
      let registered = false;
      let spotlightShown = false;
      const bound = this.bindObservableTarget({
        activation: input.activation,
        identity: input.identity,
        getCurrent: input.getCurrent,
        subscribe: input.subscribe,
        register: (node) => {
          if (!canActivateGuidedTarget(input.activation)) {
            return;
          }
          registered = true;
          const cleanup = input.register(node);
          this.runMeasurementSequence({
            identity: input.identity,
            isCurrent: () =>
              identity === input.identity &&
              canActivateGuidedTarget(input.activation),
            canScroll: typeof input.scroll === 'function',
            measure: () => input.measure(node),
            scroll: input.scroll,
            focus: input.focus,
            onSpotlight: (rect) => {
              spotlightShown = true;
              input.onSpotlight?.(rect);
            },
            onUnavailable: input.onUnavailable,
          });
          return cleanup;
        },
      });
      if (!bound) {
        return { ok: false as const, reason: 'bind_failed' as const };
      }
      return {
        ok: true as const,
        registered: () => registered,
        spotlightShown: () => spotlightShown,
      };
    },
    async retryFreshStatus(input: {
      identity: string;
      status: GuidedTargetServerStatus;
      connected: boolean;
      args: Record<string, unknown> | null;
      query: (
        args: Record<string, unknown>
      ) => Promise<GuidedFreshStatusQueryResult>;
      onOffline?: () => void;
      onLoading?: () => void;
      onSuccess?: (result: GuidedFreshStatusQueryResult) => void;
      onRejected?: (error: unknown) => void;
      onRetryableError?: (exhausted: boolean, error: unknown) => void;
      onStale?: () => void;
      trackAnalytics?: () => void;
    }) {
      if (!assertNotDisposed()) {
        return { ok: false as const, reason: 'disposed' as const };
      }
      if (input.status === 'rejected' || !input.args) {
        return { ok: false as const, reason: 'rejected' as const };
      }
      if (!input.connected) {
        input.onOffline?.();
        return { ok: false as const, reason: 'offline' as const };
      }
      if (identity !== input.identity) {
        statusRetryController.reset(input.identity);
        identity = input.identity;
      }
      const token = statusRetryController.begin(input.identity);
      if (!token) {
        return {
          ok: false as const,
          reason: statusRetryController.getState().exhausted
            ? ('exhausted' as const)
            : ('in_flight' as const),
        };
      }
      input.onLoading?.();
      try {
        try {
          input.trackAnalytics?.();
        } catch {
          // Analytics failure must not block the fresh query.
        }
        const result = await input.query(input.args);
        if (
          disposed ||
          identity !== input.identity ||
          !statusRetryController.settle(token, true)
        ) {
          input.onStale?.();
          return { ok: false as const, reason: 'stale' as const };
        }
        input.onSuccess?.(result);
        return { ok: true as const, result };
      } catch (error) {
        const staleAbort =
          disposed ||
          identity !== input.identity ||
          (error instanceof Error && error.message === 'GUIDE_QUERY_STALE');
        if (staleAbort) {
          if (statusRetryController.isCurrent(token)) {
            statusRetryController.settle(token);
          }
          input.onStale?.();
          return { ok: false as const, reason: 'stale' as const };
        }
        if (!statusRetryController.settle(token)) {
          input.onStale?.();
          return { ok: false as const, reason: 'stale' as const };
        }
        if (isPermanentGuideQueryError(error)) {
          statusRetryController.cancel();
          input.onRejected?.(error);
          return { ok: false as const, reason: 'rejected' as const };
        }
        input.onRetryableError?.(
          statusRetryController.getState().exhausted,
          error
        );
        return { ok: false as const, reason: 'retryable' as const };
      }
    },
    cancelStatusRetry() {
      statusRetryController.cancel();
    },
    resetStatusRetry(nextIdentity: string | null = identity) {
      statusRetryController.reset(nextIdentity);
    },
    getStatusRetryState() {
      return statusRetryController.getState();
    },
    isPrepared(nextIdentity: string) {
      return preparationController.isPrepared(nextIdentity);
    },
    cancelPreparation() {
      preparationController.cancel();
    },
    deactivate() {
      invalidateIdentityWork();
    },
    dispose() {
      disposed = true;
      invalidateIdentityWork();
      statusRetryController.cancel();
      identity = null;
    },
    getActivationGeneration() {
      return activationController.getGeneration();
    },
    isActivationActive() {
      return activationController.isActive();
    },
  };
}
