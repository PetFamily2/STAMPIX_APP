import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { alignItems, rtlBaseText } from '@/lib/rtl';

type PwaEmptyStateProps = {
  title: string;
  body: string;
  action?: ReactNode;
};

export function PwaEmptyState({ title, body, action }: PwaEmptyStateProps) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      {action}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: alignItems.start,
    gap: 8,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    padding: 16,
  },
  title: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600',
  },
  body: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    fontSize: 14,
    lineHeight: 21,
  },
});
