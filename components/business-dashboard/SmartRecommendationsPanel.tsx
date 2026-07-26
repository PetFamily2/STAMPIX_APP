import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import {
  RecommendationActionCard,
  type RecommendationCategory,
  type RecommendationTone,
} from '@/components/business-dashboard/RecommendationActionCard';
import {
  DASHBOARD_TOKENS,
  type DashboardLayoutMode,
} from '@/lib/design/dashboardTokens';
import type { RecommendationAction } from '@/lib/recommendations/navigation';
import type {
  RecommendationGuideId,
  RecommendationStableId,
} from '@/lib/recommendations/guidance';
import {
  flexDirection,
  rtlBaseView,
  selfStart,
  tw,
} from '@/lib/rtl';

export type DashboardRecommendation = {
  stableId: RecommendationStableId;
  category: RecommendationCategory;
  priority: number;
  placement: 'primary' | 'secondary';
  title: string;
  reason: string;
  ctaLabel: string;
  action: RecommendationAction;
  evidenceFingerprint: string;
  evidenceObservedAt: number;
  entityId?: string;
  count?: number;
  tone: RecommendationTone;
  guideId: RecommendationGuideId;
};

export function SmartRecommendationsPanel({
  layoutMode,
  status,
  primary,
  secondary,
  loadingRecommendationId,
  interactionLoadingKey,
  onOpen,
  onShowOptions,
  onRetry,
}: {
  layoutMode: DashboardLayoutMode;
  status: 'loading' | 'ready' | 'error';
  primary: DashboardRecommendation | null;
  secondary: DashboardRecommendation[];
  loadingRecommendationId?: string | null;
  interactionLoadingKey?: string | null;
  onOpen: (recommendation: DashboardRecommendation) => void;
  onShowOptions?: (recommendation: DashboardRecommendation) => void;
  onRetry?: () => void;
}) {
  if (status === 'loading') {
    return (
      <View
        accessibilityLabel="טוען פעולות מומלצות"
        style={styles.loadingState}
      >
        <View style={[styles.skeletonLine, styles.skeletonShort]} />
        <View style={[styles.skeletonLine, styles.skeletonLong]} />
        <View style={[styles.skeletonLine, styles.skeletonButton]} />
      </View>
    );
  }

  if (status === 'error') {
    return (
      <View style={styles.statusLine}>
        <Ionicons
          name="cloud-offline-outline"
          size={20}
          color={DASHBOARD_TOKENS.colors.textMuted}
        />
        <Text className={tw.textStart} style={styles.statusText}>
          לא הצלחנו לטעון את הפעולות כרגע.
        </Text>
        {onRetry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="ניסיון נוסף לטעינת הפעולות המומלצות"
            onPress={onRetry}
            style={styles.retryButton}
          >
            <Text style={styles.retryText}>ניסיון נוסף</Text>
          </Pressable>
        ) : null}
      </View>
    );
  }

  const visibleSecondary = secondary.slice(0, 2);
  if (!primary && visibleSecondary.length === 0) {
    return (
      <View style={styles.statusLine}>
        <Ionicons
          name="information-circle-outline"
          size={20}
          color={DASHBOARD_TOKENS.colors.textMuted}
        />
        <Text className={tw.textStart} style={styles.statusText}>
          אין כרגע פעולה שדורשת טיפול.
        </Text>
      </View>
    );
  }

  const isTablet = layoutMode === 'tablet';
  return (
    <View
      style={[
        styles.panel,
        isTablet ? styles.tabletPanel : styles.phonePanel,
      ]}
    >
      {primary ? (
        <View style={styles.primaryColumn}>
          <RecommendationActionCard
            category={primary.category}
            tone={primary.tone}
            title={primary.title}
            reason={primary.reason}
            ctaLabel={primary.ctaLabel}
            emphasis="primary"
            isLoading={loadingRecommendationId === primary.stableId}
            isInteractionLoading={
              interactionLoadingKey ===
              `${primary.stableId}:${primary.evidenceFingerprint}`
            }
            onPress={() => onOpen(primary)}
            onShowOptions={
              onShowOptions ? () => onShowOptions(primary) : undefined
            }
          />
        </View>
      ) : null}

      {visibleSecondary.length > 0 ? (
        <View
          style={[
            styles.secondaryColumn,
            !primary && isTablet ? styles.secondaryOnlyTablet : null,
          ]}
        >
          {visibleSecondary.map((recommendation) => (
            <RecommendationActionCard
              key={`${recommendation.stableId}:${recommendation.evidenceFingerprint}`}
              category={recommendation.category}
              tone={recommendation.tone}
              title={recommendation.title}
              reason={recommendation.reason}
              ctaLabel={recommendation.ctaLabel}
              emphasis="secondary"
              isLoading={
                loadingRecommendationId === recommendation.stableId
              }
              isInteractionLoading={
                interactionLoadingKey ===
                `${recommendation.stableId}:${recommendation.evidenceFingerprint}`
              }
              onPress={() => onOpen(recommendation)}
              onShowOptions={
                onShowOptions
                  ? () => onShowOptions(recommendation)
                  : undefined
              }
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    width: '100%',
    maxWidth: 920,
    alignSelf: 'center',
    gap: 12,
    ...rtlBaseView,
  },
  phonePanel: {
    flexDirection: 'column',
  },
  tabletPanel: {
    flexDirection: flexDirection.row,
    alignItems: 'stretch',
  },
  primaryColumn: {
    flex: 1.12,
    minWidth: 0,
    maxWidth: 520,
  },
  secondaryColumn: {
    flex: 0.88,
    minWidth: 0,
    maxWidth: 400,
    gap: 10,
  },
  secondaryOnlyTablet: {
    flex: 1,
    maxWidth: 620,
  },
  loadingState: {
    width: '100%',
    maxWidth: 920,
    height: 176,
    alignSelf: 'center',
    justifyContent: 'center',
    gap: 13,
    borderWidth: 1,
    borderColor: DASHBOARD_TOKENS.colors.border,
    borderRadius: DASHBOARD_TOKENS.cardRadiusLarge,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 18,
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
    backgroundColor: '#E2E8F0',
    alignSelf: selfStart,
  },
  skeletonShort: {
    width: '34%',
  },
  skeletonLong: {
    width: '76%',
  },
  skeletonButton: {
    width: 140,
    height: 46,
    borderRadius: 12,
  },
  statusLine: {
    width: '100%',
    maxWidth: 920,
    minHeight: 64,
    alignSelf: 'center',
    borderWidth: 1,
    borderColor: DASHBOARD_TOKENS.colors.border,
    borderRadius: DASHBOARD_TOKENS.cardRadius,
    backgroundColor: '#FFFFFF',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 14,
    ...rtlBaseView,
  },
  statusText: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '500',
    color: DASHBOARD_TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 10,
  },
  retryText: {
    fontSize: 13,
    lineHeight: 18,
    fontWeight: '800',
    color: DASHBOARD_TOKENS.colors.brandBlue,
  },
});
