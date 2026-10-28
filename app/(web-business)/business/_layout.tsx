import { useConvexAuth } from 'convex/react';
import { type Href, Redirect, Slot } from 'expo-router';
import { Platform } from 'react-native';
import { BusinessWebShellRoute } from '@/components/business-web/BusinessWebShellRoute';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { NativeCompanionRedirect } from '@/components/navigation/NativeCompanionRedirect';
import { useWebPostAuthResolution } from '@/hooks/useWebPostAuthResolution';
import { WEB_BUSINESS_PROOF_HREF } from '@/lib/auth/postAuthRouting';
import { resolveBusinessSignedOutHref } from '@/lib/auth/webAuthEntry';
import { isWebRoleRoutingEnabled } from '@/lib/auth/webRoleRouting';

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

  if (isWebRoleRoutingEnabled('web')) {
    return <WebBusinessRoleGate />;
  }

  return (
    <BusinessWebShellRoute>
      <Slot />
    </BusinessWebShellRoute>
  );
}

function WebBusinessRoleGate() {
  const resolution = useWebPostAuthResolution();
  if (resolution.status === 'loading') {
    return <FullScreenLoading />;
  }
  if (resolution.status === 'unauthenticated') {
    return <Redirect href={resolveBusinessSignedOutHref('web')} />;
  }
  if (resolution.href !== WEB_BUSINESS_PROOF_HREF) {
    return <Redirect href={resolution.href as Href} />;
  }
  return (
    <BusinessWebShellRoute>
      <Slot />
    </BusinessWebShellRoute>
  );
}
