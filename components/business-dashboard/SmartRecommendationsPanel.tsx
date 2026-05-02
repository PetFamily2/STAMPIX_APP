import { Ionicons } from '@expo/vector-icons';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
  getDashboardLayout,
} from '@/lib/design/dashboardTokens';
import { tw } from '@/lib/rtl';

type RecommendationCard = {
  key: string;
  tone: 'critical' | 'warning' | 'neutral' | 'success';
  title: string;
  body: string;
  supportingText?: string;
  evidenceTags: string[];
  primaryCtaLabel?: string | null;
};

function getIconForTone(tone: RecommendationCard['tone']) {
  if (tone === 'critical') {
    return 'warning-outline' as const;
  }
  if (tone === 'warning') {
    return 'megaphone-outline' as const;
  }
  if (tone === 'success') {
    return 'checkmark-circle-outline' as const;
  }
  return 'sparkles-outline' as const;
}

export function SmartRecommendationsPanel({
  layoutMode,
  cards,
  onPressCta,
  onPressDetails,
  loadingCardKey,
}: {
  layoutMode: DashboardLayoutMode;
  cards: RecommendationCard[];
  onPressCta: (cardKey: string) => void;
  onPressDetails?: (cardKey: string) => void;
  loadingCardKey?: string | null;
}) {
  const layout = getDashboardLayout(layoutMode);
  const normalizedCards = cards.slice(0, 3);

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
      {normalizedCards.map((card, index) => {
        const isPriorityItem = index === 0;
        const isLoading = loadingCardKey === card.key;
        const actionLabel =
          card.primaryCtaLabel || (onPressDetails ? 'פרטים' : null);
        const onPressAction = card.primaryCtaLabel
          ? () => onPressCta(card.key)
          : onPressDetails
            ? () => onPressDetails(card.key)
            : null;

        return (
          <View key={card.key}>
            <View style={styles.row}>
              <View style={styles.rowHeader}>
                <Ionicons
                  name={getIconForTone(card.tone)}
                  size={19}
                  color={isPriorityItem ? '#2563EB' : '#94A3B8'}
                />
                <Text
                  className={tw.textStart}
                  style={[
                    styles.title,
                    isPriorityItem ? styles.priorityTitle : styles.regularTitle,
                  ]}
                >
                  {card.title}
                </Text>
              </View>

              <Text className={tw.textStart} style={styles.body}>
                {card.body}
              </Text>

              {actionLabel && onPressAction ? (
                <Pressable
                  style={styles.actionLink}
                  onPress={onPressAction}
                  disabled={isLoading}
                >
                  {isLoading ? (
                    <ActivityIndicator color="#2563EB" size="small" />
                  ) : (
                    <Text
                      className={tw.textStart}
                      style={styles.actionLinkText}
                    >
                      {`${actionLabel} >`}
                    </Text>
                  )}
                </Pressable>
              ) : null}
            </View>

            {index < normalizedCards.length - 1 ? (
              <View style={styles.divider} />
            ) : null}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    minHeight: 1,
    gap: 0,
  },
  row: {
    paddingVertical: 13,
    gap: 4,
    alignItems: 'flex-end',
  },
  rowHeader: {
    flexDirection: 'row-reverse',
    alignItems: 'center',
    justifyContent: 'flex-end',
    alignSelf: 'stretch',
    gap: 8,
  },
  title: {
    flex: 1,
    fontSize: 15,
    lineHeight: 20,
    color: '#111827',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  priorityTitle: {
    fontWeight: '700',
  },
  regularTitle: {
    fontWeight: '400',
  },
  body: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '400',
    color: '#475569',
    textAlign: 'right',
    alignSelf: 'stretch',
    writingDirection: 'rtl',
  },
  actionLink: {
    alignSelf: 'flex-end',
    paddingTop: 1,
  },
  actionLinkText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '600',
    color: '#2563EB',
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  divider: {
    height: 1,
    backgroundColor: '#E2E8F0',
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
