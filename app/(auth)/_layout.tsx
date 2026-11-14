import { useConvexAuth, useQuery } from 'convex/react';
import {
  type Href,
  Redirect,
  Slot,
  useLocalSearchParams,
  usePathname,
  useSegments,
} from 'expo-router';
import { Platform, StyleSheet, View } from 'react-native';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useSessionContext, useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import {
  type AuthGroupRouteKind,
  resolveAuthGroupDisposition,
  resolvePlatformPostAuthHref,
  resolvePostAuthRoute,
} from '@/lib/auth/postAuthRouting';
import { canPaintPublicWelcome } from '@/lib/auth/publicWelcome';
import { isWebRoleRoutingEnabled } from '@/lib/auth/webRoleRouting';
import { isAdditionalBusinessFlow } from '@/lib/onboarding/businessOnboardingFlow';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { rtlRouteContainerStyle } from '@/lib/rtl';

export default function AuthRoutesLayout() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { user, isLoading: isUserLoading } = useUser();
  const sessionContext = useSessionContext();
  const segments = useSegments();
  const pathname = usePathname();
  const { preview, map, flow } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    flow?: string;
  }>();

  const segmentStrings = segments as string[];
  const webRoleRoutingEnabled = isWebRoleRoutingEnabled(Platform.OS);
  const isPreviewMode =
    !webRoleRoutingEnabled && resolvePreviewModeFromParams({ preview, map });
  const isPaywallRoute = segmentStrings.includes('paywall');
  const isOAuthCallbackRoute = segmentStrings.includes('oauth-callback');
  const isOtpTransitionRoute = segmentStrings.includes('onboarding-client-otp');
  const isCustomerOnboardingRoute =
    segmentStrings.includes('name-capture') ||
    segmentStrings.some((segment) => segment.startsWith('onboarding-client-'));
  const isBusinessOnboardingRoute = segmentStrings.some((segment) =>
    segment.startsWith('onboarding-business-')
  );
  const shouldLoadDefaultBusinessOnboarding =
    isAuthenticated &&
    user?.customerOnboardedAt != null &&
    user.businessOnboardedAt == null;
  const defaultBusinessOnboardingDraft = useQuery(
    api.onboarding.getMyBusinessOnboardingDraft,
    shouldLoadDefaultBusinessOnboarding ? { flow: 'default' } : 'skip'
  );

  const routeKind: AuthGroupRouteKind = isPreviewMode
    ? 'preview'
    : isPaywallRoute
      ? 'paywall'
      : isOAuthCallbackRoute || isOtpTransitionRoute
        ? 'transition'
        : isBusinessOnboardingRoute
          ? 'businessOnboarding'
          : isCustomerOnboardingRoute
            ? 'customerOnboarding'
            : 'standard';

  const resolverUser = isUserLoading ? undefined : user;
  const nativePostAuthResolution = resolvePostAuthRoute({
    isAuthLoading,
    isAuthenticated,
    user: resolverUser,
    sessionContext,
    isBusinessOnboardingLoading:
      shouldLoadDefaultBusinessOnboarding &&
      defaultBusinessOnboardingDraft === undefined,
    hasInProgressBusinessOnboarding:
      defaultBusinessOnboardingDraft?.status === 'in_progress',
  });
  const platformPostAuthResolution = resolvePlatformPostAuthHref(
    Platform.OS,
    nativePostAuthResolution
  );
  const disposition = resolveAuthGroupDisposition({
    routeKind,
    postAuthResolution: nativePostAuthResolution,
    customerOnboarded: user?.customerOnboardedAt != null,
    businessOnboarded: user?.businessOnboardedAt != null,
    isAdditionalBusinessFlow: isAdditionalBusinessFlow(flow),
  });

  if (
    Platform.OS === 'web' &&
    !webRoleRoutingEnabled &&
    platformPostAuthResolution.status === 'route' &&
    routeKind !== 'transition' &&
    routeKind !== 'preview'
  ) {
    return <Redirect href={platformPostAuthResolution.href as Href} />;
  }

  if (disposition.status === 'loading') {
    // Welcome contains only public copy. Do not hold its first paint behind a network session lookup.
    if (canPaintPublicWelcome(Platform.OS, pathname))
      return (
        <View style={styles.rtlRouteGroup}>
          <Slot />
        </View>
      );
    return <FullScreenLoading />;
  }

  if (disposition.status === 'redirect') {
    const href =
      Platform.OS === 'web' && platformPostAuthResolution.status === 'route'
        ? platformPostAuthResolution.href
        : disposition.href;
    return <Redirect href={href as Href} />;
  }

  return (
    <View style={styles.rtlRouteGroup}>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  rtlRouteGroup: {
    ...rtlRouteContainerStyle,
  },
});
