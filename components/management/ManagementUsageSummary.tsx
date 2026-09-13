import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { flexDirection, rtlBaseView } from '@/lib/rtl';

export function ManagementUsageSummary({
  label,
  used,
  limit,
  unit,
  nearLimitText,
  atLimitText,
  overLimitText,
  actionLabel,
  onActionPress,
}: {
  label: string;
  used: number;
  limit: number;
  unit: string;
  nearLimitText?: string;
  atLimitText?: string;
  overLimitText?: string;
  actionLabel?: string;
  onActionPress?: () => void;
}) {
  const safeUsed = Math.max(0, Math.floor(used));
  const safeLimit = Math.max(0, Math.floor(limit));
  const overage = Math.max(0, safeUsed - safeLimit);
  const isOverLimit = overage > 0;
  const isAtLimit = !isOverLimit && safeUsed >= safeLimit;
  const isNearLimit =
    !isAtLimit && safeLimit > 0 && safeUsed / safeLimit >= 0.8;
  const supportingText = isOverLimit
    ? overLimitText
    : isAtLimit
      ? atLimitText
      : isNearLimit
        ? nearLimitText
        : undefined;

  return (
    <View
      style={[styles.surface, isOverLimit ? styles.surfaceOverLimit : null]}
    >
      <View style={styles.topRow}>
        <View style={styles.copy}>
          <Text style={styles.label}>{label}</Text>
          <Text style={styles.value}>
            {isOverLimit ? `${safeUsed} ${unit}` : `${safeUsed} מתוך ${safeLimit} ${unit}`}
          </Text>
        </View>
        {isOverLimit ? (
          <View style={styles.overageBadge}>
            <Ionicons name="alert-circle-outline" size={16} color="#92400E" />
            <Text style={styles.overageBadgeText}>
              {overage} מעל מגבלת המסלול
            </Text>
          </View>
        ) : null}
      </View>

      {!isOverLimit && safeLimit > 0 ? (
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{ min: 0, max: safeLimit, now: safeUsed }}
          style={styles.track}
        >
          <View
            style={[
              styles.fill,
              {
                width: `${Math.min(100, (safeUsed / safeLimit) * 100)}%`,
              },
              isAtLimit ? styles.fillAtLimit : null,
            ]}
          />
        </View>
      ) : null}

      {supportingText ? (
        <View style={styles.supportRow}>
          <Text style={styles.supportText}>{supportingText}</Text>
          {actionLabel && onActionPress ? (
            <Pressable
              accessibilityRole="button"
              onPress={onActionPress}
              style={({ pressed }) => [
                styles.action,
                pressed ? styles.pressed : null,
              ]}
            >
              <Text style={styles.actionText}>{actionLabel}</Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  surface: {
    width: '100%',
    gap: 10,
    borderWidth: 1,
    borderColor: '#D7E2F4',
    borderRadius: 18,
    backgroundColor: '#F8FAFF',
    paddingHorizontal: 14,
    paddingVertical: 13,
  },
  surfaceOverLimit: {
    borderColor: '#F4C78C',
    backgroundColor: '#FFF9F0',
  },
  topRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
    ...rtlBaseView,
  },
  copy: {
    flex: 1,
    minWidth: 0,
    alignItems: 'stretch',
    gap: 2,
  },
  label: {
    width: '100%',
    color: '#64748B',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  value: {
    width: '100%',
    color: '#12203A',
    fontSize: 15,
    lineHeight: 21,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  overageBadge: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 5,
    borderRadius: 999,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 6,
  },
  overageBadgeText: {
    color: '#92400E',
    fontSize: 11,
    lineHeight: 15,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  track: {
    width: '100%',
    height: 6,
    overflow: 'hidden',
    borderRadius: 999,
    backgroundColor: '#E2E8F0',
  },
  fill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2F6BFF',
  },
  fillAtLimit: {
    backgroundColor: '#D97706',
  },
  supportRow: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 10,
    ...rtlBaseView,
  },
  supportText: {
    flex: 1,
    minWidth: 0,
    color: '#7C5A20',
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '600',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  action: {
    minHeight: 40,
    borderRadius: 12,
    backgroundColor: '#1D4ED8',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  actionText: {
    color: '#FFFFFF',
    fontSize: 12,
    lineHeight: 17,
    fontWeight: '800',
    textAlign: 'center',
    writingDirection: 'rtl',
  },
  pressed: {
    opacity: 0.84,
  },
});
