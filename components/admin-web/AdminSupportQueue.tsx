import { useQuery } from 'convex/react';
import { LifeBuoy } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { api } from '@/convex/_generated/api';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

function formatDate(value: number | null | undefined) {
  return value
    ? new Intl.DateTimeFormat('he-IL', {
        dateStyle: 'medium',
        timeStyle: 'short',
      }).format(new Date(value))
    : '—';
}

export function AdminSupportQueue() {
  const queue = useQuery(api.adminWeb.getSupportQueue);
  if (queue === undefined) return <FullScreenLoading />;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>OPERATIONS · SUPPORT</Text>
      <Text style={styles.title}>בקשות תמיכה</Text>
      <Text style={styles.subtitle}>
        תצוגה תפעולית לקריאה בלבד. טיפול וסגירה יתווספו רק דרך פעולות מתועדות.
      </Text>

      <View style={styles.card}>
        <View style={styles.header}>
          <LifeBuoy color={TOKENS.colors.primary} size={20} />
          <Text style={styles.cardTitle}>פתוחות ({queue.open.length})</Text>
        </View>
        {queue.open.length === 0 ? (
          <Text style={styles.empty}>אין בקשות פתוחות.</Text>
        ) : (
          queue.open.map((item) => (
            <View key={String(item.requestId)} style={styles.row}>
              <Text style={styles.name}>{item.name}</Text>
              <Text selectable={true} style={styles.meta}>
                {item.email ?? 'ללא דוא״ל'} · {item.phone ?? 'ללא טלפון'} ·{' '}
                {formatDate(item.createdAt)}
              </Text>
              <Text selectable={true} style={styles.message}>
                {item.message}
              </Text>
            </View>
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
  card: { backgroundColor: TOKENS.colors.elevatedSurface, borderColor: TOKENS.colors.border, borderRadius: TOKENS.radii.lg, borderWidth: 1, marginTop: TOKENS.space.lg, padding: TOKENS.space.xl },
  header: { alignItems: 'center', flexDirection: flexDirection.row, gap: TOKENS.space.sm },
  cardTitle: { ...rtlBaseText, color: TOKENS.colors.textPrimary, fontSize: 18, fontWeight: '800' },
  row: { borderTopColor: TOKENS.colors.border, borderTopWidth: 1, paddingVertical: TOKENS.space.lg },
  name: { ...rtlBaseText, color: TOKENS.colors.textPrimary, fontSize: 14, fontWeight: '800' },
  meta: { ...rtlBaseText, color: TOKENS.colors.textMuted, fontSize: 12, marginTop: 4 },
  message: { ...rtlBaseText, color: TOKENS.colors.textSecondary, fontSize: 13, lineHeight: 21, marginTop: 8 },
  empty: { ...rtlBaseText, color: TOKENS.colors.textMuted, paddingVertical: 24, textAlign: 'center' },
});
