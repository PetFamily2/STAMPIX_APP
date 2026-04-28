import { Ionicons } from '@expo/vector-icons';
import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';

import { RecommendationActionCard } from './RecommendationActionCard';

export function SmartRecommendationsPanel({
  layoutMode,
  cards,
  onPressCta,
  onPressDetails,
  loadingCardKey,
}: {
  layoutMode: DashboardLayoutMode;
  cards: Array<{
    key: string;
    tone: 'critical' | 'warning' | 'neutral' | 'success';
    title: string;
    body: string;
    supportingText?: string;
    evidenceTags: string[];
    primaryCtaLabel?: string | null;
  }>;
  onPressCta: (cardKey: string) => void;
  onPressDetails?: (cardKey: string) => void;
  loadingCardKey?: string | null;
}) {
  const layout = getDashboardLayout(layoutMode);
  const normalizedCards = cards.slice(0, 3);
  const [activeIndex, setActiveIndex] = useState(0);

  const cardStride = useMemo(
    () =>
      layout.recommendationCardWidthPrimary + DASHBOARD_TOKENS.spacingGridGap,
    [layout.recommendationCardWidthPrimary]
  );

  if (normalizedCards.length === 0) {
    return (
      <View style={[styles.emptyState, { borderRadius: layout.cardRadius }]}>
        <Ionicons name="sparkles-outline" size={18} color="#2563EB" />
        <Text style={styles.emptyText}>אין המלצות כרגע</Text>
      </View>
    );
  }

  return (
    <View style={styles.panel}>
      <ScrollView
        horizontal={true}
        showsHorizontalScrollIndicator={false}
        snapToInterval={cardStride}
        decelerationRate="fast"
        contentContainerStyle={styles.scrollContent}
        onMomentumScrollEnd={(event) => {
          const offsetX = event.nativeEvent.contentOffset.x;
          const nextIndex = Math.round(offsetX / cardStride);
          setActiveIndex(
            Math.max(0, Math.min(nextIndex, normalizedCards.length - 1))
          );
        }}
      >
        {normalizedCards.map((card, index) => (
          <RecommendationActionCard
            key={card.key}
            layoutMode={layoutMode}
            title={card.title}
            body={card.body}
            supportingText={card.supportingText}
            evidenceTags={card.evidenceTags}
            primaryCtaLabel={card.primaryCtaLabel}
            onPressCta={
              card.primaryCtaLabel ? () => onPressCta(card.key) : null
            }
            secondaryActionLabel={onPressDetails ? 'פרטים' : null}
            onPressSecondaryAction={
              onPressDetails ? () => onPressDetails(card.key) : null
            }
            tone={card.tone}
            emphasis={index === 0 ? 'primary' : 'secondary'}
            isLoading={loadingCardKey === card.key}
          />
        ))}
      </ScrollView>

      {normalizedCards.length > 1 ? (
        <View style={styles.pagination}>
          {normalizedCards.map((card, index) => (
            <View
              key={card.key}
              style={[
                styles.dot,
                index === activeIndex ? styles.dotActive : null,
              ]}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    minHeight: 1,
    gap: 12,
  },
  scrollContent: {
    flexDirection: 'row-reverse',
    gap: DASHBOARD_TOKENS.spacingGridGap,
    paddingBottom: 2,
  },
  pagination: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  dotActive: {
    backgroundColor: '#4F46E5',
  },
  emptyState: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: '#DCE8FF',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row-reverse',
    gap: 8,
    paddingHorizontal: DASHBOARD_TOKENS.spacingCardInner,
    ...DASHBOARD_TOKENS.cardShadowSoft,
  },
  emptyText: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '500',
    color: '#334155',
  },
});
