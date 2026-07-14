import { useConvexAuth, useQuery } from 'convex/react';
import {
  Slot,
  useLocalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from 'expo-router';
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import { IS_DEV_MODE } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';
import { rtlRouteContainerStyle } from '@/lib/rtl';

export default function AuthRoutesLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : 'skip'
  );
  const segments = useSegments();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const pathname = usePathname();
  const router = useRouter();
  const didRedirectToAuthenticatedRef = useRef(false);
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const AUTH_REDIRECT_TARGET = '/(authenticated)/(customer)/wallet';
  const segmentStrings = segments as string[];
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const isPaywallRoute = segmentStrings.includes('paywall');
  const isOnboardingRoute =
    segmentStrings.some((segment) => segment.startsWith('onboarding-')) ||
    segmentStrings.includes('name-capture');
  const isOAuthCallbackRoute = segmentStrings.includes('oauth-callback');
  const isOtpTransitionRoute = segmentStrings.includes('onboarding-client-otp');
  const isAuthTransitionRoute = isOAuthCallbackRoute || isOtpTransitionRoute;
  const customerOnboarded = user?.customerOnboardedAt != null;
  const isAllowedForAuthenticated =
    isPaywallRoute ||
    isPreviewMode ||
    isOnboardingRoute ||
    isAuthTransitionRoute ||
    !customerOnboarded;
  const alreadyInTarget =
    pathname === AUTH_REDIRECT_TARGET ||
    pathname.startsWith(`${AUTH_REDIRECT_TARGET}/`);
  const shouldRedirectToAuthenticated =
    isAuthenticated &&
    customerOnboarded &&
    !isAllowedForAuthenticated &&
    !alreadyInTarget;

  useEffect(() => {
    if (
      isLoading ||
      user === undefined ||
      !shouldRedirectToAuthenticated ||
      isAuthTransitionRoute ||
      alreadyInTarget ||
      didRedirectToAuthenticatedRef.current
    ) {
      return;
    }
    didRedirectToAuthenticatedRef.current = true;
    redirectTimerRef.current = setTimeout(() => {
      redirectTimerRef.current = null;
      router.replace(AUTH_REDIRECT_TARGET);
    }, 0);

    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
        redirectTimerRef.current = null;
        didRedirectToAuthenticatedRef.current = false;
      }
    };
  }, [
    isAuthTransitionRoute,
    isLoading,
    user,
    shouldRedirectToAuthenticated,
    alreadyInTarget,
    router,
  ]);

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
