export const BUSINESS_ONBOARDING_ROUTES = {
  role: '/(auth)/onboarding-business-role',
  discovery: '/(auth)/onboarding-business-discovery',
  reason: '/(auth)/onboarding-business-reason',
  name: '/(auth)/onboarding-business-name',
  usageArea: '/(auth)/onboarding-business-usage-area',
  createBusiness: '/(authenticated)/merchant/onboarding/create-business',
  createProgram: '/(authenticated)/merchant/onboarding/create-program',
  previewCard: '/(authenticated)/merchant/onboarding/preview-card',
} as const;

export const BUSINESS_ONBOARDING_PROGRESS = {
  role: 1,
  discovery: 2,
  reason: 3,
  name: 4,
  usageArea: 5,
  createBusiness: 6,
  createProgram: 7,
  previewCard: 8,
} as const;

export const BUSINESS_ONBOARDING_TOTAL_STEPS =
  BUSINESS_ONBOARDING_PROGRESS.previewCard;
