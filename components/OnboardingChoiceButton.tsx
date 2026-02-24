import type { ReactNode } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

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
      style={pressableStyle}
    >
      <View
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
  option: {
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  optionSelected: {
    backgroundColor: '#2563EB',
    borderColor: '#2563EB',
    shadowColor: '#93C5FD',
  },
  optionUnselected: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E5E7EB',
    shadowColor: '#9CA3AF',
  },
  optionContent: {
    position: 'relative',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontWeight: '900',
    textAlign: 'center',
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
