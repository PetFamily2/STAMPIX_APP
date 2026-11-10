import type { ReactNode } from 'react';
import {
  Platform,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';
import { rtlBaseView, rtlCenterText } from '@/lib/rtl';

type OnboardingChoiceButtonProps = {
  label: string;
  selected: boolean;
  onPress: () => void;
  icon?: ReactNode;
  pressableStyle?: StyleProp<ViewStyle>;
  labelStyle?: StyleProp<TextStyle>;
  labelNumberOfLines?: number;
  labelAdjustsFontSizeToFit?: boolean;
  labelMinimumFontScale?: number;
};

export function OnboardingChoiceButton({
  label,
  selected,
  onPress,
  icon,
  pressableStyle,
  labelStyle,
  labelNumberOfLines,
  labelAdjustsFontSizeToFit = false,
  labelMinimumFontScale = 0.85,
}: OnboardingChoiceButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        pressableStyle,
        pressed
          ? Platform.OS === 'web'
            ? styles.pressedWeb
            : styles.pressed
          : null,
      ]}
    >
      <View
        collapsable={false}
        pointerEvents="none"
        style={[
          styles.option,
          selected ? styles.optionSelected : styles.optionUnselected,
        ]}
      >
        <View style={styles.optionContent}>
          {icon ? <View style={styles.iconContainer}>{icon}</View> : null}
          <Text
            numberOfLines={labelNumberOfLines}
            adjustsFontSizeToFit={labelAdjustsFontSizeToFit}
            minimumFontScale={labelMinimumFontScale}
            style={[
              styles.optionText,
              icon ? styles.optionTextWithIcon : null,
              selected
                ? styles.optionTextSelected
                : styles.optionTextUnselected,
              labelStyle,
            ]}
          >
            {label}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.86,
    transform: [{ scale: 0.99 }],
  },
  pressedWeb: {
    opacity: 0.92,
  },
  option: {
    minHeight: 52,
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderWidth: 1,
    ...(Platform.OS === 'web'
      ? { minHeight: T.control.height, borderRadius: T.radii.md }
      : null),
  },
  optionSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
    ...(Platform.OS === 'web'
      ? {
          backgroundColor: T.colors.primary,
          borderColor: T.colors.primary,
        }
      : null),
  },
  optionUnselected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    ...(Platform.OS === 'web' ? { borderColor: T.colors.borderStrong } : null),
  },
  optionContent: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
    ...rtlBaseView,
  },
  iconContainer: {
    position: 'absolute',
    right: 0,
    top: 0,
    bottom: 0,
    width: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionText: {
    width: '100%',
    fontSize: 16,
    fontWeight: Platform.OS === 'web' ? '600' : '700',
    textAlign: 'center',
    ...rtlCenterText,
  },
  optionTextWithIcon: {
    paddingHorizontal: 28,
  },
  optionTextSelected: {
    color: '#FFFFFF',
  },
  optionTextUnselected: {
    color: '#111827',
  },
});
