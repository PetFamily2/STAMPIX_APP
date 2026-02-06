import { useConvexAuth, useMutation, useQuery } from 'convex/react';
import { Stack, useRouter, useSegments } from 'expo-router';
import React, { useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useAppMode } from '@/contexts/AppModeContext';
import { api } from '@/convex/_generated/api';

export default function AuthenticatedLayout() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const { appMode, isLoading: isAppModeLoading, hasSelectedMode } =
    useAppMode();
  const user = useQuery(api.users.getCurrentUser);
  const createOrUpdateUser = useMutation(api.auth.createOrUpdateUser);
  const router = useRouter();
  const segments = useSegments();

  const ran = useRef(false);
  const lastRedirectRef = useRef<string | null>(null);
  const [bootError, setBootError] = useState<string | null>(null);
  const [booting, setBooting] = useState(false);

  useEffect(() => {
    if (!isAuthenticated) return;
    if (isLoading) return;

    if (user && !bootError) return;

    if (user === null && !ran.current) {
      ran.current = true;
      setBooting(true);
      setBootError(null);

      const run = async () => {
        try {
          await Promise.race([
            createOrUpdateUser({}),
            new Promise((_, rej) =>
              setTimeout(() => rej(new Error('bootstrap timeout')), 5000)
            ),
          ]);
          setBootError(null);
        } catch (e: any) {
          setBootError(e?.message ?? String(e));
          ran.current = false;
        } finally {
          setBooting(false);
        }
      };

      run();
    }
  }, [isAuthenticated, isLoading, user, bootError, createOrUpdateUser]);

  useEffect(() => {
    if (isAppModeLoading || isLoading || booting || bootError) return;

    const currentSegments = (
      Array.isArray(segments) ? segments.filter(Boolean) : []
    ) as string[];
    if (currentSegments.includes('join') || currentSegments.includes('card'))
      return;
    const inRoleScreen = currentSegments.includes('role');

    if (!hasSelectedMode) {
      const roleTarget = '/(authenticated)/role';
      if (!inRoleScreen && lastRedirectRef.current !== roleTarget) {
        lastRedirectRef.current = roleTarget;
        router.replace(roleTarget);
      }
      return;
    }

    const currentPath = `/${currentSegments.join('/')}`;
    const target =
      appMode === 'customer'
        ? '/(authenticated)/(customer)/wallet'
        : '/(authenticated)/(business)/business/dashboard';

    if (currentPath === target) return;
    if (lastRedirectRef.current === target) return;

    const inCustomerGroup = currentSegments.includes('(customer)');
    const inBusinessGroup = currentSegments.includes('(business)');

    if (!inCustomerGroup && !inBusinessGroup) {
      lastRedirectRef.current = target;
      router.replace(target);
      return;
    }

    if (appMode === 'customer' && inBusinessGroup) {
      const customerTarget = '/(authenticated)/(customer)/wallet';
      if (lastRedirectRef.current === customerTarget) return;
      lastRedirectRef.current = customerTarget;
      router.replace(customerTarget);
      return;
    }

    if (appMode === 'business' && inCustomerGroup) {
      const businessTarget = '/(authenticated)/(business)/business/dashboard';
      if (lastRedirectRef.current === businessTarget) return;
      lastRedirectRef.current = businessTarget;
      router.replace(businessTarget);
    }
  }, [
    appMode,
    bootError,
    booting,
    hasSelectedMode,
    isAppModeLoading,
    isLoading,
    router,
    segments,
  ]);

  if (
    isLoading ||
    booting ||
    isAppModeLoading ||
    (isAuthenticated && user === undefined)
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
        <Text style={{ fontWeight: '800', color: '#1A2B4A' }}>????...</Text>
      </View>
    );
  }

  if (bootError) {
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
          ????? ?????? ?????
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
          <Text style={{ color: '#FFFFFF', fontWeight: '900' }}>Retry</Text>
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
