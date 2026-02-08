import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import {
  type Href,
  Redirect,
  Stack,
  useLocalSearchParams,
  useRouter,
  useSegments,
} from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';

import { IS_DEV_MODE } from '@/config/appConfig';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';
import { savePendingJoin } from '@/lib/deeplink/pendingJoin';

const TEXT = {
  loading: '\u05d8\u05d5\u05e2\u05df...',
  bootErrorTitle:
    '\u05d0\u05d9\u05e8\u05e2\u05d4 \u05ea\u05e7\u05dc\u05d4 \u05d1\u05d8\u05e2\u05d9\u05e0\u05ea \u05d4\u05de\u05e9\u05ea\u05de\u05e9',
  retry: '\u05e0\u05e1\u05d4 \u05e9\u05d5\u05d1',
};

export default function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { preview, biz, src, camp } = useLocalSearchParams<{
    preview?: string;
    biz?: string;
    src?: string;
    camp?: string;
  }>();
  const isPreviewMode = IS_DEV_MODE && preview === 'true';
  const {
    appMode,
    isLoading: isAppModeLoading,
    hasSelectedMode,
  } = useAppMode();

  const shouldLoadUser = isAuthenticated || isPreviewMode;
  const user = useQuery(api.users.getCurrentUser, shouldLoadUser ? {} : 'skip');
  const createOrUpdateUser = useMutation(api.auth.createOrUpdateUser);
  const router = useRouter();
  const segments = useSegments();

  const ran = useRef(false);
  const lastRedirectRef = useRef<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);
  const pendingJoinSaved = useRef(false);

  useEffect(() => {
    if (isPreviewMode) {
      return;
    }

    if (!isAuthenticated || isLoading) {
      return;
    }

    if (user && !bootError) {
      return;
    }

    if (user === null && !ran.current) {
      ran.current = true;
      setBooting(true);
      setBootError(null);

      const run = async () => {
        try {
          await Promise.race([
            createOrUpdateUser({}),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error('bootstrap timeout')), 5000)
            ),
          ]);
          setBootError(null);
        } catch (error: unknown) {
          setBootError(error instanceof Error ? error.message : String(error));
          ran.current = false;
        } finally {
          setBooting(false);
        }
      };

      run();
    }
  }, [
    bootError,
    createOrUpdateUser,
    isAuthenticated,
    isLoading,
    isPreviewMode,
    user,
  ]);

  useEffect(() => {
    if (isPreviewMode) {
      return;
    }

    if (
      !isAuthenticated ||
      isAppModeLoading ||
      isLoading ||
      booting ||
      bootError
    ) {
      return;
    }

    const currentSegments = (
      Array.isArray(segments) ? segments.filter(Boolean) : []
    ) as string[];
    const currentKey = `/${currentSegments.join('/')}`;

    const inRoleScreen = currentSegments.includes('role');
    const inCard = currentSegments.includes('card');
    const inMerchant = currentSegments.includes('merchant');
    const inAdmin = currentSegments.includes('admin');
    const inJoin = currentSegments.includes('join');
    const inCustomerGroup = currentSegments.includes('(customer)');
    const inBusinessGroup = currentSegments.includes('(business)');

    const isFreeRoute = inCard || inMerchant || inAdmin || inJoin;

    const safeReplace = (href: string) => {
      const key = `${currentKey}=>${href}`;
      if (lastRedirectRef.current === key) {
        return;
      }
      lastRedirectRef.current = key;
      router.replace(href as Href);
    };

    if (!hasSelectedMode) {
      if (!inRoleScreen) {
        safeReplace('/(authenticated)/role');
      }
      return;
    }

    const customerTarget = '/(authenticated)/(customer)/wallet';
    const businessTarget = '/(authenticated)/(business)/dashboard';

    if (appMode === 'customer' && inBusinessGroup) {
      safeReplace(customerTarget);
      return;
    }

    if (appMode === 'business' && inCustomerGroup) {
      safeReplace(businessTarget);
      return;
    }

    if (!inCustomerGroup && !inBusinessGroup && !inRoleScreen && !isFreeRoute) {
      if (appMode === 'customer') {
        safeReplace(customerTarget);
      } else {
        safeReplace(businessTarget);
      }
    }
  }, [
    appMode,
    bootError,
    booting,
    hasSelectedMode,
    isAppModeLoading,
    isAuthenticated,
    isLoading,
    router,
    segments,
    isPreviewMode,
  ]);

  // Save deep link join params before auth redirect so we can complete the
  // join after sign-in / sign-up.
  useEffect(() => {
    if (!isAuthenticated && !isPreviewMode && biz && !pendingJoinSaved.current) {
      pendingJoinSaved.current = true;
      void savePendingJoin({ biz, src, camp });
    }
  }, [isAuthenticated, isPreviewMode, biz, src, camp]);

  if (
    isLoading ||
    booting ||
    (!isPreviewMode && isAppModeLoading) ||
    (shouldLoadUser && user === undefined)
  ) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#E9F0FF',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Text style={{ fontWeight: '800', color: '#1A2B4A' }}>
          {TEXT.loading}
        </Text>
      </View>
    );
  }

  if (!isAuthenticated && !isPreviewMode) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  if (bootError && !isPreviewMode) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#E9F0FF',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20,
        }}
      >
        <Text
          style={{ fontWeight: '900', color: '#D92D20', textAlign: 'center' }}
        >
          {TEXT.bootErrorTitle}
        </Text>
        <Text style={{ marginTop: 8, color: '#5B6475', textAlign: 'center' }}>
          {bootError}
        </Text>
        <Pressable
          onPress={() => {
            setBootError(null);
            ran.current = false;
          }}
          style={({ pressed }) => ({
            marginTop: 14,
            backgroundColor: '#2F6BFF',
            borderRadius: 16,
            paddingVertical: 12,
            paddingHorizontal: 18,
            opacity: pressed ? 0.9 : 1,
          })}
        >
          <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>
            {TEXT.retry}
          </Text>
        </Pressable>
      </View>
    );
  }

  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="(customer)" />
      <Stack.Screen name="(business)" />
      <Stack.Screen name="role" />
      <Stack.Screen name="join" />
      <Stack.Screen name="card/index" />
      <Stack.Screen name="card/[membershipId]" />
    </Stack>
  );
}
