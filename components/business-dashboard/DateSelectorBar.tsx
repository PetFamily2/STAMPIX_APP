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
                minHeight: layout.segmentedHeight,
                borderRadius: layout.segmentedRadius,
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
                    minHeight: layout.segmentedHeight,
                    borderRadius: layout.segmentedRadius,
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
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 4,
    gap: 4,
  },
  pill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
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
    fontSize: 14,
    lineHeight: 18,
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
