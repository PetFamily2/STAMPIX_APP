import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { SETTINGS_TOKENS } from '@/components/business-settings/tokens';

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
    width: '100%',
    gap: 9,
    alignItems: 'stretch',
  },
  title: {
    width: '100%',
    paddingHorizontal: 5,
    paddingTop: 2,
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '700',
    color: SETTINGS_TOKENS.textSecondary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
