import { Ionicons } from '@expo/vector-icons';
import { useQuery } from 'convex/react';
import { Redirect, Tabs, useLocalSearchParams } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { IS_DEV_MODE } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';
import { resolveActiveBusinessShell } from '@/lib/activeBusinessShell';

const TEXT = {
  scanner: '\u05e1\u05d5\u05e8\u05e7',
  settings: '\u05d4\u05d2\u05d3\u05e8\u05d5\u05ea',
};

export default function StaffTabsLayout() {
  const insets = useSafeAreaInsets();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';
  const sessionContext = useQuery(api.users.getSessionContext);
  const isLoading = sessionContext === undefined;
  const businesses = sessionContext?.businesses ?? [];
  const activeBusinessId = sessionContext?.activeBusinessId ?? null;
  const activeShell = resolveActiveBusinessShell(businesses, activeBusinessId);

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!sessionContext && !isPreviewMode) {
    return <Redirect href="/(auth)/sign-up" />;
  }

  if (!isPreviewMode && activeShell === 'none') {
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
  }

  if (!isPreviewMode && activeShell === 'business') {
    return <Redirect href="/(authenticated)/(business)/dashboard" />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 0,
          elevation: 8,
          shadowColor: '#2F6BFF',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          height: 60 + (insets.bottom || 0),
          paddingBottom: 8 + (insets.bottom || 0),
          paddingTop: 8,
        },
        tabBarActiveTintColor: '#2F6BFF',
        tabBarInactiveTintColor: '#9AA4B8',
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '600',
        },
      }}
    >
      <Tabs.Screen
        name="scanner"
        options={{
          title: TEXT.scanner,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="qr-code-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: TEXT.settings,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="customer/[customerUserId]"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
