import { useConvexAuth } from 'convex/react';
import {
  Slot,
  useLocalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from 'expo-router';
import { useEffect } from 'react';

import { IS_DEV_MODE } from '@/config/appConfig';

let didRedirectToAuthenticated = false;

export default function AuthRoutesLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
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
  const isAllowedForAuthenticated =
    isPaywallRoute || isPreviewMode || isFlowMapRoute || isOnboardingRoute;
  const alreadyInTarget =
    pathname === AUTH_REDIRECT_TARGET ||
    pathname.startsWith(`${AUTH_REDIRECT_TARGET}/`);
  const shouldRedirectToAuthenticated =
    isAuthenticated && !isAllowedForAuthenticated && !alreadyInTarget;

  useEffect(() => {
    if (
      isLoading ||
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
  }, [isLoading, shouldRedirectToAuthenticated, alreadyInTarget, router]);

  return <Slot />;
}
