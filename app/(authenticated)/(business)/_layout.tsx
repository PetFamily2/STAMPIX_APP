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
import {
  getActiveMembershipByBusinessId,
  requiresBusinessOnboardingForRole,
  resolveActiveBusinessShell,
} from '@/lib/activeBusinessShell';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';

const TEXT = {
  dashboard: 'מרכז ניהול',
  customers: 'לקוחות',
  programs: 'תוכניות',
  campaigns: 'קמפיינים',
  scanCustomer: 'סרוק לקוח',
  settings: 'הגדרות',
};

export default function BusinessTabsLayout() {
  const insets = useSafeAreaInsets();
  const sessionContext = useQuery(api.users.getSessionContext);
  const segments = useSegments();
  const { preview, map } = useLocalSearchParams<{
    preview?: string;
    map?: string;
  }>();
  const isPreviewMode = (IS_DEV_MODE && preview === 'true') || map === 'true';

  if (sessionContext === undefined) {
    return <FullScreenLoading />;
  }

  if (!sessionContext && !isPreviewMode) {
    return <Redirect href="/(auth)/sign-up" />;
  }

  if (!isPreviewMode && sessionContext?.user.customerOnboardedAt == null) {
    return <Redirect href="/(auth)/name-capture" />;
  }

  const bizList = sessionContext?.businesses ?? [];
  const activeBusinessId = sessionContext?.activeBusinessId ?? null;
  const activeMembership = getActiveMembershipByBusinessId(
    bizList,
    activeBusinessId
  );
  const activeMembershipRole = activeMembership?.staffRole ?? null;
  const activeShell = resolveActiveBusinessShell(bizList, activeBusinessId);

  if (!isPreviewMode && activeShell === 'none') {
    return <Redirect href="/(authenticated)/(customer)/wallet" />;
  }

  if (!isPreviewMode && activeShell === 'staff') {
    return <Redirect href="/(authenticated)/(staff)/scanner" />;
  }

  if (
    !isPreviewMode &&
    activeShell === 'business' &&
    requiresBusinessOnboardingForRole(
      activeMembershipRole,
      sessionContext?.user.businessOnboardedAt != null
    )
  ) {
    return <Redirect href={BUSINESS_ONBOARDING_ROUTES.entry} />;
  }

  const segmentStrings = (
    Array.isArray(segments) ? segments.filter(Boolean) : []
  ) as string[];
  const currentLeafSegment =
    segmentStrings[segmentStrings.length - 1] ?? 'dashboard';
  const isProgramsRoute =
    currentLeafSegment === 'programs' ||
    (segmentStrings.includes('cards') &&
      !segmentStrings.includes('campaign') &&
      !segmentStrings.includes('campaigns'));
  const isCampaignsRoute =
    currentLeafSegment === 'campaigns' ||
    segmentStrings.includes('campaigns') ||
    segmentStrings.includes('campaign');
  const isCustomersRoute =
    currentLeafSegment === 'customers' ||
    currentLeafSegment === 'analytics' ||
    segmentStrings.includes('customers') ||
    segmentStrings.includes('customer');
  const isSettingsRoute =
    currentLeafSegment === 'settings' ||
    currentLeafSegment === 'qr' ||
    currentLeafSegment === 'team' ||
    segmentStrings.includes('team') ||
    currentLeafSegment.startsWith('settings-business-');

  const activeTabName =
    currentLeafSegment === 'dashboard'
      ? 'dashboard'
      : isCustomersRoute
        ? 'customers'
        : isProgramsRoute
          ? 'programs'
          : isCampaignsRoute
            ? 'campaigns'
            : isSettingsRoute
              ? 'settings'
              : currentLeafSegment;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: false,
        tabBarStyle: {
          backgroundColor: '#FFFFFF',
          borderTopWidth: 1,
          borderTopColor: '#E6EAF3',
          overflow: 'visible',
          elevation: 12,
          shadowColor: '#0F172A',
          shadowOffset: { width: 0, height: -8 },
          shadowOpacity: 0.08,
          shadowRadius: 18,
          height: 72 + (insets.bottom || 0),
          minHeight: 72 + (insets.bottom || 0),
          paddingBottom: 8 + (insets.bottom || 0),
          paddingTop: 8,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
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
        name="programs"
        options={{
          title: TEXT.programs,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.programs}
              icon="albums-outline"
              isActive={activeTabName === 'programs'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="campaigns"
        options={{
          title: TEXT.campaigns,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.campaigns}
              icon="megaphone-outline"
              isActive={activeTabName === 'campaigns'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: TEXT.scanCustomer,
          tabBarButton: (props) => (
            <ScannerTabButton
              props={props}
              title={TEXT.scanCustomer}
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
        name="dashboard"
        options={{
          title: TEXT.dashboard,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.dashboard}
              icon="grid-outline"
              isActive={activeTabName === 'dashboard'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="cards"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="qr"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="team"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="team/index"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="team/add"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="customer/[customerUserId]"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings-business-profile"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings-business-account"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings-business-subscription"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="settings-business-address"
        options={{
          href: null,
        }}
      />
    </Tabs>
  );
}
