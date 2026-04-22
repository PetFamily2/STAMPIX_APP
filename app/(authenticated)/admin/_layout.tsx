import { Redirect, Slot } from 'expo-router';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useSessionContext } from '@/contexts/UserContext';

export default function AdminLayout() {
  const sessionContext = useSessionContext();

  if (sessionContext === undefined) {
    return <FullScreenLoading />;
  }

  if (sessionContext?.isAdmin !== true) {
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
  }

  return <Slot />;
}
