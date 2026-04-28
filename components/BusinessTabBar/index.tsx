import { Ionicons } from '@expo/vector-icons';
import type { BottomTabBarButtonProps } from '@react-navigation/bottom-tabs';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { STAMPAIX_IMAGE_LOGO } from '@/config/branding';

const STANDARD_TAB_ICON_SIZE = 24;
const STANDARD_TAB_BUBBLE_WIDTH = 46;
const STANDARD_TAB_BUBBLE_HEIGHT = 30;
const STANDARD_TAB_BUBBLE_RADIUS = STANDARD_TAB_BUBBLE_HEIGHT / 2;
export const TAB_BAR_CONTENT_HEIGHT = 56;
const STANDARD_TAB_ACTIVE_BACKGROUND = '#F1EEFF';
const STANDARD_TAB_ACTIVE_COLOR = '#4F46E5';
const STANDARD_TAB_INACTIVE_COLOR = '#9AA4B8';

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

export function StandardTabButton({
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

export function ScannerTabButton({
  props,
  title,
  isActive,
}: {
  props: BottomTabBarButtonProps;
  title: string;
  isActive: boolean;
}) {
  return (
    <Pressable
      accessibilityLabel={props.accessibilityLabel ?? title}
      accessibilityRole={props.accessibilityRole}
      accessibilityState={{ ...props.accessibilityState, selected: isActive }}
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
          <View pointerEvents="none" style={styles.qrTabBubbleDepthOuter} />
          <View pointerEvents="none" style={styles.qrTabBubbleDepthInner} />
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
          {title}
        </Text>
      </View>
    </Pressable>
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
    borderColor: '#C8DAFF',
  },
  standardTabLabel: {
    marginTop: 4,
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
    marginTop: -42,
    width: 78,
    height: 84,
    alignItems: 'center',
    justifyContent: 'flex-start',
    alignSelf: 'center',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.16,
    shadowRadius: 14,
    elevation: 12,
  },
  qrTabBubbleShadowFocused: {
    shadowOffset: { width: 0, height: 16 },
    shadowOpacity: 0.18,
    shadowRadius: 16,
    elevation: 14,
  },
  qrTabBubbleDepthOuter: {
    position: 'absolute',
    top: 12,
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#4F46E5',
    opacity: 0.16,
    transform: [{ scaleX: 0.96 }, { scaleY: 0.92 }],
  },
  qrTabBubbleDepthInner: {
    position: 'absolute',
    top: 6,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: '#C7D2FE',
    opacity: 0.26,
    transform: [{ scaleX: 0.98 }, { scaleY: 0.96 }],
  },
  qrTabBubble: {
    width: 70,
    height: 70,
    borderRadius: 35,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D9DDF4',
    shadowColor: '#4F46E5',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.14,
    shadowRadius: 10,
    elevation: 6,
  },
  qrTabLogo: {
    width: 70,
    height: 70,
    borderRadius: 35,
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
