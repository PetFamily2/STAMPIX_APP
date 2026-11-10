import { useConvexAuth, useQuery } from 'convex/react';
import { useSessionContext, useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  resolvePlatformPostAuthHref,
  resolvePostAuthRoute,
} from '@/lib/auth/postAuthRouting';

/** Used only by Web route gates. All queries already exist on the backend. */
export function useWebPostAuthResolution() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { user, isLoading: isUserLoading } = useUser();
  const sessionContext = useSessionContext();
  const { activeBusinessId } = useActiveBusiness();
  const shouldLoadDraft =
    isAuthenticated &&
    user?.customerOnboardedAt != null &&
    user.businessOnboardedAt == null;
  const draft = useQuery(
    api.onboarding.getMyBusinessOnboardingDraft,
    shouldLoadDraft ? { flow: 'default' } : 'skip'
  );

  return resolvePlatformPostAuthHref(
    'web',
    resolvePostAuthRoute({
      isAuthLoading: isLoading,
      isAuthenticated,
      user: isUserLoading ? undefined : user,
      sessionContext,
      activeBusinessId,
      isBusinessOnboardingLoading: shouldLoadDraft && draft === undefined,
      hasInProgressBusinessOnboarding: draft?.status === 'in_progress',
    })
  );
}
