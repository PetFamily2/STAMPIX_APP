import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';
import { flexDirection } from '@/lib/rtl';

export type FaqItemData = {
  question: string;
  answer: string;
};

export function FaqAccordion({
  items,
  expandedIndex,
  onToggle,
  variant = 'settings',
}: {
  items: readonly FaqItemData[];
  expandedIndex: number | null;
  onToggle: (index: number) => void;
  variant?: 'customer' | 'settings';
}) {
  return (
    <View
      style={variant === 'settings' ? styles.settingsList : styles.customerList}
    >
      {items.map((item, index) => {
        const expanded = expandedIndex === index;
        const isLast = index === items.length - 1;
        return (
          <Pressable
            key={item.question}
            onPress={() => onToggle(index)}
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            style={({ pressed }) => [
              variant === 'settings' ? styles.settingsRow : styles.customerRow,
              variant === 'settings' && isLast ? styles.settingsRowLast : null,
              pressed ? styles.pressed : null,
            ]}
          >
            <View style={styles.header}>
              <Ionicons
                name={expanded ? 'remove-circle-outline' : 'add-circle-outline'}
                size={20}
                color={SETTINGS_TOKENS.accent}
              />
              <Text
                style={
                  variant === 'settings'
                    ? styles.settingsQuestion
                    : styles.customerQuestion
                }
                maxFontSizeMultiplier={1.4}
              >
                {item.question}
              </Text>
            </View>
            {expanded ? (
              <Text
                style={
                  variant === 'settings'
                    ? styles.settingsAnswer
                    : styles.customerAnswer
                }
                maxFontSizeMultiplier={1.4}
              >
                {item.answer}
              </Text>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  customerList: {
    width: '100%',
    gap: 10,
  },
  settingsList: {
    width: '100%',
  },
  customerRow: {
    borderBottomWidth: 1,
    borderBottomColor: '#D9E2F2',
    paddingHorizontal: 2,
    paddingVertical: 12,
    gap: 10,
  },
  settingsRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: SETTINGS_TOKENS.border,
  },
  settingsRowLast: {
    borderBottomWidth: 0,
  },
  header: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
  },
  customerQuestion: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '800',
    color: '#18181B',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  settingsQuestion: {
    flex: 1,
    minWidth: 0,
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  customerAnswer: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: '#6B7280',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  settingsAnswer: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.88,
  },
});
