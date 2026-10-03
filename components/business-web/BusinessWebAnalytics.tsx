import { useQuery } from 'convex/react';
import { Activity, Gift, Stamp, TriangleAlert, Users } from 'lucide-react-native';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

function metricChange(value: number, previous: number) {
  if (previous <= 0) return value > 0 ? 'פעילות חדשה' : 'ללא שינוי';
  const change = Math.round(((value - previous) / previous) * 100);
  if (change === 0) return 'ללא שינוי';
  return `${change > 0 ? '+' : ''}${change}% מול התקופה הקודמת`;
}

export function BusinessWebAnalytics({
  activeBusinessId,
}: {
  activeBusinessId: Id<'businesses'>;
}) {
  const [anchor] = useState(() => Date.now());
  const summary = useQuery(api.dashboard.getBusinessDashboardSummary, {
    businessId: activeBusinessId,
  });
  const period = useQuery(api.dashboard.getBusinessDashboardDay, {
    businessId: activeBusinessId,
    dayStart: anchor,
    rangeDays: 30,
  });

  const loading = summary === undefined || period === undefined;
  const kpis = period?.kpis;
  const lifetime = summary?.lifetimeMetrics;

  const cards = [
    {
      key: 'customers',
      label: 'לקוחות במועדון',
      value: Number(lifetime?.totalCustomersJoinedAllTime ?? 0),
      context: 'סה״כ מאז פתיחת העסק',
      icon: Users,
    },
    {
      key: 'active',
      label: 'לקוחות פעילים',
      value: Number(kpis?.activeCustomers ?? 0),
      context: 'ב־30 הימים האחרונים',
      icon: Activity,
    },
    {
      key: 'stamps',
      label: 'חותמות',
      value: Number(kpis?.stamps?.value ?? 0),
      context: metricChange(
        Number(kpis?.stamps?.value ?? 0),
        Number(kpis?.stamps?.previousValue ?? 0)
      ),
      icon: Stamp,
    },
    {
      key: 'redemptions',
      label: 'מימושי הטבות',
      value: Number(kpis?.redemptions?.value ?? 0),
      context: metricChange(
        Number(kpis?.redemptions?.value ?? 0),
        Number(kpis?.redemptions?.previousValue ?? 0)
      ),
      icon: Gift,
    },
    {
      key: 'risk',
      label: 'לקוחות בסיכון',
      value: Number(kpis?.atRiskCustomers ?? 0),
      context: 'דורשים תשומת לב',
      icon: TriangleAlert,
    },
  ];

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>ניתוחים</Text>
        <Text style={styles.pageSubtitle}>
          30 הימים האחרונים מול התקופה הקודמת.
        </Text>
      </View>

      {loading ? (
        <View style={styles.panel}>
          <Text style={styles.emptyText}>טוענים נתונים…</Text>
        </View>
      ) : (
        <>
          <View style={styles.kpiGrid}>
            {cards.map((card) => {
              const Icon = card.icon;
              return (
                <View key={card.key} style={styles.kpiCard}>
                  <View style={styles.iconBox}>
                    <Icon color={TOKENS.colors.primary} size={19} />
                  </View>
                  <Text style={styles.kpiLabel}>{card.label}</Text>
                  <Text style={styles.kpiValue}>{card.value}</Text>
                  <Text style={styles.kpiContext}>{card.context}</Text>
                </View>
              );
            })}
          </View>

          <View style={styles.panel}>
            <Text style={styles.sectionTitle}>סיכום פעילות</Text>
            <View style={styles.activityRow}>
              <View style={styles.activityMetric}>
                <Text style={styles.activityValue}>
                  {Number(lifetime?.totalStampsAllTime ?? 0)}
                </Text>
                <Text style={styles.activityLabel}>חותמות מאז ההקמה</Text>
              </View>
              <View style={styles.activityMetric}>
                <Text style={styles.activityValue}>
                  {Number(lifetime?.totalRedemptionsAllTime ?? 0)}
                </Text>
                <Text style={styles.activityLabel}>מימושים מאז ההקמה</Text>
              </View>
            </View>
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1080, alignSelf: 'center', gap: 18 },
  header: { gap: 4 },
  pageTitle: { ...TOKENS.typography.pageTitle, color: TOKENS.colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  pageSubtitle: { ...TOKENS.typography.body, color: TOKENS.colors.textMuted, textAlign: 'right', writingDirection: 'rtl' },
  kpiGrid: { flexDirection: flexDirection.row, flexWrap: 'wrap', gap: 10 },
  kpiCard: { flexGrow: 1, flexBasis: 190, minWidth: 190, backgroundColor: TOKENS.colors.elevatedSurface, borderWidth: 1, borderColor: TOKENS.colors.border, borderRadius: TOKENS.radii.lg, padding: 14, gap: 4 },
  iconBox: { width: 32, height: 32, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: TOKENS.colors.primarySubtle, marginBottom: 4 },
  kpiLabel: { ...TOKENS.typography.metadata, color: TOKENS.colors.textMuted, ...rtlBaseText },
  kpiValue: { fontSize: 25, lineHeight: 31, fontWeight: '700', color: TOKENS.colors.textPrimary, ...rtlBaseText },
  kpiContext: { ...TOKENS.typography.metadata, color: TOKENS.colors.textSecondary, ...rtlBaseText },
  panel: { backgroundColor: TOKENS.colors.elevatedSurface, borderWidth: 1, borderColor: TOKENS.colors.border, borderRadius: TOKENS.radii.lg, padding: 16, gap: 14 },
  sectionTitle: { ...TOKENS.typography.sectionTitle, color: TOKENS.colors.textPrimary, ...rtlBaseText },
  activityRow: { flexDirection: flexDirection.row, flexWrap: 'wrap', gap: 10 },
  activityMetric: { flexGrow: 1, flexBasis: 220, borderRadius: TOKENS.radii.md, backgroundColor: TOKENS.colors.subtleSurface, padding: 12, gap: 3 },
  activityValue: { fontSize: 21, lineHeight: 28, fontWeight: '700', color: TOKENS.colors.textPrimary, ...rtlBaseText },
  activityLabel: { ...TOKENS.typography.secondaryBody, color: TOKENS.colors.textMuted, ...rtlBaseText },
  emptyText: { ...TOKENS.typography.secondaryBody, color: TOKENS.colors.textMuted, textAlign: 'center' },
});
