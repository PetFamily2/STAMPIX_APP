import React from 'react';
import {
  type DimensionValue,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

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
  const progressPercent = `${(normalizedCurrent / normalizedTotal) * 100}%` as DimensionValue;

  return (
    <View style={[styles.container, style]}>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: progressPercent,
            },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginStart: 16,
    alignItems: 'stretch',
    justifyContent: 'center',
  },
  track: {
    height: 14,
    width: '100%',
    borderRadius: 999,
    backgroundColor: '#E5E7EB',
    overflow: 'hidden',
  },
  fill: {
    alignSelf: 'flex-end',
    height: '100%',
    borderRadius: 999,
    backgroundColor: '#2563EB',
  },
});
