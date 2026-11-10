import { useConvexAuth } from 'convex/react';
import { Redirect, Slot } from 'expo-router';
import { Platform } from 'react-native';

import { AdminWebShell } from '@/components/admin-web/AdminWebShell';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { NativeCompanionRedirect } from '@/components/navigation/NativeCompanionRedirect';
import { useSessionContext } from '@/contexts/UserContext';
import { resolveBusinessSignedOutHref } from '@/lib/auth/webAuthEntry';

export default function WebAdminLayout() {
  if (Platform.OS !== 'web') {
    return <NativeCompanionRedirect />;
  }

  return <WebAdminGate />;
}

function WebAdminGate() {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const sessionContext = useSessionContext();

  if (isLoading || (isAuthenticated && sessionContext === undefined)) {
    return <FullScreenLoading />;
  }

  if (!isAuthenticated) {
    return <Redirect href={resolveBusinessSignedOutHref('web')} />;
  }

  if (sessionContext?.isAdmin !== true) {
    return <Redirect href="/business" />;
  }

  return (
    <AdminWebShell>
      <Slot />
    </AdminWebShell>
  );
}
