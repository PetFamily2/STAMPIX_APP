import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { StandaloneBackTitleHeader } from '@/components/StandaloneBackTitleHeader';
import StickyScrollHeader from '@/components/StickyScrollHeader';
import { safeBack } from '@/lib/navigation';

export function ManagementPageHeader({
  title,
  subtitle,
  fallbackHref,
  onBackPress,
  leftAccessory,
  backgroundColor = '#E9F0FF',
  compact = false,
}: {
  title: string;
  subtitle?: string;
  fallbackHref: string;
  onBackPress?: () => void;
  leftAccessory?: ReactNode;
  backgroundColor?: string;
  compact?: boolean;
}) {
  const insets = useSafeAreaInsets();

  return (
    <StickyScrollHeader
      topPadding={compact ? 0 : (insets.top || 0) + 8}
      backgroundColor={backgroundColor}
      style={compact ? styles.stickyCompact : styles.sticky}
    >
      <View style={styles.header}>
        <StandaloneBackTitleHeader
          title={title}
          subtitle={subtitle}
          onBackPress={onBackPress ?? (() => safeBack(fallbackHref))}
          leftAccessory={leftAccessory}
          titleStyle={styles.title}
          subtitleStyle={styles.subtitle}
        />
      </View>
    </StickyScrollHeader>
  );
}

const styles = StyleSheet.create({
  sticky: {
    paddingBottom: 10,
  },
  stickyCompact: {
    paddingBottom: 4,
  },
  header: {
    width: '100%',
    minHeight: 44,
    alignItems: 'stretch',
  },
  title: {
    width: '100%',
    color: '#12203A',
    fontSize: 22,
    lineHeight: 28,
    fontWeight: '800',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  subtitle: {
    width: '100%',
    marginTop: 2,
    color: '#64748B',
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '500',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
});
