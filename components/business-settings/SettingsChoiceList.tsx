import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';
import { flexDirection, rtlBaseView } from '@/lib/rtl';

type SettingsChoiceOption<T extends string> = {
  id: T;
  label: string;
};

export function SettingsChoiceList<T extends string>({
  options,
  selected,
  onSelect,
  multiple = false,
  disabled = false,
}: {
  options: Array<SettingsChoiceOption<T>>;
  selected: T | T[] | null;
  onSelect: (id: T) => void;
  multiple?: boolean;
  disabled?: boolean;
}) {
  const selectedSet = new Set(
    Array.isArray(selected) ? selected : selected ? [selected] : []
  );

  return (
    <View style={[styles.list, disabled ? styles.listDisabled : null]}>
      {options.map((option) => {
        const isSelected = selectedSet.has(option.id);
        return (
          <Pressable
            key={option.id}
            onPress={() => {
              if (!disabled) {
                onSelect(option.id);
              }
            }}
            disabled={disabled}
            accessibilityRole={multiple ? 'checkbox' : 'radio'}
            accessibilityLabel={option.label}
            accessibilityState={{
              selected: isSelected,
              checked: isSelected,
              disabled,
            }}
            style={({ pressed }) => [
              styles.option,
              isSelected ? styles.optionSelected : null,
              pressed && !disabled ? styles.pressed : null,
            ]}
          >
            <View style={styles.optionRow}>
              <Ionicons
                name={isSelected ? 'checkmark-circle' : 'ellipse-outline'}
                size={20}
                color={
                  isSelected
                    ? SETTINGS_TOKENS.accentText
                    : SETTINGS_TOKENS.textTertiary
                }
              />
              <Text
                style={[
                  styles.optionLabel,
                  isSelected ? styles.optionLabelSelected : null,
                ]}
                maxFontSizeMultiplier={1.4}
              >
                {option.label}
              </Text>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SettingsBooleanChoices({
  value,
  onChange,
  yesLabel = 'כן',
  noLabel = 'לא',
  disabled = false,
}: {
  value: boolean | null;
  onChange: (value: boolean) => void;
  yesLabel?: string;
  noLabel?: string;
  disabled?: boolean;
}) {
  return (
    <SettingsChoiceList
      options={[
        { id: 'yes', label: yesLabel },
        { id: 'no', label: noLabel },
      ]}
      selected={value === true ? 'yes' : value === false ? 'no' : null}
      onSelect={(id) => onChange(id === 'yes')}
      disabled={disabled}
    />
  );
}

const styles = StyleSheet.create({
  list: {
    width: '100%',
    gap: 8,
  },
  listDisabled: {
    opacity: 0.72,
  },
  option: {
    minHeight: SETTINGS_TOKENS.touchTarget,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.border,
    backgroundColor: SETTINGS_TOKENS.surface,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  optionSelected: {
    borderColor: '#B9CFFF',
    backgroundColor: SETTINGS_TOKENS.accentSoft,
  },
  pressed: {
    opacity: 0.88,
  },
  optionRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
    ...rtlBaseView,
  },
  optionLabel: {
    flex: 1,
    flexShrink: 1,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '500',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  optionLabelSelected: {
    fontWeight: '700',
  },
});
