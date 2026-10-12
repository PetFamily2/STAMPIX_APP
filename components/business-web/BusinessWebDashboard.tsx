import { useQuery } from 'convex/react';
import {
  Building2,
  CircleAlert,
  Gift,
  Stamp,
  Users,
} from 'lucide-react-native';
import { Component, type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BusinessWebRecommendation } from '@/components/business-web/BusinessWebRecommendation';
import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { readBusinessDashboardCounters } from '@/lib/business-web/dashboardCounters';
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
const CUMULATIVE_PERIOD_LABEL = 'במצטבר';
const STAMP_30_PERIOD_LABEL = 'חותמות ב־30 הימים האחרונים';
const ACTIVE_CUSTOMERS_PERIOD = 'פעילים ב־30 הימים האחרונים';
const AT_RISK_PERIOD = 'לפי דפוס הפעילות';
const MEMBER_PERIOD_LABEL = 'הצטרפו עד היום';
const SHELL_CONTENT_PADDING = TOKENS.space.lg;
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

function DashboardSkeleton({ bleed }: { bleed: object }) {
  return (
    <View
      accessibilityLabel="טוענים את נתוני לוח הבקרה"
      aria-busy={true}
      role="status"
      style={[styles.page, bleed]}
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
  const progressInRow =
    layout.composition === 'tablet' || layout.composition === 'desktop';
  const [periodAnchor] = useState(() => Date.now());
  const dashboardSummary = useQuery(api.dashboard.getBusinessDashboardSummary, {
    businessId: activeBusinessId,
  });
  const dashboardToday = useQuery(api.dashboard.getBusinessDashboardDay, {
    businessId: activeBusinessId,
    dayStart: periodAnchor,
    rangeDays: 1,
  });
  const dashboardMonth = useQuery(api.dashboard.getBusinessDashboardDay, {
    businessId: activeBusinessId,
    dayStart: periodAnchor,
    rangeDays: 30,
  });
  const recentActivity = useQuery(api.events.getRecentActivity, {
    businessId: activeBusinessId,
    limit: 6,
  });
  const bleed = {
    marginTop: -layout.pageTopPadding,
    marginHorizontal: -SHELL_CONTENT_PADDING,
    marginBottom: -SHELL_CONTENT_BOTTOM,
  };

  if (
    isSwitchingBusiness ||
    dashboardSummary === undefined ||
    dashboardToday === undefined ||
    dashboardMonth === undefined ||
    recentActivity === undefined
  ) {
    return <DashboardSkeleton bleed={bleed} />;
  }

  const counters = readBusinessDashboardCounters({
    activeBusinessId: String(activeBusinessId),
    isSwitchingBusiness,
    summary: dashboardSummary,
    today: dashboardToday,
    month: dashboardMonth,
  });
  if (!counters) {
    return (
      <View style={[styles.page, bleed]}>
        <Text style={styles.mismatch}>הנתונים אינם תואמים לעסק הפעיל.</Text>
      </View>
    );
  }

  const inset = isDesktop ? 20 : narrow ? 12 : 16;
  const recommendation = (
    <View
      style={
        isDesktop
          ? styles.desktopPrimary
          : { marginHorizontal: inset, marginTop: -18 }
      }
    >
      <BusinessWebRecommendation
        activeBusinessId={activeBusinessId}
        isInteractionCurrent={isInteractionCurrent}
        narrow={narrow}
      />
    </View>
  );
  const progress = (
    <View style={[styles.progress, { marginHorizontal: inset }]}>
      <Text style={styles.sectionTitle}>תמונת מצב</Text>
      <View
        style={[styles.progressCard, progressInRow ? styles.progressRow : null]}
      >
        <ProgressCell
          accent={true}
          icon={Stamp}
          label="חותמות"
          last={false}
          period={STAMP_30_PERIOD_LABEL}
          row={progressInRow}
          value={counters.stampsLast30Days}
        />
        <ProgressCell
          icon={Users}
          label="לקוחות פעילים"
          last={false}
          period={ACTIVE_CUSTOMERS_PERIOD}
          row={progressInRow}
          value={counters.activeCustomers}
        />
        <ProgressCell
          icon={CircleAlert}
          label="דורשים תשומת לב"
          last={true}
          period={AT_RISK_PERIOD}
          row={progressInRow}
          value={counters.atRiskCustomers}
          warning={counters.atRiskCustomers > 0}
        />
      </View>
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
    <View style={[styles.page, bleed]}>
      <View
        style={[
          styles.hero,
          isDesktop ? null : styles.heroFull,
          narrow ? styles.heroNarrow : null,
          !narrow && !isDesktop ? styles.heroWide : null,
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
        <View
          style={[styles.heroBody, isDesktop ? styles.heroBodyDesktop : null]}
        >
          <View style={styles.todayBlock}>
            <View style={styles.todayRow}>
              <NavyStat
                icon={Stamp}
                label="חותמות"
                narrow={narrow}
                period={DASHBOARD_TITLE}
                value={counters.stampsToday}
              />
              <View style={styles.todayRule} />
              <NavyStat
                icon={Gift}
                label="מימושים"
                narrow={narrow}
                period={DASHBOARD_TITLE}
                value={counters.redemptionsToday}
              />
            </View>
          </View>
          <View
            style={[
              styles.lifeBlock,
              isDesktop ? styles.lifeBlockDesktop : null,
            ]}
          >
            <Text style={styles.lifeKicker}>{CUMULATIVE_PERIOD_LABEL}</Text>
            <View style={styles.lifeRow}>
              <LifeStat label="חותמות" value={counters.stampsAllTime} />
              <LifeStat label="מימושים" value={counters.redemptionsAllTime} />
              <LifeStat
                caption={MEMBER_PERIOD_LABEL}
                label="חברים"
                value={counters.customersAllTime}
              />
            </View>
          </View>
        </View>
      </View>
      {isDesktop ? (
        <>
          {progress}
          <View style={styles.desktopSplit}>
            {recommendation}
            {activity}
          </View>
        </>
      ) : (
        <>
          {recommendation}
          {progress}
          {activity}
        </>
      )}
    </View>
  );
}

function NavyStat({
  icon: Icon,
  label,
  narrow,
  period,
  value,
}: {
  icon: typeof Stamp;
  label: string;
  narrow: boolean;
  period: string;
  value: number;
}) {
  return (
    <View style={styles.navyStat}>
      <View style={styles.navyStatLabel}>
        <Icon color="#D5DCEC" size={15} strokeWidth={1.75} />
        <Text numberOfLines={1} style={styles.navyStatName}>
          {label}
        </Text>
      </View>
      <Text
        adjustsFontSizeToFit={true}
        minimumFontScale={0.65}
        numberOfLines={1}
        style={[
          styles.navyStatValue,
          narrow ? styles.navyStatValueNarrow : null,
        ]}
      >
        {NUMBER_FORMATTER.format(value)}
      </Text>
      <Text style={styles.navyStatPeriod}>{period}</Text>
    </View>
  );
}

function LifeStat({
  caption,
  label,
  value,
}: {
  caption?: string;
  label: string;
  value: number;
}) {
  return (
    <View style={styles.lifeStat}>
      <Text numberOfLines={1} style={styles.lifeLabel}>
        {label}
      </Text>
      <Text
        adjustsFontSizeToFit={true}
        minimumFontScale={0.7}
        numberOfLines={1}
        style={styles.lifeValue}
      >
        {NUMBER_FORMATTER.format(value)}
      </Text>
      {caption ? (
        <Text numberOfLines={2} style={styles.lifeCaption}>
          {caption}
        </Text>
      ) : null}
    </View>
  );
}

function ProgressCell({
  accent = false,
  icon: Icon,
  label,
  last,
  period,
  row,
  value,
  warning = false,
}: {
  accent?: boolean;
  icon: typeof Stamp;
  label: string;
  last: boolean;
  period: string;
  row: boolean;
  value: number;
  warning?: boolean;
}) {
  return (
    <View
      style={[
        styles.progressCell,
        row ? styles.progressCellRow : null,
        !last && row ? styles.progressEnd : null,
        !last && !row ? styles.progressBottom : null,
      ]}
    >
      <View style={styles.progressCopy}>
        <View style={styles.progressLabelRow}>
          <Icon
            color={
              warning
                ? TOKENS.colors.warning
                : accent
                  ? TOKENS.colors.primary
                  : TOKENS.colors.textMuted
            }
            size={15}
            strokeWidth={1.75}
          />
          <Text numberOfLines={1} style={styles.progressLabel}>
            {label}
          </Text>
        </View>
        <Text numberOfLines={2} style={styles.progressPeriod}>
          {period}
        </Text>
      </View>
      <Text
        style={[
          styles.progressValue,
          accent ? styles.progressValueAccent : null,
          warning ? styles.progressValueWarning : null,
        ]}
      >
        {NUMBER_FORMATTER.format(value)}
      </Text>
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
    alignSelf: 'stretch',
    minHeight: 72,
    backgroundColor: '#F4F6FA',
    paddingBottom: 24,
  },
  hero: {
    alignSelf: 'stretch',
    backgroundColor: '#101936',
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 28,
  },
  heroFull: { width: '100%' },
  heroNarrow: { paddingHorizontal: 12, paddingTop: 14, paddingBottom: 24 },
  heroWide: { paddingHorizontal: 24, paddingTop: 22, paddingBottom: 28 },
  heroDesktop: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 18,
    paddingHorizontal: 24,
    paddingBottom: 22,
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
  heroBody: { marginTop: 12, gap: 16 },
  heroBodyDesktop: {
    alignItems: rtlAlign.end,
    flexDirection: rtlFlex.row,
    gap: 20,
  },
  todayBlock: { flex: 1.2, minWidth: 0 },
  todayRow: { flexDirection: rtlFlex.row, gap: 12 },
  todayRule: {
    alignSelf: 'stretch',
    backgroundColor: '#2A3A5C',
    width: 1,
  },
  navyStat: { flex: 1, minWidth: 0, gap: 2 },
  navyStatLabel: {
    alignItems: 'center',
    flexDirection: rtlFlex.row,
    gap: 6,
  },
  navyStatName: {
    ...rtlBaseText,
    color: '#D5DCEC',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  navyStatValue: {
    ...rtlBaseText,
    color: '#F4F1E8',
    fontSize: 44,
    fontWeight: '600',
    lineHeight: 48,
  },
  navyStatValueNarrow: { fontSize: 36, lineHeight: 40 },
  navyStatPeriod: {
    ...rtlBaseText,
    color: '#9AABC8',
    fontSize: 12,
    lineHeight: 16,
  },
  lifeBlock: {
    borderTopColor: '#2A3A5C',
    borderTopWidth: 1,
    gap: 8,
    paddingTop: 12,
  },
  lifeBlockDesktop: {
    flex: 0.9,
    borderTopWidth: 0,
    paddingTop: 0,
  },
  lifeKicker: {
    ...rtlBaseText,
    color: '#9AABC8',
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  lifeRow: { flexDirection: rtlFlex.row, gap: 8 },
  lifeStat: { flex: 1, minWidth: 0, gap: 1 },
  lifeLabel: {
    ...rtlBaseText,
    color: '#C5CEDD',
    fontSize: 11,
    fontWeight: '500',
  },
  lifeValue: {
    ...rtlBaseText,
    color: '#F4F1E8',
    fontSize: 20,
    fontWeight: '600',
    lineHeight: 26,
  },
  lifeCaption: {
    ...rtlBaseText,
    color: '#9AABC8',
    fontSize: 10,
    lineHeight: 14,
  },
  progress: { marginTop: 16 },
  progressCard: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: '#E3E8F0',
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  progressRow: { flexDirection: rtlFlex.row },
  progressCell: {
    alignItems: 'center',
    flexDirection: rtlFlex.row,
    gap: 12,
    justifyContent: rtlJustify.between,
    minWidth: 0,
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  progressCellRow: {
    flex: 1,
    alignItems: 'stretch',
    flexDirection: rtlFlex.col,
  },
  progressEnd: { borderLeftColor: '#E3E8F0', borderLeftWidth: 1 },
  progressBottom: { borderBottomColor: '#E3E8F0', borderBottomWidth: 1 },
  progressCopy: { flex: 1, gap: 2, minWidth: 0 },
  progressLabelRow: {
    alignItems: 'center',
    flexDirection: rtlFlex.row,
    gap: 6,
  },
  progressLabel: {
    ...rtlBaseText,
    color: '#5C6778',
    flexShrink: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  progressPeriod: {
    ...rtlBaseText,
    color: '#7B8798',
    fontSize: 11,
    lineHeight: 15,
  },
  progressValue: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
  },
  progressValueAccent: { color: TOKENS.colors.primary },
  progressValueWarning: { color: TOKENS.colors.warning },
  activity: { marginTop: 16, marginBottom: 8 },
  activityDesktop: { flex: 0.85, marginTop: 0, marginBottom: 0, minWidth: 0 },
  sectionTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 8,
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
