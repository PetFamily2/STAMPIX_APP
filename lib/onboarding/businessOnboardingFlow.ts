export const BUSINESS_ONBOARDING_ROUTES = {
  entry: '/(authenticated)/merchant/onboarding',
  role: '/(auth)/onboarding-business-role',
  discovery: '/(auth)/onboarding-business-discovery',
  reason: '/(auth)/onboarding-business-reason',
  name: '/(auth)/onboarding-business-name',
  usageArea: '/(auth)/onboarding-business-usage-area',
  plan: '/(auth)/onboarding-business-plan',
  createBusiness: '/(authenticated)/merchant/onboarding/create-business',
  createProgram: '/(authenticated)/merchant/onboarding/create-program',
  previewCard: '/(authenticated)/merchant/onboarding/preview-card',
} as const;

export const BUSINESS_ONBOARDING_PROGRESS = {
  role: 1,
  discovery: 2,
  reason: 3,
  name: 4,
  createBusiness: 5,
  usageArea: 6,
  plan: 7,
  createProgram: 8,
  previewCard: 9,
} as const;

export const BUSINESS_ONBOARDING_TOTAL_STEPS =
  BUSINESS_ONBOARDING_PROGRESS.previewCard;

export type BusinessOnboardingStep = keyof typeof BUSINESS_ONBOARDING_PROGRESS;

export const BUSINESS_ONBOARDING_FLOW = {
  default: 'default',
  additional: 'additional',
} as const;

export type BusinessOnboardingFlow =
  (typeof BUSINESS_ONBOARDING_FLOW)[keyof typeof BUSINESS_ONBOARDING_FLOW];

const ADDITIONAL_BUSINESS_ONBOARDING_PROGRESS = {
  name: 1,
  createBusiness: 2,
  plan: 3,
  createProgram: 4,
  previewCard: 5,
} as const;

const ADDITIONAL_FLOW_ALLOWED_STEPS = new Set(
  Object.keys(ADDITIONAL_BUSINESS_ONBOARDING_PROGRESS)
);

const ADDITIONAL_BUSINESS_ONBOARDING_TOTAL_STEPS =
  ADDITIONAL_BUSINESS_ONBOARDING_PROGRESS.previewCard;

export function isAdditionalBusinessFlow(
  flow?: string | string[] | null
): boolean {
  const normalized = Array.isArray(flow) ? flow[0] : flow;
  return normalized === BUSINESS_ONBOARDING_FLOW.additional;
}

export function withBusinessOnboardingFlow(
  route: string,
  flow?: string | string[] | null
): string {
  if (!isAdditionalBusinessFlow(flow)) {
    return route;
  }

  const separator = route.includes('?') ? '&' : '?';
  return `${route}${separator}flow=${BUSINESS_ONBOARDING_FLOW.additional}`;
}

export function resolveBusinessOnboardingFlow(
  flow?: string | string[] | null
): BusinessOnboardingFlow {
  return isAdditionalBusinessFlow(flow)
    ? BUSINESS_ONBOARDING_FLOW.additional
    : BUSINESS_ONBOARDING_FLOW.default;
}

export function getBusinessOnboardingRouteForStep(
  step: BusinessOnboardingStep,
  flow?: string | string[] | null
) {
  const baseRoute = BUSINESS_ONBOARDING_ROUTES[step];
  const resolvedFlow = resolveBusinessOnboardingFlow(flow);
  const shouldAttachAdditionalFlow =
    resolvedFlow === BUSINESS_ONBOARDING_FLOW.additional &&
    ADDITIONAL_FLOW_ALLOWED_STEPS.has(step);

  if (!shouldAttachAdditionalFlow) {
    return baseRoute;
  }

  return withBusinessOnboardingFlow(baseRoute, resolvedFlow);
}

export function getBusinessOnboardingEntryRoute(
  hasCompletedBusinessOnboarding: boolean
): string {
  if (hasCompletedBusinessOnboarding) {
    return withBusinessOnboardingFlow(
      BUSINESS_ONBOARDING_ROUTES.entry,
      BUSINESS_ONBOARDING_FLOW.additional
    );
  }

  return BUSINESS_ONBOARDING_ROUTES.entry;
}

export function getBusinessOnboardingProgressStep(
  step: keyof typeof BUSINESS_ONBOARDING_PROGRESS,
  flow?: string | string[] | null
): number {
  if (isAdditionalBusinessFlow(flow)) {
    const additionalStep =
      ADDITIONAL_BUSINESS_ONBOARDING_PROGRESS[
        step as keyof typeof ADDITIONAL_BUSINESS_ONBOARDING_PROGRESS
      ];
    if (additionalStep != null) {
      return additionalStep;
    }
  }

  return BUSINESS_ONBOARDING_PROGRESS[step];
}

export function getBusinessOnboardingStepOrder(
  step: BusinessOnboardingStep,
  flow?: string | string[] | null
) {
  if (isAdditionalBusinessFlow(flow)) {
    const additionalStep =
      ADDITIONAL_BUSINESS_ONBOARDING_PROGRESS[
        step as keyof typeof ADDITIONAL_BUSINESS_ONBOARDING_PROGRESS
      ];
    if (additionalStep != null) {
      return additionalStep;
    }
  }

  return BUSINESS_ONBOARDING_PROGRESS[step];
}

export function getBusinessOnboardingTotalSteps(
  flow?: string | string[] | null
): number {
  return isAdditionalBusinessFlow(flow)
    ? ADDITIONAL_BUSINESS_ONBOARDING_TOTAL_STEPS
    : BUSINESS_ONBOARDING_TOTAL_STEPS;
}
