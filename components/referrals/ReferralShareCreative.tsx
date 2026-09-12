import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  buildReferralShareCreative,
  type ReferralShareCreativeInput,
} from '@/lib/referrals/shareCreative';

export function ReferralShareCreative(props: ReferralShareCreativeInput) {
  const creative = buildReferralShareCreative(props);
  return (
    <View
      accessibilityLabel={`${creative.brand} ${creative.headline}`}
      style={[
        styles.card,
        { width: Math.min(creative.width / 3, 360), minHeight: 220 },
      ]}
    >
      <Text style={styles.brand}>{creative.brand}</Text>
      <Text style={styles.headline}>{creative.headline}</Text>
      <Text style={styles.benefit}>{creative.benefit}</Text>
      <Pressable accessibilityRole="button" accessibilityLabel={creative.cta}>
        <Text style={styles.cta}>{creative.cta}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 24,
    backgroundColor: '#111827',
    padding: 20,
    alignItems: 'stretch',
    gap: 10,
  },
  brand: {
    color: '#F9FAFB',
    fontSize: 18,
    fontWeight: '800',
  },
  headline: {
    color: '#F9FAFB',
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  benefit: {
    color: '#D1D5DB',
    fontSize: 16,
    lineHeight: 22,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  cta: {
    color: '#111827',
    backgroundColor: '#F9FAFB',
    overflow: 'hidden',
    borderRadius: 14,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
    fontWeight: '700',
  },
});
