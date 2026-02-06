import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { useUser } from '@/contexts/UserContext';
import type { AppRole } from '@/lib/domain/roles';
import { BUSINESS_ROLES, CUSTOMER_ROLE } from '@/lib/hooks/useRoleGuard';

const TEXT = {
  dashboard: '\u05d3\u05e9\u05d1\u05d5\u05e8\u05d3',
  scanner: '\u05e1\u05d5\u05e8\u05e7',
  team: '\u05e6\u05d5\u05d5\u05ea',
  analytics: '\u05d0\u05e0\u05dc\u05d9\u05d8\u05d9\u05e7\u05d4',
  settings: '\u05d4\u05d2\u05d3\u05e8\u05d5\u05ea',
};

export default function BusinessTabsLayout() {
  const insets = useSafeAreaInsets();
  const { user, isLoading } = useUser();

  if (isLoading) {
    return <FullScreenLoading />;
  }

  if (!user) {
    return <Redirect href="/(auth)/sign-in" />;
  }

  const role = (user.role ?? CUSTOMER_ROLE) as AppRole;
  if (!BUSINESS_ROLES.includes(role)) {
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
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
        name="dashboard"
        options={{
          title: TEXT.dashboard,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="stats-chart-outline" size={size} color={color} />
          ),
        }}
      />
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
        name="team"
        options={{
          title: TEXT.team,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="people-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: TEXT.analytics,
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="bar-chart-outline" size={size} color={color} />
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
    </Tabs>
  );
}
