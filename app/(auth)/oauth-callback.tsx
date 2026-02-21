import { useConvexAuth, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { useEffect, useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/convex/_generated/api';

const AUTH_FALLBACK_DELAY_MS = 2200;
const CONTINUE_DELAY_MS = 1200;

const TEXT = {
  loading: 'משלימים התחברות...',
  linked: 'מצאנו חשבון קיים, ממשיכים להתחברות.',
  newAccount: 'מכינים חשבון חדש, ממשיכים להתחברות.',
  missingAuth: 'לא זוהתה התחברות פעילה. מחזירים למסך הרשמה.',
  waitingUser: 'מקבלים נתוני משתמש...',
};

function hasCapturedName(user: {
  firstName?: string | null;
  lastName?: string | null;
}) {
  return Boolean(user.firstName?.trim().length && user.lastName?.trim().length);
}

export default function OAuthCallbackScreen() {
  const router = useRouter();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const user = useQuery(
    api.users.getCurrentUser,
    isAuthenticated ? {} : 'skip'
  );

  const statusText = useMemo(() => {
    if (isLoading) {
      return TEXT.loading;
    }

    if (!isAuthenticated) {
      return TEXT.missingAuth;
    }

    if (user === undefined || user === null) {
      return TEXT.waitingUser;
    }

    return user.postAuthOnboardingRequired === true
      ? TEXT.newAccount
      : TEXT.linked;
  }, [isAuthenticated, isLoading, user]);

  useEffect(() => {
    if (isLoading) {
      return;
    }

    if (!isAuthenticated) {
      const unauthTimer = setTimeout(() => {
        router.replace('/(auth)/sign-up');
      }, AUTH_FALLBACK_DELAY_MS);
      return () => clearTimeout(unauthTimer);
    }

    if (user === undefined || user === null) {
      return;
    }

    const timer = setTimeout(() => {
      const needsNameCapture =
        user.postAuthOnboardingRequired === true &&
        (user.needsNameCapture === true || !hasCapturedName(user));

      if (needsNameCapture) {
        router.replace('/(auth)/name-capture');
        return;
      }

      router.replace('/(authenticated)/(customer)/wallet');
    }, CONTINUE_DELAY_MS);

    return () => clearTimeout(timer);
  }, [isAuthenticated, isLoading, router, user]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="small" color="#2563eb" />
        <Text style={styles.title}>{statusText}</Text>
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
});
