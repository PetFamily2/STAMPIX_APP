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

export type RecommendationPendingActions = Readonly<
  Record<string, 'open' | 'snooze' | 'dismiss' | undefined>
>;

export function getDashboardRecommendationKey(
  recommendation: Pick<
    DashboardRecommendation,
    'stableId' | 'evidenceFingerprint'
  >
) {
  return `${recommendation.stableId}:${recommendation.evidenceFingerprint}`;
}

export function SmartRecommendationsPanel({
  layoutMode,
  status,
  primary,
  secondary,
  pendingActions,
  onOpen,
  onSnooze,
  onDismiss,
  onRetry,
}: {
  layoutMode: DashboardLayoutMode;
  status: 'loading' | 'ready' | 'error';
  primary: DashboardRecommendation | null;
  secondary: DashboardRecommendation[];
  pendingActions?: RecommendationPendingActions;
  onOpen: (recommendation: DashboardRecommendation) => void;
  onSnooze: (recommendation: DashboardRecommendation) => void;
  onDismiss: (recommendation: DashboardRecommendation) => void;
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
  const primaryKey = primary ? getDashboardRecommendationKey(primary) : null;
  const primaryPendingAction = primaryKey
    ? pendingActions?.[primaryKey]
    : undefined;
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
            isOpening={primaryPendingAction === 'open'}
            isSnoozing={primaryPendingAction === 'snooze'}
            isDismissing={primaryPendingAction === 'dismiss'}
            onOpen={() => onOpen(primary)}
            onSnooze={() => onSnooze(primary)}
            onDismiss={() => onDismiss(primary)}
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
          {visibleSecondary.map((recommendation) => {
            const recommendationKey =
              getDashboardRecommendationKey(recommendation);
            const recommendationPendingAction =
              pendingActions?.[recommendationKey];
            return (
              <RecommendationActionCard
                key={recommendationKey}
                category={recommendation.category}
                tone={recommendation.tone}
                title={recommendation.title}
                reason={recommendation.reason}
                ctaLabel={recommendation.ctaLabel}
                emphasis="secondary"
                isOpening={recommendationPendingAction === 'open'}
                isSnoozing={recommendationPendingAction === 'snooze'}
                isDismissing={recommendationPendingAction === 'dismiss'}
                onOpen={() => onOpen(recommendation)}
                onSnooze={() => onSnooze(recommendation)}
                onDismiss={() => onDismiss(recommendation)}
              />
            );
          })}
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
    height: 132,
    alignSelf: 'center',
    justifyContent: 'center',
    gap: 10,
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
