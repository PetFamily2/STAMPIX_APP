import { useQuery } from 'convex/react';
import { useRouter } from 'expo-router';
import { ChevronLeft, Search } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { api } from '@/convex/_generated/api';
import { BUSINESS_WEB_TOKENS as TOKENS } from '@/lib/design/businessWebTokens';
import { flexDirection, rtlBaseText } from '@/lib/rtl';

export function AdminBusinessSearch() {
  const router = useRouter();
  const [term, setTerm] = useState('');
  const normalized = useMemo(() => term.trim(), [term]);
  const results = useQuery(
    api.adminWeb.searchBusinesses,
    normalized.length >= 2 ? { term: normalized } : 'skip'
  );

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Search color={TOKENS.colors.primary} size={20} />
        <View style={styles.headerCopy}>
          <Text style={styles.title}>חיפוש עסק</Text>
          <Text style={styles.description}>
            חיפוש לפי שם, דוא״ל בעלים, מזהה עסק, מזהה ציבורי או קוד הצטרפות.
          </Text>
        </View>
      </View>

      <TextInput
        accessibilityLabel="חיפוש עסק באדמין"
        autoCapitalize="none"
        autoCorrect={false}
        onChangeText={setTerm}
        placeholder="לדוגמה: שם העסק או owner@example.com"
        placeholderTextColor={TOKENS.colors.textMuted}
        style={styles.input}
        value={term}
      />

      {normalized.length < 2 ? (
        <Text style={styles.hint}>הקלידו לפחות שני תווים.</Text>
      ) : results === undefined ? (
        <View style={styles.loading}>
          <ActivityIndicator color={TOKENS.colors.primary} />
          <Text style={styles.hint}>מחפשים…</Text>
        </View>
      ) : results.length === 0 ? (
        <Text style={styles.hint}>לא נמצאו עסקים תואמים.</Text>
      ) : (
        <View style={styles.results}>
          {results.map((business) => (
            <Pressable
              accessibilityRole="button"
              key={String(business.businessId)}
              onPress={() =>
                router.push({
                  pathname: '/admin/business/[businessId]',
                  params: { businessId: String(business.businessId) },
                })
              }
              style={({ pressed }) => [
                styles.result,
                pressed ? styles.resultPressed : null,
              ]}
            >
              <View style={styles.resultMain}>
                <Text numberOfLines={1} style={styles.resultName}>
                  {business.name}
                </Text>
                <Text numberOfLines={1} style={styles.resultMeta}>
                  {business.ownerEmail ?? 'ללא דוא״ל בעלים'} ·{' '}
                  {business.plan ?? 'ללא מסלול'} · {business.status}
                </Text>
              </View>
              <ChevronLeft color={TOKENS.colors.textMuted} size={18} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: TOKENS.colors.elevatedSurface,
    borderColor: TOKENS.colors.border,
    borderRadius: TOKENS.radii.lg,
    borderWidth: 1,
    padding: TOKENS.space.xl,
  },
  header: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
  },
  headerCopy: { flex: 1 },
  title: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 13,
    lineHeight: 20,
    marginTop: 3,
  },
  input: {
    backgroundColor: TOKENS.colors.subtleSurface,
    borderColor: TOKENS.colors.borderStrong,
    borderRadius: TOKENS.radii.md,
    borderWidth: 1,
    color: TOKENS.colors.textPrimary,
    fontSize: 15,
    marginTop: TOKENS.space.lg,
    minHeight: 48,
    paddingHorizontal: TOKENS.space.lg,
    textAlign: 'right',
  },
  hint: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 13,
    marginTop: TOKENS.space.md,
  },
  loading: {
    alignItems: 'center',
    flexDirection: flexDirection.row,
    gap: TOKENS.space.sm,
  },
  results: {
    borderTopColor: TOKENS.colors.border,
    borderTopWidth: 1,
    marginTop: TOKENS.space.lg,
  },
  result: {
    alignItems: 'center',
    borderBottomColor: TOKENS.colors.border,
    borderBottomWidth: 1,
    flexDirection: flexDirection.row,
    gap: TOKENS.space.md,
    minHeight: 66,
    paddingVertical: TOKENS.space.md,
  },
  resultPressed: { opacity: 0.72 },
  resultMain: { flex: 1, minWidth: 0 },
  resultName: {
    ...rtlBaseText,
    color: TOKENS.colors.textPrimary,
    fontSize: 14,
    fontWeight: '800',
  },
  resultMeta: {
    ...rtlBaseText,
    color: TOKENS.colors.textMuted,
    fontSize: 12,
    marginTop: 4,
  },
});
