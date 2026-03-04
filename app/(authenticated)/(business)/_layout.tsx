import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { useQuery } from 'convex/react';
import { Redirect, Tabs, useLocalSearchParams, useSegments } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import stampixLogo from '@/assets/images/STAMPAIX_LOGO_round.png';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { IS_DEV_MODE } from '@/config/appConfig';
import { api } from '@/convex/_generated/api';
import { BUSINESS_ONBOARDING_ROUTES } from '@/lib/onboarding/businessOnboardingFlow';

const TEXT = {
  dashboard: 'מרכז ניהול',
  analytics: 'דוחות',
  scanCustomer: 'סרוק לקוח',
  customerManagement: 'ניהול כרטיסיות',
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
  const hasOwnerOrManager = bizList.some(
    (business) =>
      business.staffRole === 'owner' || business.staffRole === 'manager'
  );
  const hasAnyBizAccess = bizList.length > 0;

  if (!isPreviewMode && !hasOwnerOrManager) {
    if (hasAnyBizAccess) {
      return <Redirect href="/(authenticated)/(staff)/scanner" />;
    }
    return <Redirect href={BUSINESS_ONBOARDING_ROUTES.role} />;
  }

  const segmentStrings = (
    Array.isArray(segments) ? segments.filter(Boolean) : []
  ) as string[];
  const currentLeafSegment =
    segmentStrings[segmentStrings.length - 1] ?? 'dashboard';
  const activeTabName = DASHBOARD_ROUTE_NAMES.has(currentLeafSegment)
    ? 'dashboard'
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
        name="team"
        options={{
          title: TEXT.customerManagement,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.customerManagement}
              icon="people-outline"
              isActive={activeTabName === 'team'}
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
                      styles.qrTabBubble,
                      isActive ? styles.qrTabBubbleFocused : null,
                    ]}
                  >
                    <Image
                      source={stampixLogo}
                      style={styles.qrTabLogo}
                      resizeMode="cover"
                      accessibilityLabel="Stampix logo"
                    />
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
        name="cards"
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
  qrTabBubble: {
    marginTop: -50,
    width: 84,
    height: 84,
    borderRadius: 42,
    alignItems: 'center',
    justifyContent: 'center',
    alignSelf: 'center',
    overflow: 'hidden',
    shadowColor: '#111111',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 14,
    elevation: 10,
  },
  qrTabBubbleFocused: {
    shadowOpacity: 0.26,
    shadowRadius: 16,
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
