import { Pressable, StyleSheet, Text, View } from 'react-native';

import { rtlBaseView, rtlCenterText } from '@/lib/rtl';

type ContinueButtonProps = {
  onPress: () => void;
  disabled?: boolean;
  label?: string;
  accessibilityLabel?: string;
};

export function ContinueButton({
  onPress,
  disabled = false,
  label = 'המשך',
  accessibilityLabel,
}: ContinueButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={accessibilityLabel ?? label}
    >
      <View style={disabled ? styles.buttonInactive : styles.buttonActive}>
        <Text style={disabled ? styles.textInactive : styles.textActive}>
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  buttonActive: {
    backgroundColor: '#2563eb',
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    ...rtlBaseView,
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.16,
    shadowRadius: 10,
    elevation: 3,
  },
  buttonInactive: {
    backgroundColor: '#e5e7eb',
    minHeight: 52,
    borderRadius: 16,
    paddingHorizontal: 24,
    paddingVertical: 14,
    alignItems: 'center',
    ...rtlBaseView,
  },
  textActive: {
    fontSize: 16,
    fontWeight: '700',
    color: '#ffffff',
    textAlign: 'center',
    ...rtlCenterText,
  },
  textInactive: {
    fontSize: 16,
    fontWeight: '700',
    color: '#6b7280',
    textAlign: 'center',
    ...rtlCenterText,
  },
});
