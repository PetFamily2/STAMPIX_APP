import { useState } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import type { QuickActionIconName } from '@/components/business-dashboard/QuickActionTile';
import { QuickActionTile } from '@/components/business-dashboard/QuickActionTile';
import {
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import {
  chunkQuickActionItems,
  getQuickActionColumnCount,
  getQuickActionContentWidth,
  getQuickActionTileWidth,
} from '@/lib/design/quickActionLayout';
import { flexDirection, rtlBaseView } from '@/lib/rtl';

export function QuickShortcutsGrid({
  layoutMode,
  items,
}: {
  layoutMode: DashboardLayoutMode;
  items: Array<{
    key: string;
    label: string;
    icon: QuickActionIconName;
    onPress: () => void;
    badgeLabel?: string;
    isLocked?: boolean;
  }>;
}) {
  const layout = getDashboardLayout(layoutMode);
  const { width: windowWidth } = useWindowDimensions();
  const [measuredContentWidth, setMeasuredContentWidth] = useState(0);
  const visibleItems = items.slice(0, 7);
  const estimatedContentWidth = getQuickActionContentWidth({
    windowWidth,
    pageHorizontalPadding: layout.pageHorizontalPadding,
  });
  const contentWidth =
    measuredContentWidth > 0 ? measuredContentWidth : estimatedContentWidth;
  const columns = getQuickActionColumnCount({
    contentWidth,
    itemCount: visibleItems.length,
    gap: layout.quickShortcutGap,
  });
  const tileWidth = getQuickActionTileWidth({
    contentWidth,
    columns,
    gap: layout.quickShortcutGap,
  });
  const rows = chunkQuickActionItems(visibleItems, columns);

  return (
    <View
      style={[styles.grid, { gap: layout.quickShortcutGap }]}
      onLayout={(event) => {
        const nextWidth = Math.round(event.nativeEvent.layout.width);
        if (nextWidth <= 0) {
          return;
        }
        setMeasuredContentWidth((current) =>
          current === nextWidth ? current : nextWidth
        );
      }}
    >
      {rows.map((row) => (
        <View
          key={row.map((item) => item.key).join(':')}
          style={[styles.row, { gap: layout.quickShortcutGap }]}
        >
          {row.map((item) => (
            <QuickActionTile
              key={item.key}
              label={item.label}
              icon={item.icon}
              badgeLabel={item.badgeLabel}
              isLocked={item.isLocked}
              onPress={item.onPress}
              minHeight={layout.quickShortcutMinHeight}
              style={{ width: tileWidth }}
            />
          ))}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    width: '100%',
    alignItems: 'stretch',
    paddingVertical: 2,
    ...rtlBaseView,
  },
  row: {
    flexDirection: flexDirection.row,
    alignItems: 'stretch',
    ...rtlBaseView,
  },
});
