import type { ReactNode } from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import {
  SafeAreaView,
  useSafeAreaInsets,
} from 'react-native-safe-area-context';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';

export function BusinessPageShell({
  stickyHeader,
  children,
  backgroundColor = DASHBOARD_TOKENS.pageBackground,
  contentPaddingHorizontal = DASHBOARD_TOKENS.spacingPageHorizontal,
}: {
  stickyHeader: ReactNode;
  children: ReactNode;
  backgroundColor?: string;
  contentPaddingHorizontal?: number;
}) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: contentPaddingHorizontal,
          paddingBottom: (insets.bottom || 0) + 30,
        }}
      >
        {stickyHeader}
        {children}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
});
