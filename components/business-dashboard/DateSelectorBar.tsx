import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';

export type DatePresetKey =
  | 'today'
  | 'last_7_days'
  | 'last_30_days'
  | 'yesterday';

const ITEMS: Array<{ key: DatePresetKey; label: string }> = [
  { key: 'today', label: 'היום' },
  { key: 'last_7_days', label: '7 ימים' },
  { key: 'last_30_days', label: '30 ימים' },
  { key: 'yesterday', label: 'אתמול' },
];

export function DateSelectorBar({
  layoutMode,
  value,
  onChange,
}: {
  layoutMode: DashboardLayoutMode;
  value: DatePresetKey;
  onChange: (preset: DatePresetKey) => void;
}) {
  const layout = getDashboardLayout(layoutMode);

  return (
    <View style={styles.container}>
      {ITEMS.map((item) => {
        const isActive = item.key === value;
        return (
          <Pressable
            key={item.key}
            onPress={() => onChange(item.key)}
            style={[
              styles.pill,
              {
                minHeight: Math.max(26, layout.segmentedHeight - 14),
                borderRadius: Math.max(9, layout.segmentedRadius - 8),
              },
              isActive ? styles.pillActive : styles.pillInactive,
            ]}
          >
            {isActive ? (
              <LinearGradient
                colors={['#5B3DF5', '#2563EB']}
                start={{ x: 1, y: 0.5 }}
                end={{ x: 0, y: 0.5 }}
                style={[
                  styles.activeGradient,
                  {
                    minHeight: Math.max(26, layout.segmentedHeight - 14),
                    borderRadius: Math.max(9, layout.segmentedRadius - 8),
                  },
                ]}
              >
                <Text style={[styles.label, styles.labelActive]}>
                  {item.label}
                </Text>
              </LinearGradient>
            ) : (
              <Text style={[styles.label, styles.labelInactive]}>
                {item.label}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 1,
    gap: 1,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    overflow: 'hidden',
  },
  pillActive: {
    backgroundColor: 'transparent',
    shadowColor: '#0F172A',
    shadowOpacity: 0.14,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  pillInactive: {
    backgroundColor: 'transparent',
  },
  activeGradient: {
    width: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: 11,
    lineHeight: 13,
    letterSpacing: 0,
  },
  labelActive: {
    fontWeight: '700',
    color: '#FFFFFF',
  },
  labelInactive: {
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
  },
});
