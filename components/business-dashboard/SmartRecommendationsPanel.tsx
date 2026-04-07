import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { SurfaceCard } from '@/components/business-ui';

import { RecommendationActionCard } from './RecommendationActionCard';

export function SmartRecommendationsPanel({
  cards,
  onPressCta,
  onPressDetails,
  loadingCardKey,
  headerActionLabel = 'סמן כטופל',
}: {
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
  headerActionLabel?: string;
}) {
  const [primaryCard, ...secondaryCards] = cards.slice(0, 3);

  return (
    <SurfaceCard
      elevated={false}
      padding="sm"
      radius="hero"
      style={styles.panel}
    >
      <View style={styles.headerRow}>
        <Text style={styles.headerAction}>{headerActionLabel}</Text>

        <View style={styles.titleRow}>
          <Text style={styles.title}>משימות והמלצות</Text>
          <Ionicons name="heart-outline" size={20} color="#2563EB" />
        </View>
      </View>

      {primaryCard ? (
        <RecommendationActionCard
          key={primaryCard.key}
          title={primaryCard.title}
          body={primaryCard.body}
          supportingText={primaryCard.supportingText}
          evidenceTags={primaryCard.evidenceTags}
          primaryCtaLabel={primaryCard.primaryCtaLabel}
          onPressCta={
            primaryCard.primaryCtaLabel
              ? () => onPressCta(primaryCard.key)
              : null
          }
          secondaryActionLabel="פרטים"
          onPressSecondaryAction={
            onPressDetails ? () => onPressDetails(primaryCard.key) : null
          }
          tone={primaryCard.tone}
          emphasis="primary"
          isLoading={loadingCardKey === primaryCard.key}
        />
      ) : null}

      {secondaryCards.length > 0 ? (
        <View style={styles.secondaryWrap}>
          {secondaryCards.map((card, index) => (
            <Pressable
              key={card.key}
              style={[
                styles.secondaryItemWrap,
                index < secondaryCards.length - 1
                  ? styles.secondaryDivider
                  : null,
              ]}
              onPress={
                onPressDetails || card.primaryCtaLabel
                  ? () => {
                      if (onPressDetails) {
                        onPressDetails(card.key);
                        return;
                      }
                      onPressCta(card.key);
                    }
                  : undefined
              }
            >
              <RecommendationActionCard
                title={card.title}
                body={card.body}
                supportingText={card.supportingText}
                evidenceTags={card.evidenceTags}
                primaryCtaLabel={undefined}
                tone={card.tone}
                emphasis="secondary"
                badgeLabel={index === 0 ? 'חדש' : null}
                secondaryActionLabel={
                  onPressDetails || card.primaryCtaLabel ? 'פרטים' : null
                }
                onPressSecondaryAction={
                  onPressDetails || card.primaryCtaLabel
                    ? () => {
                        if (onPressDetails) {
                          onPressDetails(card.key);
                          return;
                        }
                        onPressCta(card.key);
                      }
                    : null
                }
              />
            </Pressable>
          ))}
        </View>
      ) : null}
    </SurfaceCard>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: '#F3F8FF',
    borderColor: '#DCE8FF',
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  titleRow: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    lineHeight: 20,
    fontWeight: '900',
    color: '#1F2340',
  },
  headerAction: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '500',
    color: '#55607C',
  },
  secondaryWrap: {
    overflow: 'hidden',
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E6EBF4',
  },
  secondaryItemWrap: {
    backgroundColor: '#FFFFFF',
  },
  secondaryDivider: {
    borderBottomWidth: 1,
    borderBottomColor: '#EEF2F7',
  },
});
