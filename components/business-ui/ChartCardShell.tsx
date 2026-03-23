import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { BusinessSectionHeader } from './BusinessSectionHeader';
import { SurfaceCard } from './SurfaceCard';

export function ChartCardShell({
  title,
  subtitle,
  actionLabel,
  onPressAction,
  children,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onPressAction?: () => void;
  children: ReactNode;
}) {
  return (
    <SurfaceCard tone="default" radius="lg" padding="lg" style={styles.card}>
      <BusinessSectionHeader
        title={title}
        subtitle={subtitle}
        actionLabel={actionLabel}
        onPressAction={onPressAction}
      />
      <View style={styles.content}>{children}</View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: 14,
  },
  content: {
    gap: 10,
  },
});
