export const ANALYTICS_EVENTS = {
  // Onboarding
  onboardingScreenViewed: 'onboarding_screen_viewed',
  onboardingChoiceSelected: 'onboarding_choice_selected',
  onboardingContinueClicked: 'onboarding_continue_clicked',
  onboardingStepCompleted: 'onboarding_step_completed',
  onboardingError: 'onboarding_error',
  onboardingStepAbandoned: 'onboarding_step_abandoned',
  // Auth
  otpSent: 'otp_sent',
  otpResent: 'otp_resent',
  otpVerified: 'otp_verified',
  otpFailed: 'otp_failed',
  // Paywall
  paywallViewed: 'paywall_viewed',
  planSelected: 'plan_selected',
  checkoutStarted: 'checkout_started',
  purchaseCompleted: 'purchase_completed',
  purchaseFailed: 'purchase_failed',
  onboardingCompleted: 'onboarding_completed',
  // Activation milestones
  customerJoinedFirstBusiness: 'customer_joined_first_business',
  customerFirstCardCreated: 'customer_first_card_created',
  customerFirstStampReceived: 'customer_first_stamp_received',
  businessCreated: 'business_created',
  loyaltyCardCreated: 'loyalty_card_created',
  firstScanCompleted: 'first_scan_completed',
  // QR / Join flow
  qrScannedBusinessJoin: 'qr_scanned_business_join',
  joinOpenedInApp: 'join_opened_in_app',
  joinCompleted: 'join_completed',
  joinAlreadyMember: 'join_already_member',
  // QR / Stamp flow
  qrPresentedCustomer: 'qr_presented_customer',
  qrScannedCustomer: 'qr_scanned_customer',
  stampSuccess: 'stamp_success',
  stampFailed: 'stamp_failed',
  // Landing page
  landingPageViewed: 'landing_page_viewed',
} as const;

export type AnalyticsEventName =
  (typeof ANALYTICS_EVENTS)[keyof typeof ANALYTICS_EVENTS];

export type OnboardingRole = 'client' | 'business';

export type BaseAnalyticsProps = {
  app_version: string | null;
  platform: 'ios' | 'android' | 'web' | 'unknown';
  locale: string | null;
  role?: OnboardingRole;
  onboardingSessionId?: string;
  pathname?: string;
  screen?: string;
};
