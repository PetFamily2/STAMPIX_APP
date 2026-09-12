import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';
import { MVP_FEATURE_FLAGS } from '@/lib/billing/productionContract';

export const ADD_BUSINESS_CTA_LABEL = 'צרפו עסק נוסף';

export function AddBusinessCta({ onPress }: { onPress: () => void }) {
  if (!MVP_FEATURE_FLAGS.additionalBusinessCreationEnabled) {
    return null;
  }
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={ADD_BUSINESS_CTA_LABEL}
      accessibilityHint="פתיחת תהליך יצירת עסק נוסף בחשבון הקיים"
      style={({ pressed }) => [styles.card, pressed ? styles.pressed : null]}
    >
      <View style={styles.row}>
        <View style={styles.iconShell}>
          <Ionicons name="add" size={18} color={SETTINGS_TOKENS.accentText} />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} maxFontSizeMultiplier={1.4}>
            {ADD_BUSINESS_CTA_LABEL}
          </Text>
          <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
            פתיחת עסק חדש תחת אותו חשבון
          </Text>
        </View>
        <View style={styles.chevronWrap}>
          <Ionicons
            name="chevron-back"
            size={18}
            color={SETTINGS_TOKENS.accentText}
          />
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    minHeight: 56,
    borderRadius: SETTINGS_TOKENS.radius,
    borderWidth: 1,
    borderColor: '#D7E4FF',
    backgroundColor: SETTINGS_TOKENS.accentSoft,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  pressed: {
    opacity: 0.88,
  },
  row: {
    minHeight: SETTINGS_TOKENS.touchTarget,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
    ...rtlBaseView,
  },
  iconShell: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
    gap: 1,
  },
  title: {
    width: '100%',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: SETTINGS_TOKENS.accentText,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    width: '100%',
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  chevronWrap: {
    width: 28,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
