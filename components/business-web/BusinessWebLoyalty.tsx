import { useQuery } from 'convex/react';
import { Gift, Stamp, Users } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

const LIFECYCLE_LABEL: Record<string, string> = {
  active: 'פעילה',
  draft: 'טיוטה',
  archived: 'בארכיון',
};

export function BusinessWebLoyalty({
  activeBusinessId,
}: {
  activeBusinessId: Id<'businesses'>;
}) {
  const data = useQuery(api.loyaltyPrograms.listManagementByBusiness, {
    businessId: activeBusinessId,
  });
  const programs = data ?? [];
  const activePrograms = programs.filter((program) => program.lifecycle === 'active');
  const totalMembers = programs.reduce(
    (sum, program) => sum + Number(program.metrics?.activeMembers ?? 0),
    0
  );

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>מועדון והטבות</Text>
        <Text style={styles.pageSubtitle}>
          ניהול תמונת המצב של הכרטיסיות, החברים וההטבות בעסק.
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Stamp color={TOKENS.colors.primary} size={20} />
          <Text style={styles.summaryLabel}>כרטיסיות פעילות</Text>
          <Text style={styles.summaryValue}>{activePrograms.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Users color={TOKENS.colors.primary} size={20} />
          <Text style={styles.summaryLabel}>חברים פעילים</Text>
          <Text style={styles.summaryValue}>{totalMembers}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Gift color={TOKENS.colors.primary} size={20} />
          <Text style={styles.summaryLabel}>כל הכרטיסיות</Text>
          <Text style={styles.summaryValue}>{programs.length}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.sectionTitle}>הכרטיסיות שלכם</Text>
          <Text style={styles.sectionSubtitle}>נתונים חיים מתוך המועדון</Text>
        </View>

        {data === undefined ? (
          <Text style={styles.emptyText}>טוענים כרטיסיות…</Text>
        ) : programs.length === 0 ? (
          <View style={styles.emptyState}>
            <Gift color={TOKENS.colors.primary} size={26} />
            <Text style={styles.emptyTitle}>עדיין אין כרטיסיות</Text>
            <Text style={styles.emptyText}>
              כרטיסיות שתיצרו לעסק יופיעו כאן.
            </Text>
          </View>
        ) : (
          <View style={styles.cards}>
            {programs.map((program) => (
              <View key={String(program.loyaltyProgramId)} style={styles.programCard}>
                <View style={styles.programTop}>
                  <View style={styles.programCopy}>
                    <Text style={styles.programTitle}>{program.title}</Text>
                    <Text style={styles.rewardName}>{program.rewardName}</Text>
                  </View>
                  <View style={styles.lifecycleBadge}>
                    <Text style={styles.lifecycleText}>
                      {LIFECYCLE_LABEL[program.lifecycle] ?? program.lifecycle}
                    </Text>
                  </View>
                </View>
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{program.metrics.activeMembers}</Text>
                    <Text style={styles.metricLabel}>חברים פעילים</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{program.metrics.stamps7d}</Text>
                    <Text style={styles.metricLabel}>חותמות ב־7 ימים</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>{program.metrics.redemptions30d}</Text>
                    <Text style={styles.metricLabel}>מימושים ב־30 יום</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 1180, alignSelf: 'center', gap: 24 },
  header: { gap: 4 },
  pageTitle: { ...TOKENS.typography.pageTitle, color: TOKENS.colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  pageSubtitle: { ...TOKENS.typography.body, color: TOKENS.colors.textMuted, textAlign: 'right', writingDirection: 'rtl' },
  summaryRow: { flexDirection: flexDirection.row, flexWrap: 'wrap', gap: 14 },
  summaryCard: { flexGrow: 1, flexBasis: 180, minWidth: 180, backgroundColor: TOKENS.colors.elevatedSurface, borderWidth: 1, borderColor: TOKENS.colors.border, borderRadius: TOKENS.radii.lg, padding: 18, gap: 6 },
  summaryLabel: { ...TOKENS.typography.metadata, color: TOKENS.colors.textMuted, ...rtlBaseText },
  summaryValue: { fontSize: 28, lineHeight: 36, fontWeight: '700', color: TOKENS.colors.textPrimary, ...rtlBaseText },
  panel: { backgroundColor: TOKENS.colors.elevatedSurface, borderWidth: 1, borderColor: TOKENS.colors.border, borderRadius: TOKENS.radii.lg, padding: 20, gap: 18 },
  panelHeader: { gap: 3 },
  sectionTitle: { ...TOKENS.typography.sectionTitle, color: TOKENS.colors.textPrimary, ...rtlBaseText },
  sectionSubtitle: { ...TOKENS.typography.secondaryBody, color: TOKENS.colors.textMuted, ...rtlBaseText },
  cards: { gap: 12 },
  programCard: { borderWidth: 1, borderColor: TOKENS.colors.border, borderRadius: TOKENS.radii.md, padding: 18, gap: 16, backgroundColor: TOKENS.colors.subtleSurface },
  programTop: { flexDirection: flexDirection.row, justifyContent: 'space-between', alignItems: 'flex-start', gap: 14 },
  programCopy: { flex: 1, gap: 4 },
  programTitle: { ...TOKENS.typography.cardTitle, color: TOKENS.colors.textPrimary, ...rtlBaseText },
  rewardName: { ...TOKENS.typography.secondaryBody, color: TOKENS.colors.textMuted, ...rtlBaseText },
  lifecycleBadge: { borderRadius: TOKENS.radii.pill, backgroundColor: TOKENS.colors.primarySubtle, paddingHorizontal: 10, paddingVertical: 4 },
  lifecycleText: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.primary },
  metricsRow: { flexDirection: flexDirection.row, flexWrap: 'wrap', gap: 10 },
  metric: { minWidth: 130, flexGrow: 1, borderRadius: TOKENS.radii.sm, backgroundColor: TOKENS.colors.elevatedSurface, padding: 12, gap: 2 },
  metricValue: { fontSize: 20, fontWeight: '700', color: TOKENS.colors.textPrimary, ...rtlBaseText },
  metricLabel: { ...TOKENS.typography.metadata, color: TOKENS.colors.textMuted, ...rtlBaseText },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 42 },
  emptyTitle: { ...TOKENS.typography.cardTitle, color: TOKENS.colors.textPrimary, textAlign: 'center' },
  emptyText: { ...TOKENS.typography.secondaryBody, color: TOKENS.colors.textMuted, textAlign: 'center' },
});
