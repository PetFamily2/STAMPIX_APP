import { POST_AUTH_ROUTES } from '@/lib/auth/postAuthRouting';

/**
 * Shared authenticated routes that were already reachable without living in
 * a role group. Customer mode must keep being able to stay on these.
 */
const PRESERVED_AUTHENTICATED_FREE_SEGMENTS = [
  'card',
  'merchant',
  'admin',
  'join',
  'business-recovery',
  'business-permanent-deletion',
] as const;

/**
 * Shared authenticated routes a customer may open from customer navigation.
 * They sit outside the (customer) group, so they need an explicit allow.
 */
const CUSTOMER_SHARED_AUTHENTICATED_SEGMENTS = [
  'settings-legal',
  'accept-invite',
] as const;

export const CUSTOMER_ALLOWED_SHARED_SEGMENTS = [
  ...PRESERVED_AUTHENTICATED_FREE_SEGMENTS,
  ...CUSTOMER_SHARED_AUTHENTICATED_SEGMENTS,
] as const;

const CUSTOMER_ALLOWED_SHARED_SEGMENT_SET = new Set<string>(
  CUSTOMER_ALLOWED_SHARED_SEGMENTS
);

export type AuthenticatedRouteGuardInput = {
  resolutionHref: string;
  segments: readonly string[];
  activeMode: 'customer' | 'business';
  isAdditionalMerchantOnboarding: boolean;
};

export type AuthenticatedRouteGuardDecision =
  | { action: 'stay' }
  | { action: 'replace'; href: string };

function includesSegment(
  segments: readonly string[],
  segment: string
): boolean {
  return segments.includes(segment);
}

function isCustomerAllowedSharedRoute(segments: readonly string[]): boolean {
  return segments.some((segment) =>
    CUSTOMER_ALLOWED_SHARED_SEGMENT_SET.has(segment)
  );
}

export function resolveAuthenticatedRouteGuard(
  input: AuthenticatedRouteGuardInput
): AuthenticatedRouteGuardDecision {
  const {
    resolutionHref,
    segments,
    activeMode,
    isAdditionalMerchantOnboarding,
  } = input;
  const inMerchant = includesSegment(segments, 'merchant');
  const inCustomerGroup = includesSegment(segments, '(customer)');
  const inBusinessGroup = includesSegment(segments, '(business)');
  const inStaffGroup = includesSegment(segments, '(staff)');
  const isSharedAllowed = isCustomerAllowedSharedRoute(segments);

  if (resolutionHref === POST_AUTH_ROUTES.nameCapture) {
    return { action: 'replace', href: POST_AUTH_ROUTES.nameCapture };
  }

  if (resolutionHref === POST_AUTH_ROUTES.merchantOnboarding) {
    if (!inMerchant) {
      return { action: 'replace', href: POST_AUTH_ROUTES.merchantOnboarding };
    }
    return { action: 'stay' };
  }

  if (resolutionHref === POST_AUTH_ROUTES.businessDashboard) {
    if (
      inCustomerGroup ||
      inStaffGroup ||
      (inMerchant && !isAdditionalMerchantOnboarding)
    ) {
      return { action: 'replace', href: POST_AUTH_ROUTES.businessDashboard };
    }
    return { action: 'stay' };
  }

  if (resolutionHref === POST_AUTH_ROUTES.staffScanner) {
    if (!inStaffGroup && (!inMerchant || !isAdditionalMerchantOnboarding)) {
      return { action: 'replace', href: POST_AUTH_ROUTES.staffScanner };
    }
    return { action: 'stay' };
  }

  if (resolutionHref === POST_AUTH_ROUTES.customerWallet) {
    if (
      activeMode === 'business' ||
      inBusinessGroup ||
      inStaffGroup ||
      (!inCustomerGroup &&
        !inBusinessGroup &&
        !inStaffGroup &&
        !isSharedAllowed)
    ) {
      return { action: 'replace', href: POST_AUTH_ROUTES.customerWallet };
    }
  }

  return { action: 'stay' };
}
