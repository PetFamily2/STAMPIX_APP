import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { RtlActionLink } from '@/components/ui/RtlActionLink';
import { alignItems, flexDirection, rtlBaseView, tw } from '@/lib/rtl';

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
        {actionLabel && onPressAction ? (
          <RtlActionLink
            label={actionLabel}
            onPress={onPressAction}
            style={styles.actionWrap}
            textStyle={styles.action}
            color={DASHBOARD_TOKENS.colors.brandBlue}
          />
        ) : (
          <View />
        )}
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
    flexDirection: flexDirection.row,
    alignItems: alignItems.start,
    justifyContent: 'space-between',
    gap: 12,
    ...rtlBaseView,
  },
  titleWrap: {
    flex: 1,
    alignItems: alignItems.end,
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
    minHeight: 24,
    alignSelf: 'flex-start',
  },
  action: {
    fontSize: 12,
    fontWeight: '700',
  },
  accessory: {
    width: '100%',
  },
});
