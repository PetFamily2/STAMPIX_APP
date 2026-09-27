import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  Text,
  View,
  type ViewStyle,
} from 'react-native';

import { flexDirection, rtlCenterText, selfStart } from '@/lib/rtl';
import { actionButtonUsesMutedSurface } from '@/lib/ui/actionButtonVisual';

export type ActionButtonVariant = 'primary' | 'secondary' | 'lifecycle';

type ActionButtonProps = {
  label: string;
  onPress: () => void;
  variant?: ActionButtonVariant;
  icon?: ReactNode;
  disabled?: boolean;
  loading?: boolean;
  fullWidth?: boolean;
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
};

const ACTIVITY_COLORS: Record<ActionButtonVariant, string> = {
  primary: '#FFFFFF',
  secondary: '#1D4ED8',
  lifecycle: '#9F1239',
};

/**
 * Android-safe action button: the Pressable owns interaction only, while a
 * non-collapsable child owns every visible part of the pill.
 */
export function ActionButton({
  label,
  onPress,
  variant = 'primary',
  icon,
  disabled = false,
  loading = false,
  fullWidth = false,
  accessibilityLabel,
  style,
  testID,
}: ActionButtonProps) {
  const isDisabled = disabled || loading;
  const muted = actionButtonUsesMutedSurface(disabled, loading);

  return (
    <Pressable
      onPress={onPress}
      disabled={isDisabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ disabled: isDisabled, busy: loading }}
      hitSlop={2}
      testID={testID}
      style={({ pressed }) => [
        styles.pressable,
        fullWidth ? styles.fullWidth : styles.compact,
        pressed && !isDisabled ? styles.pressed : null,
        style,
      ]}
    >
      <View
        collapsable={false}
        pointerEvents="none"
        style={[
          styles.surface,
          fullWidth ? styles.fullWidth : null,
          styles[variant],
          muted ? styles[`${variant}Disabled`] : null,
        ]}
      >
        <View style={styles.content}>
          {loading ? (
            <ActivityIndicator size="small" color={ACTIVITY_COLORS[variant]} />
          ) : (
            (icon ?? null)
          )}
          <Text
            maxFontSizeMultiplier={1.4}
            style={[
              styles.label,
              styles[`${variant}Label`],
              muted ? styles[`${variant}LabelDisabled`] : null,
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
  pressable: {
    minHeight: 48,
    justifyContent: 'center',
  },
  compact: {
    alignSelf: selfStart,
  },
  fullWidth: {
    width: '100%',
  },
  surface: {
    minHeight: 48,
    minWidth: 132,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 20,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
  },
  primary: {
    borderColor: '#2F6BFF',
    backgroundColor: '#2F6BFF',
  },
  primaryDisabled: {
    borderColor: '#B7C3D6',
    backgroundColor: '#D5DCE8',
  },
  secondary: {
    borderColor: '#AFC8F5',
    backgroundColor: '#FFFFFF',
  },
  secondaryDisabled: {
    borderColor: '#CBD5E1',
    backgroundColor: '#F1F5F9',
  },
  lifecycle: {
    borderColor: '#FDA4AF',
    backgroundColor: '#FFF1F2',
  },
  lifecycleDisabled: {
    borderColor: '#D8DEE8',
    backgroundColor: '#F1F5F9',
  },
  pressed: {
    opacity: 0.84,
    transform: [{ scale: 0.99 }],
  },
  label: {
    flexShrink: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    textAlign: 'center',
    ...rtlCenterText,
  },
  primaryLabel: {
    color: '#FFFFFF',
  },
  primaryLabelDisabled: {
    color: '#334155',
  },
  secondaryLabel: {
    color: '#1D4ED8',
  },
  secondaryLabelDisabled: {
    color: '#64748B',
  },
  lifecycleLabel: {
    color: '#9F1239',
  },
  lifecycleLabelDisabled: {
    color: '#64748B',
  },
});
