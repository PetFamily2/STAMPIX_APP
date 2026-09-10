import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';
import {
  formatMissingFieldsCountLabel,
  formatProfileCompletionTitle,
} from '@/lib/businessSettings/completion';
import { alignItems, flexDirection, rtlBaseView } from '@/lib/rtl';

type ProfileCompletionCardProps = {
  missingCount: number;
  canEdit: boolean;
  onPress: () => void;
};

export function ProfileCompletionCard({
  missingCount,
  canEdit,
  onPress,
}: ProfileCompletionCardProps) {
  if (missingCount <= 0) {
    return null;
  }

  const title = formatProfileCompletionTitle(missingCount);
  const subtitle = formatMissingFieldsCountLabel(missingCount);

  return (
    <View
      style={styles.card}
      accessibilityRole="summary"
      accessibilityLabel={`${title}. ${subtitle}`}
    >
      <View style={styles.row}>
        <View style={styles.iconShell}>
          <Ionicons name="sparkles-outline" size={18} color="#B45309" />
        </View>
        <View style={styles.copy}>
          <Text style={styles.title} maxFontSizeMultiplier={1.4}>
            {title}
          </Text>
          <Text style={styles.subtitle} maxFontSizeMultiplier={1.4}>
            {subtitle}
          </Text>
        </View>
        {canEdit ? (
          <Pressable
            onPress={onPress}
            accessibilityRole="button"
            accessibilityLabel="השלמה"
            accessibilityHint="פתיחת השלמת פרטי העסק"
            style={({ pressed }) => [
              styles.cta,
              pressed ? styles.ctaPressed : null,
            ]}
          >
            <Text style={styles.ctaLabel}>השלמה</Text>
          </Pressable>
        ) : null}
      </View>
      {!canEdit ? (
        <Text style={styles.locked} maxFontSizeMultiplier={1.4}>
          השלמת נתונים זמינה לבעלים או למנהל בלבד.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: SETTINGS_TOKENS.radius,
    borderWidth: 1,
    borderColor: SETTINGS_TOKENS.warningBorder,
    backgroundColor: SETTINGS_TOKENS.warningBg,
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 8,
  },
  row: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
    ...rtlBaseView,
  },
  iconShell: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF3D6',
  },
  copy: {
    flex: 1,
    minWidth: 0,
    alignItems: alignItems.start,
    gap: 2,
  },
  title: {
    width: '100%',
    fontSize: 15,
    lineHeight: 20,
    fontWeight: '700',
    color: SETTINGS_TOKENS.warningTitle,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    width: '100%',
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '500',
    color: SETTINGS_TOKENS.warningBody,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cta: {
    minHeight: SETTINGS_TOKENS.touchTarget,
    minWidth: 84,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E8C888',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ctaPressed: {
    opacity: 0.86,
  },
  ctaLabel: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '700',
    color: SETTINGS_TOKENS.warningTitle,
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  locked: {
    width: '100%',
    fontSize: 12,
    lineHeight: 17,
    color: SETTINGS_TOKENS.warningBody,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
