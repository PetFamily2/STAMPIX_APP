import { useConvexAuth, useQuery } from 'convex/react';
import {
  Slot,
  useLocalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from 'expo-router';
import { useEffect } from 'react';
import { IS_DEV_MODE } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';

let didRedirectToAuthenticated = false;

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

  const AUTH_REDIRECT_TARGET = '/(authenticated)/(customer)/wallet';
  const segmentStrings = segments as string[];
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const isPaywallRoute = segmentStrings.includes('paywall');
  const isFlowMapRoute =
    segmentStrings.includes('flow-map') ||
    pathname === '/flow-map' ||
    pathname.endsWith('/flow-map');
  const isOnboardingRoute =
    segmentStrings.some((segment) => segment.startsWith('onboarding-')) ||
    segmentStrings.includes('name-capture');
  const isOAuthCallbackRoute = segmentStrings.includes('oauth-callback');
  const customerOnboarded = user?.customerOnboardedAt != null;
  const isAllowedForAuthenticated =
    isPaywallRoute ||
    isPreviewMode ||
    isFlowMapRoute ||
    isOnboardingRoute ||
    isOAuthCallbackRoute ||
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
      alreadyInTarget ||
      didRedirectToAuthenticated
    ) {
      return;
    }
    didRedirectToAuthenticated = true;
    setTimeout(() => {
      router.replace(AUTH_REDIRECT_TARGET);
    }, 0);
  }, [isLoading, user, shouldRedirectToAuthenticated, alreadyInTarget, router]);

  return <Slot />;
}
