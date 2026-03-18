import { useQuery } from 'convex/react';
import { Redirect, Tabs, useLocalSearchParams, useSegments } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  ScannerTabButton,
  StandardTabButton,
  TAB_BAR_CONTENT_HEIGHT,
} from '@/components/BusinessTabBar';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { IS_DEV_MODE } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';
import { resolveActiveBusinessShell } from '@/lib/activeBusinessShell';

const TEXT = {
  scanner: 'סורק',
  customers: 'לקוחות',
  promotions: 'מבצעים',
  settings: 'הגדרות',
};

export default function StaffTabsLayout() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
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

  const segmentStrings = (
    Array.isArray(segments) ? segments.filter(Boolean) : []
  ) as string[];
  const currentLeafSegment = segmentStrings[segmentStrings.length - 1] ?? '';
  const activeTabName =
    currentLeafSegment === 'scanner'
      ? 'scanner'
      : currentLeafSegment === 'customers'
        ? 'customers'
        : currentLeafSegment === 'promotions'
          ? 'promotions'
          : currentLeafSegment === 'settings'
            ? 'settings'
            : segmentStrings.includes('customer')
              ? 'customers'
              : 'scanner';

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
          overflow: 'visible',
          elevation: 8,
          shadowColor: '#2F6BFF',
          shadowOffset: { width: 0, height: -2 },
          shadowOpacity: 0.1,
          shadowRadius: 8,
          height: 72 + (insets.bottom || 0),
          minHeight: 72 + (insets.bottom || 0),
          paddingBottom: 8 + (insets.bottom || 0),
          paddingTop: 8,
        },
        tabBarItemStyle: {
          height: TAB_BAR_CONTENT_HEIGHT,
          overflow: 'visible',
        },
        tabBarActiveTintColor: '#111827',
        tabBarInactiveTintColor: '#9AA4B8',
        tabBarLabelStyle: {
          marginTop: 2,
          fontSize: 12,
          lineHeight: 14,
          fontWeight: '700',
        },
        tabBarIconStyle: {
          marginTop: 2,
        },
      }}
    >
      <Tabs.Screen
        name="settings"
        options={{
          title: TEXT.settings,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.settings}
              icon="settings-outline"
              isActive={activeTabName === 'settings'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="promotions"
        options={{
          title: TEXT.promotions,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.promotions}
              icon="megaphone-outline"
              isActive={activeTabName === 'promotions'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: TEXT.scanner,
          tabBarButton: (props) => (
            <ScannerTabButton
              props={props}
              title={TEXT.scanner}
              isActive={activeTabName === 'scanner'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="customers"
        options={{
          title: TEXT.customers,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.customers}
              icon="people-outline"
              isActive={activeTabName === 'customers'}
            />
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
