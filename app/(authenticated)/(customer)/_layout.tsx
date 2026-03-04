import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Tabs, useSegments } from 'expo-router';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import stampixLogo from '@/assets/images/STAMPAIX_LOGO_round.png';

const TEXT = {
  wallet: '\u05d0\u05e8\u05e0\u05e7',
  rewards: '\u05d4\u05d8\u05d1\u05d5\u05ea',
  showQr: '\u05d4\u05e6\u05d2 QR',
  discovery: '\u05d2\u05d9\u05dc\u05d5\u05d9',
  settings: '\u05d4\u05d2\u05d3\u05e8\u05d5\u05ea',
};

const STANDARD_TAB_ICON_SIZE = 26;
const STANDARD_TAB_BUBBLE_WIDTH = 52;
const STANDARD_TAB_BUBBLE_HEIGHT = 34;
const STANDARD_TAB_BUBBLE_RADIUS = STANDARD_TAB_BUBBLE_HEIGHT / 2;
const TAB_BAR_CONTENT_HEIGHT = 56;
const DISCOVERY_TAB_ICON_SIZE = 30;
const STANDARD_TAB_ACTIVE_BACKGROUND = '#E7F0FF';
const STANDARD_TAB_ACTIVE_COLOR = '#111827';
const STANDARD_TAB_INACTIVE_COLOR = '#9AA4B8';
const SETTINGS_ROUTE_NAMES = new Set([
  'settings',
  'account-details',
  'help-support',
]);

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
  iconSize = STANDARD_TAB_ICON_SIZE,
  isActive,
}: {
  props: BottomTabBarButtonProps;
  title: string;
  icon: keyof typeof Ionicons.glyphMap;
  iconSize?: number;
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
      <View style={[styles.standardTabContent]}>
        <View style={styles.standardTabIconBubble}>
          {isActive ? (
            <View
              pointerEvents="none"
              style={styles.standardTabIconBubbleFocused}
            />
          ) : null}
          <StandardTabIcon name={icon} color={iconColor} size={iconSize} />
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

export default function CustomerTabsLayout() {
  const insets = useSafeAreaInsets();
  const segments = useSegments();
  const segmentStrings = (
    Array.isArray(segments) ? segments.filter(Boolean) : []
  ) as string[];
  const currentLeafSegment =
    segmentStrings[segmentStrings.length - 1] ?? 'wallet';
  const activeTabName = SETTINGS_ROUTE_NAMES.has(currentLeafSegment)
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
        name="rewards"
        options={{
          title: TEXT.rewards,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.rewards}
              icon="gift-outline"
              isActive={activeTabName === 'rewards'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="show-qr"
        options={{
          title: TEXT.showQr,
          tabBarButton: (props) => {
            const isActive = activeTabName === 'show-qr';

            return (
              <Pressable
                accessibilityLabel={props.accessibilityLabel ?? TEXT.showQr}
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
                      isActive && styles.qrTabBubbleFocused,
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
                      isActive && styles.qrTabLabelFocused,
                    ]}
                  >
                    {'הצג '}
                    <Text
                      style={[
                        styles.qrTabLabelQr,
                        isActive && styles.qrTabLabelFocused,
                      ]}
                    >
                      {'\u200EQR\u200E'}
                    </Text>
                  </Text>
                </View>
              </Pressable>
            );
          },
        }}
      />
      <Tabs.Screen
        name="discovery"
        options={{
          title: TEXT.discovery,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.discovery}
              icon="compass-outline"
              iconSize={DISCOVERY_TAB_ICON_SIZE}
              isActive={activeTabName === 'discovery'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="wallet"
        options={{
          title: TEXT.wallet,
          tabBarButton: (props) => (
            <StandardTabButton
              props={props}
              title={TEXT.wallet}
              icon="wallet-outline"
              isActive={activeTabName === 'wallet'}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="account-details"
        options={{
          href: null,
        }}
      />
      <Tabs.Screen
        name="help-support"
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
  qrTabLabelQr: {
    fontSize: 12,
    lineHeight: 14,
    fontWeight: '700',
  },
  qrTabLabelFocused: {
    color: '#111827',
  },
});
