import { useConvexAuth, useQuery } from 'convex/react';
import { type Href, Redirect, Slot } from 'expo-router';
import { Platform } from 'react-native';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useSessionContext, useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { resolvePostAuthRoute } from '@/lib/auth/postAuthRouting';
import { resolveBusinessSignedOutHref } from '@/lib/auth/webAuthEntry';

export default function WebBusinessRoutesLayout() {
  if (Platform.OS !== 'web') {
    return <NativePostAuthRedirect />;
  }

  return <WebBusinessGate />;
}

function WebBusinessGate() {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!isAuthenticated) {
    return <Redirect href={resolveBusinessSignedOutHref('web')} />;
  }

  return <Slot />;
}

function NativePostAuthRedirect() {
  const { isAuthenticated, isLoading: isAuthLoading } = useConvexAuth();
  const { user, isLoading: isUserLoading } = useUser();
  const sessionContext = useSessionContext();
  const { activeBusinessId } = useActiveBusiness();
  const shouldLoadDefaultBusinessOnboarding =
    isAuthenticated &&
    user?.customerOnboardedAt != null &&
    user.businessOnboardedAt == null;
  const defaultBusinessOnboardingDraft = useQuery(
    api.onboarding.getMyBusinessOnboardingDraft,
    shouldLoadDefaultBusinessOnboarding ? { flow: 'default' } : 'skip'
  );
  const resolution = resolvePostAuthRoute({
    isAuthLoading,
    isAuthenticated,
    user: isUserLoading ? undefined : user,
    sessionContext,
    activeBusinessId,
    isBusinessOnboardingLoading:
      shouldLoadDefaultBusinessOnboarding &&
      defaultBusinessOnboardingDraft === undefined,
    hasInProgressBusinessOnboarding:
      defaultBusinessOnboardingDraft?.status === 'in_progress',
  });

  if (resolution.status !== 'route') {
    if (!isAuthenticated && !isAuthLoading) {
      return <Redirect href={resolveBusinessSignedOutHref(Platform.OS)} />;
    }
    return <FullScreenLoading />;
  }

  return <Redirect href={resolution.href as Href} />;
}
