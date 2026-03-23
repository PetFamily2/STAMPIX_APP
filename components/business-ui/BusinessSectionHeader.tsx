import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

export function BusinessSectionHeader({
  title,
  subtitle,
  actionLabel,
  onPressAction,
  accessory,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onPressAction?: () => void;
  accessory?: ReactNode;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        {actionLabel && onPressAction ? (
          <Pressable onPress={onPressAction} style={styles.actionWrap}>
            <Text style={styles.action}>{actionLabel}</Text>
            <Ionicons
              name="chevron-back"
              size={14}
              color={DASHBOARD_TOKENS.colors.brandBlue}
            />
          </Pressable>
        ) : (
          <View />
        )}
        <View style={styles.titleWrap}>
          <Text className={tw.textStart} style={styles.title}>
            {title}
          </Text>
          {subtitle ? (
            <Text className={tw.textStart} style={styles.subtitle}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      </View>
      {accessory ? <View style={styles.accessory}>{accessory}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleWrap: {
    flex: 1,
    alignItems: 'flex-end',
    gap: 2,
  },
  title: {
    fontSize: DASHBOARD_TOKENS.sectionTitleSize,
    lineHeight: DASHBOARD_TOKENS.sectionTitleSize + 3,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
  subtitle: {
    fontSize: DASHBOARD_TOKENS.sectionSubtitleSize,
    lineHeight: DASHBOARD_TOKENS.sectionSubtitleSize + 4,
    fontWeight: '600',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
  actionWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    minHeight: 24,
  },
  action: {
    color: DASHBOARD_TOKENS.colors.brandBlue,
    fontSize: 12,
    fontWeight: '700',
  },
  accessory: {
    width: '100%',
  },
});
