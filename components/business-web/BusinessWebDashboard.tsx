import { useQuery } from 'convex/react';
import { Building2, CircleAlert } from 'lucide-react-native';
import { Component, type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BusinessWebRecommendation } from '@/components/business-web/BusinessWebRecommendation';
import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getBusinessWebResponsiveLayout } from '@/lib/design/businessWebResponsive';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import {
  ltrIslandText,
  alignItems as rtlAlign,
  rtlBaseText,
  flexDirection as rtlFlex,
  justifyContent as rtlJustify,
} from '@/lib/rtl';

type BusinessWebDashboardProps = {
  activeBusinessId: Id<'businesses'>;
  businessName: string;
  isInteractionCurrent: (businessId: string) => boolean;
  isSwitchingBusiness: boolean;
};

const NUMBER_FORMATTER = new Intl.NumberFormat('he-IL');
const DASHBOARD_TITLE = 'היום';
const STAMP_PERIOD_LABEL = 'חותמות ב־30 הימים האחרונים';
const REDEMPTION_PERIOD_LABEL = 'ב־30 הימים האחרונים';
const ACTIVE_CUSTOMERS_PERIOD = 'פעילים ב־30 הימים האחרונים';
const AT_RISK_PERIOD = 'לפי דפוס הפעילות';
const MEMBER_PERIOD_LABEL = 'הצטרפו עד היום';
const SHELL_CONTENT_PADDING = 16;
const SHELL_CONTENT_BOTTOM = 28;

function activityLabel(type: string, detail: string) {
  if (type === 'reward') {
    return 'מימוש';
  }
  if (type === 'punch') {
    return 'חותמת';
  }
  return detail;
}

function DashboardSkeleton() {
  return (
    <View
      accessibilityLabel="טוענים את נתוני לוח הבקרה"
      aria-busy={true}
      role="status"
      style={styles.page}
    >
      <View style={styles.hero}>
        <View style={[styles.skeleton, styles.skeletonLine]} />
        <View style={[styles.skeleton, styles.skeletonNumber]} />
      </View>
    </View>
  );
}

function BusinessWebDashboardContent({
  activeBusinessId,
  businessName,
  isInteractionCurrent,
  isSwitchingBusiness,
}: BusinessWebDashboardProps) {
  const { width } = useWindowDimensions();
  const layout = getBusinessWebResponsiveLayout(width);
  const isDesktop = layout.composition === 'desktop';
  const narrow = layout.composition === 'narrow-mobile';
  const metricsInOneRow =
    layout.composition === 'tablet' || layout.composition === 'desktop';
  const [periodAnchor] = useState(() => Date.now());
  const dashboardSummary = useQuery(api.dashboard.getBusinessDashboardSummary, {
    businessId: activeBusinessId,
  });
  const dashboardPeriod = useQuery(api.dashboard.getBusinessDashboardDay, {
    businessId: activeBusinessId,
    dayStart: periodAnchor,
    rangeDays: 30,
  });
  const recentActivity = useQuery(api.events.getRecentActivity, {
    businessId: activeBusinessId,
    limit: 6,
  });

  if (
    isSwitchingBusiness ||
    dashboardSummary === undefined ||
    dashboardPeriod === undefined ||
    recentActivity === undefined
  ) {
    return <DashboardSkeleton />;
  }

  const summaryMatches =
    dashboardSummary !== null &&
    dashboardSummary.businessId === activeBusinessId;
  const periodMatches =
    dashboardPeriod !== null && dashboardPeriod.businessId === activeBusinessId;
  if (!summaryMatches || !periodMatches) {
    return (
      <View style={styles.page}>
        <Text style={styles.mismatch}>הנתונים אינם תואמים לעסק הפעיל.</Text>
      </View>
    );
  }

  const inset = isDesktop ? 20 : narrow ? 10 : 12;
  const metrics = (
    <View style={[styles.metrics, { marginHorizontal: inset }]}>
      <Metric
        bottomBorder={!metricsInOneRow}
        endBorder={true}
        label="מימושים"
        oneRow={metricsInOneRow}
        period={REDEMPTION_PERIOD_LABEL}
        value={dashboardPeriod.kpis.redemptions.value}
      />
      <Metric
        bottomBorder={!metricsInOneRow}
        endBorder={metricsInOneRow}
        label="לקוחות פעילים"
        oneRow={metricsInOneRow}
        period={ACTIVE_CUSTOMERS_PERIOD}
        value={dashboardPeriod.kpis.activeCustomers}
      />
      <Metric
        endBorder={true}
        label="חברי מועדון"
        oneRow={metricsInOneRow}
        period={MEMBER_PERIOD_LABEL}
        value={dashboardSummary.lifetimeMetrics.totalCustomersJoinedAllTime}
      />
      <Metric
        label="דורשים תשומת לב"
        oneRow={metricsInOneRow}
        period={AT_RISK_PERIOD}
        value={dashboardPeriod.kpis.atRiskCustomers}
      />
    </View>
  );
  const recommendation = (
    <View
      style={
        isDesktop
          ? styles.desktopPrimary
          : { marginHorizontal: inset, marginTop: -16 }
      }
    >
      <BusinessWebRecommendation
        activeBusinessId={activeBusinessId}
        isInteractionCurrent={isInteractionCurrent}
        narrow={narrow}
      />
    </View>
  );
  const activity = (
    <View
      style={[
        styles.activity,
        isDesktop ? styles.activityDesktop : { marginHorizontal: inset },
      ]}
    >
      <Text style={styles.sectionTitle}>פעילות אחרונה</Text>
      {recentActivity.length === 0 ? (
        <Text style={styles.emptyActivity}>עדיין אין פעילות להצגה</Text>
      ) : (
        recentActivity.map((item) => (
          <View key={String(item.id)} style={styles.activityRow}>
            <View style={styles.activityMain}>
              <Text numberOfLines={1} style={styles.activityName}>
                {item.customer}
              </Text>
              <Text numberOfLines={1} style={styles.activityKind}>
                {activityLabel(item.type, item.detail)}
              </Text>
            </View>
            <Text style={styles.activityTime}>{item.time}</Text>
          </View>
        ))
      )}
    </View>
  );

  return (
    <View
      style={[
        styles.page,
        {
          marginTop: -layout.pageTopPadding,
          marginHorizontal: -SHELL_CONTENT_PADDING,
          marginBottom: -SHELL_CONTENT_BOTTOM,
        },
      ]}
    >
      <View
        style={[
          styles.hero,
          narrow ? styles.heroNarrow : null,
          metricsInOneRow && !isDesktop ? styles.heroWide : null,
          isDesktop ? styles.heroDesktop : null,
        ]}
      >
        <Text numberOfLines={2} style={styles.kicker}>
          {businessName}
        </Text>
        <Text
          accessibilityRole="header"
          aria-level={1}
          style={[styles.pageTitle, narrow ? styles.pageTitleNarrow : null]}
        >
          {DASHBOARD_TITLE}
        </Text>
        <View style={styles.heroRow}>
          <View style={styles.heroCopy}>
            <Text
              style={[
                styles.heroNumber,
                narrow ? styles.heroNumberNarrow : null,
                metricsInOneRow ? styles.heroNumberWide : null,
              ]}
            >
              {NUMBER_FORMATTER.format(dashboardPeriod.kpis.stamps.value)}
            </Text>
            <Text style={styles.heroCaption}>{STAMP_PERIOD_LABEL}</Text>
          </View>
          <View
            accessibilityElementsHidden={true}
            importantForAccessibility="no-hide-descendants"
            style={styles.motif}
          >
            <View style={styles.motifDot} />
            <View style={styles.motifDot} />
            <View style={styles.motifDot} />
            <View style={styles.motifDot} />
          </View>
        </View>
      </View>
      {isDesktop ? (
        <>
          {metrics}
          <View style={styles.desktopSplit}>
            {recommendation}
            {activity}
          </View>
        </>
      ) : (
        <>
          {recommendation}
          {metrics}
          {activity}
        </>
      )}
    </View>
  );
}

function Metric({
  bottomBorder = false,
  endBorder = false,
  label,
  oneRow,
  period,
  value,
}: {
  bottomBorder?: boolean;
  endBorder?: boolean;
  label: string;
  oneRow: boolean;
  period: string;
  value: number;
}) {
  return (
    <View
      style={[
        styles.metric,
        oneRow ? styles.metricRow : styles.metricPair,
        endBorder ? styles.metricEnd : null,
        bottomBorder ? styles.metricBottom : null,
      ]}
    >
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{NUMBER_FORMATTER.format(value)}</Text>
      <Text style={styles.metricPeriod}>{period}</Text>
    </View>
  );
}

class DashboardErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }
    return (
      <View style={styles.errorState}>
        <CircleAlert color={TOKENS.colors.danger} size={24} />
        <Text style={styles.errorTitle}>לא הצלחנו לטעון את לוח הבקרה</Text>
        <Text style={styles.errorBody}>בדקו את החיבור ונסו שוב בעוד רגע.</Text>
        <Pressable
          accessibilityLabel="ניסיון טעינה מחדש"
          accessibilityRole="button"
          onPress={() => this.setState({ error: null })}
          style={styles.retryButton}
        >
          <Text style={styles.retryButtonText}>לנסות שוב</Text>
        </Pressable>
      </View>
    );
  }
}

export function BusinessWebDashboard(props: BusinessWebDashboardProps) {
  return (
    <DashboardErrorBoundary>
      <BusinessWebDashboardContent {...props} />
    </DashboardErrorBoundary>
  );
}

export function BusinessWebNoBusiness() {
  return (
    <View style={styles.emptyDashboard}>
      <Building2 color={TOKENS.colors.primary} size={24} strokeWidth={1.75} />
      <Text style={styles.emptyTitle}>אין עסק מחובר לחשבון</Text>
      <Text style={styles.emptyBody}>
        לאחר שיוך החשבון לעסק, נתוני לוח הבקרה יופיעו כאן.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    width: '100%',
    minHeight: 72,
    backgroundColor: '#F4F6FA',
    paddingBottom: 20,
  },
  hero: {
    backgroundColor: '#101936',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 26,
  },
  heroNarrow: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 22 },
  heroWide: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 28 },
  heroDesktop: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 18,
  },
  kicker: { ...rtlBaseText, color: '#C5CEDD', fontSize: 12, fontWeight: '500' },
  pageTitle: {
    ...rtlBaseText,
    color: '#F4F1E8',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
  },
  pageTitleNarrow: { fontSize: 20, lineHeight: 26 },
  heroRow: {
    alignItems: rtlAlign.start,
    flexDirection: rtlFlex.row,
    justifyContent: rtlJustify.between,
    marginTop: 10,
    gap: 12,
  },
  heroCopy: { flex: 1, minWidth: 0 },
  heroNumber: {
    ...rtlBaseText,
    color: '#F4F1E8',
    fontSize: 52,
    fontWeight: '600',
    lineHeight: 52,
  },
  heroNumberNarrow: { fontSize: 44, lineHeight: 44 },
  heroNumberWide: { fontSize: 64, lineHeight: 64 },
  heroCaption: {
    ...rtlBaseText,
    color: '#D5DCEC',
    fontSize: 13,
    lineHeight: 18,
  },
  motif: {
    alignItems: 'center',
    flexDirection: rtlFlex.row,
    gap: 6,
    paddingBottom: 8,
  },
  motifDot: {
    borderColor: '#8EA0C8',
    borderRadius: 999,
    borderWidth: 1.5,
    height: 10,
    width: 10,
  },
  metrics: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: '#E3E8F0',
    borderRadius: 16,
    borderWidth: 1,
    flexDirection: rtlFlex.row,
    flexWrap: 'wrap',
    marginTop: 14,
    overflow: 'hidden',
  },
  metric: { minWidth: 0, padding: 12 },
  metricPair: { flexBasis: '50%', flexGrow: 1 },
  metricRow: { flexBasis: '25%', flexGrow: 1 },
  metricEnd: { borderLeftWidth: 1, borderLeftColor: '#E3E8F0' },
  metricBottom: { borderBottomWidth: 1, borderBottomColor: '#E3E8F0' },
  metricLabel: {
    ...rtlBaseText,
    color: '#5C6778',
    fontSize: 12,
    fontWeight: '500',
    lineHeight: 16,
  },
  metricValue: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
  },
  metricPeriod: {
    ...rtlBaseText,
    color: '#7B8798',
    fontSize: 11,
    lineHeight: 15,
  },
  activity: { marginTop: 16, marginBottom: 20 },
  activityDesktop: { flex: 0.85, marginTop: 0, marginBottom: 0, minWidth: 0 },
  sectionTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 4,
  },
  activityRow: {
    alignItems: 'baseline',
    borderTopColor: '#E3E8F0',
    borderTopWidth: 1,
    flexDirection: rtlFlex.row,
    gap: 10,
    justifyContent: rtlJustify.between,
    paddingVertical: 9,
  },
  activityMain: {
    alignItems: 'baseline',
    flexDirection: rtlFlex.row,
    flex: 1,
    gap: 6,
    minWidth: 0,
  },
  activityName: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    flexShrink: 1,
    fontSize: 14,
    fontWeight: '600',
  },
  activityKind: {
    ...rtlBaseText,
    color: '#5C6778',
    flexShrink: 0,
    fontSize: 13,
  },
  activityTime: {
    ...ltrIslandText,
    color: '#7B8798',
    flexShrink: 0,
    fontSize: 12,
  },
  emptyActivity: { ...rtlBaseText, color: '#5C6778', fontSize: 14 },
  desktopSplit: {
    alignItems: rtlAlign.end,
    flexDirection: rtlFlex.row,
    gap: 16,
    marginHorizontal: 20,
    marginTop: 16,
  },
  desktopPrimary: { flex: 1.15, minWidth: 0 },
  skeleton: { backgroundColor: '#243056', borderRadius: 8 },
  skeletonLine: { height: 16, width: 120 },
  skeletonNumber: { height: 48, marginTop: 12, width: 80 },
  mismatch: { ...rtlBaseText, color: '#5C6778', fontSize: 14, margin: 16 },
  emptyDashboard: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: '#E3E8F0',
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    margin: 16,
    padding: 18,
  },
  emptyTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  emptyBody: { ...rtlBaseText, color: '#5C6778', fontSize: 14, lineHeight: 21 },
  errorState: {
    alignItems: 'center',
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: '#FECACA',
    borderRadius: 16,
    borderWidth: 1,
    gap: 8,
    margin: 16,
    padding: 18,
  },
  errorTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  errorBody: { ...rtlBaseText, color: '#5C6778', fontSize: 14 },
  retryButton: {
    backgroundColor: TOKENS.colors.primary,
    borderRadius: 12,
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
