import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useQuery } from 'convex/react';
import { Redirect, Tabs, useLocalSearchParams, useSegments } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { IS_DEV_MODE } from '@/config/appConfig';
import { STAMPAIX_IMAGE_LOGO } from '@/config/branding';
import { api } from '@/convex/_generated/api';
import { resolveActiveBusinessShell } from '@/lib/activeBusinessShell';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';

const TEXT = {
  dashboard: 'מרכז ניהול',
  analytics: 'דוחות',
  scanCustomer: 'סרוק לקוח',
  customers: 'לקוחות',
  marketing: 'שיווק',
  settings: 'הגדרות',
};

const STANDARD_TAB_ICON_SIZE = 26;
const STANDARD_TAB_BUBBLE_WIDTH = 52;
const STANDARD_TAB_BUBBLE_HEIGHT = 34;
const STANDARD_TAB_BUBBLE_RADIUS = STANDARD_TAB_BUBBLE_HEIGHT / 2;
const TAB_BAR_CONTENT_HEIGHT = 56;
const STANDARD_TAB_ACTIVE_BACKGROUND = '#E7F0FF';
const STANDARD_TAB_ACTIVE_COLOR = '#111827';
const STANDARD_TAB_INACTIVE_COLOR = '#9AA4B8';
const DASHBOARD_ROUTE_NAMES = new Set(['dashboard', 'qr']);

function StandardTabIcon({
  name,
  color,
  size = STANDARD_TAB_ICON_SIZE,
}: {
  name: keyof typeof Ionicons.glyphMap;
  color: string;
  size?: number;
}) {
  return <Ionicons name={name} size={size} color={color} />;
}

function StandardTabButton({
  props,
  title,
  icon,
  isActive,
}: {
  props: BottomTabBarButtonProps;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  isActive: boolean;
}) {
  const iconColor = isActive
    ? STANDARD_TAB_ACTIVE_COLOR
    : STANDARD_TAB_INACTIVE_COLOR;

  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel ?? title}
      accessibilityRole={props.accessibilityRole}
      accessibilityState={{ ...props.accessibilityState, selected: isActive }}
      onLongPress={props.onLongPress}
      onPress={props.onPress}
      style={({ pressed }) => [
        props.style,
        styles.standardTabButton,
        pressed ? styles.standardTabButtonPressed : null,
      ]}
      testID={props.testID}
    >
      <View style={styles.standardTabContent}>
        <View style={styles.standardTabIconBubble}>
          {isActive ? (
            <View
              pointerEvents="none"
              style={styles.standardTabIconBubbleFocused}
            />
          ) : null}
          <StandardTabIcon name={icon} color={iconColor} />
        </View>
        <Text
          style={[
            styles.standardTabLabel,
            isActive ? styles.standardTabLabelFocused : null,
          ]}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}

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
    sessionContext?.user.businessOnboardedAt == null
  ) {
    return <Redirect href={BUSINESS_ONBOARDING_ROUTES.role} />;
  }

  const segmentStrings = (
    Array.isArray(segments) ? segments.filter(Boolean) : []
  ) as string[];
  const currentLeafSegment =
    segmentStrings[segmentStrings.length - 1] ?? 'dashboard';
  const isCardsRoute = segmentStrings.includes('cards');
  const isCustomersRoute = segmentStrings.includes('customers');
  const isCustomerCardRoute = segmentStrings.includes('customer');
  const isSettingsSubRoute =
    currentLeafSegment.startsWith('settings-business-');
  const activeTabName = DASHBOARD_ROUTE_NAMES.has(currentLeafSegment)
    ? 'dashboard'
    : isCardsRoute
      ? 'cards'
      : isCustomersRoute || isCustomerCardRoute
        ? 'analytics'
        : isSettingsSubRoute
          ? 'settings'
          : currentLeafSegment;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarHideOnKeyboard: false,
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
        tabBarActiveTintColor: STANDARD_TAB_ACTIVE_COLOR,
        tabBarInactiveTintColor: STANDARD_TAB_INACTIVE_COLOR,
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
        name="cards"
        options={{
          title: TEXT.marketing,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.marketing}
              icon="megaphone-outline"
              isActive={activeTabName === 'cards'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="scanner"
        options={{
          title: TEXT.scanCustomer,
          tabBarButton: (props) => {
            const isActive = activeTabName === 'scanner';

            return (
              <Pressable
                accessibilityLabel={
                  props.accessibilityLabel ?? TEXT.scanCustomer
                }
                accessibilityRole={props.accessibilityRole}
                accessibilityState={{
                  ...props.accessibilityState,
                  selected: isActive,
                }}
                onLongPress={props.onLongPress}
                onPress={props.onPress}
                style={({ pressed }) => [
                  props.style,
                  styles.qrTabButton,
                  (pressed || isActive) && styles.qrTabButtonPressed,
                ]}
                testID={props.testID}
              >
                <View style={styles.qrTabContent}>
                  <View
                    style={[
                      styles.qrTabBubbleShadow,
                      isActive ? styles.qrTabBubbleShadowFocused : null,
                    ]}
                  >
                    <View
                      pointerEvents="none"
                      style={styles.qrTabBubbleDepthOuter}
                    />
                    <View
                      pointerEvents="none"
                      style={styles.qrTabBubbleDepthInner}
                    />
                    <View style={styles.qrTabBubble}>
                      <Image
                        source={STAMPAIX_IMAGE_LOGO}
                        style={styles.qrTabLogo}
                        resizeMode="cover"
                        accessibilityLabel="StampAix logo"
                      />
                    </View>
                  </View>
                  <Text
                    style={[
                      styles.qrTabLabel,
                      isActive ? styles.qrTabLabelFocused : null,
                    ]}
                  >
                    {TEXT.scanCustomer}
                  </Text>
                </View>
              </Pressable>
            );
          },
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: TEXT.analytics,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.analytics}
              icon="bar-chart-outline"
              isActive={activeTabName === 'analytics'}
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
        name="customers"
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

const styles = StyleSheet.create({
  standardTabButton: {
    flex: 1,
    width: '100%',
    height: TAB_BAR_CONTENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  standardTabButtonPressed: {
    opacity: 0.9,
  },
  standardTabContent: {
    width: '100%',
    height: TAB_BAR_CONTENT_HEIGHT,
    minWidth: 64,
    paddingHorizontal: 8,
    paddingTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  standardTabIconBubble: {
    width: STANDARD_TAB_BUBBLE_WIDTH,
    height: STANDARD_TAB_BUBBLE_HEIGHT,
    borderRadius: STANDARD_TAB_BUBBLE_RADIUS,
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  standardTabIconBubbleFocused: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: STANDARD_TAB_BUBBLE_RADIUS,
    backgroundColor: STANDARD_TAB_ACTIVE_BACKGROUND,
    borderWidth: 1,
    borderColor: '#C3D8FF',
  },
  standardTabLabel: {
    marginTop: 3,
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  standardTabLabelFocused: {
    color: '#111827',
  },
  qrTabButton: {
    flex: 1,
    width: '100%',
    height: TAB_BAR_CONTENT_HEIGHT,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrTabButtonPressed: {
    opacity: 0.9,
  },
  qrTabContent: {
    width: '100%',
    height: TAB_BAR_CONTENT_HEIGHT,
    alignItems: 'center',
  },
  qrTabBubbleShadow: {
    marginTop: -56,
    width: 92,
    height: 98,
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'center',
    shadowColor: '#163A87',
    shadowOffset: { width: 0, height: 18 },
    shadowOpacity: 0.24,
    shadowRadius: 22,
    elevation: 18,
  },
  qrTabBubbleShadowFocused: {
    shadowOffset: { width: 0, height: 22 },
    shadowOpacity: 0.3,
    shadowRadius: 26,
    elevation: 22,
  },
  qrTabBubbleDepthOuter: {
    position: 'absolute',
    top: 16,
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: '#204EBD',
    opacity: 0.2,
    transform: [{ scaleX: 0.96 }, { scaleY: 0.92 }],
  },
  qrTabBubbleDepthInner: {
    position: 'absolute',
    top: 9,
    width: 86,
    height: 86,
    borderRadius: 43,
    backgroundColor: '#9DB6FF',
    opacity: 0.28,
    transform: [{ scaleX: 0.98 }, { scaleY: 0.96 }],
  },
  qrTabBubble: {
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D5E3FF',
    shadowColor: '#1B4FD6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  qrTabLogo: {
    width: 84,
    height: 84,
    borderRadius: 42,
  },
  qrTabLabel: {
    marginTop: 3,
    width: '100%',
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
    color: '#5B6475',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  qrTabLabelFocused: {
    color: '#111827',
  },
});
