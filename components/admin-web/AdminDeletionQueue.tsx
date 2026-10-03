import { useQuery } from 'convex/react';
import { Trash2 } from 'lucide-react-native';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { FullScreenLoading } from '@/components/FullScreenLoading';
import { api } from '@/convex/_generated/api';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { rtlBaseText } from '@/lib/rtl';

function formatDate(value: number) {
  return new Intl.DateTimeFormat('he-IL', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function AdminDeletionQueue() {
  const rows = useQuery(api.adminWeb.getDeletionQueue);
  if (rows === undefined) return <FullScreenLoading />;

  return (
    <ScrollView contentContainerStyle={styles.page}>
      <Text style={styles.eyebrow}>OPERATIONS · DELETION</Text>
      <Text style={styles.title}>בקשות מחיקת חשבון</Text>
      <Text style={styles.subtitle}>
        בקשות פתוחות ובבדיקה. ביצוע המחיקה נשאר בתהליך הייעודי והמבוקר.
      </Text>

      <View style={styles.card}>
        <View style={styles.header}>
          <Trash2 color={TOKENS.colors.primary} size={20} />
          <Text style={styles.cardTitle}>תור טיפול ({rows.length})</Text>
        </View>
        {rows.length === 0 ? (
          <Text style={styles.empty}>אין בקשות פתוחות.</Text>
        ) : (
          rows.map((row) => (
            <View key={String(row.requestId)} style={styles.row}>
              <Text selectable={true} style={styles.email}>{row.email}</Text>
              <Text selectable={true} style={styles.meta}>
                {row.requestReference} · {row.status} · {formatDate(row.createdAt)}
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
  header: { alignItems: 'center', flexDirection: 'row-reverse', gap: TOKENS.space.sm },
  cardTitle: { ...rtlBaseText, color: TOKENS.colors.textPrimary, fontSize: 18, fontWeight: '800' },
  row: { borderTopColor: TOKENS.colors.border, borderTopWidth: 1, paddingVertical: TOKENS.space.lg },
  email: { color: TOKENS.colors.textPrimary, fontSize: 14, fontWeight: '800', textAlign: 'left', writingDirection: 'ltr' },
  meta: { ...rtlBaseText, color: TOKENS.colors.textMuted, fontSize: 12, marginTop: 5 },
  empty: { ...rtlBaseText, color: TOKENS.colors.textMuted, paddingVertical: 24, textAlign: 'center' },
});
