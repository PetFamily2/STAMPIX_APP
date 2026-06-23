import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  type StyleProp,
  type TextStyle,
  View,
  type ViewStyle,
} from 'react-native';

import { flexDirection, rtlBaseView } from '@/lib/rtl';

type RtlActionLinkProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  color?: string;
  style?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
};

export function RtlActionLink({
  label,
  onPress,
  disabled = false,
  loading = false,
  color = '#2563EB',
  style,
  textStyle,
}: RtlActionLinkProps) {
  const isDisabled = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={isDisabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.wrap,
        style,
        pressed && !isDisabled ? styles.pressed : null,
        isDisabled ? styles.disabled : null,
      ]}
    >
      {loading ? (
        <ActivityIndicator color={color} size="small" />
      ) : (
        <View style={styles.content}>
          <Text style={[styles.label, { color }, textStyle]}>{label}</Text>
          <Ionicons name="chevron-back" size={14} color={color} />
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    minHeight: 24,
    justifyContent: 'center',
    ...rtlBaseView,
  },
  content: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 3,
    ...rtlBaseView,
  },
  label: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.82,
  },
  disabled: {
    opacity: 0.6,
  },
});
