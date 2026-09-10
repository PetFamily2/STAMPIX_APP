import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';
import { alignItems } from '@/lib/rtl';

export function SettingsSection({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <View style={styles.section}>
      <Text style={styles.title} maxFontSizeMultiplier={1.4}>
        {title}
      </Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: 8,
    alignItems: alignItems.start,
  },
  title: {
    width: '100%',
    paddingHorizontal: 4,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
