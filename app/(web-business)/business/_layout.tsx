import { useConvexAuth } from 'convex/react';
import { Redirect, Slot } from 'expo-router';
import { Platform } from 'react-native';
import { BusinessWebShellRoute } from '@/components/business-web/BusinessWebShellRoute';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { NativeCompanionRedirect } from '@/components/navigation/NativeCompanionRedirect';
import { resolveBusinessSignedOutHref } from '@/lib/auth/webAuthEntry';

export default function WebBusinessRoutesLayout() {
  if (Platform.OS !== 'web') {
    return <NativeCompanionRedirect />;
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

  return (
    <BusinessWebShellRoute>
      <Slot />
    </BusinessWebShellRoute>
  );
}
