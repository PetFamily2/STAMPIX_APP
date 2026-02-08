import { Pressable, StyleSheet, Text, View } from 'react-native';

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
    borderRadius: 999,
    paddingHorizontal: 40,
    paddingVertical: 16,
    alignItems: 'center',
    shadowColor: '#2563eb',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 30,
    elevation: 8,
  },
  buttonInactive: {
    backgroundColor: '#e5e7eb',
    borderRadius: 999,
    paddingHorizontal: 40,
    paddingVertical: 16,
    alignItems: 'center',
  },
  textActive: {
    fontSize: 18,
    fontWeight: '700',
    color: '#ffffff',
  },
  textInactive: {
    fontSize: 18,
    fontWeight: '700',
    color: '#6b7280',
  },
});
