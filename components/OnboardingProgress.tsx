import React, { useMemo } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type OnboardingProgressProps = {
  total: number;
  current: number;
  style?: StyleProp<ViewStyle>;
};

export function OnboardingProgress({
  total,
  current,
  style,
}: OnboardingProgressProps) {
  const normalizedTotal = Math.max(1, Math.floor(total));
  const normalizedCurrent = Math.min(
    normalizedTotal,
    Math.max(0, Math.floor(current))
  );

  const items = useMemo(
    () => Array.from({ length: normalizedTotal }, (_, index) => index + 1),
    [normalizedTotal]
  );

  return (
    <View style={[styles.container, style]}>
      {items.map((index) => (
        <View
          key={`progress-${index}`}
          style={[
            styles.segment,
            index <= normalizedCurrent ? styles.active : styles.inactive,
          ]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 6,
  },
  segment: {
    height: 6,
    width: 28,
    borderRadius: 999,
  },
  active: {
    backgroundColor: '#2563EB',
  },
  inactive: {
    backgroundColor: '#E5E7EB',
  },
});
