export const BUSINESS_ONBOARDING_ROUTES = {
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
