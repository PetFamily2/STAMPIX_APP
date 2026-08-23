import { useConvexAuth, useQuery } from 'convex/react';
import { Redirect, Slot, useLocalSearchParams, useSegments } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { api } from '@/convex/_generated/api';
import { useSessionContext, useUser } from '@/contexts/UserContext';
import {
  type AuthGroupRouteKind,
  resolveAuthGroupDisposition,
  resolvePostAuthRoute,
} from '@/lib/auth/postAuthRouting';
import { isAdditionalBusinessFlow } from '@/lib/onboarding/businessOnboardingFlow';
import { resolvePreviewModeFromParams } from '@/lib/previewMode';
import { rtlRouteContainerStyle } from '@/lib/rtl';

export default function AuthRoutesLayout() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { user, isLoading: isUserLoading } = useUser();
  const sessionContext = useSessionContext();
  const segments = useSegments();
  const { preview, map, flow } = useLocalSearchParams<{
    preview?: string;
    map?: string;
    flow?: string;
  }>();

  const segmentStrings = segments as string[];
  const isPreviewMode = resolvePreviewModeFromParams({ preview, map });
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
  const postAuthResolution = resolvePostAuthRoute({
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
  const disposition = resolveAuthGroupDisposition({
    routeKind,
    postAuthResolution,
    customerOnboarded: user?.customerOnboardedAt != null,
    businessOnboarded: user?.businessOnboardedAt != null,
    isAdditionalBusinessFlow: isAdditionalBusinessFlow(flow),
  });

  if (disposition.status === 'loading') {
    return <FullScreenLoading />;
  }

  if (disposition.status === 'redirect') {
    return <Redirect href={disposition.href} />;
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
