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
}: {
  stickyHeader: ReactNode;
  children: ReactNode;
  backgroundColor?: string;
}) {
  const insets = useSafeAreaInsets();

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor }]} edges={[]}>
      <ScrollView
        stickyHeaderIndices={[0]}
        style={styles.scroll}
        contentContainerStyle={{
          paddingHorizontal: DASHBOARD_TOKENS.spacingPageHorizontal,
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
