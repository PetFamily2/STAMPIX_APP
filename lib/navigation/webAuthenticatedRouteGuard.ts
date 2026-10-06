import {
  POST_AUTH_ROUTES,
  WEB_BUSINESS_PROOF_HREF,
  WEB_STAFF_LANDING_HREF,
} from '../auth/postAuthRouting';
import type {
  AuthenticatedRouteGuardDecision,
  AuthenticatedRouteGuardInput,
} from './authenticatedRouteGuard';
import { resolveAuthenticatedRouteGuard } from './authenticatedRouteGuard';

// Existing customer destinations only. Native management/scanner groups must
// not become accessible just because their shared layout can render on Web.
const WEB_CUSTOMER_SHARED_SEGMENTS = new Set([
  'card',
  'join',
  'accept-invite',
  'settings-legal',
  'inbox',
]);

export function resolveWebAuthenticatedRouteGuard(
  input: AuthenticatedRouteGuardInput
): AuthenticatedRouteGuardDecision {
  const { resolutionHref, segments } = input;
  if (
    (resolutionHref === WEB_BUSINESS_PROOF_HREF ||
      resolutionHref === WEB_STAFF_LANDING_HREF) &&
    (segments.includes('accept-invite') ||
      segments.includes('settings-legal') ||
      segments.includes('inbox') ||
      (input.isAdditionalMerchantOnboarding && segments.includes('merchant')))
  )
    return { action: 'stay' };
  if (resolutionHref === POST_AUTH_ROUTES.merchantOnboarding) {
    return segments.includes('merchant') && segments.includes('onboarding')
      ? { action: 'stay' }
      : { action: 'replace', href: POST_AUTH_ROUTES.merchantOnboarding };
  }
  if (
    resolutionHref === WEB_BUSINESS_PROOF_HREF ||
    resolutionHref === WEB_STAFF_LANDING_HREF
  ) {
    return { action: 'replace', href: resolutionHref };
  }

  if (resolutionHref === POST_AUTH_ROUTES.customerWallet) {
    if (
      !segments.includes('(business)') &&
      !segments.includes('(staff)') &&
      (segments.includes('(customer)') ||
        segments.some((segment) => WEB_CUSTOMER_SHARED_SEGMENTS.has(segment)))
    ) {
      return { action: 'stay' };
    }
    return { action: 'replace', href: POST_AUTH_ROUTES.customerWallet };
  }

  return resolveAuthenticatedRouteGuard(input);
}
