import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { DASHBOARD_TOKENS } from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';
import { SurfaceCard } from './SurfaceCard';

export function InsightCard({
  title,
  body,
  tags = [],
  ctaLabel,
  onPress,
  icon = 'sparkles-outline',
}: {
  title: string;
  body: string;
  tags?: string[];
  ctaLabel?: string;
  onPress?: () => void;
  icon?: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <SurfaceCard tone="insight" radius="hero" padding="lg" style={styles.card}>
      <LinearGradient colors={['#EEF4FF', '#F5F3FF']} style={styles.wash} />
      <View style={styles.content}>
        <View style={styles.row}>
          <View style={styles.iconWrap}>
            <Ionicons name={icon} size={18} color="#4338CA" />
          </View>
        </View>
        <Text className={tw.textStart} style={styles.title}>
          {title}
        </Text>
        <Text className={tw.textStart} style={styles.body}>
          {body}
        </Text>
        {tags.length > 0 ? (
          <View style={styles.tagsWrap}>
            {tags.slice(0, 3).map((tag) => (
              <View key={tag} style={styles.tag}>
                <Text style={styles.tagText}>{tag}</Text>
              </View>
            ))}
          </View>
        ) : null}
        {ctaLabel && onPress ? (
          <Pressable onPress={onPress} style={styles.cta}>
            <Text style={styles.ctaText}>{ctaLabel}</Text>
          </Pressable>
        ) : null}
      </View>
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
  },
  wash: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: DASHBOARD_TOKENS.cardRadiusHero,
    opacity: 0.85,
  },
  content: {
    gap: 10,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  iconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#E0E7FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '700',
    color: DASHBOARD_TOKENS.colors.textPrimary,
  },
  body: {
    fontSize: 13,
    lineHeight: 19,
    fontWeight: '600',
    color: '#334155',
  },
  tagsWrap: {
    flexDirection: 'row-reverse',
    flexWrap: 'wrap',
    gap: 8,
  },
  tag: {
    borderRadius: 999,
    backgroundColor: '#E2E8FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  tagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#4338CA',
  },
  cta: {
    alignSelf: 'flex-end',
    marginTop: 2,
    borderRadius: 10,
    backgroundColor: DASHBOARD_TOKENS.colors.brandBlue,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ctaText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
