import { StyleSheet, TextInput, View } from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { rtlBaseText } from '@/lib/rtl';

type PwaTextFieldProps = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  error?: string;
  placeholder?: string;
  multiline?: boolean;
};

export function PwaTextField({
  label,
  value,
  onChangeText,
  error,
  placeholder,
  multiline = false,
}: PwaTextFieldProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        aria-invalid={error ? true : undefined}
        multiline={multiline}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={TOKENS.colors.textMuted}
        style={[
          styles.field,
          multiline ? styles.area : null,
          error ? styles.fieldError : null,
        ]}
        value={value}
      />
      {error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, alignItems: 'stretch' },
  label: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
  },
  field: {
    ...rtlBaseText,
    minHeight: TOKENS.control.height,
    borderWidth: 1,
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.md,
    backgroundColor: TOKENS.colors.elevatedSurface,
    color: TOKENS.colors.textPrimary,
    fontFamily: 'Heebo',
    fontSize: 16,
    lineHeight: 22,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  area: { minHeight: 96, textAlignVertical: 'top' },
  fieldError: { borderColor: TOKENS.colors.danger },
  error: {
    ...rtlBaseText,
    color: TOKENS.colors.danger,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
  },
});
