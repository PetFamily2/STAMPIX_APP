import { Redirect, Slot } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useSessionContext } from '@/contexts/UserContext';
import { rtlRouteContainerStyle } from '@/lib/rtl';

export default function AdminLayout() {
  const sessionContext = useSessionContext();

  if (sessionContext === undefined) {
    return <FullScreenLoading />;
  }

  if (sessionContext?.isAdmin !== true) {
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
  }

  return (
    <View style={styles.rtlRouteGroup}>
      <Slot />
    </View>
  );
}

const styles = StyleSheet.create({
  rtlRouteGroup: {
    ...rtlRouteContainerStyle,
  },
});
