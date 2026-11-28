import { useQuery } from 'convex/react';
import { useLocalSearchParams } from 'expo-router';
import { Search, Users } from 'lucide-react-native';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { BusinessWebAnalytics } from '@/components/business-web/BusinessWebAnalytics';
import { BusinessWebCustomerDetails } from '@/components/business-web/BusinessWebCustomerDetails';
import { AppText as Text } from '@/components/ui/AppText';
import { api } from '@/convex/_generated/api';
import type { Id } from '@/convex/_generated/dataModel';
import { webCustomerStateLabel } from '@/lib/customers/webCustomerGuidance';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import {
  customerMatchesWebRouteFilter,
  parseWebCustomerRouteFilter,
  webCustomerRouteFilterLabel,
} from '@/lib/recommendations/webCustomerFilter';
import {
  flexDirection,
  alignItems as rtlAlign,
  rtlBaseText,
  selfStart,
} from '@/lib/rtl';

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
  const { filter } = useLocalSearchParams<{ filter?: string | string[] }>();
  const routeFilter = parseWebCustomerRouteFilter(filter);
  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<string | null | undefined>(
    undefined
  );
  useEffect(() => setStateFilter(undefined), [routeFilter]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    null
  );
  const customers = (data ?? []) as CustomerRow[];

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return customers.filter((customer) => {
      if (
        stateFilter === undefined
          ? !customerMatchesWebRouteFilter(customer, routeFilter)
          : stateFilter !== null && customer.customerState !== stateFilter
      ) {
        return false;
      }
      if (!q) {
        return true;
      }
      return [customer.name, customer.phone, customer.primaryProgramName]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(q));
    });
  }, [customers, routeFilter, search, stateFilter]);

  const segments = [
    { state: null, label: 'סה״כ לקוחות' },
    { state: 'ACTIVE', label: 'פעילים' },
    { state: 'NEW', label: 'חדשים' },
    { state: 'CLOSE_TO_REWARD', label: 'קרובים להטבה' },
    { state: 'NEEDS_NURTURE', label: 'לחיזוק הקשר' },
    { state: 'NEEDS_WINBACK', label: 'להחזרה' },
  ];
  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <Text style={styles.pageTitle}>לקוחות</Text>
        <Text style={styles.pageSubtitle}>
          לקוחות, פעילות והתקדמות במועדון.
        </Text>
      </View>

      <Text style={styles.customerMeta}>מצב הלקוחות · לחצו לסינון הרשימה</Text>
      <View style={styles.summaryRow}>
        {segments.map(({ state, label }) => {
          const selected =
            stateFilter === undefined
              ? state === null && routeFilter === null
              : stateFilter === state;
          const count =
            state === null
              ? customers.length
              : customers.filter((customer) => customer.customerState === state)
                  .length;
          return (
            <Pressable
              key={state ?? 'all'}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              accessibilityLabel={label}
              onPress={() => setStateFilter(state)}
              style={[
                styles.summaryCard,
                selected ? styles.summarySelected : null,
              ]}
            >
              <Text style={styles.summaryLabel}>{label}</Text>
              <Text style={styles.summaryValue}>
                {data === undefined ? '—' : count}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <BusinessWebAnalytics activeBusinessId={activeBusinessId} />
      <View style={styles.panel}>
        <View nativeID="business-customer-search" style={styles.searchWrap}>
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

        {stateFilter === undefined && routeFilter ? (
          <Text style={styles.filterLabel}>
            {webCustomerRouteFilterLabel(routeFilter)}
          </Text>
        ) : stateFilter ? (
          <Text style={styles.filterLabel}>
            {segments.find((segment) => segment.state === stateFilter)?.label}
          </Text>
        ) : null}

        {data === undefined ? (
          <Text style={styles.emptyText}>טוענים לקוחות…</Text>
        ) : filtered.length === 0 ? (
          <View style={styles.emptyState}>
            <Users color={TOKENS.colors.primary} size={24} />
            <Text style={styles.emptyTitle}>
              {customers.length === 0
                ? 'עדיין אין לקוחות במועדון'
                : 'לא נמצאו לקוחות'}
            </Text>
            <Text style={styles.emptyText}>
              {customers.length === 0
                ? 'לקוחות שיצטרפו לעסק יופיעו כאן.'
                : routeFilter || stateFilter
                  ? 'אין לקוחות בקבוצה הזו.'
                  : 'נסו חיפוש אחר.'}
            </Text>
          </View>
        ) : (
          <View style={styles.list}>
            {filtered.map((customer) => {
              const progress =
                customer.rewardThreshold > 0
                  ? Math.max(
                      0,
                      Math.min(
                        100,
                        Math.round(
                          (customer.loyaltyProgress /
                            customer.rewardThreshold) *
                            100
                        )
                      )
                    )
                  : 0;
              return (
                <Pressable
                  key={customer.customerId}
                  accessibilityRole="button"
                  accessibilityLabel={`פתיחת כרטיס לקוח: ${customer.name || 'לקוח'}, ${webCustomerStateLabel(customer.customerState)}`}
                  onPress={() => setSelectedCustomerId(customer.customerId)}
                  style={({ pressed }) => [
                    styles.customerRow,
                    pressed ? styles.customerRowPressed : null,
                  ]}
                >
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
                          {webCustomerStateLabel(customer.customerState)}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.customerMeta}>
                      {customer.primaryProgramName || 'מועדון לקוחות'} ·{' '}
                      {customer.visitCount} ביקורים ·{' '}
                      {lastVisitLabel(customer.lastVisitDaysAgo)}
                    </Text>
                    <Text style={styles.customerMeta}>
                      התקדמות להטבה: {customer.loyaltyProgress} מתוך{' '}
                      {customer.rewardThreshold} חותמות
                    </Text>
                    <View
                      accessibilityRole="progressbar"
                      accessibilityLabel="התקדמות להטבה"
                      accessibilityValue={{ min: 0, max: 100, now: progress }}
                      style={styles.progressTrack}
                    >
                      <View
                        style={[styles.progressFill, { width: `${progress}%` }]}
                      />
                    </View>
                    <Text style={styles.openCustomer}>
                      כרטיסיות ופעילות ←
                    </Text>
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}
      </View>
      {selectedCustomerId ? (
        <BusinessWebCustomerDetails
          key={`${String(activeBusinessId)}-${selectedCustomerId}`}
          businessId={activeBusinessId}
          customerUserId={selectedCustomerId as Id<'users'>}
          onClose={() => setSelectedCustomerId(null)}
        />
      ) : null}
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
    gap: TOKENS.space.sm,
  },
  summaryCard: {
    flexGrow: 1,
    flexBasis: 86,
    minWidth: 0,
    padding: TOKENS.space.sm,
    gap: 2,
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    borderColor: TOKENS.colors.border,
  },
  summarySelected: {
    borderColor: TOKENS.colors.primary,
    backgroundColor: TOKENS.colors.primarySubtle,
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
  filterLabel: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.primary,
    ...rtlBaseText,
  },
  searchWrap: {
    width: '100%',
    maxWidth: 480,
    alignSelf: selfStart,
    flexDirection: flexDirection.row,
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.md,
    minHeight: TOKENS.control.height,
    paddingHorizontal: TOKENS.space.md,
    backgroundColor: TOKENS.colors.elevatedSurface,
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    minHeight: TOKENS.control.height,
    fontSize: 16,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  list: { gap: 0, borderTopWidth: 1, borderTopColor: TOKENS.colors.border },
  customerRow: {
    flexDirection: flexDirection.row,
    alignItems: rtlAlign.end,
    gap: TOKENS.space.md,
    paddingVertical: TOKENS.space.lg,
    borderBottomWidth: 1,
    borderBottomColor: TOKENS.colors.border,
  },
  avatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: TOKENS.colors.primarySubtle,
  },
  customerRowPressed: { backgroundColor: TOKENS.colors.primarySubtle },
  openCustomer: {
    ...rtlBaseText,
    ...TOKENS.typography.secondaryBody,
    color: TOKENS.colors.primary,
    marginTop: TOKENS.space.xs,
  },
  avatarText: { fontSize: 12, fontWeight: '700', color: TOKENS.colors.primary },
  customerMain: { flex: 1, minWidth: 0, gap: 3 },
  customerTitleRow: {
    flexDirection: flexDirection.row,
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: TOKENS.space.sm,
  },
  customerName: {
    ...TOKENS.typography.cardTitle,
    flexShrink: 1,
    color: TOKENS.colors.textPrimary,
    textAlign: 'right',
    writingDirection: 'auto',
  },
  customerMeta: {
    ...TOKENS.typography.metadata,
    color: TOKENS.colors.textMuted,
    textAlign: 'right',
    writingDirection: 'rtl',
  },
  stateBadge: {
    borderRadius: TOKENS.radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: TOKENS.colors.primarySubtle,
  },
  stateText: { fontSize: 12, fontWeight: '600', color: TOKENS.colors.primary },
  progressTrack: {
    flexDirection: flexDirection.row,
    height: 4,
    borderRadius: TOKENS.radii.pill,
    overflow: 'hidden',
    backgroundColor: TOKENS.colors.border,
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: TOKENS.colors.primary,
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
