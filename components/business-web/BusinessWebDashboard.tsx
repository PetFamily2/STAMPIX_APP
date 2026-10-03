import {
  useQuery } from 'convex/react';
import {
  Activity,
  Building2,
  CircleAlert,
  Gift,
  type LucideIcon,
  Stamp,
  Users,
  } from 'lucide-react-native';
import { Component,
  type ReactNode,
  useState } from 'react';
import {
  Pressable,
  type StyleProp,
  StyleSheet,
  useWindowDimensions,
  View,
  type ViewStyle,
} from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';

import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { getBusinessWebResponsiveLayout } from '@/lib/design/businessWebResponsive';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import {
  alignItems,
  flexDirection,
  ltrIslandText,
  rtlBaseText,
  selfStart,
  textAlign,
} from '@/lib/rtl';

type BusinessWebDashboardProps = {
  activeBusinessId: Id<'businesses'>;
  businessName: string;
};

type KpiCardProps = {
  cardStyle: StyleProp<ViewStyle>;
  compact: boolean;
  icon: LucideIcon;
  label: string;
  value: number;
  context: string;
  tone: 'primary' | 'success' | 'warning' | 'neutral';
};

const NUMBER_FORMATTER = new Intl.NumberFormat('he-IL');

function DashboardSkeleton() {
  const { width } = useWindowDimensions();
  const responsiveLayout = getBusinessWebResponsiveLayout(width);
  const isMobileComposition =
    responsiveLayout.composition === 'mobile' ||
    responsiveLayout.composition === 'narrow-mobile';
  const isSingleColumn = responsiveLayout.kpiColumns === 1;
  const isTwoColumn = responsiveLayout.kpiColumns === 2;
  const cardStyle = isSingleColumn
    ? styles.cardSingleColumn
    : isTwoColumn
      ? styles.cardTwoColumn
      : styles.cardDesktop;

  return (
    <View
      accessibilityLabel="טוענים את נתוני לוח הבקרה"
      style={[styles.page, isMobileComposition ? styles.pageMobile : null]}
    >
      <View style={[styles.skeleton, styles.skeletonHeading]} />
      <View
        style={[
          styles.kpiGrid,
          isMobileComposition ? styles.kpiGridMobile : null,
          isSingleColumn ? styles.kpiGridSingleColumn : null,
        ]}
      >
        {[0, 1, 2, 3].map((item) => (
          <View
            key={item}
            style={[
              styles.card,
              cardStyle,
              isMobileComposition ? styles.cardMobile : null,
              styles.skeletonCard,
            ]}
          >
            <View style={[styles.skeleton, styles.skeletonIcon]} />
            <View style={[styles.skeleton, styles.skeletonLabel]} />
            <View style={[styles.skeleton, styles.skeletonValue]} />
          </View>
        ))}
      </View>
    </View>
  );
}

function KpiCard({
  cardStyle,
  compact,
  icon: Icon,
  label,
  value,
  context,
  tone,
}: KpiCardProps) {
  return (
    <View style={[styles.card, cardStyle, compact ? styles.cardMobile : null]}>
      {compact ? (
        <View style={styles.kpiHeadingMobile}>
          <View
            style={[
              styles.kpiIcon,
              styles[`kpiIcon_${tone}`],
              styles.kpiIconMobile,
            ]}
          >
            <Icon
              color={
                tone === 'warning'
                  ? TOKENS.colors.warning
                  : tone === 'success'
                    ? TOKENS.colors.success
                    : TOKENS.colors.primary
              }
              size={18}
              strokeWidth={TOKENS.icons.strokeWidth}
            />
          </View>
          <Text style={[styles.kpiLabel, styles.kpiLabelMobile]}>{label}</Text>
        </View>
      ) : (
        <>
          <View style={[styles.kpiIcon, styles[`kpiIcon_${tone}`]]}>
            <Icon
              color={
                tone === 'warning'
                  ? TOKENS.colors.warning
                  : tone === 'success'
                    ? TOKENS.colors.success
                    : TOKENS.colors.primary
              }
              size={TOKENS.icons.standard}
              strokeWidth={TOKENS.icons.strokeWidth}
            />
          </View>
          <Text style={styles.kpiLabel}>{label}</Text>
        </>
      )}
      <Text style={[styles.kpiValue, compact ? styles.kpiValueMobile : null]}>
        {NUMBER_FORMATTER.format(value)}
      </Text>
      <Text
        style={[styles.kpiContext, compact ? styles.kpiContextMobile : null]}
      >
        {context}
      </Text>
    </View>
  );
}

function EmptyDashboard({ businessName }: { businessName: string }) {
  return (
    <View style={styles.emptyDashboard}>
      <View style={styles.emptyIcon}>
        <Building2
          color={TOKENS.colors.primary}
          size={TOKENS.icons.prominent}
          strokeWidth={TOKENS.icons.strokeWidth}
        />
      </View>
      <Text style={styles.emptyTitle}>הפעילות של {businessName} תופיע כאן</Text>
      <Text style={styles.emptyBody}>
        אחרי שלקוחות יצטרפו ויתחילו לצבור חותמות, יוצגו כאן תמונת מצב ופעילות
        אחרונה.
      </Text>
    </View>
  );
}

function BusinessWebDashboardContent({
  activeBusinessId,
  businessName,
}: BusinessWebDashboardProps) {
  const { width } = useWindowDimensions();
  const responsiveLayout = getBusinessWebResponsiveLayout(width);
  const isWide = responsiveLayout.detailColumns === 2;
  const isSingleColumn = responsiveLayout.kpiColumns === 1;
  const isTwoColumn = responsiveLayout.kpiColumns === 2;
  const isMobileComposition =
    responsiveLayout.composition === 'mobile' ||
    responsiveLayout.composition === 'narrow-mobile';
  const isMobileActivity = responsiveLayout.activityPresentation === 'feed';
  const kpiCardStyle = isSingleColumn
    ? styles.cardSingleColumn
    : isTwoColumn
      ? styles.cardTwoColumn
      : styles.cardDesktop;
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
    dashboardSummary === undefined ||
    dashboardPeriod === undefined ||
    recentActivity === undefined
  ) {
    return <DashboardSkeleton />;
  }

  const hasMatchingSummary =
    dashboardSummary !== null &&
    dashboardSummary.businessId === activeBusinessId;
  const hasMatchingPeriod =
    dashboardPeriod !== null && dashboardPeriod.businessId === activeBusinessId;
  const summary = hasMatchingSummary ? dashboardSummary : null;
  const period = hasMatchingPeriod ? dashboardPeriod : null;
  const metrics = summary?.lifetimeMetrics;
  const kpis = period?.kpis;
  const hasMeasuredActivity =
    (metrics?.totalCustomersJoinedAllTime ?? 0) > 0 ||
    (metrics?.totalStampsAllTime ?? 0) > 0 ||
    (metrics?.totalRedemptionsAllTime ?? 0) > 0 ||
    recentActivity.length > 0;

  return (
    <View style={[styles.page, isMobileComposition ? styles.pageMobile : null]}>
      <View
        style={[
          styles.pageHeader,
          isMobileComposition ? styles.pageHeaderMobile : null,
        ]}
      >
        <Text
          style={[
            styles.pageTitle,
            isMobileComposition ? styles.pageTitleMobile : null,
          ]}
        >
          דף הבית
        </Text>
        <Text
          style={[
            styles.pageSubtitle,
            isMobileComposition ? styles.pageSubtitleMobile : null,
          ]}
        >
          מה קורה עכשיו ב־{businessName}
        </Text>
      </View>

      {!hasMeasuredActivity ? (
        <EmptyDashboard businessName={businessName} />
      ) : (
        <>
          <View
            style={[
              styles.kpiGrid,
              isMobileComposition ? styles.kpiGridMobile : null,
              isSingleColumn ? styles.kpiGridSingleColumn : null,
            ]}
          >
            <KpiCard
              cardStyle={kpiCardStyle}
              compact={isMobileComposition}
              context="סה״כ לקוחות שהצטרפו"
              icon={Users}
              label="לקוחות במועדון"
              tone="primary"
              value={metrics?.totalCustomersJoinedAllTime ?? 0}
            />
            <KpiCard
              cardStyle={kpiCardStyle}
              compact={isMobileComposition}
              context="פעילים ב־30 הימים האחרונים"
              icon={Activity}
              label="לקוחות פעילים"
              tone="success"
              value={kpis?.activeCustomers ?? 0}
            />
            <KpiCard
              cardStyle={kpiCardStyle}
              compact={isMobileComposition}
              context="ב־30 הימים האחרונים"
              icon={Stamp}
              label="חותמות"
              tone="neutral"
              value={kpis?.stamps.value ?? 0}
            />
            <KpiCard
              cardStyle={kpiCardStyle}
              compact={isMobileComposition}
              context="ב־30 הימים האחרונים"
              icon={Gift}
              label="מימושי הטבות"
              tone="warning"
              value={kpis?.redemptions.value ?? 0}
            />
          </View>

          <View
            style={[
              styles.detailGrid,
              isMobileComposition ? styles.detailGridMobile : null,
              isWide ? styles.detailGridWide : null,
            ]}
          >
            <View
              style={[
                styles.panel,
                styles.activityPanel,
                isMobileComposition ? styles.panelMobile : null,
              ]}
            >
              <View
                style={[
                  styles.panelHeader,
                  isMobileComposition ? styles.panelHeaderMobile : null,
                ]}
              >
                <View>
                  <Text style={styles.sectionTitle}>פעילות אחרונה</Text>
                  <Text style={styles.sectionSubtitle}>
                    החותמות והמימושים האחרונים בעסק
                  </Text>
                </View>
                <View
                  style={[
                    styles.panelIcon,
                    isMobileComposition ? styles.panelIconMobile : null,
                  ]}
                >
                  <Activity
                    color={TOKENS.colors.primary}
                    size={TOKENS.icons.standard}
                    strokeWidth={TOKENS.icons.strokeWidth}
                  />
                </View>
              </View>

              {recentActivity.length === 0 ? (
                <View style={styles.emptyRegion}>
                  <Text style={styles.emptyRegionTitle}>
                    עדיין אין פעילות להצגה
                  </Text>
                  <Text style={styles.emptyRegionBody}>
                    פעילות חדשה תופיע כאן באופן אוטומטי.
                  </Text>
                </View>
              ) : (
                <View
                  style={[
                    styles.activityList,
                    isMobileComposition ? styles.activityListMobile : null,
                  ]}
                >
                  {!isMobileActivity ? (
                    <View style={styles.activityTableHeader}>
                      <Text
                        style={[styles.tableHeaderText, styles.customerColumn]}
                      >
                        לקוח
                      </Text>
                      <Text
                        style={[styles.tableHeaderText, styles.activityColumn]}
                      >
                        פעילות
                      </Text>
                      <Text style={[styles.tableHeaderText, styles.timeColumn]}>
                        מועד
                      </Text>
                    </View>
                  ) : null}
                  {recentActivity.map((item) => (
                    <View
                      key={String(item.id)}
                      style={[
                        styles.activityRow,
                        isMobileActivity ? styles.activityRowMobile : null,
                      ]}
                    >
                      {isMobileActivity ? (
                        <>
                          <View style={styles.activityMetaRowMobile}>
                            <View
                              style={[
                                styles.customerCell,
                                styles.customerCellMobile,
                              ]}
                            >
                              <View style={styles.customerAvatar}>
                                <Text style={styles.customerAvatarText}>
                                  {String(item.customer || 'ל').charAt(0)}
                                </Text>
                              </View>
                              <Text
                                numberOfLines={1}
                                style={styles.customerName}
                              >
                                {String(item.customer || 'לקוח')}
                              </Text>
                            </View>
                            <Text style={styles.activityTimeMobile}>
                              {String(item.time || '')}
                            </Text>
                          </View>
                          <View
                            style={[styles.activityCell, styles.cellMobile]}
                          >
                            <View
                              style={[
                                styles.activityTypeIcon,
                                item.type === 'reward'
                                  ? styles.rewardTypeIcon
                                  : styles.stampTypeIcon,
                              ]}
                            >
                              {item.type === 'reward' ? (
                                <Gift color={TOKENS.colors.warning} size={16} />
                              ) : (
                                <Stamp
                                  color={TOKENS.colors.primary}
                                  size={16}
                                />
                              )}
                            </View>
                            <Text
                              numberOfLines={2}
                              style={styles.activityDetail}
                            >
                              {String(item.detail || '')}
                            </Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <View style={styles.customerCell}>
                            <View style={styles.customerAvatar}>
                              <Text style={styles.customerAvatarText}>
                                {String(item.customer || 'ל').charAt(0)}
                              </Text>
                            </View>
                            <Text numberOfLines={1} style={styles.customerName}>
                              {String(item.customer || 'לקוח')}
                            </Text>
                          </View>
                          <View style={styles.activityCell}>
                            <View
                              style={[
                                styles.activityTypeIcon,
                                item.type === 'reward'
                                  ? styles.rewardTypeIcon
                                  : styles.stampTypeIcon,
                              ]}
                            >
                              {item.type === 'reward' ? (
                                <Gift color={TOKENS.colors.warning} size={16} />
                              ) : (
                                <Stamp
                                  color={TOKENS.colors.primary}
                                  size={16}
                                />
                              )}
                            </View>
                            <Text
                              numberOfLines={2}
                              style={styles.activityDetail}
                            >
                              {String(item.detail || '')}
                            </Text>
                          </View>
                          <Text style={styles.activityTime}>
                            {String(item.time || '')}
                          </Text>
                        </>
                      )}
                    </View>
                  ))}
                </View>
              )}
            </View>

            <View
              style={[
                styles.panel,
                styles.attentionPanel,
                isMobileComposition ? styles.panelMobile : null,
              ]}
            >
              <View
                style={[
                  styles.panelHeader,
                  isMobileComposition ? styles.panelHeaderMobile : null,
                ]}
              >
                <View>
                  <Text style={styles.sectionTitle}>דורש תשומת לב</Text>
                  <Text style={styles.sectionSubtitle}>
                    לקוחות שכדאי לעקוב אחריהם
                  </Text>
                </View>
                <View
                  style={[
                    styles.panelIcon,
                    isMobileComposition ? styles.panelIconMobile : null,
                    (kpis?.atRiskCustomers ?? 0) > 0
                      ? styles.panelIconWarning
                      : styles.panelIconSuccess,
                  ]}
                >
                  <CircleAlert
                    color={
                      (kpis?.atRiskCustomers ?? 0) > 0
                        ? TOKENS.colors.warning
                        : TOKENS.colors.success
                    }
                    size={TOKENS.icons.standard}
                    strokeWidth={TOKENS.icons.strokeWidth}
                  />
                </View>
              </View>
              <View
                style={[
                  styles.attentionBody,
                  isMobileComposition ? styles.attentionBodyMobile : null,
                ]}
              >
                {(kpis?.atRiskCustomers ?? 0) > 0 ? (
                  <>
                    <Text
                      style={[
                        styles.attentionValue,
                        isMobileComposition
                          ? styles.attentionValueMobile
                          : null,
                      ]}
                    >
                      {NUMBER_FORMATTER.format(kpis?.atRiskCustomers ?? 0)}
                    </Text>
                    <Text style={styles.attentionTitle}>לקוחות בסיכון</Text>
                    <Text style={styles.attentionCopy}>
                      לקוחות שלא חזרו בהתאם לדפוס הפעילות שנמדד בעסק.
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={styles.attentionTitle}>הכול נראה תקין</Text>
                    <Text style={styles.attentionCopy}>
                      אין כרגע לקוחות שמסומנים כמי שדורשים תשומת לב.
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>
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
        <View style={styles.errorIcon}>
          <CircleAlert color={TOKENS.colors.danger} size={24} />
        </View>
        <Text style={styles.errorTitle}>לא הצלחנו לטעון את לוח הבקרה</Text>
        <Text style={styles.errorBody}>בדקו את החיבור ונסו שוב בעוד רגע.</Text>
        <Pressable
          accessibilityLabel="ניסיון טעינה מחדש"
          accessibilityRole="button"
          onPress={() => this.setState({ error: null })}
          style={({ pressed }) => [
            styles.retryButton,
            pressed ? styles.retryButtonPressed : null,
          ]}
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
      <View style={styles.emptyIcon}>
        <Building2
          color={TOKENS.colors.primary}
          size={TOKENS.icons.prominent}
          strokeWidth={TOKENS.icons.strokeWidth}
        />
      </View>
      <Text style={styles.emptyTitle}>אין עסק מחובר לחשבון</Text>
      <Text style={styles.emptyBody}>
        לאחר שיוך החשבון לעסק, נתוני לוח הבקרה יופיעו כאן.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', gap: TOKENS.space.xl },
  pageMobile: { gap: TOKENS.space.lg },
  pageHeader: { alignItems: alignItems.start, gap: TOKENS.space.xs },
  pageHeaderMobile: { gap: 2 },
  pageTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    ...TOKENS.typography.pageTitle,
  },
  pageTitleMobile: { fontSize: 24, lineHeight: 30 },
  pageSubtitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    ...TOKENS.typography.body,
  },
  pageSubtitleMobile: { fontSize: 14, lineHeight: 20 },
  kpiGrid: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.md,
  },
  kpiGridMobile: { gap: TOKENS.space.md },
  kpiGridSingleColumn: {
    flexDirection: 'column',
    flexWrap: 'nowrap',
    alignItems: 'stretch',
  },
  card: {
    minWidth: 0,
    minHeight: 116,
    alignItems: alignItems.start,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    backgroundColor: TOKENS.colors.elevatedSurface,
    padding: TOKENS.space.sm,
    ...TOKENS.shadow,
  },
  cardMobile: {
    minHeight: 104,
    padding: TOKENS.space.sm,
  },
  cardDesktop: { flexGrow: 1, flexBasis: 210 },
  cardTwoColumn: { flexGrow: 1, flexBasis: '48%' },
  cardSingleColumn: {
    width: '100%',
    maxWidth: '100%',
    flexGrow: 0,
    flexBasis: 'auto',
  },
  kpiIcon: {
    width: TOKENS.icons.container,
    height: TOKENS.icons.container,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: TOKENS.radii.md,
    marginBottom: TOKENS.space.sm,
  },
  kpiHeadingMobile: {
    width: '100%',
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: TOKENS.space.sm,
  },
  kpiIconMobile: {
    width: 32,
    height: 32,
    flexShrink: 0,
    borderRadius: TOKENS.radii.sm,
    marginBottom: 0,
  },
  kpiIcon_primary: { backgroundColor: TOKENS.colors.primarySubtle },
  kpiIcon_success: { backgroundColor: TOKENS.colors.successSubtle },
  kpiIcon_warning: { backgroundColor: TOKENS.colors.warningSubtle },
  kpiIcon_neutral: { backgroundColor: '#F1F5F9' },
  kpiLabel: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    ...TOKENS.typography.cardTitle,
  },
  kpiLabelMobile: {
    flex: 1,
    minWidth: 0,
    fontSize: 14,
    lineHeight: 20,
  },
  kpiValue: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    ...TOKENS.typography.kpiValue,
    marginTop: TOKENS.space.xs,
  },
  kpiValueMobile: { fontSize: 28, lineHeight: 34, marginTop: TOKENS.space.sm },
  kpiContext: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    ...TOKENS.typography.metadata,
    marginTop: TOKENS.space.xs,
  },
  kpiContextMobile: { fontSize: 12, lineHeight: 17, marginTop: 2 },
  detailGrid: { flexDirection: 'column', gap: TOKENS.space.lg },
  detailGridMobile: { gap: TOKENS.space.md },
  detailGridWide: { flexDirection: flexDirection.row, alignItems: 'stretch' },
  panel: {
    minWidth: 0,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    backgroundColor: TOKENS.colors.elevatedSurface,
    padding: TOKENS.space.lg,
  },
  panelMobile: { padding: TOKENS.space.md },
  activityPanel: { flex: 2 },
  attentionPanel: { flex: 1 },
  panelHeader: {
    flexDirection: flexDirection.row,
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: TOKENS.space.lg,
  },
  panelHeaderMobile: { gap: TOKENS.space.md },
  panelIcon: {
    width: 40,
    height: 40,
    borderRadius: TOKENS.radii.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
  },
  panelIconMobile: { width: 36, height: 36 },
  panelIconWarning: { backgroundColor: TOKENS.colors.warningSubtle },
  panelIconSuccess: { backgroundColor: TOKENS.colors.successSubtle },
  sectionTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    ...TOKENS.typography.sectionTitle,
  },
  sectionSubtitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    ...TOKENS.typography.secondaryBody,
    marginTop: 2,
  },
  activityList: { marginTop: TOKENS.space.lg },
  activityListMobile: { marginTop: TOKENS.space.md },
  activityTableHeader: {
    flexDirection: flexDirection.row,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    paddingBottom: TOKENS.space.sm,
  },
  tableHeaderText: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    ...TOKENS.typography.metadata,
  },
  customerColumn: { flex: 1.1 },
  activityColumn: { flex: 1.7 },
  timeColumn: { width: 116, textAlign: textAlign.end },
  activityRow: {
    minHeight: 54,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    paddingVertical: TOKENS.space.xs,
  },
  activityRowMobile: {
    minHeight: 0,
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: TOKENS.space.sm,
    paddingVertical: TOKENS.space.md,
  },
  activityMetaRowMobile: {
    flexDirection: flexDirection.row,
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: TOKENS.space.sm,
  },
  customerCell: {
    flex: 1.1,
    minWidth: 0,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: TOKENS.space.sm,
  },
  customerCellMobile: { flex: 1 },
  customerAvatar: {
    width: 34,
    height: 34,
    flexShrink: 0,
    borderRadius: TOKENS.radii.pill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.colors.subtleSurface,
  },
  customerAvatarText: {
    color: TOKENS.colors.textSecondary,
    fontSize: 13,
    fontWeight: '700',
  },
  customerName: {
    ...rtlBaseText,
    flex: 1,
    color: TOKENS.colors.textPrimary,
    ...TOKENS.typography.label,
  },
  activityCell: {
    flex: 1.7,
    minWidth: 0,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: TOKENS.space.sm,
  },
  activityTypeIcon: {
    width: 30,
    height: 30,
    flexShrink: 0,
    borderRadius: TOKENS.radii.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rewardTypeIcon: { backgroundColor: TOKENS.colors.warningSubtle },
  stampTypeIcon: { backgroundColor: TOKENS.colors.primarySubtle },
  activityDetail: {
    ...rtlBaseText,
    flex: 1,
    color: TOKENS.colors.textSecondary,
    ...TOKENS.typography.secondaryBody,
  },
  activityTime: {
    ...ltrIslandText,
    width: 116,
    color: TOKENS.colors.textMuted,
    ...TOKENS.typography.metadata,
  },
  activityTimeMobile: {
    ...ltrIslandText,
    flexShrink: 0,
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  cellMobile: { width: '100%', flex: 0 },
  emptyRegion: {
    alignItems: alignItems.start,
    gap: TOKENS.space.xs,
    marginTop: TOKENS.space.xl,
    borderRadius: TOKENS.radii.md,
    backgroundColor: TOKENS.colors.subtleSurface,
    padding: TOKENS.space.lg,
  },
  emptyRegionTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    ...TOKENS.typography.cardTitle,
  },
  emptyRegionBody: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    ...TOKENS.typography.secondaryBody,
  },
  attentionBody: {
    alignItems: alignItems.start,
    marginTop: TOKENS.space.lg,
  },
  attentionBodyMobile: { marginTop: TOKENS.space.md },
  attentionValue: {
    ...rtlBaseText,
    color: TOKENS.colors.warning,
    ...TOKENS.typography.kpiValue,
  },
  attentionValueMobile: { fontSize: 26, lineHeight: 32 },
  attentionTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    ...TOKENS.typography.cardTitle,
    marginTop: TOKENS.space.xs,
  },
  attentionCopy: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    ...TOKENS.typography.secondaryBody,
    marginTop: TOKENS.space.sm,
  },
  emptyDashboard: {
    minHeight: 220,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    backgroundColor: TOKENS.colors.elevatedSurface,
    padding: TOKENS.space.xl,
  },
  emptyIcon: {
    width: 52,
    height: 52,
    borderRadius: TOKENS.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
    marginBottom: TOKENS.space.lg,
  },
  emptyTitle: {
    ...rtlBaseText,
    textAlign: 'center',
    color: TOKENS.colors.textPrimary,
    ...TOKENS.typography.sectionTitle,
  },
  emptyBody: {
    ...rtlBaseText,
    maxWidth: 520,
    textAlign: 'center',
    color: TOKENS.colors.textSecondary,
    ...TOKENS.typography.body,
    marginTop: TOKENS.space.sm,
  },
  errorState: {
    minHeight: 240,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: TOKENS.radii.lg,
    backgroundColor: TOKENS.colors.elevatedSurface,
    padding: TOKENS.space.xl,
  },
  errorIcon: {
    width: 48,
    height: 48,
    borderRadius: TOKENS.radii.lg,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.colors.dangerSubtle,
    marginBottom: TOKENS.space.lg,
  },
  errorTitle: {
    ...rtlBaseText,
    textAlign: 'center',
    color: TOKENS.colors.textPrimary,
    ...TOKENS.typography.sectionTitle,
  },
  errorBody: {
    ...rtlBaseText,
    textAlign: 'center',
    color: TOKENS.colors.textSecondary,
    ...TOKENS.typography.body,
    marginTop: TOKENS.space.sm,
  },
  retryButton: {
    minHeight: 44,
    justifyContent: 'center',
    borderRadius: TOKENS.radii.md,
    backgroundColor: TOKENS.colors.primary,
    paddingHorizontal: TOKENS.space.xl,
    marginTop: TOKENS.space.xl,
    cursor: 'pointer',
  },
  retryButtonPressed: { backgroundColor: TOKENS.colors.primaryHover },
  retryButtonText: {
    ...rtlBaseText,
    color: '#FFFFFF',
    ...TOKENS.typography.label,
  },
  skeleton: { backgroundColor: '#E9EEF5', borderRadius: TOKENS.radii.sm },
  skeletonHeading: { width: 220, height: 34, alignSelf: selfStart },
  skeletonCard: {},
  skeletonIcon: { width: 40, height: 40, marginBottom: TOKENS.space.md },
  skeletonLabel: { width: 96, height: 16, marginBottom: TOKENS.space.md },
  skeletonValue: { width: 72, height: 30 },
});
