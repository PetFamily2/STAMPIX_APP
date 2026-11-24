import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection } from '@/lib/rtl';

export type PwaButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';

type PwaButtonProps = {
  label: string;
  onPress: () => void;
  variant?: PwaButtonVariant;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function PwaButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  style,
}: PwaButtonProps) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityRole="button"
      accessibilityState={{ busy: loading, disabled: isDisabled }}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        variant === 'primary' ? styles.primary : null,
        variant === 'secondary' ? styles.secondary : null,
        variant === 'quiet' ? styles.quiet : null,
        variant === 'danger' ? styles.danger : null,
        fullWidth ? styles.fullWidth : null,
        isDisabled ? styles.disabled : null,
        pressed && !isDisabled ? styles.pressed : null,
        style,
      ]}
    >
      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator
            color={
              variant === 'secondary' || variant === 'quiet'
                ? TOKENS.colors.primary
                : '#FFFFFF'
            }
          />
        ) : (
          icon
        )}
        <Text
          style={[
            styles.label,
            variant === 'secondary' || variant === 'quiet'
              ? styles.labelNavy
              : styles.labelLight,
          ]}
        >
          {label}
        </Text>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOKENS.control.height,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1.5,
    borderColor: 'transparent',
    paddingHorizontal: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  primary: { backgroundColor: TOKENS.colors.primary },
  secondary: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.primary,
  },
  quiet: {
    minHeight: TOKENS.control.quietHeight,
    backgroundColor: 'transparent',
  },
  danger: { backgroundColor: TOKENS.colors.danger },
  fullWidth: { alignSelf: 'stretch' },
  disabled: { opacity: 0.45 },
  pressed: { opacity: 0.92 },
  label: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '600',
    textAlign: 'center',
  },
  labelLight: { color: '#FFFFFF' },
  labelNavy: { color: TOKENS.colors.primary },
});
