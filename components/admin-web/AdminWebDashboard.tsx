import { useQuery } from 'convex/react';
import {
  Building2,
  CircleDollarSign,
  Clock3,
  LifeBuoy,
  Trash2,
} from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { AdminBusinessSearch } from '@/components/admin-web/AdminBusinessSearch';
import { FullScreenLoading } from '@/components/FullScreenLoading';
import { api } from '@/convex/_generated/api';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

function formatDate(value: number | null | undefined) {
  if (!value) {
    return '—';
  }
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function StatusPill({ value }: { value: string | null }) {
  return (
    <View style={styles.pill}>
      <Text style={styles.pillText}>{value ?? 'לא מוגדר'}</Text>
    </View>
  );
}

export function AdminWebDashboard() {
  const overview = useQuery(api.adminWeb.getOverview);

  if (overview === undefined) {
    return <FullScreenLoading />;
  }

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      showsVerticalScrollIndicator={false}
    >
      <View style={styles.pageHeader}>
        <Text style={styles.eyebrow}>STAMP AIX OPERATIONS</Text>
        <Text style={styles.title}>מרכז תפעול</Text>
        <Text style={styles.subtitle}>
          תמונת מצב מאובטחת של עסקים, חיוב, תמיכה ומחיקת חשבונות. פעולות
          רגישות אינן נחשפות במסך הזה.
        </Text>
        <Text style={styles.viewer}>
          {overview.viewer.email ?? overview.viewer.fullName ?? 'Admin'}
        </Text>
      </View>

      <View style={styles.metrics}>
        <View style={styles.metricCard}>
          <LifeBuoy color={TOKENS.colors.primary} size={22} />
          <Text style={styles.metricLabel}>בקשות תמיכה חדשות</Text>
          <Text style={styles.metricValue}>
            {overview.queues.support.visibleCount}
            {overview.queues.support.hasMore ? '+' : ''}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Trash2 color={TOKENS.colors.primary} size={22} />
          <Text style={styles.metricLabel}>בקשות מחיקה פתוחות</Text>
          <Text style={styles.metricValue}>
            {overview.queues.accountDeletion.visibleCount}
            {overview.queues.accountDeletion.hasMore ? '+' : ''}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Building2 color={TOKENS.colors.primary} size={22} />
          <Text style={styles.metricLabel}>עסקים אחרונים</Text>
          <Text style={styles.metricValue}>{overview.recentBusinesses.length}</Text>
        </View>
        <View style={styles.metricCard}>
          <CircleDollarSign color={TOKENS.colors.primary} size={22} />
          <Text style={styles.metricLabel}>חשבונות חיוב אחרונים</Text>
          <Text style={styles.metricValue}>
            {overview.recentBillingAccounts.length}
          </Text>
        </View>
      </View>

      <AdminBusinessSearch />

      <View style={styles.sectionGrid}>
        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Building2 color={TOKENS.colors.primary} size={20} />
            <Text style={styles.sectionTitle}>עסקים אחרונים</Text>
          </View>
          <View style={styles.list}>
            {overview.recentBusinesses.map((business) => (
              <View key={String(business.businessId)} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {business.name}
                  </Text>
                  <Text style={styles.rowMeta}>{formatDate(business.createdAt)}</Text>
                </View>
                <StatusPill value={business.status} />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <CircleDollarSign color={TOKENS.colors.primary} size={20} />
            <Text style={styles.sectionTitle}>חיוב אחרון</Text>
          </View>
          <View style={styles.list}>
            {overview.recentBillingAccounts.map((account) => (
              <View key={String(account.businessId)} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {account.businessName}
                  </Text>
                  <Text style={styles.rowMeta}>
                    {account.plan ?? '—'} · {account.provider ?? '—'} ·{' '}
                    {formatDate(account.updatedAt)}
                  </Text>
                </View>
                <StatusPill value={account.status} />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <LifeBuoy color={TOKENS.colors.primary} size={20} />
            <Text style={styles.sectionTitle}>תמיכה חדשה</Text>
          </View>
          <View style={styles.list}>
            {overview.recentSupport.map((request) => (
              <View key={String(request.requestId)} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {request.name}
                  </Text>
                  <Text numberOfLines={1} style={styles.rowMeta}>
                    {request.email ?? 'ללא דוא״ל'} · {formatDate(request.createdAt)}
                  </Text>
                </View>
                <Clock3 color={TOKENS.colors.textMuted} size={17} />
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionCard}>
          <View style={styles.sectionHeader}>
            <Trash2 color={TOKENS.colors.primary} size={20} />
            <Text style={styles.sectionTitle}>בקשות מחיקת חשבון</Text>
          </View>
          <View style={styles.list}>
            {overview.recentDeletionRequests.map((request) => (
              <View key={String(request.requestId)} style={styles.row}>
                <View style={styles.rowMain}>
                  <Text numberOfLines={1} style={styles.rowTitle}>
                    {request.email}
                  </Text>
                  <Text numberOfLines={1} style={styles.rowMeta}>
                    {request.requestReference} · {formatDate(request.createdAt)}
                  </Text>
                </View>
                <StatusPill value={request.status} />
              </View>
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    backgroundColor: TOKENS.colors.pageBackground,
    gap: TOKENS.space.xl,
    minHeight: '100vh' as never,
    padding: 36,
  },
  pageHeader: { maxWidth: 820 },
  eyebrow: {
    color: TOKENS.colors.primary,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
  title: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 34,
    fontWeight: '900',
    marginTop: 8,
  },
  subtitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textSecondary,
    fontSize: 16,
    lineHeight: 27,
    marginTop: 10,
  },
  viewer: {
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    marginTop: 8,
  },
  metrics: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.md,
  },
  metricCard: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    flexGrow: 1,
    gap: 8,
    minWidth: 190,
    padding: TOKENS.space.lg,
  },
  metricLabel: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 12,
  },
  metricValue: {
    color: TOKENS.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
  },
  sectionGrid: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    gap: TOKENS.space.lg,
  },
  sectionCard: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    flexGrow: 1,
    minWidth: 320,
    padding: TOKENS.space.xl,
  },
  sectionHeader: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
  },
  sectionTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  list: {
    borderTopColor: TOKENS.colors.border,
    borderTopWidth: 1,
    marginTop: TOKENS.space.lg,
  },
  row: {
    alignItems: 'center',
    borderBottomColor: TOKENS.colors.border,
    borderBottomWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    justifyContent: 'space-between',
    minHeight: 68,
    paddingVertical: TOKENS.space.md,
  },
  rowMain: { flex: 1, minWidth: 0 },
  rowTitle: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 14,
    fontWeight: '700',
  },
  rowMeta: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
  pill: {
    backgroundColor: TOKENS.colors.primarySubtle,
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  pillText: {
    color: TOKENS.colors.primary,
    fontSize: 11,
    fontWeight: '700',
  },
});
