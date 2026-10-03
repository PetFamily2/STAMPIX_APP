import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { AlertTriangle, ChevronLeft, CircleDollarSign } from 'lucide-react-native';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { api } from '@/convex/_generated/api';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

function date(value: number | null) {
  return value
    ? new Intl.DateTimeFormat('he-IL', { dateStyle: 'medium' }).format(
        new Date(value)
      )
    : '—';
}

export function AdminBillingQueue() {
  const router = useRouter();
  const rows = useQuery(api.adminWeb.getBillingAttention);
  if (rows === undefined) return <FullScreenLoading />;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>OPERATIONS · BILLING</Text>
      <Text style={styles.title}>חיוב שדורש תשומת לב</Text>
      <Text style={styles.subtitle}>
        עסקים בתקופת כשל תשלום או עם פיוס SUMIT שלא הסתיים בהצלחה.
      </Text>

      <View style={styles.card}>
        {rows.length === 0 ? (
          <Text style={styles.empty}>אין כרגע פריטי חיוב שמצריכים בדיקה.</Text>
        ) : (
          rows.map((row) => (
            <Pressable
              key={String(row.businessId)}
              onPress={() =>
                router.push({
                  pathname: '/admin/business/[businessId]',
                  params: { businessId: String(row.businessId) },
                })
              }
              style={({ pressed }) => [
                styles.row,
                pressed ? styles.pressed : null,
              ]}
            >
              <View style={styles.icon}>
                {row.status === 'past_due' ? (
                  <AlertTriangle color={TOKENS.colors.warning} size={19} />
                ) : (
                  <CircleDollarSign color={TOKENS.colors.primary} size={19} />
                )}
              </View>
              <View style={styles.main}>
                <Text style={styles.name}>{row.businessName}</Text>
                <Text style={styles.meta}>
                  {row.plan ?? 'ללא מסלול'} · {row.provider ?? 'ללא ספק'} ·{' '}
                  {row.status ?? 'ללא סטטוס'}
                </Text>
                <Text style={styles.meta}>
                  סוף חסד: {date(row.gracePeriodEndAt)} · פיוס אחרון:{' '}
                  {date(row.lastReconciledAt)}
                </Text>
                {row.lastReconciliationCode ? (
                  <Text style={styles.warning}>{row.lastReconciliationCode}</Text>
                ) : null}
              </View>
              <ChevronLeft color={TOKENS.colors.textMuted} size={18} />
            </Pressable>
          ))
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { gap: 10, padding: 36 },
  eyebrow: { color: TOKENS.colors.primary, fontSize: 11, fontWeight: '800' },
  title: { ...rtlBaseText, color: TOKENS.colors.textPrimary, fontSize: 32, fontWeight: '900' },
  subtitle: { ...rtlBaseText, color: TOKENS.colors.textSecondary, fontSize: 15, lineHeight: 24 },
  card: { backgroundColor: TOKENS.colors.elevatedSurface, borderColor: TOKENS.colors.border, borderRadius: TOKENS.radii.lg, borderWidth: 1, marginTop: TOKENS.space.lg, paddingHorizontal: TOKENS.space.xl },
  row: { alignItems: 'center', borderBottomColor: TOKENS.colors.border, borderBottomWidth: 1, flexDirection: flexDirection.row, gap: TOKENS.space.md, minHeight: 86, paddingVertical: TOKENS.space.md },
  pressed: { opacity: 0.72 },
  icon: { alignItems: 'center', backgroundColor: TOKENS.colors.subtleSurface, borderRadius: TOKENS.radii.md, height: 40, justifyContent: 'center', width: 40 },
  main: { flex: 1, minWidth: 0 },
  name: { ...rtlBaseText, color: TOKENS.colors.textPrimary, fontSize: 15, fontWeight: '800' },
  meta: { ...rtlBaseText, color: TOKENS.colors.textMuted, fontSize: 12, marginTop: 4 },
  warning: { color: TOKENS.colors.warning, fontSize: 11, marginTop: 4 },
  empty: { ...rtlBaseText, color: TOKENS.colors.textMuted, paddingVertical: 32, textAlign: 'center' },
});
