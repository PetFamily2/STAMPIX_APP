import {
  type ActiveBusinessStaffRole,
  getActiveMembershipByBusinessId,
  requiresBusinessOnboardingForRole,
  resolveActiveBusinessShell,
} from '../activeBusinessShell';
import { MVP_FEATURE_FLAGS } from '../billing/productionContract';
import { BUSINESS_ONBOARDING_ROUTES } from '../onboarding/businessOnboardingFlow';
import { isWebRoleRoutingEnabled } from './webRoleRouting';

export const POST_AUTH_ROUTES = {
  nameCapture: '/(auth)/name-capture',
  customerWallet: '/(authenticated)/(customer)/wallet',
  businessDashboard: '/(authenticated)/(business)/dashboard',
  staffScanner: '/(authenticated)/(staff)/scanner',
  merchantOnboarding: BUSINESS_ONBOARDING_ROUTES.entry,
} as const;

export type PostAuthRoute =
  (typeof POST_AUTH_ROUTES)[keyof typeof POST_AUTH_ROUTES];

export const WEB_BUSINESS_PROOF_HREF = '/business' as const;
export const WEB_STAFF_LANDING_HREF = '/staff' as const;

export type PlatformPostAuthResolution =
  | Exclude<PostAuthResolution, { status: 'route' }>
  | {
      status: 'route';
      href:
        | PostAuthRoute
        | typeof WEB_BUSINESS_PROOF_HREF
        | typeof WEB_STAFF_LANDING_HREF;
    };

export type PostAuthResolution =
  | { status: 'loading' }
  | { status: 'unauthenticated' }
  | { status: 'route'; href: PostAuthRoute };

export type AuthGroupRouteKind =
  | 'standard'
  | 'transition'
  | 'customerOnboarding'
  | 'businessOnboarding'
  | 'paywall'
  | 'preview';

export type AuthGroupDisposition =
  | { status: 'render' }
  | { status: 'loading' }
  | { status: 'redirect'; href: PostAuthRoute };

type PostAuthUser = {
  customerOnboardedAt?: number | null;
  businessOnboardedAt?: number | null;
} | null;

type PostAuthBusinessMembership = {
  id: string;
  staffRole: ActiveBusinessStaffRole;
};

type PostAuthSessionContext = {
  activeMode?: 'customer' | 'business' | null;
  activeBusinessId?: string | null;
  businesses?: PostAuthBusinessMembership[] | null;
} | null;

export type ResolvePostAuthRouteInput = {
  isAuthLoading: boolean;
  isAuthenticated: boolean;
  user: PostAuthUser | undefined;
  sessionContext: PostAuthSessionContext | undefined;
  activeBusinessId?: string | null;
  isBusinessOnboardingLoading?: boolean;
  hasInProgressBusinessOnboarding?: boolean;
};

export function resolvePostAuthRoute({
  isAuthLoading,
  isAuthenticated,
  user,
  sessionContext,
  activeBusinessId: resolvedActiveBusinessId,
  isBusinessOnboardingLoading = false,
  hasInProgressBusinessOnboarding = false,
}: ResolvePostAuthRouteInput): PostAuthResolution {
  if (isAuthLoading) {
    return { status: 'loading' };
  }

  if (!isAuthenticated) {
    return { status: 'unauthenticated' };
  }

  if (user === undefined) {
    return { status: 'loading' };
  }

  if (user === null) {
    return { status: 'route', href: POST_AUTH_ROUTES.nameCapture };
  }

  if (sessionContext == null) {
    return { status: 'loading' };
  }

  if (user.customerOnboardedAt == null) {
    return { status: 'route', href: POST_AUTH_ROUTES.nameCapture };
  }

  if (isBusinessOnboardingLoading) {
    return { status: 'loading' };
  }

  if (hasInProgressBusinessOnboarding) {
    return { status: 'route', href: POST_AUTH_ROUTES.merchantOnboarding };
  }

  const activeMode = sessionContext.activeMode ?? 'customer';

  if (activeMode !== 'business') {
    return { status: 'route', href: POST_AUTH_ROUTES.customerWallet };
  }

  const businesses = sessionContext.businesses ?? [];
  const activeBusinessId =
    resolvedActiveBusinessId ?? sessionContext.activeBusinessId ?? null;
  const activeMembership = getActiveMembershipByBusinessId(
    businesses,
    activeBusinessId
  );
  const activeMembershipRole = activeMembership?.staffRole ?? null;
  const activeShell = resolveActiveBusinessShell(businesses, activeBusinessId);
  const businessOnboarded = user.businessOnboardedAt != null;

  if (activeShell === 'none') {
    return { status: 'route', href: POST_AUTH_ROUTES.customerWallet };
  }

  if (
    activeShell === 'business' &&
    requiresBusinessOnboardingForRole(activeMembershipRole, businessOnboarded)
  ) {
    return { status: 'route', href: POST_AUTH_ROUTES.merchantOnboarding };
  }

  if (activeShell === 'business') {
    return { status: 'route', href: POST_AUTH_ROUTES.businessDashboard };
  }

  return { status: 'route', href: POST_AUTH_ROUTES.staffScanner };
}

export function resolveAuthGroupDisposition({
  routeKind,
  postAuthResolution,
  customerOnboarded,
  businessOnboarded,
  isAdditionalBusinessFlow,
}: {
  routeKind: AuthGroupRouteKind;
  postAuthResolution: PostAuthResolution;
  customerOnboarded: boolean;
  businessOnboarded: boolean;
  isAdditionalBusinessFlow: boolean;
}): AuthGroupDisposition {
  if (routeKind === 'paywall' || routeKind === 'preview') {
    return { status: 'render' };
  }

  if (postAuthResolution.status === 'loading') {
    if (routeKind === 'transition') {
      return { status: 'render' };
    }
    return { status: 'loading' };
  }

  if (postAuthResolution.status === 'unauthenticated') {
    return { status: 'render' };
  }

  if (routeKind === 'transition' && !customerOnboarded) {
    return { status: 'render' };
  }

  if (routeKind === 'customerOnboarding' && !customerOnboarded) {
    return { status: 'render' };
  }

  if (
    routeKind === 'businessOnboarding' &&
    customerOnboarded &&
    ((MVP_FEATURE_FLAGS.additionalBusinessCreationEnabled &&
      isAdditionalBusinessFlow) ||
      !businessOnboarded)
  ) {
    return { status: 'render' };
  }

  return { status: 'redirect', href: postAuthResolution.href };
}

export function resolvePlatformPostAuthHref(
  platform: string,
  nativeResolution: PostAuthResolution,
  webRoleRoutingEnabled = isWebRoleRoutingEnabled(platform)
): PlatformPostAuthResolution {
  if (platform !== 'web' || nativeResolution.status !== 'route') {
    return nativeResolution;
  }

  if (!webRoleRoutingEnabled) {
    return { status: 'route', href: WEB_BUSINESS_PROOF_HREF };
  }

  if (nativeResolution.href === POST_AUTH_ROUTES.businessDashboard) {
    return { status: 'route', href: WEB_BUSINESS_PROOF_HREF };
  }
  if (nativeResolution.href === POST_AUTH_ROUTES.staffScanner) {
    return { status: 'route', href: WEB_STAFF_LANDING_HREF };
  }

  return nativeResolution;
}

export function isPostAuthTransitionPending({
  user,
  sessionContext,
}: Pick<ResolvePostAuthRouteInput, 'user' | 'sessionContext'>) {
  return user == null || sessionContext == null;
}
