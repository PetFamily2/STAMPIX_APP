import { StyleSheet } from 'react-native';

import { ActionButton } from '@/components/ui/ActionButton';

export function SettingsPrimaryButton({
  label,
  onPress,
  disabled = false,
  loading = false,
  accessibilityLabel,
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  accessibilityLabel?: string;
}) {
  return (
    <ActionButton
      label={label}
      onPress={onPress}
      disabled={disabled}
      loading={loading}
      accessibilityLabel={accessibilityLabel}
      style={styles.button}
    />
  );
}

const styles = StyleSheet.create({
  button: {
    minWidth: 168,
    alignSelf: 'center',
  },
});
