import { useQuery } from 'convex/react';
import { Search, Users } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';

import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

type CustomerRow = {
  customerId: string;
  name: string;
  phone?: string | null;
  customerState?: string | null;
  lastVisitDaysAgo: number;
  visitCount: number;
  primaryProgramName: string;
  rewardThreshold: number;
  loyaltyProgress: number;
};

const STATE_LABELS: Record<string, string> = {
  NEW: 'חדש',
  ACTIVE: 'פעיל',
  NEEDS_NURTURE: 'דורש חימום',
  NEEDS_WINBACK: 'דורש חזרה',
  CLOSE_TO_REWARD: 'קרוב להטבה',
};

function lastVisitLabel(days: number) {
  if (days <= 0) return 'היום';
  if (days === 1) return 'אתמול';
  return `לפני ${days} ימים`;
}

export function BusinessWebCustomers({
  activeBusinessId,
}: {
  activeBusinessId: Id<'businesses'>;
}) {
  const data = useQuery(api.customerCards.listBusinessCustomersBase, {
    businessId: activeBusinessId,
  });
  const [search, setSearch] = useState('');
  const customers = (data ?? []) as CustomerRow[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((customer) =>
      [customer.name, customer.phone, customer.primaryProgramName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q))
    );
  }, [customers, search]);

  const activeCount = customers.filter(
    (customer) => customer.customerState === 'ACTIVE'
  ).length;
  const attentionCount = customers.filter(
    (customer) =>
      customer.customerState === 'NEEDS_NURTURE' ||
      customer.customerState === 'NEEDS_WINBACK'
  ).length;

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>לקוחות</Text>
        <Text style={styles.pageSubtitle}>
          לקוחות, פעילות והתקדמות במועדון.
        </Text>
      </View>

      <View style={styles.summaryRow}>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>סה״כ לקוחות</Text>
          <Text style={styles.summaryValue}>{customers.length}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>לקוחות פעילים</Text>
          <Text style={styles.summaryValue}>{activeCount}</Text>
        </View>
        <View style={styles.summaryCard}>
          <Text style={styles.summaryLabel}>דורשים תשומת לב</Text>
          <Text style={styles.summaryValue}>{attentionCount}</Text>
        </View>
      </View>

      <View style={styles.panel}>
        <View style={styles.searchWrap}>
          <Search color={TOKENS.colors.textMuted} size={18} />
          <TextInput
            accessibilityLabel="חיפוש לקוחות"
            onChangeText={setSearch}
            placeholder="חיפוש לפי שם, טלפון או מועדון"
            placeholderTextColor={TOKENS.colors.textMuted}
            style={styles.searchInput}
            value={search}
          />
        </View>

        {data === undefined ? (
          <Text style={styles.emptyText}>טוענים לקוחות…</Text>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Users color={TOKENS.colors.primary} size={24} />
            <Text style={styles.emptyTitle}>
              {customers.length === 0 ? 'עדיין אין לקוחות במועדון' : 'לא נמצאו לקוחות'}
            </Text>
            <Text style={styles.emptyText}>
              {customers.length === 0
                ? 'לקוחות שיצטרפו לעסק יופיעו כאן.'
                : 'נסו חיפוש אחר.'}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((customer) => {
              const progress =
                customer.rewardThreshold > 0
                  ? Math.min(
                      100,
                      Math.round(
                        (customer.loyaltyProgress / customer.rewardThreshold) * 100
                      )
                    )
                  : 0;
              return (
                <View key={customer.customerId} style={styles.customerRow}>
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>
                      {(customer.name || 'ל').charAt(0)}
                    </Text>
                  </View>
                  <View style={styles.customerMain}>
                    <View style={styles.customerTitleRow}>
                      <Text numberOfLines={1} style={styles.customerName}>
                        {customer.name || 'לקוח'}
                      </Text>
                      <View style={styles.stateBadge}>
                        <Text style={styles.stateText}>
                          {STATE_LABELS[customer.customerState ?? ''] ?? 'פעיל'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.customerMeta}>
                      {customer.primaryProgramName || 'מועדון לקוחות'} · {customer.visitCount} ביקורים · {lastVisitLabel(customer.lastVisitDaysAgo)}
                    </Text>
                    <View style={styles.progressTrack}>
                      <View style={[styles.progressFill, { width: `${progress}%` }]} />
                    </View>
                  </View>
                </View>
              );
            })}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { width: '100%', maxWidth: 980, alignSelf: 'center', gap: 16 },
  header: { gap: 4 },
  pageTitle: { ...TOKENS.typography.pageTitle, color: TOKENS.colors.textPrimary, textAlign: 'right', writingDirection: 'rtl' },
  pageSubtitle: { ...TOKENS.typography.body, color: TOKENS.colors.textMuted, textAlign: 'right', writingDirection: 'rtl' },
  summaryRow: { flexDirection: flexDirection.row, flexWrap: 'wrap', gap: 0, borderTopWidth: 1, borderBottomWidth: 1, borderColor: TOKENS.colors.border, paddingVertical: 10 },
  summaryCard: { flexGrow: 1, flexBasis: 150, minWidth: 150, paddingHorizontal: 14, paddingVertical: 2, gap: 1 },
  summaryLabel: { ...TOKENS.typography.metadata, color: TOKENS.colors.textMuted, ...rtlBaseText },
  summaryValue: { fontSize: 21, lineHeight: 27, fontWeight: '600', color: TOKENS.colors.textPrimary, ...rtlBaseText },
  panel: { gap: 10 },
  searchWrap: { width: '100%', maxWidth: 360, alignSelf: 'flex-start', flexDirection: flexDirection.row, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: TOKENS.colors.borderStrong, borderRadius: TOKENS.radii.sm, minHeight: 36, paddingHorizontal: 10 },
  searchInput: { flex: 1, fontSize: 13, color: TOKENS.colors.textPrimary, textAlign: 'right', writingDirection: 'rtl', outlineStyle: 'none' } as any,
  list: { gap: 0, borderTopWidth: 1, borderTopColor: TOKENS.colors.border },
  customerRow: { flexDirection: flexDirection.row, alignItems: 'center', gap: 10, paddingVertical: 9, borderBottomWidth: 1, borderBottomColor: TOKENS.colors.border },
  avatar: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: TOKENS.colors.primarySubtle },
  avatarText: { fontSize: 12, fontWeight: '700', color: TOKENS.colors.primary },
  customerMain: { flex: 1, minWidth: 0, gap: 3 },
  customerTitleRow: { flexDirection: flexDirection.row, justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  customerName: { ...TOKENS.typography.cardTitle, color: TOKENS.colors.textPrimary, textAlign: 'right' },
  customerMeta: { ...TOKENS.typography.metadata, color: TOKENS.colors.textMuted, textAlign: 'right', writingDirection: 'rtl' },
  stateBadge: { borderRadius: TOKENS.radii.pill, paddingHorizontal: 8, paddingVertical: 2, backgroundColor: TOKENS.colors.primarySubtle },
  stateText: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.primary },
  progressTrack: { height: 3, borderRadius: 999, overflow: 'hidden', backgroundColor: TOKENS.colors.border },
  progressFill: { height: '100%', borderRadius: 999, backgroundColor: TOKENS.colors.primary },
  emptyState: { alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 28 },
  emptyTitle: { ...TOKENS.typography.cardTitle, color: TOKENS.colors.textPrimary, textAlign: 'center' },
  emptyText: { ...TOKENS.typography.secondaryBody, color: TOKENS.colors.textMuted, textAlign: 'center' },
});
