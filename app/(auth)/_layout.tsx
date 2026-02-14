import { useConvexAuth } from 'convex/react';
import {
  Slot,
  useLocalSearchParams,
  usePathname,
  useRouter,
  useSegments,
} from 'expo-router';
import { useEffect, useRef } from 'react';

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
  const redirectTriggeredRef = useRef(false);

  const AUTH_REDIRECT_TARGET = '/(authenticated)/(customer)/wallet';
  const segmentStrings = segments as string[];
  const segmentsKey = segmentStrings.join('/');
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const isPaywallRoute = segmentStrings.includes('paywall');
  const isFlowMapRoute =
    segmentStrings.includes('flow-map') ||
    pathname === '/flow-map' ||
    pathname.endsWith('/flow-map');
  const isAllowedForAuthenticated =
    isPaywallRoute || isPreviewMode || isFlowMapRoute;
  const alreadyInTarget =
    pathname === AUTH_REDIRECT_TARGET ||
    pathname.startsWith(`${AUTH_REDIRECT_TARGET}/`);
  const shouldRedirectToAuthenticated =
    isAuthenticated && !isAllowedForAuthenticated && !alreadyInTarget;

  useEffect(() => {
    console.log('[AUTH]', {
      isAuthenticated,
      isLoading,
      pathname,
      segmentsKey,
      preview,
    });
  }, [isAuthenticated, isLoading, pathname, segmentsKey, preview]);

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
    console.log('[AUTH] attempting replace ->', AUTH_REDIRECT_TARGET, {
      pathname,
      segmentsKey,
    });
    console.log('[AUTH] redirect ->', AUTH_REDIRECT_TARGET, {
      pathname,
      segmentsKey,
      preview,
    });
    redirectTriggeredRef.current = true;
    setTimeout(() => {
      router.replace(AUTH_REDIRECT_TARGET);
      console.log('[AUTH] post-redirect tick', {
        pathnameNow: pathname,
        segmentsKeyNow: segmentsKey,
      });
    }, 0);
  }, [
    isLoading,
    shouldRedirectToAuthenticated,
    alreadyInTarget,
    router,
    pathname,
    segmentsKey,
    preview,
  ]);

  return <Slot />;
}
