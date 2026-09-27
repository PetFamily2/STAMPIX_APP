import { StyleSheet, Text, View } from 'react-native';

import type { DiscoveryMapProps } from '@/components/customer/DiscoveryMap.types';

const TEXT = {
  title: 'המפה לא זמינה בתצוגה הזו',
  subtitle: 'אפשר לראות את העסקים ברשימה.',
};

export function DiscoveryMap(_props: DiscoveryMapProps) {
  return (
    <View style={styles.mapFallback}>
      <Text style={styles.mapFallbackTitle}>{TEXT.title}</Text>
      <Text style={styles.mapFallbackSubtitle}>{TEXT.subtitle}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  mapFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 18,
    gap: 8,
  },
  mapFallbackTitle: {
    width: '100%',
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  mapFallbackSubtitle: {
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    textAlign: 'right',
    writingDirection: 'rtl',
    lineHeight: 18,
  },
});
