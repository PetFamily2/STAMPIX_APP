import { useQuery } from 'convex/react';

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
    },
    {
      key: 'active',
      label: 'לקוחות פעילים',
      value: Number(kpis?.activeCustomers ?? 0),
      context: 'ב־30 הימים האחרונים',
    },
    {
      key: 'stamps',
      label: 'חותמות',
      value: Number(kpis?.stamps?.value ?? 0),
      context: metricChange(
        Number(kpis?.stamps?.value ?? 0),
        Number(kpis?.stamps?.previousValue ?? 0)
      ),
    },
    {
      key: 'redemptions',
      label: 'מימושי הטבות',
      value: Number(kpis?.redemptions?.value ?? 0),
      context: metricChange(
        Number(kpis?.redemptions?.value ?? 0),
        Number(kpis?.redemptions?.previousValue ?? 0)
      ),
    },
    {
      key: 'risk',
      label: 'לקוחות בסיכון',
      value: Number(kpis?.atRiskCustomers ?? 0),
      context: 'דורשים תשומת לב',
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
            {cards.map((card) => (
              <View key={card.key} style={styles.kpiCard}>
                <Text style={styles.kpiLabel}>{card.label}</Text>
                <Text style={styles.kpiValue}>{card.value}</Text>
                <Text style={styles.kpiContext}>{card.context}</Text>
              </View>
            ))}
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
  page: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: 16 },
  header: { gap: 4 },
  pageTitle: { ...TOKENS.typography.pageTitle, color: TOKENS.colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  pageSubtitle: { ...TOKENS.typography.body, color: TOKENS.colors.textMuted, textAlign: 'right', writingDirection: 'rtl' },
  kpiGrid: { flexDirection: flexDirection.row, flexWrap: 'wrap', gap: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: TOKENS.colors.border, paddingVertical: 10 },
  kpiCard: { flexGrow: 1, flexBasis: 150, minWidth: 150, paddingHorizontal: 14, paddingVertical: 2, gap: 1 },
  kpiLabel: { ...TOKENS.typography.metadata, color: TOKENS.colors.textMuted, ...rtlBaseText },
  kpiValue: { fontSize: 21, lineHeight: 27, fontWeight: '600', color: TOKENS.colors.textPrimary, ...rtlBaseText },
  kpiContext: { ...TOKENS.typography.metadata, color: TOKENS.colors.textSecondary, ...rtlBaseText },
  panel: { borderTopWidth: 1, borderTopColor: TOKENS.colors.border, paddingTop: 12, gap: 10 },
  sectionTitle: { ...TOKENS.typography.sectionTitle, color: TOKENS.colors.textPrimary, ...rtlBaseText },
  activityRow: { flexDirection: flexDirection.row, flexWrap: 'wrap', gap: 24 },
  activityMetric: { flexGrow: 1, flexBasis: 180, gap: 2 },
  activityValue: { fontSize: 18, lineHeight: 24, fontWeight: '600', color: TOKENS.colors.textPrimary, ...rtlBaseText },
  activityLabel: { ...TOKENS.typography.secondaryBody, color: TOKENS.colors.textMuted, ...rtlBaseText },
  emptyText: { ...TOKENS.typography.secondaryBody, color: TOKENS.colors.textMuted, textAlign: 'center' },
});
