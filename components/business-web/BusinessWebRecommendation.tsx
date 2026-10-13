import { useMutation, useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { CircleAlert, Stamp } from 'lucide-react-native';
import {
  Component,
  type ReactNode,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';
import { StyleSheet, View } from 'react-native';
import {
  type DashboardRecommendation,
  getDashboardRecommendationKey,
} from '@/components/business-dashboard/SmartRecommendationsPanel';
import { PwaButton } from '@/components/pwa-ui/PwaButton';
import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { Alert } from '@/lib/alert';
import { track } from '@/lib/analytics';
import { ANALYTICS_EVENTS } from '@/lib/analytics/events';
import { isRecommendationResponseForActiveBusiness } from '@/lib/dashboardBusinessIntegrity';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import {
  createRecommendationShownGuard,
  getRecommendationAnalyticsProps,
  safelyTrackRecommendationEvent,
} from '@/lib/recommendations/analytics';
import {
  type CurrentRecommendationInteractionState,
  executeCurrentRecommendationInteraction,
  isRecommendationInteractionRequestCurrent,
  openRecommendationAction,
} from '@/lib/recommendations/interaction';
import { getRecommendationVisualCtaLabel } from '@/lib/recommendations/presentation';
import {
  claimRecommendationAction,
  EMPTY_RECOMMENDATION_LABEL,
  isSubscriptionBlockerRecommendation,
  isUrgentRuleRecommendation,
  selectWebDashboardRecommendation,
  type WebDashboardRecommendationChoice,
} from '@/lib/recommendations/webDashboardSelection';
import {
  webHrefFromRecommendationTarget,
  webHrefFromStoredRecommendationResult,
} from '@/lib/recommendations/webRecommendationRoutes';
import {
  rtlBaseText,
  flexDirection as rtlFlex,
  justifyContent as rtlJustify,
} from '@/lib/rtl';

type StoredRecommendation = {
  recommendationId: Id<'aiRecommendations'>;
  source: string;
  title: string;
  body: string;
  ctaLabel: string;
  primaryCta?: { kind: string; label?: string } | null;
  showNoCtaReason?: boolean;
};

type RuleState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'mismatch' }
  | {
      status: 'ready';
      primary: DashboardRecommendation | null;
      responseBusinessId: string;
    };

type StoredState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; row: StoredRecommendation | null };

function isStoredActionable(stored: StoredRecommendation | null) {
  const kind = stored?.primaryCta?.kind;
  const label = stored?.primaryCta?.label || stored?.ctaLabel;
  return Boolean(
    stored &&
      stored.title.trim().length > 0 &&
      label &&
      label.trim().length > 0 &&
      kind &&
      (kind === 'open_campaign_draft' ||
        kind === 'view_customers' ||
        kind === 'view_analytics' ||
        kind === 'open_cards' ||
        kind === 'open_profile' ||
        kind === 'view_subscription') &&
      !stored.showNoCtaReason
  );
}

export function BusinessWebRecommendation({
  activeBusinessId,
  isInteractionCurrent,
  narrow,
}: {
  activeBusinessId: Id<'businesses'>;
  isInteractionCurrent: (businessId: string) => boolean;
  narrow: boolean;
}) {
  return (
    <RecommendationErrorBoundary key={String(activeBusinessId)}>
      <RecommendationBody
        activeBusinessId={activeBusinessId}
        isInteractionCurrent={isInteractionCurrent}
        narrow={narrow}
      />
    </RecommendationErrorBoundary>
  );
}

function RecommendationBody({
  activeBusinessId,
  isInteractionCurrent,
  narrow,
}: {
  activeBusinessId: Id<'businesses'>;
  isInteractionCurrent: (businessId: string) => boolean;
  narrow: boolean;
}) {
  const router = useRouter();
  const mountedRef = useRef(true);
  const inFlight = useRef(new Set<string>());
  const shownGuard = useRef(createRecommendationShownGuard());
  const activeBusinessRef = useRef(String(activeBusinessId));
  const interactionRef = useRef<CurrentRecommendationInteractionState>({
    activeBusinessId: String(activeBusinessId),
    isSwitchingBusiness: false,
    responseBusinessId: null,
    visibleRecommendations: [],
  });
  const [epoch, setEpoch] = useState(0);
  const [pendingKey, setPendingKey] = useState<string | null>(null);
  const [rule, setRule] = useState<RuleState>({ status: 'loading' });
  const [stored, setStored] = useState<StoredState>({ status: 'loading' });
  const reportRule = useCallback((next: RuleState) => {
    setRule(next);
  }, []);
  const reportStored = useCallback((next: StoredState) => {
    setStored(next);
  }, []);
  const reportRuleError = useCallback(() => {
    setRule({ status: 'error' });
  }, []);
  const reportStoredError = useCallback(() => {
    setStored({ status: 'error' });
  }, []);
  activeBusinessRef.current = String(activeBusinessId);
  const rulePrimary = rule.status === 'ready' ? rule.primary : null;
  interactionRef.current = {
    activeBusinessId: String(activeBusinessId),
    isSwitchingBusiness: false,
    responseBusinessId:
      rule.status === 'ready' ? rule.responseBusinessId : null,
    visibleRecommendations: rulePrimary
      ? [
          {
            stableId: rulePrimary.stableId,
            evidenceFingerprint: rulePrimary.evidenceFingerprint,
            guideId: rulePrimary.guideId,
            entityId: rulePrimary.entityId,
          },
        ]
      : [],
  };

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const startRecommendationGuide = useMutation(
    api.recommendations.startBusinessRecommendationGuide
  );
  const snoozeRecommendation = useMutation(
    api.recommendations.snoozeBusinessRecommendation
  );
  const executeStoredCta = useMutation(
    api.aiRecommendations.executeRecommendationPrimaryCta
  );

  const retry = () => {
    setRule({ status: 'loading' });
    setStored({ status: 'loading' });
    setEpoch((current) => current + 1);
  };

  const choice = resolveChoice(rule, stored);
  const shownRule = choice?.kind === 'rule' ? rulePrimary : null;

  useEffect(() => {
    if (!shownRule) {
      return;
    }
    if (
      shownGuard.current.shouldTrack({
        businessId: String(activeBusinessId),
        stableId: shownRule.stableId,
        evidenceFingerprint: shownRule.evidenceFingerprint,
      })
    ) {
      safelyTrackRecommendationEvent(
        track,
        ANALYTICS_EVENTS.recommendationShown,
        getRecommendationAnalyticsProps(shownRule)
      );
    }
  }, [activeBusinessId, shownRule]);

  const openRule = async () => {
    if (!rulePrimary) {
      return;
    }
    const recommendation = rulePrimary;
    const openedBusinessId = String(activeBusinessId);
    const request = {
      businessId: openedBusinessId,
      stableId: recommendation.stableId,
      evidenceFingerprint: recommendation.evidenceFingerprint,
      guideId: recommendation.guideId,
      ...(recommendation.entityId ? { entityId: recommendation.entityId } : {}),
    };
    if (
      !isRecommendationInteractionRequestCurrent(
        request,
        interactionRef.current
      )
    ) {
      Alert.alert('', 'ההמלצה כבר התעדכנה.');
      return;
    }
    const key = getDashboardRecommendationKey(recommendation);
    if (!claimRecommendationAction(inFlight.current, key)) {
      return;
    }
    setPendingKey(key);
    try {
      const session = await startRecommendationGuide({
        businessId: activeBusinessId,
        stableId: recommendation.stableId,
        guideId: recommendation.guideId,
        evidenceFingerprint: recommendation.evidenceFingerprint,
      });
      const sessionMatches =
        String(session.businessId) === openedBusinessId &&
        session.stableId === recommendation.stableId &&
        session.guideId === recommendation.guideId &&
        session.evidenceFingerprint === recommendation.evidenceFingerprint &&
        String(session.entityId ?? '') ===
          String(recommendation.entityId ?? '') &&
        typeof session.guideSessionId === 'string' &&
        session.guideSessionId.length > 0 &&
        session.expiresAt > Date.now();
      if (
        !mountedRef.current ||
        activeBusinessRef.current !== openedBusinessId ||
        !sessionMatches ||
        !isRecommendationInteractionRequestCurrent(
          request,
          interactionRef.current
        )
      ) {
        throw new Error('STALE_RECOMMENDATION_GUIDE');
      }
      const result = openRecommendationAction({
        businessId: openedBusinessId,
        action: session.action,
        guideSessionId: session.guideSessionId,
        guideId: session.guideId,
        stableId: session.stableId,
        evidenceFingerprint: session.evidenceFingerprint,
        entityId: session.entityId,
        analyticsProps: getRecommendationAnalyticsProps(recommendation),
        trackEvent: track,
        navigate: (target) => {
          if (
            !mountedRef.current ||
            activeBusinessRef.current !== openedBusinessId ||
            !isInteractionCurrent(openedBusinessId)
          ) {
            throw new Error('STALE_RECOMMENDATION_GUIDE');
          }
          const href = webHrefFromRecommendationTarget(target);
          if (!href) {
            throw new Error('UNSUPPORTED_WEB_DESTINATION');
          }
          router.push(href);
        },
      });
      if (!result.ok) {
        throw new Error(`INVALID_RECOMMENDATION_NAVIGATION:${result.reason}`);
      }
    } catch (error) {
      if (!mountedRef.current) {
        return;
      }
      const serialized = error instanceof Error ? error.message : String(error);
      if (
        serialized.includes('STALE_RECOMMENDATION_GUIDE') ||
        serialized.includes('RECOMMENDATION_NOT_ACTIONABLE')
      ) {
        Alert.alert('', 'ההמלצה כבר התעדכנה. נסו שוב.');
      } else {
        Alert.alert(
          'לא הצלחנו לפתוח את הפעולה',
          'ההמלצה נשארה זמינה. נסו שוב.'
        );
      }
    } finally {
      inFlight.current.delete(key);
      if (mountedRef.current) {
        setPendingKey(null);
      }
    }
  };

  const snoozeRule = () => {
    if (!rulePrimary) {
      return;
    }
    const recommendation = rulePrimary;
    const key = getDashboardRecommendationKey(recommendation);
    if (!claimRecommendationAction(inFlight.current, key)) {
      return;
    }
    setPendingKey(key);
    const openedBusinessId = String(activeBusinessId);
    void executeCurrentRecommendationInteraction({
      request: {
        businessId: openedBusinessId,
        stableId: recommendation.stableId,
        evidenceFingerprint: recommendation.evidenceFingerprint,
        guideId: recommendation.guideId,
        ...(recommendation.entityId
          ? { entityId: recommendation.entityId }
          : {}),
      },
      getCurrentState: () => interactionRef.current,
      mutate: async () =>
        await snoozeRecommendation({
          businessId: activeBusinessId,
          stableId: recommendation.stableId,
          evidenceFingerprint: recommendation.evidenceFingerprint,
        }),
      onSuccess: (result) => {
        safelyTrackRecommendationEvent(
          track,
          ANALYTICS_EVENTS.recommendationSnoozed,
          {
            ...getRecommendationAnalyticsProps(recommendation),
            reason_code: result.reasonCode,
          }
        );
      },
      onStale: () => {
        Alert.alert('', 'ההמלצה כבר התעדכנה.');
      },
      onError: () => {
        Alert.alert('לא הצלחנו לעדכן', 'ההמלצה נשארה מוצגת. נסו שוב.');
      },
      onSettled: () => {
        inFlight.current.delete(key);
        if (mountedRef.current) {
          setPendingKey(null);
        }
      },
    });
  };

  const openStored = async () => {
    if (
      stored.status !== 'ready' ||
      !isStoredActionable(stored.row) ||
      !stored.row
    ) {
      return;
    }
    const row = stored.row;
    const key = String(row.recommendationId);
    if (!claimRecommendationAction(inFlight.current, key)) {
      return;
    }
    setPendingKey(key);
    const openedBusinessId = String(activeBusinessId);
    try {
      const result = await executeStoredCta({
        businessId: activeBusinessId,
        recommendationId: row.recommendationId,
      });
      if (
        !mountedRef.current ||
        activeBusinessRef.current !== openedBusinessId ||
        !isInteractionCurrent(openedBusinessId)
      ) {
        return;
      }
      const href = webHrefFromStoredRecommendationResult(result);
      if (!href) {
        Alert.alert('אין יעד לפעולה הזו', 'הפעולה לא פתחה מסך.');
        return;
      }
      router.push(href);
    } catch {
      if (mountedRef.current) {
        Alert.alert('לא הצלחנו לפתוח את הפעולה', 'נסו שוב.');
      }
    } finally {
      inFlight.current.delete(key);
      if (mountedRef.current) {
        setPendingKey(null);
      }
    }
  };

  const subscriptionAlert =
    choice?.kind === 'rule' && isSubscriptionBlockerRecommendation(rulePrimary);

  return (
    <View style={[styles.card, subscriptionAlert ? styles.cardAlert : null]}>
      <QueryBoundary epoch={epoch} onError={reportRuleError}>
        <RuleProbe activeBusinessId={activeBusinessId} onReady={reportRule} />
      </QueryBoundary>
      <QueryBoundary epoch={epoch} onError={reportStoredError}>
        <StoredProbe
          activeBusinessId={activeBusinessId}
          onReady={reportStored}
        />
      </QueryBoundary>
      {choice == null ? (
        rule.status === 'error' ||
        (rule.status === 'ready' &&
          stored.status === 'error' &&
          !isUrgentRuleRecommendation(rule.primary)) ? (
          <RecommendationProblem onRetry={retry} />
        ) : rule.status === 'mismatch' ? (
          <Text style={styles.empty}>ממתינים לנתוני העסק הפעיל.</Text>
        ) : (
          <View accessibilityLabel="טוען המלצה" style={styles.skeleton} />
        )
      ) : (
        <RecommendationCopy
          alert={subscriptionAlert}
          busy={pendingKey != null}
          choice={choice}
          narrow={narrow}
          onOpen={() => {
            if (choice.kind === 'rule') {
              void openRule();
              return;
            }
            if (choice.kind === 'stored-ai' || choice.kind === 'stored-saved') {
              void openStored();
            }
          }}
          onSnooze={snoozeRule}
          stored={stored.status === 'ready' ? stored.row : null}
          rule={rulePrimary}
        />
      )}
    </View>
  );
}

function resolveChoice(
  rule: RuleState,
  stored: StoredState
): WebDashboardRecommendationChoice | null {
  if (rule.status === 'error') {
    return null;
  }
  if (rule.status === 'loading' || rule.status === 'mismatch') {
    return null;
  }
  if (stored.status === 'loading') {
    return null;
  }
  if (stored.status === 'error' && !isUrgentRuleRecommendation(rule.primary)) {
    return null;
  }
  const storedRow = stored.status === 'ready' ? stored.row : null;
  return selectWebDashboardRecommendation({
    rulePrimary: rule.primary ? { priority: rule.primary.priority } : null,
    stored: storedRow
      ? { source: storedRow.source, actionable: isStoredActionable(storedRow) }
      : null,
  });
}

function RecommendationCopy({
  alert = false,
  busy,
  choice,
  narrow,
  onOpen,
  onSnooze,
  rule,
  stored,
}: {
  alert?: boolean;
  busy: boolean;
  choice: WebDashboardRecommendationChoice;
  narrow: boolean;
  onOpen: () => void;
  onSnooze: () => void;
  rule: DashboardRecommendation | null;
  stored: StoredRecommendation | null;
}) {
  const title = choice.kind === 'rule' ? rule?.title : stored?.title;
  const body = choice.kind === 'rule' ? rule?.reason : stored?.body;
  const recordLabel =
    choice.kind === 'rule'
      ? rule?.ctaLabel
      : stored?.primaryCta?.label || stored?.ctaLabel;
  const visualLabel =
    choice.kind === 'rule' && rule
      ? getRecommendationVisualCtaLabel(rule.action)
      : recordLabel;
  return (
    <>
      <View style={styles.head}>
        <View style={styles.cue}>
          {alert ? (
            <CircleAlert
              color={TOKENS.colors.warning}
              size={14}
              strokeWidth={1.75}
            />
          ) : (
            <Stamp color={TOKENS.colors.primary} size={14} strokeWidth={1.75} />
          )}
          <Text style={[styles.cueText, alert ? styles.cueAlert : null]}>
            {alert ? 'נדרש טיפול' : 'StampAix ממליץ'}
          </Text>
        </View>
        {choice.kind === 'empty' ? null : (
          <Text
            style={[
              styles.chip,
              choice.kind === 'rule' ? styles.chipRule : null,
              choice.kind === 'stored-saved' ? styles.chipSaved : null,
            ]}
          >
            {choice.label}
          </Text>
        )}
      </View>
      {choice.kind === 'empty' ? (
        <Text style={styles.empty}>{EMPTY_RECOMMENDATION_LABEL}</Text>
      ) : (
        <>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.body}>{body}</Text>
          <View style={[styles.actions, narrow ? styles.actionsNarrow : null]}>
            {visualLabel ? (
              <PwaButton
                accessibilityLabel={recordLabel || visualLabel}
                disabled={busy}
                fullWidth={narrow}
                label={visualLabel}
                loading={busy}
                onPress={onOpen}
              />
            ) : null}
            {choice.kind === 'rule' ? (
              <PwaButton
                disabled={busy}
                label="אחר כך"
                onPress={onSnooze}
                variant="quiet"
              />
            ) : null}
          </View>
        </>
      )}
    </>
  );
}

function RecommendationProblem({ onRetry }: { onRetry: () => void }) {
  return (
    <>
      <Text style={styles.title}>לא הצלחנו לטעון את ההמלצה</Text>
      <PwaButton label="נסו שוב" onPress={onRetry} />
    </>
  );
}

function RuleProbe({
  activeBusinessId,
  onReady,
}: {
  activeBusinessId: Id<'businesses'>;
  onReady: (next: RuleState) => void;
}) {
  const response = useQuery(api.recommendations.getBusinessRecommendations, {
    businessId: activeBusinessId,
  });
  useEffect(() => {
    if (response == null) {
      onReady(
        response === undefined ? { status: 'loading' } : { status: 'mismatch' }
      );
      return;
    }
    if (
      !isRecommendationResponseForActiveBusiness({
        responseBusinessId: response.businessId,
        activeBusinessId,
        isSwitchingBusiness: false,
      })
    ) {
      onReady({ status: 'mismatch' });
      return;
    }
    onReady({
      status: 'ready',
      primary: (response.primary ?? null) as DashboardRecommendation | null,
      responseBusinessId: String(response.businessId),
    });
  }, [activeBusinessId, onReady, response]);
  return null;
}

function StoredProbe({
  activeBusinessId,
  onReady,
}: {
  activeBusinessId: Id<'businesses'>;
  onReady: (next: StoredState) => void;
}) {
  const response = useQuery(
    api.aiRecommendations.getLatestRecommendationForBusiness,
    { businessId: activeBusinessId }
  );
  useEffect(() => {
    if (response === undefined) {
      onReady({ status: 'loading' });
      return;
    }
    onReady({
      status: 'ready',
      row: response as StoredRecommendation | null,
    });
  }, [onReady, response]);
  return null;
}

class QueryBoundary extends Component<
  { children: ReactNode; epoch: number; onError: () => void },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch() {
    this.props.onError();
  }

  componentDidUpdate(previous: { epoch: number }) {
    if (previous.epoch !== this.props.epoch && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) {
      return null;
    }
    return this.props.children;
  }
}

class RecommendationErrorBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    if (!this.state.failed) {
      return this.props.children;
    }
    return (
      <View style={styles.card}>
        <RecommendationProblem
          onRetry={() => this.setState({ failed: false })}
        />
      </View>
    );
  }
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: '#E3E8F0',
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    padding: 14,
  },
  cardAlert: {
    backgroundColor: TOKENS.colors.warningSubtle,
    borderColor: '#F0C08A',
  },
  head: {
    alignItems: 'center',
    flexDirection: rtlFlex.row,
    gap: 8,
    justifyContent: rtlJustify.between,
  },
  cue: { alignItems: 'center', flexDirection: rtlFlex.row, gap: 6 },
  cueText: {
    ...rtlBaseText,
    color: TOKENS.colors.primary,
    fontSize: 13,
    fontWeight: '600',
  },
  cueAlert: { color: TOKENS.colors.warning },
  chip: {
    ...rtlBaseText,
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: 999,
    color: TOKENS.colors.primary,
    fontSize: 11,
    fontWeight: '600',
    overflow: 'hidden',
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  chipRule: { backgroundColor: '#E8F6EF', color: '#1F6B4A' },
  chipSaved: { backgroundColor: '#FFF6E8', color: '#8A5A12' },
  title: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  body: { ...rtlBaseText, color: '#3E4A5C', fontSize: 14, lineHeight: 21 },
  empty: { ...rtlBaseText, color: '#5C6778', fontSize: 14, lineHeight: 21 },
  actions: { flexDirection: rtlFlex.row, gap: 8, marginTop: 4 },
  actionsNarrow: { flexDirection: rtlFlex.col },
  skeleton: {
    backgroundColor: '#E6EAF2',
    borderRadius: 8,
    height: 18,
    width: '70%',
  },
});
