import { useQuery } from 'convex/react';
import { Building2, CircleAlert, Gift, Stamp } from 'lucide-react-native';
import { Component, type ReactNode, useState } from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';

import { BusinessWebRecommendation } from '@/components/business-web/BusinessWebRecommendation';
import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import {
  readHomeAchievements,
  readStampsToday,
  visibleTodayStampCount,
} from '@/lib/business-web/dashboardCounters';
import {
  nextStampMilestone,
  stampMilestoneMessage,
} from '@/lib/business-web/stampMilestones';
import { getBusinessWebResponsiveLayout } from '@/lib/design/businessWebResponsive';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import {
  ltrIslandText,
  alignItems as rtlAlign,
  rtlBaseText,
  flexDirection as rtlFlex,
  justifyContent as rtlJustify,
  selfStart,
} from '@/lib/rtl';

type BusinessWebDashboardProps = {
  activeBusinessId: Id<'businesses'>;
  businessName: string;
  isInteractionCurrent: (businessId: string) => boolean;
  isSwitchingBusiness: boolean;
};

const NUMBER_FORMATTER = new Intl.NumberFormat('he-IL');
const HERO_HEADING = 'המועדון שלך במספרים';
const STAMP_ACHIEVEMENT = 'חותמות שהוענקו במועדון';
const REWARD_ACHIEVEMENT = 'הטבות מומשו';
const TODAY_STAMP_LABEL = 'חותמות היום';
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
  const [periodAnchor] = useState(() => Date.now());
  const dashboardSummary = useQuery(api.dashboard.getBusinessDashboardSummary, {
    businessId: activeBusinessId,
  });
  const dashboardToday = useQuery(api.dashboard.getBusinessDashboardDay, {
    businessId: activeBusinessId,
    dayStart: periodAnchor,
    rangeDays: 1,
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
    recentActivity === undefined
  ) {
    return <DashboardSkeleton bleed={bleed} />;
  }

  const achievements = readHomeAchievements({
    activeBusinessId: String(activeBusinessId),
    isSwitchingBusiness,
    summary: dashboardSummary,
  });
  if (!achievements) {
    return (
      <View style={[styles.page, bleed]}>
        <Text style={styles.mismatch}>הנתונים אינם תואמים לעסק הפעיל.</Text>
      </View>
    );
  }

  const stampsToday = visibleTodayStampCount(
    readStampsToday({
      activeBusinessId: String(activeBusinessId),
      isSwitchingBusiness,
      today: dashboardToday,
    })
  );
  const milestone = nextStampMilestone(achievements.stampsAllTime);
  const milestoneMessage = stampMilestoneMessage(achievements.stampsAllTime);
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
          style={[styles.heroHeading, narrow ? styles.heroHeadingNarrow : null]}
        >
          {HERO_HEADING}
        </Text>
        <Text
          adjustsFontSizeToFit={true}
          minimumFontScale={0.6}
          numberOfLines={1}
          style={[
            styles.heroNumber,
            narrow ? styles.heroNumberNarrow : null,
            isDesktop ? styles.heroNumberWide : null,
          ]}
        >
          {NUMBER_FORMATTER.format(achievements.stampsAllTime)}
        </Text>
        <View style={styles.heroCaptionRow}>
          <Stamp color="#D5DCEC" size={16} strokeWidth={1.75} />
          <Text style={styles.heroCaption}>{STAMP_ACHIEVEMENT}</Text>
        </View>
        <View style={styles.rewardRow}>
          <Gift color="#F4F1E8" size={16} strokeWidth={1.75} />
          <Text style={styles.rewardText}>
            {NUMBER_FORMATTER.format(achievements.redemptionsAllTime)}{' '}
            {REWARD_ACHIEVEMENT}
          </Text>
        </View>
        {stampsToday != null ? (
          <Text style={styles.todayPill}>
            <Text style={ltrIslandText}>
              +{NUMBER_FORMATTER.format(stampsToday)}
            </Text>
            {` ${TODAY_STAMP_LABEL}`}
          </Text>
        ) : null}
        {milestone && milestoneMessage ? (
          <View style={styles.milestone}>
            <Text style={styles.milestoneText}>{milestoneMessage}</Text>
            <View
              accessibilityLabel={milestoneMessage}
              style={styles.milestoneTrack}
            >
              <View
                style={[
                  styles.milestoneFill,
                  { width: `${Math.round(milestone.progress * 100)}%` },
                ]}
              />
            </View>
          </View>
        ) : null}
      </View>
      {isDesktop ? (
        <View style={styles.desktopSplit}>
          {recommendation}
          {activity}
        </View>
      ) : (
        <>
          {recommendation}
          {activity}
        </>
      )}
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
    paddingBottom: 28,
  },
  hero: {
    alignSelf: 'stretch',
    backgroundColor: '#101936',
    paddingHorizontal: 20,
    paddingTop: 22,
    paddingBottom: 36,
  },
  heroFull: { width: '100%' },
  heroNarrow: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 32 },
  heroWide: { paddingHorizontal: 28, paddingTop: 28, paddingBottom: 40 },
  heroDesktop: {
    marginHorizontal: 20,
    marginTop: 16,
    borderRadius: 18,
    paddingHorizontal: 32,
    paddingTop: 28,
    paddingBottom: 32,
  },
  kicker: { ...rtlBaseText, color: '#C5CEDD', fontSize: 12, fontWeight: '500' },
  heroHeading: {
    ...rtlBaseText,
    color: '#F4F1E8',
    fontSize: 22,
    fontWeight: '600',
    lineHeight: 28,
    marginTop: 6,
  },
  heroHeadingNarrow: { fontSize: 20, lineHeight: 26 },
  heroNumber: {
    ...rtlBaseText,
    color: '#F4F1E8',
    fontSize: 80,
    fontWeight: '600',
    lineHeight: 84,
    marginTop: 8,
  },
  heroNumberNarrow: { fontSize: 64, lineHeight: 68 },
  heroNumberWide: { fontSize: 96, lineHeight: 100 },
  heroCaptionRow: {
    alignItems: 'center',
    flexDirection: rtlFlex.row,
    gap: 6,
    marginTop: 2,
  },
  heroCaption: {
    ...rtlBaseText,
    color: '#D5DCEC',
    fontSize: 15,
    lineHeight: 22,
  },
  rewardRow: {
    alignItems: 'center',
    flexDirection: rtlFlex.row,
    gap: 8,
    marginTop: 16,
  },
  rewardText: {
    ...rtlBaseText,
    color: '#F4F1E8',
    fontSize: 18,
    fontWeight: '600',
    lineHeight: 24,
  },
  todayPill: {
    ...rtlBaseText,
    alignSelf: selfStart,
    backgroundColor: '#243056',
    borderRadius: 999,
    color: '#F4F1E8',
    fontSize: 13,
    fontWeight: '600',
    marginTop: 14,
    overflow: 'hidden',
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  milestone: { marginTop: 22, maxWidth: 420, gap: 8 },
  milestoneText: {
    ...rtlBaseText,
    color: '#D5DCEC',
    fontSize: 14,
    lineHeight: 20,
  },
  milestoneTrack: {
    alignSelf: 'stretch',
    backgroundColor: '#2A3A5C',
    borderRadius: 999,
    flexDirection: rtlFlex.row,
    height: 4,
    overflow: 'hidden',
  },
  milestoneFill: {
    backgroundColor: '#F4F1E8',
    height: 4,
  },
  activity: { marginTop: 18, marginBottom: 8 },
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
    marginTop: 18,
  },
  desktopPrimary: { flex: 1.15, minWidth: 0 },
  skeleton: { backgroundColor: '#243056', borderRadius: 8 },
  skeletonLine: { height: 16, width: 160 },
  skeletonNumber: { height: 64, marginTop: 16, width: 120 },
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
    justifyContent: 'center',
    minHeight: 44,
    paddingHorizontal: 16,
  },
  retryButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '600' },
});
