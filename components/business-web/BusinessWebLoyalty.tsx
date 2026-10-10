import { useQuery } from 'convex/react';
import { type Href, useRouter } from 'expo-router';
import { Gift } from 'lucide-react-native';
import { StyleSheet, View } from 'react-native';
import { ActionButton } from '@/components/ui/ActionButton';
import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { useActiveBusiness } from '@/hooks/useActiveBusiness';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { alignItems, flexDirection, rtlBaseText } from '@/lib/rtl';

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
  const router = useRouter();
  const { activeBusiness } = useActiveBusiness();
  const canEdit = activeBusiness?.capabilities?.edit_loyalty_cards === true;
  const data = useQuery(api.loyaltyPrograms.listManagementByBusiness, {
    businessId: activeBusinessId,
  });
  const programs = data ?? [];
  const activePrograms = programs.filter(
    (program) => program.lifecycle === 'active'
  );
  const totalMembers = programs.reduce(
    (sum, program) => sum + Number(program.metrics?.activeMembers ?? 0),
    0
  );

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text
          accessibilityRole="header"
          aria-level={1}
          style={styles.pageTitle}
        >
          מועדון והטבות
        </Text>
        <Text style={styles.pageSubtitle}>
          כרטיסיות, חברים והטבות במקום אחד.
        </Text>
      </View>

      {canEdit ? (
        <ActionButton
          label="יצירת כרטיסייה"
          onPress={() => router.push('/business/cards/new' as Href)}
        />
      ) : null}
      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>כרטיסיות פעילות</Text>
          <Text style={styles.summaryValue}>{activePrograms.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>חברים פעילים</Text>
          <Text style={styles.summaryValue}>{totalMembers}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>כל הכרטיסיות</Text>
          <Text style={styles.summaryValue}>{programs.length}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.panelHeader}>
          <Text style={styles.sectionTitle}>הכרטיסיות שלכם</Text>
          <Text style={styles.sectionSubtitle}>נתונים חיים</Text>
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
              <View
                key={String(program.loyaltyProgramId)}
                style={styles.programCard}
              >
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
                {canEdit ? (
                  <ActionButton
                    label="ניהול הכרטיסייה"
                    onPress={() =>
                      router.push({
                        pathname: '/business/cards/[programId]' as Href,
                        params: {
                          programId: String(program.loyaltyProgramId),
                          businessId: String(activeBusinessId),
                        },
                      } as Href)
                    }
                  />
                ) : null}
                <View style={styles.metricsRow}>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>
                      {program.metrics.activeMembers}
                    </Text>
                    <Text style={styles.metricLabel}>חברים פעילים</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>
                      {program.metrics.stamps7d}
                    </Text>
                    <Text style={styles.metricLabel}>חותמות ב־7 ימים</Text>
                  </View>
                  <View style={styles.metric}>
                    <Text style={styles.metricValue}>
                      {program.metrics.redemptions30d}
                    </Text>
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
  page: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: 16 },
  header: { gap: 4 },
  pageTitle: {
    ...TOKENS.typography.pageTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  pageSubtitle: {
    ...TOKENS.typography.body,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  summaryRow: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: 0,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: TOKENS.colors.border,
    paddingVertical: 10,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 150,
    minWidth: 150,
    paddingHorizontal: 14,
    paddingVertical: 2,
    gap: 1,
  },
  summaryLabel: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    ...rtlBaseText,
  },
  summaryValue: {
    fontSize: 21,
    lineHeight: 27,
    fontWeight: '600',
    color: TOKENS.colors.textPrimary,
    ...rtlBaseText,
  },
  panel: { gap: 10 },
  panelHeader: { gap: 3 },
  sectionTitle: {
    ...TOKENS.typography.sectionTitle,
    color: TOKENS.colors.textPrimary,
    ...rtlBaseText,
  },
  sectionSubtitle: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    ...rtlBaseText,
  },
  cards: { gap: 0, borderTopWidth: 1, borderTopColor: TOKENS.colors.border },
  programCard: {
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
    paddingVertical: 12,
    gap: 8,
  },
  programTop: {
    flexDirection: flexDirection.row,
    justifyContent: 'space-between',
    alignItems: alignItems.start,
    gap: 14,
  },
  programCopy: { flex: 1, gap: 4 },
  programTitle: {
    ...TOKENS.typography.cardTitle,
    color: TOKENS.colors.textPrimary,
    ...rtlBaseText,
  },
  rewardName: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    ...rtlBaseText,
  },
  lifecycleBadge: {
    borderRadius: TOKENS.radii.pill,
    backgroundColor: TOKENS.colors.primarySubtle,
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  lifecycleText: {
    fontSize: 12,
    fontWeight: '600',
    color: TOKENS.colors.primary,
  },
  metricsRow: { flexDirection: flexDirection.row, flexWrap: 'wrap', gap: 22 },
  metric: { minWidth: 110, gap: 1 },
  metricValue: {
    fontSize: 16,
    fontWeight: '600',
    color: TOKENS.colors.textPrimary,
    ...rtlBaseText,
  },
  metricLabel: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    ...rtlBaseText,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 28,
  },
  emptyTitle: {
    ...TOKENS.typography.cardTitle,
    color: TOKENS.colors.textPrimary,
    textAlign: 'center',
  },
  emptyText: {
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.textMuted,
    textAlign: 'center',
  },
});
