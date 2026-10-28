import { type Href, Redirect, Slot } from 'expo-router';
import { Platform } from 'react-native';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { NativeCompanionRedirect } from '@/components/navigation/NativeCompanionRedirect';
import { useWebPostAuthResolution } from '@/hooks/useWebPostAuthResolution';
import { WEB_STAFF_LANDING_HREF } from '@/lib/auth/postAuthRouting';
import { resolveBusinessSignedOutHref } from '@/lib/auth/webAuthEntry';

export default function WebStaffLayout() {
  if (Platform.OS !== 'web') {
    return <NativeCompanionRedirect />;
  }
  return <WebStaffGate />;
}

function WebStaffGate() {
  const resolution = useWebPostAuthResolution();
  if (resolution.status === 'loading') {
    return <FullScreenLoading />;
  }
  if (resolution.status === 'unauthenticated') {
    return <Redirect href={resolveBusinessSignedOutHref('web')} />;
  }
  if (resolution.href !== WEB_STAFF_LANDING_HREF) {
    return <Redirect href={resolution.href as Href} />;
  }
  return <Slot />;
}
