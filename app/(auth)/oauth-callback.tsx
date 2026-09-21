import { useConvexAuth, useMutation } from 'convex/react';
import { type Href, useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useSessionContext, useUser } from '@/contexts/UserContext';
import { api } from '@/convex/_generated/api';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import {
  isPostAuthTransitionPending,
  resolvePostAuthRoute,
} from '@/lib/auth/postAuthRouting';

const POST_AUTH_TIMEOUT_MS = 8000;

const TEXT = {
  loading: 'משלימים התחברות',
  failure: 'לא הצלחנו להשלים את ההתחברות. נסו שוב.',
  returnToSignUp: 'חזרה להרשמה',
};

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const { legalSource } = useLocalSearchParams<{
    legalSource?: string | string[];
  }>();
  const acceptCurrentTerms = useMutation(api.users.acceptCurrentTerms);
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { user: currentUser, isLoading: isUserLoading } = useUser();
  const sessionContext = useSessionContext();
  const { activeBusinessId } = useActiveBusiness();
  const [didTimeout, setDidTimeout] = useState(false);
  const normalizedLegalSource = Array.isArray(legalSource)
    ? legalSource[0]
    : legalSource;
  const acceptanceSource =
    normalizedLegalSource === 'signup_google' ||
    normalizedLegalSource === 'signup_apple'
      ? normalizedLegalSource
      : null;
  const [hasRecordedTerms, setHasRecordedTerms] = useState(
    acceptanceSource === null
  );
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasNavigatedRef = useRef(false);
  const acceptanceStartedRef = useRef(false);

  const clearPostAuthTimeout = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const resolverUser = isUserLoading ? undefined : currentUser;
  const isTransitionPending = isPostAuthTransitionPending({
    user: resolverUser,
    sessionContext,
  });
  const resolution = resolvePostAuthRoute({
    isAuthLoading: isLoading,
    isAuthenticated,
    user: resolverUser,
    sessionContext,
    activeBusinessId,
  });
  const isLegalAcceptancePending =
    acceptanceSource !== null && !hasRecordedTerms;

  useEffect(() => {
    if (
      acceptanceStartedRef.current ||
      !isAuthenticated ||
      !currentUser ||
      !acceptanceSource
    ) {
      return;
    }

    acceptanceStartedRef.current = true;
    void acceptCurrentTerms({ source: acceptanceSource })
      .then(() => setHasRecordedTerms(true))
      .catch(() => {
        acceptanceStartedRef.current = false;
        setDidTimeout(true);
      });
  }, [acceptCurrentTerms, acceptanceSource, currentUser, isAuthenticated]);

  useEffect(() => {
    if (
      hasNavigatedRef.current ||
      (!isTransitionPending &&
        !isLegalAcceptancePending &&
        resolution.status === 'route')
    ) {
      return;
    }

    if (!timeoutRef.current) {
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        setDidTimeout(true);
      }, POST_AUTH_TIMEOUT_MS);
    }

    return clearPostAuthTimeout;
  }, [
    clearPostAuthTimeout,
    isLegalAcceptancePending,
    isTransitionPending,
    resolution.status,
  ]);

  useEffect(() => {
    if (
      hasNavigatedRef.current ||
      isTransitionPending ||
      isLegalAcceptancePending ||
      resolution.status !== 'route'
    ) {
      return;
    }

    hasNavigatedRef.current = true;
    clearPostAuthTimeout();
    router.replace(resolution.href as Href);
  }, [
    clearPostAuthTimeout,
    isLegalAcceptancePending,
    isTransitionPending,
    resolution,
    router,
  ]);

  const handleReturnToSignUp = () => {
    if (hasNavigatedRef.current) {
      return;
    }
    hasNavigatedRef.current = true;
    clearPostAuthTimeout();
    router.replace('/(auth)/sign-up');
  };

  const showFailure =
    didTimeout && (resolution.status !== 'route' || isLegalAcceptancePending);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        {showFailure ? null : (
          <ActivityIndicator size="small" color="#2563eb" />
        )}
        <Text style={styles.title}>
          {showFailure ? TEXT.failure : TEXT.loading}
        </Text>
        {showFailure ? (
          <Pressable
            accessibilityRole="button"
            onPress={handleReturnToSignUp}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>{TEXT.returnToSignUp}</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F7F4',
  },
  content: {
    flex: 1,
    width: '100%',
    maxWidth: 480,
    alignSelf: 'center',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingHorizontal: 24,
  },
  title: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1f2937',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  retryButton: {
    marginTop: 8,
    borderRadius: 999,
    backgroundColor: '#2563eb',
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  retryText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
});
