import { Ionicons } from '@expo/vector-icons';
import { Platform, Pressable, StyleSheet } from 'react-native';

import { BUSINESS_WEB_TOKENS as T } from '@/lib/design/businessWebTokens';

type BackButtonProps = {
  onPress: () => void;
};

export function BackButton({ onPress }: BackButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      accessibilityRole="button"
      accessibilityLabel="חזרה"
      accessibilityHint="חוזר למסך הקודם"
    >
      <Ionicons
        name="arrow-forward"
        size={18}
        color={Platform.OS === 'web' ? T.colors.textPrimary : '#111827'}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    ...(Platform.OS === 'web'
      ? {
          borderRadius: T.radii.md,
          borderWidth: 1,
          borderColor: T.colors.border,
          backgroundColor: T.colors.elevatedSurface,
        }
      : null),
  },
  pressed: {
    backgroundColor: Platform.OS === 'web' ? T.colors.primarySubtle : '#E5E7EB',
  },
});
